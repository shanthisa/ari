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
