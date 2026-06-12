import { describe, expect, it } from "vitest";
import { createTagsRepo } from "../../workers/api/repositories/tags-repo";
import { makeOrg, makeTag, testDb } from "../helpers/fixtures";

const USER = "user_test_1";

describe("tags repo", () => {
  it("creates with a generated id, owned by org+user", async () => {
    const db = testDb();
    await makeOrg(db);
    const tag = await makeTag(db, "org_test_1");

    expect(tag.id).toBeTruthy();
    expect(tag.name).toBe("investor");
    expect(tag.userId).toBe(USER);
  });

  it("scopes getById by org and user", async () => {
    const db = testDb();
    const repo = createTagsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const tag = await makeTag(db, "org_a", USER);

    expect(await repo.getById("org_a", USER, tag.id)).not.toBeNull();
    expect(await repo.getById("org_b", USER, tag.id)).toBeNull();
    expect(await repo.getById("org_a", "user_other", tag.id)).toBeNull();
  });

  it("lists per owner, alphabetically", async () => {
    const db = testDb();
    const repo = createTagsRepo(db);
    await makeOrg(db, "org_list");
    await makeTag(db, "org_list", USER, "zeta");
    await makeTag(db, "org_list", USER, "alpha");
    await makeTag(db, "org_list", "user_other", "theirs");

    const list = await repo.listByOwner("org_list", USER);
    expect(list.map((t) => t.name)).toEqual(["alpha", "zeta"]);
  });

  it("enforces name uniqueness per owner at the DB level", async () => {
    const db = testDb();
    await makeOrg(db, "org_unq");
    await makeTag(db, "org_unq", USER, "investor");

    await expect(makeTag(db, "org_unq", USER, "investor")).rejects.toThrow();
    // Same name is fine for a different user.
    await expect(
      makeTag(db, "org_unq", "user_other", "investor"),
    ).resolves.toBeTruthy();
  });

  it("finds by exact name within the owner scope", async () => {
    const db = testDb();
    const repo = createTagsRepo(db);
    await makeOrg(db, "org_find");
    await makeTag(db, "org_find", USER, "hiring");

    expect(await repo.findByName("org_find", USER, "hiring")).not.toBeNull();
    expect(await repo.findByName("org_find", USER, "nope")).toBeNull();
    expect(
      await repo.findByName("org_find", "user_other", "hiring"),
    ).toBeNull();
  });

  it("renames and deletes scoped by owner", async () => {
    const db = testDb();
    const repo = createTagsRepo(db);
    await makeOrg(db, "org_rd");
    const tag = await makeTag(db, "org_rd", USER, "old");

    const renamed = await repo.rename("org_rd", USER, tag.id, "new");
    expect(renamed?.name).toBe("new");

    expect(await repo.delete("org_rd", "user_other", tag.id)).toBe(false);
    expect(await repo.delete("org_rd", USER, tag.id)).toBe(true);
    expect(await repo.getById("org_rd", USER, tag.id)).toBeNull();
  });
});
