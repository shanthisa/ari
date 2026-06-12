import { currentPeriod, getPlan } from "~/lib/plans";
import type { Event, EventsRepo } from "../repositories/events-repo";
import type { UsageRepo } from "../repositories/usage-repo";
import { NotFoundError, PlanLimitError } from "./errors";

// Services hold the business rules: plan gating, usage metering, "not found"
// semantics, and the one-active-event-per-user invariant. They depend on
// repositories (never on Drizzle directly) and are unit-tested with mocked repos.

export interface EventsServiceDeps {
  eventsRepo: EventsRepo;
  usageRepo: UsageRepo;
}

export function createEventsService({
  eventsRepo,
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
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
