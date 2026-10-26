/**
 * Dev Harbour — Official Certificate Issuance & Verification Routes
 * High-integrity credential registry for ORCA CODERS: ORCATHON 2026.
 */

const express = require('express');
const router = express.Router();
const {
  findParticipantByEmail,
  findParticipantByEmailAndName,
  getIssuedCertificateById,
  getIssuedCertificateByEmail,
  issueCertificate,
  countParticipants,
  countIssuedCertificates
} = require('../db');

/**
 * POST /api/certificates/claim
 * Validates participant registration against authoritative event registry and issues credential.
 * No OTP required as per official event design.
 */
router.post('/claim', (req, res) => {
  try {
    const { email, name, eventSlug = 'orca-coders-orcathon-2026' } = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Please enter your registered email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || '').trim();

    // 1. Check if already claimed and issued
    const existingCert = getIssuedCertificateByEmail(cleanEmail, eventSlug);
    if (existingCert) {
      return res.json({
        success: true,
        alreadyIssued: true,
        message: 'Certificate already issued for this participant.',
        credential: {
          credential_id: existingCert.credential_id,
          recipient_name: existingCert.recipient_name,
          recipient_email: existingCert.recipient_email,
          recipient_organisation: existingCert.recipient_organisation || 'Participant',
          event_name: 'ORCA CODERS: ORCATHON 2026',
          event_slug: existingCert.event_slug,
          certificate_type: existingCert.certificate_type,
          issue_date: existingCert.issue_date,
          status: existingCert.status,
          verification_url: `/certificate/verify/${existingCert.credential_id}`
        }
      });
    }

    // 2. Validate against participant database
    const participant = findParticipantByEmail(cleanEmail, eventSlug);
    if (!participant) {
      return res.status(404).json({
        error: `No registration found for "${cleanEmail}" in ORCATHON 2026. Please check for typos or use the email registered on Unstop.`
      });
    }

    if (!participant.is_eligible) {
      return res.status(403).json({
        error: 'This registration is marked as ineligible for certificate issuance.'
      });
    }

    // Determine canonical name: use clean registered name or provided name if provided
    const recipientName = participant.candidate_name || cleanName;
    const recipientOrg = participant.candidate_organisation || '';

    // 3. Issue new credential
    const newCert = issueCertificate({
      participantId: participant.id,
      recipientName,
      recipientEmail: cleanEmail,
      recipientOrganisation: recipientOrg,
      eventSlug,
      certificateType: 'Participation',
      issueDate: 'October 25, 2026'
    });

    return res.status(201).json({
      success: true,
      alreadyIssued: false,
      message: 'Certificate successfully verified and issued!',
      credential: {
        credential_id: newCert.credential_id,
        recipient_name: newCert.recipient_name,
        recipient_email: newCert.recipient_email,
        recipient_organisation: newCert.recipient_organisation,
        event_name: 'ORCA CODERS: ORCATHON 2026',
        event_slug: newCert.event_slug,
        certificate_type: newCert.certificate_type,
        issue_date: newCert.issue_date,
        status: newCert.status,
        verification_url: `/certificate/verify/${newCert.credential_id}`
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
 */
router.get('/verify/:credentialId', (req, res) => {
  try {
    const { credentialId } = req.params;
    if (!credentialId || !credentialId.trim()) {
      return res.status(400).json({ error: 'Valid credential ID is required.' });
    }

    const cert = getIssuedCertificateById(credentialId.trim());
    if (!cert) {
      return res.status(404).json({
        verified: false,
        error: `Credential ID "${credentialId}" was not found in the official Dev Harbour registry.`
      });
    }

    return res.json({
      verified: true,
      credential: {
        credential_id: cert.credential_id,
        recipient_name: cert.recipient_name,
        recipient_organisation: cert.recipient_organisation,
        event_name: 'ORCA CODERS: ORCATHON 2026',
        event_slug: cert.event_slug,
        certificate_type: cert.certificate_type,
        issue_date: cert.issue_date,
        status: cert.status,
        team_name: cert.team_name,
        created_at: cert.created_at
      }
    });
  } catch (err) {
    console.error('[CERTIFICATE VERIFY ERROR]:', err);
    return res.status(500).json({ error: 'Failed to verify credential.' });
  }
});

/**
 * GET /api/certificates/stats
 * Public registry overview statistics
 */
router.get('/stats', (req, res) => {
  try {
    const totalParticipants = countParticipants('orca-coders-orcathon-2026');
    const totalIssued = countIssuedCertificates('orca-coders-orcathon-2026');
    return res.json({
      event: 'ORCA CODERS: ORCATHON 2026',
      totalParticipants,
      totalIssued,
      status: 'Active'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve stats.' });
  }
});

module.exports = router;
