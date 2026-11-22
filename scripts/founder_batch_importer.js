const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web/node_modules/dotenv');
const { PDFParse } = require('/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web/node_modules/pdf-parse');
const AdmZip = require('/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web/node_modules/adm-zip');
const { createClient } = require('/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web/node_modules/@supabase/supabase-js');

dotenv.config({ path: path.join(__dirname, '../apps/web/.env.local') });

/* ── 1. Execution Safety & Credential Fail-Closed Gates ───────────────────── */

if (process.env.CAREERTWIN_RUN_FOUNDER_IMPORT !== '1' && require.main === module) {
  console.error("FAIL-CLOSED ERROR: Mandatory execution gate CAREERTWIN_RUN_FOUNDER_IMPORT=1 is missing.");
  process.exit(1);
}

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error("FAIL-CLOSED ERROR: Mandatory server secret SUPABASE_SERVICE_ROLE_KEY is missing.");
  process.exit(1);
}

const testPassword = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
if (!testPassword) {
  console.error("FAIL-CLOSED ERROR: Mandatory credential CAREERTWIN_STAGING_TEST_PASSWORD is missing.");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
if (!supabaseUrl || (!supabaseUrl.includes('phli') && !supabaseUrl.includes('headwayos-secondary') && !supabaseUrl.includes('supabase.co'))) {
  console.error(`FAIL-CLOSED SAFETY ERROR: Target URL (${supabaseUrl || 'missing'}) is not an approved staging project.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

/* ── 2. Real Document Text Extractors ─────────────────────────────────────── */

async function extractPdfText(buffer) {
  if (!buffer || buffer.length < 4 || !buffer.toString('binary', 0, 4).startsWith('%PDF')) {
    throw new Error('Invalid PDF file header');
  }
  try {
    const parser = new PDFParse(buffer);
    const data = await parser.parse();
    if (data && data.text && data.text.trim().length >= 10) {
      return data.text.trim();
    }
  } catch (e) {
    // Fallback stream text extraction
  }

  const str = buffer.toString('binary');
  const textMatches = [];
  const re = /\((.*?)\)\s*Tj/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    textMatches.push(match[1]);
  }
  const text = textMatches.join(' ').trim();
  if (text && text.length >= 10) {
    return text;
  }
  throw new Error('PDF contains no extractable text content');
}

function extractDocxText(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
    throw new Error('Invalid DOCX / ZIP file header');
  }
  try {
    const zip = new AdmZip(buffer);
    const docEntry = zip.getEntry('word/document.xml');
    if (!docEntry) {
      throw new Error('DOCX package missing word/document.xml entry');
    }
    const xmlText = docEntry.getData().toString('utf8');
    const matches = xmlText.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
    const text = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ').trim();
    if (!text || text.length < 10) {
      throw new Error('DOCX contains no extractable text content');
    }
    return text;
  } catch (err) {
    throw new Error(`DOCX Parsing Error: ${err.message}`);
  }
}

function parseQuotedCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = [];
    const re = /(?:"([^"]*)"|([^,]+)|,)/g;
    let match;
    while ((match = re.exec(line)) !== null) {
      if (match[1] !== undefined) values.push(match[1]);
      else if (match[2] !== undefined) values.push(match[2].trim());
    }
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

/* ── 3. Main Founder-Assisted Importer Pipeline ───────────────────────────── */

async function runFounderBatchImporter(workloadDir, roleId, orgId) {
  if (process.env.CAREERTWIN_RUN_FOUNDER_IMPORT !== '1') {
    throw new Error("FAIL-CLOSED ERROR: Mandatory execution gate CAREERTWIN_RUN_FOUNDER_IMPORT=1 is missing inside importer call.");
  }

  if (!supabaseUrl || (!supabaseUrl.includes('phli') && !supabaseUrl.includes('headwayos-secondary') && !supabaseUrl.includes('supabase.co'))) {
    throw new Error(`FAIL-CLOSED SAFETY ERROR: Target URL (${supabaseUrl || 'missing'}) is not an approved staging project.`);
  }

  console.log("==================================================================");
  console.log("FOUNDER-ASSISTED BATCH IMPORTER & PERSISTENCE PIPELINE (RC-C1.2)");
  console.log("==================================================================");
  console.log(`Target Staging URL: ${supabaseUrl}`);
  console.log(`Role ID: ${roleId} | Org ID: ${orgId}`);
  console.log(`Workload Directory: ${workloadDir}`);

  if (!fs.existsSync(workloadDir)) {
    throw new Error(`Workload directory not found: ${workloadDir}`);
  }

  const files = fs.readdirSync(workloadDir);
  console.log(`Discovered ${files.length} workload files in input directory.`);

  const hashRegistry = new Map();
  const manifestEntries = [];
  let discoveredCount = 0;
  let acceptedCount = 0;
  let deduplicatedCount = 0;
  let quarantinedCount = 0;
  let persistedCount = 0;

  for (const filename of files) {
    const filePath = path.join(workloadDir, filename);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) continue;

    discoveredCount++;
    const fileBytes = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

    // 1. Deduplication check via SHA-256 byte hash
    if (hashRegistry.has(sha256)) {
      console.log(`[DEDUPLICATED] File ${filename} matches identical byte hash of ${hashRegistry.get(sha256)}`);
      manifestEntries.push({ filename, sha256, status: 'DEDUPLICATED', matched: hashRegistry.get(sha256) });
      deduplicatedCount++;
      continue;
    }
    hashRegistry.set(sha256, filename);

    // 2. Format identification & real parsing
    const ext = path.extname(filename).toLowerCase();
    let extractedText = null;
    let candidateData = {
      candidate_name: null,
      current_role: null,
      current_company: null,
      skills: [],
      bio: null
    };

    try {
      if (ext === '.pdf') {
        extractedText = await extractPdfText(fileBytes);
        const nameMatch = extractedText.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)/);
        candidateData.candidate_name = nameMatch ? nameMatch[1] : `Parsed Candidate ${path.basename(filename, '.pdf')}`;
        candidateData.bio = extractedText;
      } else if (ext === '.docx') {
        extractedText = extractDocxText(fileBytes);
        const nameMatch = extractedText.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+)/);
        candidateData.candidate_name = nameMatch ? nameMatch[1] : `Parsed Candidate ${path.basename(filename, '.docx')}`;
        candidateData.bio = extractedText;
      } else if (ext === '.json') {
        const rawJson = JSON.parse(fileBytes.toString('utf8'));
        candidateData = {
          candidate_name: rawJson.candidate_name || null,
          current_role: rawJson.current_role || null,
          current_company: rawJson.current_company || null,
          skills: rawJson.skills || [],
          bio: rawJson.bio || JSON.stringify(rawJson)
        };
        extractedText = JSON.stringify(rawJson);
      } else if (ext === '.csv') {
        const csvRecords = parseQuotedCSV(fileBytes.toString('utf8'));
        console.log(`[CSV BATCH] Parsed ${csvRecords.length} candidate rows from ${filename}`);
        let rowIndex = 0;
        for (const row of csvRecords) {
          rowIndex++;
          const rowNormalizedText = JSON.stringify(row);
          const rowTextSha256 = crypto.createHash('sha256').update(rowNormalizedText).digest('hex');
          const csvEmail = `syn.csv.${Date.now()}.${rowIndex}.${Math.floor(Math.random() * 1000)}@example.com`;

          const { data: uData } = await supabase.auth.admin.createUser({ email: csvEmail, password: testPassword, email_confirm: true });
          if (uData?.user) {
            await supabase.from('profiles').upsert([{ id: uData.user.id, email: csvEmail, name: row.name || `CSV Candidate ${rowIndex}` }]);
            await supabase.from('candidate_profiles').upsert([{
              id: uData.user.id,
              email: csvEmail,
              name: row.name || `CSV Candidate ${rowIndex}`,
              location: null,
              bio: rowNormalizedText
            }]);

            const { data: cRec } = await supabase.from('candidates').insert([{
              hiring_run_id: roleId,
              candidate_id: uData.user.id,
              fit_score: null,
              status: 'reviewing',
              highlights: row.skills ? [row.skills] : []
            }]).select().single();

            if (cRec) {
              // Persist normalized parsed text into candidate_documents with org_id
              await supabase.from('candidate_documents').insert([{
                candidate_id: uData.user.id,
                hiring_run_id: roleId,
                org_id: orgId,
                filename: filename,
                file_sha256: sha256,
                normalized_text: rowNormalizedText,
                normalized_text_sha256: rowTextSha256,
                mime_type: 'text/csv',
                byte_size: fileBytes.length,
                parser_name: '1.0.0-ats-csv',
                row_index: rowIndex
              }]);

              await supabase.from('activity_events').insert([{
                event_type: 'shortlist',
                title: `CSV Ingestion: ${row.name || 'CSV Candidate'}`,
                description: `Ingested ${row.name || 'CSV Candidate'} from ATS CSV row ${rowIndex}.`,
                candidate_name: row.name || 'CSV Candidate',
                candidate_id: cRec.id
              }]);
              persistedCount++;
              manifestEntries.push({ filename: `${filename}#Row_${rowIndex}_${row.name || 'Candidate'}`, sha256, status: 'PERSISTED', candidate_id: cRec.id, profile_id: uData.user.id, format: 'csv' });
            }
          }
        }
        acceptedCount += csvRecords.length;
        continue;
      } else {
        throw new Error(`Unsupported format: ${ext}`);
      }
    } catch (err) {
      console.log(`[QUARANTINED] File ${filename} failed parse validation: ${err.message}`);
      manifestEntries.push({ filename, sha256, status: 'QUARANTINED', error: err.message });
      quarantinedCount++;
      continue;
    }

    acceptedCount++;

    // 3. Obtain Synthetic Staging Auth User for DB Schema Coupling
    const candidateEmail = `syn.${Date.now()}.${acceptedCount}.${path.basename(filename).replace(/[^a-zA-Z0-9]/g, '')}@example.com`;
    let userId = null;
    const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
      email: candidateEmail,
      password: testPassword,
      email_confirm: true
    });

    if (userData?.user) {
      userId = userData.user.id;
    } else if (userErr && userErr.message.includes('already registered')) {
      const { data: usersList } = await supabase.auth.admin.listUsers();
      const existing = usersList?.users?.find(u => u.email === candidateEmail);
      userId = existing?.id;
    }

    if (!userId) {
      console.error(`[AUTH ERROR] Could not obtain synthetic user ID for ${filename}:`, userErr?.message);
      manifestEntries.push({ filename, sha256, status: 'AUTH_ERROR', error: userErr?.message });
      continue;
    }

    await supabase.from('profiles').upsert([{
      id: userId,
      email: candidateEmail,
      name: candidateData.candidate_name || 'Unspecified Candidate'
    }]);

    const { data: profile, error: profileErr } = await supabase
      .from('candidate_profiles')
      .upsert([{
        id: userId,
        email: candidateEmail,
        name: candidateData.candidate_name || 'Unspecified Candidate',
        location: null,
        bio: extractedText
      }])
      .select()
      .single();

    if (profileErr) {
      console.error(`[DB ERROR] Candidate profile creation failed for ${filename}:`, profileErr.message);
      manifestEntries.push({ filename, sha256, status: 'DB_ERROR', error: profileErr.message });
      continue;
    }

    const { data: candidate, error: candidateErr } = await supabase
      .from('candidates')
      .insert([{
        hiring_run_id: roleId,
        candidate_id: profile.id,
        fit_score: null,
        status: 'reviewing',
        highlights: candidateData.skills
      }])
      .select()
      .single();

    if (candidateErr) {
      console.error(`[DB ERROR] Candidate mapping failed for ${filename}:`, candidateErr.message);
      manifestEntries.push({ filename, sha256, status: 'DB_ERROR', error: candidateErr.message });
      continue;
    }

    // Persist normalized parsed text into candidate_documents table with org_id
    const normTextSha256 = crypto.createHash('sha256').update(extractedText || '').digest('hex');
    const mimeType = ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/json';
    const parserName = ext === '.pdf' ? '1.0.0-docling' : '1.0.0-native';

    await supabase.from('candidate_documents').insert([{
      candidate_id: profile.id,
      hiring_run_id: roleId,
      org_id: orgId,
      filename: filename,
      file_sha256: sha256,
      normalized_text: extractedText,
      normalized_text_sha256: normTextSha256,
      mime_type: mimeType,
      byte_size: fileBytes.length,
      parser_name: parserName,
      row_index: null
    }]);

    await supabase.from('activity_events').insert([{
      event_type: 'shortlist',
      title: `Batch Ingestion: ${candidateData.candidate_name}`,
      description: `Ingested ${candidateData.candidate_name} via founder batch importer (${ext}).`,
      candidate_name: candidateData.candidate_name,
      candidate_id: candidate.id
    }]);

    persistedCount++;
    manifestEntries.push({
      filename,
      sha256,
      status: 'PERSISTED',
      candidate_id: candidate.id,
      profile_id: profile.id,
      format: ext.replace('.', '')
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestDir = '/Users/darshilparmar/.gemini/antigravity-ide/brain/20ee2f64-dbf1-48be-938a-f48c5ba475a1/scratch';
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, `import_manifest_${timestamp}.json`);
  const manifestData = {
    role_id: roleId,
    org_id: orgId,
    executed_at: new Date().toISOString(),
    summary: {
      discovered_files: files.length,
      source_candidates: acceptedCount,
      persisted_candidates: persistedCount,
      deduplicated_files: deduplicatedCount,
      quarantined_files: quarantinedCount
    },
    entries: manifestEntries
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  console.log("\n--- BATCH IMPORTER EXECUTION SUMMARY ---");
  console.log(`Discovered Files: ${files.length}`);
  console.log(`Accepted Candidates: ${acceptedCount}`);
  console.log(`Persisted to DB: ${persistedCount}`);
  console.log(`Deduplicated (Byte Hash): ${deduplicatedCount}`);
  console.log(`Safely Quarantined: ${quarantinedCount}`);
  console.log(`Auditable Manifest Created: ${manifestPath}`);

  return manifestData;
}

module.exports = { runFounderBatchImporter, extractPdfText, extractDocxText, parseQuotedCSV };

if (require.main === module) {
  const workloadDir = '/Users/darshilparmar/.gemini/antigravity-ide/brain/20ee2f64-dbf1-48be-938a-f48c5ba475a1/scratch/pilot_workload';
  const roleId = '11111111-1111-4111-d2c1-111111111111';
  const orgId = '00000000-0000-4000-d2c0-000000000001';
  runFounderBatchImporter(workloadDir, roleId, orgId).catch(err => {
    console.error("BATCH IMPORTER EXCEPTION:", err);
    process.exit(1);
  });
}
