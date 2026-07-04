// src/lib/sanitize/index.ts
// [CITED: RESEARCH.md Pattern 2 (L428-487) — the full sanitize config + iframe hook body]
// [CITED: CLAUDE.md project-wide rule — sanitize any HTML/JS field before storage AND render]
// [CITED: 03-CONTEXT.md D-02 (per-provider iframe allowlist), D-05 (target/rel preserved),
//  D-07 (allow video/audio/source for non-image media types)]
// [CITED: 03-02-PLAN.md threat model T-03-07..T-03-10 — mitigate dispositions]
//
// THE shared DOMPurify config (Pitfall #2 linchpin). ONE config object, TWO call sites:
//   Site #1 — sanitizeBeforeStore(html): called in src/actions/posts.ts BEFORE db.insert
//     (walks the ProseMirror JSON body to find raw-HTML embed nodes and sanitizes them).
//   Site #2 — sanitizeBeforeRender(html): called in src/lib/post-render.ts BEFORE
//     dangerouslySetInnerHTML (defense-in-depth — even if storage was bypassed).
//
// Both functions reference the SAME CONFIG object — the same-config test in
// __tests__/sanitize.test.ts prevents config drift between the two call sites.
//
// The `uponSanitizeAttribute` hook IS the iframe-src security gate (Pitfall #2 sub):
//   ADD_TAGS: ["iframe"] permits the <iframe> element, but DOMPurify does NOT validate
//   the src domain by default. The hook checks every iframe src against the
//   EMBED_DOMAIN_ALLOWLIST and blanks disallowed domains — the iframe becomes inert.
//
// Server-only — NO "use client" directive. Uses isomorphic-dompurify@3.18.0 which
// wraps dompurify@3.4.11 + jsdom@^29 (same API on server and client).
import DOMPurify from "isomorphic-dompurify";

// D-02: per-provider iframe + domain allowlist.
// These are the ONLY domains whose iframe embeds are permitted in post bodies.
// Disallowed domains have their src blanked by the hook below (iframe becomes inert).
export const EMBED_DOMAIN_ALLOWLIST = [
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "instagram.com",
  "vimeo.com",
  "soundcloud.com",
] as const;

/**
 * DOMPurify hook: enforce iframe src domain allowlist (Pitfall #2 sub — iframe injection).
 *
 * Fires for EVERY attribute being sanitized. When the attribute is an iframe `src`,
 * the hook parses the URL and checks whether the hostname matches any allowlisted
 * domain (exact match OR subdomain via endsWith). Disallowed or invalid URLs have
 * their `attrValue` blanked — the iframe element survives but renders nothing.
 *
 * Also enforces D-05 anti-tabnabbing: if an <a> has target="_blank" and no rel
 * attribute, the hook adds rel="noopener noreferrer" (DOMPurify 3.4.11 does this
 * automatically when target is in ADD_ATTR, but the hook is the defense-in-depth
 * fallback per RESEARCH.md A2/L487).
 */
DOMPurify.addHook(
  "uponSanitizeAttribute",
  (node: Element, data: { attrName: string; attrValue: string }) => {
    // --- Iframe src domain allowlist (T-03-08) ---
    if (node.nodeName === "IFRAME" && data.attrName === "src") {
      try {
        const url = new URL(data.attrValue);
        const allowed = EMBED_DOMAIN_ALLOWLIST.some(
          (d) => url.hostname === d || url.hostname.endsWith("." + d),
        );
        if (!allowed) {
          // Blank the src — the iframe element survives but cannot load any content.
          data.attrValue = "";
        }
      } catch {
        // Invalid URL (new URL throws) — blank the src defensively.
        data.attrValue = "";
      }
    }

    // --- D-05 anti-tabnabbing fallback (T-03-09) ---
    // DOMPurify 3.4.11 auto-adds rel="noopener noreferrer" to target="_blank" links
    // when target+rel are in ADD_ATTR. This hook is the defense-in-depth fallback:
    // if for any reason the rel is missing on a target=_blank anchor, add it here.
    if (
      node.nodeName === "A" &&
      data.attrName === "target" &&
      data.attrValue === "_blank"
    ) {
      const currentRel = node.getAttribute("rel");
      if (!currentRel) {
        node.setAttribute("rel", "noopener noreferrer");
      }
    }
  },
);

/**
 * THE shared DOMPurify config (Pitfall #2 — single source of truth).
 *
 * ADD_TAGS: permits iframe (D-02 embeds) + video/audio/source (D-07 non-image media).
 * ADD_ATTR: permits target/rel (D-05 links) + iframe/media attributes.
 * KEEP_CONTENT: true — preserves the text content of stripped elements.
 */
const CONFIG = {
  ADD_TAGS: ["iframe", "video", "audio", "source"],
  ADD_ATTR: [
    "target",
    "rel", // D-05 links — target=_blank + anti-tabnabbing rel
    "src",
    "allowfullscreen",
    "allow",
    "frameborder",
    "loading",
    "title", // iframe attributes
    "controls",
    "type", // video/audio/source attributes (D-07)
  ],
  KEEP_CONTENT: true,
} as const;

/**
 * Site #1 — sanitize HTML BEFORE storage.
 *
 * Called in src/actions/posts.ts inside savePost: walks the parsed ProseMirror
 * JSON body to find raw-HTML embed nodes (the D-02 raw-HTML-paste path), extracts
 * the HTML string, runs it through this function, and re-injects the sanitized
 * result. Malicious attributes (onerror, javascript: protocols) and disallowed
 * iframe domains are stripped BEFORE the data reaches the database.
 *
 * @param dirty - the unsanitized HTML string (from an embed paste or raw-HTML node)
 * @returns the sanitized HTML string, safe to store in the database
 */
export function sanitizeBeforeStore(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG);
}

/**
 * Site #2 — sanitize HTML BEFORE render (defense-in-depth).
 *
 * Called in src/lib/post-render.ts inside renderPostBody: after generateHTML
 * serializes the stored ProseMirror JSON to HTML, this function runs BEFORE
 * the HTML is injected via dangerouslySetInnerHTML on any public/preview surface.
 *
 * This is defense-in-depth: even if storage-time sanitization was bypassed (direct
 * DB edit, migration of old data, future code path), the render gate strips
 * malicious content again. Both sites use the SAME CONFIG object — no drift.
 *
 * @param dirty - the HTML string about to be injected via dangerouslySetInnerHTML
 * @returns the sanitized HTML string, safe for dangerouslySetInnerHTML
 */
export function sanitizeBeforeRender(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG);
}
