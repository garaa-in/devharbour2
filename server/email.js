/**
 * Dev Harbour - Resend OTP & Transactional Email Delivery Service
 * Cryptographically secure OTP generation, HMAC hashing, rate-limiting, and delivery.
 */

const crypto = require('node:crypto');

function isConfigured(env = process.env) {
  const apiKey = env.RESEND_API_KEY || '';
  const from = env.EMAIL_FROM || '';
  const secret = env.EMAIL_VERIFICATION_SECRET || '';
  return /^re_[\w-]+$/.test(apiKey) && from.includes('@') && secret.length >= 16;
}

function canonicalEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP
 */
function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Compute HMAC-SHA256 hash of OTP with secret key
 * The plaintext OTP is NEVER stored in the database.
 */
function hashOtp(identifier, challengeId, otp, secret = process.env.EMAIL_VERIFICATION_SECRET) {
  if (!secret) throw new Error('EMAIL_VERIFICATION_SECRET is not configured.');
  return crypto.createHmac('sha256', secret)
    .update(JSON.stringify([String(identifier).trim(), challengeId, String(otp).trim()]))
    .digest('hex');
}

/**
 * Timing-safe comparison of OTP hashes to prevent timing attacks
 */
function verifyOtpHash(storedHash, identifier, challengeId, inputOtp, secret = process.env.EMAIL_VERIFICATION_SECRET) {
  if (!storedHash || !inputOtp) return false;
  const computed = hashOtp(identifier, challengeId, inputOtp, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Send email using Resend REST API
 */
async function sendEmail({ to, subject, html, text, challengeId }) {
  if (!isConfigured()) {
    throw new Error('EMAIL_SERVICE_NOT_CONFIGURED');
  }

  const recipient = Array.isArray(to) ? to : [to];
  const headers = {
    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json'
  };

  if (challengeId) {
    headers['Idempotency-Key'] = `dh-email-${challengeId}`;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers,
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: recipient,
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Resend API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return { id: data.id, success: true };
}

/**
 * Send an OTP verification email
 */
async function sendVerificationOtpEmail({ email, code, challengeId, purpose = 'verification' }) {
  const cleanTo = canonicalEmail(email);
  const title = purpose === 'password_reset'
    ? 'Dev Harbour — Password Reset Code'
    : 'Dev Harbour — Email Verification Code';

  const actionText = purpose === 'password_reset'
    ? 'reset your account password'
    : 'verify your Dev Harbour developer account and access your credentials';

  const text = `Your Dev Harbour verification code is: ${code}

This code expires in 10 minutes.
Enter this code on Dev Harbour to ${actionText}.

Never share this code with anyone. If you did not request this code, please safely ignore this email.
— The Dev Harbour Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f7fb; margin: 0; padding: 24px; color: #1e1b2e; }
    .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e3e0ec; padding: 36px 32px; box-shadow: 0 10px 30px rgba(30, 27, 46, 0.05); }
    .logo { font-size: 20px; font-weight: 800; color: #282242; letter-spacing: -0.02em; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }
    .badge { display: inline-block; background: #eeeaf8; color: #4f46e5; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 99px; text-transform: uppercase; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 12px; color: #1e1b2e; letter-spacing: -0.02em; }
    p { font-size: 14px; line-height: 1.6; color: #5d5770; margin: 0 0 20px; }
    .code-box { background: #faf9fd; border: 2px dashed #9389b0; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #282242; display: inline-block; }
    .footer { font-size: 12px; color: #8e889f; margin-top: 28px; border-top: 1px solid #eeeaf8; padding-top: 20px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚓ Dev Harbour</div>
    <div class="badge">Security Verification</div>
    <h1>${title}</h1>
    <p>Use the 6-digit one-time code below to ${actionText}:</p>
    <div class="code-box">
      <div class="otp">${code}</div>
    </div>
    <p>This code will expire in <strong>10 minutes</strong>. For your security, never share this code with anyone.</p>
    <div class="footer">
      If you did not make this request, you can safely ignore this email. Your account remains secure.<br>
      © 2026 Dev Harbour — Learn. Build. Compete. Grow.
    </div>
  </div>
</body>
</html>`;

  return sendEmail({
    to: cleanTo,
    subject: title,
    html,
    text,
    challengeId
  });
}

module.exports = {
  isConfigured,
  canonicalEmail,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  sendEmail,
  sendVerificationOtpEmail
};
