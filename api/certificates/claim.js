// Vercel Serverless Function: POST /api/certificates/claim
const participants = require('../../server/data/orcathon_participants.json');

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

module.exports = (req, res) => {
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

  // Authoritative search
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
