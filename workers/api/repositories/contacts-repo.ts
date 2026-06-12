import { and, desc, eq, inArray } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { contactTags, contacts, tags } from "../db/schema";
import { now } from "../db/schema/helpers";
import type { Tag } from "./tags-repo";

// The repository is the ONLY layer that touches Drizzle/D1. Every query is
// scoped by `orgId` AND `userId`. Contacts hydrate their tags so the UI can
// render labels without a second round-trip.

export type Contact = typeof contacts.$inferSelect;
export type ContactWithTags = Contact & { tags: Tag[] };

export interface ContactCreate {
  /** Client-generated id for idempotent retries; falls back to a server id. */
  id?: string;
  orgId: string;
  userId: string;
  eventId: string;
  name: string;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  capturedAt?: number;
  tagIds?: string[];
}

export interface ContactUpdate {
  name?: string;
  note?: string | null;
}

export function createContactsRepo(db: Db) {
  /** Group the tags for a set of contact ids. */
  async function tagsFor(ids: string[]): Promise<Map<string, Tag[]>> {
    const map = new Map<string, Tag[]>();
    if (ids.length === 0) return map;
    const rows = await db
      .select({ contactId: contactTags.contactId, tag: tags })
      .from(contactTags)
      .innerJoin(tags, eq(contactTags.tagId, tags.id))
      .where(inArray(contactTags.contactId, ids));
    for (const { contactId, tag } of rows) {
      const list = map.get(contactId) ?? [];
      list.push(tag);
      map.set(contactId, list);
    }
    return map;
  }

  async function hydrate(rows: Contact[]): Promise<ContactWithTags[]> {
    const byContact = await tagsFor(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, tags: byContact.get(r.id) ?? [] }));
  }

  async function getById(
    orgId: string,
    userId: string,
    id: string,
  ): Promise<ContactWithTags | null> {
    const [row] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.userId, userId),
          eq(contacts.id, id),
        ),
      )
      .limit(1);
    if (!row) return null;
    return (await hydrate([row]))[0];
  }

  async function setTags(contactId: string, tagIds: string[]): Promise<void> {
    await db.delete(contactTags).where(eq(contactTags.contactId, contactId));
    if (tagIds.length > 0) {
      await db
        .insert(contactTags)
        .values(tagIds.map((tagId) => ({ contactId, tagId })));
    }
  }

  return {
    getById,

    listByEvent(
      orgId: string,
      userId: string,
      eventId: string,
    ): Promise<ContactWithTags[]> {
      return db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            eq(contacts.userId, userId),
            eq(contacts.eventId, eventId),
          ),
        )
        .orderBy(desc(contacts.capturedAt))
        .then(hydrate);
    },

    /** Idempotent on the (client-provided) id: a retry with the same id returns
     * the existing contact untouched rather than creating a duplicate. */
    async create(input: ContactCreate): Promise<ContactWithTags> {
      const id = input.id ?? newId();
      const existing = await getById(input.orgId, input.userId, id);
      if (existing) return existing;

      await db.insert(contacts).values({
        id,
        orgId: input.orgId,
        userId: input.userId,
        eventId: input.eventId,
        name: input.name,
        note: input.note ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracy: input.accuracy ?? null,
        capturedAt: input.capturedAt ?? now(),
      });
      if (input.tagIds && input.tagIds.length > 0) {
        await setTags(id, input.tagIds);
      }
      return (await getById(input.orgId, input.userId, id))!;
    },

    async update(
      orgId: string,
      userId: string,
      id: string,
      patch: ContactUpdate,
      tagIds?: string[],
    ): Promise<ContactWithTags | null> {
      const set: Partial<typeof contacts.$inferInsert> = { updatedAt: now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.note !== undefined) set.note = patch.note;

      const [row] = await db
        .update(contacts)
        .set(set)
        .where(
          and(
            eq(contacts.orgId, orgId),
            eq(contacts.userId, userId),
            eq(contacts.id, id),
          ),
        )
        .returning();
      if (!row) return null;
      if (tagIds !== undefined) await setTags(id, tagIds);
      return getById(orgId, userId, id);
    },

    async delete(orgId: string, userId: string, id: string): Promise<boolean> {
      const [row] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            eq(contacts.userId, userId),
            eq(contacts.id, id),
          ),
        )
        .limit(1);
      if (!row) return false;
      // Remove join rows then the contact, atomically (D1 has no interactive tx).
      await db.batch([
        db.delete(contactTags).where(eq(contactTags.contactId, id)),
        db.delete(contacts).where(eq(contacts.id, id)),
      ]);
      return true;
    },

    /** How many of this user's contacts carry a given tag (for the tag-delete
     * confirmation). The tag id is already owner-scoped, so no extra join. */
    async countByTag(tagId: string): Promise<number> {
      const rows = await db
        .select({ contactId: contactTags.contactId })
        .from(contactTags)
        .where(eq(contactTags.tagId, tagId));
      return rows.length;
    },

    /** Detach a tag from every contact (called when the tag is deleted). */
    async detachTag(tagId: string): Promise<void> {
      await db.delete(contactTags).where(eq(contactTags.tagId, tagId));
    },
  };
}

export type ContactsRepo = ReturnType<typeof createContactsRepo>;
