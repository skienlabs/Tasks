# Tasks

Daily task planner: calendar days, priorities, company tags, carry-over of unfinished work, and monthly summaries.

```
tasks/
├── web/                 Web app (one Docker container)
│   ├── client/          React + Material UI front end (installable PWA)
│   ├── server/          Node + Fastify API, SQLite database
│   ├── config/          Firebase web config example (real file stays on the server)
│   ├── Dockerfile
│   └── docker-compose.yml   compose file for the VM (~/docker/apps/tasks)
├── app/                 Android app (coming later; will use the same API)
├── docs/screens/        screenshots of the web app
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

All screens are in [docs/screens](docs/screens).

## Docs

- Web app setup, deployment and API: [web/README.md](web/README.md)
- Android app: [app/README.md](app/README.md)
