# PracticeApp

PracticeApp is a web application for organizing music and practicing individual measures with a metronome. It tracks song metadata, measure targets, practice events, tempo progress, accuracy, elapsed practice time, and historical progress.

The application is designed for authenticated users. Each song belongs to one Supabase user, and the API scopes all song, measure, and practice-event operations to the signed-in user.

## Features

- Song library with title, composer, subtitle, image, and audio metadata.
- Numbered measures with initial and target tempos.
- Metronome practice sessions with adjustable tempo and pulse.
- Practice modes:
  - Rapid
  - Speed
  - Stability
- Success and failure tracking for selected measures.
- Failure-location reporting:
  - Choose the first measure that failed.
  - Record preceding measures as successful.
  - Record the selected measure as failed.
  - Skip and record failure for the entire active set.
- Progress, accuracy, tempo, elapsed-time, and last-practice summaries.
- Historical progress comparison against the state before the previous 24-hour period.
- Offline mutation outbox with idempotency keys and retry handling.
- Supabase email/password authentication.
- Light/dark theme support with system-theme detection.
- Firebase Hosting deployment for the frontend.

## Technology

### Frontend

- React
- TypeScript
- Vite
- React Router
- Material UI icons
- Supabase Auth
- Firebase Hosting

### Backend

- Node.js
- Express
- Supabase JavaScript client
- PostgreSQL functions/RPCs
- Supabase Row Level Security

## Repository structure

```text
.
├── backend/
│   ├── server.js
│   ├── src/
│   │   ├── app.js
│   │   ├── config.js
│   │   ├── domain/
│   │   ├── media/
│   │   ├── middleware/
│   │   ├── repositories/
│   │   ├── routes/
│   │   └── serializers/
│   └── supabase/
│       ├── schema.sql
│       └── migrations/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── lib/
│   │   └── pages/
│   ├── public/
│   │   └── sw.js
│   └── firebase.json
├── metronome_logic.md
└── TECHNICAL_REVIEW.md
```

## Prerequisites

- Node.js compatible with the installed Vite and TypeScript versions.
- A Supabase project.
- A Supabase user account.
- Firebase CLI access for frontend deployment.

## Configuration

### Frontend

Create `frontend/.env` for local development:

```text
VITE_API_BASE_URL=http://localhost:3000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-or-publishable-key
```

The `VITE_*` values are public browser configuration and are compiled into the frontend bundle. The Supabase anon/publishable key is not a secret. Never put the Supabase service-role key in the frontend.

### Backend

Create `backend/.env`:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ALLOWED_ORIGINS=https://practiceapp-f1d1b.web.app,http://localhost:5173
```

The service-role key must remain server-side. Do not commit `backend/.env`, place it in frontend configuration, or expose it through logs or client responses.

## Database setup

Apply the database schema and migrations in Supabase SQL Editor or through your migration process.

For a new database:

1. Apply `backend/supabase/schema.sql`.
2. Create a Supabase Auth user.
3. Apply the ownership migration:

   ```text
   backend/supabase/migrations/20261005_multi_user_ownership.sql
   ```

For an existing database:

1. Apply the event/idempotency migration:

   ```text
   backend/supabase/migrations/20261005_record_practice_events.sql
   ```

2. Add `owner_id` to existing songs and assign each row to a real `auth.users.id`.
3. Verify no songs have a null owner.
4. Apply `20261005_multi_user_ownership.sql`.

Example legacy-data preparation:

```sql
alter table public.songs
    add column if not exists owner_id uuid references auth.users(id) on delete cascade;

update public.songs
set owner_id = 'YOUR_SUPABASE_USER_UUID'
where owner_id is null;

select id, title
from public.songs
where owner_id is null;
```

The final query must return no rows before the ownership migration sets `owner_id` to `not null`.

## Supabase Auth configuration

In Supabase **Authentication → URL Configuration**:

- Set the Site URL to:

  ```text
  https://practiceapp-f1d1b.web.app
  ```

- Add these redirect URLs:

  ```text
  https://practiceapp-f1d1b.web.app
  http://localhost:5173
  ```

Signup requests use the current frontend origin for email confirmation redirects.

The application enforces a 30-day maximum session age on the client. Configure the equivalent session/JWT lifetime in Supabase as the authoritative server-side limit.

## Running locally

Install frontend dependencies:

```powershell
Set-Location frontend
npm install
npm run dev
```

In another terminal, install and run the backend:

```powershell
Set-Location backend
npm install
npm start
```

The frontend development server normally runs at `http://localhost:5173`, and the backend runs on the configured port, normally `3000`.

## Build and validation

Frontend production build:

```powershell
Set-Location frontend
npm run build
```

Frontend lint:

```powershell
Set-Location frontend
npm run lint
```

Backend syntax validation:

```powershell
Set-Location backend
node --check server.js
Get-ChildItem src -Recurse -File | ForEach-Object { node --check $_.FullName }
```

There is currently no complete automated integration-test suite. High-value future coverage includes authentication isolation, RLS policies, RPC migrations, offline replay, practice metrics, and media lifecycle behavior.

## API overview

The API is rooted at the configured `VITE_API_BASE_URL` and requires a Supabase access token:

```http
Authorization: Bearer <supabase-access-token>
```

Common routes:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/songs` | List the signed-in user's songs |
| `GET` | `/songs/:id` | Load a song with detailed measure/event history |
| `POST` | `/songs/create` | Create a song and all measures atomically |
| `POST` | `/songs/:id/update` | Update song metadata or media |
| `PATCH` | `/songs/:id/measures/:number` | Update measure settings |
| `POST` | `/songs/:id/measures/:number/events` | Record practice events |
| `POST` | `/songs/:id/clear-progress` | Clear a song's practice history |
| `POST` | `/songs/:id/measures/:number/clear-progress` | Clear one measure's history |
| `DELETE` | `/songs/:id/measures/:number` | Delete a measure |
| `DELETE` | `/songs/:id` | Delete a song |

Practice-event mutations require an `X-Idempotency-Key` header. Multi-measure event writes are handled by the database RPC so event insertion, counters, elapsed time, and summary updates are committed together.

## Practice metrics

The canonical metric contract is documented in [metronome_logic.md](./metronome_logic.md).

The important rules are:

- Progress uses the latest usable metronome BPM.
- Accuracy is based on the latest 50 chronological outcomes.
- The accuracy denominator is always 50.
- Progress decays by `0.98` for each full day since the latest event.
- Historical progress uses events strictly before the 24-hour cutoff.
- Progress is clamped between `0` and `1`.
- The server is authoritative for summary/list metrics.
- The client calculates detailed or historical values only when event history is available.

## Security model

- Supabase JWTs are validated by the backend.
- Songs have an `owner_id` linked to `auth.users`.
- Song, measure, and practice-event data is protected by ownership predicates and RLS policies.
- CORS uses an explicit origin allowlist.
- The backend uses the service-role key only for server-side database operations.
- Static media is served separately from authenticated API operations.

Treat the project as requiring a correctly configured Supabase and backend environment. Do not deploy the backend without authentication, ownership migration, RLS policies, and a valid `ALLOWED_ORIGINS` value.

## Deployment

The frontend is deployed to Firebase Hosting through:

- `.github/workflows/firebase-hosting-merge.yml`
- `.github/workflows/firebase-hosting-pull-request.yml`

The frontend build uses the committed public `frontend/.env` configuration unless the workflow supplies replacement values. If using GitHub Actions variables instead, ensure all required `VITE_*` values are present; empty workflow variables override values loaded from `.env`.

The backend is deployed separately. Configure its environment with the Supabase URL, service-role key, and allowed frontend origins before restarting the service.

After deployment, verify:

1. The frontend loads without missing Supabase configuration errors.
2. Signup confirmation redirects to Firebase Hosting.
3. API requests include a bearer token.
4. The backend returns the expected `Access-Control-Allow-Origin` header.
5. A signed-in user sees only their own songs.
6. Practice events are recorded and duplicate retries do not create duplicate rows.

## Additional documentation

- [metronome_logic.md](./metronome_logic.md) — canonical practice and progress formulas.
- [TECHNICAL_REVIEW.md](./TECHNICAL_REVIEW.md) — architectural review, risks, and remediation history.
