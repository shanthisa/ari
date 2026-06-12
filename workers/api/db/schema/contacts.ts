import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { events } from "./events";
import { now } from "./helpers";
import { organizations } from "./organizations";
import { tags } from "./tags";

/** A person captured at an event: name, note, optional geolocation, and a set
 * of tags. Belongs to exactly one event; scoped to an org (tenancy) and a user.
 * The primary key is text so the client can generate it for idempotent,
 * retry-safe creates (the PRD's offline-capture hook). */
export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").notNull(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    name: text("name").notNull(),
    note: text("note"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    /** Reported accuracy of the fix in metres, so the map can render honestly. */
    accuracy: real("accuracy"),
    /** When the capture happened (unix seconds) — distinct from createdAt so an
     * offline capture can carry its real on-the-ground timestamp. */
    capturedAt: integer("captured_at").notNull().$defaultFn(now),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("contacts_owner_idx").on(t.orgId, t.userId),
    index("contacts_event_idx").on(t.eventId),
  ],
);

/** Join table: which tags are on which contacts. */
export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (t) => [
    primaryKey({ columns: [t.contactId, t.tagId] }),
    index("contact_tags_tag_idx").on(t.tagId),
  ],
);
