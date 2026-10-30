/**
 * Dev Harbour — Official Certificate Issuance & Verification Routes
 * High-integrity credential registry for ORCA CODERS: ORCATHON 2026.
 * Powered by Supabase PostgreSQL with automatic SQLite fallback.
 */

const express = require('express');
const router = express.Router();
const {
  findParticipantByEmail,
  findParticipantByEmailAndName,
  findParticipantByEmailOrName,
  getIssuedCertificateById,
  getIssuedCertificateByEmail,
  getIssuedCertificateByEmailOrName,
  issueCertificate,
  countParticipants,
  countIssuedCertificates
} = require('../db');

const {
  isSupabaseConfigured,
  findParticipantByEmailOrNameSupabase,
  getIssuedCertificateByEmailOrNameSupabase,
  getIssuedCertificateByIdSupabase,
  issueCertificateSupabase
} = require('../supabase');

/**
 * POST /api/certificates/claim
 * Validates participant registration against authoritative event registry and issues/retrieves credential.
 * Supports lookup by email, candidate name, or both via Supabase PostgreSQL or local SQLite.
 */
router.post('/claim', async (req, res) => {
  try {
    const { email, name, eventSlug = 'orca-coders-orcathon-2026' } = req.body || {};

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanEmail && !cleanName) {
      return res.status(400).json({ error: 'Please enter your registered email address or name.' });
    }

    // 1. Check if credential already exists
    let existingCert = null;
    if (isSupabaseConfigured()) {
      try {
        existingCert = await getIssuedCertificateByEmailOrNameSupabase(cleanEmail, cleanName, eventSlug);
      } catch (err) {
        console.warn('[SUPABASE CLAIM CHECK WARNING]:', err.message);
      }
    }
    if (!existingCert) {
      existingCert = getIssuedCertificateByEmailOrName(cleanEmail, cleanName, eventSlug);
    }

    if (existingCert) {
      return res.json({
        success: true,
        alreadyIssued: true,
        database: isSupabaseConfigured() ? 'Supabase PostgreSQL' : 'Local SQLite',
        message: 'Certificate successfully verified and retrieved!',
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
          team_name: existingCert.team_name || '',
          verification_url: `/certificate/verify/${existingCert.credential_id}`
        }
      });
    }

    // 2. Validate against participant database
    let participant = null;
    if (isSupabaseConfigured()) {
      try {
        participant = await findParticipantByEmailOrNameSupabase(cleanEmail, cleanName, eventSlug);
      } catch (err) {
        console.warn('[SUPABASE PARTICIPANT SEARCH WARNING]:', err.message);
      }
    }
    if (!participant) {
      participant = findParticipantByEmailOrName(cleanEmail, cleanName, eventSlug);
    }

    if (!participant) {
      return res.status(404).json({
        error: `No registration found for "${email || name}" in ORCATHON 2026. Please check for typos or enter the email or name registered on Unstop.`
      });
    }

    if (participant.is_eligible === false) {
      return res.status(403).json({
        error: 'This registration is marked as ineligible for certificate issuance.'
      });
    }

    // Determine canonical name and email
    const recipientName = participant.candidate_name || cleanName;
    const recipientOrg = participant.candidate_organisation || '';
    const recipientEmail = participant.candidate_email || cleanEmail;

    // 3. Issue new credential
    let newCert = null;
    if (isSupabaseConfigured()) {
      try {
        newCert = await issueCertificateSupabase({
          participantId: participant.id,
          recipientName,
          recipientEmail,
          recipientOrganisation: recipientOrg,
          eventSlug,
          certificateType: 'Participation',
          issueDate: 'October 25, 2026'
        });
      } catch (err) {
        console.warn('[SUPABASE ISSUE WARNING]:', err.message);
      }
    }
    if (!newCert) {
      newCert = issueCertificate({
        participantId: participant.id,
        recipientName,
        recipientEmail,
        recipientOrganisation: recipientOrg,
        eventSlug,
        certificateType: 'Participation',
        issueDate: 'October 25, 2026'
      });
    }

    return res.status(201).json({
      success: true,
      alreadyIssued: false,
      database: isSupabaseConfigured() ? 'Supabase PostgreSQL' : 'Local SQLite',
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
  } catch (err) {
    console.error('[CERTIFICATE CLAIM ERROR]:', err);
    return res.status(500).json({ error: 'Failed to process certificate claim. Please try again.' });
  }
});

/**
 * GET /api/certificates/verify/:credentialId
 * Public verification endpoint to authenticate any issued credential.
 */
router.get('/verify/:credentialId', async (req, res) => {
  try {
    const { credentialId } = req.params;
    if (!credentialId || !credentialId.trim()) {
      return res.status(400).json({ error: 'Valid credential ID is required.' });
    }

    let cert = null;
    if (isSupabaseConfigured()) {
      try {
        cert = await getIssuedCertificateByIdSupabase(credentialId.trim());
      } catch (err) {
        console.warn('[SUPABASE VERIFY WARNING]:', err.message);
      }
    }
    if (!cert) {
      cert = getIssuedCertificateById(credentialId.trim());
    }

    if (!cert) {
      return res.status(404).json({
        verified: false,
        error: `Credential ID "${credentialId}" was not found in the official Dev Harbour registry.`
      });
    }

    return res.json({
      verified: true,
      database: isSupabaseConfigured() ? 'Supabase PostgreSQL' : 'Local SQLite',
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
      status: 'Active',
      database: isSupabaseConfigured() ? 'Supabase PostgreSQL (Connected)' : 'Local SQLite'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve stats.' });
  }
});

module.exports = router;
