/**
 * Dev Harbour — Official Certificate Issuance & Verification Routes
 * High-integrity credential registry for ORCA CODERS: ORCATHON 2026.
 * Powered by canonical Supabase PostgreSQL database.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const db = require('../db');
const { requireAuth } = require('../auth');
const { rateLimit } = require('../rate-limiter');

/**
 * Mask email address to protect participant privacy in public endpoints
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '';
  const [user, domain] = email.split('@');
  if (user.length <= 2) return `${user[0]}*@${domain}`;
  const prefix = user.slice(0, 2);
  const suffix = user.slice(-1);
  return `${prefix}${'*'.repeat(Math.max(2, user.length - 3))}${suffix}@${domain}`;
}

/**
 * GET /api/certificates/my-certificates
 * Authenticated user endpoint to view all credentials registered to their verified email.
 * Requires NO additional OTP once email verification is complete.
 */
router.get('/my-certificates', requireAuth, async (req, res) => {
  try {
    const userEmail = req.user.email.toLowerCase();
    const certs = await db.getUserCertificates(userEmail);

    return res.json({
      success: true,
      database: 'Supabase PostgreSQL',
      userEmail,
      count: (certs || []).length,
      certificates: (certs || []).map(c => ({
        credential_id: c.credential_id,
        recipient_name: c.recipient_name,
        recipient_email: c.recipient_email,
        recipient_organisation: c.recipient_organisation || 'Participant',
        event_name: 'ORCA CODERS: ORCATHON 2026',
        event_slug: c.event_slug,
        certificate_type: c.certificate_type,
        issue_date: c.issue_date,
        status: c.status,
        team_name: c.team_name || '',
        verification_url: `/certificate/verify/${c.credential_id}`,
        download_url: `/api/certificates/download/${c.credential_id}`
      }))
    });
  } catch (err) {
    console.error('[MY CERTIFICATES ERROR]:', err);
    return res.status(500).json({ error: 'Failed to retrieve your certificates.' });
  }
});

/**
 * GET /api/certificates/download/:credentialId
 * Authenticated download endpoint with ownership enforcement.
 * Users can only download their own certificates without any additional OTP.
 */
router.get('/download/:credentialId', requireAuth, async (req, res) => {
  try {
    const { credentialId } = req.params;
    if (!credentialId || !credentialId.trim()) {
      return res.status(400).json({ error: 'Valid credential ID is required.' });
    }

    const cert = await db.getIssuedCertificateById(credentialId.trim());
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found in registry.' });
    }

    // Ownership Enforcement: User must own the certificate or be an admin
    const certEmail = (cert.recipient_email || '').toLowerCase().trim();
    const userEmail = (req.user.email || '').toLowerCase().trim();
    if (req.user.role !== 'admin' && certEmail !== userEmail) {
      return res.status(403).json({
        error: 'Access denied: You do not have permission to download this certificate.'
      });
    }

    return res.json({
      success: true,
      database: 'Supabase PostgreSQL',
      message: 'Certificate access authorized without additional OTP.',
      credential: {
        credential_id: cert.credential_id,
        recipient_name: cert.recipient_name,
        recipient_email: cert.recipient_email,
        recipient_organisation: cert.recipient_organisation || 'Participant',
        event_name: 'ORCA CODERS: ORCATHON 2026',
        event_slug: cert.event_slug,
        certificate_type: cert.certificate_type,
        issue_date: cert.issue_date,
        status: cert.status,
        verification_url: `/certificate/verify/${cert.credential_id}`
      }
    });
  } catch (err) {
    console.error('[CERTIFICATE DOWNLOAD ERROR]:', err);
    return res.status(500).json({ error: 'Failed to authorize certificate download.' });
  }
});

/**
 * POST /api/certificates/claim
 * Validates participant registration against authoritative event registry and issues/retrieves credential.
 * Supports lookup by email, candidate name, or both via Supabase PostgreSQL.
 * If authenticated, automatically matches verified user account without requiring any OTP.
 */
router.post('/claim', rateLimit({ windowMs: 60000, max: 30 }), async (req, res) => {
  try {
    let { email, name, eventSlug = 'orca-coders-orcathon-2026' } = req.body || {};

    // Auto-populate from authenticated user if present
    if (req.user) {
      email = email || req.user.email;
      name = name || req.user.full_name || req.user.username;
    }

    let cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    // Prevent authenticated user from claiming another user's certificate
    if (req.user && req.user.role !== 'admin' && cleanEmail && cleanEmail !== req.user.email.toLowerCase()) {
      return res.status(403).json({
        error: 'Access denied: You may only claim certificates associated with your verified account email.'
      });
    }

    if (!cleanEmail && !cleanName) {
      return res.status(400).json({ error: 'Please enter your registered email address or name.' });
    }

    // 1. Check if credential already exists
    let existingCert = await db.getIssuedCertificateByEmailOrName(cleanEmail, cleanName, eventSlug);

    if (existingCert) {
      const isOwner = req.user ? req.user.email.toLowerCase() === (existingCert.recipient_email || '').toLowerCase() : false;
      const safeEmail = (cleanEmail || isOwner) ? existingCert.recipient_email : maskEmail(existingCert.recipient_email);
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
          verification_url: `/certificate/verify/${existingCert.credential_id}`,
          download_url: `/api/certificates/download/${existingCert.credential_id}`
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

    // Determine canonical name and email
    const recipientName = participant.candidate_name || cleanName;
    const recipientOrg = participant.candidate_organisation || '';
    const recipientEmail = participant.candidate_email || cleanEmail;

    // 3. Issue new credential
    const newCert = await db.issueCertificate({
      participantId: participant.id,
      recipientName,
      recipientEmail,
      recipientOrganisation: recipientOrg,
      eventSlug,
      certificateType: 'Participation',
      issueDate: 'October 25, 2026'
    });

    const isOwner = req.user ? req.user.email.toLowerCase() === (newCert.recipient_email || recipientEmail).toLowerCase() : false;
    const safeNewEmail = (cleanEmail || isOwner) ? (newCert.recipient_email || recipientEmail) : maskEmail(newCert.recipient_email || recipientEmail);

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
        verification_url: `/certificate/verify/${newCert.credential_id}`,
        download_url: `/api/certificates/download/${newCert.credential_id}`
      }
    });
  } catch (err) {
    console.error('[CERTIFICATE CLAIM ERROR]:', err);
    return res.status(500).json({ error: 'Failed to process certificate claim. Please try again.' });
  }
});

/**
 * GET /api/certificates/verify/:credentialId
 * Public verification endpoint to authenticate any issued credential.
 * Automatically masks email to prevent harvesting attacks.
 */
router.get('/verify/:credentialId', rateLimit({ windowMs: 60000, max: 60 }), async (req, res) => {
  try {
    const { credentialId } = req.params;
    if (!credentialId || !credentialId.trim()) {
      return res.status(400).json({ error: 'Valid credential ID is required.' });
    }

    const cert = await db.getIssuedCertificateById(credentialId.trim());

    if (!cert) {
      return res.status(404).json({
        error: `Credential ID "${credentialId}" was not found in the authoritative registry.`,
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
    console.error('[CERTIFICATE VERIFICATION ERROR]:', err);
    return res.status(500).json({ error: 'Verification service temporarily unavailable.' });
  }
});

/**
 * GET /api/certificates/stats
 * Public registry overview endpoint for participants and certificates count.
 */
router.get('/stats', async (req, res) => {
  try {
    const eventSlug = req.query.eventSlug || 'orca-coders-orcathon-2026';
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
    console.error('[CERTIFICATES STATS ERROR]:', err);
    return res.status(500).json({ error: 'Failed to retrieve certificate registry stats.' });
  }
});

module.exports = router;
