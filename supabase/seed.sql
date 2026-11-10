-- ====================================================================
-- DEV HARBOUR — SUPABASE PUBLIC CATALOG SEED
-- ====================================================================

-- SEED: courses (8 records)
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-cs50', 'CS50: Introduction to Computer Science', 'An introduction to the intellectual enterprises of computer science and the art of programming from Harvard University.', 'Computer Science', 'edX / Harvard', 'Beginner', 'https://www.edx.org/learn/computer-science/harvard-university-cs50-s-introduction-to-computer-science', 36, 4.9, TRUE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-fcc-python', 'Scientific Computing with Python', 'Learn Python fundamentals, data structures, algorithm design, and scientific calculation from freeCodeCamp.', 'Data Science', 'freeCodeCamp', 'Beginner', 'https://www.freecodecamp.org/learn/scientific-computing-with-python/', 30, 4.8, TRUE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-meta-frontend', 'Meta Front-End Developer Certificate', 'Professional certificate program covering HTML5, CSS3, JavaScript modern standards, React, and UX design.', 'Web Development', 'Coursera / Meta', 'Intermediate', 'https://www.coursera.org/professional-certificates/meta-front-end-developer', 45, 4.8, TRUE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-ms-cybersecurity', 'Microsoft Cybersecurity Analyst Professional Certificate', 'Official Microsoft training for foundational network security, threat vectors, risk mitigation, and compliance.', 'Cybersecurity', 'Coursera / Microsoft', 'Beginner', 'https://www.coursera.org/professional-certificates/microsoft-cybersecurity-analyst', 40, 4.7, TRUE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-fullstack-open', 'Full Stack Open: Deep Dive Into Modern Web Development', 'University of Helsinki''s acclaimed open curriculum on React, Redux, Node.js, REST APIs, GraphQL, and TypeScript.', 'Full Stack', 'University of Helsinki', 'Advanced', 'https://fullstackopen.com/en/', 60, 5.0, TRUE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-ms-git', 'Introduction to Git and GitHub', 'Master version control, branches, pull requests, merge conflict resolution, and collaborative workflows.', 'DevOps', 'Microsoft Learn', 'Beginner', 'https://learn.microsoft.com/en-us/training/modules/introduction-to-git/', 8, 4.9, FALSE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-docker-fcc', 'Docker and Containerization for Beginners', 'Understand container virtualization, Dockerfiles, multi-stage builds, volumes, and Docker Compose orchestration.', 'DevOps', 'freeCodeCamp', 'Intermediate', 'https://www.freecodecamp.org/news/docker-training-course-for-beginners/', 12, 4.8, FALSE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, description, category, provider, level, external_url, duration_hours, rating, is_featured, created_at) VALUES ('course-google-data', 'Google Data Analytics Professional Certificate', 'Gain hands-on skills in data cleaning, SQL analysis, R programming, and data storytelling.', 'Data Science', 'Coursera / Google', 'Beginner', 'https://www.coursera.org/professional-certificates/google-data-analytics', 50, 4.8, FALSE, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;

-- SEED: lessons (4 records)
INSERT INTO lessons (id, course_id, title, slug, reading_time_mins, order_index, content, created_at) VALUES ('lesson-cs50-1', 'course-cs50', 'Computational Thinking & Algorithm Complexity', 'computational-thinking', 12, 1, '## Introduction to Computational Thinking

Computational thinking is a problem-solving methodology that breaks complex challenges into systematic steps that a machine or human can execute. It consists of four foundational pillars:

1. **Decomposition:** Breaking a large system into isolated, manageable components.
2. **Pattern Recognition:** Observing trends and shared characteristics across problems.
3. **Abstraction:** Focusing exclusively on critical data while filtering extraneous implementation noise.
4. **Algorithm Design:** Formulating an unambiguous, step-by-step sequence of instructions.

### The Anatomy of Binary Search

Consider searching for a target integer within a sorted array of $N$ items. A naive linear scan evaluates each element one by one, scaling at $O(N)$ operations in the worst case.

Binary search achieves exponential efficiency by halving the search space at each iteration:

```javascript
function binarySearch(arr, target) {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const guess = arr[mid];

    if (guess === target) {
      return mid; // Target found at index
    } else if (guess > target) {
      high = mid - 1; // Discard upper half
    } else {
      low = mid + 1; // Discard lower half
    }
  }
  return -1; // Target not found
}
```

### Big-O Complexity Comparison

- **Constant Time $O(1)$:** Array index lookup, hash map key access.
- **Logarithmic Time $O(\log N)$:** Binary search, balanced tree traversal.
- **Linear Time $O(N)$:** Single pass loop over unsorted collection.
- **Quadratic Time $O(N^2)$:** Nested loops, naive bubble sort.

### Self-Check Questions
- Why must the input array be sorted before applying binary search?
- What is the maximum number of comparisons needed to find a number in a sorted array of 1,024 items? *(Answer: $\log_2(1024) = 10$)*', '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO lessons (id, course_id, title, slug, reading_time_mins, order_index, content, created_at) VALUES ('lesson-cs50-2', 'course-cs50', 'Memory Layout, Pointers & Dynamic Allocation', 'memory-and-pointers', 15, 2, '## Demystifying Machine Memory

When a program executes, the operating system allocates a virtual address space partitioned into distinct segments:

- **Text/Code Segment:** The read-only compiled machine instructions.
- **Data & BSS Segments:** Global and static variables.
- **The Stack:** Function stack frames, local variables, and return addresses (managed automatically in LIFO order).
- **The Heap:** Dynamic memory allocated at runtime via system calls.

### Pointers in C / Systems Architecture

A pointer is simply a variable whose value is the memory address of another value.

```c
#include <stdio.h>
#include <stdlib.h>

int main(void) {
    int score = 95;
    int *ptr = &score; // ptr stores address of score

    printf("Score value: %d\n", score);
    printf("Score address: %p\n", (void*)ptr);
    printf("Dereferenced: %d\n", *ptr);

    // Dynamic allocation on the heap
    int *dynamicArray = malloc(5 * sizeof(int));
    if (dynamicArray == NULL) {
        return 1; // Out of memory safeguard
    }

    for (int i = 0; i < 5; i++) {
        dynamicArray[i] = (i + 1) * 10;
    }

    // Critical: release memory to prevent leaks
    free(dynamicArray);
    return 0;
}
```

### Common Memory Vulnerabilities
- **Buffer Overflow:** Writing past the allocated memory boundary, corrupting adjacent stack frames.
- **Dangling Pointer:** Accessing memory after calling `free()`.
- **Memory Leak:** Allocating heap memory without corresponding `free()` calls, exhausting available RAM over time.', '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO lessons (id, course_id, title, slug, reading_time_mins, order_index, content, created_at) VALUES ('lesson-web-1', 'course-meta-frontend', 'Modern JavaScript: The Event Loop & Async Mechanics', 'javascript-event-loop', 14, 1, '## JavaScript Concurrency Model

JavaScript is a single-threaded runtime environment equipped with a non-blocking, asynchronous event-driven I/O engine. How does a single thread execute long network requests without freezing the user interface?

The answer lies in the interaction between:
1. **The Call Stack:** Executes synchronous frames.
2. **Web APIs / Node C++ APIs:** Handles background timers, HTTP requests, and disk I/O.
3. **The Microtask Queue:** High-priority queue for Promise resolutions (`.then()`, `await`, `queueMicrotask`).
4. **The Macrotask Queue:** General task queue for `setTimeout`, `setInterval`, and DOM events.

### Microtasks vs. Macrotasks

```javascript
console.log(''1: Synchronous Start'');

setTimeout(() => {
  console.log(''4: Macrotask Timer'');
}, 0);

Promise.resolve().then(() => {
  console.log(''3: Microtask Promise'');
});

console.log(''2: Synchronous End'');

// Execution Output:
// 1: Synchronous Start
// 2: Synchronous End
// 3: Microtask Promise
// 4: Macrotask Timer
```

Notice that even though `setTimeout` had a delay of `0ms`, the microtask queue was completely drained before the macrotask was allowed onto the call stack.

### Clean Async/Await Error Handling Pattern

```javascript
async function fetchUserProfile(userId) {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(''Fetch failed:'', error.message);
    return { success: false, error: error.message };
  }
}
```', '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO lessons (id, course_id, title, slug, reading_time_mins, order_index, content, created_at) VALUES ('lesson-sec-1', 'course-ms-cybersecurity', 'Web Application Security: OWASP Top 10 Defences', 'web-security-owasp', 16, 1, '## Building Resilient Web Architectures

Security is not an afterthought or a final plugin; it is a discipline baked into database design, API authentication, and input sanitization.

### 1. SQL Injection (SQLi)

SQL injection occurs when unvalidated user input is concatenated directly into query strings.

**Vulnerable:**
```javascript
// NEVER DO THIS:
const query = `SELECT * FROM users WHERE email = ''${req.body.email}''`;
```

**Secure (Parameterized Queries):**
```javascript
// Bound parameters are never parsed as SQL syntax:
const stmt = db.prepare(''SELECT * FROM users WHERE email = ?'');
const user = stmt.get(req.body.email);
```

### 2. Cross-Site Scripting (XSS)

XSS occurs when an application includes untrusted data in a web page without proper escaping or encoding.

- **Stored XSS:** Malicious script is saved in the database and served to other users.
- **Reflected XSS:** Injected script is reflected off the web server in an immediate error or search result.
- **Mitigation:** Use text-node interpolation (`textContent` over `innerHTML`), set a strict `Content-Security-Policy` header, and use `HttpOnly` cookie flags for session identifiers.

### 3. Broken Access Control (IDOR)

Insecure Direct Object References happen when an endpoint accepts an ID from the client and modifies the object without verifying that the authenticated user owns that resource.

```javascript
// Always verify ownership in the query constraint:
const stmt = db.prepare(
  ''UPDATE projects SET title = ? WHERE id = ? AND user_id = ?''
);
const result = stmt.run(newTitle, projectId, req.user.id);
if (result.changes === 0) {
  return res.status(403).json({ error: ''Unauthorized or project not found'' });
}
```', '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;

-- SEED: challenges (6 records)
INSERT INTO challenges (id, title, slug, difficulty, category, time_estimate, description, examples_json, starter_code_js, solution_template, public_tests_json, hidden_tests_json, xp_reward, created_at) VALUES ('challenge-two-sum', 'Two Sum', 'two-sum', 'Easy', 'Arrays', '15 min', 'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers such that they add up to `target`. You may assume that each input would have exactly one solution, and you may not use the same element twice. Return the answer as `[index1, index2]` sorted ascending.', '[{"input":"nums = [2,7,11,15], target = 9","output":"[0,1]","explanation":"Because nums[0] + nums[1] == 9, we return [0, 1]."},{"input":"nums = [3,2,4], target = 6","output":"[1,2]"}]'::jsonb, 'function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement), i];
    }
    map.set(nums[i], i);
  }
  return [];
}', '', '[{"args":[[2,7,11,15],9],"expected":[0,1]},{"args":[[3,2,4],6],"expected":[1,2]}]'::jsonb, '[{"args":[[3,3],6],"expected":[0,1]},{"args":[[1,5,7,11,19],20],"expected":[0,4]},{"args":[[-3,4,3,90],0],"expected":[0,2]}]'::jsonb, 25, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO challenges (id, title, slug, difficulty, category, time_estimate, description, examples_json, starter_code_js, solution_template, public_tests_json, hidden_tests_json, xp_reward, created_at) VALUES ('challenge-valid-parentheses', 'Valid Parentheses', 'valid-parentheses', 'Easy', 'Stacks', '15 min', 'Given a string `s` containing just the characters ''('', '')'', ''{'', ''}'', ''['' and '']'', determine if the input string is valid.
An input string is valid if open brackets are closed by the same type of brackets and in the correct order.', '[{"input":"s = \"()[]{}\"","output":"true"},{"input":"s = \"(]\"","output":"false"}]'::jsonb, 'function isValid(s) {
  const stack = [];
  const pairs = { '')'': ''('', ''}'': ''{'', '']'': ''['' };
  for (const ch of s) {
    if (ch === ''('' || ch === ''{'' || ch === ''['') {
      stack.push(ch);
    } else {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0;
}', '', '[{"args":["()[]{}"],"expected":true},{"args":["(]"],"expected":false}]'::jsonb, '[{"args":["{[]}"],"expected":true},{"args":["["],"expected":false},{"args":[""],"expected":true},{"args":[")("],"expected":false}]'::jsonb, 25, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO challenges (id, title, slug, difficulty, category, time_estimate, description, examples_json, starter_code_js, solution_template, public_tests_json, hidden_tests_json, xp_reward, created_at) VALUES ('challenge-maximum-subarray', 'Maximum Subarray Sum', 'maximum-subarray-sum', 'Medium', 'Dynamic Programming', '25 min', 'Given an integer array `nums`, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum (Kadane''s Algorithm).', '[{"input":"nums = [-2,1,-3,4,-1,2,1,-5,4]","output":"6","explanation":"[4,-1,2,1] has the largest sum = 6."}]'::jsonb, 'function maxSubArray(nums) {
  let maxSoFar = nums[0];
  let currentMax = nums[0];
  for (let i = 1; i < nums.length; i++) {
    currentMax = Math.max(nums[i], currentMax + nums[i]);
    maxSoFar = Math.max(maxSoFar, currentMax);
  }
  return maxSoFar;
}', '', '[{"args":[[-2,1,-3,4,-1,2,1,-5,4]],"expected":6},{"args":[[1]],"expected":1}]'::jsonb, '[{"args":[[5,4,-1,7,8]],"expected":23},{"args":[[-1,-2,-3]],"expected":-1}]'::jsonb, 35, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO challenges (id, title, slug, difficulty, category, time_estimate, description, examples_json, starter_code_js, solution_template, public_tests_json, hidden_tests_json, xp_reward, created_at) VALUES ('challenge-reverse-linked-list', 'Reverse a Linked List', 'reverse-linked-list', 'Easy', 'Queues', '20 min', 'Given the head of a singly linked list represented as an array of values, return the reversed list as an array of values.', '[{"input":"head = [1,2,3,4,5]","output":"[5,4,3,2,1]"}]'::jsonb, 'function reverseList(arr) {
  // In our sandbox, linked lists are passed/returned as ordered arrays of values
  const result = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    result.push(arr[i]);
  }
  return result;
}', '', '[{"args":[[1,2,3,4,5]],"expected":[5,4,3,2,1]},{"args":[[1,2]],"expected":[2,1]}]'::jsonb, '[{"args":[[]],"expected":[]},{"args":[[42]],"expected":[42]}]'::jsonb, 25, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO challenges (id, title, slug, difficulty, category, time_estimate, description, examples_json, starter_code_js, solution_template, public_tests_json, hidden_tests_json, xp_reward, created_at) VALUES ('challenge-binary-search', 'Binary Search', 'binary-search', 'Easy', 'Arrays', '15 min', 'Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If target exists, return its index. Otherwise, return -1. You must write an algorithm with O(log n) runtime complexity.', '[{"input":"nums = [-1,0,3,5,9,12], target = 9","output":"4"},{"input":"nums = [-1,0,3,5,9,12], target = 2","output":"-1"}]'::jsonb, 'function search(nums, target) {
  let left = 0;
  let right = nums.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  return -1;
}', '', '[{"args":[[-1,0,3,5,9,12],9],"expected":4},{"args":[[-1,0,3,5,9,12],2],"expected":-1}]'::jsonb, '[{"args":[[5],5],"expected":0},{"args":[[1,3,5,7,9,11,13],13],"expected":6},{"args":[[1,3,5,7,9,11,13],1],"expected":0}]'::jsonb, 25, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO challenges (id, title, slug, difficulty, category, time_estimate, description, examples_json, starter_code_js, solution_template, public_tests_json, hidden_tests_json, xp_reward, created_at) VALUES ('challenge-min-stack', 'Min Stack', 'min-stack', 'Medium', 'Stacks', '30 min', 'Design a stack that supports push, pop, top, and retrieving the minimum element in constant time O(1). In this challenge, given an array of operations ["push", "push", "getMin", ...] and arguments, return the array of outputs.', '[{"input":"operations = [\"push\", \"push\", \"push\", \"getMin\", \"pop\", \"top\", \"getMin\"], args = [[-2], [0], [-3], [], [], [], []]","output":"[null, null, null, -3, null, 0, -2]"}]'::jsonb, 'function minStackDriver(ops, args) {
  const stack = [];
  const minStack = [];
  const output = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === ''push'') {
      const val = args[i][0];
      stack.push(val);
      if (minStack.length === 0 || val <= minStack[minStack.length - 1]) {
        minStack.push(val);
      }
      output.push(null);
    } else if (op === ''pop'') {
      const val = stack.pop();
      if (val === minStack[minStack.length - 1]) {
        minStack.pop();
      }
      output.push(null);
    } else if (op === ''top'') {
      output.push(stack[stack.length - 1]);
    } else if (op === ''getMin'') {
      output.push(minStack[minStack.length - 1]);
    }
  }
  return output;
}', '', '[{"args":[["push","push","push","getMin","pop","top","getMin"],[[-2],[0],[-3],[],[],[],[]]],"expected":[null,null,null,-3,null,0,-2]}]'::jsonb, '[{"args":[["push","push","getMin","top"],[[1],[2],[],[]]],"expected":[null,null,1,2]}]'::jsonb, 35, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;

-- SEED: achievements (6 records)
INSERT INTO achievements (id, key, title, description, badge_icon, xp_bonus, condition_type, condition_value, created_at) VALUES ('ach-first-step', 'first_step', 'First Step', 'Complete your first verified reading lesson in Dev Harbour.', 'book-open', 25, 'lessons_completed', 1, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO achievements (id, key, title, description, badge_icon, xp_bonus, condition_type, condition_value, created_at) VALUES ('ach-scholar', 'scholar', 'Dedicated Scholar', 'Complete at least 3 reading lessons across any course tracks.', 'award', 50, 'lessons_completed', 3, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO achievements (id, key, title, description, badge_icon, xp_bonus, condition_type, condition_value, created_at) VALUES ('ach-code-solver', 'code_solver', 'Code Solver', 'Successfully pass your first coding challenge with all test cases verified.', 'terminal', 50, 'challenges_passed', 1, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO achievements (id, key, title, description, badge_icon, xp_bonus, condition_type, condition_value, created_at) VALUES ('ach-algorithmist', 'algorithmist', 'Algorithmist', 'Pass 3 or more coding challenges.', 'cpu', 75, 'challenges_passed', 3, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO achievements (id, key, title, description, badge_icon, xp_bonus, condition_type, condition_value, created_at) VALUES ('ach-builder', 'builder', 'Project Builder', 'Submit a live project to the Dev Harbour Featured Projects directory.', 'folder-plus', 100, 'projects_submitted', 1, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
INSERT INTO achievements (id, key, title, description, badge_icon, xp_bonus, condition_type, condition_value, created_at) VALUES ('ach-supporter', 'supporter', 'Community Pillar', 'Cast an upvote on a peer developer''s project submission.', 'heart', 15, 'projects_voted', 1, '2026-10-20 07:06:29') ON CONFLICT (id) DO NOTHING;
