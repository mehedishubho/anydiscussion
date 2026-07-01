// src/db/schema.ts (8 tables — D-07)
// [CITED: CLAUDE.md schema reference + drizzle-orm/pg-core verified builders]
// The single source of truth for the Phase 1 database schema.
// Every migration is generated from this file via `pnpm db:generate` (drizzle-kit generate).
// Never hand-write SQL migrations (D-11, CLAUDE.md).
//
// Schema decisions encoded here:
//  - D-05: hybrid depth (content tables are rich, join/utility tables are lean)
//  - D-06: pages carry their OWN SEO columns (metaTitle, metaDescription, canonical) — not polymorphic
//  - D-07: users table deferred to Phase 2 (Better Auth generates it); author_id + category_id are
//          PLAIN integer columns with NO .references() call — FK constraints added in Phase 2
//  - D-08: soft-delete (deletedAt) on content tables (posts, pages, media, categories, tags);
//          hard-delete on join/utility tables (settings, postTags, postSeo — no deletedAt)
//  - D-11: forward-only migrations; no down/rollback scripts
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
} from "drizzle-orm/pg-core";

// Enums
export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "pending_review",
  "published",
]);
export const pageStatusEnum = pgEnum("page_status", ["draft", "published"]);

// posts
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  body: jsonb("body"), // Tiptap JSON
  excerpt: text("excerpt"),
  status: postStatusEnum("status").default("draft").notNull(),
  authorId: integer("author_id"), // plain column now; FK added Phase 2 (D-07)
  categoryId: integer("category_id"), // plain column; FK added Phase 2 (matches D-07 deferred-FK posture)
  featureImage: text("feature_image"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

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
export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  r2Key: text("r2_key").notNull(),
  altText: text("alt_text"),
  uploadedBy: integer("uploaded_by"),
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
