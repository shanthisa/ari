import { describe, expect, it } from "vitest";
import { createUploadsService } from "../../workers/api/services/uploads-service";
import { fakeBucket } from "../helpers/mocks";

describe("uploads service", () => {
  it("builds an org/contact-prefixed key with the right extension", () => {
    const svc = createUploadsService({ bucket: fakeBucket() as never });
    const key = svc.photoKey("org_1", "contact_1", "image/png");
    expect(key.startsWith("org_1/contact_1/")).toBe(true);
    expect(key.endsWith(".png")).toBe(true);
  });

  it("put stores with the content type as metadata", async () => {
    const bucket = fakeBucket();
    const svc = createUploadsService({ bucket: bucket as never });
    await svc.put("k", new Uint8Array([1]), "image/jpeg");
    expect(bucket.put).toHaveBeenCalledWith("k", expect.anything(), {
      httpMetadata: { contentType: "image/jpeg" },
    });
  });

  it("get and delete pass through to the bucket", async () => {
    const bucket = fakeBucket();
    const svc = createUploadsService({ bucket: bucket as never });
    await svc.get("k");
    expect(bucket.get).toHaveBeenCalledWith("k");
    await svc.delete("k");
    expect(bucket.delete).toHaveBeenCalledWith("k");
  });
});
