// src/app/(admin)/dashboard/subscribers/__tests__/export.test.ts
// [CITED: 260824-3l2-PLAN.md Task 7 <behavior> — CSV export helper contract]
// [CITED: 260824-3l2-CONTEXT.md D-03 — CSV export; T-3l2-06 formula-injection guard]
// [CITED: src/lib/seo/__tests__/rss.test.ts — pure-helper-from-route-file precedent
//  (RSS_LIMIT/buildRssItem/escapeXml are exported from app/rss.xml/route.ts for
//  exactly this DB-free testing shape)]
//
// Unit tests for toSubscribersCsv — the pure helper exported beside GET in
// ../export/route.ts. NO mocks needed: the helper is pure and the route's
// module-level imports (@/lib/db lazy Pool, @/lib/permissions → auth with
// lazyConnect Redis + dev-placeholder Resend) are all import-safe.
//
// Covers:
//   - UTF-8 BOM first char (0xfeff) — Excel opens UTF-8/Bangla correctly
//   - header row exactly "email","status","subscribed_at" (every field quoted)
//   - RFC 4180: comma/quote/newline fields quote-wrapped, internal quotes doubled
//   - formula-injection guard: = + - @ or tab-leading fields get an apostrophe
//   - CRLF row joins; createdAt emitted as ISO-8601 (toISOString)
import { describe, it, expect } from "vitest";
import { toSubscribersCsv } from "../export/route";

/** Row factory — createdAt always a Date (the route selects a timestamp column). */
const row = (
  email: string,
  createdAt: Date,
  status: "active" | "unsubscribed" = "active",
) => ({ email, status, createdAt });

/** Strip the BOM and split into physical lines (CRLF). */
const lines = (csv: string) => csv.slice(1).split("\r\n");

describe("260824-3l2 D-03/T-3l2-06: toSubscribersCsv — CSV export helper", () => {
  it("output starts with the UTF-8 BOM (first char code 0xfeff)", () => {
    const csv = toSubscribersCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("header row is exactly email,status,subscribed_at with every field quoted", () => {
    const csv = toSubscribersCsv([]);
    // BOM + header only when there are no rows.
    expect(lines(csv)).toEqual(['"email","status","subscribed_at"']);
  });

  it("a field containing a comma, a double quote, or a newline is quote-wrapped with internal quotes doubled (RFC 4180)", () => {
    const csv = toSubscribersCsv([
      row("user,name@example.com", new Date("2026-08-24T10:00:00.000Z")),
      row('quote"local@example.com', new Date("2026-08-24T10:01:00.000Z")),
      row("line1\nline2@example.com", new Date("2026-08-24T10:02:00.000Z")),
    ]);

    const out = lines(csv);
    expect(out[1]).toBe('"user,name@example.com","active","2026-08-24T10:00:00.000Z"');
    // Internal double quote doubled per RFC 4180 §2.7.
    expect(out[2]).toBe('"quote""local@example.com","active","2026-08-24T10:01:00.000Z"');
    // Embedded newline stays INSIDE the quoted field — it must not add a physical line.
    expect(out[3]).toBe('"line1\nline2@example.com","active","2026-08-24T10:02:00.000Z"');
    // The embedded-newline row is still ONE physical line: header + 3 rows = 4 lines.
    expect(out.length).toBe(4);
  });

  it("a field starting with = + - @ or a tab is prefixed with an apostrophe (formula-injection guard)", () => {
    const csv = toSubscribersCsv([
      row("=SUM(A1)@example.com", new Date("2026-08-24T11:00:00.000Z")),
      row("+1+1@example.com", new Date("2026-08-24T11:01:00.000Z")),
      row("-2+3@example.com", new Date("2026-08-24T11:02:00.000Z")),
      row("@risk@example.com", new Date("2026-08-24T11:03:00.000Z")),
      row("\ttab@example.com", new Date("2026-08-24T11:04:00.000Z")),
      row("plain@example.com", new Date("2026-08-24T11:05:00.000Z")),
    ]);

    const out = lines(csv);
    expect(out[1]).toBe('"\'=SUM(A1)@example.com","active","2026-08-24T11:00:00.000Z"');
    expect(out[2]).toBe('"\'+1+1@example.com","active","2026-08-24T11:01:00.000Z"');
    expect(out[3]).toBe('"\'-2+3@example.com","active","2026-08-24T11:02:00.000Z"');
    expect(out[4]).toBe('"\'@risk@example.com","active","2026-08-24T11:03:00.000Z"');
    expect(out[5]).toBe('"\'\ttab@example.com","active","2026-08-24T11:04:00.000Z"');
    // Control: an ordinary email is NOT prefixed.
    expect(out[6]).toBe('"plain@example.com","active","2026-08-24T11:05:00.000Z"');
  });

  it("rows are joined with CRLF; timestamps emitted as ISO-8601 (toISOString)", () => {
    const csv = toSubscribersCsv([
      row("first@example.com", new Date("2026-08-20T08:30:00.000Z")),
      row("second@example.com", new Date("2026-01-01T00:00:00.000Z"), "unsubscribed"),
    ]);

    // Physical CRLF separators: header + 2 rows, nothing trailing.
    expect(lines(csv)).toEqual([
      '"email","status","subscribed_at"',
      '"first@example.com","active","2026-08-20T08:30:00.000Z"',
      '"second@example.com","unsubscribed","2026-01-01T00:00:00.000Z"',
    ]);
    // No trailing CRLF after the last row.
    expect(csv.endsWith('"2026-01-01T00:00:00.000Z"')).toBe(true);
    // No bare LF/LF-only separators anywhere outside quoted content.
    expect(csv.slice(1).includes("\r\n")).toBe(true);
  });
});
