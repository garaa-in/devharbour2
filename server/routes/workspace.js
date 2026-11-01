const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');

// GET /api/workspace — Retrieve all workspace items for user
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.json({
        tasks: [],
        notes: [],
        assignments: [],
        snippets: [],
        bookmarks: []
      });
    }
    const data = await db.getWorkspaceData(req.user.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve workspace data.' });
  }
});

// Tasks
router.post('/tasks', requireAuth, async (req, res) => {
  try {
    const { title, subject, priority } = req.body;
    const dueDate = req.body.dueDate || req.body.due_date;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required.' });
    }
    const task = await db.createWorkspaceTask(req.user.id, { title, subject, priority, dueDate });
    res.status(201).json({ ...task, task });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

router.put('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await db.updateWorkspaceTask(req.user.id, req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or unauthorized.' });
    }
    res.json({ ...task, task });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

router.delete('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteWorkspaceTask(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Task not found or unauthorized.' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// Notes
router.post('/notes', requireAuth, async (req, res) => {
  try {
    const { title, content, subject, tags } = req.body;
    const link = req.body.link || req.body.link_url;
    const isPinned = req.body.isPinned !== undefined ? req.body.isPinned : req.body.is_pinned;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Note title is required.' });
    }
    const note = await db.createWorkspaceNote(req.user.id, { title, content, subject, tags, link, isPinned });
    res.status(201).json({ ...note, note });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note.' });
  }
});

router.put('/notes/:id', requireAuth, async (req, res) => {
  try {
    const note = await db.updateWorkspaceNote(req.user.id, req.params.id, req.body);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized.' });
    }
    res.json({ ...note, note });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update note.' });
  }
});

router.delete('/notes/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteWorkspaceNote(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Note not found or unauthorized.' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note.' });
  }
});

// Assignments
router.post('/assignments', requireAuth, async (req, res) => {
  try {
    const { title, description, priority, status } = req.body;
    const dueDate = req.body.dueDate || req.body.deadline;
    const link = req.body.link || req.body.link_url;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Assignment title is required.' });
    }
    const assignment = await db.createWorkspaceAssignment(req.user.id, { title, description, dueDate, priority, status, link });
    res.status(201).json({ ...assignment, assignment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create assignment.' });
  }
});

router.put('/assignments/:id', requireAuth, async (req, res) => {
  try {
    const assignment = await db.updateWorkspaceAssignment(req.user.id, req.params.id, req.body);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found or unauthorized.' });
    }
    res.json({ ...assignment, assignment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update assignment.' });
  }
});

router.delete('/assignments/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteWorkspaceAssignment(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Assignment not found or unauthorized.' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete assignment.' });
  }
});

// Code Snippets
router.post('/snippets', requireAuth, async (req, res) => {
  try {
    const name = req.body.name || req.body.title;
    const language = req.body.language;
    const code = req.body.code;
    const input = req.body.input !== undefined ? req.body.input : req.body.input_data;
    if (!name || !code) {
      return res.status(400).json({ error: 'Snippet name and code are required.' });
    }
    const snippet = await db.saveWorkspaceSnippet(req.user.id, { name, language, code, input });
    res.status(201).json({ ...snippet, snippet });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save code snippet.' });
  }
});

router.delete('/snippets/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteWorkspaceSnippet(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Snippet not found or unauthorized.' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete snippet.' });
  }
});

// Bookmarks
router.post('/bookmarks', requireAuth, async (req, res) => {
  try {
    const { itemId, itemType, title, category } = req.body;
    const url = req.body.url || req.body.target_url;
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required.' });
    }
    const bookmark = await db.addWorkspaceBookmark(req.user.id, { itemId, itemType, title, url, category });
    res.status(201).json({ ...bookmark, bookmark });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save bookmark.' });
  }
});

router.delete('/bookmarks/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteWorkspaceBookmark(req.user.id, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Bookmark not found or unauthorized.' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bookmark.' });
  }
});

module.exports = router;
