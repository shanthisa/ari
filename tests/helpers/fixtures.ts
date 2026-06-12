import { env } from "cloudflare:test";
import { getDb, type Db } from "../../workers/api/db/client";
import {
  createEventsRepo,
  type Event,
} from "../../workers/api/repositories/events-repo";
import {
  createContactsRepo,
  type ContactWithTags,
} from "../../workers/api/repositories/contacts-repo";
import { createMembershipsRepo } from "../../workers/api/repositories/memberships-repo";
import {
  createTagsRepo,
  type Tag,
} from "../../workers/api/repositories/tags-repo";
import { createOrganizationsRepo } from "../../workers/api/repositories/organizations-repo";
import { createUsersRepo } from "../../workers/api/repositories/users-repo";

export function testDb(): Db {
  return getDb(env);
}

export async function makeOrg(db: Db, id = "org_test_1") {
  return createOrganizationsRepo(db).ensure(id, "Test Org", "test-org");
}

export async function makeUser(db: Db, id = "user_test_1") {
  return createUsersRepo(db).ensure(id, {
    email: `${id}@example.com`,
    firstName: "Test",
    lastName: "User",
  });
}

export async function makeMembership(
  db: Db,
  orgId: string,
  userId: string,
  role = "org:member",
) {
  await createMembershipsRepo(db).upsert(orgId, userId, role);
}

export async function makeEvent(
  db: Db,
  orgId: string,
  userId = "user_test_1",
  overrides: Partial<{
    name: string;
    date: string | null;
    venue: string | null;
    notes: string | null;
  }> = {},
): Promise<Event> {
  return createEventsRepo(db).create({
    orgId,
    userId,
    name: overrides.name ?? "First Event",
    date: overrides.date ?? "2026-06-12",
    venue: overrides.venue ?? "Moscone West",
    notes: overrides.notes ?? "A sample event",
  });
}

export async function makeTag(
  db: Db,
  orgId: string,
  userId = "user_test_1",
  name = "investor",
): Promise<Tag> {
  return createTagsRepo(db).create({ orgId, userId, name });
}

export async function makeContact(
  db: Db,
  orgId: string,
  eventId: string,
  userId = "user_test_1",
  overrides: Partial<{
    id: string;
    name: string;
    note: string | null;
    tagIds: string[];
  }> = {},
): Promise<ContactWithTags> {
  return createContactsRepo(db).create({
    id: overrides.id,
    orgId,
    userId,
    eventId,
    name: overrides.name ?? "Ada Lovelace",
    note: overrides.note ?? "met at the bar",
    tagIds: overrides.tagIds,
  });
}
