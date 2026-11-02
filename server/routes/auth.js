const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const db = require('../db');
const { hashPassword, verifyPassword, validateEmail, validateUsername, validatePassword, requireAuth } = require('../auth');
const { generateOtp, hashOtp, verifyOtpHash, sendVerificationOtpEmail } = require('../email');
const { rateLimit } = require('../rate-limiter');
const eventBus = require('../events');

// POST /api/auth/signup
router.post('/signup', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const { email, username, fullName, password, location, bio } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }
    if (!validateUsername(username)) {
      return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscores, hyphens).' });
    }
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required (minimum 2 characters).' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    // Check unique constraints
    const existingEmail = await db.getUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
    }

    const { salt, hash } = hashPassword(password);
    const user = await db.createUser({
      email,
      username,
      fullName,
      passwordHash: hash,
      salt,
      role: 'student',
      location: location || '',
      bio: bio || ''
    });

    // Generate cryptographically secure 6-digit OTP for Email Verification
    const otp = generateOtp();
    const challengeId = crypto.randomUUID();
    const codeHash = hashOtp(user.id, challengeId, otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.saveEmailVerification({
      userId: user.id,
      email: user.email,
      challengeId,
      codeHash,
      expiresAt
    });

    try {
      await sendVerificationOtpEmail({
        email: user.email,
        code: otp,
        challengeId,
        purpose: 'signup_verification'
      });
    } catch (err) {
      console.error('[SIGNUP OTP EMAIL ERROR]:', err.message);
    }

    const { token, expiresAt: sessionExpiresAt } = await db.createSession(user.id);

    // Broadcast real-time user signup
    eventBus.broadcast({
      type: 'user_joined',
      username: user.username,
      location: user.location || '',
      message: `${user.username}${user.location ? ` from ${user.location}` : ''} joined the Dev Harbour student community!`
    });

    res.status(201).json({
      message: 'Account successfully registered! A 6-digit verification code has been dispatched to your email.',
      requiresVerification: true,
      token,
      expiresAt: sessionExpiresAt,
      user: {
        ...user,
        emailVerified: false,
        totalXp: 0,
        level: 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', rateLimit({ windowMs: 60000, max: 15 }), async (req, res) => {
  try {
    const { login, password } = req.body; // login can be email or username

    if (!login || !password) {
      return res.status(400).json({ error: 'Email/Username and password are required.' });
    }

    const isEmail = login.includes('@');
    const user = isEmail ? await db.getUserByEmail(login) : await db.getUserByUsername(login);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. Please verify your email/username and password.' });
    }

    const valid = verifyPassword(password, user.salt, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials. Please verify your email/username and password.' });
    }

    const isVerified = await db.isEmailVerified(user.id);
    if (!isVerified) {
      return res.status(403).json({
        error: 'Please verify your email address before signing in. Check your inbox for the 6-digit verification code.',
        requiresVerification: true,
        email: user.email
      });
    }

    const { token, expiresAt } = await db.createSession(user.id);
    const totalXp = await db.getUserTotalXp(user.id);
    const streak = await db.updateStreak(user.id);

    res.json({
      message: 'Welcome back to Dev Harbour!',
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        location: user.location || '',
        githubUrl: user.github_url,
        portfolioUrl: user.portfolio_url,
        streakDays: streak,
        emailVerified: true,
        totalXp: totalXp || 0,
        level: db.calculateLevel(totalXp || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Sign in failed: ' + err.message });
  }
});

// POST /api/auth/google (Continue with Google — Cryptographically Verified)
router.post('/google', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  const { credential } = req.body;

  if (!credential || typeof credential !== 'string' || !credential.trim()) {
    return res.status(400).json({
      error: 'Google ID token credential is required for Google Sign-In.'
    });
  }

  let googleUser;
  try {
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential.trim())}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!tokenInfoRes.ok) {
      return res.status(401).json({ error: 'Invalid Google credential token or expired session.' });
    }
    googleUser = await tokenInfoRes.json();
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(401).json({ error: 'Invalid Google credential token or expired session.' });
    }
    return res.status(503).json({ error: 'Unable to verify credentials with Google. Please try again.' });
  }

  if (!googleUser || !googleUser.email || (googleUser.email_verified !== true && googleUser.email_verified !== 'true')) {
    return res.status(401).json({ error: 'Google account email must be verified.' });
  }

  const configuredClientId = process.env.GOOGLE_CLIENT_ID;
  if (configuredClientId && googleUser.aud && googleUser.aud !== configuredClientId) {
    return res.status(401).json({ error: 'Google client ID mismatch.' });
  }

  const email = googleUser.email.toLowerCase().trim();
  const name = (googleUser.name || googleUser.given_name || email.split('@')[0]).trim();
  const avatarUrl = googleUser.picture || '';

  try {
    let user = await db.getUserByEmail(email);

    if (!user) {
      let baseUser = (email.split('@')[0] || 'dev').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
      if (baseUser.length < 3) baseUser = 'user_' + baseUser;
      let username = baseUser;
      let counter = 1;
      while (await db.getUserByUsername(username)) {
        username = `${baseUser}${counter++}`;
      }

      const { salt, hash } = hashPassword('google_oauth_' + (googleUser.sub || crypto.randomUUID()));
      user = await db.createUser({
        email,
        username,
        fullName: name && name.length >= 2 ? name : username,
        passwordHash: hash,
        salt,
        role: 'student',
        location: 'India',
        bio: 'Dev Harbour developer'
      });

      eventBus.broadcast({
        type: 'user_joined',
        username: user.username,
        location: user.location || '',
        message: `${user.username} signed up with Google!`
      });
    }

    await db.markEmailVerified(user.id);

    const { token, expiresAt } = await db.createSession(user.id);
    const totalXp = await db.getUserTotalXp(user.id);
    const streak = await db.updateStreak(user.id);

    res.json({
      message: 'Successfully authenticated with Google.',
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url || avatarUrl || '',
        bio: user.bio,
        location: user.location || '',
        streakDays: streak,
        emailVerified: true,
        totalXp: totalXp || 0,
        level: db.calculateLevel(totalXp || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Google authentication failed: ' + err.message });
  }
});

// POST /api/auth/otp/send (Send OTP Verification Code)
router.post('/otp/send', rateLimit({ windowMs: 60000, max: 5 }), async (req, res) => {
  try {
    const emailInput = req.body.email || (req.user ? req.user.email : '');
    if (!emailInput || !validateEmail(emailInput)) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    const cleanEmail = emailInput.trim().toLowerCase();
    const user = await db.getUserByEmail(cleanEmail);

    // Anti-enumeration: Return identical success response even if user doesn't exist
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account matches that email address, a 6-digit verification code has been dispatched.',
        cooldownSeconds: 60
      });
    }

    // Check rate limiting and cooldown on existing verifications
    const existing = await db.getEmailVerification(user.id);
    if (existing && existing.sent_at) {
      const elapsed = Date.now() - new Date(existing.sent_at).getTime();
      if (elapsed < 60000) {
        const waitSeconds = Math.ceil((60000 - elapsed) / 1000);
        return res.status(429).json({
          error: `Please wait ${waitSeconds} seconds before requesting a new code.`,
          retryAfter: waitSeconds
        });
      }
      if (existing.send_count >= 5 && existing.hour_started_at) {
        const hourElapsed = Date.now() - new Date(existing.hour_started_at).getTime();
        if (hourElapsed < 3600000) {
          return res.status(429).json({
            error: 'Maximum verification attempts reached for this hour. Please try again later.'
          });
        }
      }
    }

    const otp = generateOtp();
    const challengeId = crypto.randomUUID();
    const codeHash = hashOtp(user.id, challengeId, otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.saveEmailVerification({
      userId: user.id,
      email: user.email,
      challengeId,
      codeHash,
      expiresAt
    });

    try {
      await sendVerificationOtpEmail({
        email: user.email,
        code: otp,
        challengeId,
        purpose: 'verification'
      });
    } catch (err) {
      console.error('[OTP SEND ERROR]:', err.message);
      return res.status(500).json({ error: 'Unable to send verification email. Please try again.' });
    }

    res.json({
      success: true,
      message: 'If an account matches that email address, a 6-digit verification code has been dispatched.',
      cooldownSeconds: 60
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to request verification code.' });
  }
});

// POST /api/auth/otp/verify (Validate OTP Code)
router.post('/otp/verify', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const user = await db.getUserByEmail(cleanEmail);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    const record = await db.getEmailVerification(user.id);
    if (!record || !record.code_hash) {
      return res.status(400).json({ error: 'No pending verification code found. Please request a new code.' });
    }

    if (record.state === 'locked' || (record.attempts && record.attempts >= 5)) {
      return res.status(429).json({ error: 'Too many failed attempts. This code has been locked. Please request a new code.' });
    }

    if (record.expires_at && new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    const isValid = verifyOtpHash(record.code_hash, user.id, record.challenge_id, cleanOtp);

    if (!isValid) {
      await db.recordOtpAttempt(user.id, false);
      return res.status(400).json({ error: 'Invalid verification code. Please check your email and try again.' });
    }

    await db.recordOtpAttempt(user.id, true);

    const { token, expiresAt } = await db.createSession(user.id);
    const totalXp = await db.getUserTotalXp(user.id);
    const streak = await db.updateStreak(user.id);

    res.json({
      success: true,
      message: 'Email address successfully verified! Your account is active.',
      token,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        location: user.location || '',
        githubUrl: user.github_url,
        portfolioUrl: user.portfolio_url,
        streakDays: streak,
        emailVerified: true,
        totalXp: totalXp || 0,
        level: db.calculateLevel(totalXp || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify code.' });
  }
});

// POST /api/auth/password-reset/request (Initiate Password Reset)
router.post('/password-reset/request', rateLimit({ windowMs: 60000, max: 5 }), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.getUserByEmail(cleanEmail);

    // Anti-enumeration: always return generic confirmation
    if (user) {
      const otp = generateOtp();
      const challengeId = crypto.randomUUID();
      const codeHash = hashOtp(user.id, challengeId, otp);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await db.saveEmailVerification({
        userId: user.id,
        email: user.email,
        challengeId,
        codeHash,
        expiresAt
      });

      try {
        await sendVerificationOtpEmail({
          email: user.email,
          code: otp,
          challengeId,
          purpose: 'password_reset'
        });
      } catch (err) {
        console.error('[PASSWORD RESET EMAIL ERROR]:', err.message);
      }
    }

    res.json({
      success: true,
      message: 'If an account matches that email address, password reset instructions have been dispatched.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to request password reset.' });
  }
});

// POST /api/auth/password-reset/confirm (Complete Password Reset)
router.post('/password-reset/confirm', rateLimit({ windowMs: 60000, max: 10 }), async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();
    const user = await db.getUserByEmail(cleanEmail);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    const record = await db.getEmailVerification(user.id);
    if (!record || !record.code_hash) {
      return res.status(400).json({ error: 'No pending reset code found. Please request a new code.' });
    }

    if (record.state === 'locked' || (record.attempts && record.attempts >= 5)) {
      return res.status(429).json({ error: 'Too many failed attempts. Please request a new reset code.' });
    }

    if (record.expires_at && new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ error: 'Reset code has expired. Please request a new code.' });
    }

    const isValid = verifyOtpHash(record.code_hash, user.id, record.challenge_id, cleanOtp);

    if (!isValid) {
      await db.recordOtpAttempt(user.id, false);
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    const { salt, hash } = hashPassword(newPassword);
    await db.updateUserPassword(user.id, hash, salt);
    await db.recordOtpAttempt(user.id, true);

    res.json({
      success: true,
      message: 'Password successfully updated! Please sign in with your new credentials.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password: ' + err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  try {
    if (req.token) {
      await db.deleteSession(req.token);
    }
    res.json({ message: 'Successfully signed out.' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const settings = await db.getUserSettings(user.id);
    const interactions = await db.getUserInteractions(user.id);
    const achievements = await db.getUserAchievements(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        location: user.location || '',
        githubUrl: user.github_url,
        portfolioUrl: user.portfolio_url,
        streakDays: user.streak_days,
        totalXp: user.totalXp,
        level: user.level,
        settings,
        interactions,
        achievementsCount: (achievements || []).length
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve authenticated user profile.' });
  }
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { fullName, bio, githubUrl, portfolioUrl, location, avatarUrl } = req.body;
    const updated = await db.updateUserProfile(req.user.id, {
      fullName,
      bio,
      githubUrl,
      portfolioUrl,
      location,
      avatarUrl
    });

    res.json({
      message: 'Profile updated successfully.',
      user: {
        ...updated,
        totalXp: req.user.totalXp,
        level: req.user.level
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user profile.' });
  }
});

module.exports = router;
