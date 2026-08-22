// src/app/(site)/page.tsx
// [CITED: 260823-4yc-PLAN.md Task 2 — homepage rebuilt per the frontpage design]
// [CITED: 260823-4yc-PLAN.md locked decision 1 — Featured card + Latest grid, NO teasers/Trending/Newsletter]
// [CITED: 260823-4yc-PLAN.md locked decision 2 — page 1 of the paginated home; "/page/N" renders page N]
// [CITED: 06-CONTEXT.md D-16 — friendly empty states]
// [CITED: 06-RESEARCH.md Pattern 2 — cached paginated list query shape]
//
// Home route — page 1 of the frontpage design (260823-4yc):
//   1. Featured — horizontal hero card (listFeatured, D-04 manual flag gives
//      editorial control; falls back to the most recent published post).
//   2. Latest Posts — 12 PostCards per page in a 3-column grid.
//   3. Numbered pagination — page 1 = "/", page N = "/page/N".
// All content lives in the shared <HomeFeed /> (also rendered by
// /page/[pageNumber]) so both routes stay identical in structure.
//
// The home route's generateMetadata is settings-driven (the cached snapshot). The
// data reads are cached at the query layer ('use cache' + cacheTag('posts-list')),
// so the page component itself needs NO 'use cache' directive — under
// cacheComponents:true it becomes part of the static shell automatically.
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildSiteMetadata } from "@/lib/seo/metadata";
import HomeFeed from "@/components/site/HomeFeed";

export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings();
  return buildSiteMetadata(s);
}

export default async function HomePage() {
  return <HomeFeed page={1} />;
}
