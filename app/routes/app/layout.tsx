import { OrganizationSwitcher, UserButton } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, redirect } from "react-router";
import { Toaster } from "~/components/ui/sonner";
import type { Route } from "./+types/layout";

export async function loader(args: Route.LoaderArgs) {
  const auth = await getAuth(args);
  if (!auth.userId) {
    throw redirect("/sign-in");
  }
  // Child loaders 403 without an active org — bounce before they run.
  if (!auth.orgId) {
    throw redirect("/app/select-org");
  }
  return null;
}

function Wordmark() {
  return (
    <Link
      to="/app"
      className="font-heading text-lg font-semibold tracking-tight"
    >
      Ari<span className="text-stamp">*</span>
    </Link>
  );
}

const NAV = [
  { to: "/app", label: "Events", end: true },
  { to: "/app/tags", label: "Tags", end: false },
  { to: "/app/members", label: "Members", end: false },
] as const;

/** A thin bar when the device goes offline (PRD F4.3). */
function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="bg-destructive text-destructive-foreground py-1.5 text-center text-xs">
      You’re offline — anything you type is kept; saves retry when you reconnect.
    </div>
  );
}

export default function AppLayout() {
  return (
    <div className="min-h-screen">
      <OfflineBanner />
      <header className="border-b bg-card/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
          <Wordmark />
          <nav className="form-label-mono flex items-center gap-6">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive
                    ? "text-stamp underline decoration-dashed underline-offset-8"
                    : "text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <OrganizationSwitcher
              hidePersonal
              afterCreateOrganizationUrl="/app"
              afterSelectOrganizationUrl="/app"
            />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
