import type { Tag, TagsRepo } from "../repositories/tags-repo";
import { ConflictError, NotFoundError } from "./errors";

// Services hold the business rules. For tags that's name uniqueness per user
// (a friendly ConflictError, with the DB unique index as the backstop) and
// "not found" semantics. Unit-tested with a mocked repo.

export interface TagsServiceDeps {
  tagsRepo: TagsRepo;
}

export function createTagsService({ tagsRepo }: TagsServiceDeps) {
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

    /** Delete a tag. In Phase 3 this will also detach it from contacts and
     * report the affected count; for now there are no contacts to update. */
    async delete(orgId: string, userId: string, id: string): Promise<void> {
      const deleted = await tagsRepo.delete(orgId, userId, id);
      if (!deleted) throw new NotFoundError(`tag ${id} not found`);
    },
  };
}

export type TagsService = ReturnType<typeof createTagsService>;
