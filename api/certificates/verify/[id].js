// Vercel Serverless Function: GET /api/certificates/verify/:id
// Powered by Supabase PostgreSQL single source of truth

const db = require('../../../server/db');

function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  const prefix = user.slice(0, 2);
  const suffix = user.slice(-1);
  return `${prefix}${'*'.repeat(Math.max(2, user.length - 3))}${suffix}@${domain}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query || {};
  if (!id || !String(id).trim()) {
    return res.status(400).json({ error: 'Valid credential ID is required.' });
  }

  try {
    const cert = await db.getIssuedCertificateById(String(id).trim());

    if (!cert) {
      return res.status(404).json({
        error: `Credential ID "${id}" was not found in the authoritative registry.`,
        verified: false
      });
    }

    return res.json({
      verified: true,
      database: 'Supabase PostgreSQL',
      credential: {
        credential_id: cert.credential_id,
        recipient_name: cert.recipient_name,
        recipient_email: maskEmail(cert.recipient_email),
        recipient_organisation: cert.recipient_organisation || 'Participant',
        event_name: 'ORCA CODERS: ORCATHON 2026',
        event_slug: cert.event_slug,
        certificate_type: cert.certificate_type,
        issue_date: cert.issue_date,
        status: cert.status,
        issued_at: cert.created_at
      }
    });
  } catch (err) {
    console.error('[VERIFY ERROR]:', err);
    return res.status(500).json({
      error: 'Verification service error: ' + (err.message || 'database error'),
      hasDbUrl: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DIRECT_URL)
    });
  }
};
