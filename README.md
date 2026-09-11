# Pulse Classroom

Pulse Classroom is a small, production-ready live classroom response app. A teacher creates a room and launches multiple-choice, true/false, numeric, or open-text questions. Students join from a link, six-character code, or QR code without providing an email address. Responses, question transitions, and audit events are persisted in Supabase and update the teacher and presentation screens live.

The frontend is a React + TypeScript single-page application built with Vite. Supabase provides email/password teacher authentication, anonymous student authentication, Postgres, Row Level Security (RLS), transactional RPCs, and Realtime. There is no custom application server.

## Prerequisites

- Node.js 20 LTS or newer and npm
- A [Supabase](https://supabase.com/) account and an empty hosted project
- Git
- Optional: the Supabase CLI and a Docker-compatible runtime for the local database/seed workflow

## Hosted Supabase setup

### 1. Install the application

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

The committed lockfile also supports `npm ci` for a clean, reproducible CI/deployment install.

### 2. Create and configure a Supabase project

Create a project in the Supabase dashboard and wait for it to become ready. Configure Auth before testing the app:

1. In **Authentication -> Sign In / Providers**, keep the **Email** provider enabled and allow email signups.
2. In the Authentication general settings, enable **Allow anonymous sign-ins**. The student join flow calls `signInAnonymously()` before it calls the student RPCs.
3. Decide whether to require email confirmation. Keeping **Confirm email** enabled is recommended for a deployed app; the signup screen will ask the teacher to confirm and then sign in. Disabling it is convenient for a throwaway development project.
4. In **Authentication -> URL Configuration**, set **Site URL** to the frontend origin. Use `http://localhost:5173` during local-only testing and the canonical HTTPS URL after deployment. Add any localhost or preview origins you intend to use to the allowed redirect URLs as well.

For a real deployment, configure a production SMTP provider for reliable teacher confirmation emails and review the anonymous-sign-in rate limit and CAPTCHA/Turnstile options. Anonymous sign-ins create real Supabase Auth users, and many students may share one school network/IP.

Supabase documents these settings in [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), and [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

### 3. Apply the database migration

Apply [`supabase/migrations/0001_initial.sql`](supabase/migrations/0001_initial.sql) to a new project exactly once. It creates the schema, constraints, teacher-profile trigger/backfill, RLS policies, RPCs, audit logging, safe student state projection, grants, and Realtime publication entries. Do not execute the RPC definitions separately.

Choose one of the following methods for a given project. The CLI method is recommended because it records migration history.

#### Option A: Supabase SQL Editor

1. Open **SQL Editor -> New query** in the Supabase dashboard.
2. Open `supabase/migrations/0001_initial.sql` locally and paste the complete file, including its `begin;` and `commit;` lines.
3. Run the query and confirm it completes successfully.

Use this method only on a clean project. Running a migration through SQL Editor does not add it to the Supabase CLI migration-history table, so do not later run `db push` against the same project unless you deliberately reconcile its migration history. Do not paste `supabase/seed.sql` into a hosted project.

#### Option B: Supabase CLI

Run these commands from the repository root. `init` is needed only while `supabase/config.toml` does not yet exist.

```bash
npx supabase@latest init
npx supabase@latest login
npx supabase@latest link --project-ref <your-project-ref>
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

The project ref appears in the dashboard project URL and project settings. `link` or `db push` may ask for the database password chosen when the project was created. Review the dry-run output before applying it. Do not add `--include-seed` for production.

The public application RPC contract created by the migration is:

| Caller | RPC and exact parameters |
| --- | --- |
| Teacher | `teacher_create_session(p_title text)` |
| Teacher | `teacher_start_session(p_session_id uuid)` |
| Teacher | `teacher_end_session(p_session_id uuid)` |
| Teacher | `teacher_create_question(p_session_id uuid, p_question_type text, p_prompt text, p_options jsonb, p_correct_answer jsonb, p_launch boolean)` |
| Teacher | `teacher_update_question(p_question_id uuid, p_question_type text, p_prompt text, p_options jsonb, p_correct_answer jsonb)` |
| Teacher | `teacher_launch_question(p_question_id uuid)` |
| Teacher | `teacher_close_question(p_question_id uuid)` |
| Teacher | `teacher_reveal_answer(p_question_id uuid)` |
| Student | `student_join(p_join_code text, p_client_id text, p_display_name text)` |
| Student | `student_get_state(p_join_code text)` |
| Student | `student_submit_response(p_question_id uuid, p_answer jsonb)` |
| Teacher | `get_question_statistics(p_question_id uuid)` |

All of these RPCs require an authenticated Supabase session. The normal student flow creates an invisible anonymous Auth user; it never uses the unauthenticated Postgres `anon` role. Authorization is tied to that Auth UID. The frontend calls the RPCs in [`src/lib/api.ts`](src/lib/api.ts); normal users should not call them manually.

To verify the expected RPCs and Realtime tables in SQL Editor, run these read-only queries:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'teacher_create_session', 'teacher_start_session', 'teacher_end_session',
    'teacher_create_question', 'teacher_update_question',
    'teacher_launch_question', 'teacher_close_question',
    'teacher_reveal_answer', 'student_join', 'student_get_state',
    'student_submit_response', 'get_question_statistics'
  )
order by routine_name;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'sessions', 'questions', 'participants', 'responses', 'session_state'
  )
order by tablename;
```

The first query should return 12 names. The second should return five tables. The migration adds those tables to the existing hosted `supabase_realtime` publication with duplicate guards.

### 4. Configure frontend environment variables

Create a local environment file:

```powershell
# PowerShell
Copy-Item .env.example .env.local
```

```bash
# macOS/Linux
cp .env.example .env.local
```

Fill in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_PUBLIC_APP_URL=
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Hosted project URL from the Supabase **Connect** dialog or API settings. |
| `VITE_SUPABASE_ANON_KEY` | Yes | The browser-safe **publishable** key (`sb_publishable_...`). A legacy `anon` key also works. The environment variable keeps its historical name. |
| `VITE_PUBLIC_APP_URL` | No locally; recommended when deployed | Canonical public frontend origin used in copied student links and QR codes, for example `https://pulse.example.edu`. Do not include a trailing slash or path. When omitted, the current browser origin is used. |

Every `VITE_` value is compiled into browser code and is publicly readable. Never put a Supabase secret key, legacy `service_role` key, database password, or personal access token in this repository or in a `VITE_` variable. This app neither needs nor uses one. Authorization is enforced by Postgres grants, RLS, and RPC checks—not by hiding the publishable key. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

### 5. Run locally and create a teacher

```bash
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`, then:

1. Open **Teacher login** or `/login`.
2. Select **Create account**, enter a display name, email, and password, and submit.
3. If email confirmation is enabled, follow the email link and then sign in. The confirmation uses the Supabase **Site URL** configured above.
4. The migration's Auth trigger automatically creates the corresponding teacher profile. It ignores anonymous students and also backfills non-anonymous Auth users that existed before the migration.

To test a student and teacher at the same time, use a different browser profile, private/incognito context, or physical device for the student. Supabase sessions are persisted per browser origin; separate contexts accurately reproduce the two independent identities students and teachers use in class.

## Classroom workflow

### Teacher

1. Sign in and choose **New session**. A unique six-character code is generated without ambiguous `I`, `O`, `0`, or `1` characters.
2. Share the displayed URL, room code, or QR code. Students may join while the session is still a draft and wait for the first question. The QR can be enlarged or downloaded as a PNG.
3. Choose **Quick question**, select a type, and either save it as a draft or launch it immediately. Launching the first question also starts a draft session; **Start session without a question** is available for a waiting-room start.
4. Watch joined participants, response totals, response rate, and statistics update. **Present** opens a clean projector view in a new tab.
5. Choose **Close voting**, then **Reveal answer**. Students can change an answer only while the question is live. Use **Next question** to launch another draft or create one in place.
6. Choose **End** when class is over. The history view retains questions, answer distributions, individual responses, timestamps, and a browser-generated CSV export.
7. To inspect the append-only audit trail directly, open `public.event_log` in the Supabase Table Editor or query it in SQL Editor:

```sql
select id, event_type, session_id, question_id, participant_id,
       teacher_id, payload, created_at
from public.event_log
order by created_at desc;
```

### Student

1. Scan the QR, open `/join/<CODE>`, or open `/join` and type the code. A display name is optional.
2. On first join, the app creates an anonymous Supabase Auth session and stores a random client identifier in that browser. No email or password is requested.
3. Submit an answer. It may be updated until voting closes; each change replaces the current response and adds an audit event containing the old and new answer.
4. When the teacher closes or reveals the question, the phone updates automatically. Correctness and the correct answer are withheld until reveal.

Refreshing either experience reloads the durable state from Supabase. Clearing a student's site data removes the anonymous Auth session and browser identifier; the next join is therefore treated as a new participant.

## Join links, QR codes, and phone testing

Join links always use `/join/<CODE>`. Their origin is selected in this order:

1. `VITE_PUBLIC_APP_URL`, if set to a valid absolute URL
2. The origin currently open in the teacher's browser

For production, set `VITE_PUBLIC_APP_URL` to the canonical HTTPS origin and rebuild/redeploy. For provider preview builds, either set it to that preview's origin or leave it unset so the current preview origin is used. A production value in a preview build intentionally sends scanned users to production.

`localhost` on a teacher laptop means that laptop, but `localhost` on a phone means the phone. To test a QR code over the local network:

```bash
npm run dev -- --host 0.0.0.0
```

Open Vite from the teacher device using its LAN address, such as `http://192.168.1.25:5173`, rather than `http://localhost:5173`; leave `VITE_PUBLIC_APP_URL` empty or set it to that LAN origin. The phone must be on the same reachable network, and the operating-system firewall must allow the Vite port.

## Realtime behavior

The migration enables full replica identity and registers `sessions`, `questions`, `participants`, `responses`, and `session_state` with Supabase Realtime:

- Teacher screens subscribe only to rows their RLS policies allow and refresh when sessions, questions, participants, or responses change.
- Students subscribe only to `session_state`, a sanitized projection that contains no individual responses and includes `correct_answer` only after reveal.
- Subscriptions are removed when React components unmount. Short polling (10–15 seconds) provides recovery if a WebSocket event is missed.

Realtime is normally enabled on hosted projects. If the UI reports a disconnected live feed, verify the Realtime service is enabled, run the publication query from the migration section, check browser/network WebSocket blocking, and confirm the user can select the relevant row under RLS. A connected WebSocket alone does not bypass RLS.

## Deploy the frontend

Run the production checks before deploying:

```bash
npm run typecheck
npm test
npm run build
```

The static output is written to `dist/`. Because React Router uses browser-history routes, every static host must serve `index.html` for unknown paths; otherwise a direct visit to `/join/CODE` or `/teacher/session/...` returns a host-level 404.

### Vercel

1. Import the Git repository into Vercel and select the Vite framework preset.
2. Use build command `npm run build` and output directory `dist` (normally auto-detected).
3. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and, once known, `VITE_PUBLIC_APP_URL` to the appropriate Vercel environments.
4. Deploy or redeploy after any environment-variable change. Vite injects them at build time.
5. Set Supabase Auth **Site URL** to the final production URL and add any intentionally supported preview URLs to the redirect allow list.

The committed `vercel.json` rewrites client-side routes to `index.html`, following [Vercel's Vite SPA guidance](https://vercel.com/docs/frameworks/frontend/vite).

### Netlify

1. Import the Git repository into Netlify.
2. Set build command to `npm run build` and publish directory to `dist`.
3. Add the same three frontend environment variables and deploy.
4. Update `VITE_PUBLIC_APP_URL` and the Supabase Auth **Site URL** to the final HTTPS origin, then redeploy if the origin changed.

Vite copies `public/_redirects` into the build output. Its `/* /index.html 200` rule provides the required SPA fallback, as described in [Netlify's SPA 404 guidance](https://docs.netlify.com/resources/troubleshooting/page-not-found-error-guide/).

For another static host, configure the equivalent history fallback from all non-file routes to `/index.html` with a successful response status.

## Security architecture

- Teachers are permanent email/password Auth users. The profile trigger excludes JWTs/users marked anonymous, and teacher RPCs require both a non-anonymous identity and a `profiles` row.
- Students receive an anonymous Auth UID. `student_join` binds that UID to one participant in the session. The browser `client_id` helps continuity but never grants access by itself.
- Base tables have RLS enabled. Teachers can select only their own sessions and related rows. Students have no direct access to session, question, participant, response, or audit tables.
- All state changes use `SECURITY DEFINER` RPCs with a fixed empty `search_path`, ownership/identity checks, validation, and transaction-level locking. Client roles do not receive direct mutation grants, except that a teacher can manage only their own profile.
- `student_submit_response` derives the participant from `auth.uid()`, accepts answers only for a live session/question, and enforces one current response per participant/question. Closing and submitting serialize so an answer cannot slip in after a successful close.
- Correct answers and `is_correct` are absent from student RPC results and Realtime state until reveal. Teacher aggregate statistics are ownership-checked server-side.
- `event_log` is append-only to client roles. Session/question transitions and their audit records are written atomically; answer changes retain old and new values in the event payload.
- The publishable browser key is not a secret. Never “solve” an RLS error by adding a secret/service-role key to the frontend.

Optional student display names and open-text answers may contain personal data. Establish an appropriate retention/privacy policy for your institution. Supabase anonymous users are not automatically deleted when browser data is cleared; review Supabase's anonymous-user cleanup and abuse-prevention guidance before broad deployment.

## Optional local Supabase and demo seed

The application does not depend on seed data. [`supabase/seed.sql`](supabase/seed.sql) is intended only for a disposable local Supabase stack; it inserts directly into the local managed Auth schema and must not be run in a hosted/production project.

With a Docker-compatible runtime available:

1. Run `npx supabase@latest init` once if `supabase/config.toml` is absent.
2. In the generated `supabase/config.toml`, set `enable_anonymous_sign_ins = true` in the `[auth]` section if you want to create fresh student users locally, and set its Auth site URL to the Vite origin.
3. Start and rebuild the local database:

```bash
npx supabase@latest start
npx supabase@latest db reset
npx supabase@latest status
```

`db reset` is destructive to the local database: it reapplies `supabase/migrations` and then runs `supabase/seed.sql`. Do not add `--linked`. Put the local API URL and publishable/anon key printed by `supabase status` into `.env.local`.

To exercise the complete database flow after a reset, set the public local key printed by `npx supabase status -o env` and run the integration check:

```powershell
$env:PULSE_TEST_SUPABASE_ANON_KEY = '<local ANON_KEY or PUBLISHABLE_KEY>'
npm run test:integration
```

The script signs in the seeded teacher, creates and launches a question, joins an anonymous student, changes an answer, checks aggregate statistics and student RLS, closes and reveals, verifies the audit trail, and ends the session. It only targets `http://127.0.0.1:54321` unless `PULSE_TEST_SUPABASE_URL` is explicitly set.

The demo login is `teacher@example.com` / `classroom-demo`. The seeded `CLASS2` session is deliberately ended and is useful for history, statistics, CSV, and audit inspection; create a new session for a live student test. Do not run the seed repeatedly by hand because append-only event rows are not deduplicated.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run typecheck` | Run strict TypeScript project checks. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run test:integration` | Verify the full flow against the seeded local Supabase stack (requires `PULSE_TEST_SUPABASE_ANON_KEY`). |
| `npm run build` | Type-check and create the production bundle in `dist/`. |
| `npm run preview` | Preview the built bundle locally. |

Frontend type checks, unit tests, and builds do not require live Supabase credentials. End-to-end classroom behavior requires a configured project, the migration, both Auth methods, and separate teacher/student browser contexts.

## Troubleshooting

- **The setup screen remains visible:** both required variables must exist when Vite starts/builds. Restart `npm run dev` or redeploy after changing them.
- **“Anonymous sign-ins are disabled” or students cannot join:** enable anonymous sign-ins in the same Supabase project referenced by `.env.local`.
- **“Teacher profile not found”:** apply the complete current migration. Its trigger and backfill create profiles for permanent Auth users; do not weaken the teacher RPC or manually grant table writes.
- **Confirmation opens the wrong site:** correct Supabase Auth **Site URL** and its redirect allow list.
- **QR opens `localhost` on a phone:** use the deployed origin, set `VITE_PUBLIC_APP_URL`, or open the local app via a reachable LAN origin as described above.
- **A copied/deep link returns 404:** configure the host's SPA rewrite and redeploy; this repository includes rules for Vercel and Netlify.
- **Data changes only after a delay:** verify the five publication entries and the Realtime service. The polling fallback will eventually refresh, but successful Postgres Changes should appear immediately.
- **A student appears twice:** use the same browser profile without clearing site data. Private windows, another browser profile, or cleared storage create a different anonymous Auth identity.
