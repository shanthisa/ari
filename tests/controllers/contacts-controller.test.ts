import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createContactsControllers } from "../../workers/api/controllers/contacts-controller";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { NotFoundError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import {
  fakeContact,
  fakePhoto,
  mockContactsService,
  mockUploadsService,
} from "../helpers/mocks";

function makeApp(
  contacts = mockContactsService(),
  uploads = mockUploadsService(),
) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("userId", "user_test_1");
    c.set("services", { contacts, uploads } as never);
    await next();
  });
  const { byEvent, byId } = createContactsControllers();
  app.route("/events/:eventId/contacts", byEvent);
  app.route("/contacts", byId);
  return { app, contacts, uploads };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("contacts controller", () => {
  it("GET /events/:id/contacts lists for the event", async () => {
    const { app, contacts } = makeApp();
    contacts.list.mockResolvedValue([fakeContact()]);

    const res = await app.request("/events/e1/contacts");
    expect(res.status).toBe(200);
    expect(contacts.list).toHaveBeenCalledWith("org_test_1", "user_test_1", "e1");
  });

  it("POST /events/:id/contacts creates and returns 201", async () => {
    const { app, contacts } = makeApp();
    contacts.create.mockResolvedValue(fakeContact());

    const res = await app.request(
      "/events/e1/contacts",
      json({ name: "Ada", tagIds: ["t1"] }),
    );
    expect(res.status).toBe(201);
    expect(contacts.create).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "e1",
      { name: "Ada", tagIds: ["t1"] },
    );
  });

  it("accepts a geolocated capture", async () => {
    const { app, contacts } = makeApp();
    contacts.create.mockResolvedValue(fakeContact());

    const res = await app.request(
      "/events/e1/contacts",
      json({ name: "Ada", latitude: 37.78, longitude: -122.4, accuracy: 12 }),
    );
    expect(res.status).toBe(201);
  });

  it("rejects an out-of-range latitude with 400", async () => {
    const { app, contacts } = makeApp();
    const res = await app.request(
      "/events/e1/contacts",
      json({ name: "Ada", latitude: 999 }),
    );
    expect(res.status).toBe(400);
    expect(contacts.create).not.toHaveBeenCalled();
  });

  it("allows a nameless capture (Unknown fallback happens in the service)", async () => {
    const { app, contacts } = makeApp();
    contacts.create.mockResolvedValue(fakeContact({ name: "Unknown" }));

    const res = await app.request("/events/e1/contacts", json({}));
    expect(res.status).toBe(201);
  });

  it("GET /contacts/:id maps NotFoundError to 404", async () => {
    const { app, contacts } = makeApp();
    contacts.get.mockRejectedValue(new NotFoundError("nope"));

    const res = await app.request("/contacts/missing");
    expect(res.status).toBe(404);
  });

  it("PATCH /contacts/:id updates", async () => {
    const { app, contacts } = makeApp();
    contacts.update.mockResolvedValue(fakeContact({ name: "Renamed" }));

    const res = await app.request(
      "/contacts/contact_1",
      json({ name: "Renamed", tagIds: [] }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(contacts.update).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "contact_1",
      { name: "Renamed", tagIds: [] },
    );
  });

  it("PATCH /contacts/:id rejects an empty body with 400", async () => {
    const { app, contacts } = makeApp();
    const res = await app.request("/contacts/contact_1", json({}, "PATCH"));
    expect(res.status).toBe(400);
    expect(contacts.update).not.toHaveBeenCalled();
  });

  it("DELETE /contacts/:id deletes and cleans up its R2 objects", async () => {
    const { app, contacts, uploads } = makeApp();
    contacts.delete.mockResolvedValue(["k1", "k2"]);

    const res = await app.request("/contacts/contact_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(contacts.delete).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      "contact_1",
    );
    expect(uploads.delete).toHaveBeenCalledWith("k1");
    expect(uploads.delete).toHaveBeenCalledWith("k2");
  });

  describe("photos", () => {
    it("POST /contacts/:id/photos uploads a file", async () => {
      const { app, contacts } = makeApp();
      contacts.addPhoto.mockResolvedValue(fakePhoto());

      const fd = new FormData();
      fd.append(
        "file",
        new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" }),
      );
      fd.append("width", "800");
      fd.append("height", "600");
      const res = await app.request("/contacts/contact_1/photos", {
        method: "POST",
        body: fd,
      });
      expect(res.status).toBe(201);
      expect(contacts.addPhoto).toHaveBeenCalledWith(
        "org_test_1",
        "user_test_1",
        "contact_1",
        expect.objectContaining({
          contentType: "image/jpeg",
          width: 800,
          height: 600,
        }),
      );
    });

    it("POST /contacts/:id/photos 400s without a file", async () => {
      const { app } = makeApp();
      const res = await app.request("/contacts/contact_1/photos", {
        method: "POST",
        body: new FormData(),
      });
      expect(res.status).toBe(422); // ValidationError
    });

    it("GET /contacts/:id/photos/:photoId streams the object", async () => {
      const { app, contacts, uploads } = makeApp();
      contacts.getPhoto.mockResolvedValue(
        fakePhoto({ contentType: "image/png", r2Key: "k" }),
      );
      uploads.get.mockResolvedValue({ body: "bytes", httpEtag: '"e"' });

      const res = await app.request("/contacts/contact_1/photos/photo_1");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(uploads.get).toHaveBeenCalledWith("k");
    });

    it("DELETE /contacts/:id/photos/:photoId removes the object", async () => {
      const { app, contacts, uploads } = makeApp();
      contacts.deletePhoto.mockResolvedValue("the/key.jpg");

      const res = await app.request("/contacts/contact_1/photos/photo_1", {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      expect(contacts.deletePhoto).toHaveBeenCalledWith(
        "org_test_1",
        "user_test_1",
        "contact_1",
        "photo_1",
      );
      expect(uploads.delete).toHaveBeenCalledWith("the/key.jpg");
    });
  });
});
