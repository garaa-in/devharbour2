// Vercel Serverless Function entry point for Dev Harbour Express backend
let app = null;
try {
  app = require('../server/index');
} catch (err) {
  console.error('Failed to load server/index in api/index:', err);
}

module.exports = (req, res) => {
  if (app) {
    return app(req, res);
  }
  return res.status(503).json({ error: 'API service unavailable.' });
};
