/**
 * Dev Harbour — Direct Supabase PostgreSQL Schema & Data Setup
 */
require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DIRECT_URL to the intended Supabase database before running setup.');
const connectionUrl = new URL(connectionString);
for (const param of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) connectionUrl.searchParams.delete(param);
const ca = fs.readFileSync(path.join(__dirname, '../security/certs/supabase-root-2021.crt'), 'utf8');

async function setup() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Connecting to Supabase PostgreSQL ...');
  await client.connect();
  console.log('✅ Connected successfully!');

  // Ensure column created_at exists in event_participants
  try {
    await client.query('ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;');
  } catch (e) {}

  // 1. Run Seed SQL directly as a single transaction block
  const seedPath = path.join(__dirname, '..', 'supabase', 'seed.sql');
  if (fs.existsSync(seedPath)) {
    const seedSql = fs.readFileSync(seedPath, 'utf-8');
    console.log(`Executing seed.sql as complete block (${seedSql.length} bytes)...`);
    await client.query(seedSql);
    console.log('✅ Public seed data inserted successfully!');
  }

  // 2. Verify table record counts
  const tables = [
    'users', 'courses', 'lessons', 'challenges',
    'achievements', 'projects', 'event_participants', 'issued_certificates'
  ];

  console.log('\n📊 Database Verification Summary:');
  for (const table of tables) {
    try {
      const res = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  - ${table}: ${res.rows[0].count} records`);
    } catch (e) {
      console.log(`  - ${table}: Error checking count: ${e.message}`);
    }
  }

  await client.end();
  console.log('\n🚀 Supabase PostgreSQL setup complete!');
}

setup().catch(err => {
  console.error('❌ Supabase setup failed:', err);
  process.exit(1);
});
