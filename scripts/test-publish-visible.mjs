#!/usr/bin/env node
// [CITED: scripts/test-auth-gate.mjs pattern + RESEARCH.md Example 3 (L629-672)]
//
// publish->visible end-to-end check (Plan 07-03 Task 3 / PERF-03 / Pitfall 3).
// Verifies that a published post appears on the public site within the 30s
// revalidation window on the REAL Coolify + Cloudflare stack.
//
// USAGE (operator UAT, run after a Coolify deploy):
//   PROD_URL=https://anydiscussion.com TEST_SLUG=my-test-post pnpm test:publish-visible
//
// Publish step: this script is a POLLER. The operator publishes a post with the
// test slug via the dashboard (the real publishPost action fires revalidation);
// this script then polls the public URL until the content appears. This keeps the
// script off the fragile auth/DB-insert path and exercises the actual
// publish->revalidate->visible loop end-to-end. If TEST_SLUG is unset the script
// generates one and prints it so the operator knows what to publish.
//
// SKIPs (exit 0) when PROD_URL is unreachable. FAILs (process.exitCode = 1, NOT
// process.exit) when the post is not visible within 30s.
//
// ASCII-only on purpose: ESLint's .mjs parser rejects Unicode decorative chars.

const PROD_URL = (process.env.PROD_URL ?? "https://anydiscussion.com").replace(/\/$/, "");
const TEST_SLUG = process.env.TEST_SLUG ?? "publish-visible-test-" + Date.now();
const DEADLINE_MS = 30_000; // 30s ceiling (RESEARCH.md Validation Architecture)
const POLL_INTERVAL_MS = 1000;

function log(stage, msg) {
  console.log("[" + stage + "] " + msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// fetch with redirect: "manual" so a cache-hit 200 vs a redirect is distinguishable
// (mirrors scripts/test-auth-gate.mjs's redirect-manual pattern).
async function fetchManualRedirect(url) {
  return fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "publish-visible-test/1.0" },
  });
}

async function isReachable(url) {
  try {
    const res = await fetchManualRedirect(url);
    // 200, or a 3xx redirect, or even a 404 all prove the origin is reachable;
    // a network-level failure (rejected promise) is the only "unreachable" case.
    return res.status > 0;
  } catch {
    return false;
  }
}

// Visible == the public single-post route resolves to the post (status 200) and the
// response HTML references the slug (the rendered <article>). A 404 means the
// publish or its revalidation hasn't landed yet.
async function isVisible(slug) {
  const url = PROD_URL + "/blog/" + slug;
  try {
    const res = await fetchManualRedirect(url);
    if (res.status !== 200) return false;
    const html = await res.text();
    return html.includes(slug);
  } catch {
    return false;
  }
}

// Cleanup: best-effort. The operator published the post via the dashboard, so the
// canonical cleanup is also via the dashboard (delete the test post). A DB cleanup
// would be schema-fragile and bypasses soft-delete; instruct the operator instead.
function cleanup(slug) {
  log("cleanup", "delete the test post (slug " + slug + ") via the dashboard, or:");
  log("cleanup", "  DELETE FROM post_seo WHERE slug = '" + slug + "'; (then soft-delete the post)");
}

async function main() {
  console.log("==================================================");
  console.log(" publish->visible end-to-end check (PERF-03)");
  console.log("==================================================");
  log("config", "PROD_URL=" + PROD_URL);
  log("config", "TEST_SLUG=" + TEST_SLUG);
  log("config", "deadline=" + DEADLINE_MS / 1000 + "s  poll=" + POLL_INTERVAL_MS + "ms");
  console.log("");

  // 1. Reachability gate.
  if (!(await isReachable(PROD_URL))) {
    log("skip", PROD_URL + " is unreachable - run this script after the Coolify deploy is live.");
    process.exitCode = 0;
    return;
  }
  log("poll", "origin reachable. Polling " + PROD_URL + "/blog/" + TEST_SLUG + " ...");
  log("poll", "(if you have not already, publish a post with slug " + TEST_SLUG + " now)");

  // 2. Poll until visible or the 30s deadline expires.
  const start = Date.now();
  let visible = false;
  while (Date.now() - start < DEADLINE_MS) {
    if (await isVisible(TEST_SLUG)) {
      visible = true;
      break;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  const elapsedMs = Date.now() - start;

  // 3. Cleanup regardless of outcome.
  cleanup(TEST_SLUG);

  // 4. Verdict. Use process.exitCode (NOT process.exit) per scripts/verify.mjs convention.
  console.log("");
  if (visible) {
    log("pass", "publish->visible in " + (elapsedMs / 1000).toFixed(1) + "s");
    process.exitCode = 0;
  } else {
    console.error(
      "FAIL: post not visible at " + PROD_URL + "/blog/" + TEST_SLUG +
        " after " + (DEADLINE_MS / 1000) + "s"
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("unexpected error: " + (err?.message ?? err));
  process.exitCode = 1;
});
