/**
 * api/legal-document-upload.js
 *
 * THREE-LAYER ATTENTION MECHANISM - Cost-efficient NZ property document analysis
 *
 * Layer 1 (FREE): NZ rule engine - regex scan for known risk patterns. Zero AI cost.
 * Layer 2 (CHEAP): Only paragraphs flagged by Layer 1 are selected for AI context.
 * Layer 3 (PAID): GPT-4o-mini analyses ONLY flagged paragraphs. ~$0.02-0.05 USD per report.
 *
 * FREE PREVIEW: Returns risk count + 3 sample findings.
 * After payment: webhook retrieves file from Supabase Storage and runs full analysis.
 */

const multiparty = require('multiparty');
const fs         = require('fs');
const path       = require('path');
const { v4: uuidv4 } = require('uuid');
const pdfParse   = require('pdf-parse');
const mammoth    = require('mammoth');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// LAYER 1: NZ Property Risk Rule Engine (Zero AI Cost)
// ============================================================
const NZ_RISK_RULES = {
  spa: [
    { pattern: /as\s+is\s+where\s+is/gi,           risk: 'HIGH',   category: 'Contract Terms',  message: '"As is where is" clause — seller disclaims all responsibility for property condition.' },
    { pattern: /cash\s+unconditional/gi,              risk: 'HIGH',   category: 'Contract Terms',  message: 'Cash unconditional offer — no finance or due diligence protection for buyer.' },
    { pattern: /no\s+due\s+diligence/gi,             risk: 'HIGH',   category: 'Contract Terms',  message: 'Due diligence waived — cannot withdraw if issues found after signing.' },
    { pattern: /leasehold/gi,                          risk: 'HIGH',   category: 'Title',           message: 'Leasehold title — ground rent reviews can significantly increase future holding costs.' },
    { pattern: /meth(amphetamine)?\s+(contamin|test|residue)/gi, risk: 'HIGH', category: 'Contamination', message: 'Methamphetamine contamination reference — obtain independent meth test before proceeding.' },
    { pattern: /body\s+corporate/gi,                  risk: 'MEDIUM', category: 'Body Corporate',  message: 'Body corporate property — obtain levy statements and meeting minutes before going unconditional.' },
    { pattern: /unit\s+title/gi,                      risk: 'MEDIUM', category: 'Title',           message: 'Unit title — pre-contract disclosure statement required under Unit Titles Act 2010.' },
    { pattern: /cross[\s-]?lease/gi,                  risk: 'MEDIUM', category: 'Title',           message: 'Cross-lease title — verify flats plan matches current structures; illegal alterations are common.' },
    { pattern: /settlement\s+period[^.]{0,50}(\d+)\s*working\s+days/gi, risk: 'MEDIUM', category: 'Settlement', message: 'Settlement period detected — confirm all conditions can be met within the timeframe.' },
    { pattern: /penalty\s+(interest|clause)/gi,       risk: 'MEDIUM', category: 'Financial',       message: 'Penalty clause — late settlement may incur significant additional charges.' },
    { pattern: /subject\s+to\s+finance/gi,           risk: 'LOW',    category: 'Conditions',      message: 'Finance condition — standard protection, ensure bank approval timeline is realistic.' },
    { pattern: /chattels?/gi,                          risk: 'LOW',    category: 'Chattels',        message: 'Chattels referenced — verify all listed items are present and in working order at settlement.' },
    { pattern: /vacant\s+possession/gi,               risk: 'LOW',    category: 'Possession',      message: 'Vacant possession required — confirm tenancy end date if property is currently tenanted.' },
    { pattern: /purchaser\s+must\s+not\s+assign/gi, risk: 'LOW',    category: 'Contract Terms',  message: 'Assignment restriction — cannot on-sell the contract to another buyer.' },
  ],
  lim: [
    { pattern: /outstanding\s+(building\s+)?consent/gi, risk: 'HIGH', category: 'Building Consent', message: 'Outstanding building consent — structures may be illegal. Demand code compliance certificate.' },
    { pattern: /no\s+code\s+compliance/gi,           risk: 'HIGH',   category: 'Building Consent', message: 'No code compliance certificate — council has not signed off on completed building work.' },
    { pattern: /requisition/gi,                        risk: 'HIGH',   category: 'Council Notice',  message: 'Council requisition on property — legal obligation to remediate, cost passes to new owner.' },
    { pattern: /notice\s+to\s+(fix|rectify|remedy)/gi, risk: 'HIGH', category: 'Council Notice',  message: 'Notice to fix issued by council — legal repair obligation that transfers to purchaser.' },
    { pattern: /flood(ing|plain|prone)?/gi,            risk: 'HIGH',   category: 'Environmental',   message: 'Flood risk noted in LIM — check council flood maps and obtain insurance quotes before committing.' },
    { pattern: /liquefaction/gi,                       risk: 'HIGH',   category: 'Environmental',   message: 'Liquefaction risk — common in Christchurch, Wellington coastal areas. Verify EQC claims history.' },
    { pattern: /contaminated\s+(land|site|soil)/gi,   risk: 'HIGH',   category: 'Environmental',   message: 'Land contamination recorded on LIM — remediation costs can be very substantial.' },
    { pattern: /asbestos/gi,                           risk: 'HIGH',   category: 'Hazardous Materials', message: 'Asbestos referenced — if pre-1990 building, obtain asbestos survey before purchase.' },
    { pattern: /erosion\s+risk/gi,                    risk: 'HIGH',   category: 'Environmental',   message: 'Erosion risk — may affect future insurability and long-term property value.' },
    { pattern: /heritage\s+(order|designation|listing)/gi, risk: 'MEDIUM', category: 'Heritage',  message: 'Heritage designation — limits alterations significantly, may affect resale value.' },
    { pattern: /designation/gi,                        risk: 'MEDIUM', category: 'Planning',        message: 'Land designation found — local or central government may have acquisition rights.' },
    { pattern: /onsite\s+(wastewater|septic)/gi,      risk: 'MEDIUM', category: 'Services',        message: 'Onsite wastewater system — verify compliance with regional council rules; ongoing maintenance costs.' },
    { pattern: /resource\s+consent/gi,                risk: 'LOW',    category: 'Planning',        message: 'Resource consent on record — check ongoing consent conditions and obligations.' },
  ],
  building: [
    { pattern: /moisture\s+(meter|reading|level|damage|intrusion)/gi, risk: 'HIGH', category: 'Moisture', message: 'Moisture issues detected — may indicate weathertightness failure. Get specialist report urgently.' },
    { pattern: /weathertight(ness)?(\s+risk|\s+failure|\s+issue)?/gi, risk: 'HIGH', category: 'Weathertightness', message: 'Weathertightness risk flagged — NZ leaky building remediation can exceed $200,000 NZD.' },
    { pattern: /monolithic\s+cladding/gi,             risk: 'HIGH',   category: 'Weathertightness', message: 'Monolithic cladding system — high weathertightness risk, common in 1990s-2000s NZ builds.' },
    { pattern: /eifs|exterior\s+insulation/gi,        risk: 'HIGH',   category: 'Weathertightness', message: 'EIFS cladding — closely associated with NZ leaky building crisis. Specialist assessment required.' },
    { pattern: /structural\s+(concern|issue|damage|defect|movement)/gi, risk: 'HIGH', category: 'Structure', message: 'Structural concerns — engage a structural engineer before going unconditional.' },
    { pattern: /foundation\s+(crack|subsidence|settlement|movement)/gi, risk: 'HIGH', category: 'Structure', message: 'Foundation issues — can be very costly to remediate; obtain engineering assessment.' },
    { pattern: /urgent\s+(repair|attention|remediation)/gi, risk: 'HIGH', category: 'Urgent Works', message: 'Urgent repairs flagged — use these to negotiate purchase price reduction.' },
    { pattern: /earthquake\s+(damage|prone|risk)/gi,  risk: 'HIGH',   category: 'Earthquake',      message: 'Earthquake damage or risk — check council earthquake-prone building register and EQC claims.' },
    { pattern: /\$[\d,]+\s*(to|-)\s*\$[\d,]+/g, risk: 'MEDIUM', category: 'Cost Estimates',  message: 'Repair cost estimates found — total all figures for price negotiation leverage.' },
    { pattern: /electrical\s+(fault|issue|concern|non.compliant)/gi, risk: 'MEDIUM', category: 'Electrical', message: 'Electrical issues — non-compliant wiring is a safety concern and may affect insurance.' },
    { pattern: /plumbing\s+(leak|issue|concern|age)/gi, risk: 'MEDIUM', category: 'Plumbing',      message: 'Plumbing concerns — aged or leaking pipes can be expensive to replace throughout a house.' },
    { pattern: /re.roofing\s+recommended|roof\s+(end|near)\s+of\s+life/gi, risk: 'MEDIUM', category: 'Roofing', message: 'Roof replacement recommended — budget $15,000-$45,000 NZD depending on size and material.' },
    { pattern: /uninspected\s+area/gi,                risk: 'MEDIUM', category: 'Inspection Limitation', message: 'Areas not inspected — hidden risks remain. Consider invasive investigation before committing.' },
  ]
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function runRuleEngine(text, docType) {
  const rules = NZ_RISK_RULES[docType]
    ? NZ_RISK_RULES[docType]
    : [...NZ_RISK_RULES.spa, ...NZ_RISK_RULES.lim, ...NZ_RISK_RULES.building];
  const findings = [];
  for (const rule of rules) {
    const matches = text.match(rule.pattern);
    if (matches) {
      const idx   = text.search(new RegExp(rule.pattern.source, 'i'));
      const start = Math.max(0, idx - 100);
      const end   = Math.min(text.length, idx + 150);
      const context = text.substring(start, end).replace(/\s+/g, ' ').trim();
      findings.push({ risk: rule.risk, category: rule.category, message: rule.message, context, matchCount: matches.length });
    }
  }
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return findings.sort((a, b) => order[a.risk] - order[b.risk]);
}

function splitIntoParagraphs(text) {
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 50 && p.length <= 1000)
    .map(p => p.length > 500 ? p.substring(0, 500) : p);
}

function detectDocType(text, declared) {
  if (declared && declared !== 'other') return declared;
  const t = text.toLowerCase();
  if (t.includes('land information memorandum') || t.includes(' lim ')) return 'lim';
  if (t.includes('building inspection') || t.includes('building report'))  return 'building';
  if (t.includes('sale and purchase') || t.includes('agreement for sale')) return 'spa';
  return 'other';
}

// ============================================================
// MAIN HANDLER
// ============================================================
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sessionId = uuidv4();
    const uploadDir = `/tmp/legal-docs/${sessionId}`;
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const form = new multiparty.Form({ uploadDir, maxFilesSize: 50 * 1024 * 1024, maxFields: 10 });

    const result = await new Promise((resolve, reject) => {
      form.parse(req, async (err, fields, files) => {
        if (err) { reject(err); return; }
        try {
          const uploadedFiles  = files.documents || files.file || [];
          const declaredType   = fields.documentType ? fields.documentType[0] : 'other';
          const isPaidRequest  = fields.paid ? fields.paid[0] === 'true' : false;

          if (!uploadedFiles.length) return resolve({ error: 'No files uploaded' });

          const allFindings    = [];
          const processedFiles = [];
          const storedFileKeys = []; // keys in Supabase Storage

          for (const file of uploadedFiles) {
            let text = '';
            const ext = path.extname(file.originalFilename || '').toLowerCase();

            // Extract text
            if (ext === '.pdf') {
              const buf  = fs.readFileSync(file.path);
              const parsed = await pdfParse(buf);
              text = parsed.text;
            } else if (ext === '.docx' || ext === '.doc') {
              const buf  = fs.readFileSync(file.path);
              const res2 = await mammoth.extractRawText({ buffer: buf });
              text = res2.value;
            } else {
              text = fs.readFileSync(file.path, 'utf8');
            }

            // Upload raw file to Supabase Storage (for paid analysis later)
            const fileKey = `${sessionId}/${file.originalFilename}`;
            const fileBuffer = fs.readFileSync(file.path);
            const mimeType = ext === '.pdf' ? 'application/pdf'
              : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : 'application/octet-stream';

            const { error: uploadError } = await supabase.storage
              .from('documents')
              .upload(fileKey, fileBuffer, { contentType: mimeType, upsert: true });

            if (uploadError) {
              console.error('Supabase Storage upload error:', uploadError);
            } else {
              storedFileKeys.push({ key: fileKey, name: file.originalFilename, ext });
            }

            try { fs.unlinkSync(file.path); } catch(e) {}

            const docType  = detectDocType(text, declaredType);
            const wordCount = text.split(/\s+/).length;

            // Layer 1: Rule Engine (FREE, always runs)
            const ruleFindings = runRuleEngine(text, docType);
            processedFiles.push({ fileName: file.originalFilename, docType, wordCount, ruleFindings, paragraphs: splitIntoParagraphs(text) });
            allFindings.push(...ruleFindings);
          }

          const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          allFindings.sort((a, b) => order[a.risk] - order[b.risk]);

          const highCount = allFindings.filter(f => f.risk === 'HIGH').length;
          const medCount  = allFindings.filter(f => f.risk === 'MEDIUM').length;
          const lowCount  = allFindings.filter(f => f.risk === 'LOW').length;

          // FREE PREVIEW — return rule engine results + store file keys in session
          return resolve({
            sessionId,
            preview: true,
            storedFileKeys, // passed back so frontend can include in payment metadata
            summary: { totalRisks: allFindings.length, highRisks: highCount, mediumRisks: medCount, lowRisks: lowCount, documentsAnalysed: processedFiles.length },
            previewFindings: allFindings.slice(0, 3).map(f => ({ risk: f.risk, category: f.category, message: f.message })),
            hiddenCount: Math.max(0, allFindings.length - 3),
          });

        } catch(e) { reject(e); }
      });
    });

    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json(result);

  } catch (error) {
    console.error('Document processing error:', error);
    return res.status(500).json({ error: 'Processing failed: ' + error.message });
  }
}
