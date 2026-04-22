const multiparty = require('multiparty');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sessionId = uuidv4();
    const uploadDir = `/tmp/legal-docs/${sessionId}`;
    
    // Create upload directory
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Parse multipart form data
    const form = new multiparty.Form({
      uploadDir: uploadDir,
      maxFilesSize: 100 * 1024 * 1024, // 100MB total for legal documents
      maxFields: 20,
    });

    const result = await new Promise((resolve, reject) => {
      form.parse(req, async (err, fields, files) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const processedFiles = [];
          const documentTypes = fields.documentTypes ? JSON.parse(fields.documentTypes[0]) : [];
          
          for (const key of Object.keys(files)) {
            const fileArray = files[key];
            
            for (const file of fileArray) {
              // Validate file type for legal documents
              const allowedTypes = [
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword',
                'text/plain'
              ];
              
              if (!allowedTypes.includes(file.headers['content-type'])) {
                reject(new Error(`Invalid file type: ${file.headers['content-type']}. Only PDF and Word documents are allowed for legal analysis.`));
                return;
              }

              // Validate file size (25MB per file for legal documents)
              if (file.size > 25 * 1024 * 1024) {
                reject(new Error(`File too large: ${file.originalFilename}. Maximum size is 25MB for legal documents.`));
                return;
              }

              // Extract text content for analysis
              let extractedText = '';
              let pageCount = 0;
              
              try {
                if (file.headers['content-type'] === 'application/pdf') {
                  const pdfBuffer = fs.readFileSync(file.path);
                  const pdfData = await pdfParse(pdfBuffer);
                  extractedText = pdfData.text;
                  pageCount = pdfData.numpages;
                } else if (file.headers['content-type'].includes('wordprocessingml')) {
                  const docxBuffer = fs.readFileSync(file.path);
                  const result = await mammoth.extractRawText({ buffer: docxBuffer });
                  extractedText = result.value;
                  pageCount = Math.ceil(extractedText.length / 2500); // Estimate pages
                }
              } catch (textError) {
                console.warn(`Could not extract text from ${file.originalFilename}:`, textError);
                extractedText = 'Text extraction failed - manual review required';
              }

              // Determine document type based on content analysis
              const detectedType = detectDocumentType(extractedText, file.originalFilename);
              
              processedFiles.push({
                id: uuidv4(),
                originalName: file.originalFilename,
                filename: path.basename(file.path),
                size: file.size,
                type: file.headers['content-type'],
                path: file.path,
                sessionId: sessionId,
                documentType: detectedType,
                pageCount: pageCount,
                textLength: extractedText.length,
                hasText: extractedText.length > 100, // Threshold for meaningful content
                preview: extractedText.substring(0, 500) + '...', // First 500 chars for preview
                analysisMetadata: {
                  containsLegalTerms: containsLegalTerms(extractedText),
                  documentCategory: categorizeDocument(extractedText),
                  riskKeywords: findRiskKeywords(extractedText),
                  urgencyIndicators: findUrgencyIndicators(extractedText)
                }
              });
            }
          }

          // Store document upload record for legal processing
          const uploadRecord = {
            sessionId,
            files: processedFiles,
            documentTypes: documentTypes,
            uploadedAt: new Date().toISOString(),
            status: 'uploaded',
            service: 'legal_consultation',
            totalFiles: processedFiles.length,
            totalPages: processedFiles.reduce((sum, f) => sum + f.pageCount, 0),
            requiresUrgentReview: processedFiles.some(f => f.analysisMetadata.urgencyIndicators.length > 0)
          };

          console.log('Legal document upload record:', uploadRecord);

          // Schedule legal analysis
          await scheduleLegalAnalysis(sessionId, processedFiles, documentTypes);

          resolve({
            sessionId,
            files: processedFiles.map(f => ({
              id: f.id,
              originalName: f.originalName,
              size: f.size,
              type: f.type,
              documentType: f.documentType,
              pageCount: f.pageCount,
              hasText: f.hasText,
              preview: f.preview.substring(0, 200) + '...', // Shorter preview for response
              analysisMetadata: f.analysisMetadata
            })),
            summary: {
              totalFiles: processedFiles.length,
              totalPages: uploadRecord.totalPages,
              documentTypes: [...new Set(processedFiles.map(f => f.documentType))],
              requiresUrgentReview: uploadRecord.requiresUrgentReview
            }
          });
        } catch (processingError) {
          reject(processingError);
        }
      });
    });

    res.status(200).json({
      message: 'Legal documents uploaded successfully',
      ...result
    });

  } catch (error) {
    console.error('Legal document upload error:', error);
    res.status(500).json({ error: error.message });
  }
}

function detectDocumentType(text, filename) {
  const lower = text.toLowerCase();
  const filenameKey = filename.toLowerCase();
  
  // Purchase Agreement detection
  if (lower.includes('sale and purchase') || 
      lower.includes('purchase agreement') ||
      lower.includes('vendor') && lower.includes('purchaser') ||
      filenameKey.includes('purchase') || filenameKey.includes('sale')) {
    return 'purchase_agreement';
  }
  
  // LIM Report detection
  if (lower.includes('land information memorandum') ||
      lower.includes('lim report') ||
      filenameKey.includes('lim')) {
    return 'lim_report';
  }
  
  // Building Inspection detection
  if (lower.includes('building inspection') ||
      lower.includes('building report') ||
      lower.includes('structural report') ||
      filenameKey.includes('inspection') || filenameKey.includes('building')) {
    return 'building_inspection';
  }
  
  // Title document detection
  if (lower.includes('certificate of title') ||
      lower.includes('land title') ||
      filenameKey.includes('title')) {
    return 'title_document';
  }
  
  return 'other';
}

function containsLegalTerms(text) {
  const legalTerms = [
    'settlement', 'vendor', 'purchaser', 'covenant', 'easement', 'encumbrance',
    'chattels', 'fixtures', 'deposit', 'liquidated damages', 'condition precedent',
    'title', 'zoning', 'council', 'consent', 'warranty', 'disclosure'
  ];
  
  const lower = text.toLowerCase();
  return legalTerms.filter(term => lower.includes(term));
}

function categorizeDocument(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes('contract') || lower.includes('agreement')) {
    return 'contract';
  } else if (lower.includes('report') || lower.includes('inspection')) {
    return 'report';
  } else if (lower.includes('title') || lower.includes('certificate')) {
    return 'certificate';
  }
  
  return 'document';
}

function findRiskKeywords(text) {
  const riskKeywords = [
    'penalty', 'default', 'breach', 'dispute', 'litigation', 'encumbrance',
    'restriction', 'easement', 'covenant', 'outstanding', 'unpaid', 'owing',
    'defect', 'damage', 'repair', 'maintenance', 'compliance', 'violation'
  ];
  
  const lower = text.toLowerCase();
  return riskKeywords.filter(keyword => lower.includes(keyword));
}

function findUrgencyIndicators(text) {
  const urgencyKeywords = [
    'urgent', 'immediate', 'deadline', 'expire', 'time limit', 'settlement date',
    'conditional', 'subject to', 'within', 'days', 'working days'
  ];
  
  const lower = text.toLowerCase();
  return urgencyKeywords.filter(keyword => lower.includes(keyword));
}

async function scheduleLegalAnalysis(sessionId, files, documentTypes) {
  console.log(`Scheduling legal analysis for session: ${sessionId}`);
  console.log(`Analyzing ${files.length} legal documents`);
  console.log(`Document types: ${documentTypes.join(', ')}`);
  
  // TODO: Integrate with legal AI analysis service
  // This is where you would:
  // 1. Process each legal document with AI/ML models
  // 2. Identify legal risks and issues
  // 3. Generate legal recommendations
  // 4. Create professional legal analysis report
  // 5. Store results for retrieval
  
  // Simulated legal analysis
  setTimeout(() => {
    console.log(`Legal analysis completed for session: ${sessionId}`);
    // Notify legal team or generate report
  }, 10000); // Simulate longer processing time for legal documents
}

// Export config for Next.js API routes
export const config = {
  api: {
    bodyParser: false, // Disable default body parser for multipart
  },
};
