import { getDb } from "../db/client";
import { createContactsRepo } from "../repositories/contacts-repo";
import { createEventsRepo } from "../repositories/events-repo";
import { createMembershipsRepo } from "../repositories/memberships-repo";
import { createOrganizationsRepo } from "../repositories/organizations-repo";
import { createTagsRepo } from "../repositories/tags-repo";
import { createUsageRepo } from "../repositories/usage-repo";
import { createUsersRepo } from "../repositories/users-repo";
import { createContactsService } from "./contacts-service";
import { createEventsService } from "./events-service";
import { createTagsService } from "./tags-service";
import { createUploadsService } from "./uploads-service";
import { createMembersService } from "./members-service";
import { createOrganizationsService } from "./organizations-service";
import { createUsersService } from "./users-service";

/**
 * Per-request service container. Wires repositories (the only DB access) and
 * external adapters into services. This is the spine of the app: add your
 * repo + service here and they're available as c.var.services everywhere.
 * Skills (billing, email, webhooks, uploads) plug their adapters in here.
 */
export function createServices(env: Env) {
  const db = getDb(env);
  const orgsRepo = createOrganizationsRepo(db);
  const usersRepo = createUsersRepo(db);
  const membershipsRepo = createMembershipsRepo(db);
  const usageRepo = createUsageRepo(db);
  const eventsRepo = createEventsRepo(db);
  const tagsRepo = createTagsRepo(db);
  const contactsRepo = createContactsRepo(db);
  const uploads = createUploadsService({ bucket: env.UPLOADS });

  return {
    organizations: createOrganizationsService({ orgsRepo }),
    users: createUsersService({ usersRepo }),
    members: createMembersService({ membershipsRepo, usersRepo }),
    events: createEventsService({ eventsRepo, tagsRepo, usageRepo }),
    tags: createTagsService({ tagsRepo, contactsRepo, eventsRepo }),
    contacts: createContactsService({
      contactsRepo,
      eventsRepo,
      tagsRepo,
      uploads,
    }),
    uploads,
  };
}

export type Services = ReturnType<typeof createServices>;
