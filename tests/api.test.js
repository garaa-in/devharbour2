/**
 * Dev Harbour - Automated Full-Stack Integration Test Suite
 * Tests Auth, Security, Database Persistence, Challenge Endpoint Protection, XP Ledger,
 * Leaderboard, Projects, and Reading Mode.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3099';

const app = require('../server/index');
const db = require('../server/db');

let server;
const BASE_URL = 'http://localhost:3099/api';

test.before(async () => {
  await new Promise(resolve => {
    server = app.listen(3099, resolve);
  });
});

test.after(async () => {
  await new Promise(resolve => {
    server.close(resolve);
  });
});

// Helper for making API requests
async function api(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

test('1. System Health Check', async () => {
  const { status, data } = await api('/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(data.status, 'healthy');
  assert.strictEqual(data.platform, 'Dev Harbour');
});

test('2. Authentication Flow: Signup, Login, Profile & Session Persistence', async () => {
  const testUser = {
    email: `student_${Date.now()}@devharbour.in`,
    username: `dev_${Date.now().toString().slice(-6)}`,
    fullName: 'Test Developer',
    password: 'Password123!'
  };

  // Signup
  const signupRes = await api('/auth/signup', {
    method: 'POST',
    body: testUser
  });
  assert.strictEqual(signupRes.status, 201);
  assert.ok(signupRes.data.token);
  assert.strictEqual(signupRes.data.user.email, testUser.email.toLowerCase());
  assert.strictEqual(signupRes.data.user.role, 'student');

  await db.markEmailVerified(signupRes.data.user.id);

  const token = signupRes.data.token;

  // Duplicate email registration prevention
  const dupRes = await api('/auth/signup', {
    method: 'POST',
    body: testUser
  });
  assert.strictEqual(dupRes.status, 409);

  // Login
  const loginRes = await api('/auth/login', {
    method: 'POST',
    body: { login: testUser.email, password: testUser.password }
  });
  assert.strictEqual(loginRes.status, 200);
  assert.ok(loginRes.data.token);

  // Authenticated profile verification (/me)
  const meRes = await api('/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual(meRes.data.user.username, testUser.username.toLowerCase());
  assert.strictEqual(meRes.data.user.totalXp, 0);
  assert.strictEqual(meRes.data.user.level, 1);
});

test('3. Real Course Catalog & Official Links Integrity', async () => {
  const { status, data } = await api('/courses');
  assert.strictEqual(status, 200);
  assert.ok(Array.isArray(data.courses));
  assert.ok(data.courses.length >= 6);

  // Verify that courses link to verified official domains
  for (const course of data.courses) {
    assert.ok(course.external_url.startsWith('https://'));
    assert.ok(course.provider.length > 0);
  }
});

test('4. Reading Mode & Anti-Duplicate XP Verification', async () => {
  // Create student
  const student = {
    email: `reader_${Date.now()}@devharbour.in`,
    username: `reader_${Date.now().toString().slice(-6)}`,
    fullName: 'Avid Reader',
    password: 'Password123!'
  };
  const { data: { token, user } } = await api('/auth/signup', { method: 'POST', body: student });
  await db.markEmailVerified(user.id);

  const lessonId = 'lesson-cs50-1';

  // Read lesson details
  const lessonRes = await api(`/courses/lesson/${lessonId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(lessonRes.status, 200);
  assert.strictEqual(lessonRes.data.lesson.id, lessonId);
  assert.ok(lessonRes.data.lesson.content.length > 50);

  // Mark lesson complete - First time awards 10 XP
  const comp1 = await api(`/courses/lesson/${lessonId}/complete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(comp1.status, 200);
  assert.strictEqual(comp1.data.xp.awarded, true);
  assert.strictEqual(comp1.data.xp.amount, 10);
  assert.strictEqual(comp1.data.xp.currentXp, 10);

  // Mark lesson complete again - MUST NOT award duplicate XP
  const comp2 = await api(`/courses/lesson/${lessonId}/complete`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  assert.strictEqual(comp2.status, 200);
  assert.strictEqual(comp2.data.xp.awarded, false);
  assert.ok(comp2.data.xp.currentXp >= 10);
});

test('5. Challenge submissions reject anonymous execution', async () => {
  const submission = await api('/challenges/challenge-two-sum/submit', {
    method: 'POST',
    body: { code: 'function twoSum() { return [0, 1]; }' }
  });
  assert.strictEqual(submission.status, 401);
});

test('6. Verified users cannot execute code on the web server', async () => {
  const student = {
    email: `coder_${Date.now()}@devharbour.in`,
    username: `coder_${Date.now().toString().slice(-6)}`,
    fullName: 'Code Challenger',
    password: 'Password123!'
  };
  const { data: { token, user } } = await api('/auth/signup', { method: 'POST', body: student });
  await db.markEmailVerified(user.id);

  const submission = await api('/challenges/challenge-two-sum/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: { code: 'function twoSum() { return [0, 1]; }' }
  });
  assert.strictEqual(submission.status, 503);
  assert.match(submission.data.error, /grading is temporarily unavailable/i);
});

test('7. Leaderboard Calculation & Timeframe Integrity', async () => {
  const res = await api('/leaderboard?timeframe=All-time');
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.data.rankings));
  assert.ok(res.data.rankings.length > 0);

  // Ranks must be sorted strictly descending by XP
  for (let i = 1; i < res.data.rankings.length; i++) {
    assert.ok(res.data.rankings[i - 1].xp >= res.data.rankings[i].xp);
  }
});

test('8. Featured Projects: Publishing, Voting, Bookmarks & Deletion Security', async () => {
  const author = {
    email: `builder_${Date.now()}@devharbour.in`,
    username: `build_${Date.now().toString().slice(-6)}`,
    fullName: 'Project Builder',
    password: 'Password123!'
  };
  const { data: { token: authorToken, user: authorUser } } = await api('/auth/signup', { method: 'POST', body: author });
  await db.markEmailVerified(authorUser.id);

  // Create Project
  const prjData = {
    title: 'Pulse Analytics',
    description: 'An open-source real-time event analytics dashboard for webapps.',
    category: 'Web',
    techStack: ['Node.js', 'PostgreSQL', 'WebSockets'],
    repoUrl: 'https://github.com/RujulaSharma/devharbour.in',
    demoUrl: 'https://devharbour.in'
  };

  const createRes = await api('/projects', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authorToken}` },
    body: prjData
  });
  assert.strictEqual(createRes.status, 201);
  assert.strictEqual(createRes.data.project.title, prjData.title);
  const projectId = createRes.data.project.id;

  // Vote on Project
  const vote1 = await api(`/projects/${projectId}/vote`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authorToken}` }
  });
  assert.strictEqual(vote1.status, 200);
  assert.strictEqual(vote1.data.voted, true);
  assert.strictEqual(vote1.data.votesCount, 1);

  // Toggle Vote (Unvote)
  const vote2 = await api(`/projects/${projectId}/vote`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authorToken}` }
  });
  assert.strictEqual(vote2.status, 200);
  assert.strictEqual(vote2.data.voted, false);
  assert.strictEqual(vote2.data.votesCount, 0);

  // Bookmark Project
  const bm1 = await api(`/projects/${projectId}/bookmark`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authorToken}` }
  });
  assert.strictEqual(bm1.status, 200);
  assert.strictEqual(bm1.data.bookmarked, true);

  // Unauthorized delete attempt by another student
  const otherStudent = {
    email: `intruder_${Date.now()}@devharbour.in`,
    username: `intrude_${Date.now().toString().slice(-6)}`,
    fullName: 'Other User',
    password: 'Password123!'
  };
  const { data: { token: otherToken, user: otherUser } } = await api('/auth/signup', { method: 'POST', body: otherStudent });
  await db.markEmailVerified(otherUser.id);

  const unauthorizedDel = await api(`/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${otherToken}` }
  });
  assert.strictEqual(unauthorizedDel.status, 403);

  // Authorized delete by owner
  const authorizedDel = await api(`/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authorToken}` }
  });
  assert.strictEqual(authorizedDel.status, 200);
});

test('9. User Settings & Theme Synchronization', async () => {
  const student = {
    email: `settings_${Date.now()}@devharbour.in`,
    username: `set_${Date.now().toString().slice(-6)}`,
    fullName: 'Settings User',
    password: 'Password123!'
  };
  const { data: { token, user } } = await api('/auth/signup', { method: 'POST', body: student });
  await db.markEmailVerified(user.id);

  // Update theme to mercury
  const updateRes = await api('/user/settings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: { theme: 'mercury', emailNotifications: false, profilePublic: true }
  });
  assert.strictEqual(updateRes.status, 200);
  assert.strictEqual(updateRes.data.settings.theme, 'mercury');
  assert.strictEqual(updateRes.data.settings.email_notifications, 0);
});
