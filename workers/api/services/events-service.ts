import { currentPeriod, getPlan } from "~/lib/plans";
import type { Event, EventsRepo } from "../repositories/events-repo";
import type { Tag, TagsRepo } from "../repositories/tags-repo";
import type { UsageRepo } from "../repositories/usage-repo";
import { NotFoundError, PlanLimitError } from "./errors";

// Services hold the business rules: plan gating, usage metering, "not found"
// semantics, the one-active-event-per-user invariant, and quick-tag curation.
// They depend on repositories (never on Drizzle directly) and are unit-tested
// with mocked repos.

/** Suggested cap on an event's one-tap quick tags (PRD open question #2). */
export const QUICK_TAG_CAP = 8;

export interface EventsServiceDeps {
  eventsRepo: EventsRepo;
  tagsRepo: TagsRepo;
  usageRepo: UsageRepo;
}

export function createEventsService({
  eventsRepo,
  tagsRepo,
  usageRepo,
}: EventsServiceDeps) {
  async function get(
    orgId: string,
    userId: string,
    id: string,
  ): Promise<Event> {
    const event = await eventsRepo.getById(orgId, userId, id);
    if (!event) throw new NotFoundError(`event ${id} not found`);
    return event;
  }

  return {
    list(orgId: string, userId: string): Promise<Event[]> {
      return eventsRepo.listByOwner(orgId, userId);
    },

    get,

    /** The user's currently-active event, if any. */
    getActive(orgId: string, userId: string): Promise<Event | undefined> {
      return eventsRepo.getActive(orgId, userId);
    },

    /** Gated on the org's plan: each tier caps the number of open (non-archived)
     * events. Also bumps the monthly usage counter so the meter is live. New
     * events start in `draft`. */
    async create(
      orgId: string,
      userId: string,
      plan: string,
      input: {
        name: string;
        date?: string | null;
        venue?: string | null;
        notes?: string | null;
      },
    ): Promise<Event> {
      const limits = getPlan(plan);
      const open = await eventsRepo.countOpenByOwner(orgId, userId);
      if (open >= limits.maxItems) {
        throw new PlanLimitError(
          `the ${plan} plan allows ${limits.maxItems} open events — archive one or upgrade`,
        );
      }
      const event = await eventsRepo.create({
        orgId,
        userId,
        name: input.name,
        date: input.date ?? null,
        venue: input.venue ?? null,
        notes: input.notes ?? null,
      });
      await usageRepo.increment(orgId, currentPeriod());
      return event;
    },

    async update(
      orgId: string,
      userId: string,
      id: string,
      patch: {
        name?: string;
        date?: string | null;
        venue?: string | null;
        notes?: string | null;
      },
    ): Promise<Event> {
      const updated = await eventsRepo.update(orgId, userId, id, patch);
      if (!updated) throw new NotFoundError(`event ${id} not found`);
      return updated;
    },

    /** Make this event the user's active one, archiving any other active event.
     * Validates existence first so a missing id never archives the current
     * active event as a side effect. */
    async activate(orgId: string, userId: string, id: string): Promise<Event> {
      await get(orgId, userId, id);
      const activated = await eventsRepo.setActive(orgId, userId, id);
      if (!activated) throw new NotFoundError(`event ${id} not found`);
      return activated;
    },

    async archive(orgId: string, userId: string, id: string): Promise<Event> {
      await get(orgId, userId, id);
      const archived = await eventsRepo.setStatus(
        orgId,
        userId,
        id,
        "archived",
      );
      if (!archived) throw new NotFoundError(`event ${id} not found`);
      return archived;
    },

    async delete(orgId: string, userId: string, id: string): Promise<void> {
      const deleted = await eventsRepo.delete(orgId, userId, id);
      if (!deleted) throw new NotFoundError(`event ${id} not found`);
    },

    async getQuickTags(
      orgId: string,
      userId: string,
      id: string,
    ): Promise<Tag[]> {
      await get(orgId, userId, id); // 404 if it isn't theirs
      return eventsRepo.getQuickTags(id);
    },

    /** Curate the event's quick tags: keep only the user's own tags, preserve
     * the given order, and cap the count. Returns the resulting tags. */
    async setQuickTags(
      orgId: string,
      userId: string,
      id: string,
      tagIds: string[],
    ): Promise<Tag[]> {
      await get(orgId, userId, id); // 404 if it isn't theirs
      const owned = new Set(
        (await tagsRepo.listByOwner(orgId, userId)).map((t) => t.id),
      );
      const curated = tagIds
        .filter((tagId) => owned.has(tagId))
        .slice(0, QUICK_TAG_CAP);
      await eventsRepo.setQuickTags(id, curated);
      return eventsRepo.getQuickTags(id);
    },
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
