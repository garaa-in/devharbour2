/**
 * Dev Harbour — Official Supabase Database Client & Integration Layer
 * Provides enterprise-grade PostgreSQL persistence with automatic fallback.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    console.log('⚡ Connected to Supabase backend:', SUPABASE_URL);
  } catch (err) {
    console.warn('⚠️ Could not initialize Supabase client:', err.message);
  }
} else {
  // Graceful local mode message
  // Set SUPABASE_URL and SUPABASE_ANON_KEY in .env to enable Supabase
}

function isSupabaseConfigured() {
  return Boolean(supabaseClient);
}

function getSupabaseClient() {
  return supabaseClient;
}

/**
 * Health check for Supabase connection
 */
async function checkSupabaseHealth() {
  if (!supabaseClient) {
    return { configured: false, status: 'unconfigured', message: 'Set SUPABASE_URL and SUPABASE_KEY in .env' };
  }
  try {
    const { data, error } = await supabaseClient.from('courses').select('id').limit(1);
    if (error) throw error;
    return { configured: true, status: 'healthy', message: 'Connected to Supabase PostgreSQL' };
  } catch (err) {
    return { configured: true, status: 'error', error: err.message };
  }
}

/**
 * Certificate Registry — Supabase queries
 */
async function findParticipantByEmailSupabase(email, eventSlug = 'orca-coders-orcathon-2026') {
  if (!supabaseClient) return null;
  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabaseClient
    .from('event_participants')
    .select('*')
    .eq('event_slug', eventSlug)
    .ilike('candidate_email', cleanEmail)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function getIssuedCertificateByEmailSupabase(email, eventSlug = 'orca-coders-orcathon-2026') {
  if (!supabaseClient) return null;
  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabaseClient
    .from('issued_certificates')
    .select('*')
    .eq('event_slug', eventSlug)
    .ilike('recipient_email', cleanEmail)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

async function getIssuedCertificateByIdSupabase(credentialId) {
  if (!supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from('issued_certificates')
    .select('*')
    .eq('credential_id', credentialId.trim())
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

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
  if (!supabaseClient) return null;
  const cleanEmail = recipientEmail.trim().toLowerCase();

  // 1. Check existing
  const existing = await getIssuedCertificateByEmailSupabase(cleanEmail, eventSlug);
  if (existing) return existing;

  // 2. Generate unique credential ID
  const num = String(participantId || '1').padStart(4, '0');
  let hash = 0;
  const str = cleanEmail + '-' + num;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').slice(-4);
  const credentialId = `DH-ORCA-2026-${num}-${hex}`;

  const { data, error } = await supabaseClient
    .from('issued_certificates')
    .insert({
      credential_id: credentialId,
      event_slug: eventSlug,
      participant_id: String(participantId || ''),
      recipient_name: recipientName.trim(),
      recipient_email: cleanEmail,
      recipient_organisation: (recipientOrganisation || '').trim(),
      certificate_type: certificateType,
      issue_date: issueDate,
      status: status
    })
    .select()
    .single();

  if (error) {
    console.error('[SUPABASE INSERT ERROR]:', error);
    throw error;
  }
  return data;
}

module.exports = {
  supabase: supabaseClient,
  isSupabaseConfigured,
  getSupabaseClient,
  checkSupabaseHealth,
  findParticipantByEmailSupabase,
  getIssuedCertificateByEmailSupabase,
  getIssuedCertificateByIdSupabase,
  issueCertificateSupabase
};
