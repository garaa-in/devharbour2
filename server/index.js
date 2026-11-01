/**
 * Dev Harbour — Full-Stack Application Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { authMiddleware } = require('./auth');

const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const challengeRoutes = require('./routes/challenges');
const projectRoutes = require('./routes/projects');
const leaderboardRoutes = require('./routes/leaderboard');
const achievementRoutes = require('./routes/achievements');
const userRoutes = require('./routes/user');
const workspaceRoutes = require('./routes/workspace');
const certificateRoutes = require('./routes/certificates');
const eventBus = require('./events');

const app = express();
const PORT = process.env.PORT || 3000;

// Hardened Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Security & Parsing Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/user', userRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/certificates', certificateRoutes);

// Real-Time Server-Sent Events (SSE) Stream
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  eventBus.addClient(res);

  // Send initial connection handshake and recent activity stream
  res.write(`data: ${JSON.stringify({ type: 'connected', recent: eventBus.getRecent(), timestamp: new Date().toISOString() })}\n\n`);
});

// GET /api/activity (Recent real-time events feed)
app.get('/api/activity', (req, res) => {
  res.json({
    activity: eventBus.getRecent(),
    timestamp: new Date().toISOString()
  });
});

// Platform Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'Dev Harbour',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Serve Frontend Static Assets
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Public config endpoint — exposes only non-secret environment values needed by the browser
app.get('/api/config/public', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    appBaseUrl: process.env.APP_BASE_URL || null
  });
});

// SPA Fallback
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Central Error Handler — Sanitizes error responses in production to prevent leaking sensitive internals
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]:', err.message || err);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'An internal error occurred. Please try again later.' : (err.message || 'An unexpected server error occurred.')
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`⚓ Dev Harbour full-stack server running live at http://localhost:${PORT}`);
  });
}

module.exports = app;
