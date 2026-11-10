/**
 * Dev Harbour - Authentication & Authorization Middleware
 */

const crypto = require('node:crypto');
const db = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && re.test(email.trim());
}

function validateUsername(username) {
  const re = /^[a-zA-Z0-9_-]{3,30}$/;
  return typeof username === 'string' && re.test(username.trim());
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

// Authentication Middleware: populates req.user if valid token provided
async function authMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }

  if (token) {
    try {
      const session = await db.getSession(token);
      if (session) {
        const user = await db.getUserById(session.user_id);
        if (user) {
          const totalXp = await db.getUserTotalXp(user.id);
          const isVerified = await db.isEmailVerified(user.id);
          req.user = {
            ...user,
            emailVerified: isVerified,
            totalXp: totalXp || 0,
            level: db.calculateLevel(totalXp || 0)
          };
          req.token = token;
        }
      }
    } catch (err) {
      console.error('authMiddleware error:', err.message);
    }
  }

  next();
}

// Strict requirement for authenticated endpoints
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  if (req.user.emailVerified === false) {
    return res.status(403).json({
      error: 'Email address not verified. Please verify your email before accessing this feature.',
      requiresVerification: true,
      email: req.user.email
    });
  }
  next();
}

// Role-based authorization
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions.' });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  validateEmail,
  validateUsername,
  validatePassword,
  authMiddleware,
  requireAuth,
  requireRole
};
