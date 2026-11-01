/**
 * Dev Harbour — Supabase PostgreSQL Database Adapter
 * Authoritative cloud database client using connection pooling via pg.Pool.
 */

require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Resolve portable connection string with valid SSL root certificate
const defaultCertPath = path.join(__dirname, '..', 'security', 'certs', 'supabase-root-2021.crt');
let DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_URL || '';

if (DATABASE_URL.includes('sslrootcert=')) {
  const match = DATABASE_URL.match(/sslrootcert=([^&]+)/);
  if (match) {
    const specifiedPath = decodeURIComponent(match[1]);
    if (!fs.existsSync(specifiedPath) && fs.existsSync(defaultCertPath)) {
      DATABASE_URL = DATABASE_URL.replace(match[0], `sslrootcert=${encodeURIComponent(defaultCertPath)}`);
    }
  }
}

let pool = null;
if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
}

async function query(text, params = []) {
  if (!pool) throw new Error('PostgreSQL pool is not initialized. Please configure DATABASE_URL in .env');
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function isConnected() {
  if (!pool) return false;
  try {
    const res = await query('SELECT 1 as healthy;');
    return Boolean(res && res.rows && res.rows[0]);
  } catch {
    return false;
  }
}

function calculateLevel(totalXp = 0) {
  return Math.floor(Math.sqrt(totalXp / 100)) + 1;
}

// ================= USER & PROFILE =================
async function getUserById(id) {
  const res = await query('SELECT * FROM users WHERE id = $1 LIMIT 1;', [id]);
  return res.rows[0] || null;
}

async function getUserByEmail(email) {
  if (!email) return null;
  const res = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;', [email.trim()]);
  return res.rows[0] || null;
}

async function getUserByUsername(username) {
  if (!username) return null;
  const res = await query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1;', [username.trim()]);
  return res.rows[0] || null;
}

async function createUser({ email, username, fullName, passwordHash, salt, role = 'student', location = '', bio = '' }) {
  const id = 'usr-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  await query(`
    INSERT INTO users (id, email, username, full_name, password_hash, salt, role, location, bio, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
  `, [id, email.toLowerCase().trim(), username.toLowerCase().trim(), fullName.trim(), passwordHash, salt, role, location, bio, now, now]);

  await query(`
    INSERT INTO user_settings (user_id, theme, email_notifications, profile_public, updated_at)
    VALUES ($1, 'light', 1, 1, $2)
    ON CONFLICT (user_id) DO NOTHING;
  `, [id, now]);

  return getUserById(id);
}

async function updateUserProfile(id, { fullName, bio, githubUrl, portfolioUrl, location, avatarUrl }) {
  const user = await getUserById(id);
  if (!user) return null;

  const updatedName = fullName !== undefined ? fullName.trim() : user.full_name;
  const updatedBio = bio !== undefined ? bio : user.bio;
  const updatedGithub = githubUrl !== undefined ? githubUrl : user.github_url;
  const updatedPortfolio = portfolioUrl !== undefined ? portfolioUrl : user.portfolio_url;
  const updatedLocation = location !== undefined ? location : user.location;
  const updatedAvatar = avatarUrl !== undefined ? avatarUrl : user.avatar_url;
  const now = new Date().toISOString();

  await query(`
    UPDATE users
    SET full_name = $1, bio = $2, github_url = $3, portfolio_url = $4, location = $5, avatar_url = $6, updated_at = $7
    WHERE id = $8;
  `, [updatedName, updatedBio, updatedGithub, updatedPortfolio, updatedLocation, updatedAvatar, now, id]);

  return getUserById(id);
}

async function updateStreak(userId) {
  const user = await getUserById(userId);
  if (!user) return 0;

  const today = new Date().toISOString().slice(0, 10);
  if (user.last_active_date === today) {
    return user.streak_days || 0;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = user.last_active_date === yesterday ? (user.streak_days || 0) + 1 : 1;

  await query(`
    UPDATE users
    SET streak_days = $1, last_active_date = $2, updated_at = NOW()
    WHERE id = $3;
  `, [streak, today, userId]);

  return streak;
}

// ================= SESSIONS =================
async function createSession(userId) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const expiryDays = parseInt(process.env.TOKEN_EXPIRY_DAYS || '7', 10);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  await query(`
    INSERT INTO sessions (id, user_id, token, expires_at, created_at)
    VALUES ($1, $2, $3, $4, NOW());
  `, [id, userId, token, expiresAt]);

  return { token, expiresAt };
}

async function getSession(token) {
  if (!token) return null;
  const res = await query(`
    SELECT s.id, s.user_id, s.expires_at, u.role, u.username, u.email
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = $1 AND s.expires_at::timestamp > NOW()
    LIMIT 1;
  `, [token]);
  return res.rows[0] || null;
}

async function deleteSession(token) {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token = $1;', [token]);
}

// ================= XP & LEADERBOARD =================
async function awardXp(userId, amount, sourceType, referenceId, note = '') {
  const id = 'xp-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  await query(`
    INSERT INTO xp_ledger (id, user_id, amount, source_type, reference_id, note, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7);
  `, [id, userId, amount, sourceType, referenceId, note, now]);

  const totalXp = await getUserTotalXp(userId);
  await updateStreak(userId);
  await checkAndUnlockAchievements(userId);

  return {
    awarded: true,
    amount,
    currentXp: totalXp,
    level: calculateLevel(totalXp)
  };
}

async function getUserTotalXp(userId) {
  const res = await query('SELECT COALESCE(SUM(amount), 0)::int as total FROM xp_ledger WHERE user_id = $1;', [userId]);
  return res.rows[0] ? res.rows[0].total : 0;
}

async function getXpHistory(userId, limit = 10) {
  const res = await query(`
    SELECT * FROM xp_ledger
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2;
  `, [userId, limit]);
  return res.rows;
}

async function getLeaderboard(timeframe = 'All-time', limit = 20) {
  let dateFilter = '';
  if (timeframe === 'Weekly') {
    dateFilter = "AND l.created_at::timestamp >= NOW() - INTERVAL '7 days'";
  } else if (timeframe === 'Monthly') {
    dateFilter = "AND l.created_at::timestamp >= NOW() - INTERVAL '30 days'";
  }

  const res = await query(`
    SELECT
      u.id as "userId",
      u.username,
      u.full_name as "fullName",
      u.avatar_url as "avatarUrl",
      COALESCE(SUM(l.amount), 0)::int as xp,
      COUNT(DISTINCT CASE WHEN l.source_type = 'challenge_pass' THEN l.reference_id END)::int as "challengesSolved",
      COALESCE(u.streak_days, 0) as "streakDays"
    FROM users u
    LEFT JOIN xp_ledger l ON u.id = l.user_id ${dateFilter}
    GROUP BY u.id, u.username, u.full_name, u.avatar_url, u.streak_days, u.created_at
    ORDER BY xp DESC, "challengesSolved" DESC, u.created_at ASC
    LIMIT $1;
  `, [limit]);

  return res.rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    username: r.username,
    fullName: r.fullName || r.username,
    avatarUrl: r.avatarUrl || '',
    xp: r.xp,
    level: calculateLevel(r.xp),
    challengesSolved: r.challengesSolved,
    streakDays: r.streakDays
  }));
}

// ================= COURSES & LESSONS =================
async function getCourses(category = 'All') {
  let q = 'SELECT * FROM courses';
  const params = [];
  if (category && category !== 'All') {
    q += ' WHERE category = $1';
    params.push(category);
  }
  q += ' ORDER BY is_featured DESC, rating DESC;';
  const res = await query(q, params);
  return res.rows;
}

async function getCourseById(id) {
  if (!id) return null;
  const cleanId = id.trim().toLowerCase();
  // Support both exact ID (course-cs50) and frontend slug (cs50, fullstack)
  const res = await query(`
    SELECT * FROM courses
    WHERE id = $1
       OR id = $2
       OR LOWER(category) = $3
       OR LOWER(title) LIKE $4
    LIMIT 1;
  `, [id, `course-${cleanId}`, cleanId, `%${cleanId}%`]);
  return res.rows[0] || null;
}

async function getCourseLessons(courseId) {
  const res = await query(`
    SELECT id, course_id, title, slug, reading_time_mins, order_index
    FROM lessons
    WHERE course_id = $1
    ORDER BY order_index ASC;
  `, [courseId]);
  return res.rows;
}

async function getLessonById(id) {
  const res = await query('SELECT * FROM lessons WHERE id = $1 OR slug = $2 LIMIT 1;', [id, id]);
  return res.rows[0] || null;
}

async function getLessonProgress(userId, lessonId) {
  const res = await query('SELECT * FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2 LIMIT 1;', [userId, lessonId]);
  return res.rows[0] || null;
}

async function saveLessonProgress(userId, lessonId, readingSeconds = 10, completed = false) {
  const existing = await getLessonProgress(userId, lessonId);
  const now = new Date().toISOString();

  let xpResult = { awarded: false, amount: 0 };
  const status = completed ? 'completed' : (existing ? existing.status : 'in_progress');
  const totalSeconds = (existing ? existing.reading_seconds : 0) + readingSeconds;
  const completedAt = completed ? (existing?.completed_at || now) : existing?.completed_at;

  await query(`
    INSERT INTO lesson_progress (id, user_id, lesson_id, status, reading_seconds, completed_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id, lesson_id)
    DO UPDATE SET status = EXCLUDED.status, reading_seconds = EXCLUDED.reading_seconds, completed_at = EXCLUDED.completed_at;
  `, [crypto.randomUUID(), userId, lessonId, status, totalSeconds, completedAt]);

  if (completed && (!existing || existing.status !== 'completed')) {
    xpResult = await awardXp(userId, 10, 'lesson_complete', lessonId, 'Completed reading lesson');
  }

  const updated = await getLessonProgress(userId, lessonId);
  return { progress: updated, xp: xpResult };
}

// ================= CHALLENGES & SUBMISSIONS =================
async function getChallenges(category, difficulty, search) {
  let q = 'SELECT id, title, slug, difficulty, category, time_estimate, description, xp_reward FROM challenges WHERE 1=1';
  const params = [];

  if (category && category !== 'All') {
    params.push(category);
    q += ` AND category = $${params.length}`;
  }
  if (difficulty && difficulty !== 'All') {
    params.push(difficulty);
    q += ` AND difficulty = $${params.length}`;
  }
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    q += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(description) LIKE $${params.length})`;
  }

  q += ' ORDER BY CASE difficulty WHEN \'Easy\' THEN 1 WHEN \'Medium\' THEN 2 WHEN \'Hard\' THEN 3 ELSE 4 END ASC;';
  const res = await query(q, params);
  return res.rows;
}

async function getChallengeById(id, includeHidden = false) {
  const res = await query('SELECT * FROM challenges WHERE id = $1 OR slug = $2 LIMIT 1;', [id, id]);
  const ch = res.rows[0];
  if (!ch) return null;

  return {
    id: ch.id,
    title: ch.title,
    slug: ch.slug,
    difficulty: ch.difficulty,
    category: ch.category,
    timeEstimate: ch.time_estimate,
    description: ch.description,
    examples: JSON.parse(ch.examples_json || '[]'),
    starterCodeJs: ch.starter_code_js,
    publicTests: JSON.parse(ch.public_tests_json || '[]'),
    hiddenTests: includeHidden ? JSON.parse(ch.hidden_tests_json || '[]') : undefined,
    xpReward: ch.xp_reward
  };
}

async function recordSubmission({ userId, challengeId, code, language, status, executionTimeMs, passedTests, totalTests, errorMessage }) {
  const id = 'sub-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  await query(`
    INSERT INTO submissions (id, user_id, challenge_id, code, language, status, execution_time_ms, passed_tests, total_tests, error_message, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
  `, [id, userId, challengeId, code, language || 'javascript', status, executionTimeMs || 0, passedTests || 0, totalTests || 0, errorMessage || '', now]);

  let xpResult = { awarded: false, amount: 0 };
  if (status === 'passed') {
    const prevPassed = await query(`
      SELECT count(*) as count FROM submissions
      WHERE user_id = $1 AND challenge_id = $2 AND status = 'passed' AND id != $3;
    `, [userId, challengeId, id]);

    if (parseInt(prevPassed.rows[0].count, 10) === 0) {
      const challenge = await getChallengeById(challengeId);
      const reward = challenge ? challenge.xpReward : 25;
      xpResult = await awardXp(userId, reward, 'challenge_pass', challengeId, `Solved challenge: ${challenge ? challenge.title : challengeId}`);
    }
  }

  return { id, xp: xpResult };
}

async function getUserSubmissions(userId, challengeId) {
  let q = 'SELECT * FROM submissions WHERE user_id = $1';
  const params = [userId];
  if (challengeId) {
    params.push(challengeId);
    q += ' AND challenge_id = $2';
  }
  q += ' ORDER BY created_at DESC LIMIT 20;';
  const res = await query(q, params);
  return res.rows;
}

// ================= PROJECTS =================
async function getProjects({ category, search, status = 'approved' } = {}) {
  let q = `
    SELECT p.*, u.username, u.full_name, u.avatar_url
    FROM projects p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (status) {
    params.push(status);
    q += ` AND p.status = $${params.length}`;
  }
  if (category && category !== 'All') {
    params.push(category);
    q += ` AND p.category = $${params.length}`;
  }
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    q += ` AND (LOWER(p.title) LIKE $${params.length} OR LOWER(p.description) LIKE $${params.length})`;
  }
  q += ' ORDER BY p.votes_count DESC, p.created_at DESC;';

  const res = await query(q, params);
  return res.rows.map(r => ({
    ...r,
    techStack: JSON.parse(r.tech_stack_json || '[]')
  }));
}

async function getProjectById(id) {
  const res = await query(`
    SELECT p.*, u.username, u.full_name, u.avatar_url
    FROM projects p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.id = $1 LIMIT 1;
  `, [id]);
  const p = res.rows[0];
  if (!p) return null;
  return { ...p, techStack: JSON.parse(p.tech_stack_json || '[]') };
}

async function createProject({ userId, title, description, category, techStack, repoUrl, demoUrl }) {
  const id = 'prj-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  await query(`
    INSERT INTO projects (id, user_id, title, description, category, tech_stack_json, repo_url, demo_url, votes_count, bookmarks_count, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 'approved', $9, $10);
  `, [id, userId, title, description, category, JSON.stringify(techStack || []), repoUrl, demoUrl || '', now, now]);

  await awardXp(userId, 50, 'project_publish', id, `Published project: ${title}`);
  return getProjectById(id);
}

async function updateProject(id, userId, { title, description, category, techStack, repoUrl, demoUrl }) {
  const project = await getProjectById(id);
  if (!project) return null;
  if (project.user_id !== userId) throw new Error('Unauthorized');

  const now = new Date().toISOString();
  await query(`
    UPDATE projects
    SET title = $1, description = $2, category = $3, tech_stack_json = $4, repo_url = $5, demo_url = $6, updated_at = $7
    WHERE id = $8;
  `, [
    title !== undefined ? title : project.title,
    description !== undefined ? description : project.description,
    category !== undefined ? category : project.category,
    techStack !== undefined ? JSON.stringify(techStack) : project.tech_stack_json,
    repoUrl !== undefined ? repoUrl : project.repo_url,
    demoUrl !== undefined ? demoUrl : project.demo_url,
    now,
    id
  ]);
  return getProjectById(id);
}

async function deleteProject(id, userId, isAdmin = false) {
  const project = await getProjectById(id);
  if (!project) return false;
  if (project.user_id !== userId && !isAdmin) throw new Error('Unauthorized');

  await query('DELETE FROM projects WHERE id = $1;', [id]);
  return true;
}

async function incrementProjectVotes(id) {
  const res = await query(`
    UPDATE projects
    SET votes_count = votes_count + 1
    WHERE id = $1
    RETURNING votes_count;
  `, [id]);
  return { votesCount: res.rows[0] ? res.rows[0].votes_count : 0 };
}

async function toggleProjectVote(userId, projectId) {
  const check = await query('SELECT id FROM project_votes WHERE user_id = $1 AND project_id = $2 LIMIT 1;', [userId, projectId]);
  let voted = false;
  if (check.rows.length > 0) {
    await query('DELETE FROM project_votes WHERE user_id = $1 AND project_id = $2;', [userId, projectId]);
    await query('UPDATE projects SET votes_count = GREATEST(0, votes_count - 1) WHERE id = $1;', [projectId]);
    voted = false;
  } else {
    await query('INSERT INTO project_votes (id, user_id, project_id, created_at) VALUES ($1, $2, $3, NOW());', [crypto.randomUUID(), userId, projectId]);
    await query('UPDATE projects SET votes_count = votes_count + 1 WHERE id = $1;', [projectId]);
    voted = true;
  }
  const proj = await getProjectById(projectId);
  return { voted, votesCount: proj ? proj.votes_count : 0 };
}

async function toggleProjectBookmark(userId, projectId) {
  const check = await query('SELECT id FROM project_bookmarks WHERE user_id = $1 AND project_id = $2 LIMIT 1;', [userId, projectId]);
  let bookmarked = false;
  if (check.rows.length > 0) {
    await query('DELETE FROM project_bookmarks WHERE user_id = $1 AND project_id = $2;', [userId, projectId]);
    await query('UPDATE projects SET bookmarks_count = GREATEST(0, bookmarks_count - 1) WHERE id = $1;', [projectId]);
    bookmarked = false;
  } else {
    await query('INSERT INTO project_bookmarks (id, user_id, project_id, created_at) VALUES ($1, $2, $3, NOW());', [crypto.randomUUID(), userId, projectId]);
    await query('UPDATE projects SET bookmarks_count = bookmarks_count + 1 WHERE id = $1;', [projectId]);
    bookmarked = true;
  }
  const proj = await getProjectById(projectId);
  return { bookmarked, bookmarksCount: proj ? proj.bookmarks_count : 0 };
}

async function getUserInteractions(userId) {
  const votes = await query('SELECT project_id FROM project_votes WHERE user_id = $1;', [userId]);
  const bookmarks = await query('SELECT project_id FROM project_bookmarks WHERE user_id = $1;', [userId]);
  return {
    votes: votes.rows.map(r => r.project_id),
    bookmarks: bookmarks.rows.map(r => r.project_id)
  };
}

// ================= ACHIEVEMENTS =================
async function getAchievements() {
  const res = await query('SELECT * FROM achievements ORDER BY xp_bonus ASC;');
  return res.rows;
}

async function getUserAchievements(userId) {
  const res = await query(`
    SELECT a.*, ua.unlocked_at
    FROM user_achievements ua
    JOIN achievements a ON ua.achievement_id = a.id
    WHERE ua.user_id = $1
    ORDER BY a.xp_bonus ASC;
  `, [userId]);
  return res.rows;
}

async function checkAndUnlockAchievements(userId) {
  const achievements = await getAchievements();
  const unlocked = await getUserAchievements(userId);
  const unlockedIds = new Set(unlocked.map(a => a.id));

  const totalXp = await getUserTotalXp(userId);
  const solvedCount = await query("SELECT COUNT(DISTINCT challenge_id)::int as count FROM submissions WHERE user_id = $1 AND status = 'passed';", [userId]);
  const projectCount = await query('SELECT COUNT(*)::int as count FROM projects WHERE user_id = $1;', [userId]);

  const newUnlocked = [];
  for (const ach of achievements) {
    if (unlockedIds.has(ach.id)) continue;
    let qualify = false;
    if (ach.condition_type === 'total_xp' && totalXp >= ach.condition_value) qualify = true;
    if (ach.condition_type === 'challenges_solved' && solvedCount.rows[0].count >= ach.condition_value) qualify = true;
    if (ach.condition_type === 'projects_submitted' && projectCount.rows[0].count >= ach.condition_value) qualify = true;

    if (qualify) {
      await query(`
        INSERT INTO user_achievements (id, user_id, achievement_id, unlocked_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT DO NOTHING;
      `, [crypto.randomUUID(), userId, ach.id]);
      newUnlocked.push(ach);
    }
  }
  return newUnlocked;
}

// ================= USER SETTINGS =================
async function getUserSettings(userId) {
  const res = await query('SELECT * FROM user_settings WHERE user_id = $1 LIMIT 1;', [userId]);
  return res.rows[0] || { theme: 'light', email_notifications: 1, profile_public: 1 };
}

async function saveUserSettings(userId, { theme, emailNotifications, profilePublic }) {
  const current = await getUserSettings(userId);
  const newTheme = theme !== undefined ? theme : current.theme;
  const newEmail = emailNotifications !== undefined ? (emailNotifications ? 1 : 0) : current.email_notifications;
  const newPublic = profilePublic !== undefined ? (profilePublic ? 1 : 0) : current.profile_public;

  await query(`
    INSERT INTO user_settings (user_id, theme, email_notifications, profile_public, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET theme = EXCLUDED.theme, email_notifications = EXCLUDED.email_notifications, profile_public = EXCLUDED.profile_public, updated_at = NOW();
  `, [userId, newTheme, newEmail, newPublic]);

  return getUserSettings(userId);
}

// ================= WORKSPACE =================
async function getWorkspaceData(userId) {
  const tasks = await query('SELECT * FROM workspace_tasks WHERE user_id = $1 ORDER BY created_at DESC;', [userId]);
  const notes = await query('SELECT * FROM workspace_notes WHERE user_id = $1 ORDER BY is_pinned DESC, created_at DESC;', [userId]);
  const assignments = await query('SELECT * FROM workspace_assignments WHERE user_id = $1 ORDER BY created_at DESC;', [userId]);
  const snippets = await query('SELECT * FROM workspace_snippets WHERE user_id = $1 ORDER BY created_at DESC;', [userId]);
  const bookmarks = await query('SELECT * FROM workspace_bookmarks WHERE user_id = $1 ORDER BY created_at DESC;', [userId]);

  return {
    tasks: tasks.rows,
    notes: notes.rows,
    assignments: assignments.rows,
    snippets: snippets.rows,
    bookmarks: bookmarks.rows
  };
}

async function createWorkspaceTask(userId, { title, subject, priority, dueDate, due_date }) {
  const id = crypto.randomUUID();
  const date = dueDate || due_date || '';
  await query(`
    INSERT INTO workspace_tasks (id, user_id, title, subject, priority, due_date, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW());
  `, [id, userId, title.trim(), subject || 'General', priority || 'medium', date]);
  const res = await query('SELECT * FROM workspace_tasks WHERE id = $1;', [id]);
  return res.rows[0];
}

async function updateWorkspaceTask(userId, id, data) {
  const check = await query('SELECT * FROM workspace_tasks WHERE id = $1 AND user_id = $2;', [id, userId]);
  if (!check.rows[0]) return null;
  const t = check.rows[0];

  const title = data.title !== undefined ? data.title.trim() : t.title;
  const status = data.status !== undefined ? data.status : t.status;
  const priority = data.priority !== undefined ? data.priority : t.priority;
  const dueDate = data.dueDate || data.due_date || t.due_date;

  await query(`
    UPDATE workspace_tasks
    SET title = $1, status = $2, priority = $3, due_date = $4, updated_at = NOW()
    WHERE id = $5 AND user_id = $6;
  `, [title, status, priority, dueDate, id, userId]);
  const res = await query('SELECT * FROM workspace_tasks WHERE id = $1;', [id]);
  return res.rows[0];
}

async function deleteWorkspaceTask(userId, id) {
  const res = await query('DELETE FROM workspace_tasks WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return res.rows.length > 0;
}

async function createWorkspaceNote(userId, { title, content, subject, tags, link, isPinned }) {
  const id = crypto.randomUUID();
  await query(`
    INSERT INTO workspace_notes (id, user_id, title, content, subject, tags, link, is_pinned, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW());
  `, [id, userId, title.trim(), content || '', subject || 'General', tags || '', link || '', isPinned ? 1 : 0]);
  const res = await query('SELECT * FROM workspace_notes WHERE id = $1;', [id]);
  return res.rows[0];
}

async function updateWorkspaceNote(userId, id, data) {
  const check = await query('SELECT * FROM workspace_notes WHERE id = $1 AND user_id = $2;', [id, userId]);
  if (!check.rows[0]) return null;
  const n = check.rows[0];

  const title = data.title !== undefined ? data.title.trim() : n.title;
  const content = data.content !== undefined ? data.content : n.content;
  const isPinned = data.isPinned !== undefined ? (data.isPinned ? 1 : 0) : n.is_pinned;

  await query(`
    UPDATE workspace_notes
    SET title = $1, content = $2, is_pinned = $3, updated_at = NOW()
    WHERE id = $4 AND user_id = $5;
  `, [title, content, isPinned, id, userId]);
  const res = await query('SELECT * FROM workspace_notes WHERE id = $1;', [id]);
  return res.rows[0];
}

async function deleteWorkspaceNote(userId, id) {
  const res = await query('DELETE FROM workspace_notes WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return res.rows.length > 0;
}

async function createWorkspaceAssignment(userId, { title, description, dueDate, priority, status, link }) {
  const id = crypto.randomUUID();
  await query(`
    INSERT INTO workspace_assignments (id, user_id, title, description, due_date, priority, status, link, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW());
  `, [id, userId, title.trim(), description || '', dueDate || '', priority || 'medium', status || 'pending', link || '']);
  const res = await query('SELECT * FROM workspace_assignments WHERE id = $1;', [id]);
  return res.rows[0];
}

async function updateWorkspaceAssignment(userId, id, data) {
  const check = await query('SELECT * FROM workspace_assignments WHERE id = $1 AND user_id = $2;', [id, userId]);
  if (!check.rows[0]) return null;
  const a = check.rows[0];

  const title = data.title !== undefined ? data.title.trim() : a.title;
  const status = data.status !== undefined ? data.status : a.status;

  await query(`
    UPDATE workspace_assignments
    SET title = $1, status = $2, updated_at = NOW()
    WHERE id = $3 AND user_id = $4;
  `, [title, status, id, userId]);
  const res = await query('SELECT * FROM workspace_assignments WHERE id = $1;', [id]);
  return res.rows[0];
}

async function deleteWorkspaceAssignment(userId, id) {
  const res = await query('DELETE FROM workspace_assignments WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return res.rows.length > 0;
}

async function saveWorkspaceSnippet(userId, { name, language, code, input }) {
  const id = crypto.randomUUID();
  await query(`
    INSERT INTO workspace_snippets (id, user_id, name, language, code, input, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW());
  `, [id, userId, name || 'Untitled Snippet', language || 'javascript', code || '', input || '']);
  const res = await query('SELECT * FROM workspace_snippets WHERE id = $1;', [id]);
  return res.rows[0];
}

async function deleteWorkspaceSnippet(userId, id) {
  const res = await query('DELETE FROM workspace_snippets WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return res.rows.length > 0;
}

async function addWorkspaceBookmark(userId, { itemId, itemType, title, url, category }) {
  const id = crypto.randomUUID();
  await query(`
    INSERT INTO workspace_bookmarks (id, user_id, item_id, item_type, title, url, category, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());
  `, [id, userId, itemId || '', itemType || 'link', title || 'Bookmark', url || '', category || 'General']);
  const res = await query('SELECT * FROM workspace_bookmarks WHERE id = $1;', [id]);
  return res.rows[0];
}

async function deleteWorkspaceBookmark(userId, id) {
  const res = await query('DELETE FROM workspace_bookmarks WHERE id = $1 AND user_id = $2 RETURNING id;', [id, userId]);
  return res.rows.length > 0;
}

// ================= PARTICIPANTS & CERTIFICATES =================
async function findParticipantByEmail(email, eventSlug = 'orca-coders-orcathon-2026') {
  if (!email) return null;
  const res = await query('SELECT * FROM event_participants WHERE LOWER(candidate_email) = LOWER($1) AND event_slug = $2 LIMIT 1;', [email.trim(), eventSlug]);
  return res.rows[0] || null;
}

async function findParticipantByEmailAndName(email, name, eventSlug = 'orca-coders-orcathon-2026') {
  if (!email && !name) return null;
  const res = await query(`
    SELECT * FROM event_participants
    WHERE event_slug = $1
      AND (LOWER(candidate_email) = LOWER($2) OR LOWER(candidate_name) = LOWER($3))
    LIMIT 1;
  `, [eventSlug, (email || '').trim(), (name || '').trim()]);
  return res.rows[0] || null;
}

async function findParticipantByEmailOrName(email, name, eventSlug = 'orca-coders-orcathon-2026') {
  const eClean = (email || '').trim().toLowerCase();
  const nClean = (name || '').trim().toLowerCase();
  if (!eClean && !nClean) return null;

  if (eClean && nClean) {
    const res = await query(`
      SELECT * FROM event_participants
      WHERE event_slug = $1
        AND (LOWER(candidate_email) = $2 OR LOWER(candidate_name) = $3 OR LOWER(candidate_name) LIKE $4)
      ORDER BY id ASC LIMIT 1;
    `, [eventSlug, eClean, nClean, `%${nClean}%`]);
    return res.rows[0] || null;
  }
  if (eClean) {
    const res = await query(`
      SELECT * FROM event_participants
      WHERE event_slug = $1
        AND (LOWER(candidate_email) = $2 OR LOWER(candidate_name) = $2 OR LOWER(candidate_name) LIKE $3)
      ORDER BY id ASC LIMIT 1;
    `, [eventSlug, eClean, `%${eClean}%`]);
    return res.rows[0] || null;
  }
  if (nClean) {
    const res = await query(`
      SELECT * FROM event_participants
      WHERE event_slug = $1
        AND (LOWER(candidate_name) = $2 OR LOWER(candidate_name) LIKE $3 OR LOWER(candidate_email) = $2)
      ORDER BY id ASC LIMIT 1;
    `, [eventSlug, nClean, `%${nClean}%`]);
    return res.rows[0] || null;
  }
  return null;
}

async function getIssuedCertificateById(credentialId) {
  if (!credentialId) return null;
  const res = await query('SELECT * FROM issued_certificates WHERE credential_id = $1 LIMIT 1;', [credentialId.trim()]);
  return res.rows[0] || null;
}

async function getIssuedCertificateByEmail(email, eventSlug = 'orca-coders-orcathon-2026') {
  if (!email) return null;
  const res = await query('SELECT * FROM issued_certificates WHERE LOWER(recipient_email) = LOWER($1) AND event_slug = $2 ORDER BY created_at DESC LIMIT 1;', [email.trim(), eventSlug]);
  return res.rows[0] || null;
}

async function getIssuedCertificateByEmailOrName(email, name, eventSlug = 'orca-coders-orcathon-2026') {
  const eClean = (email || '').trim().toLowerCase();
  const nClean = (name || '').trim().toLowerCase();
  if (!eClean && !nClean) return null;

  if (eClean && nClean) {
    const res = await query(`
      SELECT * FROM issued_certificates
      WHERE event_slug = $1
        AND (LOWER(recipient_email) = $2 OR LOWER(recipient_name) = $3 OR LOWER(recipient_name) LIKE $4)
      ORDER BY created_at DESC LIMIT 1;
    `, [eventSlug, eClean, nClean, `%${nClean}%`]);
    return res.rows[0] || null;
  }
  if (eClean) {
    const res = await query(`
      SELECT * FROM issued_certificates
      WHERE event_slug = $1
        AND (LOWER(recipient_email) = $2 OR LOWER(recipient_name) = $2 OR LOWER(recipient_name) LIKE $3)
      ORDER BY created_at DESC LIMIT 1;
    `, [eventSlug, eClean, `%${eClean}%`]);
    return res.rows[0] || null;
  }
  if (nClean) {
    const res = await query(`
      SELECT * FROM issued_certificates
      WHERE event_slug = $1
        AND (LOWER(recipient_name) = $2 OR LOWER(recipient_name) LIKE $3 OR LOWER(recipient_email) = $2)
      ORDER BY created_at DESC LIMIT 1;
    `, [eventSlug, nClean, `%${nClean}%`]);
    return res.rows[0] || null;
  }
  return null;
}

async function issueCertificate({ participantId, recipientName, recipientEmail, recipientOrganisation, eventSlug = 'orca-coders-orcathon-2026', certificateType = 'Participation', issueDate = 'October 25, 2026', status = 'Valid' }) {
  const existing = await getIssuedCertificateByEmailOrName(recipientEmail, recipientName, eventSlug);
  if (existing) return existing;

  const num = String(participantId || '1').padStart(4, '0');
  let hash = 0;
  const str = recipientEmail.toLowerCase().trim() + '-' + num;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').slice(-4);
  const credentialId = `DH-ORCA-2026-${num}-${hex}`;

  const res = await query(`
    INSERT INTO issued_certificates (
      credential_id, event_slug, participant_id, recipient_name,
      recipient_email, recipient_organisation, certificate_type, issue_date, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (credential_id) DO UPDATE SET status = EXCLUDED.status
    RETURNING *;
  `, [credentialId, eventSlug, String(participantId || ''), recipientName.trim(), recipientEmail.toLowerCase().trim(), (recipientOrganisation || 'Participant').trim(), certificateType, issueDate, status]);

  return res.rows[0];
}

async function countParticipants(eventSlug = 'orca-coders-orcathon-2026') {
  const res = await query('SELECT COUNT(*)::int as count FROM event_participants WHERE event_slug = $1;', [eventSlug]);
  return res.rows[0] ? res.rows[0].count : 0;
}

async function countIssuedCertificates(eventSlug = 'orca-coders-orcathon-2026') {
  const res = await query('SELECT COUNT(*)::int as count FROM issued_certificates WHERE event_slug = $1;', [eventSlug]);
  return res.rows[0] ? res.rows[0].count : 0;
}

// ================= EMAIL VERIFICATIONS (RESEND OTP) =================
async function getEmailVerification(userId) {
  const res = await query('SELECT * FROM email_verifications WHERE user_id = $1 LIMIT 1;', [userId]);
  return res.rows[0] || null;
}

async function saveEmailVerification(userId, email, challengeId, codeHash, expiresAt) {
  const now = new Date().toISOString();
  const existing = await getEmailVerification(userId);

  let sendCount = 1;
  let hourStartedAt = now;

  if (existing && existing.hour_started_at) {
    const elapsed = Date.now() - new Date(existing.hour_started_at).getTime();
    if (elapsed < 3600000) {
      sendCount = (existing.send_count || 0) + 1;
      hourStartedAt = existing.hour_started_at;
    }
  }

  await query(`
    INSERT INTO email_verifications (user_id, email, challenge_id, code_hash, expires_at, sent_at, attempts, state, hour_started_at, send_count)
    VALUES ($1, $2, $3, $4, $5, $6, 0, 'pending', $7, $8)
    ON CONFLICT (user_id)
    DO UPDATE SET
      email = EXCLUDED.email,
      challenge_id = EXCLUDED.challenge_id,
      code_hash = EXCLUDED.code_hash,
      expires_at = EXCLUDED.expires_at,
      sent_at = EXCLUDED.sent_at,
      attempts = 0,
      state = 'pending',
      hour_started_at = EXCLUDED.hour_started_at,
      send_count = EXCLUDED.send_count;
  `, [userId, email.toLowerCase().trim(), challengeId, codeHash, expiresAt, now, hourStartedAt, sendCount]);

  return getEmailVerification(userId);
}

async function markEmailVerified(userId) {
  const now = new Date().toISOString();
  await query(`
    UPDATE email_verifications
    SET state = 'verified', verified_at = $1, code_hash = NULL, expires_at = NULL
    WHERE user_id = $2;
  `, [now, userId]);
  return getEmailVerification(userId);
}

async function recordOtpAttempt(userId, success) {
  if (success) {
    return markEmailVerified(userId);
  }
  const existing = await getEmailVerification(userId);
  const attempts = (existing ? existing.attempts : 0) + 1;
  const state = attempts >= 5 ? 'locked' : 'pending';

  await query(`
    UPDATE email_verifications
    SET attempts = $1, state = $2
    WHERE user_id = $3;
  `, [attempts, state, userId]);

  return getEmailVerification(userId);
}

async function updateUserPassword(userId, passwordHash, salt) {
  await query('UPDATE users SET password_hash = $1, salt = $2, updated_at = NOW() WHERE id = $3', [passwordHash, salt, userId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  return true;
}

async function getUserSummaryStats(userId) {
  const [lessonsRes, challengesRes, projectsRes] = await Promise.all([
    query("SELECT COUNT(*)::int as count FROM lesson_progress WHERE user_id = $1 AND status = 'completed'", [userId]),
    query("SELECT COUNT(DISTINCT challenge_id)::int as count FROM submissions WHERE user_id = $1 AND status = 'passed'", [userId]),
    query("SELECT COUNT(*)::int as count FROM projects WHERE user_id = $1", [userId])
  ]);
  return {
    completedLessons: lessonsRes.rows[0]?.count || 0,
    solvedChallenges: challengesRes.rows[0]?.count || 0,
    submittedProjects: projectsRes.rows[0]?.count || 0
  };
}

async function getUserProjects(userId, status = 'approved') {
  const res = await query(
    'SELECT id, title, description, category, tech_stack_json, repo_url, demo_url, votes_count FROM projects WHERE user_id = $1 AND status = $2',
    [userId, status]
  );
  return res.rows.map(p => ({
    ...p,
    techStack: typeof p.tech_stack_json === 'string' ? JSON.parse(p.tech_stack_json || '[]') : (p.tech_stack_json || [])
  }));
}

module.exports = {
  provider: 'postgresql',
  pool,
  query,
  isConnected,
  calculateLevel,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  createUser,
  updateUserProfile,
  updateStreak,
  createSession,
  getSession,
  deleteSession,
  awardXp,
  getUserTotalXp,
  getXpHistory,
  getLeaderboard,
  getCourses,
  getCourseById,
  getCourseLessons,
  getLessonById,
  getLessonProgress,
  saveLessonProgress,
  getChallenges,
  getChallengeById,
  recordSubmission,
  getUserSubmissions,
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  incrementProjectVotes,
  toggleProjectVote,
  toggleProjectBookmark,
  getUserInteractions,
  getAchievements,
  getUserAchievements,
  checkAndUnlockAchievements,
  getUserSettings,
  saveUserSettings,
  getWorkspaceData,
  createWorkspaceTask,
  updateWorkspaceTask,
  deleteWorkspaceTask,
  createWorkspaceNote,
  updateWorkspaceNote,
  deleteWorkspaceNote,
  createWorkspaceAssignment,
  updateWorkspaceAssignment,
  deleteWorkspaceAssignment,
  saveWorkspaceSnippet,
  deleteWorkspaceSnippet,
  addWorkspaceBookmark,
  deleteWorkspaceBookmark,
  findParticipantByEmail,
  findParticipantByEmailAndName,
  findParticipantByEmailOrName,
  getIssuedCertificateById,
  getIssuedCertificateByEmail,
  getIssuedCertificateByEmailOrName,
  issueCertificate,
  countParticipants,
  countIssuedCertificates,
  getEmailVerification,
  saveEmailVerification,
  markEmailVerified,
  recordOtpAttempt,
  updateUserPassword,
  getUserSummaryStats,
  getUserProjects
};
