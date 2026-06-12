import { z } from "zod";

// Request body schemas, validated at the controller edge with @hono/zod-validator.
// Keep validation here so controllers stay thin and services trust their inputs.

/** ISO `YYYY-MM-DD` date-only string. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const eventCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  date: isoDate.optional(),
  venue: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

// Lifecycle changes (activate/archive) go through dedicated endpoints, so the
// generic update only covers the editable fields — never `status`.
export const eventUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    date: isoDate.nullable().optional(),
    venue: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "no fields to update");

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

// Tag names are short and trimmed; uniqueness per user is enforced in the service.
const tagName = z.string().trim().min(1, "name is required").max(30);

export const tagCreateSchema = z.object({ name: tagName });
export const tagUpdateSchema = z.object({ name: tagName });

export type TagCreateInput = z.infer<typeof tagCreateSchema>;
export type TagUpdateInput = z.infer<typeof tagUpdateSchema>;

// Contacts. Name is optional (empty → "Unknown" in the service). Geolocation is
// always optional — a denied/unavailable fix must never block a capture (F2.7).
const tagIds = z.array(z.string()).max(50);

export const contactCreateSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().max(200).nullish(),
  note: z.string().max(2000).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  accuracy: z.number().min(0).nullish(),
  capturedAt: z.number().int().positive().optional(),
  tagIds: tagIds.optional(),
});

export const contactUpdateSchema = z
  .object({
    name: z.string().max(200).nullish(),
    note: z.string().max(2000).nullish(),
    tagIds: tagIds.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "no fields to update");

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
