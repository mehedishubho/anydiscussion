// src/components/site/Analytics.tsx
// [CITED: 06-02-PLAN.md Task 2 — analytics script injection (ANAL-01/02, D-17)]
// [CITED: 06-RESEARCH.md §"Analytics injection specific guidance" (L938-940) — URL + ID, NOT freeform HTML]
// [CITED: 06-RESEARCH.md §Security Domain — validate https scheme before injecting (T-06-05)]
// [CITED: 06-CONTEXT.md D-17 — injection-only this phase; Umami instance deploys in Phase 7]
//
// Async server component that reads two settings keys (analytics.script URL +
// analytics.umami_id) and injects a validated <script> tag. Default behavior:
// renders NOTHING (the analytics.script setting is empty by default — the Umami
// instance itself deploys in Phase 7 per D-17).
//
// SECURITY (T-06-05 — high severity, mitigate):
//   - The script URL is admin-set (the settings/seo page is admin-only). A
//     compromised admin account could attempt to inject a malicious script URL.
//   - Mitigation: validate the URL protocol is EXACTLY "https:" before emitting.
//     Reject http:, data:, javascript:, and any non-https scheme. This keeps the
//     injection mechanism safe even under a compromised admin (RESEARCH Security
//     Domain guidance).
//   - NEVER use dangerouslySetInnerHTML here (XSS vector). Emit ONLY a plain
//     <script async src={url} data-website-id={id} /> with two attributes — no
//     arbitrary inline HTML from settings.
//
// GA4/Plausible are swappable by changing the settings values (ANAL-02 — decided
// at deploy).
//
// Server-only — NO "use client" directive.

import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/** The two settings keys that feed analytics injection (D-17). */
const ANALYTICS_KEYS = {
  scriptUrl: "analytics.script",
  websiteId: "analytics.umami_id",
} as const;

/**
 * readAnalyticsSettings — reads the two analytics settings rows.
 * Returns null for missing/empty values. This read is small (2 rows by PK) and
 * runs in the layout scope; the layout's generateMetadata already establishes the
 * cached scope for the shell.
 */
async function readAnalyticsSettings(): Promise<{
  scriptUrl: string | null;
  websiteId: string | null;
}> {
  const [urlRow, idRow] = await Promise.all([
    db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, ANALYTICS_KEYS.scriptUrl))
      .limit(1),
    db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, ANALYTICS_KEYS.websiteId))
      .limit(1),
  ]);
  return {
    scriptUrl:
      urlRow[0]?.value && urlRow[0].value.trim() !== ""
        ? urlRow[0].value
        : null,
    websiteId:
      idRow[0]?.value && idRow[0].value.trim() !== ""
        ? idRow[0].value
        : null,
  };
}

/**
 * isHttpsUrl — validate that a URL string parses and uses the https scheme.
 *
 * Defense against stored XSS via a compromised admin setting a malicious URL
 * (http:, data:, javascript: schemes). T-06-05 mitigation. Returns false for
 * any non-https URL or unparseable string.
 */
function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Analytics — renders a validated analytics <script> tag from settings, or nothing.
 *
 * Behavior:
 *   1. Read analytics.script + analytics.umami_id from settings.
 *   2. If scriptUrl is empty/null → render nothing (default — Umami deploys Phase 7).
 *   3. If scriptUrl is set BUT not https → render nothing (T-06-05 — reject silently;
 *      a misconfigured http URL is treated as "not injected" rather than degraded).
 *   4. If valid https → render <script async src={url} data-website-id={id} />.
 *
 * Never injects arbitrary inline HTML — only the two attributes (src + data-website-id).
 */
export default async function Analytics() {
  const { scriptUrl, websiteId } = await readAnalyticsSettings();

  // Default: no script configured → render nothing (D-17 — Umami deploys Phase 7).
  if (!scriptUrl) return null;

  // T-06-05 mitigation: reject non-https URLs (XSS vector). No partial render.
  if (!isHttpsUrl(scriptUrl)) return null;

  return (
    <script
      async
      src={scriptUrl}
      data-website-id={websiteId ?? undefined}
    />
  );
}
