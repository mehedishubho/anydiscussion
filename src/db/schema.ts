// src/db/schema.ts (12 tables — 8 Phase-1 + user/session/account/verification Phase-2)
// [CITED: CLAUDE.md schema reference + drizzle-orm/pg-core verified builders
//  + better-auth/cli-generated auth-schema.ts (Phase 2)]
// The single source of truth for the database schema.
// Every migration is generated from this file via `pnpm db:generate` (drizzle-kit generate).
// Never hand-write SQL migrations (D-11, CLAUDE.md).
//
// Schema decisions encoded here:
//  - D-05: hybrid depth (content tables are rich, join/utility tables are lean)
//  - D-06: pages carry their OWN SEO columns (metaTitle, metaDescription, canonical) — not polymorphic
//  - D-07: users table deferred to Phase 2 (Better Auth generates it); author_id + category_id
//          FK constraints ADDED Phase 2 (this file) — .references(() => user.id / categories.id)
//  - D-08: soft-delete (deletedAt) on content tables (posts, pages, media, categories, tags);
//          hard-delete on join/utility tables (settings, postTags, postSeo — no deletedAt)
//  - D-11: forward-only migrations; no down/rollback scripts
//  - D-24/D-25: user.bio + user.avatar (AUTH-08 — Phase 6 byline/avatar via R2 key)
//
// === Phase-3 deltas (Plan 03-01 Task 1) ===
//  - posts.previewToken added (D-19 draft preview links — /preview/[token] route)
//  - media.uploadedBy: integer → text FK on user.id (was broken — user.id is text UUID)
//  - media.r2Key renamed to providerKey + new media.provider column
//    (MEDIA-02/MEDIA-04 — provider abstraction: "local" default | "r2"; Cloudinary/push-CDN Phase 4)
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  varchar,
  pgEnum,
  primaryKey,
  boolean,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// tsvector column type — PostgreSQL's built-in full-text search type.
// Drizzle's `vector()` builder is for the pgvector extension (embeddings, requires
// `dimensions`), NOT for tsvector. We define a custom type so generatedAlwaysAs
// works for the FTS search column (D-09).
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// Enums
export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "pending_review",
  "published",
]);
export const pageStatusEnum = pgEnum("page_status", ["draft", "published"]);

// posts
// Phase-6 deltas (Plan 06-01 Task 1):
//  - D-04: featured (boolean, manual editorial flag for the home hero)
//  - D-01: views (integer, simple counter — atomic +1, no de-dupe)
//  - D-09: searchVector (generated tsvector from title + excerpt using 'simple'
//          config — no PG Bengali stemmer exists; 'simple' has no stemming so
//          Bangla queries match. FTS is against title + excerpt ONLY, NOT body
//          (body is jsonb — structural noise per Pitfall 4).
//  The table switches from the 2-arg to the 3-arg pgTable form to add the GIN
//  index on the generated tsvector column (mirrors postTags/session pattern).
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    body: jsonb("body"), // Tiptap JSON
    excerpt: text("excerpt"),
    status: postStatusEnum("status").default("draft").notNull(),
    // D-07 FK closure (Phase 2): authorId → user.id (text UUID — Better Auth PK),
    // categoryId → categories.id. Mirrors the postTags.postId.references() pattern below.
    authorId: text("author_id").references(() => user.id),
    categoryId: integer("category_id").references(() => categories.id),
    featureImage: text("feature_image"),
    // D-19 (Phase 3): draft preview links — /preview/[token] route. Nullable (set on
    // first generation); rotates on publish (old link 404s). crypto.randomUUID() value.
    previewToken: varchar("preview_token", { length: 255 }).unique(),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
    // D-04 (Phase 6): manual editorial flag — editors tick "Feature this" in the
    // post editor. Home hero = most-recently-published featured post.
    featured: boolean("featured").default(false).notNull(),
    // D-01 (Phase 6): simple view counter — atomic UPDATE views = views + 1.
    // No de-dupe (accepts minor inflation from refreshes/crawlers — vanity metric).
    views: integer("views").default(0).notNull(),
    // D-09 (Phase 6): generated tsvector for Postgres full-text search.
    // 'simple' config = no stemming (Bangla has no PG stemmer — SEARCH-02 v2 caveat).
    // Generated from title + excerpt ONLY (NOT body — jsonb structural noise, Pitfall 4).
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(excerpt, ''))`,
    ),
  },
  (t) => ({
    // GIN index for fast @@ tsquery matching on the searchVector column.
    searchIdx: index("posts_search_vector_idx").using("gin", t.searchVector),
  }),
);

// post_seo (one-to-one with posts) — hard-delete per D-08 (no deletedAt)
export const postSeo = pgTable("post_seo", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id),
  slug: varchar("slug", { length: 255 }),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ogImage: text("og_image"),
  canonicalUrl: text("canonical_url"),
});

// categories
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

// tags
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

// post_tags (join table — hard-delete per D-08; composite PK, no id column)
export const postTags = pgTable(
  "post_tags",
  {
    postId: integer("post_id").notNull().references(() => posts.id),
    tagId: integer("tag_id").notNull().references(() => tags.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.tagId] }),
  }),
);

// media
// Phase-3 deltas (MEDIA-02/MEDIA-04): provider abstraction. r2Key → providerKey +
// new provider column ("local" | "r2"; Cloudinary/push-CDN arrive Phase 4 DASH-09).
// uploadedBy fixed from integer → text FK on user.id (was broken — user.id is text UUID).
export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  providerKey: text("provider_key").notNull(),
  provider: text("provider"), // "local" | "r2" — NULL means the legacy default (R2)
  altText: text("alt_text"),
  uploadedBy: text("uploaded_by").references(() => user.id),
  mimeType: text("mime_type"),
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

// pages (D-06 — post-like with OWN SEO columns, NOT polymorphic)
export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: text("title").notNull(),
  body: jsonb("body"), // Tiptap JSON
  status: pageStatusEnum("status").default("draft").notNull(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  canonical: text("canonical"),
});

// settings (key-value — hard-delete per D-08; key is the PK, no serial id)
export const settings = pgTable("settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// redirects (D-12 — CLAUDE.md "Database schema": old_path, new_path, status_code 301/302)
// Ships EMPTY in v1 (D-12). The redirects-manager UI that populates this table is
// v2 SETT-03. The redirects-check wiring (app/not-found.tsx, Node runtime) is Plan 03.
export const redirects = pgTable("redirects", {
  id: serial("id").primaryKey(),
  oldPath: varchar("old_path", { length: 255 }).notNull().unique(),
  newPath: varchar("new_path", { length: 255 }).notNull(),
  statusCode: integer("status_code").default(301).notNull(), // 301 | 302
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// === Phase 2: Auth tables (Better Auth CLI-generated, merged here so the single
// schema passed to drizzleAdapter({ schema }) contains them) ===
// [CITED: better-auth/docs/concepts/database.mdx + plugins/admin.mdx — RESEARCH.md Pattern 2]
// admin-plugin adds role/banned/banReason/banExpires on user, impersonatedBy on session.
// additionalFields adds bio (D-24) + avatar (D-25 — R2 object key, not binary).
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  bio: text("bio"),
  avatar: text("avatar"),
  // D-11 (Phase 6): public username slug for /author/[username] URLs.
  // user.id is a UUID (bad for public URLs). Nullable — set via the dashboard
  // profile UI. Verified NEW: user has `name` (display) but no slug field.
  username: varchar("username", { length: 255 }).unique(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("session_userId_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_userId_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
