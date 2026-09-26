// ========================================================================
// tests/helpers/test-runner.js — Zero-dependency Async Test Harness
// ========================================================================

const suites = [];
let currentSuite = null;
let testCount = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

export function describe(title, fn) {
  const suite = {
    title,
    tests: [],
  };
  suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = null;
}

export function test(title, fn) {
  if (!currentSuite) {
    describe('Default Suite', () => {
      test(title, fn);
    });
    return;
  }
  currentSuite.tests.push({ title, fn });
  testCount++;
}

export const it = test;

// ------------------------------------------------------------------------
// Assertion Helpers
// ------------------------------------------------------------------------
export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected ${JSON.stringify(expected)} (type: ${typeof expected}), got ${JSON.stringify(actual)} (type: ${typeof actual})`
    );
  }
}

export function assertNotEqual(actual, expected, message = '') {
  if (actual === expected) {
    throw new Error(
      `${message ? message + ': ' : ''}Expected value NOT to equal ${JSON.stringify(expected)}`
    );
  }
}

export function assertDeepEqual(actual, expected, message = '') {
  const aStr = JSON.stringify(sortKeys(actual));
  const eStr = JSON.stringify(sortKeys(expected));
  if (aStr !== eStr) {
    throw new Error(
      `${message ? message + ': ' : ''}Deep equality mismatch:\nExpected: ${eStr}\nActual:   ${aStr}`
    );
  }
}

export function assertContains(haystack, needle, message = '') {
  if (typeof haystack === 'string') {
    if (!haystack.includes(needle)) {
      throw new Error(
        `${message ? message + ': ' : ''}Expected string to contain "${needle}"\nContent: "${haystack.slice(0, 200)}..."`
      );
    }
  } else if (Array.isArray(haystack)) {
    if (!haystack.includes(needle)) {
      throw new Error(
        `${message ? message + ': ' : ''}Expected array to contain ${JSON.stringify(needle)}`
      );
    }
  } else {
    throw new Error(`assertContains received invalid haystack of type ${typeof haystack}`);
  }
}

export function assertForbiddenKeysNotIn(obj, forbiddenKeys, path = '$') {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      assertForbiddenKeysNotIn(item, forbiddenKeys, `${path}[${idx}]`);
    });
    return;
  }

  for (const key of Object.keys(obj)) {
    for (const forbidden of forbiddenKeys) {
      if (key.toLowerCase() === forbidden.toLowerCase()) {
        throw new Error(
          `Security violation: Forbidden key "${key}" detected at path "${path}.${key}" with value: ${JSON.stringify(obj[key])}`
        );
      }
    }
    assertForbiddenKeysNotIn(obj[key], forbiddenKeys, `${path}.${key}`);
  }
}

function sortKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortKeys(obj[k]);
  }
  return sorted;
}

// ------------------------------------------------------------------------
// Test Execution & Reporting
// ------------------------------------------------------------------------
export async function runAll({ silent = false } = {}) {
  const startTime = Date.now();
  if (!silent) {
    console.log('\n============================================================');
    console.log(' Kitobchi.uz Serverless Backend & Anti-Cheat E2E Test Suite');
    console.log('============================================================\n');
  }

  for (const suite of suites) {
    if (!silent) {
      console.log(`\n--- ${suite.title} ---`);
    }

    for (const t of suite.tests) {
      const testStart = Date.now();
      try {
        await t.fn();
        passCount++;
        const elapsed = Date.now() - testStart;
        if (!silent) {
          console.log(`  [PASS] ${t.title} (${elapsed}ms)`);
        }
      } catch (err) {
        failCount++;
        const elapsed = Date.now() - testStart;
        failures.push({
          suite: suite.title,
          test: t.title,
          error: err,
        });
        if (!silent) {
          console.log(`  [FAIL] ${t.title} (${elapsed}ms)`);
          console.log(`         Error: ${err.message}`);
        }
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  if (!silent) {
    console.log('\n============================================================');
    console.log(' Test Execution Summary');
    console.log('============================================================');
    console.log(` Total Tests: ${testCount}`);
    console.log(` Passed:      ${passCount}`);
    console.log(` Failed:      ${failCount}`);
    console.log(` Duration:    ${duration}s`);
    console.log('============================================================\n');

    if (failCount > 0) {
      console.log('FAILED TESTS:');
      failures.forEach((f, idx) => {
        console.log(`\n${idx + 1}) [${f.suite}] ${f.test}`);
        console.log(`   ${f.error.stack || f.error.message}`);
      });
      console.log('\n');
    }
  }

  return {
    total: testCount,
    passed: passCount,
    failed: failCount,
    duration,
    failures,
  };
}
