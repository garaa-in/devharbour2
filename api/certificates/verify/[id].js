// Vercel Serverless Function: GET /api/certificates/verify/:id
const participants = require('../../../server/data/orcathon_participants.json');

module.exports = (req, res) => {
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

  // ID format: DH-ORCA-2026-0001
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

  const credId = 'DH-ORCA-2026-' + String(found.id).padStart(4, '0');
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
