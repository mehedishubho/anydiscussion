// src/actions/pages.ts
// [CITED: src/actions/categories.ts — the canonical small-CRUD action template
//  (requireCan first, soft-delete pattern lines 78-86)]
// [CITED: src/actions/posts.ts — sanitizeBodyHtml walker (lines 57-83) reused verbatim
//  for page body sanitization at storage time — CLAUDE.md "sanitize before storage
//  AND render — no exception for trusted admin content")]
// [CITED: 04-CONTEXT.md D-17 (seed T&C + Privacy + Contact), D-18 (slimmed editor),
//  D-19 (Contact = content-only), D-20 (draft | published only — NO pending_review)]
// [CITED: CLAUDE.md "Roles & permissions" — every mutating action starts with the check]
//
// Pages Server Actions. Every mutating action AND every read calls
// `requireCan({ page: [...] })` FIRST (Phase 2 Pitfall #1 — never trust the proxy
// gate; the sidebar filter is UX-only). Page status is `draft` | `published` only
// per D-20 — there is intentionally no submitForReview / transitionPage action
// (legal/contact content does not flow through the editorial review pipeline).
//
// Page body goes through the SAME `sanitizeBeforeStore` + JSON walker pipeline as
// posts (T-04-17 — CLAUDE.md "no exception for trusted admin content"). The
// walker is copied verbatim from posts.ts so storage-time sanitization cannot
// drift between the two content types.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { db, schema } from "@/lib/db";
import { asc, eq, isNull } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";
import { sanitizeBeforeStore } from "@/lib/sanitize";
import { pageSchema, type PageSchemaInput } from "./pages-schema";

interface PageInput {
  title: string;
  slug: string;
  body?: unknown;
  status?: "draft" | "published";
  metaTitle?: string;
  metaDescription?: string;
  canonical?: string;
}

/**
 * sanitizeBodyHtml — Pitfall #2 site #1 (storage-time sanitize on the body).
 *
 * Verbatim copy of the walker in src/actions/posts.ts. The body is ProseMirror
 * JSON — structured nodes, NOT raw HTML. However, the D-02 raw-HTML-paste embed
 * path can store HTML strings inside node attrs. This walker recursively
 * traverses the JSON tree and runs any string that looks like HTML (contains
 * `<` and `>`) through `sanitizeBeforeStore` — the shared DOMPurify config.
 *
 * If the body has no raw-HTML strings (pure structured JSON), this is a no-op —
 * the function still runs to be safe (defense-in-depth per CLAUDE.md).
 *
 * Pages use the SAME config as posts (T-04-17); the page body's render path
 * (Phase 6) will reuse the matching sanitizeBeforeRender config.
 */
function sanitizeBodyHtml(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      // Only sanitize strings that look like HTML — avoids running DOMPurify on
      // every plain-text string in the JSON (perf) while catching all embed HTML.
      if (node.includes("<") && node.includes(">")) {
        return sanitizeBeforeStore(node);
      }
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node && typeof node === "object") {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>)) {
        result[key] = walk((node as Record<string, unknown>)[key]);
      }
      return result;
    }
    return node;
  };

  return walk(body);
}

/**
 * createPage — insert a new page row. Permission-check-first:
 *   await requireCan({ page: ["create"] }) — admins + editors pass; authors fail.
 *
 * D-20: status is parsed by pageSchema — only "draft" | "published" accepted.
 * T-04-17: body is sanitized via the JSON walker BEFORE any DB write.
 */
export async function createPage(input: PageInput) {
  await requireCan({ page: ["create"] }); // FIRST (Pitfall #1)

  const data = pageSchema.parse(input) as PageSchemaInput;

  // T-04-17 — sanitize raw HTML embed nodes BEFORE storage.
  const sanitizedBody = sanitizeBodyHtml(data.body);

  const [row] = await db
    .insert(schema.pages)
    .values({
      title: data.title,
      slug: data.slug,
      body: sanitizedBody,
      status: data.status ?? "draft",
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      canonical: data.canonical || null,
    })
    .returning({ id: schema.pages.id });
  return { id: row?.id };
}

/**
 * updatePage — patch an existing page row. Permission-check-first:
 *   await requireCan({ page: ["update"] }) — admins + editors pass; authors fail.
 *
 * Only the supplied fields are written (Partial<PageInput> semantics). Status is
 * parsed by pageSchema; body is sanitized via the walker when present.
 */
export async function updatePage(id: number, input: Partial<PageInput>) {
  await requireCan({ page: ["update"] }); // FIRST (Pitfall #1)

  const data = pageSchema.parse({ ...input, id }) as PageSchemaInput;

  const sanitizedBody =
    data.body !== undefined ? sanitizeBodyHtml(data.body) : undefined;

  await db
    .update(schema.pages)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(sanitizedBody !== undefined ? { body: sanitizedBody } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.metaTitle !== undefined ? { metaTitle: data.metaTitle } : {}),
      ...(data.metaDescription !== undefined
        ? { metaDescription: data.metaDescription }
        : {}),
      ...(data.canonical !== undefined ? { canonical: data.canonical || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.pages.id, id));
  return { id };
}

/**
 * listPages — read all (non-soft-deleted) pages. Permission-check-first:
 *   await requireCan({ page: ["read"] }) — any authenticated team member passes
 *   (T-04-19 accept: drafts visible to the dashboard team — small team per CLAUDE.md).
 *
 * Soft-deleted rows (deletedAt IS NULL filter) are excluded — D-08.
 */
export async function listPages() {
  await requireCan({ page: ["read"] }); // FIRST
  return await db
    .select()
    .from(schema.pages)
    .where(isNull(schema.pages.deletedAt))
    .orderBy(asc(schema.pages.title));
}

/**
 * getPage — read a single page by id. Permission-check-first.
 * Throws NOT_FOUND when the row is missing or has been soft-deleted.
 */
export async function getPage(id: number) {
  await requireCan({ page: ["read"] }); // FIRST
  const [row] = await db
    .select()
    .from(schema.pages)
    .where(eq(schema.pages.id, id))
    .limit(1);
  if (!row || row.deletedAt) {
    log.error("getPage not found", { id });
    throw new Error("NOT_FOUND");
  }
  return row;
}

/**
 * softDeletePage — set deletedAt = now() (D-08). Permission-check-first:
 *   await requireCan({ page: ["delete"] }) — admins + editors pass; authors fail.
 *
 * Never hard-deletes (preserves referential integrity for any future audit trail).
 */
export async function softDeletePage(id: number) {
  await requireCan({ page: ["delete"] }); // FIRST (Pitfall #1)
  await db
    .update(schema.pages)
    .set({ deletedAt: new Date() }) // D-08 soft-delete
    .where(eq(schema.pages.id, id));
  log.info("page soft-deleted", { id });
  return { id };
}
