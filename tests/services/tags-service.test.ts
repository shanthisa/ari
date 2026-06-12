import { describe, expect, it } from "vitest";
import {
  ConflictError,
  NotFoundError,
} from "../../workers/api/services/errors";
import { createTagsService } from "../../workers/api/services/tags-service";
import { fakeTag, mockTagsRepo } from "../helpers/mocks";

const ORG = "org_test_1";
const USER = "user_test_1";

function makeService() {
  const tagsRepo = mockTagsRepo();
  const service = createTagsService({ tagsRepo });
  return { service, tagsRepo };
}

describe("tags service", () => {
  describe("create", () => {
    it("creates when the name is free", async () => {
      const { service, tagsRepo } = makeService();
      tagsRepo.findByName.mockResolvedValue(null);
      tagsRepo.create.mockResolvedValue(fakeTag());

      await service.create(ORG, USER, { name: "investor" });

      expect(tagsRepo.create).toHaveBeenCalledWith({
        orgId: ORG,
        userId: USER,
        name: "investor",
      });
    });

    it("rejects a duplicate name with ConflictError", async () => {
      const { service, tagsRepo } = makeService();
      tagsRepo.findByName.mockResolvedValue(fakeTag());

      await expect(
        service.create(ORG, USER, { name: "investor" }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(tagsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("rename", () => {
    it("renames when the new name is free", async () => {
      const { service, tagsRepo } = makeService();
      tagsRepo.getById.mockResolvedValue(fakeTag());
      tagsRepo.findByName.mockResolvedValue(null);
      tagsRepo.rename.mockResolvedValue(fakeTag({ name: "hiring" }));

      const result = await service.rename(ORG, USER, "tag_1", "hiring");
      expect(result.name).toBe("hiring");
    });

    it("allows renaming a tag to its own current name", async () => {
      const { service, tagsRepo } = makeService();
      tagsRepo.getById.mockResolvedValue(fakeTag({ id: "tag_1" }));
      // findByName returns the same tag — should NOT be treated as a clash.
      tagsRepo.findByName.mockResolvedValue(fakeTag({ id: "tag_1" }));
      tagsRepo.rename.mockResolvedValue(fakeTag());

      await expect(
        service.rename(ORG, USER, "tag_1", "investor"),
      ).resolves.toBeTruthy();
    });

    it("rejects a clash with a different tag", async () => {
      const { service, tagsRepo } = makeService();
      tagsRepo.getById.mockResolvedValue(fakeTag({ id: "tag_1" }));
      tagsRepo.findByName.mockResolvedValue(fakeTag({ id: "tag_2" }));

      await expect(
        service.rename(ORG, USER, "tag_1", "hiring"),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(tagsRepo.rename).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when the tag isn't theirs", async () => {
      const { service, tagsRepo } = makeService();
      tagsRepo.getById.mockResolvedValue(null);

      await expect(
        service.rename(ORG, USER, "nope", "x"),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("delete throws NotFoundError when nothing was deleted", async () => {
    const { service, tagsRepo } = makeService();
    tagsRepo.delete.mockResolvedValue(false);

    await expect(service.delete(ORG, USER, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
