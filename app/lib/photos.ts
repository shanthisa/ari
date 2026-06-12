// Client-safe photo helpers (no React / Hono). Used by the event page and the
// event-mode capture screen.

/** Authenticated, private URL for a contact photo (served by the worker). */
export function photoUrl(contactId: string, photoId: string): string {
  return `/api/contacts/${contactId}/photos/${photoId}`;
}

/** Downscale + re-encode an image in the browser before upload — kind to
 * conference Wi-Fi, and keeps R2 objects small (PRD F2.3, ~500 KB target). */
export async function downscaleImage(
  file: File,
  max = 1600,
  quality = 0.8,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality,
    ),
  );
  return { blob, width, height };
}

/** Upload one photo to a contact (multipart, direct to the authed API). */
export async function uploadContactPhoto(
  contactId: string,
  file: File,
): Promise<void> {
  const { blob, width, height } = await downscaleImage(file);
  const fd = new FormData();
  fd.append("file", blob, "photo.jpg");
  fd.append("width", String(width));
  fd.append("height", String(height));
  const res = await fetch(`/api/contacts/${contactId}/photos`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(await res.text());
}
