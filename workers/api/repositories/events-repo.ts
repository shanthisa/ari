import { and, desc, eq, ne } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { events } from "../db/schema";
import { now } from "../db/schema/helpers";
import type { EventStatus } from "../db/schema/events";

// The repository is the ONLY layer that touches Drizzle/D1. Every query is
// scoped by `orgId` AND `userId` so a user only ever sees their own events
// (events are personal in phase 1 — see the PRD).

export type Event = typeof events.$inferSelect;

export interface EventCreate {
  orgId: string;
  userId: string;
  name: string;
  date?: string | null;
  venue?: string | null;
  notes?: string | null;
}

export interface EventUpdate {
  name?: string;
  date?: string | null;
  venue?: string | null;
  notes?: string | null;
}

export function createEventsRepo(db: Db) {
  async function getById(
    orgId: string,
    userId: string,
    id: string,
  ): Promise<Event | null> {
    const [row] = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.orgId, orgId),
          eq(events.userId, userId),
          eq(events.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  return {
    getById,

    async create(input: EventCreate): Promise<Event> {
      const [row] = await db
        .insert(events)
        .values({
          id: newId(),
          orgId: input.orgId,
          userId: input.userId,
          name: input.name,
          date: input.date ?? null,
          venue: input.venue ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      return row;
    },

    listByOwner(orgId: string, userId: string): Promise<Event[]> {
      return db
        .select()
        .from(events)
        .where(and(eq(events.orgId, orgId), eq(events.userId, userId)))
        .orderBy(desc(events.createdAt));
    },

    /** Count of non-archived (draft + active) events — what the plan gate caps. */
    async countOpenByOwner(orgId: string, userId: string): Promise<number> {
      const rows = await db
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.orgId, orgId),
            eq(events.userId, userId),
            ne(events.status, "archived"),
          ),
        );
      return rows.length;
    },

    getActive(orgId: string, userId: string): Promise<Event | undefined> {
      return db
        .select()
        .from(events)
        .where(
          and(
            eq(events.orgId, orgId),
            eq(events.userId, userId),
            eq(events.status, "active"),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
    },

    async update(
      orgId: string,
      userId: string,
      id: string,
      patch: EventUpdate,
    ): Promise<Event | null> {
      const set: Partial<typeof events.$inferInsert> = { updatedAt: now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.date !== undefined) set.date = patch.date;
      if (patch.venue !== undefined) set.venue = patch.venue;
      if (patch.notes !== undefined) set.notes = patch.notes;

      const [row] = await db
        .update(events)
        .set(set)
        .where(
          and(
            eq(events.orgId, orgId),
            eq(events.userId, userId),
            eq(events.id, id),
          ),
        )
        .returning();
      return row ?? null;
    },

    /** Set `id` active and archive any other currently-active event for this
     * owner — atomically, in one D1 batch (D1 has no interactive transactions).
     * Enforces the one-active-event-per-user invariant. Returns the activated
     * row, or null if it doesn't exist (callers should validate existence
     * first so the archive step never runs for a missing id). */
    async setActive(
      orgId: string,
      userId: string,
      id: string,
    ): Promise<Event | null> {
      const ts = now();
      await db.batch([
        db
          .update(events)
          .set({ status: "archived", updatedAt: ts })
          .where(
            and(
              eq(events.orgId, orgId),
              eq(events.userId, userId),
              eq(events.status, "active"),
              ne(events.id, id),
            ),
          ),
        db
          .update(events)
          .set({ status: "active", updatedAt: ts })
          .where(
            and(
              eq(events.orgId, orgId),
              eq(events.userId, userId),
              eq(events.id, id),
            ),
          ),
      ]);
      return getById(orgId, userId, id);
    },

    async setStatus(
      orgId: string,
      userId: string,
      id: string,
      status: EventStatus,
    ): Promise<Event | null> {
      const [row] = await db
        .update(events)
        .set({ status, updatedAt: now() })
        .where(
          and(
            eq(events.orgId, orgId),
            eq(events.userId, userId),
            eq(events.id, id),
          ),
        )
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, userId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(events)
        .where(
          and(
            eq(events.orgId, orgId),
            eq(events.userId, userId),
            eq(events.id, id),
          ),
        )
        .returning({ id: events.id });
      return rows.length > 0;
    },
  };
}

export type EventsRepo = ReturnType<typeof createEventsRepo>;
