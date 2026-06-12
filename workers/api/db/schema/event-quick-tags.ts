import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { events } from "./events";
import { tags } from "./tags";

/** An event's curated "quick tags" — an ordered subset of the user's tags shown
 * as one-tap chips on the event-mode capture screen (PRD F1.3). */
export const eventQuickTags = sqliteTable(
  "event_quick_tags",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.tagId] }),
    index("event_quick_tags_event_idx").on(t.eventId),
    index("event_quick_tags_tag_idx").on(t.tagId),
  ],
);
