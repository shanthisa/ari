import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiEnv } from "../types";
import { contactCreateSchema, contactUpdateSchema } from "../validation";

/** Contacts live under an event for list/create, and are addressed directly by
 * id for read/update/delete:
 *   GET    /api/events/:eventId/contacts
 *   POST   /api/events/:eventId/contacts
 *   GET    /api/contacts/:id
 *   PATCH  /api/contacts/:id
 *   DELETE /api/contacts/:id
 * Mounted inside the authed group, so c.var.{orgId,userId} are always present. */
export function createContactsControllers() {
  // Nested under an event (mounted at /events/:eventId/contacts).
  const byEvent = new Hono<ApiEnv>();

  byEvent.get("/", async (c) => {
    // eventId comes from the mount prefix (/events/:eventId/contacts).
    const eventId = c.req.param("eventId") as string;
    const contacts = await c.var.services.contacts.list(
      c.var.orgId,
      c.var.userId,
      eventId,
    );
    return c.json({ contacts });
  });

  byEvent.post("/", zValidator("json", contactCreateSchema), async (c) => {
    const eventId = c.req.param("eventId") as string;
    const contact = await c.var.services.contacts.create(
      c.var.orgId,
      c.var.userId,
      eventId,
      c.req.valid("json"),
    );
    return c.json({ contact }, 201);
  });

  // Addressed by contact id (mounted at /contacts).
  const byId = new Hono<ApiEnv>();

  byId.get("/:id", async (c) => {
    const contact = await c.var.services.contacts.get(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ contact });
  });

  byId.patch("/:id", zValidator("json", contactUpdateSchema), async (c) => {
    const contact = await c.var.services.contacts.update(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
      c.req.valid("json"),
    );
    return c.json({ contact });
  });

  byId.delete("/:id", async (c) => {
    await c.var.services.contacts.delete(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ ok: true });
  });

  return { byEvent, byId };
}
