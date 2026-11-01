const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');

// GET /api/user/settings
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const settings = await db.getUserSettings(req.user.id);
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user settings.' });
  }
});

// POST /api/user/settings
router.post('/settings', requireAuth, async (req, res) => {
  try {
    const { theme, emailNotifications, profilePublic } = req.body;
    const updated = await db.saveUserSettings(req.user.id, { theme, emailNotifications, profilePublic });
    res.json({ settings: updated, message: 'Settings saved.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user settings.' });
  }
});

// GET /api/user/summary
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const totalXp = req.user.totalXp;
    const level = req.user.level;
    const streak = req.user.streak_days;

    const summaryStats = await db.getUserSummaryStats(userId);
    const xpHistory = await db.getXpHistory(userId, 10);
    const achievements = await db.getUserAchievements(userId);

    res.json({
      profile: {
        id: req.user.id,
        username: req.user.username,
        fullName: req.user.full_name,
        avatarUrl: req.user.avatar_url,
        role: req.user.role,
        bio: req.user.bio,
        githubUrl: req.user.github_url,
        portfolioUrl: req.user.portfolio_url
      },
      stats: {
        totalXp,
        level,
        streakDays: streak,
        completedLessons: summaryStats.completedLessons,
        solvedChallenges: summaryStats.solvedChallenges,
        submittedProjects: summaryStats.submittedProjects,
        achievementsCount: (achievements || []).length
      },
      xpHistory: xpHistory || [],
      achievements: achievements || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile summary.' });
  }
});

// GET /api/user/profile/:username (Public profile view)
router.get('/profile/:username', async (req, res) => {
  try {
    const user = await db.getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: 'Developer profile not found.' });
    }

    const settings = await db.getUserSettings(user.id);
    if (settings && !settings.profile_public && (!req.user || req.user.id !== user.id)) {
      return res.status(403).json({ error: 'This profile is private.' });
    }

    const totalXp = await db.getUserTotalXp(user.id);
    const summaryStats = await db.getUserSummaryStats(user.id);
    const projects = await db.getUserProjects(user.id, 'approved');
    const achievements = await db.getUserAchievements(user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        githubUrl: user.github_url,
        portfolioUrl: user.portfolio_url,
        streakDays: user.streak_days,
        totalXp: totalXp || 0,
        level: db.calculateLevel(totalXp || 0)
      },
      stats: {
        solvedChallenges: summaryStats.solvedChallenges,
        projectsCount: (projects || []).length,
        achievementsCount: (achievements || []).length
      },
      projects: projects || [],
      achievements: achievements || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load user profile.' });
  }
});

module.exports = router;
