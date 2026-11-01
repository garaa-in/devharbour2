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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(200).json({ status: 'ok', service: 'Dev Harbour Serverless API' });
};
