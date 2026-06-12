import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { ApiError, apiFetch } from "~/lib/api-client.server";
import { cn } from "~/lib/utils";
import type { Event } from "../../../workers/api/repositories/events-repo";
import type { Organization } from "../../../workers/api/repositories/organizations-repo";
import type { User } from "../../../workers/api/repositories/users-repo";
import type { Route } from "./+types/events-list";

export function meta() {
  return [{ title: "Events — Ari" }];
}

// The dashboard talks to the Hono API in-process (apiFetch) — same code path as
// a real network client, so loaders/actions stay thin. List (loader) + create /
// activate / archive / delete (action), rendered with a dialog and per-row forms.
export async function loader({ request }: Route.LoaderArgs) {
  const [me, eventsRes] = await Promise.all([
    apiFetch<{ org: Organization; user: User; orgRole: string | null }>(
      request,
      "/api/me",
    ),
    apiFetch<{ events: Event[] }>(request, "/api/events"),
  ]);
  return {
    org: me.org,
    user: me.user,
    orgRole: me.orgRole,
    events: eventsRes.events,
  };
}

function displayName(user: User): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email
  );
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");

  if (intent === "delete") {
    await apiFetch(request, `/api/events/${id}`, { method: "DELETE" });
    return { ok: true };
  }

  if (intent === "activate" || intent === "archive") {
    await apiFetch(request, `/api/events/${id}/${intent}`, { method: "POST" });
    return { ok: true };
  }

  // create
  const name = String(form.get("name") ?? "").trim();
  const date = String(form.get("date") ?? "").trim();
  const venue = String(form.get("venue") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  if (!name) return { ok: false, error: "Give your event a name." };

  try {
    await apiFetch(request, "/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        date: date || undefined,
        venue: venue || undefined,
        notes: notes || undefined,
      }),
    });
    return { ok: true, created: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 402) {
      return {
        ok: false,
        error: "You've hit your plan's event limit — archive one or upgrade.",
      };
    }
    throw e;
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const STATUS_VARIANT = {
  active: "default",
  draft: "secondary",
  archived: "outline",
} as const;

function EventCard({ event }: { event: Event }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  return (
    <div
      className={cn(
        "bg-card rounded-lg border p-5 transition-opacity",
        event.status === "active" && "ring-stamp/40 ring-2",
        busy && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Badge variant={STATUS_VARIANT[event.status]}>{event.status}</Badge>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={event.id} />
          <button
            type="submit"
            disabled={busy}
            className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors"
          >
            Delete
          </button>
        </fetcher.Form>
      </div>
      <h2 className="mt-3 truncate text-xl">{event.name}</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {event.date ? dateFormat.format(new Date(`${event.date}T00:00:00Z`)) : "No date"}
        {event.venue && <> · {event.venue}</>}
      </p>
      {event.notes && (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
          {event.notes}
        </p>
      )}
      <div className="rule-perforated mt-4" />
      <div className="mt-3 flex items-center justify-between gap-2">
        {event.status === "active" ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="archive" />
            <input type="hidden" name="id" value={event.id} />
            <Button type="submit" variant="outline" size="sm" disabled={busy}>
              Archive
            </Button>
          </fetcher.Form>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="activate" />
            <input type="hidden" name="id" value={event.id} />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "…" : "Activate"}
            </Button>
          </fetcher.Form>
        )}
      </div>
    </div>
  );
}

function NewEventDialog() {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.created) {
      setOpen(false);
      formRef.current?.reset();
      toast.success("Event created");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>New event</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
          <DialogDescription>
            Name it now; activate it when you arrive.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" ref={formRef} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="RailsConf 2026"
              autoFocus
              required
              className="mt-1.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                name="venue"
                placeholder="Moscone West"
                className="mt-1.5"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Who are you hoping to meet?"
              className="mt-1.5"
            />
          </div>
          {fetcher.data?.error && (
            <p className="text-destructive text-sm">{fetcher.data.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create event"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsList({ loaderData }: Route.ComponentProps) {
  const { org, user, orgRole, events } = loaderData;
  const role = (orgRole ?? "org:member").replace(/^org:/, "");
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">
            {org.name} · {org.plan} plan
          </p>
          <h1 className="mt-2 text-3xl">Events</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Signed in as{" "}
            <span className="text-foreground">{displayName(user)}</span> ·{" "}
            <span className="font-mono text-xs">{role}</span> of {org.name}
          </p>
        </div>
        <NewEventDialog />
      </div>

      <div className="rule-perforated mt-6" />

      {events.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">No events yet</span>
          <h2 className="text-2xl">Set up your first event in under 2 minutes.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Name the occasion, then activate it when you walk in — Ari drops you
            straight into capture mode.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
