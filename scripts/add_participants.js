/**
 * Dev Harbour — Add New Participants & Credentials
 * Adds Suyash Sudhir Sonkamble and Aftab Shah to:
 * 1. Local SQLite (event_participants & issued_certificates)
 * 2. Fallback JSON (server/data/orcathon_participants.json)
 * 3. Live Supabase PostgreSQL database
 * 4. Manifest files (output/certificates_manifest.json & csv)
 */

require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const newCandidates = [
  {
    id: '694',
    name: 'Suyash Sudhir Sonkamble',
    email: 'suyashsonkambledpvn@gmail.com',
    org: 'Participant',
    team: 'SOLO',
    mobile: '',
    location: 'India'
  },
  {
    id: '695',
    name: 'Aftab Shah',
    email: 'rajguruaftabshah@gmail.com',
    org: 'Participant',
    team: 'SOLO',
    mobile: '',
    location: 'India'
  }
];

function generateCredentialId(participantId, email) {
  const num = String(participantId || '1').padStart(4, '0');
  let hash = 0;
  const str = (email || '').toLowerCase() + '-' + num;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').slice(-4);
  return `DH-ORCA-2026-${num}-${hex}`;
}

async function main() {
  console.log('🚀 Adding new candidates...');

  // 1. Update SQLite
  const dbPath = path.join(__dirname, '..', 'devharbour.sqlite');
  const db = new DatabaseSync(dbPath);

  const insertPart = db.prepare(`
    INSERT OR REPLACE INTO event_participants (
      id, event_slug, team_id, team_name, candidate_role,
      candidate_name, candidate_email, candidate_mobile, candidate_location,
      candidate_organisation, is_eligible, created_at
    ) VALUES (?, 'orca-coders-orcathon-2026', 'SOLO', ?, 'Participant', ?, ?, ?, ?, ?, 1, datetime('now'))
  `);

  const insertCert = db.prepare(`
    INSERT OR REPLACE INTO issued_certificates (
      credential_id, event_slug, participant_id, recipient_name,
      recipient_email, recipient_organisation, certificate_type, issue_date, status, created_at
    ) VALUES (?, 'orca-coders-orcathon-2026', ?, ?, ?, ?, 'Participation', 'October 25, 2026', 'Valid', datetime('now'))
  `);

  for (const c of newCandidates) {
    const credId = generateCredentialId(c.id, c.email);
    insertPart.run(c.id, c.team, c.name, c.email.toLowerCase(), c.mobile, c.location, c.org);
    insertCert.run(credId, c.id, c.name, c.email.toLowerCase(), c.org);
    console.log(`  [SQLite] Added ${c.name} (${credId})`);
  }

  // 2. Update server/data/orcathon_participants.json
  const jsonPath = path.join(__dirname, '..', 'server', 'data', 'orcathon_participants.json');
  if (fs.existsSync(jsonPath)) {
    const participants = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    for (const c of newCandidates) {
      const idx = participants.findIndex(p => p.email.toLowerCase() === c.email.toLowerCase());
      if (idx >= 0) {
        participants[idx] = { id: c.id, name: c.name, email: c.email.toLowerCase(), org: c.org, team: c.team };
      } else {
        participants.push({ id: c.id, name: c.name, email: c.email.toLowerCase(), org: c.org, team: c.team });
      }
    }
    fs.writeFileSync(jsonPath, JSON.stringify(participants, null, 2), 'utf-8');
    console.log(`  [JSON] Updated server/data/orcathon_participants.json (Total: ${participants.length})`);
  }

  // 3. Update Supabase PostgreSQL
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.bvymtkqpgdzofqrcyxqu:oygeopjkPu4gu107@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
  try {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log('  [Supabase] Connected to PostgreSQL...');

    for (const c of newCandidates) {
      const credId = generateCredentialId(c.id, c.email);

      await client.query(`
        INSERT INTO event_participants (
          id, event_slug, team_id, team_name, candidate_role,
          candidate_name, candidate_email, candidate_mobile, candidate_location,
          candidate_organisation, is_eligible, created_at
        ) VALUES ($1, 'orca-coders-orcathon-2026', 'SOLO', $2, 'Participant', $3, $4, $5, $6, $7, TRUE, CURRENT_TIMESTAMP)
        ON CONFLICT (event_slug, candidate_email) DO UPDATE SET
          candidate_name = EXCLUDED.candidate_name,
          candidate_organisation = EXCLUDED.candidate_organisation;
      `, [c.id, c.team, c.name, c.email.toLowerCase(), c.mobile, c.location, c.org]);

      await client.query(`
        INSERT INTO issued_certificates (
          credential_id, event_slug, participant_id, recipient_name,
          recipient_email, recipient_organisation, certificate_type, issue_date, status, created_at
        ) VALUES ($1, 'orca-coders-orcathon-2026', $2, $3, $4, $5, 'Participation', 'October 25, 2026', 'Valid', CURRENT_TIMESTAMP)
        ON CONFLICT (credential_id) DO UPDATE SET
          recipient_name = EXCLUDED.recipient_name,
          recipient_organisation = EXCLUDED.recipient_organisation;
      `, [credId, c.id, c.name, c.email.toLowerCase(), c.org]);

      console.log(`  [Supabase] Upserted ${c.name} (${credId})`);
    }

    const sbCount = await client.query('SELECT count(*) as count FROM event_participants WHERE event_slug = $1;', ['orca-coders-orcathon-2026']);
    console.log(`  [Supabase] Total Orcathon Participants: ${sbCount.rows[0].count}`);
    await client.end();
  } catch (err) {
    console.error('  [Supabase Error]:', err.message);
  }

  // 4. Update manifest files
  const manifestJsonPath = path.join(__dirname, '..', 'output', 'certificates_manifest.json');
  if (fs.existsSync(manifestJsonPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf-8'));
    for (const c of newCandidates) {
      const credId = generateCredentialId(c.id, c.email);
      manifest.push({
        id: c.id,
        name: c.name,
        email: c.email.toLowerCase(),
        org: c.org,
        credential_id: credId,
        verification_url: `/certificate/verify/${credId}`
      });
    }
    fs.writeFileSync(manifestJsonPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(`  [Manifest] Updated certificates_manifest.json`);
  }

  const manifestCsvPath = path.join(__dirname, '..', 'output', 'certificates_manifest.csv');
  if (fs.existsSync(manifestCsvPath)) {
    for (const c of newCandidates) {
      const credId = generateCredentialId(c.id, c.email);
      fs.appendFileSync(manifestCsvPath, `\n${c.id},"${c.name}","${c.email.toLowerCase()}","${c.org}","${credId}","/certificate/verify/${credId}"`);
    }
    console.log(`  [Manifest] Updated certificates_manifest.csv`);
  }

  console.log('\n✅ Successfully added Suyash Sudhir Sonkamble and Aftab Shah across all databases and APIs!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
