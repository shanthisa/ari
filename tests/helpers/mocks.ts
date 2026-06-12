import { vi } from "vitest";
import type { Event } from "../../workers/api/repositories/events-repo";
import type { Membership } from "../../workers/api/repositories/memberships-repo";
import type { Tag } from "../../workers/api/repositories/tags-repo";
import type { Organization } from "../../workers/api/repositories/organizations-repo";
import type { User } from "../../workers/api/repositories/users-repo";

export function fakeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    plan: "free",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockOrganizationsRepo() {
  return {
    getById: vi.fn(),
    ensure: vi.fn(),
    updateFromClerk: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event_1",
    orgId: "org_test_1",
    userId: "user_test_1",
    name: "First Event",
    date: "2026-06-12",
    venue: "Moscone West",
    notes: "A sample event",
    status: "draft",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockEventsRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOwner: vi.fn(),
    countOpenByOwner: vi.fn(),
    getActive: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
    setStatus: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockEventsService() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    getActive: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    archive: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: "tag_1",
    orgId: "org_test_1",
    userId: "user_test_1",
    name: "investor",
    createdAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockTagsRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    findByName: vi.fn(),
    listByOwner: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockTagsService() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockUsageRepo() {
  return {
    getCount: vi.fn(),
    increment: vi.fn(),
    history: vi.fn(),
  };
}

export function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_test_1",
    email: "user@example.com",
    firstName: "Test",
    lastName: "User",
    imageUrl: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockUsersRepo() {
  return {
    getById: vi.fn(),
    ensure: vi.fn(),
    upsert: vi.fn(),
    updateFromClerk: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    orgId: "org_test_1",
    userId: "user_test_1",
    role: "org:member",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockMembershipsRepo() {
  return {
    get: vi.fn(),
    upsert: vi.fn(),
    listByOrg: vi.fn(),
    reconcile: vi.fn(),
    remove: vi.fn(),
  };
}

export function mockUsersService() {
  return {
    ensureUser: vi.fn(),
    getById: vi.fn(),
    syncFromClerk: vi.fn(),
  };
}

export function mockMembersService() {
  return {
    ensureMembership: vi.fn(),
    listMembers: vi.fn(),
    removeMember: vi.fn(),
    syncFromClerk: vi.fn(),
  };
}
