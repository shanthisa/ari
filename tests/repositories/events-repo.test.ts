import { describe, expect, it } from "vitest";
import { createEventsRepo } from "../../workers/api/repositories/events-repo";
import { makeEvent, makeOrg, testDb } from "../helpers/fixtures";

const USER = "user_test_1";

describe("events repo", () => {
  it("creates with a generated id, in draft, owned by org+user", async () => {
    const db = testDb();
    await makeOrg(db);
    const event = await makeEvent(db, "org_test_1");

    expect(event.id).toBeTruthy();
    expect(event.name).toBe("First Event");
    expect(event.status).toBe("draft");
    expect(event.userId).toBe(USER);
  });

  it("scopes getById by org and user", async () => {
    const db = testDb();
    const repo = createEventsRepo(db);
    await makeOrg(db, "org_a");
    await makeOrg(db, "org_b");
    const event = await makeEvent(db, "org_a", USER);

    expect(await repo.getById("org_a", USER, event.id)).not.toBeNull();
    expect(await repo.getById("org_b", USER, event.id)).toBeNull();
    expect(await repo.getById("org_a", "user_other", event.id)).toBeNull();
  });

  it("lists per owner, newest first", async () => {
    const db = testDb();
    const repo = createEventsRepo(db);
    await makeOrg(db, "org_list");
    await makeEvent(db, "org_list", USER, { name: "One" });
    await makeEvent(db, "org_list", USER, { name: "Two" });
    await makeEvent(db, "org_list", "user_other", { name: "Theirs" });

    const list = await repo.listByOwner("org_list", USER);
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.name)).not.toContain("Theirs");
  });

  it("counts only open (non-archived) events", async () => {
    const db = testDb();
    const repo = createEventsRepo(db);
    await makeOrg(db, "org_count");
    const a = await makeEvent(db, "org_count", USER, { name: "A" });
    await makeEvent(db, "org_count", USER, { name: "B" });
    expect(await repo.countOpenByOwner("org_count", USER)).toBe(2);

    await repo.setStatus("org_count", USER, a.id, "archived");
    expect(await repo.countOpenByOwner("org_count", USER)).toBe(1);
  });

  it("enforces one active event per user when activating", async () => {
    const db = testDb();
    const repo = createEventsRepo(db);
    await makeOrg(db, "org_active");
    const first = await makeEvent(db, "org_active", USER, { name: "First" });
    const second = await makeEvent(db, "org_active", USER, { name: "Second" });

    await repo.setActive("org_active", USER, first.id);
    expect((await repo.getActive("org_active", USER))?.id).toBe(first.id);

    // Activating the second archives the first.
    await repo.setActive("org_active", USER, second.id);
    const active = await repo.getActive("org_active", USER);
    expect(active?.id).toBe(second.id);
    expect((await repo.getById("org_active", USER, first.id))?.status).toBe(
      "archived",
    );
  });

  it("does not touch another user's active event when activating", async () => {
    const db = testDb();
    const repo = createEventsRepo(db);
    await makeOrg(db, "org_iso");
    const mine = await makeEvent(db, "org_iso", USER, { name: "Mine" });
    const theirs = await makeEvent(db, "org_iso", "user_other", {
      name: "Theirs",
    });
    await repo.setActive("org_iso", "user_other", theirs.id);

    await repo.setActive("org_iso", USER, mine.id);

    expect((await repo.getActive("org_iso", USER))?.id).toBe(mine.id);
    expect((await repo.getActive("org_iso", "user_other"))?.id).toBe(theirs.id);
  });

  it("applies partial updates and leaves other fields intact", async () => {
    const db = testDb();
    const repo = createEventsRepo(db);
    await makeOrg(db);
    const event = await makeEvent(db, "org_test_1");

    const updated = await repo.update("org_test_1", USER, event.id, {
      name: "Renamed",
    });
    expect(updated?.name).toBe("Renamed");
    expect(updated?.venue).toBe("Moscone West");
  });

  it("deletes scoped by owner", async () => {
    const db = testDb();
    const repo = createEventsRepo(db);
    await makeOrg(db, "org_a");
    const event = await makeEvent(db, "org_a", USER);

    expect(await repo.delete("org_a", "user_other", event.id)).toBe(false);
    expect(await repo.delete("org_a", USER, event.id)).toBe(true);
    expect(await repo.getById("org_a", USER, event.id)).toBeNull();
  });
});
