// src/lib/seo/__tests__/rss.test.ts
// [CITED: 05-02-PLAN.md Task 2 <behavior> — RSS 2.0 feed, escaping, CDATA, RSS_LIMIT cap]
// [CITED: 05-VALIDATION.md row 05-02-T2 — SEO-07, T-05-02 + T-05-04 mitigations]
// [CITED: 05-RESEARCH.md Pattern 5 (L598-679) — verified rss.xml/route.ts body]
//
// Unit tests for app/rss.xml/route.ts. The DB query, renderPostBody, and
// getSeoSettings are all mocked so the test exercises the XML-building logic
// without a DB or Tiptap render. Covers:
//   SEO-07 — well-formed RSS 2.0 + application/rss+xml Content-Type + full-text body.
//   T-05-02 — sanitized body via renderPostBody (mocked) + CDATA defense-in-depth.
//   T-05-04 — escapeXml covers the 5 XML-special chars.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fakeSettings,
  fakeRssPosts,
  fakeRssPostWithSpecialChars,
  MOCK_RENDERED_BODY,
} from "./shared-fixtures";

// --- Mocks -------------------------------------------------------------

const { schemaMock } = vi.hoisted(() => ({
  schemaMock: {
    posts: {
      title: "title",
      slug: "slug",
      body: "body",
      excerpt: "excerpt",
      publishedAt: "published_at",
      status: "status",
      deletedAt: "deleted_at",
    },
  },
}));

// Module-scoped result so individual tests can swap the fixture posts.
let postsResult: Array<{
  title: string;
  slug: string;
  body: unknown;
  excerpt: string | null;
  publishedAt: Date | null;
}> = fakeRssPosts;

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (table === schemaMock.posts) {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(postsResult)),
              })),
            })),
          };
        }
        return {};
      }),
    })),
  },
  schema: schemaMock,
}));

vi.mock("@/lib/post-render", () => ({
  renderPostBody: vi.fn(() => MOCK_RENDERED_BODY),
}));

vi.mock("@/lib/seo/settings", () => ({
  getSeoSettings: vi.fn(async () => fakeSettings),
}));

// --- SUT (imported AFTER mocks) -----------------------------------------

import { GET, escapeXml, buildRssItem, RSS_LIMIT } from "@/app/rss.xml/route";

// --- Helpers ------------------------------------------------------------

async function readBody(res: Response): Promise<string> {
  return await res.text();
}

// --- Tests ---------------------------------------------------------------

describe("SEO-07: GET /rss.xml — RSS 2.0 feed shape", () => {
  beforeEach(() => {
    postsResult = fakeRssPosts;
  });

  it("returns Content-Type application/rss+xml; charset=utf-8 (D-07)", async () => {
    const res = await GET();
    expect(res.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8");
  });

  it("body starts with XML declaration and <rss version=2.0> with atom + content namespaces", async () => {
    const body = await readBody(await GET());
    expect(body.startsWith("<?xml")).toBe(true);
    expect(body).toContain('<rss version="2.0"');
    expect(body).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(body).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"');
  });

  it("channel contains title (siteTitle), link (base), description, lastBuildDate, atom self-link", async () => {
    const body = await readBody(await GET());
    expect(body).toContain(`<title>${fakeSettings.siteTitle}</title>`);
    expect(body).toContain(`<link>${fakeSettings.canonicalBaseUrl}</link>`);
    expect(body).toContain(`<description>${fakeSettings.siteDescription}</description>`);
    expect(body).toContain("<lastBuildDate>");
    expect(body).toContain('atom:link');
    expect(body).toContain('/rss.xml');
  });

  it("has one <item> per fixture published post", async () => {
    const body = await readBody(await GET());
    const itemCount = (body.match(/<item>/g) || []).length;
    expect(itemCount).toBe(fakeRssPosts.length);
  });

  it("each item has title, link {base}/blog/{slug}, guid, description, content:encoded, pubDate", async () => {
    const body = await readBody(await GET());
    const post = fakeRssPosts[0];
    expect(body).toContain(`<title>${post.title}</title>`);
    expect(body).toContain(`<link>${fakeSettings.canonicalBaseUrl}/blog/${post.slug}</link>`);
    expect(body).toContain('<guid isPermaLink="true">');
    expect(body).toContain(`<description>${post.excerpt}</description>`);
    expect(body).toContain("<content:encoded>");
    expect(body).toContain("<pubDate>");
  });

  it("content:encoded body is wrapped in CDATA (T-05-02 defense-in-depth)", async () => {
    const body = await readBody(await GET());
    expect(body).toContain(`<![CDATA[${MOCK_RENDERED_BODY}]]>`);
  });

  it("pubDate is RFC-822 (toUTCString) format", async () => {
    const body = await readBody(await GET());
    // RFC-822 dates contain "GMT" — toUTCString always ends with "GMT"
    const pubDateMatch = body.match(/<pubDate>([^<]+)<\/pubDate>/);
    expect(pubDateMatch).not.toBeNull();
    expect(pubDateMatch![1]).toContain("GMT");
  });
});

describe("T-05-04: XML escaping in RSS text fields", () => {
  beforeEach(() => {
    postsResult = [fakeRssPostWithSpecialChars];
  });

  it("escapes all 5 XML-special chars in title (no raw <>&'\" in output)", async () => {
    const body = await readBody(await GET());
    // The raw special chars must NOT appear inside the <title> text node.
    const titleMatch = body.match(/<title>([^<]*)<\/title>/);
    // First <title> is the channel title (fakeSettings.siteTitle — no special chars here).
    // Find the item title instead.
    const itemTitleMatch = body.match(/<item>[\s\S]*?<title>([^<]*)<\/title>/);
    expect(itemTitleMatch).not.toBeNull();
    const itemTitle = itemTitleMatch![1];
    expect(itemTitle).not.toContain("<");
    expect(itemTitle).not.toContain(">");
    expect(itemTitle).not.toContain('"');
    // Escaped entities must be present.
    expect(itemTitle).toContain("&amp;");
    expect(itemTitle).toContain("&lt;");
    expect(itemTitle).toContain("&gt;");
    expect(itemTitle).toContain("&quot;");
    expect(itemTitle).toContain("&apos;");
    // No RAW ampersand (one not part of an entity).
    expect(itemTitle).not.toMatch(/(^|[^&])&($|[^a-z])/i);
  });
});

describe("T-05-05 + RSS_LIMIT: exclusion + cap", () => {
  it("RSS_LIMIT is 30 (D-07 sensible cap)", () => {
    expect(RSS_LIMIT).toBe(30);
  });

  it("caps at RSS_LIMIT items even when DB returns more (defense-in-depth)", async () => {
    // Generate 35 posts — the route must cap at 30.
    postsResult = Array.from({ length: 35 }, (_, i) => ({
      title: `Post ${i}`,
      slug: `post-${i}`,
      body: null,
      excerpt: `Excerpt ${i}`,
      publishedAt: new Date(`2026-06-${String(30 - i).padStart(2, "0")}T00:00:00Z`),
    }));
    const body = await readBody(await GET());
    const itemCount = (body.match(/<item>/g) || []).length;
    expect(itemCount).toBe(30);
  });
});

describe("Pure helpers: escapeXml + buildRssItem", () => {
  it("escapeXml replaces < > & ' \" with entities", () => {
    expect(escapeXml('<>&\'"')).toBe("&lt;&gt;&amp;&apos;&quot;");
  });

  it("escapeXml leaves plain text untouched", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });

  it("buildRssItem returns a well-formed <item> string with all fields", () => {
    const post = fakeRssPosts[0];
    const item = buildRssItem(post, fakeSettings.canonicalBaseUrl, MOCK_RENDERED_BODY);
    expect(item).toContain("<item>");
    expect(item).toContain("</item>");
    expect(item).toContain(`<title>${post.title}</title>`);
    expect(item).toContain(`<link>${fakeSettings.canonicalBaseUrl}/blog/${post.slug}</link>`);
    expect(item).toContain('isPermaLink="true"');
    expect(item).toContain("<description>");
    expect(item).toContain("<content:encoded>");
    expect(item).toContain(`<![CDATA[${MOCK_RENDERED_BODY}]]>`);
    expect(item).toContain("<pubDate>");
  });

  it("buildRssItem escapes special chars in title and excerpt", () => {
    const item = buildRssItem(
      fakeRssPostWithSpecialChars,
      fakeSettings.canonicalBaseUrl,
      MOCK_RENDERED_BODY,
    );
    // Raw ampersand must not appear in the title portion.
    const titleMatch = item.match(/<title>([^<]*)<\/title>/);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![1]).toContain("&amp;");
    expect(titleMatch![1]).not.toMatch(/(^|[^&])&($|[^a-z])/i);
  });
});
