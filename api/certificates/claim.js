// Vercel Serverless Function: POST /api/certificates/claim
// Powered by Supabase PostgreSQL single source of truth

const db = require('../../server/db');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, name, eventSlug = 'orca-coders-orcathon-2026' } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanEmail && !cleanName) {
      return res.status(400).json({ error: 'Please enter your registered email address or name.' });
    }

    // 1. Check if credential already exists in Supabase
    let existingCert = await db.getIssuedCertificateByEmailOrName(cleanEmail, cleanName, eventSlug);

    if (existingCert) {
      const safeEmail = cleanEmail ? existingCert.recipient_email : maskEmail(existingCert.recipient_email);
      return res.json({
        success: true,
        alreadyIssued: true,
        database: 'Supabase PostgreSQL',
        message: 'Certificate successfully verified and retrieved!',
        credential: {
          credential_id: existingCert.credential_id,
          recipient_name: existingCert.recipient_name,
          recipient_email: safeEmail,
          recipient_organisation: existingCert.recipient_organisation || 'Participant',
          event_name: 'ORCA CODERS: ORCATHON 2026',
          event_slug: existingCert.event_slug,
          certificate_type: existingCert.certificate_type,
          issue_date: existingCert.issue_date,
          status: existingCert.status,
          team_name: existingCert.team_name || '',
          verification_url: `/certificate/verify/${existingCert.credential_id}`
        }
      });
    }

    // 2. Validate against participant database
    const participant = await db.findParticipantByEmailOrName(cleanEmail, cleanName, eventSlug);

    if (!participant) {
      return res.status(404).json({
        error: `No registration found for "${email || name}" in ORCATHON 2026. Please check for typos or enter the email or name registered on Unstop.`
      });
    }

    if (participant.is_eligible === false || participant.is_eligible === 0) {
      return res.status(403).json({
        error: 'This registration is marked as ineligible for certificate issuance.'
      });
    }

    // Determine canonical recipient details
    const recipientName = participant.candidate_name || cleanName;
    const recipientOrg = participant.candidate_organisation || '';
    const recipientEmail = participant.candidate_email || cleanEmail;

    // 3. Issue new credential directly in Supabase
    const newCert = await db.issueCertificate({
      participantId: participant.id,
      recipientName,
      recipientEmail,
      recipientOrganisation: recipientOrg,
      eventSlug,
      certificateType: 'Participation',
      issueDate: 'October 25, 2026'
    });

    const safeNewEmail = cleanEmail ? (newCert.recipient_email || recipientEmail) : maskEmail(newCert.recipient_email || recipientEmail);

    return res.status(201).json({
      success: true,
      alreadyIssued: false,
      database: 'Supabase PostgreSQL',
      message: 'Certificate successfully verified and issued!',
      credential: {
        credential_id: newCert.credential_id,
        recipient_name: newCert.recipient_name,
        recipient_email: safeNewEmail,
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to process certificate claim.' });
  }
};
