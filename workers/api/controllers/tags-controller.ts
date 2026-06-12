import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiEnv } from "../types";
import { tagCreateSchema, tagUpdateSchema } from "../validation";

/** /api/tags — CRUD for the user's reusable tag library. Mounted inside the
 * authed group, so c.var.{orgId,userId} are always present. */
export function createTagsController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const tags = await c.var.services.tags.list(c.var.orgId, c.var.userId);
    return c.json({ tags });
  });

  app.post("/", zValidator("json", tagCreateSchema), async (c) => {
    const tag = await c.var.services.tags.create(
      c.var.orgId,
      c.var.userId,
      c.req.valid("json"),
    );
    return c.json({ tag }, 201);
  });

  app.patch("/:id", zValidator("json", tagUpdateSchema), async (c) => {
    const tag = await c.var.services.tags.rename(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
      c.req.valid("json").name,
    );
    return c.json({ tag });
  });

  app.delete("/:id", async (c) => {
    await c.var.services.tags.delete(
      c.var.orgId,
      c.var.userId,
      c.req.param("id"),
    );
    return c.json({ ok: true });
  });

  return app;
}
