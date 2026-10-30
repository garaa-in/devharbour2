// Vercel Serverless Function: GET /api/certificates/verify/:id
// Powered by Supabase PostgreSQL with local server-side fallback

const participants = require('../../../server/data/orcathon_participants.json');
const {
  isSupabaseConfigured,
  getIssuedCertificateByIdSupabase
} = require('../../../server/supabase');

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query || {};
  if (!id) {
    return res.status(400).json({ error: 'Valid credential ID is required.' });
  }

  // 1. Try Supabase verification
  if (isSupabaseConfigured()) {
    try {
      const cert = await getIssuedCertificateByIdSupabase(id);
      if (cert) {
        return res.json({
          verified: true,
          database: 'Supabase PostgreSQL',
          credential: {
            credential_id: cert.credential_id,
            recipient_name: cert.recipient_name,
            recipient_organisation: cert.recipient_organisation || 'Participant',
            event_name: 'ORCA CODERS: ORCATHON 2026',
            event_slug: cert.event_slug,
            certificate_type: cert.certificate_type,
            issue_date: cert.issue_date,
            status: cert.status,
            team_name: cert.team_name || '',
            created_at: cert.created_at
          }
        });
      }
    } catch (err) {
      console.warn('[SUPABASE SERVERLESS VERIFY ERROR]:', err.message);
    }
  }

  // 2. Authoritative JSON verification fallback
  const idMatch = id.match(/DH-ORCA-2026-(\d+)/i) || id.match(/(\d+)/);
  let found = null;
  if (idMatch) {
    const numericId = String(parseInt(idMatch[1], 10));
    found = participants.find(p => String(p.id) === numericId);
  }

  if (!found) {
    return res.status(404).json({
      verified: false,
      error: `Credential ID "${id}" was not found in the official Dev Harbour registry.`
    });
  }

  const credId = generateCredentialId(found.id, found.email);
  return res.json({
    verified: true,
    credential: {
      credential_id: credId,
      recipient_name: found.name,
      recipient_organisation: found.org || 'Participant',
      event_name: 'ORCA CODERS: ORCATHON 2026',
      event_slug: 'orca-coders-orcathon-2026',
      certificate_type: 'Participation',
      issue_date: 'October 25, 2026',
      status: 'Verified & Authentic',
      team_name: found.team || '',
      created_at: '2026-10-25T18:00:00Z'
    }
  });
};
