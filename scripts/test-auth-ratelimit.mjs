// scripts/test-auth-ratelimit.mjs
// PERF-04 / D-02 / D-03 integration test (Plan 07-02 Task 2).
// [CITED: better-auth.com/docs/concepts/rate-limit - RESEARCH.md Validation Architecture]
//
// Closes the brute-force blind spot: with the rateLimit block wired in
// src/lib/auth/index.ts (customRules 3/900s on /sign-in/email backed by ioredis
// customStorage), the 4th sign-in attempt from the same IP within 15 minutes
// MUST return HTTP 429 with an X-Retry-After (or Retry-After) header. The 1st-3rd
// attempts MUST NOT be 429.
//
// What this script does NOT verify: real attack traffic, distributed IPs, or
// the post-15min-window reset (would require faking time progression against a
// live Redis TTL - left to unit tests with mocked timers / manual operator UAT).
// This is a synthetic logic test of the rate-limit wiring, not a pen-test.
//
// T-07-02-06 (failover): when Redis is unreachable, customStorage throws after
// `maxRetriesPerRequest: 3` retries and Better Auth fails CLOSED (sign-in
// blocked) - the safer brute-force default. If the server boots but the 4 POSTs
// all error with connection failures, the script reports the fail-closed
// observation rather than silently passing.
//
// Graceful SKIP (not FAIL) when the server cannot boot (missing env, no Redis,
// port conflict) - same shape as scripts/test-auth-gate.mjs:180-184. The
// structural test (rateLimit block present in auth config) is the deterministic
// gate; this HTTP script is the integration confirmation.
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const PORT = process.env.PORT || 3940; // distinct from test-auth-gate.mjs (3939)
const HOST = "localhost";
const BASE_URL = `http://${HOST}:${PORT}`;
const NEXT_DIR = "./.next";
// Synthetic test IP sent via X-Forwarded-For - RANDOMIZED per run inside the
// RFC 5737 documentation range 203.0.113.0/24 (never a real client) so a
// stale Redis bucket left by a previous run can never consume THIS run's
// 3-attempt budget (WR-06 rerun-poisoning fix, Plan 07-06).
const TEST_IP = `203.0.113.${1 + Math.floor(Math.random() * 254)}`;
// Trust model (corrected by CR-01 / Plan 07-06 - the earlier claim that the
// production proxy replaces the X-Forwarded-For header wholesale, making
// client-supplied values safe, was disproven):
//   - TRUSTED_PROXY_CIDR unset (local dev, this harness): a SINGLE-VALUE
//     X-Forwarded-For is trusted via advanced.ipAddress.ipAddressHeaders -
//     exactly what the POSTs below send.
//   - TRUSTED_PROXY_CIDR set (production): advanced.ipAddress.trustedProxies
//     strips the chain from the RIGHT; the first untrusted hop (the real
//     client) keys the rate limit. Multi-value XFF WITHOUT trustedProxies
//     resolves to null -> ALL auth traffic shares one 3/15min bucket
//     (fail-closed over-limiting, never spoofable).
// Per-environment verification: proxy behavior is environment-specific - after
// deploy, run the through-the-proxy curl check in the SKIP instructions below
// (07-VERIFICATION "Human Verification Required" item 4).
//
// WR-07 (npx vs pnpm exec in the spawn below) is a known advisory finding
// deliberately left untouched by this closure's owner-approved scope.
const SIGN_IN_URL = `${BASE_URL}/api/auth/sign-in/email`;

// --- helpers --------------------------------------------------------------

function log(tag, msg) {
  console.log(`  [${tag}] ${msg}`);
}

function ensureBuild() {
  if (!fs.existsSync(NEXT_DIR) || !fs.existsSync(`${NEXT_DIR}/BUILD_ID`)) {
    log("build", ".next not found - running pnpm build...");
    try {
      execSync("pnpm build", { stdio: "inherit" });
    } catch {
      console.error("  FAIL: build failed - run `pnpm build` manually to diagnose.");
      process.exit(1);
    }
  } else {
    log("build", ".next found - skipping build (delete .next to force rebuild).");
  }
}

function structuralCheck() {
  // Deterministic check: rateLimit block + customStorage + the 4 customRules
  // must be present in src/lib/auth/index.ts. This catches misconfiguration
  // even when the HTTP path can't boot (no Redis running locally).
  const authPath = "./src/lib/auth/index.ts";
  if (!fs.existsSync(authPath)) {
    return { passed: false, reason: `${authPath} not found` };
  }
  const src = fs.readFileSync(authPath, "utf8");
  const required = [
    "rateLimit:",
    "customStorage:",
    '"/sign-in/email"',
    '"/forget-password"',
    '"/reset-password"',
    '"/verify-email"',
    "ipAddressHeaders",
    // CR-01 leg-1 pin (Plan 07-06 / 07-VERIFICATION gap #2): without
    // trustedProxies (env-driven via TRUSTED_PROXY_CIDR), a multi-value
    // X-Forwarded-For behind an appending proxy collapses ALL auth traffic
    // into one 3/15min bucket. This token failing the gate means the CR-01
    // fix was removed from src/lib/auth/index.ts.
    "trustedProxies",
  ];
  const missing = required.filter((tok) => !src.includes(tok));
  if (missing.length > 0) {
    return {
      passed: false,
      reason: `src/lib/auth/index.ts missing tokens: ${missing.join(", ")}`,
    };
  }
  // nextCookies() must remain LAST in the plugins array (Phase 2 D-04 / R2).
  const pluginsIdx = src.indexOf("plugins: [");
  const nextCookiesIdx = src.indexOf("nextCookies()", pluginsIdx);
  const pluginsCloseIdx = src.indexOf("],", nextCookiesIdx);
  if (pluginsIdx === -1 || nextCookiesIdx === -1 || pluginsCloseIdx === -1) {
    return { passed: false, reason: "could not locate plugins array / nextCookies()" };
  }
  const tail = src.slice(nextCookiesIdx + "nextCookies()".length, pluginsCloseIdx);
  if (tail.replace(/[\s,]+/g, "") !== "") {
    return {
      passed: false,
      reason: "nextCookies() is NOT the last entry in plugins array (Phase 2 R2 violation)",
    };
  }
  return { passed: true };
}

function waitForServer(maxWaitMs = 30000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      if (Date.now() - start > maxWaitMs) {
        resolve(false);
        return;
      }
      const req = http.get(`${BASE_URL}/`, (res) => {
        res.resume();
        resolve(res.statusCode < 500);
      });
      req.on("error", () => setTimeout(poll, 500));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(poll, 500);
      });
    };
    poll();
  });
}

async function postSignIn(attempt) {
  // Same body every attempt - the rate limiter keys on IP+path, not credentials.
  // Use a fake email so we never accidentally authenticate a real account.
  const body = JSON.stringify({
    email: "ratelimit-test@example.invalid",
    password: "definitely-not-a-real-password",
  });
  const res = await fetch(SIGN_IN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": TEST_IP, // synthetic client IP (T-07-02-03 trust)
      "content-length": String(Buffer.byteLength(body)),
    },
    body,
  });
  const retryAfter =
    res.headers.get("x-retry-after") || res.headers.get("retry-after");
  log(
    "http",
    `attempt ${attempt}: status=${res.status} ${retryAfter ? `retry-after=${retryAfter}` : "(no retry-after)"}`,
  );
  return { status: res.status, retryAfter };
}

async function httpCheck() {
  log("http", `Spawning next start on port ${PORT}...`);
  // WR-06 (Plan 07-06 / 07-REVIEW): detached ONLY on POSIX so the child
  // becomes a process-group leader - the negative-PID group kill in the
  // finally block below is valid only then (a detached:false child has no
  // group with pgid === its pid -> process.kill(-pid) threw ESRCH ->
  // previously swallowed -> orphaned next-start holding the port, poisoning
  // every rerun). Windows keeps detached:false (a detached child there would
  // flash a new console) and uses taskkill /f /t to tree-kill.
  const server = spawn(`npx next start -p ${PORT}`, {
    stdio: "pipe",
    shell: true,
    detached: process.platform !== "win32",
  });

  let serverStderr = "";
  server.stderr?.on("data", (d) => {
    serverStderr += d.toString();
  });

  try {
    log("http", "Waiting for server to become reachable...");
    const reachable = await waitForServer(30000);
    if (!reachable) {
      log("http", "Server did not become reachable within 30s - SKIP (likely missing env/Postgres/Redis)");
      if (serverStderr) log("http", `Server stderr (first 300 chars): ${serverStderr.substring(0, 300)}`);
      return { status: "skipped", reason: "server-unavailable" };
    }
    log("http", "Server is reachable - issuing 4 sign-in attempts with the same synthetic IP...");

    const results = [];
    for (let i = 1; i <= 4; i++) {
      // T-07-02-06: if Redis is unreachable, customStorage throws and we may get
      // a 5xx or connection-reset. Capture and surface - do NOT silently pass.
      try {
        results.push(await postSignIn(i));
      } catch (err) {
        log("http", `attempt ${i} threw: ${err.message} - likely Redis unreachable (fail-closed)`);
        return {
          status: "skipped",
          reason: `redis-unreachable-fail-closed (${err.message})`,
        };
      }
    }

    // Assert: attempts 1-3 NOT 429; attempt 4 IS 429 with retry-after.
    const earlyFail = results.slice(0, 3).filter((r) => r.status === 429);
    if (earlyFail.length > 0) {
      return {
        status: "failed",
        reason: `attempt(s) ${earlyFail.map((_, i) => i + 1).join(",")} returned 429 before the 4th try - rate limiter is too strict or the IP was already budget-exhausted`,
      };
    }
    const fourth = results[3];
    if (fourth.status !== 429) {
      return {
        status: "failed",
        reason: `expected 4th attempt to return 429, got ${fourth.status} - rate limiter is not enforced (Redis customStorage miswired?)`,
      };
    }
    if (!fourth.retryAfter) {
      return {
        status: "failed",
        reason: "4th attempt returned 429 but no X-Retry-After / Retry-After header - Better Auth version drift?",
      };
    }

    log("http", `PASS: 4th attempt returned 429 with retry-after=${fourth.retryAfter}`);
    return { status: "passed", detail: `retry-after=${fourth.retryAfter}` };
  } finally {
    try {
      // WR-04 (Plan 07-07 / 07-REVIEW): guard the cleanup kill with a pid
      // existence check — a failed spawn leaves server.pid undefined, and the
      // unguarded kill would attempt taskkill/negative-pid on undefined and
      // log predictable noise on both platform paths.
      if (server.pid) {
        if (process.platform === "win32") {
          // execSync, NOT spawn (WR-06, Plan 07-06): a spawned taskkill child
          // leaves an open libuv async handle that races process.exit teardown —
          // observed 2026-08-26: the harness printed "Result: PASS (exit 0)" and
          // THEN crashed in node's src\win\async.c ("!(handle->flags &
          // UV_HANDLE_CLOSING)", pnpm exit 3221226505) while the taskkill child
          // had not yet killed the server (orphan held the port). execSync blocks
          // until the tree-kill completes: no dangling handle, no orphan.
          execSync(`taskkill /pid ${server.pid} /f /t`, { stdio: "ignore" });
        } else {
          process.kill(-server.pid, "SIGTERM");
        }
      }
    } catch (err) {
      // WR-06 (Plan 07-06 / 07-REVIEW): a bare ESRCH from a non-leader child
      // was previously swallowed here - an orphaned server holding the port
      // is exactly the failure this cleanup exists to prevent, so LOG it.
      const code = err && typeof err === "object" && "code" in err ? err.code : "unknown";
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `  [cleanup] FAILED to kill server (pid=${server.pid}, code=${code}): ${msg}`,
      );
    }
  }
}

// --- main -----------------------------------------------------------------

async function main() {
  console.log("\n===============================================");
  console.log("  PERF-04 Auth Rate-Limit Integration Test (07-02)");
  console.log("===============================================\n");

  ensureBuild();

  console.log("\n-- Structural Check --");
  const structural = structuralCheck();
  if (structural.passed) {
    console.log("  OK:STRUCTURAL CHECK PASSED\n");
  } else {
    console.log(`  FAIL:STRUCTURAL CHECK FAILED: ${structural.reason}\n`);
    process.exitCode = 1;
  }

  console.log("-- HTTP Check --");
  const httpResult = await httpCheck();
  if (httpResult.status === "passed") {
    console.log(`  OK:HTTP CHECK PASSED (${httpResult.detail})\n`);
  } else if (httpResult.status === "skipped") {
    console.log(`  SKIP:HTTP CHECK SKIPPED (${httpResult.reason})\n`);
    console.log("    To run manually:");
    console.log("      1. docker compose up -d redis");
    console.log("      2. pnpm build && PORT=3940 pnpm start");
    console.log(`      3. for i in 1 2 3 4; do curl -sI -X POST ${SIGN_IN_URL} \\`);
    console.log("           -H 'content-type: application/json' \\");
    console.log("           -H 'x-forwarded-for: " + TEST_IP + "' \\");
    console.log("           -d '{\"email\":\"a@b.invalid\",\"password\":\"x\"}' | head -1;");
    console.log("         done");
    console.log("      Expected: 4th response is HTTP/1.1 429 with a retry-after header");
    console.log("      4. AFTER DEPLOY - per-environment IP-trust verification (CR-01 leg 3 /");
    console.log("         07-VERIFICATION \"Human Verification Required\" item 4): through the");
    console.log("         REAL deployed proxy (not direct-to-app), send a sign-in POST while");
    console.log("         injecting a fake X-Forwarded-For from the documentation range:");
    console.log("           curl -s -o /dev/null -w '%{http_code}' \\");
    console.log("             https://<prod-host>/api/auth/sign-in/email \\");
    console.log("             -X POST -H 'content-type: application/json' \\");
    console.log("             -H 'X-Forwarded-For: 198.51.100.99' \\");
    console.log("             -d '{\"email\":\"a@b.invalid\",\"password\":\"x\"}'");
    console.log("         Then confirm from logs/behavior that the resolved client IP is the");
    console.log("         PROXY-DERIVED value (trustedProxies strips the chain from the right");
    console.log("         per TRUSTED_PROXY_CIDR), not the injected 198.51.100.99 - i.e. rate");
    console.log("         buckets stay per-client. Proxy behavior is environment-specific;");
    console.log("         this check re-verifies the trust model per environment.\n");
  } else {
    console.log(`  FAIL:HTTP CHECK FAILED: ${httpResult.reason}\n`);
    if (structural.passed) {
      console.log("  NOTE: Structural check passed - HTTP failure may be env-specific.\n");
    }
    // WR-04 (Plan 07-07 / 07-REVIEW): the failure exit is UNCONDITIONAL. The
    // previous shape set exitCode=1 only when the structural check ALSO failed,
    // so an HTTP regression with a passing structural check printed FAIL but
    // exited 0 — and the summary line printed "Result: PASS (exit 0)" directly
    // contradicting the FAIL line above it. Any automation consuming the exit
    // code would have certified a broken limiter. Exit 0 remains ONLY for
    // "passed" and "skipped".
    process.exitCode = 1;
  }

  console.log("-- Summary --");
  console.log(`  Structural: ${structural.passed ? "PASS" : "FAIL"}`);
  console.log(`  HTTP:       ${httpResult.status.toUpperCase()}`);
  console.log(`  Result:     ${process.exitCode ? "FAIL (exit 1)" : "PASS (exit 0)"}\n`);

  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
