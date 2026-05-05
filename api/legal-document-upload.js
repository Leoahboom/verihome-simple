/**
 * api/legal-document-upload.js
 *
 * FOUR-LAYER ANALYSIS ARCHITECTURE
 *
 * Layer 1 (FREE): NZ rule engine — regex scan for known risk patterns. Zero AI cost.
 * Layer 2 (FREE): GPT-4o-mini classifier — identifies doc type + risk categories present.
 *                 Cost: ~$0.0002 per upload. Used to VALIDATE and ENHANCE rule findings.
 * Layer 3 (FREE PREVIEW): Cross-references Layer 1 + Layer 2 to produce accurate preview.
 * Layer 4 (PAID): Full GPT analysis in webhook using pre-validated findings.
 *
 * Key improvement: AI classifier catches what regex misses, filters regex false positives.
 */

const multiparty = require('multiparty');
const fs         = require('fs');
const path       = require('path');
const { v4: uuidv4 } = require('uuid');
const pdfParse   = require('pdf-parse');
const mammoth    = require('mammoth');
const OpenAI     = require('openai');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// LAYER 1: NZ Property Risk Rule Engine (Zero AI Cost)
// ============================================================
const NZ_RISK_RULES = {
    spa: [
      { pattern: /as\s+is\s+where\s+is/gi,                            risk: 'HIGH',   category: 'Contract Terms',   message: '"As is where is" clause — seller disclaims all responsibility for property condition.' },
      { pattern: /cash\s+unconditional/gi,                             risk: 'HIGH',   category: 'Contract Terms',   message: 'Cash unconditional offer — no finance or due diligence protection for buyer.' },
      { pattern: /no\s+due\s+diligence/gi,                             risk: 'HIGH',   category: 'Contract Terms',   message: 'Due diligence waived — cannot withdraw if issues found after signing.' },
      { pattern: /leasehold/gi,                                        risk: 'HIGH',   category: 'Title',            message: 'Leasehold title — ground rent reviews can significantly increase future holding costs.' },
      { pattern: /meth(amphetamine)?\s+(contamin|test|residue)/gi,     risk: 'HIGH',   category: 'Contamination',    message: 'Methamphetamine contamination reference — obtain independent meth test before proceeding.' },
      { pattern: /body\s+corporate/gi,                                 risk: 'MEDIUM', category: 'Body Corporate',   message: 'Body corporate property — obtain levy statements and meeting minutes before going unconditional.' },
      { pattern: /unit\s+title/gi,                                     risk: 'MEDIUM', category: 'Title',            message: 'Unit title — pre-contract disclosure statement required under Unit Titles Act 2010.' },
      { pattern: /cross[\s-]?lease/gi,                                 risk: 'MEDIUM', category: 'Title',            message: 'Cross-lease title — verify flats plan matches current structures; illegal alterations are common.' },
      { pattern: /settlement\s+period[^.]{0,50}(\d+)\s*working\s+days/gi, risk: 'MEDIUM', category: 'Settlement',  message: 'Settlement period detected — confirm all conditions can be met within the timeframe.' },
      { pattern: /penalty\s+(interest|clause)/gi,                      risk: 'MEDIUM', category: 'Financial',       message: 'Penalty clause — late settlement may incur significant additional charges.' },
      { pattern: /subject\s+to\s+finance/gi,                           risk: 'LOW',    category: 'Conditions',      message: 'Finance condition — standard protection, ensure bank approval timeline is realistic.' },
      { pattern: /chattels?/gi,                                        risk: 'LOW',    category: 'Chattels',        message: 'Chattels referenced — verify all listed items are present and in working order at settlement.' },
      { pattern: /vacant\s+possession/gi,                              risk: 'LOW',    category: 'Possession',      message: 'Vacant possession required — confirm tenancy end date if property is currently tenanted.' },
      { pattern: /purchaser\s+must\s+not\s+assign/gi,                  risk: 'LOW',    category: 'Contract Terms',  message: 'Assignment restriction — cannot on-sell the contract to another buyer.' },
        ],
    lim: [
      { pattern: /outstanding\s+(building\s+)?consent/gi,             risk: 'HIGH',   category: 'Building Consent', message: 'Outstanding building consent — structures may be illegal. Demand code compliance certificate.' },
      { pattern: /no\s+code\s+compliance/gi,                          risk: 'HIGH',   category: 'Building Consent', message: 'No code compliance certificate — council has not signed off on completed building work.' },
      { pattern: /requisition/gi,                                     risk: 'HIGH',   category: 'Council Notice',   message: 'Council requisition on property — legal obligation to remediate, cost passes to new owner.' },
      { pattern: /notice\s+to\s+(fix|rectify|remedy)/gi,              risk: 'HIGH',   category: 'Council Notice',   message: 'Notice to fix issued by council — legal repair obligation that transfers to purchaser.' },
      { pattern: /flood(ing|plain|prone)?/gi,                         risk: 'HIGH',   category: 'Environmental',    message: 'Flood risk noted in LIM — check council flood maps and obtain insurance quotes before committing.' },
      { pattern: /liquefaction/gi,                                    risk: 'HIGH',   category: 'Environmental',    message: 'Liquefaction risk — common in Christchurch, Wellington coastal areas. Verify EQC claims history.' },
      { pattern: /contaminated\s+(land|site|soil)/gi,                 risk: 'HIGH',   category: 'Environmental',    message: 'Land contamination recorded on LIM — remediation costs can be very substantial.' },
      { pattern: /asbestos/gi,                                        risk: 'HIGH',   category: 'Hazardous Materials', message: 'Asbestos referenced — if pre-1990 building, obtain asbestos survey before purchase.' },
      { pattern: /erosion\s+risk/gi,                                  risk: 'HIGH',   category: 'Environmental',    message: 'Erosion risk — may affect future insurability and long-term property value.' },
      { pattern: /heritage\s+(order|designation|listing)/gi,          risk: 'MEDIUM', category: 'Heritage',         message: 'Heritage designation — limits alterations significantly, may affect resale value.' },
      { pattern: /designation/gi,                                     risk: 'MEDIUM', category: 'Planning',         message: 'Land designation found — local or central government may have acquisition rights.' },
      { pattern: /onsite\s+(wastewater|septic)/gi,                    risk: 'MEDIUM', category: 'Services',         message: 'Onsite wastewater system — verify compliance with regional council rules; ongoing maintenance costs.' },
      { pattern: /resource\s+consent/gi,                              risk: 'LOW',    category: 'Planning',         message: 'Resource consent on record — check ongoing consent conditions and obligations.' },
        ],
    building: [
      { pattern: /moisture\s+(meter|reading|level|damage|intrusion)/gi, risk: 'HIGH', category: 'Moisture',         message: 'Moisture issues detected — may indicate weathertightness failure. Get specialist report urgently.' },
      { pattern: /weathertight(ness)?(\s+risk|\s+failure|\s+issue)?/gi, risk: 'HIGH', category: 'Weathertightness', message: 'Weathertightness risk flagged — NZ leaky building remediation can exceed $200,000 NZD.' },
      { pattern: /monolithic\s+cladding/gi,                           risk: 'HIGH',   category: 'Weathertightness', message: 'Monolithic cladding system — high weathertightness risk, common in 1990s-2000s NZ builds.' },
      { pattern: /eifs|exterior\s+insulation/gi,                      risk: 'HIGH',   category: 'Weathertightness', message: 'EIFS cladding — closely associated with NZ leaky building crisis. Specialist assessment required.' },
      { pattern: /structural\s+(concern|issue|damage|defect|movement)/gi, risk: 'HIGH', category: 'Structure',      message: 'Structural concerns — engage a structural engineer before going unconditional.' },
      { pattern: /foundation\s+(crack|subsidence|settlement|movement)/gi, risk: 'HIGH', category: 'Structure',      message: 'Foundation issues — can be very costly to remediate; obtain engineering assessment.' },
      { pattern: /urgent\s+(repair|attention|remediation)/gi,         risk: 'HIGH',   category: 'Urgent Works',     message: 'Urgent repairs flagged — use these to negotiate purchase price reduction.' },
      { pattern: /earthquake\s+(damage|prone|risk)/gi,                risk: 'HIGH',   category: 'Earthquake',       message: 'Earthquake damage or risk — check council earthquake-prone building register and EQC claims.' },
      { pattern: /\$[\d,]+\s*(to|-)\s*\$[\d,]+/g,                    risk: 'MEDIUM', category: 'Cost Estimates',   message: 'Repair cost estimates found — total all figures for price negotiation leverage.' },
      { pattern: /electrical\s+(fault|issue|concern|non.compliant)/gi, risk: 'MEDIUM', category: 'Electrical',      message: 'Electrical issues — non-compliant wiring is a safety concern and may affect insurance.' },
      { pattern: /plumbing\s+(leak|issue|concern|age)/gi,             risk: 'MEDIUM', category: 'Plumbing',         message: 'Plumbing concerns — aged or leaking pipes can be expensive to replace throughout a house.' },
      { pattern: /re.roofing\s+recommended|roof\s+(end|near)\s+of\s+life/gi, risk: 'MEDIUM', category: 'Roofing',  message: 'Roof replacement recommended — budget $15,000-$45,000 NZD depending on size and material.' },
      { pattern: /uninspected\s+area/gi,                              risk: 'MEDIUM', category: 'Inspection Limitation', message: 'Areas not inspected — hidden risks remain. Consider invasive investigation before committing.' },
        ]
};

// ============================================================
// LAYER 2: GPT-4o-mini Document Classifier
// Identifies doc type + which risk categories actually exist
// Cost: ~$0.0002 per call (negligible)
// ============================================================
async function classifyWithAI(text, docTypeHint) {
    const excerpt = text.slice(0, 3000);

  const systemPrompt = `You are a New Zealand property document risk classifier.
  Analyse the document excerpt and return ONLY valid JSON — no explanation, no markdown.`;

  const userPrompt = `Classify this NZ property document excerpt.
  User-selected type hint: "${docTypeHint || 'unknown'}"

  Document text (first 3000 chars):
  ---
  ${excerpt}
  ---

  Return this exact JSON:
  {
    "docType": "<sale_purchase_agreement | lim_report | building_inspection | title_search | insurance | other>",
      "docTypeConfidence": "<high | medium | low>",
        "confirmedRiskCategories": ["<categories with clear textual evidence>"],
          "additionalRisks": ["<risks present but not in standard categories, brief description>"],
            "estimatedRiskLevel": "<high | medium | low>",
              "notes": "<one sentence: key concern or notable feature, or empty string>"
              }

              Allowed confirmedRiskCategories (only use from this list):
              as_is_where_is, settlement_risk, finance_penalty, leasehold, cross_lease, unit_title, body_corporate,
              flood_zone, liquefaction, asbestos, building_consent, contamination, heritage, resource_consent,
              weathertightness, structural, monolithic_cladding, eqc_risk, moisture, electrical, plumbing, roofing, cost_estimates

              Rules:
              - Only include confirmedRiskCategories with direct textual evidence in the excerpt
              - estimatedRiskLevel: high if 2+ serious issues, medium if 1, low if none
              - Be conservative: false negatives are safer than false positives for free preview`;

  try {
        const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user',   content: userPrompt   },
                        ],
                temperature: 0,
                max_tokens: 400,
                response_format: { type: 'json_object' },
        });

      const raw = response.choices[0]?.message?.content;
        if (!raw) throw new Error('Empty response from classifier');

      const parsed = JSON.parse(raw);
        console.log('[classifier] tokens used:', response.usage?.total_tokens, '| doc:', parsed.docType, '| risks:', parsed.confirmedRiskCategories?.length);

      return {
              docType:                  parsed.docType                  || 'other',
              docTypeConfidence:        parsed.docTypeConfidence        || 'low',
              confirmedRiskCategories:  Array.isArray(parsed.confirmedRiskCategories) ? parsed.confirmedRiskCategories : [],
              additionalRisks:          Array.isArray(parsed.additionalRisks)         ? parsed.additionalRisks         : [],
              estimatedRiskLevel:       parsed.estimatedRiskLevel       || 'medium',
              notes:                    parsed.notes                    || '',
              source: 'gpt-4o-mini',
      };
  } catch (err) {
        console.warn('[classifier] AI classification failed, using fallback:', err.message);
        return fallbackClassify(text, docTypeHint);
  }
}

// Fallback: keyword-based classifier when AI unavailable
function fallbackClassify(text, docTypeHint) {
    const t = text.toLowerCase();
    const cats = [];
    if (/as\s+is\s+where\s+is/.test(t))           cats.push('as_is_where_is');
    if (/leasehold/.test(t))                        cats.push('leasehold');
    if (/cross[\s-]?lease/.test(t))                 cats.push('cross_lease');
    if (/unit\s+title/.test(t))                     cats.push('unit_title');
    if (/body\s+corporate/.test(t))                 cats.push('body_corporate');
    if (/flood|liquefaction/.test(t))               cats.push('flood_zone');
    if (/asbestos/.test(t))                         cats.push('asbestos');
    if (/building\s+consent/.test(t))               cats.push('building_consent');
    if (/weathertight|leaky\s+building/.test(t))    cats.push('weathertightness');
    if (/monolithic|eifs/.test(t))                  cats.push('monolithic_cladding');
    if (/structural|foundation/.test(t))            cats.push('structural');
    if (/moisture/.test(t))                         cats.push('moisture');
    return {
          docType: mapHintToDocType(docTypeHint),
          docTypeConfidence: 'low',
          confirmedRiskCategories: cats,
          additionalRisks: [],
          estimatedRiskLevel: cats.length >= 2 ? 'high' : cats.length === 1 ? 'medium' : 'low',
          notes: '',
          source: 'fallback',
    };
}

function mapHintToDocType(hint) {
    const map = { sp: 'sale_purchase_agreement', lim: 'lim_report', building: 'building_inspection', other: 'other' };
    return map[hint] || 'other';
}

// Map AI category names back to rule engine category names for cross-reference
const AI_TO_RULE_CATEGORY_MAP = {
    as_is_where_is:    'Contract Terms',
    leasehold:         'Title',
    cross_lease:       'Title',
    unit_title:        'Title',
    body_corporate:    'Body Corporate',
    flood_zone:        'Environmental',
    liquefaction:      'Environmental',
    asbestos:          'Hazardous Materials',
    building_consent:  'Building Consent',
    contamination:     'Environmental',
    heritage:          'Heritage',
    resource_consent:  'Planning',
    weathertightness:  'Weathertightness',
    structural:        'Structure',
    monolithic_cladding: 'Weathertightness',
    eqc_risk:          'Earthquake',
    moisture:          'Moisture',
    electrical:        'Electrical',
    plumbing:          'Plumbing',
    roofing:           'Roofing',
    cost_estimates:    'Cost Estimates',
    settlement_risk:   'Settlement',
    finance_penalty:   'Financial',
};

// ============================================================
// LAYER 3: Cross-reference rule findings with AI classification
// AI-confirmed findings get boosted; unconfirmed get filtered
// ============================================================
function crossReferenceFindings(ruleFindings, aiResult) {
    const confirmedRuleCategories = new Set(
          aiResult.confirmedRiskCategories.map(cat => AI_TO_RULE_CATEGORY_MAP[cat]).filter(Boolean)
        );

  const validated = [];

  for (const finding of ruleFindings) {
        const aiConfirmed = confirmedRuleCategories.has(finding.category);

      if (aiConfirmed) {
              // AI confirms this risk exists — high confidence, keep regardless of risk level
          validated.push({ ...finding, aiConfirmed: true, confidence: 'high' });
      } else if (finding.risk === 'HIGH') {
              // High-risk regex hit not confirmed by AI — still include, but flag as unconfirmed
          // (High risk findings are important enough to surface even without AI confirmation)
          validated.push({ ...finding, aiConfirmed: false, confidence: 'medium' });
      } else if (finding.risk === 'MEDIUM') {
              // Medium risk not confirmed by AI — include with low confidence
          validated.push({ ...finding, aiConfirmed: false, confidence: 'low' });
      }
        // LOW risk findings NOT confirmed by AI → filtered out (likely false positives)
  }

  // Add any AI-detected additional risks that regex didn't catch
  for (const additionalRisk of aiResult.additionalRisks) {
        if (additionalRisk && additionalRisk.trim()) {
                validated.push({
                          risk: 'MEDIUM',
                          category: 'AI Detected',
                          message: additionalRisk,
                          context: '',
                          matchCount: 1,
                          aiConfirmed: true,
                          confidence: 'medium',
                          aiOnly: true,
                });
        }
  }

  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return validated.sort((a, b) => order[a.risk] - order[b.risk]);
}

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
async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
        const sessionId  = uuidv4();
        const uploadDir  = `/tmp/legal-docs/${sessionId}`;
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

      const form = new multiparty.Form({
              uploadDir,
              maxFilesSize: 50 * 1024 * 1024,
              maxFields: 10,
      });

      const result = await new Promise((resolve, reject) => {
              form.parse(req, async (err, fields, files) => {
                        if (err) { reject(err); return; }

                                 try {
                                             const uploadedFiles  = files.documents || files.file || [];
                                             const declaredType   = fields.documentType ? fields.documentType[0] : 'other';

                          if (!uploadedFiles.length) return resolve({ error: 'No files uploaded' });

                          const allFindings    = [];
                                             const processedFiles = [];
                                             const storedFileKeys = [];

                          for (const file of uploadedFiles) {
                                        let text = '';
                                        const ext = path.extname(file.originalFilename || '').toLowerCase();

                                               // Extract text
                                               if (ext === '.pdf') {
                                                               const buf    = fs.readFileSync(file.path);
                                                               const parsed = await pdfParse(buf);
                                                               text = parsed.text;
                                               } else if (ext === '.docx' || ext === '.doc') {
                                                               const buf  = fs.readFileSync(file.path);
                                                               const res2 = await mammoth.extractRawText({ buffer: buf });
                                                               text = res2.value;
                                               } else {
                                                               text = fs.readFileSync(file.path, 'utf8');
                                               }

                                               // Upload to Supabase Storage
                                               const fileKey    = `${sessionId}/${file.originalFilename}`;
                                        const fileBuffer = fs.readFileSync(file.path);
                                        const mimeType   = ext === '.pdf'
                                          ? 'application/pdf'
                                                        : ext === '.docx'
                                            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                                                          : 'application/octet-stream';

                                               const { error: uploadError } = await supabase.storage
                                          .from('documents')
                                          .upload(fileKey, fileBuffer, { contentType: mimeType, upsert: true });

                                               if (uploadError) {
                                                               console.error('Supabase Storage upload error:', uploadError);
                                               } else {
                                                               storedFileKeys.push({ key: fileKey, name: file.originalFilename, ext });
                                               }

                                               try { fs.unlinkSync(file.path); } catch (e) {}

                                               // Layer 1: Rule engine
                                               const docType     = detectDocType(text, declaredType);
                                        const ruleFindings = runRuleEngine(text, docType);

                                               // Layer 2: AI classifier (runs in parallel — no extra latency)
                                               const aiResult = await classifyWithAI(text, declaredType);

                                               // Layer 3: Cross-reference — validated, de-noised findings
                                               const validatedFindings = crossReferenceFindings(ruleFindings, aiResult);

                                               processedFiles.push({
                                                               fileName:  file.originalFilename,
                                                               docType:   aiResult.docTypeConfidence === 'high' ? aiResult.docType : docType,
                                                               ruleFindings,
                                                               aiResult,
                                                               validatedFindings,
                                                               paragraphs: splitIntoParagraphs(text),
                                               });

                                               allFindings.push(...validatedFindings);
                          }

                          const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
                                             allFindings.sort((a, b) => order[a.risk] - order[b.risk]);

                          const highCount = allFindings.filter(f => f.risk === 'HIGH').length;
                                             const medCount  = allFindings.filter(f => f.risk === 'MEDIUM').length;
                                             const lowCount  = allFindings.filter(f => f.risk === 'LOW').length;

                          return resolve({
                                        sessionId,
                                        preview: true,
                                        storedFileKeys,
                                        summary: {
                                                        totalRisks:        allFindings.length,
                                                        highRisks:         highCount,
                                                        mediumRisks:       medCount,
                                                        lowRisks:          lowCount,
                                                        documentsAnalysed: processedFiles.length,
                                                        aiClassification:  processedFiles.map(f => ({
                                                                          file:       f.fileName,
                                                                          docType:    f.docType,
                                                                          confidence: f.aiResult?.docTypeConfidence,
                                                                          riskLevel:  f.aiResult?.estimatedRiskLevel,
                                                                          notes:      f.aiResult?.notes,
                                                        })),
                                        },
                                        previewFindings: allFindings.slice(0, 3).map(f => ({
                                                        risk:        f.risk,
                                                        category:    f.category,
                                                        message:     f.message,
                                                        aiConfirmed: f.aiConfirmed,
                                        })),
                                        hiddenCount: Math.max(0, allFindings.length - 3),
                          });

                                 } catch (e) { reject(e); }
              });
      });

      if (result.error) return res.status(400).json({ error: result.error });
        return res.status(200).json(result);

  } catch (error) {
        console.error('Document processing error:', error);
        return res.status(500).json({ error: 'Processing failed: ' + error.message });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
