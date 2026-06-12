import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { apiFetch } from "~/lib/api-client.server";
import type {
  ContactWithTags,
} from "../../../workers/api/repositories/contacts-repo";
import type { Event } from "../../../workers/api/repositories/events-repo";
import type { Tag } from "../../../workers/api/repositories/tags-repo";
import type { Route } from "./+types/event-contacts";

export function meta() {
  return [{ title: "Capture — Ari" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { eventId } = params;
  const [eventRes, contactsRes, tagsRes] = await Promise.all([
    apiFetch<{ event: Event }>(request, `/api/events/${eventId}`),
    apiFetch<{ contacts: ContactWithTags[] }>(
      request,
      `/api/events/${eventId}/contacts`,
    ),
    apiFetch<{ tags: Tag[] }>(request, "/api/tags"),
  ]);
  return {
    event: eventRes.event,
    contacts: contactsRes.contacts,
    tags: tagsRes.tags,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { eventId } = params;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const contactId = String(form.get("contactId") ?? "");
  const tagIds = form.getAll("tagIds").map(String);

  if (intent === "delete") {
    await apiFetch(request, `/api/contacts/${contactId}`, { method: "DELETE" });
    return { ok: true };
  }

  if (intent === "update") {
    await apiFetch(request, `/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        note: String(form.get("note") ?? "") || null,
        tagIds,
      }),
    });
    return { ok: true, updated: true };
  }

  // create
  const num = (key: string): number | undefined => {
    const v = form.get(key);
    return v != null && v !== "" ? Number(v) : undefined;
  };
  await apiFetch(request, `/api/events/${eventId}/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: String(form.get("id") ?? "") || undefined,
      name: String(form.get("name") ?? ""),
      note: String(form.get("note") ?? "") || undefined,
      latitude: num("latitude"),
      longitude: num("longitude"),
      accuracy: num("accuracy"),
      tagIds,
    }),
  });
  return { ok: true, created: true };
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_VARIANT = {
  active: "default",
  draft: "secondary",
  archived: "outline",
} as const;

/** Requests a geolocation fix on mount; returns coords (or null if denied /
 * unavailable) — a missing fix must never block a capture (PRD F2.7). */
function useGeolocation() {
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [state, setState] = useState<"pending" | "ready" | "off">("pending");

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setState("off");
      return;
    }
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

function TagCheckboxes({
  tags,
  selected,
}: {
  tags: Tag[];
  selected?: Set<string>;
}) {
  if (tags.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No tags yet —{" "}
        <Link to="/app/tags" className="underline">
          create some
        </Link>{" "}
        to label people.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <label
          key={tag.id}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
        >
          <Checkbox
            name="tagIds"
            value={tag.id}
            defaultChecked={selected?.has(tag.id)}
          />
          {tag.name}
        </label>
      ))}
    </div>
  );
}

function CaptureForm({ tags }: { tags: Tag[] }) {
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  const { coords, state } = useGeolocation();
  // A fresh client id per capture makes the create idempotent on retry.
  const [clientId, setClientId] = useState(() => crypto.randomUUID());
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.created) {
      formRef.current?.reset();
      setClientId(crypto.randomUUID());
      toast.success("Contact captured");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      ref={formRef}
      className="bg-card space-y-4 rounded-lg border p-5"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="id" value={clientId} />
      {coords && (
        <>
          <input type="hidden" name="latitude" value={coords.latitude} />
          <input type="hidden" name="longitude" value={coords.longitude} />
          <input type="hidden" name="accuracy" value={coords.accuracy} />
        </>
      )}
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="Leave blank to save as “Unknown”"
          autoFocus
          className="mt-1.5"
        />
      </div>
      <div>
        <Label>Tags</Label>
        <div className="mt-1.5">
          <TagCheckboxes tags={tags} />
        </div>
      </div>
      <div>
        <Label htmlFor="note">Note</Label>
        <Textarea
          id="note"
          name="note"
          placeholder="met at the bar, knows Rails, follow up re: hiring"
          className="mt-1.5"
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="form-label-mono text-muted-foreground text-[10px]">
          {state === "ready"
            ? `📍 location ready (±${Math.round(coords?.accuracy ?? 0)}m)`
            : state === "pending"
              ? "📍 locating…"
              : "📍 location off — saving without it"}
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save contact"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function EditContactDialog({
  contact,
  tags,
}: {
  contact: ContactWithTags;
  tags: Tag[];
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const busy = fetcher.state !== "idle";
  const selected = new Set(contact.tags.map((t) => t.id));

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.updated) {
      setOpen(false);
      toast.success("Contact updated");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="form-label-mono text-muted-foreground/70 hover:text-foreground text-[10px] transition-colors"
      >
        Edit
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>Update name, tags, and note.</DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="contactId" value={contact.id} />
          <div>
            <Label htmlFor={`name-${contact.id}`}>Name</Label>
            <Input
              id={`name-${contact.id}`}
              name="name"
              defaultValue={contact.name}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Tags</Label>
            <div className="mt-1.5">
              <TagCheckboxes tags={tags} selected={selected} />
            </div>
          </div>
          <div>
            <Label htmlFor={`note-${contact.id}`}>Note</Label>
            <Textarea
              id={`note-${contact.id}`}
              name="note"
              defaultValue={contact.note ?? ""}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

function ContactCard({
  contact,
  tags,
}: {
  contact: ContactWithTags;
  tags: Tag[];
}) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  return (
    <div
      className={`bg-card rounded-lg border p-4 ${busy ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-lg">{contact.name}</h3>
        <div className="flex shrink-0 items-center gap-3">
          <EditContactDialog contact={contact} tags={tags} />
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="contactId" value={contact.id} />
            <button
              type="submit"
              disabled={busy}
              className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors"
            >
              Delete
            </button>
          </fetcher.Form>
        </div>
      </div>
      {contact.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {contact.tags.map((t) => (
            <Badge key={t.id} variant="secondary">
              {t.name}
            </Badge>
          ))}
        </div>
      )}
      {contact.note && (
        <p className="text-muted-foreground mt-2 line-clamp-3 text-sm">
          {contact.note}
        </p>
      )}
      <p className="form-label-mono text-muted-foreground/70 mt-3 text-[10px]">
        {timeFormat.format(new Date(contact.capturedAt * 1000))}
        {contact.latitude != null && " · 📍"}
      </p>
    </div>
  );
}

export default function EventContacts({ loaderData }: Route.ComponentProps) {
  const { event, contacts, tags } = loaderData;
  return (
    <div>
      <Link
        to="/app"
        className="form-label-mono text-muted-foreground hover:text-foreground text-[10px]"
      >
        ← All events
      </Link>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <Badge variant={STATUS_VARIANT[event.status]}>{event.status}</Badge>
          <h1 className="mt-2 text-3xl">{event.name}</h1>
          {(event.date || event.venue) && (
            <p className="text-muted-foreground mt-1 text-sm">
              {event.date}
              {event.date && event.venue && " · "}
              {event.venue}
            </p>
          )}
        </div>
        <p className="form-label-mono text-muted-foreground">
          {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
        </p>
      </div>

      <div className="rule-perforated mt-6" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <div>
          <h2 className="form-label-mono text-muted-foreground mb-3">
            Capture
          </h2>
          <CaptureForm tags={tags} />
        </div>

        <div>
          <h2 className="form-label-mono text-muted-foreground mb-3">
            Recent captures
          </h2>
          {contacts.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
              No one captured yet. Add your first contact on the left.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {contacts.map((contact) => (
                <ContactCard key={contact.id} contact={contact} tags={tags} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
