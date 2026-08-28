// src/actions/notifications.ts
// [CITED: 260827-se8-PLAN.md Task 1 <action> step 3 — session-scoped read actions]
// [CITED: src/actions/users.ts changeOwnPassword (260827-869) — the self-service
//  precedent: getSessionOrThrow FIRST, NO userId parameter anywhere]
//
// The notification-bell Server Actions. All three are SELF-SERVICE reads/writes
// for ANY signed-in role: there is deliberately no requireCan (reading your own
// bell feed is not a capability) and NO userId parameter (T-Q-se8-06 — a client
// can never read or mark another user's notifications; every WHERE clause is
// derived from the server-side session).
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { db, schema } from "@/lib/db";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getSessionOrThrow } from "@/lib/permissions";

/** Dashboard bell page size (the uniform 20-rows-per-page quick-task decision). */
const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * countUnreadNotifications — the bell badge count.
 *
 * @returns The caller's unread row count (readAt IS NULL).
 * @throws Error("UNAUTHORIZED") when no session — BEFORE any db call.
 */
export async function countUnreadNotifications(): Promise<number> {
  // Session FIRST (Pitfall #1) — the session user id IS the WHERE scope.
  const session = await getSessionOrThrow();

  const [row] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, session.user.id),
        isNull(schema.notifications.readAt),
      ),
    );
  return Number(row?.n ?? 0);
}

/**
 * listNotifications — one page of the caller's feed, newest first.
 *
 * @param page 1-based page number; clamped to ≥ 1 (0/negative/NaN → 1).
 * @returns Rows of { id, type, payload, readAt, createdAt } (20 per page).
 * @throws Error("UNAUTHORIZED") when no session — BEFORE any db call.
 */
export async function listNotifications(page = 1) {
  // Session FIRST (Pitfall #1).
  const session = await getSessionOrThrow();

  // clampPage semantics (list-filters): garbage page input degrades to page 1,
  // never a negative offset.
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const offset = (safePage - 1) * NOTIFICATIONS_PAGE_SIZE;

  return db
    .select({
      id: schema.notifications.id,
      type: schema.notifications.type,
      payload: schema.notifications.payload,
      readAt: schema.notifications.readAt,
      createdAt: schema.notifications.createdAt,
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, session.user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(NOTIFICATIONS_PAGE_SIZE)
    .offset(offset);
}

/**
 * markNotificationsRead — set readAt on ALL of the caller's unread rows
 * (fires when the bell dropdown opens).
 *
 * @throws Error("UNAUTHORIZED") when no session — BEFORE any db call.
 */
export async function markNotificationsRead() {
  // Session FIRST (Pitfall #1). The WHERE touches ONLY rows owned by the
  // caller (userId + readAt IS NULL) — no ids are accepted from the client.
  const session = await getSessionOrThrow();

  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, session.user.id),
        isNull(schema.notifications.readAt),
      ),
    );
  return { ok: true };
}
