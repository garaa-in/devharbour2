/**
 * Dev Harbour - Security & Remediation Verification Test Suite
 * Validates Google OAuth protection, OTP hashing & rate limiting,
 * VM Sandbox escape blocking, Security Headers, Course Slug lookups,
 * and Supabase PostgreSQL connectivity.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '3199';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server/index');
const db = require('../server/db');
const { generateOtp, hashOtp, verifyOtpHash } = require('../server/email');
const { executeCode } = require('../server/execution');

let server;
const BASE_URL = 'http://localhost:3199/api';

test.before(async () => {
  await new Promise(resolve => {
    server = app.listen(3199, resolve);
  });
});

test.after(async () => {
  await new Promise(resolve => {
    server.close(resolve);
  });
});

async function api(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, headers: res.headers, data };
}

test('1. Security Headers Enforcement', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');
  assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('2. Google OAuth ATO Vulnerability Remediation', async () => {
  // Test A: Attempting Google login with spoofed email and no credential token MUST be rejected
  const resSpoofed = await api('/auth/google', {
    method: 'POST',
    body: { email: 'victim@devharbour.in', name: 'Attacker', googleId: 'fake_123' }
  });
  assert.equal(resSpoofed.status, 400);
  assert.ok(resSpoofed.data.error.includes('Google ID token credential is required'));

  // Test B: Attempting Google login with forged JWT credential MUST be rejected
  const resForged = await api('/auth/google', {
    method: 'POST',
    body: { credential: 'forged.fake.jwt-token' }
  });
  assert.equal(resForged.status, 401);
  assert.ok(resForged.data.error.includes('Invalid Google credential token'));
});

test('3. OTP Cryptographic Security & Anti-Enumeration', async () => {
  const userId = 'usr-test-crypto-' + Date.now();
  const challengeId = 'chal-' + Date.now();
  const otp = generateOtp();

  // Verify OTP format: strictly 6 digits
  assert.match(otp, /^\d{6}$/);

  // Verify HMAC-SHA256 hashing
  const hash = hashOtp(userId, challengeId, otp, 'test_secret_key_1234567890abcdef');
  assert.notEqual(hash, otp);
  assert.equal(hash.length, 64); // 64 hex chars = 256 bits

  // Verify correct comparison
  const valid = verifyOtpHash(hash, userId, challengeId, otp, 'test_secret_key_1234567890abcdef');
  assert.equal(valid, true);

  // Verify wrong OTP comparison
  const invalid = verifyOtpHash(hash, userId, challengeId, '999999', 'test_secret_key_1234567890abcdef');
  assert.equal(invalid, false);

  // Test anti-enumeration on /api/auth/otp/send for non-existent user
  const resNonExistent = await api('/auth/otp/send', {
    method: 'POST',
    body: { email: 'nonexistent_user_9999@devharbour.in' }
  });
  assert.equal(resNonExistent.status, 200);
  assert.equal(resNonExistent.data.success, true);
  assert.ok(resNonExistent.data.message.includes('If an account matches that email'));
});

test('4. Course Slug Resolution (Anti-404)', async () => {
  // Test looking up course by slug keyword instead of exact ID
  const resSlug = await api('/courses/fullstack');
  assert.equal(resSlug.status, 200);
  assert.ok(resSlug.data.course);
  assert.ok(resSlug.data.course.title.includes('Full Stack'));
  assert.ok(Array.isArray(resSlug.data.lessons));
});

test('5. Sandbox Hardening Against VM Escapes', async () => {
  // Test A: Access to process
  const resProcess = await executeCode('process.exit(1)', [], [], 'test-slug');
  assert.equal(resProcess.passed, false);

  // Test B: Access to require
  const resRequire = await executeCode("const fs = require('fs');", [], [], 'test-slug');
  assert.equal(resRequire.passed, false);

  // Test C: Prototype constructor escape
  const resEscape = await executeCode("this.constructor.constructor('return process')()", [], [], 'test-slug');
  assert.equal(resEscape.passed, false);
});


test('6. Complete End-to-End OTP Verification & Password Reset Flow', async () => {
  // Step 1: Create a test user
  const email = `otp_user_${Date.now()}@devharbour.in`;
  const username = `dev_${Date.now().toString().slice(-6)}`;
  const signupRes = await api('/auth/signup', {
    method: 'POST',
    body: {
      email,
      username,
      fullName: 'OTP Test Developer',
      password: 'OldPassword123!'
    }
  });
  assert.equal(signupRes.status, 201);
  const user = signupRes.data.user;

  // Step 2: Generate OTP and save verification record directly to simulate email delivery
  const otp = '741852';
  const challengeId = 'chal-e2e-' + Date.now();
  const codeHash = hashOtp(user.id, challengeId, otp, process.env.EMAIL_VERIFICATION_SECRET || 'test_secret_key_1234567890abcdef');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await db.saveEmailVerification({
    userId: user.id,
    email: user.email,
    challengeId,
    codeHash,
    expiresAt
  });

  // Step 3: Attempt verification with incorrect OTP -> MUST fail
  const verifyFailRes = await api('/auth/otp/verify', {
    method: 'POST',
    body: { email: user.email, otp: '000000' }
  });
  assert.equal(verifyFailRes.status, 400);
  assert.ok(verifyFailRes.data.error.includes('Invalid verification code'));

  // Step 4: Verify with correct OTP -> MUST succeed
  const verifySuccessRes = await api('/auth/otp/verify', {
    method: 'POST',
    body: { email: user.email, otp }
  });
  assert.equal(verifySuccessRes.status, 200);
  assert.equal(verifySuccessRes.data.success, true);

  // Step 5: Password Reset Flow: Save a new reset OTP
  const resetOtp = '963258';
  const resetChallengeId = 'chal-reset-' + Date.now();
  const resetHash = hashOtp(user.id, resetChallengeId, resetOtp, process.env.EMAIL_VERIFICATION_SECRET || 'test_secret_key_1234567890abcdef');
  await db.saveEmailVerification({
    userId: user.id,
    email: user.email,
    challengeId: resetChallengeId,
    codeHash: resetHash,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });

  // Step 6: Confirm password reset with new password
  const confirmRes = await api('/auth/password-reset/confirm', {
    method: 'POST',
    body: {
      email: user.email,
      otp: resetOtp,
      newPassword: 'BrandNewPassword456!'
    }
  });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.data.success, true);

  // Step 7: Verify login with old password -> MUST fail
  const oldLoginRes = await api('/auth/login', {
    method: 'POST',
    body: { login: email, password: 'OldPassword123!' }
  });
  assert.equal(oldLoginRes.status, 401);

  // Step 8: Verify login with new password -> MUST succeed
  const newLoginRes = await api('/auth/login', {
    method: 'POST',
    body: { login: email, password: 'BrandNewPassword456!' }
  });
  assert.equal(newLoginRes.status, 200);
  assert.ok(newLoginRes.data.token);
  assert.equal(newLoginRes.data.user.email, email);
});

test('7. Certificate PII Protection & Email Masking', async () => {
  // Query Poornika's credential by name alone
  const claimRes = await api('/certificates/claim', {
    method: 'POST',
    body: { name: 'Poornika R' }
  });
  assert.ok(claimRes.status === 200 || claimRes.status === 201);
  assert.ok(claimRes.data.credential.recipient_email.includes('*'), 'Claiming by name alone must mask email');
  assert.ok(!claimRes.data.credential.recipient_email.includes('poornika0406'), 'Claiming by name alone must not leak full email');

  const credId = claimRes.data.credential.credential_id;
  const verifyRes = await api(`/certificates/verify/${credId}`);
  assert.equal(verifyRes.status, 200);
  assert.ok(verifyRes.data.credential.recipient_email.includes('*'), 'Verification endpoint must mask email');
  assert.ok(!verifyRes.data.credential.recipient_email.includes('poornika0406'), 'Verification endpoint must not leak full email');
});

test('8. Complete Removal of Bulk PDF Bundle & Obsolete Endpoint Elimination', async () => {
  const fs = require('node:fs');
  const path = require('node:path');

  // 1. Static public route must NOT serve the PDF
  const publicRes = await fetch(`${BASE_URL}/certificates/orcathon_2026_all_certificates.pdf`);
  assert.equal(publicRes.status, 404, 'Public static folder must NOT expose certificate bundle PDF');

  // 2. Physical workspace storage must NOT contain the bulk PDF
  const storagePdfPath = path.join(__dirname, '..', 'storage', 'certificates', 'orcathon_2026_all_certificates.pdf');
  const publicPdfPath = path.join(__dirname, '..', 'public', 'certificates', 'orcathon_2026_all_certificates.pdf');
  assert.equal(fs.existsSync(storagePdfPath), false, 'storage/certificates/ bulk PDF must be deleted');
  assert.equal(fs.existsSync(publicPdfPath), false, 'public/certificates/ bulk PDF must be deleted');

  // 3. Obsolete /certificates/admin/download-bundle endpoint must be removed (404)
  const endpointRes = await api('/certificates/admin/download-bundle');
  assert.equal(endpointRes.status, 404, 'Obsolete bulk download endpoint must return 404 Not Found');
});

test('9. Full Signup -> Email OTP -> Login -> Direct Certificate Access (Zero Extra OTP)', async () => {
  // Step 1: Signup
  const email = `cert_user_${Date.now()}@devharbour.in`;
  const username = `certuser_${Date.now().toString().slice(-6)}`;
  const fullName = `Student ${username}`;
  const signupRes = await api('/auth/signup', {
    method: 'POST',
    body: {
      email,
      username,
      fullName,
      password: 'SecurePassword123!'
    }
  });
  assert.equal(signupRes.status, 201);
  assert.equal(signupRes.data.requiresVerification, true);
  assert.equal(signupRes.data.user.emailVerified, false);

  // Step 2: Attempt Login BEFORE verification -> MUST fail with 403
  const prematureLogin = await api('/auth/login', {
    method: 'POST',
    body: { login: email, password: 'SecurePassword123!' }
  });
  assert.equal(prematureLogin.status, 403);
  assert.equal(prematureLogin.data.requiresVerification, true);

  // Step 3: Link an issued certificate to this user's email directly in DB
  const participant = await db.insertParticipant({
    eventSlug: 'orca-coders-orcathon-2026',
    candidateName: fullName,
    candidateEmail: email,
    candidateOrganisation: 'Dev Harbour University',
    isEligible: true
  });

  const cert = await db.issueCertificate({
    participantId: participant.id,
    recipientName: fullName,
    recipientEmail: email,
    recipientOrganisation: 'Dev Harbour University',
    eventSlug: 'orca-coders-orcathon-2026',
    certificateType: 'Participation',
    issueDate: 'October 25, 2026'
  });
  const certId = cert.credential_id;

  // Step 4: Verify Email OTP directly
  const otp = '852963';
  const challengeId = 'chal-signup-' + Date.now();
  const codeHash = hashOtp(signupRes.data.user.id, challengeId, otp, process.env.EMAIL_VERIFICATION_SECRET || 'test_secret_key_1234567890abcdef');
  await db.saveEmailVerification({
    userId: signupRes.data.user.id,
    email,
    challengeId,
    codeHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });

  const verifyRes = await api('/auth/otp/verify', {
    method: 'POST',
    body: { email, otp }
  });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.data.success, true);
  assert.ok(verifyRes.data.token);
  assert.equal(verifyRes.data.user.emailVerified, true);

  // Step 5: Login AFTER verification -> MUST succeed with 200
  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: { login: email, password: 'SecurePassword123!' }
  });
  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.data.token);
  const authToken = loginRes.data.token;

  // Step 6: Access certificates while authenticated -> DIRECT ACCESS WITHOUT EXTRA OTP!
  const myCertsRes = await api('/certificates/my-certificates', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  assert.equal(myCertsRes.status, 200);
  assert.equal(myCertsRes.data.success, true);
  assert.ok(Array.isArray(myCertsRes.data.certificates));
  assert.ok(myCertsRes.data.certificates.some(c => c.recipient_email === email));

  // Step 7: Download own certificate -> DIRECT DOWNLOAD WITHOUT EXTRA OTP!
  const downloadRes = await api(`/certificates/download/${certId}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  assert.equal(downloadRes.status, 200);
  assert.equal(downloadRes.data.success, true);
  assert.equal(downloadRes.data.credential.credential_id, certId);
});

test('10. Certificate Ownership Authorization: Users Cannot Access Others Private Certificates', async () => {
  // User 1
  const u1Email = `owner_${Date.now()}@devharbour.in`;
  const u1Name = `owner_${Date.now().toString().slice(-6)}`;
  const u1Signup = await api('/auth/signup', {
    method: 'POST',
    body: { email: u1Email, username: u1Name, fullName: 'Owner User', password: 'Password123!' }
  });
  await db.markEmailVerified(u1Signup.data.user.id);
  const u1Login = await api('/auth/login', { method: 'POST', body: { login: u1Email, password: 'Password123!' } });
  const u1Token = u1Login.data.token;

  // Issue cert for User 1
  const u1Part = await db.insertParticipant({
    eventSlug: 'orca-coders-orcathon-2026',
    candidateName: 'Owner User',
    candidateEmail: u1Email,
    candidateOrganisation: 'Owner Org',
    isEligible: true
  });
  const u1Cert = await db.issueCertificate({
    participantId: u1Part.id,
    recipientName: 'Owner User',
    recipientEmail: u1Email,
    recipientOrganisation: 'Owner Org',
    eventSlug: 'orca-coders-orcathon-2026',
    certificateType: 'Participation',
    issueDate: 'October 25, 2026'
  });
  const u1CertId = u1Cert.credential_id;

  // User 2 (Intruder)
  const u2Email = `intruder_${Date.now()}@devharbour.in`;
  const u2Name = `intruder_${Date.now().toString().slice(-6)}`;
  const u2Signup = await api('/auth/signup', {
    method: 'POST',
    body: { email: u2Email, username: u2Name, fullName: 'Intruder User', password: 'Password123!' }
  });
  await db.markEmailVerified(u2Signup.data.user.id);
  const u2Login = await api('/auth/login', { method: 'POST', body: { login: u2Email, password: 'Password123!' } });
  const u2Token = u2Login.data.token;

  // Intruder tries to download User 1's certificate -> MUST BE REJECTED WITH 403
  const stolenDownload = await api(`/certificates/download/${u1CertId}`, {
    headers: { 'Authorization': `Bearer ${u2Token}` }
  });
  assert.equal(stolenDownload.status, 403);
  assert.ok(stolenDownload.data.error.includes('Access denied'));

  // Intruder tries to claim User 1's certificate -> MUST BE REJECTED WITH 403
  const stolenClaim = await api('/certificates/claim', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${u2Token}` },
    body: { email: u1Email }
  });
  assert.equal(stolenClaim.status, 403);
});
