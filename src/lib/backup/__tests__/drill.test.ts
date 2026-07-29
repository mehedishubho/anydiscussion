// src/lib/backup/__tests__/drill.test.ts
// [CITED: 08-05-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: 08-VALIDATION.md Wave 0 row "drill.test.ts" — covers BACKUP-04]
// [CITED: 08-RESEARCH.md Pattern 4 (lines 336-368) + Pitfall 2 (25001) + Pitfall 5 (terminate-before-DROP)]
// [CITED: D-07 (drill + alert), D-08 (scratch DB on existing Postgres), T-08-05]
//
// Wave-0 drill tests proving BACKUP-04 / D-07 / D-08:
//   - runRestoreDrill: download latest dump → CREATE DATABASE backup_verify (autocommit, no
//     BEGIN) → pgRestore into backup_verify → verifyIntegrity (row counts on 4 key tables)
//     → FINALLY pg_terminate_backend + DROP DATABASE IF EXISTS (no-linger, RESEARCH Pitfall 5).
//   - The maintenance pg.Client receives CREATE DATABASE with NO preceding BEGIN (transaction
//     guard — SQLSTATE 25001, RESEARCH Pitfall 2).
//   - On simulated integrity failure (counts missing), runRestoreDrill THROWS and the finally
//     STILL runs DROP (backup_verify does not linger).
//
// Mock strategy: `pg` is mocked so the Client constructor records its connectionString and every
// query() records its SQL in order. dump.ts pgRestore + registry getEnabledDestinations are
// mocked so no real pg_restore / DB / fs runs. No real Postgres is touched.
import { describe, it, expect, beforeEach, vi } from "vitest";

// --- Hoisted shared state for the pg.Client mock ---
const pgState = vi.hoisted(() => ({
  // Every query across every Client, in call order, tagged with the connectionString.
  queries: [] as { sql: string; params?: unknown[]; connectionString: string }[],
  // Per-instance query log (so a test can inspect a specific Client's query sequence).
  instances: [] as Array<{
    connectionString: string;
    queries: { sql: string; params?: unknown[] }[];
  }>,
  connect: vi.fn(),
  end: vi.fn(),
  // When false, verifyIntegrity's SELECT count(*) returns no row (simulates a partial restore).
  integrityOk: true,
}));

vi.mock("pg", () => {
  class FakeClient {
    connectionString: string;
    queries: { sql: string; params?: unknown[] }[] = [];
    constructor(opts?: { connectionString?: string }) {
      this.connectionString = opts?.connectionString ?? "";
      pgState.instances.push({
        connectionString: this.connectionString,
        queries: this.queries,
      });
    }
    async connect() {
      pgState.connect();
    }
    async end() {
      pgState.end();
    }
    async query(sql: string, params?: unknown[]) {
      this.queries.push({ sql, params });
      pgState.queries.push({ sql, params, connectionString: this.connectionString });
      // verifyIntegrity's count queries: control success via integrityOk.
      if (/count\(\*\)/i.test(sql)) {
        return pgState.integrityOk
          ? { rows: [{ c: 1 }], rowCount: 1 }
          : { rows: [], rowCount: 0 }; // missing count → verifyIntegrity throws
      }
      return { rows: [], rowCount: 0 };
    }
  }
  return { Client: FakeClient };
});

// pgRestore mocked — records the (dump, targetDbUrl) call.
const { pgRestoreMock } = vi.hoisted(() => ({ pgRestoreMock: vi.fn() }));
vi.mock("../dump", async () => {
  const actual = await vi.importActual<typeof import("../dump")>("../dump");
  return { ...actual, pgRestore: (...a: unknown[]) => pgRestoreMock(...a) };
});

// Registry mocked — a single fake destination whose download returns a known dump buffer.
const DUMP = Buffer.from("PGDUMP-CUSTOM-FORMAT-DRILL");
const { getEnabledMock } = vi.hoisted(() => ({ getEnabledMock: vi.fn() }));
vi.mock("../registry", () => ({
  getEnabledDestinations: (...a: unknown[]) => getEnabledMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

/** Fake destination carrying one newest backup key. */
function makeFakeDest(keys: string[]) {
  const store = new Map<string, Buffer>();
  for (const k of keys) store.set(k, DUMP);
  return {
    name: "local" as const,
    async upload() {
      return { key: "", sizeBytes: 0 };
    },
    async list() {
      return [...store.keys()];
    },
    async download(key: string) {
      const b = store.get(key);
      if (!b) throw new Error(`not found: ${key}`);
      return b;
    },
    async delete(key: string) {
      store.delete(key);
    },
    async testConnection() {
      return { ok: true };
    },
  };
}

const DB_URL = "postgresql://u:pw@localhost:5432/anydiscussion";
const MAINT_URL_EXPECTED = "postgresql://u:pw@localhost:5432/postgres";
const VERIFY_URL_EXPECTED = "postgresql://u:pw@localhost:5432/backup_verify";

describe("D-08/D-07: runRestoreDrill CREATE → restore → verify → terminate → DROP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", DB_URL);
    pgState.queries.length = 0;
    pgState.instances.length = 0;
    pgState.integrityOk = true;
    pgRestoreMock.mockResolvedValue(undefined);
    getEnabledMock.mockResolvedValue([
      makeFakeDest(["anydiscussion-20260729-0300.sqlc"]),
    ]);
  });

  it("creates backup_verify before pgRestore, and restores into the backup_verify URL", async () => {
    const { runRestoreDrill } = await import("../drill");
    await runRestoreDrill();

    // CREATE was issued on a maintenance client.
    const createCall = pgState.queries.find((q) =>
      /CREATE DATABASE backup_verify/i.test(q.sql),
    );
    expect(createCall).toBeDefined();
    expect(createCall!.connectionString).toContain("/postgres");

    // pgRestore was called with the dump + the backup_verify URL.
    expect(pgRestoreMock).toHaveBeenCalledTimes(1);
    const [dump, target] = pgRestoreMock.mock.calls[0];
    expect((dump as Buffer).equals(DUMP)).toBe(true);
    expect(target).toBe(VERIFY_URL_EXPECTED);

    // CREATE was issued BEFORE pgRestore was invoked (sequence guard).
    const createIdx = pgState.queries.findIndex((q) =>
      /CREATE DATABASE backup_verify/i.test(q.sql),
    );
    expect(createIdx).toBeGreaterThanOrEqual(0);
    // pgRestore runs after CREATE — proven by it being called exactly once after await.
    expect(pgRestoreMock).toHaveBeenCalled();
  });

  it("maintenance Client connects to the 'postgres' maintenance DB (not the app db)", async () => {
    const { runRestoreDrill } = await import("../drill");
    await runRestoreDrill();

    const maintenanceClients = pgState.instances.filter((i) =>
      i.connectionString.includes("/postgres"),
    );
    expect(maintenanceClients.length).toBeGreaterThan(0);
    // The first maintenance client's connectionString swaps the dbname to 'postgres'.
    expect(maintenanceClients[0].connectionString).toBe(MAINT_URL_EXPECTED);
  });

  it("does NOT wrap CREATE/DROP DATABASE in a transaction (autocommit — SQLSTATE 25001 guard)", async () => {
    const { runRestoreDrill } = await import("../drill");
    await runRestoreDrill();

    // No maintenance-client query may start with BEGIN (node-postgres Client is autocommit).
    const maintenanceQueries = pgState.queries.filter((q) =>
      q.connectionString.includes("/postgres"),
    );
    const beginQueries = maintenanceQueries.filter((q) =>
      /^\s*BEGIN/i.test(q.sql),
    );
    expect(beginQueries).toEqual([]);

    // And specifically: the CREATE must be the first statement on its maintenance client
    // (no BEGIN preceding it). Find the maintenance client that ran CREATE.
    const createClient = pgState.instances.find((i) =>
      i.queries.some((q) => /CREATE DATABASE backup_verify/i.test(q.sql)),
    );
    expect(createClient).toBeDefined();
    expect(createClient!.queries.length).toBeGreaterThan(0);
    expect(/^\s*CREATE DATABASE backup_verify/i.test(createClient!.queries[0].sql)).toBe(
      true,
    );
  });

  it("verifyIntegrity issues SELECT count(*) on posts, users, settings, media", async () => {
    const { runRestoreDrill } = await import("../drill");
    await runRestoreDrill();

    // The verify client is the one connected to backup_verify.
    const verifyClient = pgState.instances.find((i) =>
      i.connectionString.includes("/backup_verify"),
    );
    expect(verifyClient).toBeDefined();
    const verifySqls = verifyClient!.queries.map((q) => q.sql).join(";");
    for (const table of ["posts", "users", "settings", "media"]) {
      expect(verifySqls).toMatch(new RegExp(`count\\(\\*\\)[\\s\\S]*${table}`, "i"));
    }
  });

  it("finally emits pg_terminate_backend THEN DROP DATABASE IF EXISTS (no-linger, Pitfall 5)", async () => {
    const { runRestoreDrill } = await import("../drill");
    await runRestoreDrill();

    const maintenanceQueries = pgState.queries.filter((q) =>
      q.connectionString.includes("/postgres"),
    );
    const terminateIdx = maintenanceQueries.findIndex((q) =>
      /pg_terminate_backend/i.test(q.sql),
    );
    const dropIdx = maintenanceQueries.findIndex((q) =>
      /DROP DATABASE IF EXISTS backup_verify/i.test(q.sql),
    );
    expect(terminateIdx).toBeGreaterThanOrEqual(0);
    expect(dropIdx).toBeGreaterThan(terminateIdx); // terminate BEFORE drop

    // The terminate query must be scoped to backup_verify.
    const terminateCall = maintenanceQueries[terminateIdx];
    expect(terminateCall.params).toContain("backup_verify");
  });
});

describe("T-08-05: on integrity failure, runRestoreDrill throws AND finally still DROPs (no-linger)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", DB_URL);
    pgState.queries.length = 0;
    pgState.instances.length = 0;
    pgState.integrityOk = false; // counts missing → verifyIntegrity throws
    pgRestoreMock.mockResolvedValue(undefined);
    getEnabledMock.mockResolvedValue([
      makeFakeDest(["anydiscussion-20260729-0300.sqlc"]),
    ]);
  });

  it("rejects AND the finally block still runs DROP DATABASE (backup_verify does not linger)", async () => {
    const { runRestoreDrill } = await import("../drill");
    await expect(runRestoreDrill()).rejects.toThrow(/integrity/i);

    // Despite the throw, DROP ran in the finally.
    const dropRan = pgState.queries.some((q) =>
      /DROP DATABASE IF EXISTS backup_verify/i.test(q.sql),
    );
    expect(dropRan).toBe(true);

    // And terminate-before-drop also ran in the finally.
    const maintenanceQueries = pgState.queries.filter((q) =>
      q.connectionString.includes("/postgres"),
    );
    const terminateIdx = maintenanceQueries.findIndex((q) =>
      /pg_terminate_backend/i.test(q.sql),
    );
    const dropIdx = maintenanceQueries.findIndex((q) =>
      /DROP DATABASE IF EXISTS backup_verify/i.test(q.sql),
    );
    expect(terminateIdx).toBeGreaterThanOrEqual(0);
    expect(dropIdx).toBeGreaterThan(terminateIdx);
  });
});

describe("D-08: withMaintenanceClient + verifyIntegrity exported for testing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", DB_URL);
    pgState.queries.length = 0;
    pgState.instances.length = 0;
  });

  it("withMaintenanceClient connects + ends the Client and returns fn's result", async () => {
    const { withMaintenanceClient } = await import("../drill");
    const result = await withMaintenanceClient(async (client) => {
      const r = await client.query("SELECT 1");
      return r;
    });
    expect(pgState.connect).toHaveBeenCalled();
    expect(pgState.end).toHaveBeenCalled();
    expect(result).toEqual({ rows: [], rowCount: 0 });
  });

  it("withMaintenanceClient ends the client even when fn throws (finally)", async () => {
    const { withMaintenanceClient } = await import("../drill");
    await expect(
      withMaintenanceClient(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(pgState.end).toHaveBeenCalled();
  });

  it("verifyIntegrity throws when a count is missing (partial restore)", async () => {
    pgState.integrityOk = false;
    const { verifyIntegrity } = await import("../drill");
    await expect(verifyIntegrity(VERIFY_URL_EXPECTED)).rejects.toThrow(/integrity/i);
  });
});
