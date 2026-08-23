// src/app/(admin)/dashboard/subscribers/export/route.ts
// [CITED: 260824-3l2-CONTEXT.md D-03 — CSV export; route chosen over action for a
//  direct browser download with zero client JS and the simplest auth story]
// [CITED: 260824-3l2-CONTEXT.md T-3l2-05 — in-handler requireRole → 403 (the
//  repo-root middleware matcher is a UX gate only; forged cookies pass it)]
// [CITED: 260824-3l2-CONTEXT.md T-3l2-06 + research A1 — RFC 4180 quote-wrapping
//  + apostrophe formula guard, unit-tested in __tests__/export.test.ts]
// [CITED: src/app/rss.xml/route.ts — the pure-helper-beside-GET precedent
//  (RSS_LIMIT/buildRssItem/escapeXml exported for DB-free unit testing)]
//
// GET /dashboard/subscribers/export — admin-only CSV download of ALL
// subscribers. Route Handler (not a Server Action) because the deliverable is
// a file the admin downloads directly: a plain anchor with zero client JS.
//
// Security ordering (non-negotiable): requireRole("admin") is the FIRST
// statement in GET, wrapped in try/catch — a Route Handler returns statuses,
// it does not propagate thrown errors, so the FORBIDDEN throw must become a
// 403 Response. The token column is NEVER selected (T-3l2-05 — unsubscribe
// credential, does not belong in an export payload).

import { db, schema } from "@/lib/db";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/permissions";

// Per-request, never prerendered/cached. Under cacheComponents:true the legacy
// `export const dynamic = "force-dynamic"` segment config is REJECTED by the
// build ("not compatible with nextConfig.cacheComponents") — the repo pattern
// (src/app/(admin)/layout.tsx, blog/[slug]/page.tsx) is to rely on the dynamic
// API instead: requireRole below calls headers() via auth.api.getSession, which
// opts this GET handler into per-request execution. The explicit
// Cache-Control: no-store on the response covers the HTTP-caching side.

/** Row shape toSubscribersCsv consumes — email/status/createdAt ONLY (never token). */
export interface SubscriberCsvRow {
  email: string;
  status: string;
  createdAt: Date | string;
}

/**
 * GET /dashboard/subscribers/export — admin-only CSV download.
 *
 * @returns 403 "Forbidden" when the session lacks the admin role (in-handler
 *          requireRole — the middleware matcher is a UX gate only), otherwise
 *          the CSV body with Content-Disposition attachment
 *          subscribers-YYYY-MM-DD.csv and Cache-Control no-store.
 */
export async function GET(): Promise<Response> {
  // 1. Admin re-check FIRST (T-3l2-05). A throw becomes a 403 Response — Route
  //    Handlers return statuses; they do not propagate thrown errors.
  try {
    await requireRole("admin");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  // 2. ALL subscribers, newest first. Explicit columns — the token column is
  //    never selected into an export payload (T-3l2-05).
  const rows: SubscriberCsvRow[] = await db
    .select({
      email: schema.subscribers.email,
      status: schema.subscribers.status,
      createdAt: schema.subscribers.createdAt,
    })
    .from(schema.subscribers)
    .orderBy(desc(schema.subscribers.createdAt));

  // 3. Build the CSV via the pure helper (unit-tested — see below).
  const csvBody = toSubscribersCsv(rows);

  // 4. filename date: YYYY-MM-DD from the ISO string (UTC, matching the body).
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csvBody, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscribers-${date}.csv"`,
      // no-store — an admin download is point-in-time; never a shared-cache item.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * toSubscribersCsv — render subscriber rows as an RFC 4180 CSV document.
 *
 * Pure helper exported beside GET (the rss.xml route precedent) so
 * __tests__/export.test.ts exercises the CSV logic DB-free. Contract:
 *   - body prefixed with the UTF-8 BOM (backslash-u escape in source — U+FEFF)
 *     so Excel opens UTF-8/Bangla content correctly;
 *   - header row email,status,subscribed_at; EVERY field wrapped in double
 *     quotes with internal double quotes doubled (RFC 4180 §2.7 — emails can
 *     legally contain quotes/commas; hand-rolled unquoted concatenation is the
 *     classic broken-CSV bug);
 *   - rows joined with CRLF (RFC 4180 §2.1);
 *   - formula-injection guard (T-3l2-06, research A1): any field whose FIRST
 *     character is = + - @ or a tab gets an apostrophe prefixed — cheap
 *     hardening against =HYPERLINK()/+cmd-style payloads executing when the
 *      admin opens the export in Excel/Sheets;
 *   - createdAt emitted via toISOString() (ISO-8601, unambiguous, sortable).
 */
export function toSubscribersCsv(rows: SubscriberCsvRow[]): string {
  const lines = [csvField("email"), csvField("status"), csvField("subscribed_at")].join(",");
  const body = rows
    .map((r) =>
      [
        csvField(r.email),
        csvField(r.status),
        csvField(new Date(r.createdAt).toISOString()),
      ].join(","),
    )
    .join("\r\n");
  // BOM as the backslash-u escape for U+FEFF (never a literal BOM char in source).
  return "\uFEFF" + lines + (body ? "\r\n" + body : "");
}

/**
 * Quote-wrap a single CSV field (RFC 4180) with the formula-injection guard
 * applied to the raw value BEFORE quoting (so the guard character survives
 * spreadsheet import as part of the cell text, not the CSV structure).
 */
function csvField(value: string): string {
  const guarded = /^[=+\-@\t]/.test(value) ? "'" + value : value;
  return '"' + guarded.replace(/"/g, '""') + '"';
}
