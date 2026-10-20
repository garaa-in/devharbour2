const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../auth');
const eventBus = require('../events');

function isValidHttpUrl(string) {
  if (!string) return false;
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// GET /api/projects
router.get('/', (req, res) => {
  const { category, search } = req.query;
  const projects = db.getProjects({ category, search, status: 'approved' });
  res.json({ projects });
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  let userInteraction = { voted: false, bookmarked: false };
  if (req.user) {
    const interactions = db.getUserInteractions(req.user.id);
    userInteraction.voted = interactions.votes.includes(project.id);
    userInteraction.bookmarked = interactions.bookmarks.includes(project.id);
  }

  res.json({ project, interaction: userInteraction });
});

// POST /api/projects
router.post('/', requireAuth, (req, res) => {
  const { title, description, category, techStack, repoUrl, demoUrl } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return res.status(400).json({ error: 'Title is required (minimum 3 characters).' });
  }
  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    return res.status(400).json({ error: 'Description must be at least 10 characters long.' });
  }
  if (!category || typeof category !== 'string') {
    return res.status(400).json({ error: 'Category is required (e.g., Web, Mobile, Security, AI, Game).' });
  }
  if (!repoUrl || !isValidHttpUrl(repoUrl)) {
    return res.status(400).json({ error: 'A valid repository URL (e.g. https://github.com/...) is required.' });
  }
  if (demoUrl && !isValidHttpUrl(demoUrl)) {
    return res.status(400).json({ error: 'Live demo must be a valid URL.' });
  }

  const stack = Array.isArray(techStack)
    ? techStack.map(s => String(s).trim()).filter(Boolean).slice(0, 8)
    : (typeof techStack === 'string' ? techStack.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8) : []);

  const project = db.createProject({
    userId: req.user.id,
    title,
    description,
    category,
    techStack: stack,
    repoUrl,
    demoUrl
  });

  // Broadcast real-time project creation
  eventBus.broadcast({
    type: 'project_created',
    username: req.user.username,
    project: {
      id: project.id,
      title: project.title,
      category: project.category,
      description: project.description
    },
    message: `${req.user.username} published a new project: "${project.title}"`
  });

  res.status(201).json({
    message: 'Project published to community showcase! 50 XP awarded.',
    project
  });
});

// PUT /api/projects/:id
router.put('/:id', requireAuth, (req, res) => {
  const { title, description, category, techStack, repoUrl, demoUrl } = req.body;

  try {
    const stack = Array.isArray(techStack) ? techStack : (techStack ? techStack.split(',').map(s => s.trim()) : undefined);
    const updated = db.updateProject(req.params.id, req.user.id, {
      title,
      description,
      category,
      techStack: stack,
      repoUrl,
      demoUrl
    });

    if (!updated) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    res.json({ message: 'Project successfully updated.', project: updated });
  } catch (err) {
    if (err.message === 'Unauthorized') {
      return res.status(403).json({ error: 'You are not authorized to edit this project.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'moderator';
    const deleted = db.deleteProject(req.params.id, req.user.id, isAdmin);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json({ message: 'Project removed.' });
  } catch (err) {
    if (err.message === 'Unauthorized') {
      return res.status(403).json({ error: 'You are not authorized to delete this project.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:id/vote
router.post('/:id/vote', (req, res) => {
  let project = db.getProjectById(req.params.id);
  if (!project) {
    const all = db.getProjects({});
    const cleanParam = req.params.id.toLowerCase().replace(/^prj-/, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    project = all.find(p => p.id === req.params.id || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') === cleanParam);
  }
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  let votesCount = 0;
  let voted = true;

  if (req.user) {
    const result = db.toggleProjectVote(req.user.id, project.id);
    voted = result.voted;
    votesCount = result.votesCount;
  } else {
    const updated = db.incrementProjectVotes(project.id);
    voted = true;
    votesCount = updated.votesCount;
  }

  // Real-Time Broadcast to all connected clients!
  const likerName = req.user ? (req.user.username || req.user.full_name) : (req.body && req.body.username ? req.body.username : 'A developer');
  const userLoc = (req.body && req.body.location ? req.body.location : (req.user && req.user.location ? req.user.location : 'Navi Mumbai')).trim();

  eventBus.broadcast({
    type: 'project_voted',
    projectId: project.id,
    projectTitle: project.title,
    voted,
    votesCount,
    username: likerName,
    location: userLoc,
    message: `${likerName}${userLoc ? ' from ' + userLoc : ''} liked "${project.title}"! (${votesCount} ${votesCount === 1 ? 'like' : 'likes'})`
  });

  return res.json({
    message: voted ? 'Upvote registered!' : 'Upvote removed.',
    voted,
    votesCount
  });
});

// POST /api/projects/:id/bookmark
router.post('/:id/bookmark', requireAuth, (req, res) => {
  const project = db.getProjectById(req.params.id);
  if (!project) {
    return res.status(404).json({ error: 'Project not found.' });
  }

  const result = db.toggleProjectBookmark(req.user.id, project.id);
  res.json({
    message: result.bookmarked ? 'Saved to your bookmarks.' : 'Bookmark removed.',
    bookmarked: result.bookmarked,
    bookmarksCount: result.bookmarksCount
  });
});

module.exports = router;
