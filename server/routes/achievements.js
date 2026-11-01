const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');

// GET /api/achievements (Catalog of all platform achievements)
router.get('/', async (req, res) => {
  try {
    const achievements = await db.getAchievements();
    let userUnlocked = [];
    if (req.user) {
      const userAchievements = await db.getUserAchievements(req.user.id);
      userUnlocked = (userAchievements || []).map(a => a.id);
    }
    res.json({
      achievements: (achievements || []).map(a => ({
        ...a,
        unlocked: userUnlocked.includes(a.id)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve achievements.' });
  }
});

// GET /api/achievements/user (Current user's unlocked badges)
router.get('/user', requireAuth, async (req, res) => {
  try {
    const achievements = await db.getUserAchievements(req.user.id);
    res.json({ achievements: achievements || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user achievements.' });
  }
});

module.exports = router;
