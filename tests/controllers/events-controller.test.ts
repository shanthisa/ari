import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createEventsController } from "../../workers/api/controllers/events-controller";
import {
  NotFoundError,
  PlanLimitError,
} from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeEvent, fakeOrg, mockEventsService } from "../helpers/mocks";

/** Mount the controller the way createApi does, with stubbed auth/services. */
function makeApp(events = mockEventsService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("userId", "user_test_1");
    c.set("org", fakeOrg());
    c.set("services", { events } as never);
    await next();
  });
  app.route("/events", createEventsController());
  return { app, events };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("events controller", () => {
  it("GET /events lists the owner's events", async () => {
    const { app, events } = makeApp();
    events.list.mockResolvedValue([fakeEvent()]);

    const res = await app.request("/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events).toHaveLength(1);
    expect(events.list).toHaveBeenCalledWith("org_test_1", "user_test_1");
  });

  it("POST /events creates and returns 201", async () => {
    const { app, events } = makeApp();
    events.create.mockResolvedValue(fakeEvent({ name: "New" }));

    const res = await app.request("/events", json({ name: "New" }));
    expect(res.status).toBe(201);
    expect(events.create).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "free",
      { name: "New" },
    );
  });

  it("POST /events returns 400 on invalid body", async () => {
    const { app, events } = makeApp();
    const res = await app.request("/events", json({ name: "" }));
    expect(res.status).toBe(400);
    expect(events.create).not.toHaveBeenCalled();
  });

  it("POST /events returns 400 on a malformed date", async () => {
    const { app, events } = makeApp();
    const res = await app.request(
      "/events",
      json({ name: "Ok", date: "June 12" }),
    );
    expect(res.status).toBe(400);
    expect(events.create).not.toHaveBeenCalled();
  });

  it("POST /events maps PlanLimitError to 402", async () => {
    const { app, events } = makeApp();
    events.create.mockRejectedValue(new PlanLimitError("cap reached"));

    const res = await app.request("/events", json({ name: "Over" }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("plan_limit");
  });

  it("POST /events/:id/activate activates", async () => {
    const { app, events } = makeApp();
    events.activate.mockResolvedValue(fakeEvent({ status: "active" }));

    const res = await app.request("/events/event_1/activate", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(events.activate).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "event_1",
    );
  });

  it("POST /events/:id/archive archives", async () => {
    const { app, events } = makeApp();
    events.archive.mockResolvedValue(fakeEvent({ status: "archived" }));

    const res = await app.request("/events/event_1/archive", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(events.archive).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "event_1",
    );
  });

  it("GET /events/:id maps NotFoundError to 404", async () => {
    const { app, events } = makeApp();
    events.get.mockRejectedValue(new NotFoundError("nope"));

    const res = await app.request("/events/missing");
    expect(res.status).toBe(404);
  });

  it("PATCH /events/:id passes valid updates through", async () => {
    const { app, events } = makeApp();
    events.update.mockResolvedValue(fakeEvent({ name: "Renamed" }));

    const res = await app.request(
      "/events/event_1",
      json({ name: "Renamed" }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(events.update).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "event_1",
      { name: "Renamed" },
    );
  });

  it("DELETE /events/:id deletes", async () => {
    const { app, events } = makeApp();
    events.delete.mockResolvedValue(undefined);

    const res = await app.request("/events/event_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(events.delete).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "event_1",
    );
  });
});
