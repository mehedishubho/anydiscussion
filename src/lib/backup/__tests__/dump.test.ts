// src/lib/backup/__tests__/dump.test.ts
// [CITED: 08-01-PLAN.md Task 1 <behavior> + <acceptance_criteria> — pg_dump/pg_restore argv shape]
// [CITED: 08-VALIDATION.md Wave 0 row "dump.test.ts"]
// [CITED: 08-RESEARCH.md Pattern 2 (lines 249-279) + Anti-Pattern + Pitfall 7 — execFile (no shell)]
// [CITED: T-08-01 — Information Disclosure: execFile argv array, NEVER exec/shell string]
//
// Wave-0 dump tests proving D-04 (pg_dump custom format via execFile):
//   - pgDump calls execFile("pg_dump", argvArray) — argv is an Array containing
//     "-Fc" (custom format) and "-d" (connection). NOT a shell string / exec.
//   - pgDump returns the Buffer read from the temp file, then unlinks the temp.
//   - pgRestore(dump, targetDbUrl) writes the dump to a temp, calls execFile with
//     argv containing "-j", "2" (parallel) and "-d" (target), then unlinks.
//
// Mock strategy: node:child_process.execFile is mocked so NO real pg_dump shells
// out (pg_dump may be absent on the dev host / Windows). The mock records the argv
// array so tests assert its SHAPE. node:fs/promises is mocked for readFile/writeFile/
// unlink. DATABASE_URL is stubbed so dump.ts has a connection string.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { execFileMock, fsReadFileMock, fsUnlinkMock, fsWriteFileMock } = vi.hoisted(
  () => ({
    execFileMock: vi.fn(),
    fsReadFileMock: vi.fn(),
    fsUnlinkMock: vi.fn(),
    fsWriteFileMock: vi.fn(),
  }),
);

// node:child_process — mock execFile (the promisified wrapper calls it with a
// trailing callback). The mock finds + invokes the callback so the promise resolves.
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

vi.mock("node:fs/promises", () => ({
  readFile: (...a: unknown[]) => fsReadFileMock(...a),
  unlink: (...a: unknown[]) => fsUnlinkMock(...a),
  writeFile: (...a: unknown[]) => fsWriteFileMock(...a),
  default: {
    readFile: (...a: unknown[]) => fsReadFileMock(...a),
    unlink: (...a: unknown[]) => fsUnlinkMock(...a),
    writeFile: (...a: unknown[]) => fsWriteFileMock(...a),
  },
}));

const DUMP_BYTES = Buffer.from("PGDUMP-CUSTOM-FORMAT-BYTES");

describe("D-04 / T-08-01: pgDump uses execFile with an argv array (no shell)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:secretpw@localhost:5432/anydiscussion");
    // promisify appends a callback as the last arg — invoke it to resolve.
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args.find((a) => typeof a === "function");
      if (cb) (cb as (e: unknown, o: unknown, s: unknown) => void)(null, "", "");
    });
    fsReadFileMock.mockResolvedValue(DUMP_BYTES);
    fsUnlinkMock.mockResolvedValue(undefined);
    fsWriteFileMock.mockResolvedValue(undefined);
  });

  it("calls execFile('pg_dump', <argv array>) — argv contains '-Fc' and '-d'", async () => {
    const { pgDump } = await import("../dump");
    const buf = await pgDump();

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [binary, argv] = execFileMock.mock.calls[0] as [string, string[]];
    expect(binary).toBe("pg_dump");
    // CRITICAL (T-08-01): argv is an Array, not a shell string.
    expect(Array.isArray(argv)).toBe(true);
    expect(argv).toContain("-Fc"); // custom format (compression + selective + parallel restore)
    expect(argv).toContain("-d"); // connection string
    // Returns the bytes read from the temp file.
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.equals(DUMP_BYTES)).toBe(true);
  });

  it("passes the DATABASE_URL connection string via the '-d' argv element", async () => {
    const { pgDump } = await import("../dump");
    await pgDump();
    const [, argv] = execFileMock.mock.calls[0] as [string, string[]];
    const dIndex = argv.indexOf("-d");
    expect(dIndex).toBeGreaterThan(-1);
    expect(argv[dIndex + 1]).toBe("postgresql://u:secretpw@localhost:5432/anydiscussion");
  });

  it("unlinks the temp file after reading it (no leftover dumps in os.tmpdir)", async () => {
    const { pgDump } = await import("../dump");
    await pgDump();
    expect(fsReadFileMock).toHaveBeenCalledTimes(1);
    expect(fsUnlinkMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { pgDump } = await import("../dump");
    await expect(pgDump()).rejects.toThrow(/DATABASE_URL/i);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("D-05 / T-08-01: pgRestore uses execFile with an argv array", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgresql://u:secretpw@localhost:5432/anydiscussion");
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args.find((a) => typeof a === "function");
      if (cb) (cb as (e: unknown) => void)(null);
    });
    fsWriteFileMock.mockResolvedValue(undefined);
    fsUnlinkMock.mockResolvedValue(undefined);
  });

  it("writes the dump to a temp, then calls execFile('pg_restore', argv with '-j','2','-d')", async () => {
    const { pgRestore } = await import("../dump");
    await pgRestore(DUMP_BYTES, "postgresql://u:pw@localhost:5432/target");

    // dump buffer written to a temp file first.
    expect(fsWriteFileMock).toHaveBeenCalledTimes(1);
    const written = fsWriteFileMock.mock.calls[0][1] as Buffer;
    expect(Buffer.isBuffer(written)).toBe(true);
    expect(written.equals(DUMP_BYTES)).toBe(true);

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [binary, argv] = execFileMock.mock.calls[0] as [string, string[]];
    expect(binary).toBe("pg_restore");
    expect(Array.isArray(argv)).toBe(true);
    expect(argv).toContain("-j"); // parallel jobs (custom format)
    expect(argv).toContain("2");
    expect(argv).toContain("-d");
    const dIndex = argv.indexOf("-d");
    expect(argv[dIndex + 1]).toBe("postgresql://u:pw@localhost:5432/target");
  });

  it("unlinks the temp file after restore (even on success)", async () => {
    const { pgRestore } = await import("../dump");
    await pgRestore(DUMP_BYTES, "postgresql://u:pw@localhost:5432/target");
    expect(fsUnlinkMock).toHaveBeenCalledTimes(1);
  });
});
