# Ari — Phase 1 PRD

**Status:** Draft
**Date:** 2026-06-12
**Owner:** Vagmi Mudumbai

## 1. Overview

Ari is a quick contact-capture app for networking events, conferences, and
cocktail parties. The core insight: when you meet someone at an event, you have
about ten seconds of social grace to record who they are. Business cards get
lost, LinkedIn requests are awkward mid-conversation, and your phone's contacts
app is too heavyweight. Ari gives you a single capture screen — name, a
photo (of them or their badge), a couple of pre-made tags, a one-line note —
and automatically records where you met them.

Before an event, you set it up on desktop or mobile: name the event, create the
tags you want to categorize people with ("investor", "hiring", "rails-dev",
"follow-up"). At the event, opening the app on your phone drops you straight
into **event mode** — a capture-first PWA optimized for one-handed,
ten-second entry. Afterwards, you review your contacts, see them on a map, and
search across everything you've ever captured.

### What phase 1 is not

- No OCR / extraction of names and contact info from badge photos.
- No CRM sync (HubSpot, Salesforce, etc.).
- No team sharing — contacts are personal to each user.
- Offline capture is a **stretch goal**, not a commitment (see §8).

These are deliberate deferrals; the data model should not preclude them.

## 2. Goals

1. Capturing a contact at an event takes **under 15 seconds** and at most
   ~4 taps from opening the app.
2. A user can prepare an event (event + tags) in **under 2 minutes**.
3. Every capture automatically records **where** it happened (with permission),
   so memory can be jogged later ("the person I met near the demo booths").
4. Post-event, a user can find any contact they've ever captured via search,
   tag filters, or the map.
5. The app is installable as a PWA and feels native-fast on mobile.

### Non-goals (phase 1)

- Extracting structured data from photos.
- Syncing to external CRMs or the phone's native contacts.
- Sharing events/contacts with teammates.
- Billing/subscription tiers (the template supports it; not wired for launch).

## 3. Users

A single persona for phase 1: **the active networker** — a founder, sales
person, developer-relations engineer, or recruiter who attends events
regularly and meets more people per evening than they can remember. They are
solo users; their contact list is personal and possibly sensitive (pipeline,
candidates), so privacy matters.

## 4. Core concepts & rules

| Concept | Description |
| --- | --- |
| **Event** | A named occasion with optional date, venue, and notes. Owns a set of contacts. States: `draft` → `active` → `archived`. |
| **Active event** | Exactly **one** event per user may be active at a time. Activating an event deactivates (archives or returns to draft) any other active event. |
| **Tag** | A short label created by the user, ahead of time or on the fly. Tags are **global to the user** (reusable across events), but an event has a curated "quick tags" subset shown on the capture screen. |
| **Contact** | A person captured at an event: name, photos, tags, note, geolocation, timestamp. Belongs to exactly one event. |
| **Event mode** | The mobile capture-first experience, entered automatically when a mobile visitor has an active event. |

All data is scoped per-user. The underlying schema keeps the template's
organization scoping (every record carries `organizationId` **and** `userId`)
so that team sharing can be enabled in a later phase without a migration of
ownership semantics.

## 5. User flows & functional requirements

### 5.1 Event preparation

**Flow:** Dashboard → "New event" → name it → pick/create quick tags →
activate.

- **F1.1** Create an event with: name (required), date (optional, defaults to
  today), venue/location text (optional), notes (optional).
- **F1.2** Create, rename, and delete tags. Tag names are unique per user,
  short (≤ 30 chars). Deleting a tag removes it from contacts (with a
  confirmation showing the affected count).
- **F1.3** Curate the event's **quick tags**: an ordered subset of the user's
  tags (suggested cap: 8) shown as one-tap chips on the capture screen.
- **F1.4** Activate an event. If another event is active, the user is prompted:
  "Archive '<other event>' and activate this one?" — one active event per
  user, enforced server-side.
- **F1.5** Archive an event manually. Archived events and their contacts
  remain fully browsable and searchable.

### 5.2 Event mode (mobile capture)

**Flow:** Open app on phone → land directly on the capture screen for the
active event.

- **F2.1** **Auto-detection:** when a logged-in user on a mobile-sized viewport
  visits the app and has an active event, they land in event mode (the capture
  screen). A visible affordance ("Exit event mode") returns to the regular
  dashboard. Desktop visitors land on the dashboard regardless, with a banner
  linking to the active event.
- **F2.2** The capture screen shows, top to bottom: camera/photo button, name
  field, quick-tag chips, note field, save button. Save is reachable
  one-handed.
- **F2.3** **Photo capture:** take a photo with the camera (rear camera
  default — badges; front-facing flip available) or pick from the photo
  library. A contact can have **multiple photos** (e.g., face + badge). Photos
  upload to R2; client-side downscale/compress before upload (target ≤ ~500 KB
  per photo) to be kind to conference Wi-Fi.
- **F2.4** **Name** is the only required field — and even that softly: saving
  with no name creates a contact named "Unknown" so a photo-only capture is
  never blocked mid-conversation.
- **F2.5** **Quick tags** toggle with one tap. An "add tag" affordance lets the
  user create a new tag on the fly; it is added to the user's tags and to the
  event's quick tags.
- **F2.6** **Note:** a single free-text field ("met at the bar, knows Rails,
  follow up re: hiring").
- **F2.7** **Geolocation:** on save, capture the device's current coordinates
  (and accuracy) via the Geolocation API. Permission is requested on first
  capture with a one-line explanation ("so you can remember *where* you met
  people"). If denied or unavailable, save proceeds without coordinates —
  location is never a blocker.
- **F2.8** After save: instant confirmation (toast + the new contact appearing
  at the top of a recent-captures strip), and the form resets for the next
  person. Total interaction budget: **< 15 seconds**.
- **F2.9** Recent captures are visible from event mode (a swipe/tab away) for
  quick fixes — tapping one opens it for edit.
- **F2.10** If the user has **no active event** on mobile, show a "Start an
  event" shortcut that creates and activates one in a single step (name only;
  tags can be added on the fly).

### 5.3 Review, search, and map

**Flow:** Dashboard → event → contact list / map; or global search from
anywhere.

- **F3.1** **Event contact list:** all contacts for an event, newest first,
  showing photo thumbnail, name, tags, note preview, and capture time. Filter
  by tag(s); sort by time or name.
- **F3.2** **Contact detail & edit:** view/edit all fields, add/remove photos
  and tags, delete the contact (with confirmation).
- **F3.3** **Global search:** a single search box covering contact names and
  notes across **all** events, with optional tag and event filters. Results
  show which event each contact came from.
- **F3.4** **Map view:** per-event map plotting each contact at its captured
  coordinates (pins cluster when overlapping — many captures at one venue will
  stack). Tapping a pin shows the contact card. Contacts without coordinates
  are listed below the map, not lost.
- **F3.5** A contact's detail page shows a small inline map of where they were
  met, when coordinates exist.

### 5.4 PWA

- **F4.1** Installable PWA: web app manifest (name, icons, standalone display,
  theme color) and a service worker that precaches the app shell so launches
  are instant.
- **F4.2** Mobile-first responsive design throughout; event mode is designed
  exclusively for phones.
- **F4.3** When the network drops mid-use, the app shows a clear offline
  indicator and fails saves gracefully (the form keeps its state so nothing
  typed is lost; the user can retry). True offline capture is stretch (§8).

## 6. Technical approach

Ari is built on the Mudhal template already in this repo; the PRD assumes
its stack and conventions rather than re-deciding them:

- **Stack:** React Router v7 (SSR) + Hono API on a single Cloudflare Worker;
  D1 + Drizzle ORM; Clerk auth with organizations; Tailwind v4 + shadcn/ui;
  strict controller → service → repository layering (the `items` slice is the
  reference pattern).
- **Data model (sketch):**
  - `events` — id, orgId, userId, name, date, venue, notes, status
    (`draft|active|archived`), timestamps. Partial uniqueness: one `active`
    per user, enforced in the service layer.
  - `tags` — id, orgId, userId, name (unique per user).
  - `event_quick_tags` — eventId, tagId, position.
  - `contacts` — id, orgId, userId, eventId, name, note, latitude, longitude,
    accuracy, capturedAt, timestamps.
  - `contact_tags` — contactId, tagId.
  - `contact_photos` — id, contactId, r2Key, width/height, byte size,
    createdAt.
- **Photos:** the `r2-uploads` skill (R2 bucket, presigned/worker-mediated
  uploads). Photos are private; served through an authenticated worker route,
  never a public bucket.
- **Maps:** a lightweight client-side map (MapLibre GL or Leaflet with OSM
  tiles) — no Google Maps dependency or API key in phase 1.
- **Mobile detection:** viewport/UA heuristic on the client plus a
  user-overridable preference ("don't auto-enter event mode"), so detection
  failures are recoverable, not trapping.
- **Search:** D1 `LIKE`-based search over name and note is sufficient at
  phase-1 scale (hundreds to low thousands of contacts per user); revisit
  (FTS) only if it proves slow.
- **Geolocation:** browser Geolocation API with a short timeout (~5 s) and
  `enableHighAccuracy` off by default — a rough fix fast beats a precise fix
  slow at a cocktail party. Stale/low-accuracy fixes are stored with their
  accuracy value so the map can render honestly.

## 7. Privacy & security

- Contacts are personal data about third parties; treat the whole dataset as
  sensitive. All reads/writes scoped to the owning user (and org) at the
  repository layer, per template convention.
- Photos in R2 are private and access-controlled; URLs are not guessable or
  long-lived.
- Geolocation is opt-in via the browser permission prompt, degradable, and
  only captured at the moment of save — no background tracking, ever.
- Contact deletion removes photos from R2, not just the database rows.

## 8. Stretch goal: offline capture

If phase 1 lands early, the next increment is true offline event mode:

- Queue captures (including photos) in IndexedDB when offline; sync to the
  server on reconnect (Background Sync where available, foreground retry
  otherwise).
- Capture geolocation locally even when offline (GPS works without network).
- Conflict surface is minimal by design — captures are append-only creates —
  which is why offline is feasible as a bolt-on rather than a rewrite.
- The phase-1 service worker and capture API should be written with this in
  mind (idempotent create with a client-generated id), but no offline UI ships
  unless the stretch is taken.

## 9. Future phases (explicitly deferred)

- **OCR/AI extraction:** pull name, company, email from badge photos.
- **CRM sync:** push contacts to HubSpot/Salesforce/etc.; export to vCard/CSV.
- **Team sharing:** org-level events where teammates pool captures (the data
  model already carries orgId for this).
- **Follow-up workflows:** reminders, "follow-up" status, email drafts.
- **Billing:** tier gating via the template's Polar skill.

## 10. Success metrics

- **Capture speed:** median time from app-open to contact-saved < 15 s
  (instrumented client-side).
- **Capture completeness:** ≥ 70 % of contacts have at least one photo;
  ≥ 60 % have at least one tag; ≥ 80 % have coordinates (a proxy for the
  permission flow not scaring people off).
- **Return usage:** ≥ 50 % of users who capture at an event open the review
  screen within 72 hours afterward.
- **Reliability:** zero data-loss reports from failed saves (F4.3 keeps form
  state on failure).

## 11. Open questions

1. Should "Unknown"-named photo-only captures (F2.4) be nudged for naming
   during post-event review (a "needs a name" filter)?
2. Quick-tag cap of 8 — right number, or should the chip row scroll?
3. When activating a new event while another is active (F1.4), is auto-archive
   the right behavior, or should the old event return to `draft`?
4. Does event mode need a hardware-volume-button or PWA-shortcut path to the
   camera, or is the on-screen button fast enough?
