// src/lib/notifications.ts
// [CITED: 260827-se8-PLAN.md Task 1 <action> step 2 — the fan-out helper]
// [CITED: src/actions/users.ts L138-154 — the awaited-swallow rationale:
//  a notification-insert failure must NEVER fail the parent mutation; awaited
//  (never void fire-and-forget — void makes the catch dead code plus an
//  unhandled rejection inside the Server Action runtime)]
//
// Plain server-only module — deliberately NO "use server" directive: it is a
// HELPER imported BY Server Action files (posts.ts / newsletter.ts), not a
// public endpoint. Every export of a "use server" module becomes a publicly
// invocable action — a bare notifyUsers(recipients, ...) endpoint would let
// any signed-in client spam arbitrary notification rows.
//
// Server-only — imported exclusively from "use server" action files.
import { db, schema } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * notifyUsers — insert one notification row per recipient in a SINGLE
 * db.insert (fan-out shape: one statement, not N).
 *
 * Contract (T-Q-se8-07):
 *   - empty recipients → immediate return, NO insert at all
 *   - a db.insert rejection is OBSERVED (awaited try/catch), logged via
 *     log.error, and swallowed — the caller's parent mutation never fails
 *     because display-only notification data could not be written
 *   - notifications are non-authoritative display data (schema.ts header);
 *     losing one to a transient DB error is acceptable, failing a publish
 *     or a subscribe over it is not
 *
 * Payload keys per type (consumed by the bell UI's friendly-copy map):
 *   post_submitted / post_published / post_returned → { postId?, postTitle? }
 *   new_subscriber → { subscriberEmail? }
 */
export async function notifyUsers(
  recipients: string[],
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (recipients.length === 0) return;

  try {
    await db
      .insert(schema.notifications)
      .values(recipients.map((userId) => ({ userId, type, payload })));
  } catch (err) {
    // Awaited (not void) so this catch actually observes the rejection —
    // the createUser verification-email rationale (users.ts L138-154).
    log.error("notification insert failed", { type, err: String(err) });
  }
}
