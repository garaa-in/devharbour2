/**
 * Dev Harbour - Authoritative Database & Data Layer
 * Uses Node v24 built-in DatabaseSync for persistent relational storage.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'devharbour.sqlite');

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode & foreign keys for optimal concurrency and integrity
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

// Initialize Database Schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'moderator', 'admin')),
      avatar_url TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      location TEXT DEFAULT '',
      github_url TEXT DEFAULT '',
      portfolio_url TEXT DEFAULT '',
      streak_days INTEGER DEFAULT 0,
      last_active_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'mercury')),
      email_notifications INTEGER DEFAULT 1,
      profile_public INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      provider TEXT NOT NULL,
      level TEXT DEFAULT 'Beginner',
      external_url TEXT NOT NULL,
      duration_hours INTEGER DEFAULT 10,
      rating REAL DEFAULT 4.8,
      is_featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      reading_time_mins INTEGER DEFAULT 10,
      order_index INTEGER DEFAULT 1,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, order_index);

    CREATE TABLE IF NOT EXISTS lesson_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
      reading_seconds INTEGER DEFAULT 0,
      completed_at TEXT,
      UNIQUE(user_id, lesson_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
      category TEXT NOT NULL,
      time_estimate TEXT DEFAULT '20 min',
      description TEXT NOT NULL,
      examples_json TEXT NOT NULL DEFAULT '[]',
      starter_code_js TEXT NOT NULL,
      solution_template TEXT DEFAULT '',
      public_tests_json TEXT NOT NULL DEFAULT '[]',
      hidden_tests_json TEXT NOT NULL DEFAULT '[]',
      xp_reward INTEGER DEFAULT 25,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      language TEXT DEFAULT 'javascript',
      status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'timeout')),
      execution_time_ms INTEGER DEFAULT 0,
      passed_tests INTEGER DEFAULT 0,
      total_tests INTEGER DEFAULT 0,
      error_message TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_user_challenge ON submissions(user_id, challenge_id);

    CREATE TABLE IF NOT EXISTS xp_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL CHECK (amount > 0),
      source_type TEXT NOT NULL CHECK (source_type IN ('lesson_complete', 'challenge_pass', 'project_submit', 'achievement_unlock', 'streak_bonus')),
      reference_id TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, source_type, reference_id)
    );

    CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_xp_ledger_created ON xp_ledger(created_at);

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      badge_icon TEXT DEFAULT 'trophy',
      xp_bonus INTEGER DEFAULT 50,
      condition_type TEXT NOT NULL,
      condition_value INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
      unlocked_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      tech_stack_json TEXT NOT NULL DEFAULT '[]',
      repo_url TEXT NOT NULL,
      demo_url TEXT DEFAULT '',
      votes_count INTEGER DEFAULT 0,
      bookmarks_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

    CREATE TABLE IF NOT EXISTS project_votes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS project_bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, project_id)
    );
    CREATE TABLE IF NOT EXISTS workspace_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT DEFAULT 'General',
      priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      due_date TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ws_tasks_user ON workspace_tasks(user_id, status);

    CREATE TABLE IF NOT EXISTS workspace_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      subject TEXT DEFAULT 'General',
      tags TEXT DEFAULT '',
      link TEXT DEFAULT '',
      is_pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ws_notes_user ON workspace_notes(user_id, is_pinned);

    CREATE TABLE IF NOT EXISTS workspace_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      due_date TEXT,
      priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
      link TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ws_assignments_user ON workspace_assignments(user_id, status);

    CREATE TABLE IF NOT EXISTS workspace_snippets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      language TEXT DEFAULT 'javascript',
      code TEXT NOT NULL,
      input TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ws_snippets_user ON workspace_snippets(user_id);

    CREATE TABLE IF NOT EXISTS workspace_bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT,
      item_type TEXT DEFAULT 'resource',
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, url)
    );
    CREATE INDEX IF NOT EXISTS idx_ws_bookmarks_user ON workspace_bookmarks(user_id);
  `);
}

// Seed Initial Data (Courses, Lessons, Challenges, Achievements, Sample Projects)
function seedDatabase() {
  // 1. Seed Courses
  const coursesCount = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
  if (coursesCount === 0) {
    const coursesFile = path.join(__dirname, 'data', 'courses.json');
    if (fs.existsSync(coursesFile)) {
      const courses = JSON.parse(fs.readFileSync(coursesFile, 'utf8'));
      const stmt = db.prepare(`
        INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of courses) {
        stmt.run(c.id, c.title, c.description, c.category, c.provider, c.level, c.external_url, c.duration_hours, c.rating, c.is_featured ? 1 : 0);
      }
    }
  }

  // 2. Seed Lessons
  const lessonsCount = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
  if (lessonsCount === 0) {
    const lessonsFile = path.join(__dirname, 'data', 'lessons.json');
    if (fs.existsSync(lessonsFile)) {
      const lessons = JSON.parse(fs.readFileSync(lessonsFile, 'utf8'));
      const stmt = db.prepare(`
        INSERT INTO lessons (id, course_id, title, slug, reading_time_mins, order_index, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const l of lessons) {
        stmt.run(l.id, l.course_id, l.title, l.slug, l.reading_time_mins, l.order_index, l.content);
      }
    }
  }

  // 3. Seed Challenges
  const challengesCount = db.prepare('SELECT COUNT(*) as count FROM challenges').get().count;
  if (challengesCount === 0) {
    const challengesFile = path.join(__dirname, 'data', 'challenges.json');
    if (fs.existsSync(challengesFile)) {
      const challenges = JSON.parse(fs.readFileSync(challengesFile, 'utf8'));
      const stmt = db.prepare(`
        INSERT INTO challenges (id, title, slug, difficulty, category, time_estimate, description, examples_json, starter_code_js, public_tests_json, hidden_tests_json, xp_reward)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ch of challenges) {
        stmt.run(
          ch.id,
          ch.title,
          ch.slug,
          ch.difficulty,
          ch.category,
          ch.time_estimate,
          ch.description,
          JSON.stringify(ch.examples_json),
          ch.starter_code_js,
          JSON.stringify(ch.public_tests_json),
          JSON.stringify(ch.hidden_tests_json),
          ch.xp_reward
        );
      }
    }
  }

  // 4. Seed Achievements
  const achievementsCount = db.prepare('SELECT COUNT(*) as count FROM achievements').get().count;
  if (achievementsCount === 0) {
    const achievementsFile = path.join(__dirname, 'data', 'achievements.json');
    if (fs.existsSync(achievementsFile)) {
      const achievements = JSON.parse(fs.readFileSync(achievementsFile, 'utf8'));
      const stmt = db.prepare(`
        INSERT INTO achievements (id, key, title, description, badge_icon, xp_bonus, condition_type, condition_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of achievements) {
        stmt.run(a.id, a.key, a.title, a.description, a.badge_icon, a.xp_bonus, a.condition_type, a.condition_value);
      }
    }
  }

  // 5. Seed Initial Admin & Sample Profiles if none exist
  const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (usersCount === 0) {
    const demoSalt = crypto.randomBytes(16).toString('hex');
    const demoHash = crypto.scryptSync('Password123!', demoSalt, 64).toString('hex');

    // Admin user: Parth
    const adminId = 'usr-admin-parth';
    db.prepare(`
      INSERT INTO users (id, email, username, full_name, password_hash, salt, role, bio, github_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminId,
      'parthvgidde@gmail.com',
      'parth',
      'Parth Gidde',
      demoHash,
      demoSalt,
      'admin',
      'Co-Founder & Managing Director @ Dev Harbour',
      'https://github.com/parthvgidde'
    );

    db.prepare(`
      INSERT INTO user_settings (user_id, theme, email_notifications, profile_public)
      VALUES (?, 'light', 1, 1)
    `).run(adminId);

    // Initial Community Seed Users (clearly labelled sample accounts)
    const seedUsers = [
      { id: 'usr-ayesha', email: 'ayesha.sample@devharbour.in', username: 'ayesha', name: 'Ayesha Khan', role: 'student', xp: 17120 },
      { id: 'usr-kabir', email: 'kabir.sample@devharbour.in', username: 'kabir', name: 'Kabir Verma', role: 'student', xp: 15900 },
      { id: 'usr-mei', email: 'mei.sample@devharbour.in', username: 'mei', name: 'Mei Chen', role: 'student', xp: 18400 },
      { id: 'usr-nora', email: 'nora.sample@devharbour.in', username: 'nora', name: 'Nora Davis', role: 'student', xp: 13300 }
    ];

    for (const su of seedUsers) {
      db.prepare(`
        INSERT INTO users (id, email, username, full_name, password_hash, salt, role, bio)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(su.id, su.email, su.username, su.name, demoHash, demoSalt, su.role, 'Developer in Dev Harbour community.');

      db.prepare(`
        INSERT INTO user_settings (user_id, theme) VALUES (?, 'light')
      `).run(su.id);

      // Seed initial verifiable ledger entry
      db.prepare(`
        INSERT INTO xp_ledger (id, user_id, amount, source_type, reference_id, note, created_at)
        VALUES (?, ?, ?, 'challenge_pass', 'challenge-two-sum', 'Sample seed achievement', datetime('now', '-2 days'))
      `).run(crypto.randomUUID(), su.id, su.xp);
    }

    // Seed Sample Projects (all starting at 0 real likes)
    const sampleProjects = [
      {
        id: 'prj-emergency-e-card',
        userId: adminId,
        title: 'Emergency E-Card',
        desc: 'Full-stack emergency response app with medical profile, SOS alerts, nearby responders and live location sharing.',
        category: 'Web',
        tech: ['React', 'Node.js', 'Express', 'MongoDB'],
        repo: 'https://github.com/mohammed-hasan-ECE/emergency-e-card',
        demo: 'https://emergency-e-card-1.onrender.com',
        votes: 0
      },
      {
        id: 'prj-lively',
        userId: adminId,
        title: 'Lively!',
        desc: 'A community app for writers to publish stories, poems, quotes and journals, and find readers who actually read.',
        category: 'Mobile',
        tech: ['Android', 'React Native', 'Mobile', 'Node.js'],
        repo: 'https://www.readinlively.com',
        demo: 'https://www.readinlively.com',
        votes: 0
      },
      {
        id: 'prj-pipos',
        userId: adminId,
        title: 'PipOS — Candy Dreams',
        desc: 'A playful pastel dream-world web app with a dream arcade, lullaby music box, dream journal, star store and an animated companion called Pip.',
        category: 'Web, Game',
        tech: ['Web', 'Game', 'JavaScript', 'Audio API', 'Canvas'],
        repo: 'https://shimmering-sherbet-b774ae.netlify.app',
        demo: 'https://shimmering-sherbet-b774ae.netlify.app',
        votes: 0
      },
      {
        id: 'prj-orbit-notes',
        userId: adminId,
        title: 'Orbit Notes',
        desc: 'Markdown notes application with real-time multi-device sync and KaTeX math rendering.',
        category: 'Web',
        tech: ['JavaScript', 'Markdown', 'WebSockets'],
        repo: 'https://github.com/RujulaSharma/devharbour.in',
        demo: 'https://devharbour.in',
        votes: 0
      },
      {
        id: 'prj-tide',
        userId: 'usr-ayesha',
        title: 'Tide Habit Tracker',
        desc: 'A gentle, privacy-first habit tracker with streak analytics and SQLite persistence.',
        category: 'Mobile',
        tech: ['React Native', 'SQLite', 'Notifications'],
        repo: 'https://github.com/RujulaSharma/devharbour.in',
        demo: 'https://devharbour.in',
        votes: 0
      },
      {
        id: 'prj-hullcheck',
        userId: 'usr-mei',
        title: 'Hullcheck Port Scanner',
        desc: 'An educational network socket inspector and port reconnaissance tool for cybersecurity students.',
        category: 'Security',
        tech: ['Python', 'Sockets', 'Networking'],
        repo: 'https://github.com/RujulaSharma/devharbour.in',
        demo: 'https://devharbour.in',
        votes: 0
      }
    ];

    for (const p of sampleProjects) {
      db.prepare(`
        INSERT INTO projects (id, user_id, title, description, category, tech_stack_json, repo_url, demo_url, votes_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')
      `).run(p.id, p.userId, p.title, p.desc, p.category, JSON.stringify(p.tech), p.repo, p.demo, p.votes);
    }
  }
}

// Level computation from XP thresholds:
// Level 1: 0, Level 2: 100, Level 3: 250, Level 4: 500, Level 5: 1000, Level 6: 1800, etc.
function calculateLevel(xp) {
  if (xp < 100) return 1;
  if (xp < 250) return 2;
  if (xp < 500) return 3;
  if (xp < 1000) return 4;
  if (xp < 1800) return 5;
  if (xp < 3000) return 6;
  if (xp < 5000) return 7;
  if (xp < 8000) return 8;
  if (xp < 12000) return 9;
  return 10 + Math.floor((xp - 12000) / 5000);
}

// ----------------- Data Access Helpers -----------------

// User Helpers
function getUserById(id) {
  return db.prepare('SELECT id, email, username, full_name, role, avatar_url, bio, location, github_url, portfolio_url, streak_days, last_active_date, created_at FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
}

function createUser({ email, username, fullName, passwordHash, salt, role = 'student', location = '', bio = '' }) {
  const id = 'usr-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO users (id, email, username, full_name, password_hash, salt, role, location, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.trim().toLowerCase(), username.trim().toLowerCase(), fullName.trim(), passwordHash, salt, role, (location || '').trim(), (bio || '').trim());

  db.prepare(`
    INSERT INTO user_settings (user_id, theme) VALUES (?, 'light')
  `).run(id);

  return getUserById(id);
}

function updateUserProfile(userId, { fullName, bio, githubUrl, portfolioUrl, location, avatarUrl }) {
  db.prepare(`
    UPDATE users
    SET full_name = COALESCE(?, full_name),
        bio = COALESCE(?, bio),
        github_url = COALESCE(?, github_url),
        portfolio_url = COALESCE(?, portfolio_url),
        location = COALESCE(?, location),
        avatar_url = COALESCE(?, avatar_url),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(fullName, bio, githubUrl, portfolioUrl, location, avatarUrl, userId);

  return getUserById(userId);
}

function updateStreak(userId) {
  const user = getUserById(userId);
  if (!user) return 0;
  const today = new Date().toISOString().slice(0, 10);
  if (user.last_active_date === today) {
    return user.streak_days;
  }

  let streak = user.streak_days || 0;
  if (user.last_active_date) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (user.last_active_date === yesterday) {
      streak += 1;
    } else {
      streak = 1; // streak reset
    }
  } else {
    streak = 1;
  }

  db.prepare('UPDATE users SET streak_days = ?, last_active_date = ? WHERE id = ?').run(streak, today, userId);
  return streak;
}

// Session Helpers
function createSession(userId) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const expiryDays = parseInt(process.env.TOKEN_EXPIRY_DAYS || '7', 10);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, token, expiresAt);

  return { token, expiresAt };
}

function getSession(token) {
  if (!token) return null;
  const session = db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, u.role, u.username, u.email
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
  `).get(token);
  return session;
}

function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// XP Ledger & Calculations (Authoritative source of truth)
function awardXp(userId, amount, sourceType, referenceId, note = '') {
  try {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO xp_ledger (id, user_id, amount, source_type, reference_id, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, amount, sourceType, referenceId, note);

    const totalXp = getUserTotalXp(userId);
    const level = calculateLevel(totalXp);
    updateStreak(userId);
    checkAndUnlockAchievements(userId);

    return { awarded: true, amount, currentXp: totalXp, level };
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      // Duplicate event - no repeated XP
      const totalXp = getUserTotalXp(userId);
      return { awarded: false, reason: 'Already awarded for this activity', currentXp: totalXp, level: calculateLevel(totalXp) };
    }
    throw err;
  }
}

function getUserTotalXp(userId) {
  const row = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM xp_ledger WHERE user_id = ?').get(userId);
  return row ? row.total : 0;
}

function getXpHistory(userId, limit = 20) {
  return db.prepare(`
    SELECT id, amount, source_type, reference_id, note, created_at
    FROM xp_ledger
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, limit);
}

// Leaderboard Helper (Weekly, Monthly, All-time derived directly from XP Ledger)
function getLeaderboard(timeframe = 'All-time', limit = 20) {
  let dateFilter = '';
  if (timeframe === 'Weekly') {
    dateFilter = "AND l.created_at >= datetime('now', '-7 days')";
  } else if (timeframe === 'Monthly') {
    dateFilter = "AND l.created_at >= datetime('now', '-30 days')";
  }

  const query = `
    SELECT
      u.id as user_id,
      u.username,
      u.full_name,
      u.avatar_url,
      COALESCE(SUM(l.amount), 0) as total_xp,
      COUNT(DISTINCT CASE WHEN l.source_type = 'challenge_pass' THEN l.reference_id END) as challenges_solved,
      u.streak_days
    FROM users u
    LEFT JOIN xp_ledger l ON u.id = l.user_id ${dateFilter}
    GROUP BY u.id
    ORDER BY total_xp DESC, challenges_solved DESC, u.created_at ASC
    LIMIT ?
  `;

  const rows = db.prepare(query).all(limit);
  return rows.map((r, idx) => ({
    rank: idx + 1,
    userId: r.user_id,
    username: r.username,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    xp: r.total_xp,
    level: calculateLevel(r.total_xp),
    challengesSolved: r.challenges_solved,
    streakDays: r.streak_days
  }));
}

// Courses & Lessons
function getCourses(category = null) {
  if (category && category !== 'All') {
    return db.prepare('SELECT * FROM courses WHERE category = ? ORDER BY is_featured DESC, rating DESC').all(category);
  }
  return db.prepare('SELECT * FROM courses ORDER BY is_featured DESC, rating DESC').all();
}

function getCourseById(courseId) {
  return db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
}

function getCourseLessons(courseId) {
  return db.prepare('SELECT id, course_id, title, slug, reading_time_mins, order_index FROM lessons WHERE course_id = ? ORDER BY order_index ASC').all(courseId);
}

function getLessonById(lessonId) {
  return db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
}

function getLessonProgress(userId, lessonId) {
  return db.prepare('SELECT * FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(userId, lessonId);
}

function saveLessonProgress(userId, lessonId, readingSeconds, markCompleted = false) {
  const existing = getLessonProgress(userId, lessonId);
  const status = markCompleted ? 'completed' : (existing ? existing.status : 'in_progress');
  const completedAt = markCompleted ? new Date().toISOString() : (existing ? existing.completed_at : null);

  db.prepare(`
    INSERT INTO lesson_progress (id, user_id, lesson_id, status, reading_seconds, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET
      status = excluded.status,
      reading_seconds = lesson_progress.reading_seconds + excluded.reading_seconds,
      completed_at = COALESCE(excluded.completed_at, lesson_progress.completed_at)
  `).run(crypto.randomUUID(), userId, lessonId, status, readingSeconds, completedAt);

  let xpResult = null;
  if (markCompleted) {
    // Reading lesson reward policy: 10 XP awarded strictly once
    xpResult = awardXp(userId, 10, 'lesson_complete', lessonId, 'Completed reading lesson');
  }

  return { progress: getLessonProgress(userId, lessonId), xp: xpResult };
}

// Coding Challenges
function getChallenges(category = null, difficulty = null, search = '') {
  let query = 'SELECT id, title, slug, difficulty, category, time_estimate, description, xp_reward FROM challenges WHERE 1=1';
  const params = [];

  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }
  if (difficulty && difficulty !== 'All') {
    query += ' AND difficulty = ?';
    params.push(difficulty);
  }
  if (search) {
    query += ' AND (title LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY id ASC';

  return db.prepare(query).all(...params);
}

function getChallengeById(id, includeHidden = false) {
  const ch = db.prepare('SELECT * FROM challenges WHERE id = ? OR slug = ?').get(id, id);
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

function recordSubmission({ userId, challengeId, code, language, status, executionTimeMs, passedTests, totalTests, errorMessage }) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO submissions (id, user_id, challenge_id, code, language, status, execution_time_ms, passed_tests, total_tests, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, challengeId, code, language, status, executionTimeMs, passedTests, totalTests, errorMessage || '');

  let xpResult = null;
  if (status === 'passed') {
    const ch = getChallengeById(challengeId, false);
    const xpReward = ch ? ch.xpReward : 25;
    // Coding challenge pass reward: awarded strictly once per challenge
    xpResult = awardXp(userId, xpReward, 'challenge_pass', challengeId, `Passed challenge ${ch ? ch.title : challengeId}`);
  }

  return { submissionId: id, status, xp: xpResult };
}

function getUserSubmissions(userId, challengeId = null) {
  if (challengeId) {
    return db.prepare('SELECT * FROM submissions WHERE user_id = ? AND challenge_id = ? ORDER BY created_at DESC').all(userId, challengeId);
  }
  return db.prepare('SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(userId);
}

// Featured Projects
function getProjects({ category = 'All', search = '', status = 'approved' } = {}) {
  let query = `
    SELECT
      p.id, p.title, p.description, p.category, p.tech_stack_json,
      p.repo_url, p.demo_url, p.votes_count, p.bookmarks_count, p.status, p.created_at,
      u.id as owner_id, u.username as owner_username, u.full_name as owner_name, u.avatar_url as owner_avatar
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.status = ?
  `;
  const params = [status];

  if (category && category !== 'All') {
    query += ' AND p.category = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND (p.title LIKE ? OR p.description LIKE ? OR p.tech_stack_json LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ' ORDER BY p.votes_count DESC, p.created_at DESC';

  const rows = db.prepare(query).all(...params);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    techStack: JSON.parse(r.tech_stack_json || '[]'),
    repoUrl: r.repo_url,
    demoUrl: r.demo_url,
    votesCount: r.votes_count,
    bookmarksCount: r.bookmarks_count,
    status: r.status,
    createdAt: r.created_at,
    owner: {
      id: r.owner_id,
      username: r.owner_username,
      fullName: r.owner_name,
      avatarUrl: r.owner_avatar
    }
  }));
}

function getProjectById(projectId) {
  const r = db.prepare(`
    SELECT
      p.id, p.user_id, p.title, p.description, p.category, p.tech_stack_json,
      p.repo_url, p.demo_url, p.votes_count, p.bookmarks_count, p.status, p.created_at,
      u.username as owner_username, u.full_name as owner_name, u.avatar_url as owner_avatar
    FROM projects p
    JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(projectId);

  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    description: r.description,
    category: r.category,
    techStack: JSON.parse(r.tech_stack_json || '[]'),
    repoUrl: r.repo_url,
    demoUrl: r.demo_url,
    votesCount: r.votes_count,
    bookmarksCount: r.bookmarks_count,
    status: r.status,
    createdAt: r.created_at,
    owner: {
      id: r.user_id,
      username: r.owner_username,
      fullName: r.owner_name,
      avatarUrl: r.owner_avatar
    }
  };
}

function createProject({ userId, title, description, category, techStack = [], repoUrl, demoUrl = '' }) {
  const id = 'prj-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO projects (id, user_id, title, description, category, tech_stack_json, repo_url, demo_url, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')
  `).run(id, userId, title.trim(), description.trim(), category.trim(), JSON.stringify(techStack), repoUrl.trim(), demoUrl ? demoUrl.trim() : '');

  // Award XP for project creation (+50 XP, once per project)
  awardXp(userId, 50, 'project_submit', id, `Submitted project: ${title}`);

  return getProjectById(id);
}

function updateProject(projectId, userId, { title, description, category, techStack, repoUrl, demoUrl }) {
  const project = getProjectById(projectId);
  if (!project) return null;
  if (project.userId !== userId) throw new Error('Unauthorized');

  db.prepare(`
    UPDATE projects
    SET title = COALESCE(?, title),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        tech_stack_json = COALESCE(?, tech_stack_json),
        repo_url = COALESCE(?, repo_url),
        demo_url = COALESCE(?, demo_url),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title ? title.trim() : null,
    description ? description.trim() : null,
    category ? category.trim() : null,
    techStack ? JSON.stringify(techStack) : null,
    repoUrl ? repoUrl.trim() : null,
    demoUrl ? demoUrl.trim() : null,
    projectId
  );

  return getProjectById(projectId);
}

function deleteProject(projectId, userId, isAdmin = false) {
  const project = getProjectById(projectId);
  if (!project) return false;
  if (!isAdmin && project.userId !== userId) throw new Error('Unauthorized');

  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  return true;
}

function incrementProjectVotes(projectId) {
  db.prepare('UPDATE projects SET votes_count = votes_count + 1 WHERE id = ?').run(projectId);
  return getProjectById(projectId);
}

function toggleProjectVote(userId, projectId) {
  const existing = db.prepare('SELECT id FROM project_votes WHERE user_id = ? AND project_id = ?').get(userId, projectId);
  if (existing) {
    db.prepare('DELETE FROM project_votes WHERE user_id = ? AND project_id = ?').run(userId, projectId);
    db.prepare('UPDATE projects SET votes_count = MAX(0, votes_count - 1) WHERE id = ?').run(projectId);
    return { voted: false, votesCount: getProjectById(projectId).votesCount };
  } else {
    db.prepare('INSERT INTO project_votes (id, user_id, project_id) VALUES (?, ?, ?)').run(crypto.randomUUID(), userId, projectId);
    db.prepare('UPDATE projects SET votes_count = votes_count + 1 WHERE id = ?').run(projectId);
    // Award 5 XP for community voting engagement (once per project vote)
    awardXp(userId, 5, 'project_submit', `vote-${projectId}`, 'Voted on community project');
    return { voted: true, votesCount: getProjectById(projectId).votesCount };
  }
}

function toggleProjectBookmark(userId, projectId) {
  const existing = db.prepare('SELECT id FROM project_bookmarks WHERE user_id = ? AND project_id = ?').get(userId, projectId);
  if (existing) {
    db.prepare('DELETE FROM project_bookmarks WHERE user_id = ? AND project_id = ?').run(userId, projectId);
    db.prepare('UPDATE projects SET bookmarks_count = MAX(0, bookmarks_count - 1) WHERE id = ?').run(projectId);
    return { bookmarked: false, bookmarksCount: getProjectById(projectId).bookmarksCount };
  } else {
    db.prepare('INSERT INTO project_bookmarks (id, user_id, project_id) VALUES (?, ?, ?)').run(crypto.randomUUID(), userId, projectId);
    db.prepare('UPDATE projects SET bookmarks_count = bookmarks_count + 1 WHERE id = ?').run(projectId);
    return { bookmarked: true, bookmarksCount: getProjectById(projectId).bookmarksCount };
  }
}

function getUserInteractions(userId) {
  const votes = db.prepare('SELECT project_id FROM project_votes WHERE user_id = ?').all(userId).map(v => v.project_id);
  const bookmarks = db.prepare('SELECT project_id FROM project_bookmarks WHERE user_id = ?').all(userId).map(b => b.project_id);
  return { votes, bookmarks };
}

// Achievements & Automatic Unlocks
function checkAndUnlockAchievements(userId) {
  const achievements = db.prepare('SELECT * FROM achievements').all();
  const unlocked = [];

  for (const ach of achievements) {
    // Check if already unlocked
    const exists = db.prepare('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?').get(userId, ach.id);
    if (exists) continue;

    let qualifies = false;
    if (ach.condition_type === 'lessons_completed') {
      const count = db.prepare("SELECT COUNT(*) as count FROM lesson_progress WHERE user_id = ? AND status = 'completed'").get(userId).count;
      qualifies = count >= ach.condition_value;
    } else if (ach.condition_type === 'challenges_passed') {
      const count = db.prepare("SELECT COUNT(DISTINCT challenge_id) as count FROM submissions WHERE user_id = ? AND status = 'passed'").get(userId).count;
      qualifies = count >= ach.condition_value;
    } else if (ach.condition_type === 'projects_submitted') {
      const count = db.prepare('SELECT COUNT(*) as count FROM projects WHERE user_id = ?').get(userId).count;
      qualifies = count >= ach.condition_value;
    } else if (ach.condition_type === 'projects_voted') {
      const count = db.prepare('SELECT COUNT(*) as count FROM project_votes WHERE user_id = ?').get(userId).count;
      qualifies = count >= ach.condition_value;
    }

    if (qualifies) {
      db.prepare('INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (?, ?, ?)').run(crypto.randomUUID(), userId, ach.id);
      awardXp(userId, ach.xp_bonus, 'achievement_unlock', ach.id, `Unlocked achievement: ${ach.title}`);
      unlocked.push(ach);
    }
  }

  return unlocked;
}

function getUserAchievements(userId) {
  return db.prepare(`
    SELECT a.id, a.key, a.title, a.description, a.badge_icon, a.xp_bonus, ua.unlocked_at
    FROM user_achievements ua
    JOIN achievements a ON ua.achievement_id = a.id
    WHERE ua.user_id = ?
    ORDER BY ua.unlocked_at DESC
  `).all(userId);
}

// User Settings
function getUserSettings(userId) {
  return db.prepare('SELECT theme, email_notifications, profile_public FROM user_settings WHERE user_id = ?').get(userId) || { theme: 'light', email_notifications: 1, profile_public: 1 };
}

function saveUserSettings(userId, { theme, emailNotifications, profilePublic }) {
  db.prepare(`
    INSERT INTO user_settings (user_id, theme, email_notifications, profile_public)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      theme = COALESCE(excluded.theme, user_settings.theme),
      email_notifications = COALESCE(excluded.email_notifications, user_settings.email_notifications),
      profile_public = COALESCE(excluded.profile_public, user_settings.profile_public),
      updated_at = datetime('now')
  `).run(
    userId,
    theme || 'light',
    emailNotifications !== undefined ? (emailNotifications ? 1 : 0) : 1,
    profilePublic !== undefined ? (profilePublic ? 1 : 0) : 1
  );
  return getUserSettings(userId);
}

// Run schema setup and seed on load
initSchema();
seedDatabase();

// ==========================================
// Workspace Data Operations
// ==========================================
function getWorkspaceData(userId) {
  const tasks = db.prepare('SELECT * FROM workspace_tasks WHERE user_id = ? ORDER BY status ASC, due_date ASC, created_at DESC').all(userId);
  const notes = db.prepare('SELECT * FROM workspace_notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC').all(userId);
  const assignments = db.prepare('SELECT * FROM workspace_assignments WHERE user_id = ? ORDER BY due_date ASC, created_at DESC').all(userId);
  const snippets = db.prepare('SELECT * FROM workspace_snippets WHERE user_id = ? ORDER BY updated_at DESC').all(userId);
  const bookmarks = db.prepare('SELECT * FROM workspace_bookmarks WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  return { tasks, notes, assignments, snippets, bookmarks };
}

function createWorkspaceTask(userId, { title, subject, priority, dueDate }) {
  const id = 'tsk-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO workspace_tasks (id, user_id, title, subject, priority, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, userId, title.trim(), (subject || 'General').trim(), priority || 'medium', dueDate || null);
  return db.prepare('SELECT * FROM workspace_tasks WHERE id = ?').get(id);
}

function updateWorkspaceTask(userId, taskId, { title, subject, priority, dueDate, status }) {
  const existing = db.prepare('SELECT * FROM workspace_tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
  if (!existing) return null;
  const newTitle = title !== undefined ? title.trim() : existing.title;
  const newSubject = subject !== undefined ? subject.trim() : existing.subject;
  const newPriority = priority !== undefined ? priority : existing.priority;
  const newDueDate = dueDate !== undefined ? dueDate : existing.due_date;
  const newStatus = status !== undefined ? status : existing.status;
  db.prepare(`
    UPDATE workspace_tasks
    SET title = ?, subject = ?, priority = ?, due_date = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(newTitle, newSubject, newPriority, newDueDate, newStatus, taskId, userId);
  return db.prepare('SELECT * FROM workspace_tasks WHERE id = ?').get(taskId);
}

function deleteWorkspaceTask(userId, taskId) {
  const result = db.prepare('DELETE FROM workspace_tasks WHERE id = ? AND user_id = ?').run(taskId, userId);
  return result.changes > 0;
}

function createWorkspaceNote(userId, { title, content, subject, tags, link, isPinned }) {
  const id = 'not-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO workspace_notes (id, user_id, title, content, subject, tags, link, is_pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, title.trim(), (content || '').trim(), (subject || 'General').trim(), (tags || '').trim(), (link || '').trim(), isPinned ? 1 : 0);
  return db.prepare('SELECT * FROM workspace_notes WHERE id = ?').get(id);
}

function updateWorkspaceNote(userId, noteId, { title, content, subject, tags, link, isPinned }) {
  const existing = db.prepare('SELECT * FROM workspace_notes WHERE id = ? AND user_id = ?').get(noteId, userId);
  if (!existing) return null;
  const newTitle = title !== undefined ? title.trim() : existing.title;
  const newContent = content !== undefined ? content.trim() : existing.content;
  const newSubject = subject !== undefined ? subject.trim() : existing.subject;
  const newTags = tags !== undefined ? tags.trim() : existing.tags;
  const newLink = link !== undefined ? link.trim() : existing.link;
  const newPinned = isPinned !== undefined ? (isPinned ? 1 : 0) : existing.is_pinned;
  db.prepare(`
    UPDATE workspace_notes
    SET title = ?, content = ?, subject = ?, tags = ?, link = ?, is_pinned = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(newTitle, newContent, newSubject, newTags, newLink, newPinned, noteId, userId);
  return db.prepare('SELECT * FROM workspace_notes WHERE id = ?').get(noteId);
}

function deleteWorkspaceNote(userId, noteId) {
  const result = db.prepare('DELETE FROM workspace_notes WHERE id = ? AND user_id = ?').run(noteId, userId);
  return result.changes > 0;
}

function createWorkspaceAssignment(userId, { title, description, dueDate, priority, status, link }) {
  const id = 'asg-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO workspace_assignments (id, user_id, title, description, due_date, priority, status, link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, title.trim(), (description || '').trim(), dueDate || null, priority || 'medium', status || 'pending', (link || '').trim());
  return db.prepare('SELECT * FROM workspace_assignments WHERE id = ?').get(id);
}

function updateWorkspaceAssignment(userId, assignmentId, { title, description, dueDate, priority, status, link }) {
  const existing = db.prepare('SELECT * FROM workspace_assignments WHERE id = ? AND user_id = ?').get(assignmentId, userId);
  if (!existing) return null;
  const newTitle = title !== undefined ? title.trim() : existing.title;
  const newDesc = description !== undefined ? description.trim() : existing.description;
  const newDueDate = dueDate !== undefined ? dueDate : existing.due_date;
  const newPriority = priority !== undefined ? priority : existing.priority;
  const newStatus = status !== undefined ? status : existing.status;
  const newLink = link !== undefined ? link.trim() : existing.link;
  db.prepare(`
    UPDATE workspace_assignments
    SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, link = ?, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(newTitle, newDesc, newDueDate, newPriority, newStatus, newLink, assignmentId, userId);
  return db.prepare('SELECT * FROM workspace_assignments WHERE id = ?').get(assignmentId);
}

function deleteWorkspaceAssignment(userId, assignmentId) {
  const result = db.prepare('DELETE FROM workspace_assignments WHERE id = ? AND user_id = ?').run(assignmentId, userId);
  return result.changes > 0;
}

function saveWorkspaceSnippet(userId, { name, language, code, input }) {
  const id = 'snp-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO workspace_snippets (id, user_id, name, language, code, input)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, name.trim(), language || 'javascript', code, input || '');
  return db.prepare('SELECT * FROM workspace_snippets WHERE id = ?').get(id);
}

function deleteWorkspaceSnippet(userId, snippetId) {
  const result = db.prepare('DELETE FROM workspace_snippets WHERE id = ? AND user_id = ?').run(snippetId, userId);
  return result.changes > 0;
}

function addWorkspaceBookmark(userId, { itemId, itemType, title, url, category }) {
  const id = 'bmk-' + crypto.randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO workspace_bookmarks (id, user_id, item_id, item_type, title, url, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, url) DO UPDATE SET title = excluded.title
  `).run(id, userId, itemId || null, itemType || 'resource', title.trim(), url.trim(), category || 'general');
  return db.prepare('SELECT * FROM workspace_bookmarks WHERE user_id = ? AND url = ?').get(userId, url.trim());
}

function deleteWorkspaceBookmark(userId, bookmarkId) {
  const result = db.prepare('DELETE FROM workspace_bookmarks WHERE id = ? AND user_id = ?').run(bookmarkId, userId);
  return result.changes > 0;
}




module.exports = {
  db,
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
  checkAndUnlockAchievements,
  getUserAchievements,
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
  deleteWorkspaceBookmark
};
