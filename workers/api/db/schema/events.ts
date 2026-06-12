import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { now } from "./helpers";
import { organizations } from "./organizations";

/** An event is a networking occasion that owns a set of captured contacts.
 * Scoped to an org (tenancy) AND a user (events are personal in phase 1 — the
 * PRD keeps org scoping so team sharing can be added later without re-modelling
 * ownership). Lifecycle: draft → active → archived, with the invariant that a
 * user has at most ONE active event at a time (enforced in events-service). */
export type EventStatus = "draft" | "active" | "archived";

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    /** Clerk user id of the owner. Not an FK — the user mirror is synced lazily,
     * so we never want event writes to depend on its presence. */
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    /** Optional event date as an ISO `YYYY-MM-DD` string (date-only, no tz). */
    date: text("date"),
    venue: text("venue"),
    notes: text("notes"),
    status: text("status").$type<EventStatus>().notNull().default("draft"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("events_org_id_idx").on(t.orgId),
    // Supports "find this user's active event" and per-owner listing.
    index("events_owner_status_idx").on(t.orgId, t.userId, t.status),
  ],
);
