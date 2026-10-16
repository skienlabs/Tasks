# Tasks — web

A fast, lightweight daily task planner with Google sign-in. One Docker container holds the web client, API and database.

- **Accounts**: anyone can sign up with **Google** or with **name + email + password** (verification email, password reset). A short welcome step on first sign-in asks for your name and your companies. Each account sees only its own tasks.
- **Calendar-style days**: month calendar, week strip and a day view. Dots show days with pending (blue), overdue (red) or finished (green) work.
- **Per-day tasks** with priority (High / Medium / Low / None) and optional notes.
- **Complete, postpone to tomorrow, cancel, restore, edit, move, delete**, each with Undo.
- **Pending tasks from earlier days appear at the top of Today**, with a one-click "Move all to today".
- **Tags** for each company or project, with a color and an uploaded logo, shown on every task card. Filter any day by tag.
- **Summary**: per-day counts (tasks / done / left) on every day, a side panel with week and month progress on large screens, and a monthly summary page with a daily chart, per-company and per-priority breakdowns, and a day-by-day list.
- **Installable app** (PWA): in Chrome or Edge use *Install app* (sidebar, account menu or the address bar icon), then pin it to the Windows taskbar. Works on Android too.
- **Built for PC and phone**: sidebar + side panel on desktop, bottom navigation and a floating add button on mobile.
- **AMOLED black dark mode**, light mode, or follow the system. Google Sans, Material Design.
- Keyboard: `←` `→` change day, `T` today, `N` new task, `S` summary.
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

3. In your reverse proxy, point the Tasks domain to `http://tasks:8080`.

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

Each Google account sees only its own tasks.

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

To try real sign-up / sign-in locally, run the Firebase Auth emulator (`npx firebase-tools emulators:start --only auth --project demo-tasks`) and start the server with `NODE_ENV=development FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099` and a config whose `projectId` is `demo-tasks`. Both this and the fake dev user only work when `NODE_ENV=development` exactly; they are ignored otherwise (the Docker image always runs with `NODE_ENV=production`).

Tests: `cd web/server && npm test`. Build the image locally: `docker build -t tasks web`.

## API

All endpoints except `/api/health` and `/api/config` need `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/me` | Profile (creates it on first call): `name, email, provider, emailVerified, onboarded` |
| PATCH | `/api/me` | `{ name?, onboarded?: true }` |
| GET | `/api/tasks?date=YYYY-MM-DD&today=YYYY-MM-DD` | Tasks for a day; when `date == today`, also `overdue` (pending from earlier days) |
| GET | `/api/summary?from=&to=` | Per-day counts for the calendar (max 92 days) |
| POST | `/api/tasks` | `{ title, date, priority?, notes?, id? }` (client `id` makes retries safe) |
| PATCH | `/api/tasks/:id` | Any of `title, notes, priority, date, status, postponed` |
| POST | `/api/tasks/:id/postpone` | `{ today }` moves to the day after today (or after its own date, if later) |
| DELETE | `/api/tasks/:id` | |
| GET | `/api/tags` | The user's tags |
| POST | `/api/tags` | `{ name, color?, logo? }` (logo: PNG/JPEG/WebP data URL, ~96px, resized in the browser) |
| PATCH | `/api/tags/:id` | Any of `name, color, logo, position` |
| DELETE | `/api/tags/:id` | Also removes it from tasks |
| GET | `/api/stats?from=&to=&today=` | Month summary: per day, per tag, per priority, overdue, postponed |

Tasks carry `tagIds: []`; send `tagIds` on create/update to set them (max 10, must be your own tags).

Dates are calendar days in the user's own time zone (years 1900–2999); the browser sends what "today" is.

Errors: `401` means the sign-in token is missing or invalid, `403` means the account isn't allowed (or must verify its email first when `ALLOWED_EMAILS` is set), and `503` means the server couldn't reach Google to check the token. The app never signs anyone out on its own because of an API error.
