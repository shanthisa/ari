import { and, asc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { tags } from "../db/schema";

// The repository is the ONLY layer that touches Drizzle/D1. Every query is
// scoped by `orgId` AND `userId` so a user only ever sees their own tags.

export type Tag = typeof tags.$inferSelect;

export interface TagCreate {
  orgId: string;
  userId: string;
  name: string;
}

export function createTagsRepo(db: Db) {
  return {
    async create(input: TagCreate): Promise<Tag> {
      const [row] = await db
        .insert(tags)
        .values({
          id: newId(),
          orgId: input.orgId,
          userId: input.userId,
          name: input.name,
        })
        .returning();
      return row;
    },

    async getById(
      orgId: string,
      userId: string,
      id: string,
    ): Promise<Tag | null> {
      const [row] = await db
        .select()
        .from(tags)
        .where(
          and(eq(tags.orgId, orgId), eq(tags.userId, userId), eq(tags.id, id)),
        )
        .limit(1);
      return row ?? null;
    },

    /** Look up by exact name for the uniqueness check. */
    async findByName(
      orgId: string,
      userId: string,
      name: string,
    ): Promise<Tag | null> {
      const [row] = await db
        .select()
        .from(tags)
        .where(
          and(
            eq(tags.orgId, orgId),
            eq(tags.userId, userId),
            eq(tags.name, name),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    listByOwner(orgId: string, userId: string): Promise<Tag[]> {
      return db
        .select()
        .from(tags)
        .where(and(eq(tags.orgId, orgId), eq(tags.userId, userId)))
        .orderBy(asc(tags.name));
    },

    async rename(
      orgId: string,
      userId: string,
      id: string,
      name: string,
    ): Promise<Tag | null> {
      const [row] = await db
        .update(tags)
        .set({ name })
        .where(
          and(eq(tags.orgId, orgId), eq(tags.userId, userId), eq(tags.id, id)),
        )
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, userId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(tags)
        .where(
          and(eq(tags.orgId, orgId), eq(tags.userId, userId), eq(tags.id, id)),
        )
        .returning({ id: tags.id });
      return rows.length > 0;
    },
  };
}

export type TagsRepo = ReturnType<typeof createTagsRepo>;
