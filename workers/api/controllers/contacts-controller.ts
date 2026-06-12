import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { ValidationError } from "../services/errors";
import type { ApiEnv } from "../types";
import { contactCreateSchema, contactUpdateSchema } from "../validation";

/** Run a side effect (R2 cleanup) after the response, keeping the Worker alive
 * for it. Falls back to fire-and-forget when there's no execution context
 * (e.g. unit tests). */
function background(c: Context<ApiEnv>, p: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    void p;
  }
}

function numField(form: FormData, key: string): number | undefined {
  const v = form.get(key);
  return typeof v === "string" && v !== "" ? Number(v) : undefined;
}

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
    const photoKeys = await c.var.services.contacts.delete(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    // Remove the contact's R2 objects after responding.
    for (const key of photoKeys) {
      background(c, c.var.services.uploads.delete(key));
    }
    return c.json({ ok: true });
  });

  // ---- Photos (private; bytes served only through the authed GET below) ----

  byId.post("/:id/photos", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("expected a 'file' field");
    }
    const photo = await c.var.services.contacts.addPhoto(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
      {
        contentType: file.type,
        size: file.size,
        body: file.stream(),
        width: numField(form, "width"),
        height: numField(form, "height"),
      },
    );
    return c.json({ photo }, 201);
  });

  byId.get("/:id/photos/:photoId", async (c) => {
    const photo = await c.var.services.contacts.getPhoto(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
      c.req.param("photoId"),
    );
    const object = await c.var.services.uploads.get(photo.r2Key);
    if (!object) return c.json({ error: "object not found" }, 404);
    const headers = new Headers({
      "content-type": photo.contentType,
      // Private: belongs to one signed-in user; never cache on shared proxies.
      "cache-control": "private, max-age=3600",
    });
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    return new Response(object.body, { headers });
  });

  byId.delete("/:id/photos/:photoId", async (c) => {
    const key = await c.var.services.contacts.deletePhoto(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
      c.req.param("photoId"),
    );
    background(c, c.var.services.uploads.delete(key));
    return c.json({ ok: true });
  });

  return { byEvent, byId };
}
