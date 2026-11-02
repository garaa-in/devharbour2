// Vercel Serverless Function: GET /api/certificates/stats
// Powered by Supabase PostgreSQL single source of truth
const db = require('../../server/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const eventSlug = (req.query && req.query.eventSlug) || 'orca-coders-orcathon-2026';
    const [participantsCount, issuedCount] = await Promise.all([
      db.countParticipants(eventSlug),
      db.countIssuedCertificates(eventSlug)
    ]);

    return res.json({
      event: 'ORCA CODERS: ORCATHON 2026',
      event_slug: eventSlug,
      totalParticipants: participantsCount,
      total_eligible_participants: participantsCount,
      total_issued_certificates: issuedCount,
      registry_status: 'Active',
      database: 'Supabase PostgreSQL'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve certificate registry stats.' });
  }
};
