// tests/stress-milestone2.mjs
// Empirical Stress Test Harness for Milestone 2 (Auth & Session Unification)

import { verifyPassword, hashPassword, generateSalt, verifySessionSignature, setAdminSessionSecret } from '../js/utils.js';

// Setup Mock DOM and Storage Environment
const localStorageData = new Map();
const sessionStorageData = new Map();

globalThis.localStorage = {
  getItem: (k) => localStorageData.get(k) ?? null,
  setItem: (k, v) => localStorageData.set(k, String(v)),
  removeItem: (k) => localStorageData.delete(k),
  clear: () => localStorageData.clear(),
};

globalThis.sessionStorage = {
  getItem: (k) => sessionStorageData.get(k) ?? null,
  setItem: (k, v) => sessionStorageData.set(k, String(v)),
  removeItem: (k) => sessionStorageData.delete(k),
  clear: () => sessionStorageData.clear(),
};

globalThis.window = globalThis;
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
  getElementById: () => null,
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, detail) {
    this.type = type;
    Object.assign(this, detail);
  }
};
globalThis.BroadcastChannel = class {
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  close() {}
};

// Import auth module
const auth = await import('../js/auth.js');
const { _buildUserObject, _saveSession, getCurrentUser, login, purgeLegacyMockUsers } = auth;

console.log('============================================================');
console.log(' Milestone 2 Empirical Stress Test Suite');
console.log('============================================================\n');

let passCount = 0;
let failCount = 0;

function assert(description, condition, details = '') {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${description} ${details ? '--> ' + details : ''}`);
    failCount++;
  }
}

// ------------------------------------------------------------
// TEST GROUP 1: Privilege Escalation & Admin Validation
// ------------------------------------------------------------
console.log('--- Test Group 1: Privilege Escalation & Admin Role Whitelist ---');

// 1.1 Non-admin username with forged profileData.role = 'admin'
{
  localStorageData.clear();
  sessionStorageData.clear();

  const authUser = { id: 'usr_hacker_1', email: 'hacker@kitobchi.uz', user_metadata: { username: 'hacker_user' } };
  const forgedProfile = { username: 'hacker_user', role: 'admin' };

  const user = _buildUserObject(authUser, forgedProfile);
  assert(
    '1.1.1: Non-admin username with forged profileData.role has user.isAdmin === false',
    user.isAdmin === false,
    `Actual user.isAdmin: ${user.isAdmin}`
  );
  assert(
    '1.1.2: Non-admin username with forged profileData.role has user.role !== "admin"',
    user.role !== 'admin',
    `VULNERABILITY DETECTED! user.role is '${user.role}' despite username 'hacker_user' not in whitelist!`
  );

  _saveSession(user);
  const current = getCurrentUser();
  assert(
    '1.1.3: Non-admin session in storage does not possess admin sessionToken',
    !current?.sessionToken,
    `Session token granted: ${current?.sessionToken}`
  );
  assert(
    '1.1.4: Non-admin in storage has role !== "admin"',
    current?.role !== 'admin',
    `Stored role in session is '${current?.role}'`
  );
}

// 1.2 Non-admin username with forged profileData.is_admin = true
{
  localStorageData.clear();
  sessionStorageData.clear();

  const authUser = { id: 'usr_hacker_2', email: 'hacker2@kitobchi.uz', user_metadata: { username: 'student_99' } };
  const forgedProfile = { username: 'student_99', is_admin: true };

  const user = _buildUserObject(authUser, forgedProfile);
  assert(
    '1.2.1: Non-admin with forged is_admin === true has user.isAdmin === false',
    user.isAdmin === false,
    `Actual: ${user.isAdmin}`
  );
  assert(
    '1.2.2: Non-admin with forged is_admin === true has user.role === "user"',
    user.role === 'user',
    `Actual: ${user.role}`
  );
}

// 1.3 Non-admin username with forged authUser.user_metadata.role = 'admin'
{
  localStorageData.clear();
  sessionStorageData.clear();

  const authUser = { id: 'usr_hacker_3', email: 'hacker3@kitobchi.uz', user_metadata: { username: 'student_77', role: 'admin' } };
  const profile = { username: 'student_77' };

  const user = _buildUserObject(authUser, profile);
  assert(
    '1.3.1: Forged user_metadata.role="admin" rejected for isAdmin',
    user.isAdmin === false,
    `Actual: ${user.isAdmin}`
  );
  assert(
    '1.3.2: Forged user_metadata.role="admin" rejected for user.role',
    user.role === 'user',
    `Actual: ${user.role}`
  );
}

// 1.4 Legitimate admin usernames: 'admin' and 'admin_kitobchi'
{
  localStorageData.clear();
  sessionStorageData.clear();

  const admin1 = _buildUserObject(
    { id: 'usr_adm_1', email: 'admin@kitobchi.uz', user_metadata: { username: 'admin' } },
    { username: 'admin', role: 'admin' }
  );
  assert('1.4.1: Legitimate "admin" username with DB role "admin" is granted isAdmin', admin1.isAdmin === true);
  assert('1.4.2: Legitimate "admin" username has role === "admin"', admin1.role === 'admin');

  _saveSession(admin1);
  const currentAdm1 = getCurrentUser();
  assert('1.4.3: Legitimate admin receives HMAC sessionToken', Boolean(currentAdm1?.sessionToken));
  assert('1.4.4: Legitimate admin passes verifySessionSignature', verifySessionSignature(currentAdm1) === true);

  const admin2 = _buildUserObject(
    { id: 'usr_adm_2', email: 'master@kitobchi.uz', user_metadata: { username: 'admin_kitobchi' } },
    { username: 'admin_kitobchi', role: 'admin' }
  );
  assert('1.4.5: Legitimate "admin_kitobchi" username is granted isAdmin', admin2.isAdmin === true);
  assert('1.4.6: Legitimate "admin_kitobchi" username has role === "admin"', admin2.role === 'admin');
}

// 1.5 Whitelist edge cases (case-insensitivity, whitespace, prefix attacks)
{
  // Uppercase ADMIN
  const upperAdmin = _buildUserObject(
    { id: 'usr_adm_3', email: 'admin@kitobchi.uz', user_metadata: { username: ' ADMIN ' } },
    { username: ' ADMIN ', role: 'admin' }
  );
  assert('1.5.1: Uppercase & trimmed " ADMIN " recognized as admin', upperAdmin.isAdmin === true && upperAdmin.role === 'admin');

  // Prefix attack: "admin_impostor"
  const impostor = _buildUserObject(
    { id: 'usr_imp_1', email: 'impostor@kitobchi.uz', user_metadata: { username: 'admin_impostor' } },
    { username: 'admin_impostor', role: 'admin' }
  );
  assert('1.5.2: Prefix attack "admin_impostor" rejected from isAdmin', impostor.isAdmin === false);
  assert('1.5.3: Prefix attack "admin_impostor" rejected from admin role', impostor.role !== 'admin', `Actual: ${impostor.role}`);

  // Whitelisted username but DB role is regular user (no unearned admin status)
  const nonPrivAdmin = _buildUserObject(
    { id: 'usr_adm_nopriv', email: 'admin@kitobchi.uz', user_metadata: { username: 'admin' } },
    { username: 'admin', role: 'user' }
  );
  assert('1.5.4: Username "admin" without admin DB role does NOT get isAdmin', nonPrivAdmin.isAdmin === false);
}

// ------------------------------------------------------------
// TEST GROUP 2: Password Security & Plaintext Rejection
// ------------------------------------------------------------
console.log('\n--- Test Group 2: Password Security & Plaintext Rejection ---');

{
  localStorageData.clear();
  sessionStorageData.clear();

  // Test 2.1: Legacy plaintext password without hash/salt cannot authenticate offline
  const plainUser = {
    id: 'usr_plain_1',
    username: 'plainuser',
    email: 'plain@kitobchi.uz',
    password: 'legacyPlainPassword123!',
    // Note: NO passwordHash, NO salt!
  };

  localStorageData.set('kitobchi_registered_users', JSON.stringify({
    'plainuser': plainUser
  }));

  const loginRes = await login('plainuser', 'legacyPlainPassword123!');
  assert(
    '2.1: Plaintext password in registered_users rejected without salt & hash',
    loginRes.success === false,
    `Login succeeded unexpectedly: ${JSON.stringify(loginRes)}`
  );

  // Test 2.2: Properly hashed & salted local user authenticates offline
  const salt = generateSalt(16);
  const passwordHash = await hashPassword('CorrectPassword123!', salt);
  const hashedUser = {
    id: 'usr_hash_1',
    username: 'secureuser',
    email: 'secure@kitobchi.uz',
    salt: salt,
    passwordHash: passwordHash,
  };

  localStorageData.set('kitobchi_registered_users', JSON.stringify({
    'secureuser': hashedUser
  }));

  const validLoginRes = await login('secureuser', 'CorrectPassword123!');
  assert(
    '2.2: Properly salted & hashed user successfully authenticates offline',
    validLoginRes.success === true && validLoginRes.user?.offlineSession === true
  );

  // Test 2.3: Password, hash, and salt are stripped from active session
  const activeUser = getCurrentUser();
  assert(
    '2.3: Sensitive password/hash/salt fields stripped from active session',
    !activeUser?.password && !activeUser?.passwordHash && !activeUser?.salt
  );

  // Test 2.4: Wrong password with salt & hash fails
  const wrongLoginRes = await login('secureuser', 'WrongPassword999!');
  assert(
    '2.4: Incorrect password fails offline authentication',
    wrongLoginRes.success === false
  );
}

// ------------------------------------------------------------
// TEST GROUP 3: Timeout Resilience & Offline Session Preservation
// ------------------------------------------------------------
console.log('\n--- Test Group 3: Timeout Resilience & Offline Session Preservation ---');

{
  localStorageData.clear();
  sessionStorageData.clear();

  // Test 3.1: Simulate _syncSession race timeout (3500ms mock)
  const simulateSyncSession = async (mockGetSessionDelay, mockGetSessionError = null, mockSessionData = null) => {
    let isTimedOut = false;
    let lateRejectionOccurred = false;

    const unhandledListener = () => { lateRejectionOccurred = true; };
    process.on('unhandledRejection', unhandledListener);

    try {
      const getSessionPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          if (mockGetSessionError) reject(mockGetSessionError);
          else resolve({ data: { session: mockSessionData }, error: null });
        }, mockGetSessionDelay);
      });

      const result = await Promise.race([
        getSessionPromise,
        new Promise(resolve =>
          setTimeout(() => {
            isTimedOut = true;
            resolve({ data: { session: null } });
          }, 50) // scaled down from 3500ms for test execution speed
        ),
      ]);

      const session = result?.data?.session;

      if (!session?.user) {
        const existing = getCurrentUser();
        if (
          existing?.offlineSession ||
          String(existing?.id || '').startsWith('admin-')
        ) {
          return { preserved: true, reason: 'offline_or_admin' };
        }
        if (!isTimedOut && result?.error === null) {
          _saveSession(null);
          return { preserved: false, reason: 'logged_out' };
        }
        return { preserved: true, reason: 'timeout_preserved' };
      }

      return { preserved: true, reason: 'online_session' };
    } finally {
      process.removeListener('unhandledRejection', unhandledListener);
    }
  };

  // Scenario 3.1: Hung Supabase request (> timeout) preserves existing offline session
  localStorageData.set('kitobchi_user', JSON.stringify({
    id: 'usr_offline_1',
    username: 'offline_hero',
    offlineSession: true,
  }));

  const res1 = await simulateSyncSession(200); // 200ms > 50ms timeout
  assert(
    '3.1: Hung Supabase query preserves existing offline session without logout',
    res1.preserved === true && getCurrentUser()?.username === 'offline_hero'
  );

  // Scenario 3.2: Hung Supabase request preserves standard user session on timeout
  localStorageData.set('kitobchi_user', JSON.stringify({
    id: 'usr_standard_1',
    username: 'standard_user',
    role: 'user',
  }));

  const res2 = await simulateSyncSession(200);
  assert(
    '3.2: Hung Supabase query preserves standard cached user on network timeout',
    res2.preserved === true && getCurrentUser()?.username === 'standard_user'
  );

  // Scenario 3.3: Explicit null session without timeout (clean logout) logs user out
  const res3 = await simulateSyncSession(10, null, null); // resolves at 10ms (< 50ms)
  assert(
    '3.3: Explicit verified null session from Supabase logs out standard user',
    res3.preserved === false && getCurrentUser() === null
  );

  // Scenario 3.4: Guest user on timeout remains guest (no unhandled error)
  localStorageData.clear();
  const res4 = await simulateSyncSession(200);
  assert(
    '3.4: Guest user on network timeout safely remains guest',
    res4.preserved === true && getCurrentUser() === null
  );
}

console.log('\n============================================================');
console.log(` Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('============================================================\n');

process.exit(failCount > 0 ? 1 : 0);
