// scripts/setup.mjs
// [VERIFIED: node:child_process execFileSync + @aws-sdk/client-s3 + drizzle migrator]
// Clone-to-running developer onboarding script (D-04).
//
// Sequence: pnpm install -> ensure sharp build -> docker compose up (shared
// project `anydiscussion`) -> apply migrations to dev DB (port 5435) ->
// confirm/create MinIO bucket.
//
// Windows-safe: shells out via node:child_process execFileSync with shell:true
// for pnpm (needed on Windows for pnpm to resolve). Uses process.exitCode = 1
// on failure (NOT process.exit(1) — allows finally blocks to run). Primary dev
// OS is Windows per D-04.
//
// PORT NOTE: docker-compose.yml remaps postgres to host port 5435 and
// postgres-test to 5436 (host 5432/5433 were bound by sibling dev projects).
// The dev DATABASE_URL here uses 5435; the clean-room test DB uses 5436.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const COMPOSE_PROJECT = "anydiscussion";
const DEV_DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5435/anydiscussion";

/** Run a command, inheriting stdio. Throws on non-zero exit. */
function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, {
    stdio: "inherit",
    cwd: REPO_ROOT,
    shell: process.platform === "win32",
    ...opts,
  });
}

/** Run a command, capturing stdout as a string. Returns "" on non-zero exit. */
function capture(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: REPO_ROOT,
      shell: process.platform === "win32",
      encoding: "utf8",
      ...opts,
    }).trim();
  } catch {
    return "";
  }
}

async function main() {
  console.log("=== Any Discussion — setup (D-04) ===\n");

  // Step 1: pnpm install
  console.log("Step 1/5: pnpm install");
  try {
    run("pnpm", ["install"]);
    console.log("✓ Dependencies installed.\n");
  } catch {
    console.error("✗ pnpm install failed.");
    process.exitCode = 1;
    return;
  }

  // Step 2: ensure sharp native binary built (pnpm approve-builds allowlist).
  // pnpm v11 reads onlyBuiltDependencies from pnpm-workspace.yaml allowBuilds.
  // Verify the allowlist contains sharp; if not, warn (the build may have been
  // skipped silently — Pitfall 2). Re-running pnpm install triggers the
  // postinstall once the allowlist is in place.
  console.log("Step 2/5: verify sharp build approval");
  const workspacePath = resolve(REPO_ROOT, "pnpm-workspace.yaml");
  if (existsSync(workspacePath)) {
    const workspace = readFileSync(workspacePath, "utf8");
    if (/allowBuilds\s*:/m.test(workspace) && /sharp\s*:\s*true/m.test(workspace)) {
      console.log("✓ sharp approved in pnpm-workspace.yaml allowBuilds.\n");
    } else {
      console.warn(
        "⚠ sharp not found in pnpm-workspace.yaml allowBuilds. Run `pnpm approve-builds` and select sharp.",
      );
    }
  } else {
    // Fallback: older pnpm reads package.json pnpm.onlyBuiltDependencies.
    const pkgPath = resolve(REPO_ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const approved = pkg?.pnpm?.onlyBuiltDependencies ?? [];
    if (approved.includes("sharp")) {
      console.log("✓ sharp approved in package.json pnpm.onlyBuiltDependencies.\n");
    } else {
      console.warn(
        "⚠ sharp not in build allowlist. Run `pnpm approve-builds` and select sharp.",
      );
    }
  }

  // Step 3: docker compose up (shared project — pre-provisioned services).
  // Using -p anydiscussion is REQUIRED: a bare `docker compose up` from this
  // repo would still bind to the same project name (dir-derived), but being
  // explicit avoids any project-name collision with sibling dev projects on
  // the same host ports.
  console.log("Step 3/5: docker compose up (project: anydiscussion)");
  try {
    run("docker", [
      "compose",
      "-p",
      COMPOSE_PROJECT,
      "up",
      "-d",
    ]);
    console.log("✓ Docker services up (postgres :5435, postgres-test :5436, minio :9000).\n");
  } catch {
    console.error("✗ docker compose up failed. Is Docker Desktop running?");
    process.exitCode = 1;
    return;
  }

  // Wait briefly for postgres healthcheck (compose marks it healthy after ~5s).
  console.log("Waiting for postgres healthcheck...");
  let healthy = false;
  for (let i = 0; i < 12; i++) {
    const state = capture("docker", [
      "inspect",
      "--format",
      "{{.State.Health.Status}}",
      `${COMPOSE_PROJECT}-postgres-1`,
    ]);
    if (state === "healthy") {
      healthy = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (healthy) {
    console.log("✓ postgres healthy.\n");
  } else {
    console.warn("⚠ postgres did not report healthy within 24s — continuing anyway.");
  }

  // Step 4: apply migrations to the dev DB.
  // Uses drizzle-orm/node-postgres/migrator inline (same approach as
  // test-migrations.mjs, but against the dev DB on :5435).
  console.log("Step 4/5: apply migrations to dev DB");
  try {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: DEV_DB_URL });
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    await pool.end();
    console.log("✓ Migrations applied to dev DB.\n");
  } catch (err) {
    console.error("✗ Migration apply failed:", err?.message || err);
    process.exitCode = 1;
    return;
  }

  // Step 5: confirm/create MinIO bucket.
  console.log("Step 5/5: confirm MinIO bucket");
  try {
    const { S3Client, HeadBucketCommand, CreateBucketCommand } = await import(
      "@aws-sdk/client-s3"
    );
    const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
    const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "minioadmin";
    const bucket = process.env.S3_BUCKET || "anydiscussion-media";
    const s3 = new S3Client({
      region: "us-east-1",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`✓ Bucket '${bucket}' exists.\n`);
    } catch (err) {
      // NotFound / 404 -> create it.
      const status = err?.$metadata?.httpStatusCode;
      if (err.name === "NotFound" || status === 404 || err.name === "NoSuchBucket") {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`✓ Bucket '${bucket}' created.\n`);
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error("✗ Bucket check/create failed:", err?.message || err);
    process.exitCode = 1;
    return;
  }

  console.log("=== Setup complete — run `pnpm dev` to start. ===");
}

main().catch((err) => {
  console.error("✗ setup.mjs unhandled error:", err);
  process.exitCode = 1;
});
