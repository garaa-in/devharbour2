const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/leaderboard
router.get('/', async (req, res) => {
  try {
    const timeframe = req.query.timeframe === 'Weekly' ? 'Weekly' : (req.query.timeframe === 'Monthly' ? 'Monthly' : 'All-time');
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit || '20', 10)));
    const rankings = await db.getLeaderboard(timeframe, limit);

    let userRank = null;
    if (req.user) {
      const fullList = await db.getLeaderboard(timeframe, 500);
      const found = (fullList || []).find(r => r.userId === req.user.id);
      if (found) {
        userRank = found;
      } else {
        userRank = {
          rank: (fullList || []).length + 1,
          userId: req.user.id,
          username: req.user.username,
          fullName: req.user.full_name,
          avatarUrl: req.user.avatar_url,
          xp: req.user.totalXp,
          level: req.user.level,
          challengesSolved: 0,
          streakDays: req.user.streak_days
        };
      }
    }

    res.json({
      timeframe,
      rankings: rankings || [],
      currentUserRank: userRank
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve leaderboard.' });
  }
});

module.exports = router;
