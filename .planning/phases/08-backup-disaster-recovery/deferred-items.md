# Phase 8 — Deferred / Out-of-Scope Discoveries

Items discovered during Phase 8 execution that are OUT OF SCOPE for the current plan
(pre-existing, unrelated to the plan's changes). Logged per the executor deviation
scope-boundary rule — not fixed here.

## Pre-existing TypeScript strict-null errors (out of scope)

**Found during:** Plan 08-01 final `pnpm exec tsc --noEmit` verification.
**File:** `src/actions/__tests__/storage-settings.test.ts` (Phase 4, not touched by 08-01)
**Errors (4):**
- L318, L319: `result.cloudinary` is possibly 'undefined'
- L321, L322: `result.r2` is possibly 'undefined'

**Status:** Pre-existing — these errors exist on `main` independent of Phase 8. The
`src/lib/backup/**` verification target is CLEAN (zero errors). The errors are in a
Phase-4 Storage Settings test file's optional-property access under strict null checks.
**Action:** Out of scope for 08-01 (Rule scope boundary). Surface for a future Phase 4
cleanup pass if desired; does not block Phase 8.

## Deferred live verifications (per CONTEXT execution caveat)

Phase 7 production deploy is DEFERRED by the founder. The following live verifications wait
for a deployed app + managed Postgres (tracked in 08-01-PLAN `<verification>` deferred-live
and ROADMAP §Phase 8 pitfalls) — NOT attempted during 08-01:
- Real `pg_dump -Fc` against managed Postgres producing a restorable `.sqlc`.
- `runBackupJob` writing to `storage/backups/` on the VPS.
- Real `pg_restore` round-trip.

## `.env.example` Google OAuth placeholders (permission-blocked, 08-03)

**Found during:** Plan 08-03 Task 1. The google-drive.ts module reads `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` from `process.env`. The plan body calls for these
to be documented as empty placeholders in `.env.example`, but the harness permission guard DENIES
all tool access (Read / Edit / `cat` / `printf >>`) to any `.env*` path (a secret-leak safeguard).

**Status:** Not a code blocker — `google-drive.ts` reads `process.env.*` at call time and works
regardless of whether `.env.example` documents the keys. `.env.example` is operator-facing
documentation only and is NOT in 08-03's `files_modified`. The OAuth client itself is a
`user_setup` item the operator creates in Google Cloud Console.

**Action:** Operator (or a future session with `.env.example` write access) must append the
following block to `.env.example`:

```
# === Google Drive backup destination (Phase 8 — OAuth user-consent flow, D-02) ===
# Operator creates this OAuth client in Google Cloud Console -> APIs & Services ->
# Credentials -> Create OAuth client ID (Web application). USER-CONSENT flow (not a
# service account). Authorized redirect URI: https://anydiscussion.com/api/auth/google/callback
# Leave empty for local dev (Drive destination not connected until configured).
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

**Scope-boundary:** Out of scope for 08-03 code (permission guard, not a code defect).
