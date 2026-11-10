/**
 * Dev Harbour — Official Supabase Database Client & Integration Layer
 * Provides enterprise-grade PostgreSQL persistence with automatic fallback.
 * Strictly uses environment variables; no hardcoded credentials.
 */

require('dotenv').config();
let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch {
  createClient = null;
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

let supabaseClient = null;
const { pool: pgPool } = require('./db-postgres');

// Initialize Supabase JS Client if key is provided
if (createClient && SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    console.log('⚡ Connected to Supabase REST client:', SUPABASE_URL);
  } catch (err) {
    console.warn('⚠️ Could not initialize Supabase REST client:', err.message);
  }
}

function isSupabaseConfigured() {
  return Boolean(pgPool || supabaseClient);
}

function getSupabaseClient() {
  return supabaseClient;
}

function getPgPool() {
  return pgPool;
}

/**
 * Health check for Supabase connection
 */
async function checkSupabaseHealth() {
  if (!isSupabaseConfigured()) {
    return { configured: false, status: 'unconfigured', message: 'Set DATABASE_URL or SUPABASE_URL in .env' };
  }
  try {
    if (pgPool) {
      const res = await pgPool.query('SELECT count(*) as count FROM courses;');
      return { configured: true, status: 'healthy', provider: 'PostgreSQL Pool', coursesCount: res.rows[0].count };
    }
    if (supabaseClient) {
      const { data, error } = await supabaseClient.from('courses').select('id').limit(1);
      if (error) throw error;
      return { configured: true, status: 'healthy', provider: 'Supabase REST API' };
    }
  } catch (err) {
    return { configured: true, status: 'error', error: err.message };
  }
}

/**
 * Find registered participant by email or name in Supabase
 */
async function findParticipantByEmailOrNameSupabase(email, name, eventSlug = 'orca-coders-orcathon-2026') {
  if (pgPool) {
    const eClean = (email || '').trim().toLowerCase();
    const nClean = (name || '').trim().toLowerCase();
    
    let query = `
      SELECT * FROM event_participants
      WHERE event_slug = $1
    `;
    const params = [eventSlug];

    if (eClean && nClean) {
      query += ` AND (LOWER(candidate_email) = $2 OR LOWER(candidate_name) = $3 OR LOWER(candidate_name) LIKE $4)`;
      params.push(eClean, nClean, `%${nClean}%`);
    } else if (eClean) {
      query += ` AND (LOWER(candidate_email) = $2 OR LOWER(candidate_name) = $2 OR LOWER(candidate_name) LIKE $3)`;
      params.push(eClean, `%${eClean}%`);
    } else if (nClean) {
      query += ` AND (LOWER(candidate_name) = $2 OR LOWER(candidate_name) LIKE $3 OR LOWER(candidate_email) = $2)`;
      params.push(nClean, `%${nClean}%`);
    } else {
      return null;
    }
    query += ` ORDER BY id ASC LIMIT 1;`;

    const res = await pgPool.query(query, params);
    return res.rows[0] || null;
  }

  if (supabaseClient) {
    const eClean = (email || '').trim().toLowerCase();
    const nClean = (name || '').trim().toLowerCase();

    if (eClean) {
      const { data } = await supabaseClient
        .from('event_participants')
        .select('*')
        .eq('event_slug', eventSlug)
        .ilike('candidate_email', eClean)
        .maybeSingle();
      if (data) return data;
    }

    if (nClean) {
      const { data } = await supabaseClient
        .from('event_participants')
        .select('*')
        .eq('event_slug', eventSlug)
        .ilike('candidate_name', nClean)
        .maybeSingle();
      if (data) return data;
    }
  }

  return null;
}

/**
 * Get issued certificate by email or name in Supabase
 */
async function getIssuedCertificateByEmailOrNameSupabase(email, name, eventSlug = 'orca-coders-orcathon-2026') {
  if (pgPool) {
    const eClean = (email || '').trim().toLowerCase();
    const nClean = (name || '').trim().toLowerCase();

    let query = `
      SELECT * FROM issued_certificates
      WHERE event_slug = $1
    `;
    const params = [eventSlug];

    if (eClean && nClean) {
      query += ` AND (LOWER(recipient_email) = $2 OR LOWER(recipient_name) = $3 OR LOWER(recipient_name) LIKE $4)`;
      params.push(eClean, nClean, `%${nClean}%`);
    } else if (eClean) {
      query += ` AND (LOWER(recipient_email) = $2 OR LOWER(recipient_name) = $2 OR LOWER(recipient_name) LIKE $3)`;
      params.push(eClean, `%${eClean}%`);
    } else if (nClean) {
      query += ` AND (LOWER(recipient_name) = $2 OR LOWER(recipient_name) LIKE $3 OR LOWER(recipient_email) = $2)`;
      params.push(nClean, `%${nClean}%`);
    } else {
      return null;
    }
    query += ` ORDER BY created_at DESC LIMIT 1;`;

    const res = await pgPool.query(query, params);
    return res.rows[0] || null;
  }

  return null;
}

/**
 * Get issued certificate by ID from Supabase
 */
async function getIssuedCertificateByIdSupabase(credentialId) {
  if (pgPool) {
    const res = await pgPool.query(
      'SELECT * FROM issued_certificates WHERE credential_id = $1 LIMIT 1;',
      [credentialId.trim()]
    );
    return res.rows[0] || null;
  }

  if (supabaseClient) {
    const { data } = await supabaseClient
      .from('issued_certificates')
      .select('*')
      .eq('credential_id', credentialId.trim())
      .maybeSingle();
    return data || null;
  }

  return null;
}

/**
 * Issue new certificate into Supabase
 */
async function issueCertificateSupabase({
  participantId,
  recipientName,
  recipientEmail,
  recipientOrganisation,
  eventSlug = 'orca-coders-orcathon-2026',
  certificateType = 'Participation',
  issueDate = 'October 25, 2026',
  status = 'Valid'
}) {
  const cleanEmail = recipientEmail.trim().toLowerCase();

  // Check existing
  const existing = await getIssuedCertificateByEmailOrNameSupabase(cleanEmail, recipientName, eventSlug);
  if (existing) return existing;

  const num = String(participantId || '1').padStart(4, '0');
  let hash = 0;
  const str = cleanEmail + '-' + num;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').slice(-4);
  const credentialId = `DH-ORCA-2026-${num}-${hex}`;

  if (pgPool) {
    const res = await pgPool.query(`
      INSERT INTO issued_certificates (
        credential_id, event_slug, participant_id, recipient_name,
        recipient_email, recipient_organisation, certificate_type, issue_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (credential_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `, [
      credentialId,
      eventSlug,
      String(participantId || ''),
      recipientName.trim(),
      cleanEmail,
      (recipientOrganisation || '').trim(),
      certificateType,
      issueDate,
      status
    ]);
    return res.rows[0];
  }

  return null;
}

module.exports = {
  supabase: supabaseClient,
  pgPool,
  isSupabaseConfigured,
  getSupabaseClient,
  getPgPool,
  checkSupabaseHealth,
  findParticipantByEmailOrNameSupabase,
  getIssuedCertificateByEmailOrNameSupabase,
  getIssuedCertificateByIdSupabase,
  issueCertificateSupabase
};
