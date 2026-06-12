import { describe, expect, it } from "vitest";
import { createContactsRepo } from "../../workers/api/repositories/contacts-repo";
import {
  makeContact,
  makeEvent,
  makeOrg,
  makeTag,
  testDb,
} from "../helpers/fixtures";

const USER = "user_test_1";

// The test D1 is shared across a file (no per-test reset), so each test uses a
// distinct org id to stay isolated.
async function seedEvent(orgId: string) {
  const db = testDb();
  await makeOrg(db, orgId);
  const event = await makeEvent(db, orgId, USER);
  return { db, event };
}

describe("contacts repo", () => {
  it("creates with hydrated tags", async () => {
    const { db, event } = await seedEvent("org_c_create");
    const t1 = await makeTag(db, "org_c_create", USER, "investor");
    const t2 = await makeTag(db, "org_c_create", USER, "hiring");

    const contact = await makeContact(db, "org_c_create", event.id, USER, {
      tagIds: [t1.id, t2.id],
    });

    expect(contact.id).toBeTruthy();
    expect(contact.tags.map((t) => t.name).sort()).toEqual([
      "hiring",
      "investor",
    ]);
  });

  it("is idempotent on a client-provided id", async () => {
    const { db, event } = await seedEvent("org_c_idem");
    const repo = createContactsRepo(db);

    const first = await repo.create({
      id: "fixed_id",
      orgId: "org_c_idem",
      userId: USER,
      eventId: event.id,
      name: "Ada",
    });
    const again = await repo.create({
      id: "fixed_id",
      orgId: "org_c_idem",
      userId: USER,
      eventId: event.id,
      name: "DIFFERENT",
    });

    expect(again.id).toBe(first.id);
    expect(again.name).toBe("Ada"); // unchanged — retry returned the existing row
    const list = await repo.listByEvent("org_c_idem", USER, event.id);
    expect(list).toHaveLength(1);
  });

  it("lists by event newest-first, scoped to the owner", async () => {
    const { db, event } = await seedEvent("org_c_list");
    const repo = createContactsRepo(db);
    await repo.create({
      orgId: "org_c_list",
      userId: USER,
      eventId: event.id,
      name: "Older",
      capturedAt: 1000,
    });
    await repo.create({
      orgId: "org_c_list",
      userId: USER,
      eventId: event.id,
      name: "Newer",
      capturedAt: 2000,
    });
    // another user's contact in the same event must not appear
    await repo.create({
      orgId: "org_c_list",
      userId: "user_other",
      eventId: event.id,
      name: "Theirs",
    });

    const list = await repo.listByEvent("org_c_list", USER, event.id);
    expect(list.map((c) => c.name)).toEqual(["Newer", "Older"]);
  });

  it("scopes getById by org and user", async () => {
    const { db, event } = await seedEvent("org_c_scope");
    const repo = createContactsRepo(db);
    const contact = await makeContact(db, "org_c_scope", event.id, USER);

    expect(await repo.getById("org_c_scope", USER, contact.id)).not.toBeNull();
    expect(
      await repo.getById("org_c_scope", "user_other", contact.id),
    ).toBeNull();
  });

  it("updates fields and replaces tags", async () => {
    const { db, event } = await seedEvent("org_c_upd");
    const repo = createContactsRepo(db);
    const t1 = await makeTag(db, "org_c_upd", USER, "a");
    const t2 = await makeTag(db, "org_c_upd", USER, "b");
    const contact = await makeContact(db, "org_c_upd", event.id, USER, {
      tagIds: [t1.id],
    });

    const updated = await repo.update(
      "org_c_upd",
      USER,
      contact.id,
      { name: "Renamed" },
      [t2.id],
    );
    expect(updated?.name).toBe("Renamed");
    expect(updated?.tags.map((t) => t.name)).toEqual(["b"]);
  });

  it("deletes the contact and its tag links", async () => {
    const { db, event } = await seedEvent("org_c_del");
    const repo = createContactsRepo(db);
    const tag = await makeTag(db, "org_c_del", USER, "investor");
    const contact = await makeContact(db, "org_c_del", event.id, USER, {
      tagIds: [tag.id],
    });

    expect(await repo.countByTag(tag.id)).toBe(1);
    expect(await repo.delete("org_c_del", "user_other", contact.id)).toBe(
      false,
    );
    expect(await repo.delete("org_c_del", USER, contact.id)).toBe(true);
    expect(await repo.getById("org_c_del", USER, contact.id)).toBeNull();
    expect(await repo.countByTag(tag.id)).toBe(0); // link removed too
  });

  it("detachTag removes a tag from all contacts", async () => {
    const { db, event } = await seedEvent("org_c_detach");
    const repo = createContactsRepo(db);
    const tag = await makeTag(db, "org_c_detach", USER, "shared");
    await makeContact(db, "org_c_detach", event.id, USER, {
      id: "c1",
      tagIds: [tag.id],
    });
    await makeContact(db, "org_c_detach", event.id, USER, {
      id: "c2",
      tagIds: [tag.id],
    });

    expect(await repo.countByTag(tag.id)).toBe(2);
    await repo.detachTag(tag.id);
    expect(await repo.countByTag(tag.id)).toBe(0);
    // contacts themselves survive
    expect(await repo.getById("org_c_detach", USER, "c1")).not.toBeNull();
  });
});
