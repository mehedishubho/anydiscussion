---
phase: 08-backup-disaster-recovery
plan: "03"
subsystem: infra
tags: [google-drive, oauth, backup, disaster-recovery, googleapis, csrf, encryption, route-handler]

# Dependency graph
requires:
  - phase: 08-backup-disaster-recovery
    provides: BackupDestination interface + getEnabledDestinations lazy registry + readBackupConfig/readSetting/upsertSetting settings I/O + BACKUP_GDRIVE_CREDS_KEY (08-01)
  - phase: 04-dashboard-chrome
    provides: lib/crypto AES-256-GCM credential envelope (D-25) + the Next 16 async-params Route Handler shape
provides:
  - "buildConsentUrl(state) / exchangeCode(code) / revokeDriveToken(refreshToken) — src/lib/backup/destinations/google-drive.ts"
  - "gdriveBackupDestination (BackupDestination, name 'gdrive') — upload/list/download/delete/testConnection via googleapis drive.files.*"
  - "GET Route Handler at /api/auth/google/callback (CSRF state verify + encrypted refresh-token store) — src/app/api/auth/google/callback/route.ts"
affects: [08-04-backup-settings-ui, 08-05-cron-drill]

# Tech tracking
tech-stack:
  added:
    - "googleapis@173.0.0 (the ONLY new runtime package this phase — verified legitimate: official googleapis/google-api-nodejs-client repo, 9.8M/wk, no postinstall, RESEARCH Package Legitimacy Audit)"
  patterns:
    - "OAuth2 user-consent flow (D-02): buildConsentUrl → Google consent → callback exchanges code → encrypt(refreshToken) → upsert backup.gdrive_creds; googleapis auto-refreshes the access token (no hand-rolled refresh — RESEARCH Anti-Pattern)"
    - "CSRF state gate (T-08-03): signed httpOnly gdrive_oauth_state cookie set by 08-04 getGoogleConsentUrl, verified by the callback BEFORE any token exchange; mismatch → 400 + no exchange"
    - "Best-effort token revocation (D-02): revokeDriveToken wraps revokeToken in try/catch so an already-revoked/expired token never throws to the caller (refresh handled by googleapis; revocation is explicit)"
    - "drive.file least-privilege scope (T-08-03c): app-created files ONLY; a string-aware source gate asserts the over-privileged full 'drive' scope is absent"

key-files:
  created:
    - src/lib/backup/destinations/google-drive.ts
    - src/app/api/auth/google/callback/route.ts
    - src/lib/backup/__tests__/google-drive.test.ts
    - src/lib/backup/__tests__/google-callback.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Standalone callback Route Handler (NOT mounted via Better Auth's toNextJsHandler): Google redirects the browser directly to /api/auth/google/callback; the Better Auth mount stays at /api/auth/[...all]. Keeps the OAuth flow decoupled from the auth framework."
  - "NextResponse.redirect(url, 302) over the throwing redirect() from next/navigation: returns a real Response object so the handler is unit-testable (assert status 302 + Location header) without mocking redirect's internal NEXT_REDIRECT throw."
  - "drive.file scope + access_type:'offline' + prompt:'consent' are all non-negotiable (RESEARCH Pitfall 4): the first two guarantee a refresh_token; prompt:consent forces a FRESH refresh_token on every re-auth so it is never lost (T-08-03d)."
  - "Name→fileId translation for download/delete: Drive addresses files by fileId, not name, so download/delete first resolve the fileId via drive.files.list(q: name = '<key>'); delete is idempotent (missing fileId = no-op)."
  - "testConnection returns {ok:false, error:'Google Drive not connected'} when backup.gdrive_creds is absent — mirrors the R2 destination's 'not configured' shape so the 08-04 dashboard renders a consistent pre-connect state."

patterns-established:
  - "OAuth consent URL carries the 4 non-negotiable params (access_type/prompt/drive.file/state) — asserted by google-drive.test.ts"
  - "CSRF state is cookie-bound + verified-before-exchange + cleared-after-use (one-shot) — the callback contract 08-04's getGoogleConsentUrl relies on"

requirements-completed: [BACKUP-02, BACKUP-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "buildConsentUrl(state) emits access_type=offline + prompt=consent + drive.file scope + state CSRF token"
    requirement: BACKUP-02
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/google-drive.test.ts#buildConsentUrl returns a URL carrying access_type/prompt/drive.file/state"
        status: pass
    human_judgment: false
  - id: D2
    description: "exchangeCode/revokeDriveToken + the gdrive BackupDestination (upload/list/download/delete/testConnection) via googleapis drive.files.*"
    requirement: BACKUP-01
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/google-drive.test.ts#upload setCredentials + drive.files.create; testConnection {ok:false} when no creds"
        status: pass
      - kind: unit
        ref: "src/lib/backup/__tests__/google-drive.test.ts#revokeDriveToken does NOT throw when revokeToken rejects (best-effort)"
        status: pass
    human_judgment: false
  - id: D3
    description: "OAuth callback verifies CSRF state (mismatch → 400 + no exchange), exchanges code, encrypts the refresh_token, upserts backup.gdrive_creds, 302 redirect"
    requirement: BACKUP-02
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/google-callback.test.ts#valid state+code → exchangeCode + encrypt + upsert + 302; mismatched/missing state → 400 + no exchange"
        status: pass
      - kind: unit
        ref: "src/lib/backup/__tests__/google-callback.test.ts#exchangeCode rejection → 302 ?gdrive_error= (never 500)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live Google OAuth consent round-trip stores a real refresh token + Test connection succeeds against Drive"
    requirement: BACKUP-02
    verification: []
    human_judgment: true
    rationale: "Phase 7 production deploy is deferred by the founder; a real OAuth round-trip requires the deployed app + an operator-created Google Cloud OAuth client (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI in user_setup). Tracked in 08-03-PLAN deferred-live + ROADMAP §Phase 8 pitfalls."

# Metrics
duration: 8min
completed: 2026-07-29
status: complete
---

# Phase 8 Plan 03: Google Drive Destination + OAuth User-Consent Flow Summary

**Google Drive backup destination via the `googleapis` OAuth2 user-consent flow (D-02) — buildConsentUrl/exchangeCode/revokeDriveToken helpers + a `gdrive` BackupDestination (drive.file scope, auto-refreshing tokens) + a standalone callback Route Handler that verifies the CSRF state, encrypts the refresh token, and stores it under `backup.gdrive_creds`.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-29T16:47:49Z
- **Completed:** 2026-07-29T16:55:57Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 6 (2 source modules created, 2 Wave 0 test files created, package.json + pnpm-lock.yaml for the googleapis install)

## Accomplishments
- Added the Google Drive backup destination (`gdriveBackupDestination`, name `"gdrive"`) implementing the full `BackupDestination` contract via `google.drive({version:"v3"}).files.*` — upload (streaming `Readable.from(buffer)` body), list (name-contains `q` filter), download (name→fileId resolve + `alt:"media"`), delete (idempotent name→fileId resolve + `files.delete`), and a never-throws `testConnection` that returns `{ok:false, error:"Google Drive not connected"}` when no creds are stored.
- Exported the three OAuth helpers: `buildConsentUrl(state)` (carries all four non-negotiable params — `access_type:"offline"`, `prompt:"consent"`, `drive.file` scope, `state`), `exchangeCode(code)` (returns the tokens object so the callback reads `.refresh_token`), and `revokeDriveToken(refreshToken)` (best-effort `try/catch` around `revokeToken` — the revocation half of D-02; refresh is handled automatically by the googleapis client).
- Built the standalone OAuth callback Route Handler at `/api/auth/google/callback` — a Next 16 async-`searchParams` GET handler with `runtime = "nodejs"`. It verifies the `state` param against the signed httpOnly `gdrive_oauth_state` cookie (set by the 08-04 `getGoogleConsentUrl` action) BEFORE any token exchange: mismatched/missing state → **400 + no exchange** (CSRF defense, T-08-03). On valid state it calls `exchangeCode` → `encrypt(JSON.stringify({refreshToken}))` → `upsertSetting("backup.gdrive_creds", blob)` → clears the one-shot cookie → 302 redirect to `/dashboard/settings/backup`. Any exchange failure redirects with `?gdrive_error=` (never a 500).
- Installed `googleapis@173.0.0` via `pnpm add googleapis` — the ONLY new runtime package this phase (verified legitimate per RESEARCH Package Legitimacy Audit: official Google repo, no postinstall). The 08-01 lazy non-literal-dynamic-import registry keeps it bundle-excluded unless Drive is enabled.
- All 20 new Wave 0 tests green; full project suite 454/454 green; zero `tsc` errors in `src/lib/backup/destinations/google-drive.ts` and `src/app/api/auth/google/callback/route.ts`.

## Task Commits

Each task was committed atomically (TDD: RED test commit → GREEN implementation commit):

1. **Task 1 RED: Google Drive destination + OAuth helper tests** — `c8ffbb5` (test)
2. **Task 1 GREEN: googleapis install + Google Drive destination + OAuth helpers** — `19b942d` (feat)
3. **Task 2 RED: OAuth callback CSRF+encrypt-store tests** — `6095051` (test)
4. **Task 2 GREEN: OAuth callback Route Handler** — `2b53a79` (feat)

## Files Created/Modified
- `src/lib/backup/destinations/google-drive.ts` — `buildConsentUrl`/`exchangeCode`/`revokeDriveToken` + `gdriveBackupDestination` (drive.files.create/list/get/delete); OAuth2 client built from `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` env vars; creds decrypted from `backup.gdrive_creds`; `drive.file` scope (least privilege)
- `src/app/api/auth/google/callback/route.ts` — standalone GET Route Handler (NOT Better-Auth-mounted); `runtime = "nodejs"`; Next 16 async `searchParams`; CSRF state verify → `exchangeCode` → `encrypt` → `upsertSetting` → 302; 400 on state mismatch
- `src/lib/backup/__tests__/google-drive.test.ts` — mocked `googleapis` (consent URL params, getToken, revokeToken best-effort no-throw, drive.files.* round-trip, testConnection shapes) + a string-aware scope-gate (drive.file present, full `drive` absent)
- `src/lib/backup/__tests__/google-callback.test.ts` — mocked exchangeCode/encrypt/upsertSetting/cookies; valid-state happy path + mismatched/missing-state 400 + exchange-rejection 302 ?gdrive_error
- `package.json` + `pnpm-lock.yaml` — added `googleapis@173.0.0`

## Decisions Made
- **Standalone callback Route Handler (not Better-Auth-mounted):** Google redirects the admin's browser directly to `/api/auth/google/callback`. The Better Auth mount (`toNextJsHandler`) stays at `/api/auth/[...all]`; mounting the Google callback through it would couple the OAuth flow to the auth framework and confuse Google's redirect. A standalone GET export is the clean sibling.
- **`NextResponse.redirect(url, 302)` over the throwing `redirect()` from `next/navigation`:** returns a real `Response` object so the handler is unit-testable — the test asserts `res.status === 302` and `res.headers.get("Location")` without mocking `redirect`'s internal `NEXT_REDIRECT` throw. Both are valid Next patterns; the returning form wins on testability here.
- **Name→fileId translation:** Drive addresses files by `fileId`, not name, so `download`/`delete` first resolve the `fileId` via `drive.files.list({q: "name = '<key>'"})`. `delete` is idempotent (a missing `fileId` is a no-op, mirroring the R2/local `delete` contract). Upload stores the backup key as the Drive file `name`, so the translation is deterministic.
- **`testConnection` "not connected" shape:** returns `{ok:false, error:"Google Drive not connected"}` when `backup.gdrive_creds` is absent — mirrors the R2 destination's `{ok:false, error:"...not configured"}` so the 08-04 dashboard renders a consistent pre-connect state across destinations.
- **All four consent params non-negotiable (RESEARCH Pitfall 4):** `access_type:"offline"` is required to receive a refresh_token at all; `prompt:"consent"` forces a FRESH refresh_token on every re-auth so it is never lost (without it only the first-ever consent returns one — T-08-03d). The test asserts all four appear in the consent URL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added env stubs + a string-aware comment stripper to the google-drive test**
- **Found during:** Task 1 GREEN (running the test against the new module).
- **Issue:** (a) The OAuth2-constructor assertion references stubbed env values (`g-client-id`, etc.) but the RED test did not stub `process.env.GOOGLE_*` — `buildOAuth2` reads env lazily at call time, so the ctor would receive `undefined`. (b) The scope-gate's naive comment stripper (`\/\/.*$/gm`) destroyed the `//` inside the `https://` URL in the `DRIVE_FILE_SCOPE` string literal, causing the "contains drive.file" assertion to fail on its own source.
- **Fix:** (a) Added `vi.stubEnv` for the three `GOOGLE_*` vars in `beforeEach` + `vi.unstubAllEnvs()` in `afterEach`. (b) Replaced the regex stripper with a string-aware scanner (`stripComments`) that tracks string delimiters, so `//` inside a string literal is preserved while real comments are removed.
- **Files modified:** `src/lib/backup/__tests__/google-drive.test.ts`
- **Verification:** all 15 google-drive tests pass; the scope gate now correctly proves drive.file is present AND the full `drive` scope is absent.
- **Committed in:** `19b942d` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking test-fixture issue)
**Impact on plan:** None — additive test-fixture corrections; no scope creep, no plan changes. Both the RED tests (committed) and the GREEN implementation are faithful to the plan `<behavior>`.

## Issues Encountered
- **`.env.example` access permission-blocked:** the harness denies all tool access (Read / Edit / `cat` / `printf >>`) to any `.env*` path (a secret-leak safeguard). The plan body calls for `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` placeholders in `.env.example`, but this is operator-facing documentation only — the `google-drive.ts` module reads `process.env.*` at call time and is fully functional without it. `.env.example` is not in 08-03's `files_modified`. Logged to `deferred-items.md` with the exact block for the operator to append.

## Known Stubs
None. The Google Drive destination, OAuth helpers, and callback are fully wired (no placeholder data paths). Live OAuth round-trip is a deferred **verification** (not a stub) — see "User Setup Required".

## Known Limitations
- **Live OAuth round-trip deferred:** a real Google consent → callback → refresh-token store → "Test connection" round-trip waits for Phase 7 deploy + an operator-created Google Cloud OAuth client (see D4 coverage + user_setup). Code + mocked unit tests are complete.
- **Drive list pagination not paged:** the v1 `list` uses a single `drive.files.list` call (no `pageToken` loop). Backup counts are bounded by the daily/30-day retention convention (≤30 dump files per destination), so a single page (default pageSize 100) is sufficient. If Drive ever holds >100 app-created backup files (e.g., retention misconfigured), pagination would be needed — a fast-follow, not a blocker.

## User Setup Required

**External services require manual configuration (deferred — not needed for this plan's mocked tests).** The Google Cloud OAuth client must be created before live Drive backups run. Env vars (read at runtime by `buildOAuth2`; the real values are NOT committed — `.env.example` placeholders are permission-blocked, see Issues):
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application).
- `GOOGLE_REDIRECT_URI` — set to `https://anydiscussion.com/api/auth/google/callback` (must match the authorized redirect URI in the OAuth client).

The OAuth client is a USER-CONSENT flow (D-02, not a service account). No real secrets are committed to the repo.

## Threat Flags
None. No security-relevant surface beyond what the plan's `<threat_model>` already covers (the CSRF state gate, encrypted refresh-token storage, drive.file least-privilege, and the verified googleapis package are all mitigations IN the threat register). The callback's one-shot state-cookie clearing (added as Rule 2 defense-in-depth) reinforces T-08-03.

## Next Phase Readiness
- The `gdrive` destination is auto-resolved by `getEnabledDestinations()` (08-01 registry) once `backup.config.destinations.gdrive === true` — no registry change needed (the non-literal dynamic import resolves `./destinations/google-drive` at runtime, and `gdriveBackupDestination` is the export name the registry expects).
- Exports match what 08-04 consumes: `buildConsentUrl(state)` (→ `getGoogleConsentUrl`), `revokeDriveToken(refreshToken)` (→ `disconnectGoogleDrive`), and the callback Route Handler at `/api/auth/google/callback` that 08-04's `getGoogleConsentUrl` cookie-state contract depends on.
- **Blocker for live operation (not for code):** Phase 7 deploy + the operator-created Google Cloud OAuth client + `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` provisioning before real Drive backups run.

## Self-Check: PASSED

- All 4 created files exist on disk (2 source modules + 2 Wave 0 test files). package.json lists `googleapis@^173.0.0`.
- All 4 task commits present in git history (`c8ffbb5`, `19b942d`, `6095051`, `2b53a79`).
- Full backup suite: 454/454 tests pass. Full project suite: 454/454 tests pass.
- `pnpm exec tsc --noEmit`: zero errors in `src/lib/backup/destinations/google-drive.ts` and `src/app/api/auth/google/callback/route.ts` (the 4 remaining project-wide errors are the pre-existing Phase-4 `storage-settings.test.ts` ones, out of scope — see `deferred-items.md`).

---
*Phase: 08-backup-disaster-recovery*
*Completed: 2026-07-29*
