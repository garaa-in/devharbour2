-- ====================================================================
-- DEV HARBOUR — COMPLETE SUPABASE / POSTGRESQL PRODUCTION SCHEMA
-- ====================================================================

-- Enable pgcrypto / uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'moderator', 'admin')),
    avatar_url TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    github_url TEXT DEFAULT '',
    portfolio_url TEXT DEFAULT '',
    location TEXT DEFAULT '',
    streak_days INT DEFAULT 0,
    last_active_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 3. USER SETTINGS
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'mercury')),
    email_notifications BOOLEAN DEFAULT TRUE,
    profile_public BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. COURSES
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    provider TEXT NOT NULL,
    level TEXT DEFAULT 'Beginner',
    external_url TEXT NOT NULL,
    duration_hours INT DEFAULT 10,
    rating NUMERIC(3, 1) DEFAULT 4.8,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);

-- 5. READING LESSONS
CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    reading_time_mins INT DEFAULT 10,
    order_index INT DEFAULT 1,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id, order_index);

-- 6. LESSON PROGRESS
CREATE TABLE IF NOT EXISTS lesson_progress (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    reading_seconds INT DEFAULT 0,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_user_lesson UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user ON lesson_progress(user_id);

-- 7. CODING CHALLENGES
CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    category TEXT NOT NULL,
    time_estimate TEXT DEFAULT '20 min',
    description TEXT NOT NULL,
    examples_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    starter_code_js TEXT NOT NULL,
    solution_template TEXT DEFAULT '',
    public_tests_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    hidden_tests_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    xp_reward INT DEFAULT 25,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_challenges_difficulty ON challenges(difficulty);
CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category);

-- 8. CODE SUBMISSIONS
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    language TEXT DEFAULT 'javascript',
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'timeout')),
    execution_time_ms INT DEFAULT 0,
    passed_tests INT DEFAULT 0,
    total_tests INT DEFAULT 0,
    error_message TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_challenge ON submissions(challenge_id);

-- 9. AUDITABLE XP LEDGER
CREATE TABLE IF NOT EXISTS xp_ledger (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL CHECK (amount > 0),
    source_type TEXT NOT NULL CHECK (source_type IN ('lesson_complete', 'challenge_pass', 'project_submit', 'achievement_unlock', 'streak_bonus')),
    reference_id TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_xp_event UNIQUE (user_id, source_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_user ON xp_ledger(user_id);

-- 10. ACHIEVEMENTS
CREATE TABLE IF NOT EXISTS achievements (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    badge_icon TEXT DEFAULT 'trophy',
    xp_bonus INT DEFAULT 50,
    condition_type TEXT NOT NULL,
    condition_value INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. USER ACHIEVEMENTS
CREATE TABLE IF NOT EXISTS user_achievements (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_achievement UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- 12. PROJECTS
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    tech_stack_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    repo_url TEXT NOT NULL,
    demo_url TEXT DEFAULT '',
    votes_count INT DEFAULT 0,
    bookmarks_count INT DEFAULT 0,
    status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- 13. PROJECT VOTES & BOOKMARKS
CREATE TABLE IF NOT EXISTS project_votes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_vote UNIQUE (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS project_bookmarks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_bookmark UNIQUE (user_id, project_id)
);

-- 14. WORKSPACE TASKS
CREATE TABLE IF NOT EXISTS workspace_tasks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
    status TEXT DEFAULT 'Todo' CHECK (status IN ('Todo', 'In Progress', 'In Review', 'Completed')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_user ON workspace_tasks(user_id);

-- 15. WORKSPACE NOTES
CREATE TABLE IF NOT EXISTS workspace_notes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Note',
    content TEXT DEFAULT '',
    category TEXT DEFAULT 'General',
    is_pinned BOOLEAN DEFAULT FALSE,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_notes_user ON workspace_notes(user_id);

-- 16. WORKSPACE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS workspace_assignments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    course_id TEXT,
    submission_url TEXT DEFAULT '',
    grade TEXT DEFAULT '',
    feedback TEXT DEFAULT '',
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Submitted', 'Graded', 'Returned')),
    due_date TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_assignments_user ON workspace_assignments(user_id);

-- 17. WORKSPACE SNIPPETS
CREATE TABLE IF NOT EXISTS workspace_snippets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    language TEXT DEFAULT 'javascript',
    code TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_snippets_user ON workspace_snippets(user_id);

-- 18. WORKSPACE BOOKMARKS
CREATE TABLE IF NOT EXISTS workspace_bookmarks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    category TEXT DEFAULT 'Resources',
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_bookmarks_user ON workspace_bookmarks(user_id);

-- 19. EVENT PARTICIPANTS (HACKATHONS / ORCATHON 2026)
CREATE TABLE IF NOT EXISTS event_participants (
    id BIGSERIAL PRIMARY KEY,
    event_slug TEXT NOT NULL DEFAULT 'orca-coders-orcathon-2026',
    team_id TEXT DEFAULT '',
    team_name TEXT DEFAULT '',
    candidate_role TEXT DEFAULT 'Participant',
    candidate_name TEXT NOT NULL,
    candidate_email TEXT NOT NULL,
    candidate_mobile TEXT DEFAULT '',
    candidate_location TEXT DEFAULT '',
    candidate_organisation TEXT DEFAULT '',
    is_eligible BOOLEAN DEFAULT TRUE,
    registered_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_event_participant UNIQUE (event_slug, candidate_email)
);

CREATE INDEX IF NOT EXISTS idx_event_participants_email ON event_participants(event_slug, candidate_email);

-- 20. ISSUED CERTIFICATES (OFFICIAL CREDENTIAL REGISTRY)
CREATE TABLE IF NOT EXISTS issued_certificates (
    credential_id TEXT PRIMARY KEY,
    event_slug TEXT NOT NULL DEFAULT 'orca-coders-orcathon-2026',
    participant_id TEXT,
    recipient_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    recipient_organisation TEXT DEFAULT '',
    certificate_type TEXT NOT NULL DEFAULT 'Participation',
    issue_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Valid',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_issued_cert_email UNIQUE (event_slug, recipient_email)
);

CREATE INDEX IF NOT EXISTS idx_issued_certs_email ON issued_certificates(event_slug, recipient_email);
CREATE INDEX IF NOT EXISTS idx_issued_certs_id ON issued_certificates(credential_id);

-- 21. CERTIFICATE OTPs
CREATE TABLE IF NOT EXISTS certificate_otps (
    id BIGSERIAL PRIMARY KEY,
    event_slug TEXT NOT NULL DEFAULT 'orca-coders-orcathon-2026',
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) FOR SUPABASE
-- ====================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE issued_certificates ENABLE ROW LEVEL SECURITY;

-- Public read policies for catalog, projects & certificates
CREATE POLICY "Public can view courses" ON courses FOR SELECT USING (true);
CREATE POLICY "Public can view lessons" ON lessons FOR SELECT USING (true);
CREATE POLICY "Public can view challenges" ON challenges FOR SELECT USING (true);
CREATE POLICY "Public can view achievements" ON achievements FOR SELECT USING (true);
CREATE POLICY "Public can view approved projects" ON projects FOR SELECT USING (status = 'approved');
CREATE POLICY "Public can verify issued certificates" ON issued_certificates FOR SELECT USING (true);
CREATE POLICY "Public can view basic profiles" ON users FOR SELECT USING (true);
CREATE POLICY "Public can view event participants" ON event_participants FOR SELECT USING (true);

-- Service role / all-access policy for backend execution
CREATE POLICY "Service role full access on users" ON users FOR ALL USING (true);
CREATE POLICY "Service role full access on sessions" ON sessions FOR ALL USING (true);
CREATE POLICY "Service role full access on settings" ON user_settings FOR ALL USING (true);
CREATE POLICY "Service role full access on progress" ON lesson_progress FOR ALL USING (true);
CREATE POLICY "Service role full access on submissions" ON submissions FOR ALL USING (true);
CREATE POLICY "Service role full access on xp" ON xp_ledger FOR ALL USING (true);
CREATE POLICY "Service role full access on user_achievements" ON user_achievements FOR ALL USING (true);
CREATE POLICY "Service role full access on projects" ON projects FOR ALL USING (true);
CREATE POLICY "Service role full access on certificates" ON issued_certificates FOR ALL USING (true);
CREATE POLICY "Service role full access on participants" ON event_participants FOR ALL USING (true);
CREATE POLICY "Service role full access on workspace_tasks" ON workspace_tasks FOR ALL USING (true);
CREATE POLICY "Service role full access on workspace_notes" ON workspace_notes FOR ALL USING (true);
