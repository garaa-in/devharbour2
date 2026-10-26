/**
 * Dev Harbour — Orcathon 2026 Participant Ingestion Script
 * Ingests and normalizes all 693 registered participants from the official CSV.
 */

const fs = require('fs');
const path = require('path');
const { db, countParticipants } = require('./db');

const CSV_PATH = path.join(
  'C:',
  'Users',
  'parth',
  '.gemini',
  'antigravity',
  'brain',
  'a79369d6-46fa-4fb1-bbd8-9249109c8347',
  '.user_uploaded',
  'media_1793017882996_272ca92a.csv'
);

function parseCsv(str) {
  const rows = [];
  let row = [];
  let curr = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        curr += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(curr.trim());
      curr = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(curr.trim());
      if (row.some(field => field.length > 0)) rows.push(row);
      row = [];
      curr = '';
    } else {
      curr += c;
    }
  }
  if (curr.length > 0 || row.length > 0) {
    row.push(curr.trim());
    if (row.some(field => field.length > 0)) rows.push(row);
  }
  return rows;
}

function ingest() {
  console.log('Reading CSV from:', CSV_PATH);
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV file not found at:', CSV_PATH);
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(content);
  const candidates = rows.slice(1);
  console.log(`Parsed ${candidates.length} candidate rows from CSV.`);

  const insertStmt = db.prepare(`
    INSERT INTO event_participants (
      event_slug, team_id, team_name, candidate_role, candidate_name, candidate_email, candidate_mobile, candidate_location, candidate_organisation, is_eligible
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN TRANSACTION;');

  let inserted = 0;
  let skipped = 0;

  for (const c of candidates) {
    const teamId = (c[0] || '').trim();
    const teamName = (c[1] || '').trim();
    const candidateRole = (c[2] || 'Participant').trim();
    const candidateName = (c[3] || '').trim();
    const candidateEmail = (c[4] || '').toLowerCase().trim();
    const candidateMobile = (c[5] || '').trim();
    const candidateLocation = (c[7] || '').trim();
    const candidateOrganisation = (c[16] || '').trim();

    if (!candidateEmail || !candidateName) {
      skipped++;
      continue;
    }

    // Check if already in db
    const existing = db.prepare('SELECT id FROM event_participants WHERE candidate_email = ? AND event_slug = ?').get(candidateEmail, 'orca-coders-orcathon-2026');
    if (existing) {
      skipped++;
      continue;
    }

    insertStmt.run(
      'orca-coders-orcathon-2026',
      teamId,
      teamName,
      candidateRole,
      candidateName,
      candidateEmail,
      candidateMobile,
      candidateLocation,
      candidateOrganisation,
      1
    );
    inserted++;
  }

  db.exec('COMMIT;');

  console.log(`Ingestion completed! Inserted: ${inserted}, Skipped/Existing: ${skipped}`);
  console.log(`Total event_participants in database: ${countParticipants('orca-coders-orcathon-2026')}`);
}

if (require.main === module) {
  ingest();
}

module.exports = { ingest };
