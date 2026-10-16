# Tasks

A fast, lightweight daily task planner with Google sign-in. One Docker container holds the web app, API and database.

- **Calendar-style days**: month calendar, week strip and a day view. Dots show days with pending (blue), overdue (red) or finished (green) work.
- **Per-day tasks** with priority (High / Medium / Low / None) and optional notes.
- **Complete, postpone to tomorrow, cancel, restore, edit, move, delete**, each with Undo.
- **Pending tasks from earlier days appear at the top of Today**, with a one-click "Move all to today".
- **AMOLED black dark mode**, light mode, or follow the system. Google Sans, Material Design.
- Keyboard: `←` `→` change day, `T` today, `N` new task.
- Every action updates the screen instantly and syncs in the background.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| UI | React 19 + Material UI 9 (Vite) | Material look, small pre-compressed bundle (brotli) |
| API | Node 22 + Fastify 5 | Fast, tiny footprint |
| Database | SQLite (Node's built-in `node:sqlite`, WAL mode) | No separate DB server, no native modules |
| Auth | Firebase Authentication (Google) | Server verifies Firebase ID tokens against Google's public keys; no service-account key needed |

The image runs as a non-root user and idles at roughly 35 MB of RAM.

## 1. Firebase setup (one time)

1. Open the [Firebase console](https://console.firebase.google.com/), create a project (or reuse one).
2. **Authentication > Sign-in method**: enable **Google**.
3. **Authentication > Settings > Authorized domains**: add the domain you will serve Tasks on (for example `tasks.example.com`). `localhost` is there by default.
4. **Project settings > General > Your apps**: add a **Web app**. Copy the `firebaseConfig` object it shows.
5. Save it on the server as `config/firebase-config.json`. Either form works:

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

## 2. Run on a Linux server

```bash
mkdir -p ~/tasks/config && cd ~/tasks
# put firebase-config.json in ./config/ and make it readable:
chmod 644 config/firebase-config.json
# copy docker-compose.yml from this repo, then:
docker compose up -d
```

Or with plain Docker:

```bash
docker run -d --name tasks --restart unless-stopped \
  -p 8080:8080 \
  -v tasks-data:/data \
  -v "$PWD/config/firebase-config.json:/config/firebase-config.json:ro" \
  -e ALLOWED_EMAILS="you@gmail.com" \
  <region>-docker.pkg.dev/<project>/<repo>/tasks:latest
```

Put it behind your HTTPS reverse proxy (Caddy, Nginx, Traefik). Google sign-in must run on a domain listed in Firebase's Authorized domains.

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_EMAILS` | empty (anyone) | Comma-separated Google accounts allowed to sign in. `@example.com` allows a whole domain. Strongly recommended for a personal instance. |
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

## 3. CI: build and push to Google Artifact Registry

`.github/workflows/build-push.yml` runs tests, builds the image, and pushes to GAR on every push to `main` and on `v*` tags. Tags: `latest`, `sha-<short>`, branch name, and semver for tags.

In GitHub **Settings > Secrets and variables > Actions** set:

- Variables: `GAR_LOCATION` (e.g. `asia-south1`), `GCP_PROJECT_ID`, `GAR_REPOSITORY`
- Auth, one of:
  - Variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` (keyless, recommended)
  - Secret `GCP_SA_KEY` (service-account JSON key)

The service account needs **Artifact Registry Writer** on the repository. Until these are set, the workflow still tests and builds, but skips the push.

## Development

```bash
# terminal 1: API on :8080 with a fake signed-in user (never active in production)
cd server && npm install && npm run dev
# terminal 2: UI on :5173 with hot reload, proxies /api to :8080
cd web && npm install && npm run dev
```

Tests: `cd server && npm test`.

## API

All endpoints except `/api/health` and `/api/config` need `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/tasks?date=YYYY-MM-DD&today=YYYY-MM-DD` | Tasks for a day; when `date == today`, also `overdue` (pending from earlier days) |
| GET | `/api/summary?from=&to=` | Per-day counts for the calendar (max 92 days) |
| POST | `/api/tasks` | `{ title, date, priority?, notes?, id? }` (client `id` makes retries safe) |
| PATCH | `/api/tasks/:id` | Any of `title, notes, priority, date, status, postponed` |
| POST | `/api/tasks/:id/postpone` | `{ today }` moves to the day after today (or after its own date, if later) |
| DELETE | `/api/tasks/:id` | |

Dates are calendar days in the user's own time zone; the browser sends what "today" is.
