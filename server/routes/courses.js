const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const eventBus = require('../events');

// GET /api/courses
router.get('/', async (req, res) => {
  try {
    const category = req.query.category || 'All';
    const courses = await db.getCourses(category);
    res.json({ courses: courses || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve courses.' });
  }
});

// GET /api/courses/lesson/:id (Specific lesson details)
router.get('/lesson/:id', async (req, res) => {
  try {
    const lesson = await db.getLessonById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' });
    }
    const course = await db.getCourseById(lesson.course_id);
    const siblings = await db.getCourseLessons(lesson.course_id);

    let userProgress = null;
    if (req.user) {
      userProgress = await db.getLessonProgress(req.user.id, lesson.id);
    }

    res.json({
      lesson,
      course,
      siblings: siblings || [],
      progress: userProgress
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve lesson details.' });
  }
});

// POST /api/courses/lesson/:id/progress
router.post('/lesson/:id/progress', requireAuth, async (req, res) => {
  try {
    const { readingSeconds } = req.body;
    const seconds = Math.max(0, parseInt(readingSeconds || '10', 10));
    const lesson = await db.getLessonById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' });
    }

    const result = await db.saveLessonProgress(req.user.id, lesson.id, seconds, false);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to record lesson reading progress.' });
  }
});

// POST /api/courses/lesson/:id/complete
router.post('/lesson/:id/complete', requireAuth, async (req, res) => {
  try {
    const lesson = await db.getLessonById(req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' });
    }

    const result = await db.saveLessonProgress(req.user.id, lesson.id, 30, true);

    if (result && result.xp && result.xp.awarded) {
      eventBus.broadcast({
        type: 'lesson_completed',
        username: req.user.username,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        xpEarned: result.xp.awarded,
        message: `${req.user.username} completed reading "${lesson.title}" (+${result.xp.awarded} XP)`
      });
    }
    res.json({
      message: result && result.xp && result.xp.awarded ? 'Lesson completed! 10 XP awarded.' : 'Lesson marked as completed.',
      progress: result ? result.progress : null,
      xp: result ? result.xp : null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to complete lesson.' });
  }
});

// GET /api/courses/:id
router.get('/:id', async (req, res) => {
  try {
    const course = await db.getCourseById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    const lessons = await db.getCourseLessons(course.id || req.params.id);
    res.json({ course, lessons: lessons || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load course details.' });
  }
});

module.exports = router;
