import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiEnv } from "../types";
import {
  eventCreateSchema,
  eventUpdateSchema,
  quickTagsSchema,
} from "../validation";

/** /api/events — CRUD plus activate/archive lifecycle. Mounted inside the
 * authed group, so c.var.{orgId,userId,org,services} are always present.
 * Controllers stay thin: validate input, call a service, shape the response. */
export function createEventsController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const events = await c.var.services.events.list(c.var.orgId, c.var.userId);
    return c.json({ events });
  });

  app.post("/", zValidator("json", eventCreateSchema), async (c) => {
    const input = c.req.valid("json");
    const event = await c.var.services.events.create(
      c.var.orgId,
      c.var.userId,
      c.var.org.plan,
      input,
    );
    return c.json({ event }, 201);
  });

  // Static route registered before /:id so "active" isn't read as an id.
  app.get("/active", async (c) => {
    const event = await c.var.services.events.getActive(
      c.var.orgId,
      c.var.userId,
    );
    return c.json({ event: event ?? null });
  });

  app.get("/:id", async (c) => {
    const event = await c.var.services.events.get(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ event });
  });

  app.get("/:id/quick-tags", async (c) => {
    const quickTags = await c.var.services.events.getQuickTags(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ quickTags });
  });

  app.put("/:id/quick-tags", zValidator("json", quickTagsSchema), async (c) => {
    const quickTags = await c.var.services.events.setQuickTags(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
      c.req.valid("json").tagIds,
    );
    return c.json({ quickTags });
  });

  app.patch("/:id", zValidator("json", eventUpdateSchema), async (c) => {
    const event = await c.var.services.events.update(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
      c.req.valid("json"),
    );
    return c.json({ event });
  });

  app.post("/:id/activate", async (c) => {
    const event = await c.var.services.events.activate(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ event });
  });

  app.post("/:id/archive", async (c) => {
    const event = await c.var.services.events.archive(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ event });
  });

  app.delete("/:id", async (c) => {
    await c.var.services.events.delete(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ ok: true });
  });

  return app;
}
