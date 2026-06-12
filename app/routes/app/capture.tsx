import { useEffect, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { apiFetch } from "~/lib/api-client.server";
import { EXIT_FLAG, NO_AUTO_CAPTURE } from "~/lib/event-mode";
import { photoUrl, uploadContactPhoto } from "~/lib/photos";
import type { ContactWithDetails } from "../../../workers/api/repositories/contacts-repo";
import type { Event } from "../../../workers/api/repositories/events-repo";
import type { Tag } from "../../../workers/api/repositories/tags-repo";
import type { Route } from "./+types/capture";

export function meta() {
  return [{ title: "Capture — Ari" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { event } = await apiFetch<{ event: Event | null }>(
    request,
    "/api/events/active",
  );
  if (!event) return { active: null as Event | null, quickTags: [], contacts: [] };
  const [quickRes, contactsRes] = await Promise.all([
    apiFetch<{ quickTags: Tag[] }>(request, `/api/events/${event.id}/quick-tags`),
    apiFetch<{ contacts: ContactWithDetails[] }>(
      request,
      `/api/events/${event.id}/contacts`,
    ),
  ]);
  return {
    active: event,
    quickTags: quickRes.quickTags,
    contacts: contactsRes.contacts,
  };
}

function useGeolocation() {
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [state, setState] = useState<"pending" | "ready" | "off">("pending");
  useEffect(() => {
    if (!("geolocation" in navigator)) return setState("off");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setState("ready");
      },
      () => setState("off"),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
    );
  }, []);
  return { coords, state };
}

/** One-step "Start an event" when none is active (PRD F2.10). */
function StartEvent() {
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      const { event } = (await res.json()) as { event: { id: string } };
      await fetch(`/api/events/${event.id}/activate`, { method: "POST" });
      revalidator.revalidate();
    } catch {
      toast.error("Couldn’t start the event");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-6 text-center">
      <span className="stamp -rotate-3">Event mode</span>
      <h1 className="mt-4 text-2xl">Start an event</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Name it and you’re capturing in seconds.
      </p>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && start()}
        placeholder="RailsConf 2026"
        autoFocus
        className="mt-6"
      />
      <Button onClick={start} disabled={busy} className="mt-3 w-full">
        {busy ? "Starting…" : "Start & capture"}
      </Button>
      <button
        type="button"
        onClick={() => navigate("/app")}
        className="form-label-mono text-muted-foreground mt-6 text-[10px]"
      >
        Back to dashboard
      </button>
    </div>
  );
}

function CaptureScreen({
  active,
  quickTags,
  contacts,
}: {
  active: Event;
  quickTags: Tag[];
  contacts: ContactWithDetails[];
}) {
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const { coords, state } = useGeolocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [photo, setPhoto] = useState<File | null>(null);
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);

  function toggleTag(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${active.id}/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: clientId,
          name,
          note: note || undefined,
          tagIds: [...selected],
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          accuracy: coords?.accuracy,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (photo) await uploadContactPhoto(clientId, photo);
      // Reset for the next person; new id keeps the next create idempotent.
      setName("");
      setNote("");
      setSelected(new Set());
      setPhoto(null);
      setClientId(crypto.randomUUID());
      toast.success("Captured");
      revalidator.revalidate();
    } catch {
      // Keep the form state so nothing typed is lost (PRD F4.3).
      toast.error("Save failed — your entry is kept, tap Save to retry");
    } finally {
      setSaving(false);
    }
  }

  function exit() {
    sessionStorage.setItem(EXIT_FLAG, "1");
    navigate("/app");
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-10">
      <div className="flex items-center justify-between py-3">
        <div className="min-w-0">
          <p className="form-label-mono text-muted-foreground text-[10px]">
            Event mode
          </p>
          <h1 className="truncate text-lg">{active.name}</h1>
        </div>
        <Button onClick={exit} variant="ghost" size="sm">
          Exit
        </Button>
      </div>

      <div className="bg-card space-y-4 rounded-xl border p-4">
        {/* Photo */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="bg-muted/40 flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed"
        >
          {photo ? (
            <img
              src={URL.createObjectURL(photo)}
              alt="preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-muted-foreground text-sm">
              📷 Tap to add a photo
            </span>
          )}
        </button>

        {/* Name */}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (or leave blank for “Unknown”)"
          autoFocus
          className="h-12 text-base"
        />

        {/* Quick tags */}
        {quickTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickTags.map((tag) => {
              const on = selected.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    on
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Note */}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
          rows={2}
        />

        <Button
          onClick={save}
          disabled={saving}
          className="h-14 w-full text-base"
        >
          {saving ? "Saving…" : "Save contact"}
        </Button>
        <p className="form-label-mono text-muted-foreground/70 text-center text-[10px]">
          {state === "ready"
            ? `📍 location on (±${Math.round(coords?.accuracy ?? 0)}m)`
            : state === "pending"
              ? "📍 locating…"
              : "📍 location off"}
        </p>
      </div>

      {/* Recent captures */}
      {contacts.length > 0 && (
        <div className="mt-6">
          <p className="form-label-mono text-muted-foreground mb-2 text-[10px]">
            Recent ({contacts.length})
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {contacts.map((c) => (
              <div key={c.id} className="w-20 shrink-0 text-center">
                <div className="bg-muted size-20 overflow-hidden rounded-lg border">
                  {c.photos[0] ? (
                    <img
                      src={photoUrl(c.id, c.photos[0].id)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center text-xl">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="mt-1 truncate text-xs">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(NO_AUTO_CAPTURE, "1");
            toast.success("Won’t auto-open event mode on this device");
          }}
          className="form-label-mono text-muted-foreground/70 text-[10px]"
        >
          Don’t auto-open event mode on this device
        </button>
      </div>
    </div>
  );
}

export default function Capture({ loaderData }: Route.ComponentProps) {
  const { active, quickTags, contacts } = loaderData;
  if (!active) return <StartEvent />;
  return (
    <CaptureScreen active={active} quickTags={quickTags} contacts={contacts} />
  );
}
