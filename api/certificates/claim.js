// Vercel Serverless Function: POST /api/certificates/claim
// Powered by Supabase PostgreSQL with local server-side fallback

const participants = require('../../server/data/orcathon_participants.json');
const {
  isSupabaseConfigured,
  findParticipantByEmailOrNameSupabase,
  getIssuedCertificateByEmailOrNameSupabase,
  issueCertificateSupabase
} = require('../../server/supabase');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, name } = req.body || {};
  const eClean = (email || '').trim().toLowerCase();
  const nClean = (name || '').trim().toLowerCase();

  if (!eClean && !nClean) {
    return res.status(400).json({ error: 'Please enter your registered email address or name.' });
  }

  // 1. Try Supabase PostgreSQL first
  if (isSupabaseConfigured()) {
    try {
      // Check existing certificate in Supabase
      const existing = await getIssuedCertificateByEmailOrNameSupabase(eClean, nClean);
      if (existing) {
        return res.json({
          success: true,
          database: 'Supabase PostgreSQL',
          message: 'Certificate successfully verified and retrieved!',
          credential: {
            credential_id: existing.credential_id,
            recipient_name: existing.recipient_name,
            recipient_email: existing.recipient_email,
            recipient_organisation: existing.recipient_organisation || 'Participant',
            event_name: 'ORCA CODERS: ORCATHON 2026',
            event_slug: existing.event_slug,
            certificate_type: existing.certificate_type,
            issue_date: existing.issue_date,
            status: existing.status,
            team_name: existing.team_name || '',
            verification_url: `/certificate/verify/${existing.credential_id}`
          }
        });
      }

      // Check participant in Supabase
      const participant = await findParticipantByEmailOrNameSupabase(eClean, nClean);
      if (participant) {
        const newCert = await issueCertificateSupabase({
          participantId: participant.id,
          recipientName: participant.candidate_name,
          recipientEmail: participant.candidate_email,
          recipientOrganisation: participant.candidate_organisation,
          eventSlug: participant.event_slug,
          certificateType: 'Participation',
          issueDate: 'October 25, 2026'
        });

        return res.json({
          success: true,
          database: 'Supabase PostgreSQL',
          message: 'Certificate successfully verified and issued!',
          credential: {
            credential_id: newCert.credential_id,
            recipient_name: newCert.recipient_name,
            recipient_email: newCert.recipient_email,
            recipient_organisation: newCert.recipient_organisation || 'Participant',
            event_name: 'ORCA CODERS: ORCATHON 2026',
            event_slug: newCert.event_slug,
            certificate_type: newCert.certificate_type,
            issue_date: newCert.issue_date,
            status: newCert.status,
            team_name: participant.team_name || '',
            verification_url: `/certificate/verify/${newCert.credential_id}`
          }
        });
      }
    } catch (err) {
      console.warn('[SUPABASE SERVERLESS CLAIM ERROR]:', err.message);
    }
  }

  // 2. Authoritative JSON search fallback
  let found = null;
  if (eClean) {
    found = participants.find(p => p.email && p.email.toLowerCase() === eClean);
  }
  if (!found && nClean) {
    found = participants.find(p => p.name && p.name.toLowerCase() === nClean);
  }
  if (!found && eClean) {
    found = participants.find(p => p.name && p.name.toLowerCase() === eClean);
  }
  if (!found && nClean) {
    found = participants.find(p => p.email && p.email.toLowerCase() === nClean);
  }
  if (!found && nClean && nClean.length >= 4) {
    found = participants.find(p => p.name && p.name.toLowerCase().includes(nClean));
  }
  if (!found && eClean && !eClean.includes('@') && eClean.length >= 4) {
    found = participants.find(p => p.name && p.name.toLowerCase().includes(eClean));
  }

  if (!found) {
    return res.status(404).json({
      error: `No registration found for "${email || name}" in Orcathon 2026. Please check for typos or enter the email you registered with on Unstop.`
    });
  }

  const credId = generateCredentialId(found.id, found.email);
  return res.json({
    success: true,
    message: 'Certificate successfully verified and issued!',
    credential: {
      credential_id: credId,
      recipient_name: found.name,
      recipient_email: found.email,
      recipient_organisation: found.org || 'Participant',
      event_name: 'ORCA CODERS: ORCATHON 2026',
      event_slug: 'orca-coders-orcathon-2026',
      certificate_type: 'Participation',
      issue_date: 'October 25, 2026',
      status: 'Verified & Authentic',
      team_name: found.team || '',
      verification_url: `/certificate/verify/${credId}`
    }
  });
};
