const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const { executeCode } = require('../execution');
const eventBus = require('../events');

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
router.post('/:id/submit', requireAuth, async (req, res) => {
  const { code, language = 'javascript' } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({ error: 'Code cannot be empty.' });
  }

  // Load challenge with secret tests for evaluation
  const challenge = await db.getChallengeById(req.params.id, true);
  if (!challenge) {
    return res.status(404).json({ error: 'Challenge not found.' });
  }

  try {
    // Execute inside safe isolated sandbox
    const result = await executeCode(
      code,
      challenge.publicTests || [],
      challenge.hiddenTests || [],
      challenge.slug
    );

    // Record submission and award XP if qualifying pass
    const submissionResult = await db.recordSubmission({
      userId: req.user.id,
      challengeId: challenge.id,
      code,
      language,
      status: result.status,
      executionTimeMs: result.executionTimeMs,
      passedTests: result.passedCount,
      totalTests: result.totalCount,
      errorMessage: result.errorMessage
    });

    if (result.passed) {
      eventBus.broadcast({
        type: 'challenge_passed',
        username: req.user.username,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        executionTimeMs: result.executionTimeMs,
        xpEarned: submissionResult && submissionResult.xp ? submissionResult.xp.awarded : 0,
        message: `${req.user.username} solved "${challenge.title}" (+${submissionResult && submissionResult.xp ? submissionResult.xp.awarded : 0} XP)`
      });
    }

    res.json({
      status: result.status,
      passed: result.passed,
      passedTests: result.passedCount,
      totalTests: result.totalCount,
      executionTimeMs: result.executionTimeMs,
      sampleResults: result.sampleResults, // Public tests results only
      logs: result.logs,
      errorMessage: result.errorMessage,
      xp: submissionResult ? submissionResult.xp : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Execution service error: ' + err.message });
  }
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
