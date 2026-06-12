import { newId } from "~/lib/id";

// Thin adapter over a Cloudflare R2 bucket. Objects are PRIVATE — there is no
// public URL; bytes are read back only through an authenticated worker route
// (see the contacts photo routes). Keys are org-prefixed and unguessable so
// tenants are isolated and nothing leaks via key-guessing.

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export interface UploadsServiceDeps {
  bucket: R2Bucket;
}

export function createUploadsService({ bucket }: UploadsServiceDeps) {
  return {
    /** Build an org-scoped, unguessable key for a contact's photo. */
    photoKey(orgId: string, contactId: string, contentType: string): string {
      const ext = EXT_BY_TYPE[contentType] ?? "";
      return `${orgId}/${contactId}/${newId()}${ext}`;
    },

    put(
      key: string,
      body: ReadableStream | ArrayBuffer | Blob,
      contentType: string,
    ): Promise<R2Object> {
      return bucket.put(key, body, { httpMetadata: { contentType } });
    },

    get(key: string): Promise<R2ObjectBody | null> {
      return bucket.get(key);
    },

    delete(key: string): Promise<void> {
      return bucket.delete(key);
    },
  };
}

export type UploadsService = ReturnType<typeof createUploadsService>;
