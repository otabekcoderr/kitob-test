# TEST_REPORT: Kitobchi.uz — E2E Test Suite

**Status**: PASSING
**Runner**: `npm test` (`node tests/run-e2e-tests.js`)
**Node**: v22+ (CI pins Node 22; `@supabase/supabase-js` requires `>=22`)
**Total**: 76 · **Passed**: 76 · **Failed**: 0 · **Pass Rate**: 100%
**Duration**: ~24s (dominated by real Supabase queries with a 2s timeout)

Handler target: `api/quiz.js` and `api/quiz-submit.js` are imported directly
(the suite reports `FOUND (Live Handler)`); the reference oracle in
`tests/helpers/contract-oracle.js` is only a fallback if an import fails.

---

## 1. What the suite covers

| Tier | Area | Tests |
|---|---|---|
| 1 | Feature coverage (`GET /api/quiz` sanitization, submit grading, profile sync, result schema, offline fallback, `vercel.json`) | 30 |
| 2 | Boundary & corner cases (validation, injection, scoring edges, streak machine, auth boundaries, HTTP verbs) | 30 |
| 3 | Cross-feature combinations (partial submissions, multi-day streaks, level-ups, ID aliasing, anti-replay) | 11 |
| 4 | Real-world scenarios (full journey, console tampering, adversarial leakage scan, level graduation, outage recovery) | 5 |

Full per-test listing lives in `tests/run-e2e-tests.js`.

---

## 2. Fixes that these tests caught

The suite previously failed 5 of 76 tests. Those failures were genuine
product bugs, not bad assertions:

| Test | Symptom | Root cause | Fix |
|---|---|---|---|
| `T1.2.5`, `T2.4.x`, `T3.2` | streak expected 3, got 1 | a failed `profiles` read was treated as a fresh profile, resetting streak to 1 and zeroing score before the write | `api/quiz-submit.js` now returns `503 PROFILE_UNAVAILABLE` instead of persisting from an unknown state |
| `T3.1` | 4 of 10 answers graded 100% | the denominator was `rawAnswers.length`, so submitting one correct answer yielded 100% plus the full accuracy bonus | denominator is now the authoritative exam length, capped at `EXAM_QUESTION_LIMIT` |
| `T2.5.4`, `T4.1` | expected 200, got 401 | both tests used a fabricated JWT that cannot verify against Supabase Auth | the assertions were corrected; an unverifiable token *must* be rejected |

`T1.6.5` was also rewritten: it asserted that `vercel.json` hardcodes
`Access-Control-Allow-Methods`, but CORS is owned per-request by
`api/_utils.js:setCorsHeaders`. The test now guards that separation and checks
the explicit `ALLOWED_ORIGINS` allowlist.

---

## 3. Security coverage added by the hardening pass

These behaviours are enforced server-side; the suite asserts the contract so a
regression is caught:

- **Server-signed quiz sessions.** `GET /api/quiz` issues an HMAC-signed token
  (`api/_session.js`) carrying `iat`, `exp`, book id, user id and a fingerprint
  of the delivered question ids. `POST /api/quiz-submit` verifies the signature,
  the book binding, the user binding and the question set before grading. Timing
  now comes from the server, not from a client-supplied `quizStartTime`.
- **Zero data loss on persistence.** A failed profile read returns `503` instead
  of overwriting accumulated score and streak.
- **Optimistic locking.** Profile updates use `.eq('score', oldScore)`; a lost
  race returns `409 PROFILE_WRITE_CONFLICT` rather than silently erasing XP.
- **Answer-key isolation.** `js/db.js` selects an explicit column list
  (`PUBLIC_QUESTION_COLUMNS`) instead of `select('*')`, so answer keys and
  explanations are no longer shipped to the browser. `sql-security-hardening.sql`
  moves them into a `question_keys` table readable only by `service_role`.
- **Bundle size.** `js/characters.js` was 538,941 bytes (99.4% base64 avatars)
  and is now 3,834 bytes with the images extracted to `covers/characters/`.

---

## 4. Known gaps

These are not covered yet and are tracked as follow-up work:

- **Frontend is untested.** `js/db.js` (82 KB), `js/app.js`, `js/auth.js`
  (36 KB), `js/progression.js`, `js/sync.js` and all 11 route modules have no
  automated coverage.
- **Live authentication is untested.** Minting a real Supabase session token
  requires credentials, so authenticated persistence paths are exercised only
  manually. `T2.5.x` covers the rejection boundary.
- **Tests touch the network.** Each Supabase query waits on a 2s timeout, which
  is most of the 24s runtime and makes the suite sensitive to connectivity. A
  `MOCK_DB=1` mode would remove both problems.
- **Oracle fallback can mask failures.** If a handler fails to import, the
  suite silently runs against `contract-oracle.js` and still passes. CI treats
  the printed `Live Handler` status as the guard; a hard `exit(1)` on oracle
  fallback would be stricter.
- **Race conditions are not simulated.** The `409` path is implemented but no
  test drives two concurrent submissions.

---

## 5. Running locally

```bash
npm ci
npm run check   # api + frontend syntax (36 files)
npm test        # 76 E2E tests
```
