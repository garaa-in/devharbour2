const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');

// GET /api/challenges
router.get('/', async (req, res) => {
  try {
    const { category, difficulty, search } = req.query;
    const challenges = await db.getChallenges(category, difficulty, search);
    res.json({ challenges: challenges || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve challenges.' });
  }
});

// GET /api/challenges/:id
router.get('/:id', async (req, res) => {
  try {
    const challenge = await db.getChallengeById(req.params.id, false); // hidden tests kept private
    if (!challenge) {
      return res.status(404).json({ error: 'Coding challenge not found.' });
    }

    let userSubmissions = [];
    if (req.user) {
      userSubmissions = await db.getUserSubmissions(req.user.id, challenge.id);
    }

    res.json({
      challenge,
      submissions: userSubmissions || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load challenge details.' });
  }
});

// POST /api/challenges/:id/submit
router.post('/:id/submit', requireAuth, (_req, res) => {
  // Server-side grading stays offline until submissions have an isolated runner.
  res.status(503).json({ error: 'Server grading is temporarily unavailable. You can still run the public examples in your browser.' });
});

// GET /api/challenges/:id/submissions
router.get('/:id/submissions', requireAuth, async (req, res) => {
  try {
    const submissions = await db.getUserSubmissions(req.user.id, req.params.id);
    res.json({ submissions: submissions || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user submissions.' });
  }
});

module.exports = router;
