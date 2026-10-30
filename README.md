# Tasks

Daily task planner: calendar days, priorities, company tags, nested steps (sub-tasks), images on tasks, time limits with countdowns, carry-over of unfinished work, monthly summaries, teams (invite by email or a link with a QR code, give tasks to people or groups, sign-off, comments, files, repeating tasks and templates, notifications, calendar, workload and reports with CSV/PDF export), works offline, and an end-of-day summary notification on Android.

```
tasks/
├── web/                 Web app (one Docker container)
│   ├── client/          React + Material UI front end (installable PWA)
│   ├── server/          Node + Fastify API, SQLite database
│   ├── config/          Firebase web config example (real file stays on the server)
│   ├── Dockerfile
│   └── docker-compose.yml   compose file for the VM (~/docker/apps/tasks)
├── app/                 Android app (Kotlin + Jetpack Compose), same API and live sync
├── docs/screens/        screenshots of the web app
├── store/               Play Store listing: images (play/), listing text, data-safety answers
└── .github/workflows/
    ├── ci.yml           tests + Docker build on every push / PR
    └── deploy-web.yml   build → push to GAR → deploy to VM (run manually)
```

## Screens

| Today (AMOLED dark) | Today (light) |
| --- | --- |
| ![Today, dark](docs/screens/04-today-desktop-dark.webp) | ![Today, light](docs/screens/05-today-desktop-light.webp) |
| **Monthly summary** | **Sign in** |
| ![Summary](docs/screens/10-summary-desktop-dark.webp) | ![Sign in](docs/screens/01-signin-desktop-dark.webp) |

<p>
  <img src="docs/screens/13-today-mobile-dark.webp" alt="Phone, today" width="200">
  <img src="docs/screens/14-summary-mobile-light.webp" alt="Phone, summary" width="200">
  <img src="docs/screens/15-menu-mobile-dark.webp" alt="Phone, menu" width="200">
</p>

Android (OnePlus 12 size):

<p>
  <img src="docs/screens/android-today-dark.png" alt="Android, today, dark" width="200">
  <img src="docs/screens/android-today-light.png" alt="Android, today, light" width="200">
  <img src="docs/screens/android-summary-dark.png" alt="Android, summary" width="200">
  <img src="docs/screens/android-month-dark.png" alt="Android, calendar" width="200">
  <img src="docs/screens/android-intro.png" alt="Android, first-run tour" width="200">
  <img src="docs/screens/android-widget-4x4.png" alt="Android, home screen widget" width="200">
</p>

Web sign-in: ![Welcome](docs/screens/web-welcome-dark.png)

All screens are in [docs/screens](docs/screens).

Web and Android stay in sync live: a change on one shows up on the other within about a second.

## Docs

- Web app setup, deployment and API: [web/README.md](web/README.md)
- Android app: [app/README.md](app/README.md)
- Play Store listing and data-safety answers: [store/README.md](store/README.md)
- Privacy policy: [web/client/public/privacypolicy.html](web/client/public/privacypolicy.html), live at https://tasks.skienlab.com/privacypolicy.html
