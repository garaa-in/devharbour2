// Vercel Serverless Function: GET /api/certificates/stats
const participants = require('../../server/data/orcathon_participants.json');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return res.json({
    event: 'ORCA CODERS: ORCATHON 2026',
    totalParticipants: participants.length,
    totalIssued: 693,
    status: 'Active'
  });
};
