import { createRequestHandler } from "react-router";
import { api } from "./api/instance";
import { MANIFEST, SERVICE_WORKER } from "./pwa";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // /api/* → Hono (controllers → services → repositories)
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }

    // PWA assets served from the Worker (root scope for the service worker).
    if (pathname === "/manifest.webmanifest") {
      return new Response(MANIFEST, {
        headers: {
          "content-type": "application/manifest+json",
          "cache-control": "public, max-age=3600",
        },
      });
    }
    if (pathname === "/sw.js") {
      return new Response(SERVICE_WORKER, {
        headers: {
          "content-type": "application/javascript",
          "cache-control": "no-cache",
          "service-worker-allowed": "/",
        },
      });
    }

    // Everything else → React Router SSR (dashboard, marketing)
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
