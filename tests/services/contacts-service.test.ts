import { describe, expect, it } from "vitest";
import { createContactsService } from "../../workers/api/services/contacts-service";
import { NotFoundError } from "../../workers/api/services/errors";
import {
  fakeContact,
  fakeEvent,
  fakeTag,
  mockContactsRepo,
  mockEventsRepo,
  mockTagsRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";
const USER = "user_test_1";
const EVENT = "event_1";

function makeService() {
  const contactsRepo = mockContactsRepo();
  const eventsRepo = mockEventsRepo();
  const tagsRepo = mockTagsRepo();
  const service = createContactsService({ contactsRepo, eventsRepo, tagsRepo });
  return { service, contactsRepo, eventsRepo, tagsRepo };
}

describe("contacts service", () => {
  describe("create", () => {
    it("requires the event to belong to the user", async () => {
      const { service, eventsRepo, contactsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(null);

      await expect(
        service.create(ORG, USER, EVENT, { name: "Ada" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(contactsRepo.create).not.toHaveBeenCalled();
    });

    it("falls back to \"Unknown\" for a blank name", async () => {
      const { service, eventsRepo, contactsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(fakeEvent());
      contactsRepo.create.mockResolvedValue(fakeContact());

      await service.create(ORG, USER, EVENT, { name: "   " });

      expect(contactsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Unknown" }),
      );
    });

    it("keeps only the user's own tag ids", async () => {
      const { service, eventsRepo, contactsRepo, tagsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(fakeEvent());
      tagsRepo.listByOwner.mockResolvedValue([
        fakeTag({ id: "mine_1" }),
        fakeTag({ id: "mine_2" }),
      ]);
      contactsRepo.create.mockResolvedValue(fakeContact());

      await service.create(ORG, USER, EVENT, {
        name: "Ada",
        tagIds: ["mine_1", "someone_elses", "mine_2"],
      });

      expect(contactsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tagIds: ["mine_1", "mine_2"] }),
      );
    });

    it("passes the client id through for idempotency", async () => {
      const { service, eventsRepo, contactsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(fakeEvent());
      contactsRepo.create.mockResolvedValue(fakeContact());

      await service.create(ORG, USER, EVENT, { id: "client_1", name: "Ada" });

      expect(contactsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ id: "client_1" }),
      );
    });
  });

  describe("list", () => {
    it("404s when the event isn't the user's", async () => {
      const { service, eventsRepo } = makeService();
      eventsRepo.getById.mockResolvedValue(null);

      await expect(service.list(ORG, USER, EVENT)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe("get / update / delete", () => {
    it("get 404s on a missing contact", async () => {
      const { service, contactsRepo } = makeService();
      contactsRepo.getById.mockResolvedValue(null);
      await expect(service.get(ORG, USER, "nope")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("update 404s on a missing contact", async () => {
      const { service, contactsRepo } = makeService();
      contactsRepo.getById.mockResolvedValue(null);
      await expect(
        service.update(ORG, USER, "nope", { name: "X" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("update applies the Unknown fallback too", async () => {
      const { service, contactsRepo } = makeService();
      contactsRepo.getById.mockResolvedValue(fakeContact());
      contactsRepo.update.mockResolvedValue(fakeContact({ name: "Unknown" }));

      await service.update(ORG, USER, "contact_1", { name: "" });
      expect(contactsRepo.update).toHaveBeenCalledWith(
        ORG,
        USER,
        "contact_1",
        { name: "Unknown" },
        undefined,
      );
    });

    it("delete 404s when nothing was deleted", async () => {
      const { service, contactsRepo } = makeService();
      contactsRepo.delete.mockResolvedValue(false);
      await expect(service.delete(ORG, USER, "nope")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
