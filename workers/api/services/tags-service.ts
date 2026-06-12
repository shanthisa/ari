import type { ContactsRepo } from "../repositories/contacts-repo";
import type { EventsRepo } from "../repositories/events-repo";
import type { Tag, TagsRepo } from "../repositories/tags-repo";
import { ConflictError, NotFoundError } from "./errors";

// Services hold the business rules. For tags that's name uniqueness per user
// (a friendly ConflictError, with the DB unique index as the backstop), "not
// found" semantics, and detaching from contacts and event quick-tags on delete.
// Unit-tested with mocked repos.

export interface TagsServiceDeps {
  tagsRepo: TagsRepo;
  contactsRepo: ContactsRepo;
  eventsRepo: EventsRepo;
}

export function createTagsService({
  tagsRepo,
  contactsRepo,
  eventsRepo,
}: TagsServiceDeps) {
  async function get(
    orgId: string,
    userId: string,
    id: string,
  ): Promise<Tag> {
    const tag = await tagsRepo.getById(orgId, userId, id);
    if (!tag) throw new NotFoundError(`tag ${id} not found`);
    return tag;
  }

  return {
    list(orgId: string, userId: string): Promise<Tag[]> {
      return tagsRepo.listByOwner(orgId, userId);
    },

    get,

    async create(
      orgId: string,
      userId: string,
      input: { name: string },
    ): Promise<Tag> {
      const existing = await tagsRepo.findByName(orgId, userId, input.name);
      if (existing) {
        throw new ConflictError(`you already have a tag named "${input.name}"`);
      }
      return tagsRepo.create({ orgId, userId, name: input.name });
    },

    async rename(
      orgId: string,
      userId: string,
      id: string,
      name: string,
    ): Promise<Tag> {
      await get(orgId, userId, id); // 404 if it isn't theirs
      const clash = await tagsRepo.findByName(orgId, userId, name);
      if (clash && clash.id !== id) {
        throw new ConflictError(`you already have a tag named "${name}"`);
      }
      const renamed = await tagsRepo.rename(orgId, userId, id, name);
      if (!renamed) throw new NotFoundError(`tag ${id} not found`);
      return renamed;
    },

    /** Delete a tag, detaching it from every contact first. Returns the number
     * of contacts that had the tag (for the confirmation dialog). */
    async delete(
      orgId: string,
      userId: string,
      id: string,
    ): Promise<{ affectedContacts: number }> {
      await get(orgId, userId, id); // 404 if it isn't theirs
      const affectedContacts = await contactsRepo.countByTag(id);
      await contactsRepo.detachTag(id);
      await eventsRepo.removeTagFromQuickTags(id);
      const deleted = await tagsRepo.delete(orgId, userId, id);
      if (!deleted) throw new NotFoundError(`tag ${id} not found`);
      return { affectedContacts };
    },
  };
}

export type TagsService = ReturnType<typeof createTagsService>;
