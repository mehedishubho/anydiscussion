// scripts/check-bundle-size.mjs
// [CITED: RESEARCH.md Example 2 (lines 588-625) + scripts/verify.mjs header/exit convention]
// [VERIFIED: node:zlib.gzipSync + node:fs.readdirSync — Node 20.19 LTS built-ins only]
//
// Bundle-size gate (D-13 gate 2 / D-14). Reads .next/static/chunks/*.js produced by
// `pnpm build`, sums the GZIPPED size of every chunk, and fails the build when the
// total exceeds the threshold. This is the SOLE pre-production safety net for the
// no-staging/no-CI deploy model (D-31/D-32): a push to main deploys directly to
// production, so the Docker builder stage runs this script AFTER `pnpm build` and
// BEFORE the runtime image copy (RESEARCH.md Pitfall 3).
//
// Threshold: 100 KB gzipped total (D-14). Conservative reading of "public bundle
// < 100KB gzipped" — sums EVERY chunk under .next/static/chunks/*.js, which is the
// actual production output Next.js emits. When this fires it surfaces either
// (a) a catastrophic TailAdmin/Tiptap leak into the public chunk, or (b) genuine
// public-chunk bloat that needs investigating. Either way the deploy MUST abort.
//
// Exit convention: on threshold violation we set process.exitCode = 1 and let
// the script run to completion (NOT the synchronous throw-style exit) so the
// diagnostic output (top-10 largest files + totals) flushes before the process
// terminates — mirrors scripts/verify.mjs:68 / :246.
//
// Invocation:
//   node scripts/check-bundle-size.mjs                # default threshold 100 KB
//   node scripts/check-bundle-size.mjs --max-gz-kb=100
//   node scripts/check-bundle-size.mjs --max-gz-kb=1  # forces FAIL (smoke check)
//
// Node built-ins only — no external deps, no require/import outside node:*.
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// Resolve chunks dir relative to repo root (cwd may vary in Docker / local dev).
const STATIC_DIR = resolve(REPO_ROOT, ".next/static/chunks");

// Parse --max-gz-kb=<N> from argv. Default 100 KB per D-14.
function parseThreshold() {
  const flag = process.argv.find((a) => a.startsWith("--max-gz-kb="));
  const raw = flag ? flag.split("=")[1] : "100";
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    console.error(
      `FAIL: invalid --max-gz-kb value "${raw}" (must be a non-negative integer)`,
    );
    process.exitCode = 1;
    return null;
  }
  return parsed;
}

function formatKb(bytes) {
  return (bytes / 1024).toFixed(1);
}

function main() {
  const MAX_GZ_KB = parseThreshold();
  if (MAX_GZ_KB === null) return;

  console.log("=== Any Discussion — bundle-size gate (D-13 gate 2 / D-14) ===");
  console.log(`Chunks dir: ${STATIC_DIR}`);
  console.log(`Threshold:  ${MAX_GZ_KB} KB gzipped (total across all chunks)`);

  if (!existsSync(STATIC_DIR)) {
    // No build output to measure. This is a HARD failure: the Dockerfile runs the
    // gate AFTER `pnpm build`, so reaching this branch means the build silently
    // failed to emit chunks — exactly the catastrophic case the gate exists for.
    console.error(
      `FAIL: ${STATIC_DIR} does not exist. Run \`pnpm build\` before this gate.`,
    );
    console.error(
      "     (In the Dockerfile, this means the `pnpm build` step above failed silently.)",
    );
    process.exitCode = 1;
    return;
  }

  let chunkFiles;
  try {
    chunkFiles = readdirSync(STATIC_DIR).filter((f) => f.endsWith(".js"));
  } catch (err) {
    console.error(`FAIL: cannot read ${STATIC_DIR}: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (chunkFiles.length === 0) {
    console.error(
      `FAIL: no .js chunks found in ${STATIC_DIR}. Build output is empty.`,
    );
    process.exitCode = 1;
    return;
  }

  let totalGz = 0;
  let totalRaw = 0;
  /** @type {{ f: string; raw: number; gz: number }[]} */
  const perFile = [];

  for (const f of chunkFiles) {
    const filePath = join(STATIC_DIR, f);
    const contents = readFileSync(filePath);
    const gz = gzipSync(contents).length;
    totalGz += gz;
    totalRaw += contents.length;
    perFile.push({ f, raw: contents.length, gz });
  }

  const totalGzKb = totalGz / 1024;

  console.log(
    `Total:      ${formatKb(totalGz)} KB gzipped (${formatKb(totalRaw)} KB raw) across ${chunkFiles.length} chunks`,
  );

  // Top-10 largest by gzipped size — diagnostic for finding leaks (Pitfall 4).
  console.log("\nTop 10 largest chunks (gzipped):");
  perFile
    .sort((a, b) => b.gz - a.gz)
    .slice(0, 10)
    .forEach((p) => {
      console.log(
        `  ${p.f.padEnd(50)} ${formatKb(p.gz).padStart(7)} KB gz   (${formatKb(p.raw)} KB raw)`,
      );
    });

  console.log("=".repeat(60));

  if (totalGzKb > MAX_GZ_KB) {
    console.error(
      `FAIL: total gzipped JS ${formatKb(totalGz)} KB exceeds ${MAX_GZ_KB} KB threshold`,
    );
    console.error(
      "     Deploy aborted (D-13/D-14). Inspect the top-10 list above for leak source.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `PASS: bundle size within budget (${formatKb(totalGz)} KB gz <= ${MAX_GZ_KB} KB)`,
  );
}

main();
