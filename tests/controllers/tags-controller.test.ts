import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createTagsController } from "../../workers/api/controllers/tags-controller";
import { ConflictError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeTag, mockTagsService } from "../helpers/mocks";

function makeApp(tags = mockTagsService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("userId", "user_test_1");
    c.set("services", { tags } as never);
    await next();
  });
  app.route("/tags", createTagsController());
  return { app, tags };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("tags controller", () => {
  it("GET /tags lists the owner's tags", async () => {
    const { app, tags } = makeApp();
    tags.list.mockResolvedValue([fakeTag()]);

    const res = await app.request("/tags");
    expect(res.status).toBe(200);
    expect(tags.list).toHaveBeenCalledWith("org_test_1", "user_test_1");
  });

  it("POST /tags creates and returns 201", async () => {
    const { app, tags } = makeApp();
    tags.create.mockResolvedValue(fakeTag({ name: "hiring" }));

    const res = await app.request("/tags", json({ name: "hiring" }));
    expect(res.status).toBe(201);
    expect(tags.create).toHaveBeenCalledWith("org_test_1", "user_test_1", {
      name: "hiring",
    });
  });

  it("POST /tags trims the name and rejects blank/too-long", async () => {
    const { app, tags } = makeApp();
    tags.create.mockResolvedValue(fakeTag({ name: "spaced" }));

    // trimmed by zod
    await app.request("/tags", json({ name: "  spaced  " }));
    expect(tags.create).toHaveBeenCalledWith("org_test_1", "user_test_1", {
      name: "spaced",
    });

    expect((await app.request("/tags", json({ name: "" }))).status).toBe(400);
    expect(
      (await app.request("/tags", json({ name: "x".repeat(31) }))).status,
    ).toBe(400);
  });

  it("POST /tags maps ConflictError to 409", async () => {
    const { app, tags } = makeApp();
    tags.create.mockRejectedValue(new ConflictError("dupe"));

    const res = await app.request("/tags", json({ name: "investor" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("conflict");
  });

  it("PATCH /tags/:id renames", async () => {
    const { app, tags } = makeApp();
    tags.rename.mockResolvedValue(fakeTag({ name: "renamed" }));

    const res = await app.request(
      "/tags/tag_1",
      json({ name: "renamed" }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(tags.rename).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "tag_1",
      "renamed",
    );
  });

  it("DELETE /tags/:id deletes", async () => {
    const { app, tags } = makeApp();
    tags.delete.mockResolvedValue(undefined);

    const res = await app.request("/tags/tag_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(tags.delete).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "tag_1",
    );
  });
});
