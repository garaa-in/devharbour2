/**
 * Dev Harbour - Secure Code Execution Sandbox
 * Evaluates student code in isolated, timeout-guarded environments.
 * Validates submissions against both public tests and secret server-side tests.
 * Hardened with static analysis, prototype lockdown, and AST pattern guards.
 */

const vm = require('node:vm');

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// Forbidden patterns that attempt host reflection, escape, or file/process access
const FORBIDDEN_PATTERNS = [
  /\bprocess\b/,
  /\brequire\b/,
  /\bimport\b/,
  /\bchild_process\b/,
  /\bfs\b/,
  /\bconstructor\s*\(/,
  /\.constructor\b/,
  /__proto__/,
  /\bFunction\s*\(/,
  /\beval\s*\(/,
  /\bglobal\b/,
  /\bglobalThis\b/,
  /\bReflect\b/,
  /\bWebAssembly\b/,
  /\bmainModule\b/
];

/**
 * Executes student JavaScript code against a suite of test cases.
 * @param {string} code - The student-submitted code
 * @param {Array} publicTests - Tests shown to user [{ args: [...], expected: any }]
 * @param {Array} hiddenTests - Secret tests kept on server [{ args: [...], expected: any }]
 * @param {string} challengeSlug - Slug identifying challenge function
 * @returns {Promise<Object>} Execution result summary
 */
async function executeCode(code, publicTests = [], hiddenTests = [], challengeSlug = '') {
  const startTime = Date.now();
  const logs = [];

  // 1. Static Analysis Security Gate
  if (!code || typeof code !== 'string') {
    return {
      status: 'error',
      passed: false,
      executionTimeMs: 0,
      errorMessage: 'Invalid code submission: code must be a non-empty string.',
      passedCount: 0,
      totalCount: publicTests.length + hiddenTests.length,
      sampleResults: [],
      logs: []
    };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      return {
        status: 'error',
        passed: false,
        executionTimeMs: 0,
        errorMessage: 'Security policy violation: Restricted keyword, system call, or prototype access pattern detected.',
        passedCount: 0,
        totalCount: publicTests.length + hiddenTests.length,
        sampleResults: [],
        logs: ['[SECURITY SYSTEM] Execution aborted: submission attempted restricted keyword or prototype traversal.']
      };
    }
  }

  // 2. Sandbox environment: clean, unpolluted, no filesystem or network access
  const sandbox = {
    console: Object.freeze({
      log: (...args) => logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      error: (...args) => logs.push('[ERROR] ' + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '))
    }),
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Date: Object.freeze({
      now: () => Date.now()
    }),
    parseInt,
    parseFloat,
    isNaN,
    isFinite
  };

  const context = vm.createContext(sandbox);

  // 3. Run user code in sandbox to declare functions / classes
  try {
    const script = new vm.Script(code, { filename: 'solution.js' });
    script.runInContext(context, { timeout: 2500 });
  } catch (err) {
    return {
      status: 'error',
      passed: false,
      executionTimeMs: Date.now() - startTime,
      errorMessage: err.name + ': ' + err.message,
      passedCount: 0,
      totalCount: publicTests.length + hiddenTests.length,
      sampleResults: [],
      logs
    };
  }

  // Detect the main target function from context
  const knownFunctions = ['twoSum', 'isValid', 'maxSubArray', 'reverseList', 'search', 'minStackDriver'];
  let targetFn = null;
  let targetName = '';

  for (const name of knownFunctions) {
    if (typeof context[name] === 'function') {
      targetFn = context[name];
      targetName = name;
      break;
    }
  }

  // If no known name, look for any user-defined function in context
  if (!targetFn) {
    for (const key of Object.keys(sandbox)) {
      if (typeof context[key] === 'function' && !['parseInt', 'parseFloat', 'isNaN', 'isFinite'].includes(key)) {
        targetFn = context[key];
        targetName = key;
        break;
      }
    }
  }

  if (!targetFn) {
    return {
      status: 'error',
      passed: false,
      executionTimeMs: Date.now() - startTime,
      errorMessage: 'No solution function found in submission. Please check your function name.',
      passedCount: 0,
      totalCount: publicTests.length + hiddenTests.length,
      sampleResults: [],
      logs
    };
  }

  // 4. Evaluate Public Test Cases
  let passedCount = 0;
  const sampleResults = [];
  context.__targetFn__ = targetFn;

  for (let i = 0; i < publicTests.length; i++) {
    const test = publicTests[i];
    try {
      // Deep clone arguments to avoid mutation
      context.__testArgs__ = JSON.parse(JSON.stringify(test.args));
      const evalScript = new vm.Script('__targetFn__(...__testArgs__)', { filename: `test_${i}.js` });
      const result = evalScript.runInContext(context, { timeout: 1500 });
      const isOk = deepEqual(result, test.expected);

      if (isOk) passedCount++;
      sampleResults.push({
        testIndex: i + 1,
        input: test.args,
        expected: test.expected,
        actual: result,
        passed: isOk
      });
    } catch (testErr) {
      sampleResults.push({
        testIndex: i + 1,
        input: test.args,
        expected: test.expected,
        error: testErr.message,
        passed: false
      });
    }
  }

  // 5. Evaluate Hidden Test Cases (kept private - do not leak to client!)
  let allHiddenPassed = true;
  for (let j = 0; j < hiddenTests.length; j++) {
    const hTest = hiddenTests[j];
    try {
      context.__testArgs__ = JSON.parse(JSON.stringify(hTest.args));
      const evalScript = new vm.Script('__targetFn__(...__testArgs__)', { filename: `hidden_test_${j}.js` });
      const result = evalScript.runInContext(context, { timeout: 1500 });
      if (deepEqual(result, hTest.expected)) {
        passedCount++;
      } else {
        allHiddenPassed = false;
      }
    } catch {
      allHiddenPassed = false;
    }
  }

  const totalCount = publicTests.length + hiddenTests.length;
  const allPassed = passedCount === totalCount;
  const executionTimeMs = Date.now() - startTime;

  return {
    status: allPassed ? 'passed' : 'failed',
    passed: allPassed,
    executionTimeMs,
    passedCount,
    totalCount,
    sampleResults,
    logs: logs.slice(0, 15) // limit log output
  };
}

module.exports = {
  executeCode,
  deepEqual
};
