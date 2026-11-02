/**
 * Dev Harbour — Authoritative Database Client
 * Canonical PostgreSQL database connected to Supabase Cloud.
 * Single source of truth for all persistent application data.
 * All SQLite dependencies have been migrated and removed.
 */

const dbPostgres = require('./db-postgres');

module.exports = dbPostgres;
