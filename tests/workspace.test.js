const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Helper to send HTTP requests to the running server
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch(e) { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('Workspace API Endpoints Suite', async (t) => {
  // 1. Create a test user and obtain auth token
  const testEmail = `wstest_${Date.now()}@example.com`;
  const testUser = `wstest_${Date.now().toString(36)}`;
  const signupRes = await request('POST', '/api/auth/signup', {
    fullName: 'Workspace Tester',
    username: testUser,
    email: testEmail,
    password: 'Password123!',
    role: 'student'
  });

  assert.equal(signupRes.status, 201, 'User signup should return 201');
  const token = signupRes.body.token;
  assert.ok(token, 'Signup should provide a JWT token');
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // 2. Test GET /api/workspace initial state
  await t.test('GET /api/workspace returns initial empty structure', async () => {
    const res = await request('GET', '/api/workspace', null, authHeaders);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.tasks));
    assert.ok(Array.isArray(res.body.notes));
    assert.ok(Array.isArray(res.body.assignments));
    assert.ok(Array.isArray(res.body.snippets));
    assert.ok(Array.isArray(res.body.bookmarks));
  });

  // 3. Test Task CRUD
  let createdTaskId;
  await t.test('POST /api/workspace/tasks creates a task', async () => {
    const res = await request('POST', '/api/workspace/tasks', {
      title: 'Study Dynamic Programming',
      subject: 'Algorithms',
      priority: 'high',
      due_date: '2026-10-30',
      status: 'pending'
    }, authHeaders);

    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.title, 'Study Dynamic Programming');
    createdTaskId = res.body.id;
  });

  await t.test('PUT /api/workspace/tasks updates a task', async () => {
    const res = await request('PUT', `/api/workspace/tasks/${createdTaskId}`, {
      title: 'Study Dynamic Programming - Completed',
      status: 'completed',
      priority: 'high'
    }, authHeaders);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'completed');
  });

  // 4. Test Note CRUD
  let createdNoteId;
  await t.test('POST /api/workspace/notes creates a note', async () => {
    const res = await request('POST', '/api/workspace/notes', {
      title: 'CSS Grid Notes',
      subject: 'Web Dev',
      tags: 'code, frontend',
      content: 'Grid template columns 1fr 2fr',
      link_url: 'https://developer.mozilla.org',
      is_pinned: 1
    }, authHeaders);

    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.is_pinned, 1);
    createdNoteId = res.body.id;
  });

  // 5. Test Assignment CRUD
  let createdAsgId;
  await t.test('POST /api/workspace/assignments creates an assignment', async () => {
    const res = await request('POST', '/api/workspace/assignments', {
      title: 'Operating Systems Shell Project',
      subject: 'CS301',
      description: 'Build a POSIX compliant shell with pipes and redirection',
      deadline: '2026-11-05',
      priority: 'high',
      status: 'in_progress',
      link_url: 'https://github.com'
    }, authHeaders);

    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    createdAsgId = res.body.id;
  });

  // 6. Test Snippet CRUD
  let createdSnippetId;
  await t.test('POST /api/workspace/snippets saves a code snippet', async () => {
    const res = await request('POST', '/api/workspace/snippets', {
      title: 'Quick Sort Prototype',
      language: 'JavaScript',
      code: 'function qs(a){ if(a.length<=1)return a; }',
      input_data: '[5, 2, 8, 1]'
    }, authHeaders);

    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    createdSnippetId = res.body.id;
  });

  // 7. Test Bookmark CRUD
  let createdBmkId;
  await t.test('POST /api/workspace/bookmarks creates a bookmark', async () => {
    const res = await request('POST', '/api/workspace/bookmarks', {
      title: 'Algorithms Learning Path',
      category: 'course',
      target_url: '#v-learn',
      description: 'Complete DSA path'
    }, authHeaders);

    assert.equal(res.status, 201);
    assert.ok(res.body.id);
    createdBmkId = res.body.id;
  });

  // 8. Test DELETE on items
  await t.test('DELETE items cleanly removes them', async () => {
    const delTask = await request('DELETE', `/api/workspace/tasks/${createdTaskId}`, null, authHeaders);
    assert.equal(delTask.status, 200);

    const delNote = await request('DELETE', `/api/workspace/notes/${createdNoteId}`, null, authHeaders);
    assert.equal(delNote.status, 200);

    const delAsg = await request('DELETE', `/api/workspace/assignments/${createdAsgId}`, null, authHeaders);
    assert.equal(delAsg.status, 200);

    const delSnp = await request('DELETE', `/api/workspace/snippets/${createdSnippetId}`, null, authHeaders);
    assert.equal(delSnp.status, 200);

    const delBmk = await request('DELETE', `/api/workspace/bookmarks/${createdBmkId}`, null, authHeaders);
    assert.equal(delBmk.status, 200);
  });
});
