# Tasks for Android

Native Android app (Kotlin + Jetpack Compose, Material 3) for the same account and data as the web app. Changes show up on the other devices within about a second (live sync over `/api/events`).

- Tasks per day, with priorities, notes, company tags and logos.
- Swipe a task **right to complete** it, **left to postpone** it to tomorrow. Tap to edit; long-press or ⋮ for everything else (cancel, move to today, priority, tags, delete). Each action can be undone from the snackbar.
- Tasks still open from earlier days are listed at the top of Today ("Move all to today").
- Week strip (tap a day, swipe it sideways to change week), month calendar from the title, monthly summary with charts.
- AMOLED black, light, or follow the system (Account → Theme).
- Steps (sub-tasks), nested like a Reddit thread. The task completes itself when the last step is ticked; it can't be completed while steps are open ("Complete all" ticks them).
- Images on tasks: from the gallery or the camera, shrunk on the phone before upload; tap to view full screen (pinch to zoom, swipe between images).
- End-of-day summary notification (default 9 PM, change it in Account): what you finished, what's left, high-priority tasks first. Works offline from the saved copy.
- Home screen widgets: **Tasks · Today** (4×2) and **Tasks · Focus list** (4×4). Progress ring, what's left (high priority first, overdue marked), tick a task off right from the home screen, "+" opens a new task. Long-press the home screen → Widgets → Tasks.
- A short animated tour on first launch, then sign in or create an account.
- Your Google profile photo in the app; crop tag logos (pinch, drag, fit or fill).
- Opens instantly from a local cache, then refreshes; offline it shows the saved copy.

Requires Android 9 or newer. Tuned for big, high-refresh phones like the OnePlus 12.

## Build

Needs JDK 17+ and the Android SDK (platform 37).

| File | What it is | In git? |
| --- | --- | --- |
| `app/google-services.json` | Firebase Android config (Firebase console → Project settings → Your apps) | yes |
| `tasks.properties` | `apiUrl=https://tasks.skienlab.com` (your server) | yes |
| `keystore/tasks-release.jks` + `keystore.properties` | release signing key and passwords | yes — **keep the repo private** |

```bash
cd app
./gradlew assembleRelease          # → app/build/outputs/apk/release/app-release.apk
./gradlew testDebugUnitTest        # store logic tests
./gradlew recordRoborazziDebug     # renders screens to app/build/screens/*.png
```

The release build refuses to run without the Firebase file, an `https://` server address and the signing key.

**Keep the keystore safe.** It's committed so any clone can build a release; that's only OK while the repo is private. Updates must be signed with the same key, and Google sign-in is registered to its SHA-1/SHA-256 in Firebase. If you lose it, you have to uninstall the app (and its cached data) and register a new key.

Get the fingerprints for Firebase (Project settings → Android app → Add fingerprint):

```bash
keytool -list -v -keystore keystore/tasks-release.jks -alias tasks
```

## Install on the phone

1. Copy `app-release.apk` to the phone (USB, Drive, or Quick Share).
2. Open it in Files; allow "Install unknown apps" for that app when asked.
3. To update later, install the new APK over the old one (same key → data and sign-in are kept).

If the end-of-day notification doesn't show up on OnePlus/OxygenOS: long-press the app icon → App info → Battery → **Allow background activity** (OxygenOS can hold alarms of apps it considers idle).

With USB debugging on: `adb install -r app/build/outputs/apk/release/app-release.apk`.

## How it talks to the server

Same API as the web app (see `../web/README.md`). Every request carries the Firebase ID token and an `X-Client-Id` so the app ignores live-sync notices about its own changes. Writes show immediately and roll back if the server refuses them; the live stream is closed while the app is in the background to save battery, and everything is refreshed when it comes back.
