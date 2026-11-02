/**
 * Dev Harbour - Google Identity Services & One Tap Authentication Test Suite
 * Validates Google Account Chooser, FedCM initialization, token verification,
 * user provisioning in Supabase PostgreSQL, email verification bypass for verified accounts,
 * and direct certificate access without extra OTP.
 */

process.env.NODE_ENV = 'test';
process.env.PORT = '3399';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../server/index');
const db = require('../server/db');

let server;
const BASE_URL = 'http://localhost:3399/api';

// Intercept tokeninfo requests to simulate Google OAuth responses
const originalFetch = globalThis.fetch;
let mockGoogleResponses = {};

globalThis.fetch = async function(url, options = {}) {
  const urlStr = String(url);
  if (urlStr.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const urlObj = new URL(urlStr);
    const token = urlObj.searchParams.get('id_token');
    if (mockGoogleResponses[token]) {
      const mock = mockGoogleResponses[token];
      if (mock.error) {
        return new Response(JSON.stringify({ error: mock.error }), { status: mock.status || 400 });
      }
      return new Response(JSON.stringify(mock), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return originalFetch.call(this, url, options);
};

test.before(async () => {
  await new Promise(resolve => {
    server = app.listen(3399, resolve);
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
  const res = await originalFetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, headers: res.headers, data };
}

test('1. Public Configuration Endpoint provides Google Client ID', async () => {
  const res = await api('/config/public');
  assert.equal(res.status, 200);
  assert.equal(res.data.googleClientId, 'test-google-client-id.apps.googleusercontent.com');
  assert.ok(res.data.appBaseUrl);
});

test('2. Google Auth Rejects Missing or Spoofed Credentials', async () => {
  const resEmpty = await api('/auth/google', {
    method: 'POST',
    body: {}
  });
  assert.equal(resEmpty.status, 400);
  assert.ok(resEmpty.data.error.includes('Google ID token credential is required'));

  const resSpoofed = await api('/auth/google', {
    method: 'POST',
    body: { email: 'fake@devharbour.in', name: 'Fake User' }
  });
  assert.equal(resSpoofed.status, 400);
  assert.ok(resSpoofed.data.error.includes('Google ID token credential is required'));
});

test('3. Google Auth Rejects Invalid Token Issuer', async () => {
  const token = 'token_invalid_issuer_' + Date.now();
  mockGoogleResponses[token] = {
    iss: 'https://untrusted-issuer.attacker.com',
    aud: 'test-google-client-id.apps.googleusercontent.com',
    sub: 'attacker_123',
    email: 'attacker@devharbour.in',
    email_verified: true,
    exp: String(Math.floor(Date.now() / 1000) + 3600)
  };

  const res = await api('/auth/google', {
    method: 'POST',
    body: { credential: token }
  });
  assert.equal(res.status, 401);
  assert.ok(res.data.error.includes('Invalid Google token issuer'));
});

test('4. Google Auth Rejects Expired Token', async () => {
  const token = 'token_expired_' + Date.now();
  mockGoogleResponses[token] = {
    iss: 'https://accounts.google.com',
    aud: 'test-google-client-id.apps.googleusercontent.com',
    sub: 'expired_sub_123',
    email: 'expired@devharbour.in',
    email_verified: true,
    exp: String(Math.floor(Date.now() / 1000) - 300) // Expired 5 minutes ago
  };

  const res = await api('/auth/google', {
    method: 'POST',
    body: { credential: token }
  });
  assert.equal(res.status, 401);
  assert.ok(res.data.error.includes('expired'));
});

test('5. Google Auth Rejects Unverified Email', async () => {
  const token = 'token_unverified_' + Date.now();
  mockGoogleResponses[token] = {
    iss: 'https://accounts.google.com',
    aud: 'test-google-client-id.apps.googleusercontent.com',
    sub: 'unverified_sub_123',
    email: 'unverified@devharbour.in',
    email_verified: false,
    exp: String(Math.floor(Date.now() / 1000) + 3600)
  };

  const res = await api('/auth/google', {
    method: 'POST',
    body: { credential: token }
  });
  assert.equal(res.status, 401);
  assert.ok(res.data.error.includes('Google account email must be verified'));
});

test('6. First-time Google User Signup & Automatic Email Verification', async () => {
  const sub = 'google_sub_' + Date.now();
  const email = `new_google_user_${Date.now()}@devharbour.in`;
  const token = 'token_valid_signup_' + Date.now();
  const avatarUrl = 'https://lh3.googleusercontent.com/a/new_avatar_123';

  mockGoogleResponses[token] = {
    iss: 'https://accounts.google.com',
    aud: 'test-google-client-id.apps.googleusercontent.com',
    sub,
    email,
    email_verified: true,
    name: 'Ada Lovelace Google',
    picture: avatarUrl,
    exp: String(Math.floor(Date.now() / 1000) + 3600)
  };

  const res = await api('/auth/google', {
    method: 'POST',
    body: { credential: token }
  });

  assert.equal(res.status, 200);
  assert.ok(res.data.token);
  assert.equal(res.data.user.email, email);
  assert.equal(res.data.user.fullName, 'Ada Lovelace Google');
  assert.equal(res.data.user.avatarUrl, avatarUrl);
  assert.equal(res.data.user.emailVerified, true);

  // Verify in PostgreSQL database
  const userInDb = await db.getUserByEmail(email);
  assert.ok(userInDb);
  assert.equal(userInDb.avatar_url, avatarUrl);
  assert.equal(userInDb.salt, `google:${sub}`);
  const isVerified = await db.isEmailVerified(userInDb.id);
  assert.equal(isVerified, true);
});

test('7. Existing User Google Login & Profile Picture Sync', async () => {
  const email = `existing_dev_${Date.now()}@devharbour.in`;
  const username = `exist_${Date.now().toString().slice(-6)}`;
  
  // First, create existing user via traditional signup
  const signup = await api('/auth/signup', {
    method: 'POST',
    body: { email, username, fullName: 'Existing Developer', password: 'Password123!' }
  });
  assert.equal(signup.status, 201);
  const existingUserId = signup.data.user.id;

  // Now, log in with Google using that same verified email
  const token = 'token_existing_' + Date.now();
  const sub = 'google_sub_exist_' + Date.now();
  const avatarUrl = 'https://lh3.googleusercontent.com/a/existing_avatar_456';

  mockGoogleResponses[token] = {
    iss: 'https://accounts.google.com',
    aud: 'test-google-client-id.apps.googleusercontent.com',
    sub,
    email,
    email_verified: true,
    name: 'Existing Developer',
    picture: avatarUrl,
    exp: String(Math.floor(Date.now() / 1000) + 3600)
  };

  const googleRes = await api('/auth/google', {
    method: 'POST',
    body: { credential: token }
  });

  assert.equal(googleRes.status, 200);
  assert.equal(googleRes.data.user.id, existingUserId);
  assert.equal(googleRes.data.user.email, email);
  assert.equal(googleRes.data.user.avatarUrl, avatarUrl);
  assert.equal(googleRes.data.user.emailVerified, true);

  // Confirm database avatar was updated
  const updatedDb = await db.getUserById(existingUserId);
  assert.equal(updatedDb.avatar_url, avatarUrl);
});

test('8. Google-Authenticated User Direct Certificate Access (Zero Extra OTP)', async () => {
  const email = `cert_user_${Date.now()}@devharbour.in`;
  const token = 'token_cert_user_' + Date.now();
  const sub = 'google_sub_cert_' + Date.now();

  mockGoogleResponses[token] = {
    iss: 'https://accounts.google.com',
    aud: 'test-google-client-id.apps.googleusercontent.com',
    sub,
    email,
    email_verified: true,
    name: 'Certificate Earner',
    exp: String(Math.floor(Date.now() / 1000) + 3600)
  };

  // Sign up user via Google
  const authRes = await api('/auth/google', { method: 'POST', body: { credential: token } });
  assert.equal(authRes.status, 200);
  const sessionToken = authRes.data.token;
  const user = authRes.data.user;

  // Issue a certificate in PostgreSQL for this user
  const participant = await db.insertParticipant({
    eventSlug: 'orca-coders-orcathon-2026',
    candidateName: 'Certificate Earner',
    candidateEmail: email,
    candidateOrganisation: 'DevHarbour Tech',
    isEligible: true
  });

  const cert = await db.issueCertificate({
    participantId: participant.id,
    recipientName: 'Certificate Earner',
    recipientEmail: email,
    recipientOrganisation: 'DevHarbour Tech',
    eventSlug: 'orca-coders-orcathon-2026',
    certificateType: 'Merit',
    issueDate: 'October 25, 2026'
  });

  // Direct Certificate Access via /certificates/me (Zero Extra OTP)
  const myCertsRes = await api('/certificates/me', {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.equal(myCertsRes.status, 200);
  assert.equal(myCertsRes.data.certificates.length, 1);
  assert.equal(myCertsRes.data.certificates[0].credential_id, cert.credential_id);

  // Direct Certificate Download Authorization (Zero Extra OTP)
  const downloadRes = await api(`/certificates/download/${cert.credential_id}`, {
    headers: { 'Authorization': `Bearer ${sessionToken}` }
  });
  assert.equal(downloadRes.status, 200);
  assert.equal(downloadRes.data.success, true);
  assert.equal(downloadRes.data.credential.credential_id, cert.credential_id);
});

test('9. Frontend HTML Google Identity Services & FedCM Integration Verification', () => {
  const indexHtml = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');

  // Verify GIS client library reference
  assert.ok(indexHtml.includes('https://accounts.google.com/gsi/client'), 'Must reference official GIS client script');

  // Verify FedCM enabled in initialization
  assert.ok(indexHtml.includes('use_fedcm_for_prompt: true'), 'Must enable FedCM support for Google Identity Services');
  assert.ok(indexHtml.includes('auto_select: false'), 'Must NOT force automatic login');
  assert.ok(indexHtml.includes('cancel_on_tap_outside: true'), 'Must allow dismissal on outside tap');

  // Verify Account Chooser button slot & container
  assert.ok(indexHtml.includes('id="dh-google-btn-container"'), 'Must contain Google button container');
  assert.ok(indexHtml.includes('id="dh-google-btn-slot"'), 'Must contain Google rendered button slot');

  // Verify One Tap moment handling
  assert.ok(indexHtml.includes('notification.isNotDisplayed()'), 'Must handle isNotDisplayed moment');
  assert.ok(indexHtml.includes('notification.isSkippedMoment()'), 'Must handle isSkippedMoment moment');
  assert.ok(indexHtml.includes('notification.isDismissedMoment()'), 'Must handle isDismissedMoment moment');
});
