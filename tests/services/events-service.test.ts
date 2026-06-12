import { describe, expect, it } from "vitest";
import { createEventsService } from "../../workers/api/services/events-service";
import {
  NotFoundError,
  PlanLimitError,
} from "../../workers/api/services/errors";
import { fakeEvent, mockEventsRepo, mockUsageRepo } from "../helpers/mocks";

const ORG = "org_test_1";
const USER = "user_test_1";

function makeService() {
  const eventsRepo = mockEventsRepo();
  const usageRepo = mockUsageRepo();
  const service = createEventsService({ eventsRepo, usageRepo });
  return { service, eventsRepo, usageRepo };
}

describe("events service", () => {
  describe("create", () => {
    it("creates and bumps the usage counter when under the plan limit", async () => {
      const { service, eventsRepo, usageRepo } = makeService();
      eventsRepo.countOpenByOwner.mockResolvedValue(2);
      eventsRepo.create.mockResolvedValue(fakeEvent());

      await service.create(ORG, USER, "free", { name: "RailsConf" });

      expect(eventsRepo.create).toHaveBeenCalledWith({
        orgId: ORG,
        userId: USER,
        name: "RailsConf",
        date: null,
        venue: null,
        notes: null,
      });
      expect(usageRepo.increment).toHaveBeenCalledWith(ORG, expect.any(String));
    });

    it("rejects with PlanLimitError at the free-tier cap on open events", async () => {
      const { service, eventsRepo, usageRepo } = makeService();
      eventsRepo.countOpenByOwner.mockResolvedValue(3); // free cap

      await expect(
        service.create(ORG, USER, "free", { name: "One too many" }),
      ).rejects.toBeInstanceOf(PlanLimitError);
      expect(eventsRepo.create).not.toHaveBeenCalled();
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });
  });

  describe("activate", () => {
    it("validates existence before activating", async () => {
      const { service, eventsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(null);

      await expect(service.activate(ORG, USER, "nope")).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(eventsRepo.setActive).not.toHaveBeenCalled();
    });

    it("activates an existing event", async () => {
      const { service, eventsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(fakeEvent());
      eventsRepo.setActive.mockResolvedValue(fakeEvent({ status: "active" }));

      const result = await service.activate(ORG, USER, "event_1");

      expect(result.status).toBe("active");
      expect(eventsRepo.setActive).toHaveBeenCalledWith(ORG, USER, "event_1");
    });
  });

  describe("archive", () => {
    it("archives an existing event", async () => {
      const { service, eventsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(fakeEvent({ status: "active" }));
      eventsRepo.setStatus.mockResolvedValue(fakeEvent({ status: "archived" }));

      const result = await service.archive(ORG, USER, "event_1");

      expect(result.status).toBe("archived");
      expect(eventsRepo.setStatus).toHaveBeenCalledWith(
        ORG,
        USER,
        "event_1",
        "archived",
      );
    });
  });

  it("get throws NotFoundError for missing events", async () => {
    const { service, eventsRepo } = makeService();
    eventsRepo.getById.mockResolvedValue(null);

    await expect(service.get(ORG, USER, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("update throws NotFoundError when the repo misses", async () => {
    const { service, eventsRepo } = makeService();
    eventsRepo.update.mockResolvedValue(null);

    await expect(
      service.update(ORG, USER, "nope", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete throws NotFoundError when nothing was deleted", async () => {
    const { service, eventsRepo } = makeService();
    eventsRepo.delete.mockResolvedValue(false);

    await expect(service.delete(ORG, USER, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
