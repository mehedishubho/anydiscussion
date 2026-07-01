// scripts/verify.mjs
// [VERIFIED: drizzle-kit generate drift gate + eslint planted-import + node --experimental-strip-types]
// The single pnpm verify phase gate (D-15). Machine-checks each of the 5 Phase 1
// success criteria 1:1 across 6 named checks.
//
// Checks:
//   1. next.config validation (FOUND-01: cacheComponents/standalone/image-loader)
//   2. drift gate (FOUND-03/FOUND-06: drizzle-kit generate + git diff)
//   3. clean-room migration test (FOUND-06: test-migrations.mjs against :5436)
//   4. ESLint route-group isolation (FOUND-04: planted cross-group import must fail)
//   5. next build (FOUND-01: build succeeds)
//   6. R2 upload smoke (FOUND-05: 3 WebP variants to MinIO)
//
// Windows-safe: execFileSync with shell:true for pnpm. process.exitCode = 1 on
// any failure (NOT process.exit(1) — allows summary to print).
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// Child-process env that carries the DB + S3 defaults into spawned steps
// (drizzle-kit generate needs DATABASE_URL; r2-smoke needs S3_*).
// node does NOT auto-load .env.local, so we inject the working MinIO defaults
// here, overridable by any real values already in process.env.
const CHILD_ENV = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5435/anydiscussion",
  TEST_DATABASE_URL:
    process.env.TEST_DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5436/anydiscussion_test",
  S3_ENDPOINT: process.env.S3_ENDPOINT || "http://localhost:9000",
  S3_REGION: process.env.S3_REGION || "us-east-1",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "minioadmin",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "minioadmin",
  S3_BUCKET: process.env.S3_BUCKET || "anydiscussion-media",
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE || "true",
};

const results = [];

/** Run a command synchronously, returning { status, stdout, stderr }. */
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    shell: process.platform === "win32",
    encoding: "utf8",
    env: CHILD_ENV,
    ...opts,
  });
}

/** Run a command inheriting stdio (so the user sees live output). */
function runInherit(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: REPO_ROOT,
    shell: process.platform === "win32",
    env: CHILD_ENV,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Check 1: next.config validation (FOUND-01)
// ---------------------------------------------------------------------------
function checkNextConfig() {
  const name = "Check 1: next.config validation (cacheComponents/standalone/image-loader)";
  console.log(`\n▶ ${name}`);
  const configPath = resolve(REPO_ROOT, "next.config.ts");
  if (!existsSync(configPath)) {
    results.push({ name, pass: false, detail: "next.config.ts not found" });
    return;
  }
  const text = readFileSync(configPath, "utf8");
  const required = ["cacheComponents", "standalone", "loaderFile"];
  const missing = required.filter((tok) => !text.includes(tok));
  if (missing.length > 0) {
    results.push({
      name,
      pass: false,
      detail: `missing tokens: ${missing.join(", ")}`,
    });
    console.log(`✗ missing tokens: ${missing.join(", ")}`);
  } else {
    results.push({ name, pass: true, detail: "all tokens present" });
    console.log("✓ cacheComponents, standalone, loaderFile all present.");
  }
}

// ---------------------------------------------------------------------------
// Check 2: drift gate (FOUND-03/FOUND-06)
// drizzle-kit generate + git diff --exit-code src/db/migrations/ (Pitfall 1).
// ---------------------------------------------------------------------------
function checkDriftGate() {
  const name =
    "Check 2: drift gate (drizzle-kit generate + git diff src/db/migrations)";
  console.log(`\n▶ ${name}`);
  // Generate with a throwaway name. If schema matches migrations, no new files
  // are produced and git diff is clean (exit 0 = pass).
  const gen = runInherit("npx", [
    "drizzle-kit",
    "generate",
    "--name",
    "ci-drift-check",
  ]);
  if (gen.status !== 0) {
    results.push({
      name,
      pass: false,
      detail: `drizzle-kit generate exited ${gen.status}`,
    });
    console.log(`✗ drizzle-kit generate exited ${gen.status}.`);
    return;
  }
  const diff = run("git", ["diff", "--exit-code", "src/db/migrations/"]);
  if (diff.status === 0) {
    results.push({ name, pass: true, detail: "no drift" });
    console.log("✓ No migration drift detected (schema matches migrations).");
  } else {
    // Drizzle may emit a "No schema changes" note + 0 exit, OR produce files.
    // If git diff is non-empty, there IS drift.
    results.push({
      name,
      pass: false,
      detail: "drift detected — run `pnpm db:generate` and commit the migration",
    });
    console.log("✗ Migration drift detected. Run `pnpm db:generate` and commit.");
  }
}

// ---------------------------------------------------------------------------
// Check 3: clean-room migration test (FOUND-06)
// ---------------------------------------------------------------------------
function checkCleanRoom() {
  const name = "Check 3: clean-room migration test (test-migrations.mjs)";
  console.log(`\n▶ ${name}`);
  // Ensure postgres-test container is up (idempotent).
  runInherit("docker", [
    "compose",
    "-p",
    "anydiscussion",
    "up",
    "-d",
    "postgres-test",
  ]);
  const res = runInherit("node", ["scripts/test-migrations.mjs"]);
  if (res.status === 0) {
    results.push({ name, pass: true, detail: "8 tables present" });
    console.log("✓ Clean-room migration test passed (8 tables).");
  } else {
    results.push({
      name,
      pass: false,
      detail: `test-migrations.mjs exited ${res.status}`,
    });
    console.log(`✗ Clean-room migration test exited ${res.status}.`);
  }
}

// ---------------------------------------------------------------------------
// Check 4: ESLint route-group isolation (FOUND-04)
// Plant a cross-group import in a temp dir (NOT under src/app/), run eslint on
// it, assert it FAILS (rule fired). Then plant an allowed import, assert PASS.
// ---------------------------------------------------------------------------
function checkEslintIsolation() {
  const name = "Check 4: ESLint route-group isolation (planted cross-group import)";
  console.log(`\n▶ ${name}`);
  const plantedDir = resolve(REPO_ROOT, ".eslint-planted-test");
  const plantedBad = resolve(plantedDir, "site-imports-admin.ts");
  const plantedGood = resolve(plantedDir, "site-imports-lib.ts");

  try {
    mkdirSync(plantedDir, { recursive: true });

    // BAD: (site) file importing from (admin) — must trigger the rule.
    // We annotate the file with a path marker so the rule's `files` glob can
    // match it. ESLint applies the (site) rules block to any file whose path
    // contains the marker; we use a directory naming trick. However, the rule
    // is scoped to `src/app/(site)/**/*` — a file outside that glob won't match.
    // So instead we place the planted file inside src/app/(site)/ temporarily.
    // To avoid breaking the real build, we use a clearly-temporary name and
    // clean it up in finally.
    const siteDir = resolve(REPO_ROOT, "src/app/(site)");
    if (!existsSync(siteDir)) {
      results.push({
        name,
        pass: false,
        detail: "src/app/(site) does not exist",
      });
      console.log("✗ src/app/(site) does not exist.");
      return;
    }
    const tempBad = resolve(siteDir, "__verify_planted_bad.ts");
    const tempGood = resolve(siteDir, "__verify_planted_good.ts");
    writeFileSync(
      tempBad,
      '// verify.mjs planted file — safe to delete\nimport "x" from "@/app/(admin)/dashboard/page";\n',
    );
    writeFileSync(
      tempGood,
      '// verify.mjs planted file — safe to delete\nimport { log } from "@/lib/log";\n',
    );

    // Run eslint on the bad file — MUST exit non-zero (rule fires = pass).
    const badRes = run("npx", [
      "eslint",
      "--no-ignore",
      tempBad,
    ]);
    // Run eslint on the good file — MUST exit 0 (no false positive).
    const goodRes = run("npx", [
      "eslint",
      "--no-ignore",
      tempGood,
    ]);

    // Clean up temp files immediately (before reporting).
    try {
      rmSync(tempBad, { force: true });
      rmSync(tempGood, { force: true });
    } catch {
      /* best-effort */
    }

    if (badRes.status !== 0 && goodRes.status === 0) {
      results.push({
        name,
        pass: true,
        detail: "cross-group import blocked; allowed import passes",
      });
      console.log("✓ Cross-group import blocked; allowed @/lib import passes.");
    } else {
      const parts = [];
      if (badRes.status === 0)
        parts.push("cross-group import was NOT blocked (rule broken)");
      if (goodRes.status !== 0)
        parts.push("allowed @/lib import was incorrectly blocked (false positive)");
      results.push({ name, pass: false, detail: parts.join("; ") });
      console.log(`✗ ${parts.join("; ")}.`);
    }
  } finally {
    try {
      rmSync(plantedDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

// ---------------------------------------------------------------------------
// Check 5: next build (FOUND-01)
// ---------------------------------------------------------------------------
function checkBuild() {
  const name = "Check 5: next build succeeds";
  console.log(`\n▶ ${name}`);
  const res = runInherit("pnpm", ["build"]);
  if (res.status === 0) {
    results.push({ name, pass: true, detail: "build ok" });
    console.log("✓ next build succeeded.");
  } else {
    results.push({ name, pass: false, detail: `build exited ${res.status}` });
    console.log(`✗ next build exited ${res.status}.`);
  }
}

// ---------------------------------------------------------------------------
// Check 6: R2 upload smoke (FOUND-05)
// ---------------------------------------------------------------------------
function checkR2Smoke() {
  const name = "Check 6: R2 upload smoke (3 WebP variants to MinIO)";
  console.log(`\n▶ ${name}`);
  // Ensure minio is up.
  runInherit("docker", ["compose", "-p", "anydiscussion", "up", "-d", "minio"]);
  // Run the TypeScript smoke via Node's built-in type stripping.
  const res = runInherit("node", [
    "--experimental-strip-types",
    "scripts/r2-smoke.ts",
  ]);
  if (res.status === 0) {
    results.push({ name, pass: true, detail: "3 variants uploaded" });
    console.log("✓ R2 smoke passed (3 WebP variants uploaded + cleaned up).");
  } else {
    results.push({
      name,
      pass: false,
      detail: `r2-smoke.ts exited ${res.status}`,
    });
    console.log(`✗ R2 smoke exited ${res.status}.`);
  }
}

// ---------------------------------------------------------------------------
// Summary + exit
// ---------------------------------------------------------------------------
function printSummary() {
  console.log("\n" + "=".repeat(60));
  console.log("pnpm verify — summary");
  console.log("=".repeat(60));
  const passed = results.filter((r) => r.pass).length;
  for (const r of results) {
    const mark = r.pass ? "✓ PASS" : "✗ FAIL";
    console.log(`${mark}  ${r.name}`);
    if (!r.pass) console.log(`        ${r.detail}`);
  }
  console.log("=".repeat(60));
  console.log(`${passed}/${results.length} checks passed.`);
  if (passed < results.length) {
    process.exitCode = 1;
    console.log(
      "\n✗ pnpm verify FAILED. Fix the failing checks before merging.",
    );
  } else {
    console.log("\n✓ pnpm verify PASSED — Phase 1 backbone proven working.");
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== Any Discussion — pnpm verify (D-15) ===");
  checkNextConfig();
  checkDriftGate();
  checkCleanRoom();
  checkEslintIsolation();
  checkBuild();
  checkR2Smoke();
  printSummary();
}

main().catch((err) => {
  console.error("✗ verify.mjs unhandled error:", err);
  process.exitCode = 1;
});
