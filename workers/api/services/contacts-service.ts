import type {
  ContactWithTags,
  ContactsRepo,
} from "../repositories/contacts-repo";
import type { EventsRepo } from "../repositories/events-repo";
import type { TagsRepo } from "../repositories/tags-repo";
import { NotFoundError } from "./errors";

// Business rules for contacts: the contact must belong to one of the user's own
// events, an empty name softly becomes "Unknown" (PRD F2.4 — a photo-only
// capture is never blocked), and only the user's own tags can be attached.

export interface ContactsServiceDeps {
  contactsRepo: ContactsRepo;
  eventsRepo: EventsRepo;
  tagsRepo: TagsRepo;
}

export interface ContactInput {
  id?: string;
  name?: string | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  capturedAt?: number;
  tagIds?: string[];
}

export function createContactsService({
  contactsRepo,
  eventsRepo,
  tagsRepo,
}: ContactsServiceDeps) {
  async function requireEvent(orgId: string, userId: string, eventId: string) {
    const event = await eventsRepo.getById(orgId, userId, eventId);
    if (!event) throw new NotFoundError(`event ${eventId} not found`);
  }

  /** Keep only tag ids the user actually owns — never attach another user's tag. */
  async function ownTagIds(
    orgId: string,
    userId: string,
    tagIds: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (tagIds === undefined) return undefined;
    if (tagIds.length === 0) return [];
    const owned = new Set(
      (await tagsRepo.listByOwner(orgId, userId)).map((t) => t.id),
    );
    return tagIds.filter((id) => owned.has(id));
  }

  function cleanName(name: string | null | undefined): string {
    return (name ?? "").trim() || "Unknown";
  }

  async function get(
    orgId: string,
    userId: string,
    id: string,
  ): Promise<ContactWithTags> {
    const contact = await contactsRepo.getById(orgId, userId, id);
    if (!contact) throw new NotFoundError(`contact ${id} not found`);
    return contact;
  }

  return {
    async list(
      orgId: string,
      userId: string,
      eventId: string,
    ): Promise<ContactWithTags[]> {
      await requireEvent(orgId, userId, eventId);
      return contactsRepo.listByEvent(orgId, userId, eventId);
    },

    get,

    async create(
      orgId: string,
      userId: string,
      eventId: string,
      input: ContactInput,
    ): Promise<ContactWithTags> {
      await requireEvent(orgId, userId, eventId);
      return contactsRepo.create({
        id: input.id,
        orgId,
        userId,
        eventId,
        name: cleanName(input.name),
        note: input.note ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracy: input.accuracy ?? null,
        capturedAt: input.capturedAt,
        tagIds: await ownTagIds(orgId, userId, input.tagIds),
      });
    },

    async update(
      orgId: string,
      userId: string,
      id: string,
      input: {
        name?: string | null;
        note?: string | null;
        tagIds?: string[];
      },
    ): Promise<ContactWithTags> {
      await get(orgId, userId, id); // 404 if it isn't theirs
      const patch: { name?: string; note?: string | null } = {};
      if (input.name !== undefined) patch.name = cleanName(input.name);
      if (input.note !== undefined) patch.note = input.note;
      const updated = await contactsRepo.update(
        orgId,
        userId,
        id,
        patch,
        await ownTagIds(orgId, userId, input.tagIds),
      );
      if (!updated) throw new NotFoundError(`contact ${id} not found`);
      return updated;
    },

    async delete(orgId: string, userId: string, id: string): Promise<void> {
      const deleted = await contactsRepo.delete(orgId, userId, id);
      if (!deleted) throw new NotFoundError(`contact ${id} not found`);
    },
  };
}

export type ContactsService = ReturnType<typeof createContactsService>;
