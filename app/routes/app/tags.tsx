import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { ApiError, apiFetch } from "~/lib/api-client.server";
import type { Organization } from "../../../workers/api/repositories/organizations-repo";
import type { Tag } from "../../../workers/api/repositories/tags-repo";
import type { User } from "../../../workers/api/repositories/users-repo";
import type { Route } from "./+types/tags";

export function meta() {
  return [{ title: "Tags — Ari" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [me, tagsRes] = await Promise.all([
    apiFetch<{ org: Organization; user: User }>(request, "/api/me"),
    apiFetch<{ tags: Tag[] }>(request, "/api/tags"),
  ]);
  return { org: me.org, tags: tagsRes.tags };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();

  try {
    if (intent === "delete") {
      await apiFetch(request, `/api/tags/${id}`, { method: "DELETE" });
      return { ok: true };
    }
    if (intent === "rename") {
      if (!name) return { ok: false, error: "Tag name can't be empty." };
      await apiFetch(request, `/api/tags/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return { ok: true, renamed: true };
    }
    // create
    if (!name) return { ok: false, error: "Give your tag a name." };
    await apiFetch(request, "/api/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return { ok: true, created: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      return { ok: false, error: `You already have a tag named "${name}".` };
    }
    throw e;
  }
}

function AddTagForm() {
  const fetcher = useFetcher<typeof action>();
  const formRef = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.created) {
      formRef.current?.reset();
      toast.success("Tag created");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      ref={formRef}
      className="flex items-start gap-2"
    >
      <input type="hidden" name="intent" value="create" />
      <div className="flex-1">
        <Input
          name="name"
          placeholder="investor, hiring, rails-dev…"
          maxLength={30}
          required
          aria-label="New tag name"
        />
        {fetcher.data?.error && !fetcher.data?.renamed && (
          <p className="text-destructive mt-1 text-sm">{fetcher.data.error}</p>
        )}
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Adding…" : "Add tag"}
      </Button>
    </fetcher.Form>
  );
}

function TagRow({ tag }: { tag: Tag }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.renamed) {
      toast.success("Tag renamed");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="bg-card flex items-center gap-2 rounded-lg border p-3">
      <fetcher.Form method="post" className="flex flex-1 items-center gap-2">
        <input type="hidden" name="intent" value="rename" />
        <input type="hidden" name="id" value={tag.id} />
        <Input
          name="name"
          defaultValue={tag.name}
          maxLength={30}
          className="flex-1"
          aria-label={`Rename ${tag.name}`}
        />
        <Button type="submit" variant="outline" size="sm" disabled={busy}>
          Save
        </Button>
      </fetcher.Form>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={tag.id} />
        <button
          type="submit"
          disabled={busy}
          className="form-label-mono text-muted-foreground/60 hover:text-destructive px-2 text-[10px] transition-colors"
        >
          Delete
        </button>
      </fetcher.Form>
    </div>
  );
}

export default function Tags({ loaderData }: Route.ComponentProps) {
  const { org, tags } = loaderData;
  return (
    <div>
      <div>
        <p className="form-label-mono text-muted-foreground">
          {org.name} · {org.plan} plan
        </p>
        <h1 className="mt-2 text-3xl">Tags</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reusable labels for the people you meet. Create them ahead of an event
          or on the fly while capturing.
        </p>
      </div>

      <div className="rule-perforated mt-6" />

      <div className="mt-6 max-w-xl">
        <AddTagForm />
      </div>

      {tags.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">No tags yet</span>
          <h2 className="text-2xl">Your first tag is one click away.</h2>
        </div>
      ) : (
        <div className="mt-8 grid max-w-xl gap-3">
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
        </div>
      )}
    </div>
  );
}
