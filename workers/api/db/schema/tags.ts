import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { now } from "./helpers";
import { organizations } from "./organizations";

/** A short label a user attaches to contacts (e.g. "investor", "hiring",
 * "rails-dev"). Tags are global to the user and reusable across events. Scoped
 * to an org (tenancy) AND a user, and unique per user by name. */
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    /** Clerk user id of the owner. Not an FK — the user mirror syncs lazily. */
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("tags_owner_idx").on(t.orgId, t.userId),
    // One tag name per user (the DB backstop for the service's uniqueness check).
    uniqueIndex("tags_owner_name_unq").on(t.orgId, t.userId, t.name),
  ],
);
