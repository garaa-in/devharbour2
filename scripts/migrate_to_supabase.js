/**
 * Dev Harbour — Automated SQLite to Supabase Migration Script
 * Reads local SQLite database and migrates all records to Supabase PostgreSQL.
 * Usage: node scripts/migrate_to_supabase.js
 */

require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be set in .env');
  console.log('   Example:');
  console.log('   SUPABASE_URL=https://your-project.supabase.co');
  console.log('   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...');
  console.log('\n💡 Alternatively, you can copy and run "supabase/seed.sql" directly in your Supabase SQL Editor!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'devharbour.sqlite');
const db = new DatabaseSync(DB_PATH);

async function migrateTable(tableName, targetTable, batchSize = 100) {
  console.log(`\n📦 Migrating table: ${tableName} -> ${targetTable}...`);
  try {
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    console.log(`   Found ${rows.length} rows in local SQLite.`);

    if (rows.length === 0) return;

    let successCount = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(r => {
        const clean = { ...r };
        // Parse JSON fields if necessary
        for (const [k, v] of Object.entries(clean)) {
          if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('{'))) {
            try { clean[k] = JSON.parse(v); } catch(e) {}
          }
          // Convert integer booleans
          if (['is_featured', 'email_notifications', 'profile_public', 'is_pinned', 'is_public', 'is_eligible', 'verified'].includes(k)) {
            clean[k] = Boolean(v);
          }
        }
        return clean;
      });

      const { data, error } = await supabase.from(targetTable).upsert(batch, { ignoreDuplicates: true });
      if (error) {
        console.warn(`   ⚠️ Batch ${i}-${i + batch.length} warning:`, error.message);
      } else {
        successCount += batch.length;
      }
    }
    console.log(`   ✅ Successfully migrated ${successCount}/${rows.length} rows to ${targetTable}`);
  } catch (err) {
    console.error(`   ❌ Failed migrating ${tableName}:`, err.message);
  }
}

async function run() {
  console.log('======================================================================');
  console.log('  DEVHARBOUR — SQLITE TO SUPABASE DATA MIGRATION');
  console.log('======================================================================');
  console.log('Target Supabase:', SUPABASE_URL);

  await migrateTable('courses', 'courses');
  await migrateTable('lessons', 'lessons');
  await migrateTable('challenges', 'challenges');
  await migrateTable('achievements', 'achievements');
  await migrateTable('users', 'users');
  await migrateTable('user_settings', 'user_settings');
  await migrateTable('projects', 'projects');
  await migrateTable('event_participants', 'event_participants');
  await migrateTable('issued_certificates', 'issued_certificates');

  console.log('\n======================================================================');
  console.log('  MIGRATION COMPLETE! Verify records in Supabase Dashboard.');
  console.log('======================================================================');
}

run();
