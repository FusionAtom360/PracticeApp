# PracticeApp Technical Review

**Review date:** 2026-10-05  
**Scope:** frontend, backend API, Supabase schema, PWA behavior, deployment configuration, developer experience, and product presentation.

## Executive summary

PracticeApp is a React/TypeScript music-practice application backed by an Express API and Supabase. The product has a coherent core workflow: browse pieces, select measures, practice with a metronome, record outcomes, and review progress. The UI has a distinctive visual direction and the production bundle currently builds successfully.

The project is not yet at a maintainable production baseline. The most important issues are:

1. **The API has no authentication or authorization.** All song and practice-data reads and writes are reachable without an identity, while the server uses a Supabase service-role key that bypasses row-level security.
2. **The database schema enables RLS but defines no policies or ownership model.** This provides no useful multi-user security boundary, and the server's privileged client hides that gap.
3. **The backend performs multi-step mutations without transactions or compensating cleanup.** Partial song creation, event recording, media replacement, and progress updates can leave inconsistent database/filesystem state. The implementation changes in this branch address the primary mutation paths with database RPCs, atomic counter updates, idempotency keys, and media cleanup; deployment still requires applying the updated SQL.
4. **The frontend has no automated tests and fails its configured lint gate.** The TypeScript build passes, but lint reports 22 errors and 3 warnings, including a conditional hook call and several type-safety/side-effect issues.
5. **The client and server implement overlapping progress calculations.** Their formulas and data assumptions can diverge, making displayed progress difficult to trust and difficult to change safely.
6. **The offline mutation path can report a false success.** The service worker returns HTTP 202 after queueing a failed request, while application code treats any successful HTTP response as persisted data.
7. **Deployment and documentation are incomplete.** There is no README, root-level development contract, API documentation, migration workflow, test strategy, or documented environment configuration.

The recommended sequence is to establish the security/data-consistency boundary first, then create a tested domain layer, then refine the PWA and presentation. The existing visual foundation is worth preserving; the primary need is engineering hardening rather than a wholesale UI rewrite.

## System overview

### Runtime topology

- **Frontend:** React 19, TypeScript, Vite, React Router, Material UI icons, and CSS custom properties.
- **Backend:** Node.js ES modules, Express, `@supabase/supabase-js`, and `dotenv`.
- **Persistence:** Supabase tables for songs, measures, and practice events.
- **Media:** Uploaded image/audio files are written to `backend/data/images` and `backend/data/audio`, then exposed through Express static routes.
- **Hosting:** Firebase Hosting serves the frontend build and rewrites routes to `index.html`. The API base URL is selected from `VITE_API_BASE_URL`, with a development localhost fallback and a production hard-coded domain fallback.
- **Offline behavior:** A service worker caches GET requests and attempts to queue failed non-GET requests in IndexedDB for background sync.

### Main application flow

1. `App.tsx` installs routing and the global `SongProvider`.
2. `SongContext.tsx` loads the complete song collection and owns selection, audio-player, reload, and mutation operations.
3. Page components compose layout and UI components for selection, editing, overview, practice, and statistics.
4. `lib/songs.ts` contains API access, model types, and client-side progress/statistics calculations.
5. `backend/server.js` maps REST-like endpoints to Supabase queries and transforms database rows into the frontend shape.
6. The practice screen sends event data to the API; the backend updates event history and denormalized measure/song statistics.

## What is working well

### Product and interaction model

- The core domain is understandable: a song contains numbered measures, each measure has tempo targets and practice events.
- The separation between pages, layout components, and reusable UI components is a sensible starting structure.
- Selected measures are persisted per song in local storage, which supports returning users without requiring an account.
- The metronome has a meaningful domain model: tempo marks, pulse selection, practice modes, streaks, elapsed time, and success/failure events.
- The UI uses semantic headings, labels, button components, and some ARIA state such as `aria-pressed` and `aria-live`.

### Visual direction

- The design system in `frontend/src/index.css` is centralized and easy to tune. Typography, color, surfaces, radius, transitions, and progress colors are expressed as variables.
- The use of a serif display face with a sans-serif body face gives the product a recognizable musical/editorial character.
- The app appears to have intentional dark-mode support rather than merely inverted colors.
- Component-specific CSS keeps visual concerns close to the relevant component, while global tokens remain centralized.
- Static PWA icons, manifest metadata, and Firebase SPA rewrites show awareness of the installed/mobile use case.

### Current build state

- `npm run build` in `frontend` succeeds, including TypeScript project references and Vite bundling.
- `node --check server.js` in `backend` succeeds.
- Dependency lockfiles are present for both packages.

## High-priority findings

### 1. Unauthenticated privileged API (critical production blocker)

**Evidence:** `backend/server.js` creates a Supabase client with `SUPABASE_SERVICE_ROLE_KEY` and exposes all song, measure, practice-event, deletion, and progress-reset routes without middleware that verifies an identity. The `Authorization` header is allowed by CORS but never parsed or validated.

**Impact:**

- Any reachable caller can read the full song library and detailed practice history.
- Any caller can create, modify, or delete songs and measures.
- Any caller can insert arbitrary practice events or clear progress.
- The service-role client bypasses Supabase RLS, so database-side protections cannot compensate.
- `Access-Control-Allow-Origin: *` permits browser-based cross-origin calls, although CORS must not be treated as authorization.

**Required remediation:**

1. Decide whether the product is single-user or multi-user. Do not leave the data model ambiguous.
2. For a multi-user product, add an owner/user identifier to songs and enforce ownership on every query and mutation.
3. Validate Supabase JWTs server-side and reject missing, invalid, or expired tokens.
4. Use a user-scoped Supabase client or explicit ownership predicates; keep service-role access limited to narrowly justified administrative operations.
5. Replace wildcard CORS with an allowlist of deployed origins.
6. Add integration tests for unauthenticated access, cross-user reads, cross-user writes, and destructive operations.

### 2. RLS is enabled without policies or ownership columns

**Evidence:** `backend/supabase/schema.sql` enables RLS on all three tables, but defines no policies and no user/owner column.

**Impact:**

- A client using an anon/user-scoped key will not have a usable access policy.
- The schema cannot express per-user ownership.
- The current service-role server masks this design failure until the application is exposed to multiple users or the key strategy changes.

**Recommendation:** Treat the schema as an executable security contract. Add an ownership model, indexes for ownership queries, explicit `select/insert/update/delete` policies, and a migration process. Include policy tests in CI or a repeatable local Supabase test environment.
<!-- 
### 3. Non-transactional multi-step mutations

**Evidence:** Song creation inserts a song and then inserts measures in separate requests. Practice-event recording inserts an event, updates elapsed time, recomputes stats, and later updates song elapsed time. Media files are written/deleted independently of database updates.

**Failure modes:**

- A song row can exist without all measures if the second insert fails.
- An uploaded file can remain orphaned if the database write fails.
- A database row can point at a missing file if replacement cleanup or a later operation fails.
- An event can be inserted while denormalized counters remain stale.
- Concurrent event requests can lose elapsed-time increments because the code reads a value, adds to it in JavaScript, and writes it back.
- Multi-measure event requests can update some measures before a later measure fails.

**Recommendation:** Move domain mutations into database functions/RPCs or a backend transaction boundary. Use atomic increments, idempotency keys for event writes, and an explicit media lifecycle (temporary upload, commit, cleanup job). Return a mutation result only after all required state is consistent. -->

<!-- ### 4. Input, upload, and resource controls are too broad

**Evidence:** The original API accepted JSON bodies up to `100mb`; file payloads were base64 strings; uploaded filenames influenced the extension; and there were no visible MIME, signature, dimension, duration, or quota checks. The implementation now reduces these risks with a 48MB JSON limit, server-side content-signature checks, safe generated extensions, media size limits, field/range limits, event batch limits, request IDs, and an in-process per-IP rate limit. The base64 transport remains a known scalability limitation.

**Impact:**

- Base64 increases memory and payload cost substantially.
- Large requests can exhaust process memory or saturate bandwidth.
- Arbitrary file types can be stored under misleading extensions and served as static content.
- There is no per-user or per-IP rate limit.
- Measure counts, tempo ranges, title lengths, event batch sizes, and elapsed time values have weak or incomplete bounds.

**Recommendation:** Use multipart streaming or object storage with signed uploads. Enforce byte, count, duration, and dimension limits; validate content signatures; normalize filenames; define numeric ranges; cap event batches; add rate limiting and request IDs; and return structured validation errors.

**Implementation status:** The bounded-input and validation portions are implemented in `backend/server.js`, `backend/supabase/schema.sql`, `frontend/src/lib/songs.ts`, and the create-song form. Multipart streaming/object storage, media dimension/duration validation, distributed rate limiting, and quota accounting remain follow-up work. -->

<!-- ### 5. PWA mutation queue can create false success

**Evidence:** `frontend/public/sw.js` catches failed non-GET requests, stores them, registers background sync, and returns a `202` JSON response with `{ queued: true }`. This path is now explicit: client mutation helpers detect queued responses and report a pending mutation instead of treating it as committed.

**Impact:** A practice event or edit can appear to have succeeded even though it is only queued, and the UI may update or navigate as if the server committed it. Retried requests can also duplicate non-idempotent events. The queue does not visibly expose pending, failed, or conflict states.

**Recommendation:** Either remove mutation interception until it is productized, or implement an explicit outbox protocol:

- return a distinct response shape and make clients represent `queued` separately from `saved`;
- attach idempotency keys to every mutation;
- persist queue status, retry count, and last error;
- reconcile server state after replay;
- surface pending/offline status to the user;
- handle authentication refresh and expired requests;
- define conflict behavior for edits and destructive actions.

**Implementation status:** The explicit outbox portion is implemented in `frontend/public/sw.js`, `frontend/src/lib/songs.ts`, and `frontend/src/context/SongContext.tsx`. Queued requests retain their original headers/body, including idempotency keys; retry attempts and last errors are stored; 2xx replay results are removed and reported as synced; permanent 4xx failures are removed and reported to the page; and transient failures remain queued. Conflict resolution, durable user-facing queue history, and authentication refresh remain follow-up work. -->

## Code quality and structure

### Frontend state ownership is too broad

`SongContext.tsx` owns server data, loading/error state, measure selection, local storage synchronization, audio playback, fades, optimistic event generation, and mutation orchestration. This makes unrelated changes affect a large provider and makes failures difficult to isolate.

Recommended boundaries:

- `SongRepository` or API module for HTTP and response validation.
- `SongStore` for server entities and loading/error state.
- `PracticeSessionStore` for selected measures, session timer, streak, and event draft state.
- `AudioPlayer` hook/service for `HTMLAudioElement` lifecycle.
- Small domain functions for progress and statistics.

The provider can then expose composed hooks without becoming the implementation location for every concern.

<!-- ### Backend is a single route-and-domain module

The original `backend/server.js` combined configuration, CORS, parsing, media persistence, Supabase queries, serialization, route handlers, statistics calculation, and process startup. It has now been decomposed into focused modules under `backend/src`, while `backend/server.js` remains a small process entry point.

A maintainable decomposition would be:

```text
backend/
  src/
    app.js
    config.js
    middleware/
    routes/songs.js
    routes/practice.js
    services/song-service.js
    services/practice-service.js
    repositories/supabase-repository.js
    media/media-store.js
    domain/progress.js
    schemas/
  migrations/
```

Keep the HTTP layer responsible for status codes and request parsing; keep domain services responsible for invariants and repositories responsible for persistence.

**Implementation status:** The first decomposition pass is complete:

- `src/config.js` owns environment validation, limits, paths, and the Supabase client.
- `src/middleware/request.js` owns request IDs, rate limiting, CORS, and payload errors.
- `src/media/media-store.js` owns media directories, content-signature validation, writes, and cleanup.
- `src/domain/progress.js` owns canonical progress calculation.
- `src/repositories/song-repository.js` owns Supabase query/RPC access.
- `src/serializers/song.js` owns the public API song shape.
- `src/routes/songs.js` owns song/measure CRUD and progress clearing.
- `src/routes/practice.js` owns practice-event recording and measure deletion.
- `src/app.js` composes middleware and routers; `server.js` only starts the listener.

The next structural step is extracting song and practice business operations from route handlers into service modules, then adding route-level integration tests against a repository boundary. -->

### Type safety is incomplete

The frontend contains multiple `any` uses in the domain model and context, including event values and generated events. This weakens exactly the part of the application that crosses the database/API boundary.

Define discriminated event types, for example:

- `PracticeEvent` with `type`, `outcome`, `timestamp`, and nullable `value`;
- `MetronomeEvent` requiring a positive BPM;
- `ManualPracticeEvent` requiring a null value.

Validate API responses at runtime as well as compile time. TypeScript interfaces do not protect the app from malformed or stale server payloads.

### Error handling is inconsistent

There are many empty catches or ignored failures around audio and local storage. Some are reasonable for optional browser capabilities, but the code does not consistently distinguish expected capability failures from data-loss failures. The audio player can fail silently, and local-storage persistence silently disappears when unavailable.

Use narrow catches with a specific policy:

- ignore only explicitly optional operations;
- log diagnostic details in development;
- set user-visible state for failed persistence;
- never convert a failed write into a successful-looking UI state.

### Practice startup and historical progress data loading

The list endpoint intentionally returns summary measures without raw events. That shape is sufficient for list rendering, but it cannot initialize a practice session from event history or calculate the pre-24-hour comparison on the song page. The song overview now loads the detailed song endpoint and merges its event-bearing measures into the summary model. Practice startup also falls back to the server's canonical `averageTempo` when a summary measure has no local event array, rather than falling back directly to one quarter of the target tempo. This preserves the latest known tempo (for example, a recent 110–112 BPM history no longer starts at 39 BPM for a 156 BPM target) while retaining the server summary as the source for initial list data.

<!-- ### Duplicate and divergent business logic

`frontend/src/lib/songs.ts` calculates progress, average tempo, accuracy, and historical progress, while `backend/server.js` calculates and serializes related progress fields. This has now been aligned around the canonical rules documented in `metronome_logic.md`:

- both paths use the latest usable metronome BPM rather than an implicit array position or rolling average;
- both use the latest 50 chronologically ordered outcomes;
- both use 2% daily decay from the latest event;
- both clamp progress to `[0, 1]` and use a fixed 50-attempt accuracy denominator.

The server is authoritative for summary/list metrics; the client applies the same rules only when detailed events are available. The complete contract and worked examples are in `metronome_logic.md`. -->

## Implementation gaps

### Testing

There are no tracked unit, integration, component, or end-to-end tests and no test script in either package manifest. This is a major gap because the highest-risk behavior is stateful and multi-step:

- progress calculations and decay;
- tempo mark transitions and metronome timing;
- selection persistence;
- API validation and ownership;
- multi-measure event recording;
- media replacement/deletion;
- offline queue replay and duplicate prevention;
- route refreshes under Firebase hosting.

Minimum useful test plan:

1. Pure domain tests for all progress/statistics formulas and edge cases.
2. API integration tests against a disposable Supabase/Postgres instance or mocked repository.
3. React tests for create/edit/practice flows and error/queued states.
4. One browser smoke suite covering load, create, practice, reload, and offline recovery.

### Database migrations and operational safety

The schema is a one-shot SQL file using `create table if not exists` and `alter table`, but there is no migration history, rollback process, seed data, or documented deployment command. Schema changes can therefore drift between environments.

Adopt Supabase migrations, record indexes and policies in migration files, and add a repeatable seed/reset process for local development.

### API contract

There is no documented request/response schema, version prefix, pagination strategy, error envelope, or compatibility policy. The frontend relies on implicit shapes and hand-written field translation.

Add runtime schemas (for example with a validation library), API versioning or a clearly documented stability policy, and generated or checked API types. Define whether `POST /songs/:id/update` is intentionally used instead of `PATCH`, and standardize route semantics.

### Observability

The backend logs raw errors but has no structured logging, request correlation, health endpoint, metrics, or dependency readiness check. Startup verifies only that environment variables exist, not that Supabase is reachable.

Add:

- `/healthz` and `/readyz`;
- structured request/error logs with request IDs;
- latency and error metrics;
- startup configuration validation without printing secrets;
- alerts for failed writes and queue backlogs.

### Configuration and deployment

The frontend hard-codes a production API fallback in source. This makes environment mistakes easy to ship and couples the build to one deployment. The backend has no documented production start command, reverse-proxy assumptions, TLS requirement, or media persistence strategy.

Document environment variables and deployment prerequisites. Prefer an explicit required production variable over a silent fallback. If the backend filesystem is ephemeral, move media to durable object storage before relying on uploads.

## Presentation and UX assessment

### Strengths

- The visual language is more distinctive than a default component-library application.
- The typography and warm neutral palette fit a focused practice tool.
- The product metaphor is clear: library, piece, measures, practice session, and progress.
- Dark mode and installable PWA assets support repeated use.

### Risks and gaps

- The application appears to prioritize the happy path. Loading, empty, offline, queued, unauthorized, and partial-failure states need explicit UX.
- Error messages are mostly transient local state; there is no consistent error banner/toast pattern or retry affordance.
- The practice page modifies document overflow directly, which should be carefully tested across navigation and mobile browser chrome.
- Audio autoplay/permission failures are likely to be silent or confusing to users.
- Large form controls and file uploads need visible constraints, upload progress, file size/type feedback, and cancellation.
- Accessibility is uneven. Some components use ARIA well, but a systematic keyboard, focus, contrast, reduced-motion, and screen-reader review is not evident.
- The service worker caches responses generically. Without a cache policy for API data and versioned invalidation, users can see stale song/progress data.
- The app has no visible product documentation or onboarding. A first-time user must infer the practice model and the meaning of progress/accuracy.

Presentation work should follow reliability work: a polished interface that misrepresents queued or failed practice data is worse than a less polished interface with accurate state.

## Validation results

Commands run on 2026-10-05:

| Command | Result |
|---|---|
| `cd frontend; npm run build` | Pass. TypeScript and Vite production build completed. |
| `cd backend; node --check server.js` | Pass. |
| `cd frontend; npm run lint` | Fail. 22 errors and 3 warnings. Reported issues include conditional hook usage, state updates in effects, `any`, unused expressions/variables, empty catches, and fast-refresh export rules. |

The lint failure is not merely cosmetic: at least one reported conditional-hook violation can cause incorrect hook state ordering, and the ignored-catch/type issues make behavior harder to reason about.

## Prioritized remediation roadmap

### Phase 0: Stop unsafe production exposure

- Rotate the Supabase service-role credential if it has ever been shared or copied.
- Add authentication and authorization middleware.
- Define single-user versus multi-user scope.
- Add ownership columns and RLS policies if multi-user.
- Restrict CORS.
- Disable or clearly gate destructive routes until authorization exists.

### Phase 1: Make writes correct

- Introduce a repository/service boundary.
- Make event writes atomic and idempotent.
- Add transaction/RPC boundaries for song creation, event recording, and progress reset.
- Replace base64 uploads with validated multipart/object-storage uploads.
- Add request limits, rate limiting, and structured validation errors.
- Remove the false-success offline mutation response or implement an explicit outbox contract.

### Phase 2: Establish quality gates

- Fix the current lint errors and warnings.
- Add unit tests for progress and tempo logic.
- Add API integration tests and ownership tests.
- Add a browser smoke test for the primary workflow.
- Add CI steps for lint, type-check/build, tests, secret scanning, and migration validation.

### Phase 3: Reduce complexity

- Split `SongContext.tsx` and `backend/server.js`.
- Centralize shared domain types and progress formulas.
- Add runtime response validation.
- Add migrations, seed data, API documentation, health checks, and structured logging.

### Phase 4: Improve product presentation

- Design explicit loading, empty, offline, queued, conflict, and retry states.
- Audit accessibility and responsive behavior.
- Add onboarding/help for progress semantics and practice modes.
- Add cache versioning and a deliberate data freshness policy.
- Add upload progress and media playback diagnostics.

## Final assessment

PracticeApp has a promising and coherent product foundation, and the frontend build is already capable of producing a deployable artifact. The visual system and practice-domain vocabulary are stronger than the surrounding engineering documentation suggests.

The project should currently be treated as a prototype or controlled single-user deployment, not as a secure multi-user service. The service-role API without authentication, the absence of RLS policies/ownership, non-atomic writes, and lack of tests are foundational risks. Address those before investing heavily in additional features or visual polish. Once the data and domain boundaries are made explicit, the existing component structure and design language provide a reasonable base for a maintainable product.

## Mutation-hardening implementation

The primary non-transactional mutation paths have been hardened as follows:

- `create_song_with_measures` inserts a song and its complete measure set in one database function transaction.
- `record_practice_events` validates all requested measures before inserting, writes all events together, atomically increments elapsed time, recalculates denormalized counters, and increments song elapsed time without a read-modify-write race.
- Event requests require an `X-Idempotency-Key`; duplicate retries return the current canonical song state without inserting another event.
- Song creation removes newly written media when the database transaction fails.
- Song media replacement commits the database pointer before deleting old media and removes newly written media only when the database update did not commit.

The SQL functions in `backend/supabase/schema.sql` must be applied to the target Supabase project before deploying the updated backend. A migration history should be introduced before making further schema changes.

The multi-user authentication remediation adds Supabase email/password sign-in, server-side JWT validation, owner-scoped song queries and RPCs, RLS ownership policies, and an origin allowlist. Apply `backend/supabase/migrations/20261005_multi_user_ownership.sql` after assigning existing songs to a real `auth.users.id`, configure `ALLOWED_ORIGINS`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`, and redeploy both applications. The migration intentionally fails at `owner_id set not null` until legacy rows have an owner.

Firebase Hosting builds use the committed `frontend/.env` public configuration. The workflow must not set missing GitHub secrets as `VITE_*` environment variables because empty workflow values override the committed file. These frontend values are public client configuration; keep the backend service-role key out of the frontend and configure `ALLOWED_ORIGINS` explicitly on the backend.

Supabase Auth must also be configured with the deployed frontend URL. Set the Supabase Auth Site URL to `https://practiceapp-f1d1b.web.app` and add both that URL and `http://localhost:5173` to the Auth redirect allow list. Signup now passes `window.location.origin` as `emailRedirectTo`, so production signup links return to Firebase Hosting rather than a stale localhost URL.

The login page uses the application design tokens and the client enforces a 30-day absolute session age. Configure the Supabase Auth JWT/session maximum duration to 30 days in the dashboard as the authoritative server-side limit; the client-side check is a defense-in-depth fallback.

The event RPC now also has a standalone migration at `backend/supabase/migrations/20261005_record_practice_events.sql`. If the deployed API returns `PRACTICE_EVENT_RPC_UNAVAILABLE`, apply that migration to the production Supabase project and retry the event; the request ID in the response should be used to correlate server logs.

Practice-session failure reporting now asks which active measure failed. Measures before the selected failure are recorded as successes, only the selected measure is recorded as a failure, and the skip option records failure for the complete active set.

Practice BPM is persisted per song and active-measure scope, so a refresh restores the user's current tempo instead of reinitializing from the low fallback tempo. The server-derived practice seed remains the first-use fallback.
