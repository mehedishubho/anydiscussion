---
phase: 05-seo-basics
reviewed: 2026-08-25T21:27:44Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/app/(admin)/dashboard/posts/[id]/edit/page.tsx
  - src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx
  - src/app/(admin)/dashboard/posts/__tests__/edit-page-rsc-boundary.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 5: Code Review Report (Gap-Closure 05-08 Delta)

**Reviewed:** 2026-08-25T21:27:44Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Delta review of the 05-08 gap-closure changes (commits 937d6cc + b13db8e above diff_base 651f84f): the RSC-violating function prop removed from the edit page, SchedulePicker's direct client-side `setSchedule` call (flatpickr onChange, ~700ms useRef debounce, sonner toasts), the author-side UX hide of the Publish card, and the structural source-scan regression test. All 3 files were read in full; cross-referenced to verify claims: `src/actions/posts.ts` (`getPost`, `setSchedule`, `publishPost`), `src/actions/settings.ts` (`getSetting`), `src/actions/tags.ts` (`getPostTagIds`), `src/lib/permissions/index.ts` (`requireCan`), `PostForm.tsx` / `PreviewLink.tsx` prop surfaces, and `vitest.config.ts` (the new test's include path). The new suite was executed: **2/2 green** (`pnpm vitest run "src/app/(admin)/dashboard/posts/__tests__/edit-page-rsc-boundary.test.ts"`).

**Verified sound (adversarial checks that did NOT yield findings):**

- The RSC fix is real. The edit page now passes only `postId` (number), `publishedAt` (Date | null), and `initialTimezone` (string | undefined) — all serializable across the server-to-client boundary. `SchedulePickerProps` declares no function member. The structural test passes against the current source.
- The author hide is UX-only as claimed: `role !== "author"` (`page.tsx:102`) only hides the card; `setSchedule` independently gates with `requireCan({ post: ["publish"] })` as its FIRST statement (`posts.ts:393`), which throws `Error("FORBIDDEN")` for authors regardless of UI state. Convention "every mutating action starts with the check" is honored.
- Debounce mechanics are correct: the timer resets on every onChange fire (one settled value → one action call → one toast), is cancelled on clear-to-empty (`dates.length === 0`) and on unmount cleanup, and the async IIFE has both success and failure toast paths.
- `PostFormProps` (10 props) and `PreviewLinkProps` (2 props) were inspected — everything the edit page passes them today is serializable (primitives, arrays, `unknown` body JSON).
- `getPost`'s error contract (NOT_FOUND throw; `assertOwnsPost` FORBIDDEN/UNAUTHORIZED) mapping to the route's `notFound()` is correct for the getPost paths specifically.
- `vitest.config.ts` include globs (`src/**/__tests__/**/*.test.ts`) pick up the new test file; it runs in the node environment as designed.

The 5 Warnings are: a latent wrong-post schedule write (stale closure across dynamic-param changes), a catch-all 404 that masks infrastructure faults, a failure toast that cannot show its promised message in production builds, an ungated `getSetting` server action that the new client-side call cements, and a regression pin that is narrower than the crash class it exists to prevent.

## Critical Issues

None. No exploitable security hole, crash-on-normal-path, or data loss in the reviewed delta was found. (WR-01 is a wrong-row DB write but its trigger path does not exist in the current UI — see the finding.)

## Warnings

### WR-01: Stale `postId`/`publishedAt` closure in SchedulePicker — picking a date after a route-param change writes the schedule to the WRONG post

**File:** `src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx:77-122` (closure use at 102; eslint-disable at 121); usage site `src/app/(admin)/dashboard/posts/[id]/edit/page.tsx:110-116`
**Issue:** The flatpickr init effect has `[]` deps with `// eslint-disable-next-line react-hooks/exhaustive-deps`, so it runs exactly once and its `onChange` closure captures the FIRST render's `postId` and `publishedAt` (and `defaultDate` is likewise frozen). App Router soft navigation between `/dashboard/posts/{a}/edit` and `/dashboard/posts/{b}/edit` re-renders the same component position with new props WITHOUT remounting it (the well-known dynamic-segment gotcha — React reconciles by position/type, and neither SchedulePicker nor its parents carry a `key`). If that ever happens, the input still shows post A's schedule while the page says "Edit: B", and a picked date calls `setSchedule(postA, date)` — persisting to the wrong row. No in-page UI currently links edit→edit directly (breadcrumb exits to the list, URL-bar edits are hard navigations), so the path is latent today — but every future link that soft-navigates between edit pages silently arms it, and the disabled lint rule is precisely the one that would have flagged the missing dep.
**Fix:** Remount on post change at the usage site (one line, in a reviewed file):

```tsx
<SchedulePicker
  key={post.id}
  postId={post.id}
  publishedAt={post.publishedAt ? new Date(post.publishedAt) : null}
  initialTimezone={timezone ?? undefined}
/>
```

Apply the same `key={post.id}` to `<PostForm>` (its `defaultValues`/effects have the same staleness class), or alternatively add `postId` to the effect deps and re-initialize flatpickr when it changes.

### WR-02: Catch-all `notFound()` converts transient failures of `getPostTagIds`/`getSetting` into 404s

**File:** `src/app/(admin)/dashboard/posts/[id]/edit/page.tsx:54-63`
**Issue:** The `try` block wraps three calls, but the comment justifies 404 only for `getPost`'s error types (NOT_FOUND / FORBIDDEN / UNAUTHORIZED). `getPostTagIds(postId)` and `getSetting("site.timezone")` failing for infrastructure reasons (DB connection blip, pool exhaustion) after `getPost` succeeded also lands in the `catch` and renders a 404 — misreporting a 500-class fault as "post doesn't exist", hiding it from ops/debuggability, and blocking the user from editing a post they can access. This is incorrect behavior, not just noise: the wrong status code also pollutes any monitoring that tracks 404s.
**Fix:** Keep the auth/existence decision scoped to `getPost`; the two auxiliary reads already have sane fallbacks:

```tsx
try {
  post = await getPost(postId);
} catch {
  notFound();
}
// Non-auth auxiliary reads — degrade, don't 404.
let tagIds: number[] = [];
let timezone: string | null = null;
try {
  tagIds = await getPostTagIds(postId);
  timezone = await getSetting("site.timezone");
} catch {
  // tagIds=[] / timezone=null fall back gracefully below.
}
```

(Or rethrow non-auth errors to the route `error.tsx` if one exists.)

### WR-03: Failure toast relies on `err.message` — Next.js production builds mask thrown Server Action error messages

**File:** `src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx:104-109`; cross-file `src/actions/posts.ts:391-402`
**Issue:** The catch path promises "Raw action message (FORBIDDEN / network text)" (`err instanceof Error ? err.message : …`). In dev this works (`requireCan` throws `new Error("FORBIDDEN")`, `src/lib/permissions/index.ts:65`), but in production builds Next.js redacts uncaught Server Action error messages sent to the client — the browser receives a generic message plus a `digest`, never the literal "FORBIDDEN". So the exact failure mode this toast exists for (an author-level session somehow triggering the picker, or a denied permission) displays an opaque generic string in production. Note `setSchedule` also returns `{ ok: true }` even when its `db.update` matched 0 rows (see IN-02), so the success toast can lie too.
**Fix:** Return a typed result instead of throwing for expected failures, and branch on it client-side:

```ts
// actions/posts.ts
export async function setSchedule(postId: number, publishedAt: Date) {
  const session = await requireCan({ post: ["publish"] }); // throws only on infra faults
  // …existence check + update…
  return { ok: true as const };
}
// caller: const r = await setSchedule(postId, date);
// r.ok ? toast.success("Schedule saved") : toast.error(r.error ?? "Failed to save schedule")
```

(If keeping throw-based flow, map `digest`/known codes to friendly text in the catch.) The same dev-only-message pattern exists in PostForm/PreviewLink (05-06/05-07 convention) — out of scope here, but the convention itself deserves a follow-up.

### WR-04: `getSetting` is an ungated Server Action — the new client-side call cements a world-readable settings surface

**File:** cross-file `src/actions/settings.ts:34-41`; reviewed caller `src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx:35,64`
**Issue:** Every other action consulted in this review gates first (`getPost` → `assertOwnsPost`, `listPosts` → `requireCan read`, `saveSeoSettings` → `requireRole admin`). `getSetting(key)` performs NO session or permission check, and because it lives in a `"use server"` file it is an HTTP endpoint: any client — including a fully unauthenticated visitor POSTing to the app — can read ANY key in the settings table (`site.timezone` today, but also `storage.active_provider`, and every future key such as analytics IDs or header/footer custom code). Today's values are non-sensitive, so this is a standing exposure rather than an active leak — but the 05-08 change makes SchedulePicker call it directly from the client, which normalizes the pattern and guarantees the exposure survives any future "why is the client calling a gated action" cleanup. The reviewed component is fine; the action it now depends on is the defect.
**Fix:** In `src/actions/settings.ts`, gate reads — either require a session, or (better, since the public site may eventually need `site.timezone` too) check an explicit public-readable allowlist:

```ts
const PUBLIC_READ_KEYS = new Set(["site.timezone"]);
export async function getSetting(key: string): Promise<string | null> {
  if (!PUBLIC_READ_KEYS.has(key)) await getSessionOrThrow(); // or requireCan({settings:["read"]})
  // …existing select…
}
```

### WR-05: The RSC-boundary regression pin is narrower than the crash class it exists to prevent

**File:** `src/app/(admin)/dashboard/posts/__tests__/edit-page-rsc-boundary.test.ts:39-53`
**Issue:** Two coverage gaps versus the suite's raison d'être (the 05-UAT R1 serialization crash): (a) only the `<SchedulePicker … />` span is scanned — `PostForm` and `PreviewLink` receive props from the SAME Server Component, and a function prop on either (`formatter={…}`, `renderItem={() => …}`, an inline callback) throws identically at RSC serialization time on every render while this suite stays green; (b) only `on[A-Z]\w*=`-named props are flagged on SchedulePicker itself — any function-valued prop under a different name reintroduces the exact R1 bug undetected. The file header correctly says "a function value in a Client Component's props" is the bug class, but the assertions only pin the event-handler-named subset of one component. The pin still catches the literal R1 regression (verified: suite passes today), so this is a false-security gap, not a broken test.
**Fix:** Broaden to the whole page render (and ideally pin the sibling interfaces the way `SchedulePickerProps` is pinned):

```ts
it("edit page passes no event-handler or inline-function props to ANY client component", () => {
  const src = stripComments(readFileSync(EDIT_PAGE, "utf8"));
  // JSX-region heuristic: every PascalCase tag's prop list.
  const tags = src.match(/<[A-Z]\w*[^<>]*?>/g) ?? [];
  for (const tag of tags) {
    expect(tag, `handler/function prop in ${tag.slice(0, 40)}…`).not.toMatch(
      /\bon[A-Z]\w*\s*=|\{\s*\(\s*\)?\s*=>/,
    );
  }
});
```

## Info

### IN-01: Header comment contradicts the code on mount re-validation

**File:** `src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx:17-19` vs `61-62`
**Issue:** The header says "This component also re-validates on mount," but the effect's first line is `if (initialTimezone) return;` ("trust the server-fetched prop when available") — so on the edit page, which supplies the prop whenever the key exists, re-validation never runs. The inner comment is accurate; the header is stale. A future maintainer relying on the header could assume settings changes appear on mount.
**Fix:** Reword the header to "re-validates on mount only when no `initialTimezone` prop was supplied."

### IN-02: `setSchedule` does not verify the post exists — 0-row update still returns `{ ok: true }`

**File:** cross-file `src/actions/posts.ts:395-401`
**Issue:** `db.update(...).where(eq(posts.id, postId))` on a nonexistent id affects 0 rows and the action still returns `{ ok: true }`, so SchedulePicker toasts "Schedule saved" for a post deleted in another tab mid-session. Inconsistent with `getPost`/`publishPost`, which throw `NOT_FOUND`. Low likelihood, low harm, but it makes the success toast an unreliable signal.
**Fix:** Select existence first (or check the node-postgres rowcount like `upsertSetting` in settings.ts does) and `throw new Error("NOT_FOUND")` on miss.

### IN-03: Magic debounce constant

**File:** `src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx:111`
**Issue:** `700` is inline with only prose (comments) explaining it. The value is load-bearing (long enough to swallow flatpickr's per-tick fires, short enough to feel instant).
**Fix:** `const SCHEDULE_SAVE_DEBOUNCE_MS = 700;` above the component, referenced in the `setTimeout` call.

### IN-04: Source-scan heuristics can mis-strip the file they scan

**File:** `src/app/(admin)/dashboard/posts/__tests__/edit-page-rsc-boundary.test.ts:30-31,53`
**Issue:** `stripComments`'s `//.*$` also cuts string literals containing `//` — e.g., a future `helpUrl="https://…"` prop on SchedulePicker would eat the rest of that line and could corrupt the extracted span (potentially hiding a real violation or truncating the match). Similarly, `\bon[A-Z]\w*` would false-positive on a kebab attribute like `data-onChange`. Latent only — current source has no such literals — and the cited r2-destination convention shares it.
**Fix:** Add a guard comment in the test, or strip string literals before comments (`src.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')` first).

---

_Reviewed: 2026-08-25T21:27:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
