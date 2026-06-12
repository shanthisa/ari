import type {
  ContactPhoto,
  ContactWithDetails,
  ContactsRepo,
} from "../repositories/contacts-repo";
import type { EventsRepo } from "../repositories/events-repo";
import type { TagsRepo } from "../repositories/tags-repo";
import type { UploadsService } from "./uploads-service";
import { NotFoundError, ValidationError } from "./errors";

// Business rules for contacts: the contact must belong to one of the user's own
// events, an empty name softly becomes "Unknown" (PRD F2.4 — a photo-only
// capture is never blocked), only the user's own tags can be attached, and
// photos are stored privately in R2 (bytes never leave through a public URL).

const MAX_PHOTO_BYTES = 6 * 1024 * 1024; // headroom over the ~500KB client target
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface PhotoUpload {
  contentType: string;
  size: number;
  body: ReadableStream | ArrayBuffer | Blob;
  width?: number | null;
  height?: number | null;
}

export interface ContactsServiceDeps {
  contactsRepo: ContactsRepo;
  eventsRepo: EventsRepo;
  tagsRepo: TagsRepo;
  uploads: UploadsService;
}

export interface ContactInput {
  id?: string;
  name?: string | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  capturedAt?: number;
  tagIds?: string[];
}

export function createContactsService({
  contactsRepo,
  eventsRepo,
  tagsRepo,
  uploads,
}: ContactsServiceDeps) {
  async function requireEvent(orgId: string, userId: string, eventId: string) {
    const event = await eventsRepo.getById(orgId, userId, eventId);
    if (!event) throw new NotFoundError(`event ${eventId} not found`);
  }

  /** Keep only tag ids the user actually owns — never attach another user's tag. */
  async function ownTagIds(
    orgId: string,
    userId: string,
    tagIds: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (tagIds === undefined) return undefined;
    if (tagIds.length === 0) return [];
    const owned = new Set(
      (await tagsRepo.listByOwner(orgId, userId)).map((t) => t.id),
    );
    return tagIds.filter((id) => owned.has(id));
  }

  function cleanName(name: string | null | undefined): string {
    return (name ?? "").trim() || "Unknown";
  }

  async function get(
    orgId: string,
    userId: string,
    id: string,
  ): Promise<ContactWithDetails> {
    const contact = await contactsRepo.getById(orgId, userId, id);
    if (!contact) throw new NotFoundError(`contact ${id} not found`);
    return contact;
  }

  return {
    async list(
      orgId: string,
      userId: string,
      eventId: string,
    ): Promise<ContactWithDetails[]> {
      await requireEvent(orgId, userId, eventId);
      return contactsRepo.listByEvent(orgId, userId, eventId);
    },

    get,

    async create(
      orgId: string,
      userId: string,
      eventId: string,
      input: ContactInput,
    ): Promise<ContactWithDetails> {
      await requireEvent(orgId, userId, eventId);
      return contactsRepo.create({
        id: input.id,
        orgId,
        userId,
        eventId,
        name: cleanName(input.name),
        note: input.note ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracy: input.accuracy ?? null,
        capturedAt: input.capturedAt,
        tagIds: await ownTagIds(orgId, userId, input.tagIds),
      });
    },

    async update(
      orgId: string,
      userId: string,
      id: string,
      input: {
        name?: string | null;
        note?: string | null;
        tagIds?: string[];
      },
    ): Promise<ContactWithDetails> {
      await get(orgId, userId, id); // 404 if it isn't theirs
      const patch: { name?: string; note?: string | null } = {};
      if (input.name !== undefined) patch.name = cleanName(input.name);
      if (input.note !== undefined) patch.note = input.note;
      const updated = await contactsRepo.update(
        orgId,
        userId,
        id,
        patch,
        await ownTagIds(orgId, userId, input.tagIds),
      );
      if (!updated) throw new NotFoundError(`contact ${id} not found`);
      return updated;
    },

    /** Deletes the contact + its rows, returning the R2 keys of its photos so
     * the caller can remove the objects from the bucket (in waitUntil). */
    async delete(
      orgId: string,
      userId: string,
      id: string,
    ): Promise<string[]> {
      const photoKeys = await contactsRepo.delete(orgId, userId, id);
      if (photoKeys === null) throw new NotFoundError(`contact ${id} not found`);
      return photoKeys;
    },

    /** Store a photo in R2 and index it. The contact must be the user's own. */
    async addPhoto(
      orgId: string,
      userId: string,
      contactId: string,
      file: PhotoUpload,
    ): Promise<ContactPhoto> {
      await get(orgId, userId, contactId); // 404 if it isn't theirs
      if (!ALLOWED_PHOTO_TYPES.has(file.contentType)) {
        throw new ValidationError(`unsupported image type: ${file.contentType}`);
      }
      if (file.size > MAX_PHOTO_BYTES) {
        throw new ValidationError("image too large (max 6 MB)");
      }
      const key = uploads.photoKey(orgId, contactId, file.contentType);
      await uploads.put(key, file.body, file.contentType);
      return contactsRepo.addPhoto({
        orgId,
        userId,
        contactId,
        r2Key: key,
        contentType: file.contentType,
        byteSize: file.size,
        width: file.width,
        height: file.height,
      });
    },

    /** The photo row (with its R2 key) for serving — 404 if not the user's. */
    async getPhoto(
      orgId: string,
      userId: string,
      contactId: string,
      photoId: string,
    ): Promise<ContactPhoto> {
      const photo = await contactsRepo.getPhoto(
        orgId,
        userId,
        contactId,
        photoId,
      );
      if (!photo) throw new NotFoundError(`photo ${photoId} not found`);
      return photo;
    },

    /** Removes the photo row, returning its R2 key for bucket cleanup. */
    async deletePhoto(
      orgId: string,
      userId: string,
      contactId: string,
      photoId: string,
    ): Promise<string> {
      const photo = await contactsRepo.deletePhoto(
        orgId,
        userId,
        contactId,
        photoId,
      );
      if (!photo) throw new NotFoundError(`photo ${photoId} not found`);
      return photo.r2Key;
    },
  };
}

export type ContactsService = ReturnType<typeof createContactsService>;
