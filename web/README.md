# Tasks — web

A fast, lightweight daily task planner with Google sign-in. One Docker container holds the web client, API and database.

- **Accounts**: anyone can sign up with **Google** or with **name + email + password** (verification email, password reset). A short welcome step on first sign-in asks for your name and your companies. Each account sees only its own tasks.
- **Calendar-style days**: month calendar, week strip and a day view. Dots show days with pending (blue), overdue (red) or finished (green) work.
- **Per-day tasks** with priority (High / Medium / Low / None) and optional notes.
- **Complete, postpone to tomorrow, cancel, restore, edit, move, delete**, each with Undo.
- **Unfinished tasks move to today by themselves**: the server carries them over the first time a device opens today. They're outlined in red with where they came from ("From yesterday", "From Thu, 15 Oct"). Moving or postponing one on purpose clears the mark.
- **Click a task to see everything about it** in a pane on the right (a sheet on phones): steps you can tick, images, notes, dates. Editing is under ⋮ → Edit. Esc closes the pane.
- **Tags** for each company or project, with a color and an uploaded logo, shown on every task card. Filter any day by tag.
- **Summary**: per-day counts (tasks / done / left) on every day, a side panel with week and month progress on large screens, and a monthly summary page with a daily chart, per-company and per-priority breakdowns, and a day-by-day list.
- **Installable app** (PWA): in Chrome or Edge use *Install app* (sidebar, account menu or the address bar icon), then pin it to the Windows taskbar. Works on Android too.
- **Built for PC and phone**: sidebar + side panel on desktop, bottom navigation and a floating add button on mobile.
- **Eight themes**: System, Light, Dark Gray (VS Code's dark theme), Dark (soft grey), Midnight Black (true black), Abyss (deep navy with a soft glow, like the VS Code theme), Black & White and White & Black (pure ink, shades of grey). Google Sans, Material Design.
- **Works offline**: the app opens with no connection and everything keeps working; changes are saved in the browser (IndexedDB) and sync in order when it's back online. The service worker saves the whole app.
- **Search** every task from the top bar (`/` or `Ctrl K`): ranked results as you type, suggestions, highlights, and filters like `#tag`, `is:done`, `p:high`, `date:week`, "phrases".
- **Unfinished days stay unfinished** in the summary: tasks that moved on to the next day count as "not finished" (red) on the day they left.
- **One sorted list**: priority first, then company (tag) A–Z, then title A–Z (numbers by value).
- Keyboard: `/` or `Ctrl K` search, `←` `→` change day, `T` today, `N` new task, `S` summary.
- Every action updates the screen instantly and syncs in the background.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| UI | React 19 + Material UI 9 (Vite) | Material look, small pre-compressed bundle (brotli) |
| API | Node 22 + Fastify 5 | Fast, tiny footprint |
| Database | SQLite (Node's built-in `node:sqlite`, WAL mode) | No separate DB server, no native modules |
| Auth | Firebase Authentication (Google + Email/Password) | Passwords are handled by Firebase, never stored here. The server verifies Firebase ID tokens against Google's public keys; no service-account key needed |

The image runs as a non-root user and idles at roughly 35 MB of RAM.

## 1. Firebase setup (one time)

1. Open the [Firebase console](https://console.firebase.google.com/), create a project (or reuse one).
2. **Authentication > Sign-in method**: enable **Google** and **Email/Password** (leave "Email link" off).
3. **Authentication > Settings > Authorized domains**: add the domain you will serve Tasks on (for example `tasks.example.com`). `localhost` is there by default.
4. **Project settings > General > Your apps**: add a **Web app**. Copy the `firebaseConfig` object it shows.
5. Optional: **Authentication > Templates** lets you set the sender name and wording of the verification and password-reset emails, and **Settings > Password policy** can require stronger passwords (the app already asks for at least 8 characters).
6. Save the config on the server as `config/firebase-config.json`. Either form works:

   ```json
   {
     "apiKey": "AIza...",
     "authDomain": "your-project.firebaseapp.com",
     "projectId": "your-project",
     "appId": "1:123:web:abc"
   }
   ```

   or the snippet pasted as-is (`const firebaseConfig = { apiKey: "...", ... };`).

   This is the **web app config**, not a service-account key. These values are public by design (the browser needs them); access is protected by token verification on the server.

## 2. Deploy (GitHub Actions → GAR → VM)

Same flow as the other apps. The workflow **Build & Deploy Tasks Web** (`.github/workflows/deploy-web.yml`, run it from the Actions tab) tests the code, builds the image, pushes
`us-central1-docker.pkg.dev/<GCP_PROJECT_ID>/test-images/tasks:latest` (plus a `:<commit sha>` tag for rollbacks), then SSHes to the VM (port 2232) and runs `docker compose pull && docker compose up -d` in `~/docker/apps/tasks`.

Repository secrets (same names as the other apps): `GCP_SA_KEY`, `GCP_PROJECT_ID`, `VM_HOST`, `VM_USER`, `VM_SSH_KEY`.

One-time setup on the VM:

```bash
mkdir -p ~/docker/apps/tasks/config && cd ~/docker/apps/tasks
# 1. copy web/docker-compose.yml from this repo to ./docker-compose.yml
#    (uses the external skiensuite-net network, like the other apps; no port is published)
# 2. put the Firebase web config in ./config/firebase-config.json
chmod 644 config/firebase-config.json
```

3. In your reverse proxy, point the Tasks domain to `http://tasks:8080`. Live sync is a long-lived `/api/events` response: the app sends `X-Accel-Buffering: no` (nginx honours it); with other proxies turn off response buffering and allow idle connections of at least 60 s.

Then run the workflow. Put the app behind your HTTPS reverse proxy; Google sign-in only works on a domain listed in Firebase's Authorized domains, and installing as an app needs HTTPS.

`ci.yml` runs the tests and a Docker build on every push and pull request (no deploy).

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_EMAILS` | empty (anyone can sign up) | Optional. Comma-separated emails allowed to use the app; `@example.com` allows a whole domain. Only verified emails pass this check. |
| `PORT` | `8080` | Port inside the container |
| `DATA_DIR` | `/data` | Where `tasks.db` lives. Keep it on a volume. |
| `FIREBASE_CONFIG_PATH` | `/config/firebase-config.json` | Firebase web config file |
| `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID` | | Alternative to the file |
| `LOG_LEVEL` | `info` | `warn`, `error`, `debug` |
| `ANDROID_APK_PATH` | `/app/downloads/Tasks.apk` (from `web/server/downloads/`) | The Android APK the web app offers ("Get the Android app", served at `/download/android`). Leave it out and no download shows. |

Each account sees only its own tasks, plus, in a team, the tasks its admins give it. Team admins see the tasks they gave out (with their notes, steps and images, not the person's own tags).

**Android download**: the release APK lives at `web/server/downloads/Tasks.apk` (committed, replaced on every Android release) and goes into the image. The sign-in page and the account menu offer it, and invite messages link to it. `ANDROID_APK_PATH` serves one from elsewhere.

**Data volume permissions**: the app runs as uid 1000. A named volume (as in `docker-compose.yml`) just works. If you bind-mount a host folder instead, run `sudo chown -R 1000:1000 <folder>` first.

### Backup

```bash
docker exec tasks node --disable-warning=ExperimentalWarning -e \
  "new (require('node:sqlite').DatabaseSync)('/data/tasks.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker cp tasks:/data/backup.db ./tasks-backup-$(date +%F).db
docker exec tasks rm /data/backup.db
```

## Development

```bash
# terminal 1: API on :8080 with a fake signed-in user (never active in production)
cd web/server && npm install && npm run dev
# terminal 2: UI on :5173 with hot reload, proxies /api to :8080
cd web/client && npm install && npm run dev
```

To try teams with several people locally, open a second browser profile and set `localStorage['tasks.devAs'] = 'ann'` (signs in as `ann@localhost`); API calls can use `Authorization: Bearer dev:ann`.

To try real sign-up / sign-in locally, run the Firebase Auth emulator (`npx firebase-tools emulators:start --only auth --project demo-tasks`) and start the server with `NODE_ENV=development FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099` and a config whose `projectId` is `demo-tasks`. Both this and the fake dev user only work when `NODE_ENV=development` exactly; they are ignored otherwise (the Docker image always runs with `NODE_ENV=production`).

Tests: `cd web/server && npm test`. Build the image locally: `docker build -t tasks web`.

## Steps (sub-tasks)

A task can carry `subtasks: [{ id, parentId, title, done }]`, a tree up to 4 levels deep (max 100 steps). Only leaves are ticked; a parent is done when all its children are. Changing the steps completes the task when every leaf is done and reopens it otherwise (a cancelled task stays cancelled). Setting `status: "done"` while steps are open is refused (409).

Images are stored as files under `DATA_DIR/files` (on the same volume as the database, so the existing backup of `/data` covers them).

## API

All endpoints except `/api/health` and `/api/config` need `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/me` | Profile (creates it on first call): `name, email, provider, emailVerified, onboarded` |
| PATCH | `/api/me` | `{ name?, onboarded?: true }` |
| GET | `/api/tasks?date=YYYY-MM-DD&today=YYYY-MM-DD` | Tasks for a day. With `today` (within a day of the server's date), unfinished tasks from earlier days first move to `today`, keeping `carriedFrom` (the day they were first due). `overdue` stays for older apps and is normally empty |
| GET | `/api/sync?today=` | The whole account for the apps' offline copy (after carry-over): `{ tasks, tags, misses: [{date, missed}], teams, invites, serverTime }` |
| GET | `/api/summary?from=&to=` | Per-day counts for the calendar (max 92 days): `pending, done, cancelled`, and `missed` (tasks that were on the day unfinished and moved on) |
| GET | `/api/search?q=&today=&limit=` | Ranked search over all tasks (`limit` 1–100, default 30). Words, "phrases", `#tag`/`tag:`, `is:open\|done\|cancelled\|late`, `p:high\|medium\|low\|none`, `date:today\|tomorrow\|yesterday\|week\|month\|YYYY-MM-DD`, `before:`, `after:`, `has:steps\|images\|notes`. Returns `{ results (tasks, each with an optional match {field, text}), total, fuzzy, terms, suggestions }` |
| POST | `/api/tasks` | `{ title, date, priority?, notes?, id?, dueAt? }` (client `id` makes retries safe; `dueAt` is a time limit, local `YYYY-MM-DDTHH:MM`) |
| PATCH | `/api/tasks/:id` | Any of `title, notes, priority, date, status, postponed, tagIds, subtasks, dueAt` (`dueAt: null` removes it). On a team task, someone who isn't its team's admin may change `status` (not to cancelled), `date`, `postponed`, `notes`, their own `tagIds` and tick `subtasks`; anything else is 403, and so is deleting it. An approved task, or a shared copy someone else finished, stays as it is for them |
| POST | `/api/tasks/:id/postpone` | `{ today, from? }` moves to the day after today (or after its own date, if later). With `from` (the day it was on), a repeat finds it already moved and leaves it |
| DELETE | `/api/tasks/:id` | Its images are kept for a day so Undo can bring them back |
| POST | `/api/tasks/:id/attachments` | `{ id, image, thumb, width, height }` (JPEG/PNG/WebP data URLs, resized on the device; max 6 MB, 20 per task). Returns the task |
| GET | `/api/attachments/:id?size=thumb\|full` | The image file (needs the sign-in header) |
| DELETE | `/api/attachments/:id` | Returns the task |
| GET | `/api/tags` | The user's tags |
| POST | `/api/tags` | `{ name, color?, logo? }` (logo: PNG/JPEG/WebP data URL, ~96px, resized in the browser) |
| PATCH | `/api/tags/:id` | Any of `name, color, logo, position` |
| DELETE | `/api/tags/:id` | Also removes it from tasks |
| GET | `/api/stats?from=&to=&today=` | Month summary: per day (with `missed`), per tag, per priority, overdue, postponed |
| GET | `/api/events` | Live sync (Server-Sent Events): `ready`, then `change` `{type: tasks\|tags\|profile\|teams\|invites\|notifications\|comments, dates, teamId, taskId, thread, source}` whenever something changes for you (on another device, or a teammate). Send `X-Client-Id` on writes so a device can skip its own changes. |
| GET | `/download/android` | The Android APK, when the server has one (public; `GET /api/config` says `android: { size, updatedAt }` or `null`) |

### Teams

A team has one **owner**, **admins** and **members**. Admins invite people by email; the invite waits in the app until that person signs in with that (verified) email and accepts it (the server sends no email: the app gives a message to share). Admins give out tasks: a team task belongs to the person it's for (it's in their list, carries over, works offline) and carries `teamId`, `assignee`, `assignedBy`. Leaving or being removed, or the team being deleted, turns its tasks into the person's own.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/teams` | `{ teams, invites }`: my teams (`role` is mine; `members`; `invites` for admins only) and invites waiting for my email |
| POST | `/api/teams` | `{ name, color?, logo?, id? }`: I become the owner (`logo`: PNG/JPEG/WebP data URL, ~128px) |
| PATCH | `/api/teams/:id` | Admins: `{ name?, color?, logo? }` (`logo: null` removes it) |
| DELETE | `/api/teams/:id` | Owner only |
| POST | `/api/teams/:id/invites` | Admins: `{ emails: [..] (up to 50), role?: member\|admin }` returns `{ team, invited, alreadyMembers }` |
| DELETE | `/api/teams/:id/invites/:inviteId` | Admins: cancel an invite |
| GET | `/api/invites` | Invites for my email |
| POST | `/api/invites/:id/accept` | Join (the email must be verified); `/decline` turns it down |
| PATCH | `/api/teams/:id/members/:uid` | `{ role }`: admins make members admins; the owner also makes admins members, or hands the team over (`owner`) |
| DELETE | `/api/teams/:id/members/:uid` | Leave (my own uid; not the owner) or remove someone (admins remove members; the owner anyone) |
| GET | `/api/teams/:id/tasks?from=&to=&today=` | The team's tasks on those days (max 92) plus every open one, with `comments` (count); tags left out. Admins see all; members the ones they have or gave |
| POST | `/api/teams/:id/tasks` | Admins (or members, with `membersCanAssign`): `{ title, date, assignee \| assignees: [..] \| groupId, mode?: each\|first, notes?, priority?, subtasks?, dueAt?, needsReview?, teamTagIds?, id?, today? }`; several people return `{ tasks }` (ids `<id>-0`, `<id>-1`…, sharing `groupId`) |
| PATCH | `/api/teams/:id/tasks/:taskId` | Admins, or whoever gave it: any of `assignee` (moves it, with its images and files; the person's tags stay behind), `title, notes, priority, date, status, subtasks, dueAt, needsReview, teamTagIds` |
| DELETE | `/api/teams/:id/tasks/:taskId` | Admins |
| POST | `/api/teams/:id/tasks/:taskId/review` | `{ decision: approve\|return, note? }` on a task `review: waiting` (the note becomes a comment) |
| POST | `/api/teams/:id/tasks/:taskId/nudge` | A reminder to its person (open tasks; at most every 30 minutes) |
| POST | `/api/teams/:id/tasks/:taskId/attachments` | Admins add an image to someone's team task (same body as `/api/tasks/:id/attachments`) |
| POST | `/api/teams/:id/tasks/:taskId/files` | Admins add a file: `{ id, name, data }` (`data`: a base64 data URL, up to 10 MB, 20 per task) |
| POST | `/api/tasks/:id/files` | A file on my own task (same body) |
| GET / DELETE | `/api/files/:id` | Download (always as an attachment) / remove (its person, whoever added it, or a team admin) |
| GET / POST | `/api/tasks/:id/comments` | Comments on a team task (`{ text, id? }`); for its person, whoever gave it, the people sharing it, and admins |
| DELETE | `/api/comments/:id` | Your own, or any as an admin |
| GET | `/api/notifications?after=&limit=` | `{ notifications, unread }`, newest first |
| POST | `/api/notifications/read` | `{ upTo }` (all up to that id) or `{ id }` |
| PATCH | `/api/teams/:id` | Admins also: `{ settings: { membersCanAssign } }` |
| POST | `/api/teams/:id/archive` | Owner: `{ archived }`; an archived team is read-only (writes answer 409) |
| POST / PATCH / DELETE | `/api/teams/:id/groups[/:groupId]` | Admins: sub-groups `{ name, color?, members: [uid] }` |
| POST / PATCH / DELETE | `/api/teams/:id/tags[/:tagId]` | Admins: team tags `{ name, color? }` |
| GET / POST / PATCH / DELETE | `/api/teams/:id/templates[/:templateId]` | Admins (list also for members who may give tasks): `{ name, data: { title, notes?, priority?, subtasks?, dueTime?, teamTagIds?, needsReview? } }` |
| GET / POST / PATCH / DELETE | `/api/teams/:id/recurring[/:recurringId]` | Admins: `{ data: { ...template, assignees, mode? }, rule: { freq: daily\|weekdays\|weekly\|monthly, days?, day? }, today? }`; PATCH also `{ active }` |
| GET / POST / DELETE | `/api/teams/:id/link` | Admins: the invite link `{ link: { token, url, qr } }` (`qr`: PNG data URL); POST makes a new one |
| GET / POST | `/api/join/:token` | Anyone signed in: see the team / ask to join (`status`: none, requested, member) |
| POST | `/api/teams/:id/requests/:uid` | Admins: `{ approve }` |
| PATCH | `/api/teams/:id/members/:uid` | Also `{ title }`: a job title (your own, or anyone's as an admin; `null` clears it) |
| GET | `/api/teams/:id/activity?before=` | Admins: the activity log, 50 at a time |

Background jobs (every 15 minutes): repeating tasks, late notices (once a day per person and team), the admins' morning summary (after `DIGEST_HOUR_UTC`, default 3) and the Monday report. Set `PUBLIC_URL` so invite links use your address (otherwise taken from each request).

Tasks carry `tagIds: []`; send `tagIds` on create/update to set them (max 10, must be your own tags).

Dates are calendar days in the user's own time zone (years 1900–2999); the browser sends what "today" is.

Errors: `401` means the sign-in token is missing or invalid, `403` means the account isn't allowed (or must verify its email first when `ALLOWED_EMAILS` is set), and `503` means the server couldn't reach Google to check the token. The app never signs anyone out on its own because of an API error.
