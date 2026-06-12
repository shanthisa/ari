import { describe, expect, it } from "vitest";
import { createContactsService } from "../../workers/api/services/contacts-service";
import {
  NotFoundError,
  ValidationError,
} from "../../workers/api/services/errors";
import {
  fakeContact,
  fakeEvent,
  fakePhoto,
  fakeTag,
  mockContactsRepo,
  mockEventsRepo,
  mockTagsRepo,
  mockUploadsService,
} from "../helpers/mocks";

const ORG = "org_test_1";
const USER = "user_test_1";
const EVENT = "event_1";

function makeService() {
  const contactsRepo = mockContactsRepo();
  const eventsRepo = mockEventsRepo();
  const tagsRepo = mockTagsRepo();
  const uploads = mockUploadsService();
  const service = createContactsService({
    contactsRepo,
    eventsRepo,
    tagsRepo,
    uploads,
  });
  return { service, contactsRepo, eventsRepo, tagsRepo, uploads };
}

function imageUpload(overrides: Partial<{ contentType: string; size: number }> = {}) {
  return {
    contentType: overrides.contentType ?? "image/jpeg",
    size: overrides.size ?? 1000,
    body: new Uint8Array([1, 2, 3]),
  };
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
      contactsRepo.delete.mockResolvedValue(null);
      await expect(service.delete(ORG, USER, "nope")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it("delete returns the photo R2 keys for cleanup", async () => {
      const { service, contactsRepo } = makeService();
      contactsRepo.delete.mockResolvedValue(["k1", "k2"]);
      await expect(service.delete(ORG, USER, "contact_1")).resolves.toEqual([
        "k1",
        "k2",
      ]);
    });
  });

  describe("photos", () => {
    it("stores an image in R2 and indexes it", async () => {
      const { service, contactsRepo, uploads } = makeService();
      contactsRepo.getById.mockResolvedValue(fakeContact());
      uploads.photoKey.mockReturnValue("org_test_1/contact_1/x.jpg");
      contactsRepo.addPhoto.mockResolvedValue(fakePhoto());

      await service.addPhoto(ORG, USER, "contact_1", imageUpload());

      expect(uploads.put).toHaveBeenCalledWith(
        "org_test_1/contact_1/x.jpg",
        expect.anything(),
        "image/jpeg",
      );
      expect(contactsRepo.addPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ r2Key: "org_test_1/contact_1/x.jpg" }),
      );
    });

    it("404s adding a photo to a contact that isn't theirs", async () => {
      const { service, contactsRepo, uploads } = makeService();
      contactsRepo.getById.mockResolvedValue(null);
      await expect(
        service.addPhoto(ORG, USER, "nope", imageUpload()),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(uploads.put).not.toHaveBeenCalled();
    });

    it("rejects a non-image type", async () => {
      const { service, contactsRepo, uploads } = makeService();
      contactsRepo.getById.mockResolvedValue(fakeContact());
      await expect(
        service.addPhoto(ORG, USER, "contact_1", imageUpload({ contentType: "application/pdf" })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(uploads.put).not.toHaveBeenCalled();
    });

    it("rejects an oversized image", async () => {
      const { service, contactsRepo, uploads } = makeService();
      contactsRepo.getById.mockResolvedValue(fakeContact());
      await expect(
        service.addPhoto(ORG, USER, "contact_1", imageUpload({ size: 7 * 1024 * 1024 })),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(uploads.put).not.toHaveBeenCalled();
    });

    it("getPhoto 404s on a missing photo", async () => {
      const { service, contactsRepo } = makeService();
      contactsRepo.getPhoto.mockResolvedValue(null);
      await expect(
        service.getPhoto(ORG, USER, "contact_1", "nope"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("deletePhoto returns the R2 key, 404s when missing", async () => {
      const { service, contactsRepo } = makeService();
      contactsRepo.deletePhoto.mockResolvedValue(fakePhoto({ r2Key: "the/key.jpg" }));
      await expect(
        service.deletePhoto(ORG, USER, "contact_1", "photo_1"),
      ).resolves.toBe("the/key.jpg");

      contactsRepo.deletePhoto.mockResolvedValue(null);
      await expect(
        service.deletePhoto(ORG, USER, "contact_1", "nope"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
