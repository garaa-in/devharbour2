// Vercel Serverless Function: GET /api/leaderboard
// Powered by Supabase PostgreSQL single source of truth

const db = require('../server/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const timeframe = req.query.timeframe === 'Weekly' ? 'Weekly' : (req.query.timeframe === 'Monthly' ? 'Monthly' : 'All-time');
  const limit = Math.min(50, Math.max(5, parseInt(req.query.limit || '20', 10)));

  try {
    const rankings = await db.getLeaderboard(timeframe, limit);
    return res.json({
      timeframe,
      rankings: rankings || [],
      database: 'Supabase PostgreSQL'
    });
  } catch (err) {
    console.error('[LEADERBOARD ERROR]:', err);
    return res.status(500).json({
      error: 'Failed to retrieve leaderboard.'
    });
  }
};
