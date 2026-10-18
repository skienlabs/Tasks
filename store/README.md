# Play Store listing

Everything the Play Console asks for in **Grow → Store presence → Main store listing**, plus the privacy and data-safety answers.

## Images (`play/`)

| File | Console field | Size |
| --- | --- | --- |
| `icon-512.png` | App icon | 512 × 512 |
| `feature-graphic.png` | Feature graphic | 1024 × 500 |
| `01-today.png` … `07-themes.png` | Phone screenshots (upload in this order) | 1080 × 1920 |

The phone screens inside the frames are real renders of the app with sample data, made by the app's tests:

- `StoreShotsTest`: Today, the task sheet and Tags
- `ScreensTest`: Summary
- `WidgetTest`: both widgets

To change the wording or the look, edit `frames.html`, then run `python3 store/render.py` (it needs Playwright and Pillow). The header of `render.py` explains how to refresh the screens.

## Text

**App name** (30 max)

```
Tasks: Daily Planner
```

**Short description** (80 max)

```
Plan each day, break big jobs into steps, and see your progress at a glance.
```

**Full description** (4000 max)

```
Tasks is a calm, fast day planner for people who juggle work for several companies or projects.

PLAN EACH DAY
• One list for today. Tick a task off, push it to tomorrow, or cancel it, and undo any of it.
• Swipe right to complete, left to postpone.
• Anything left unfinished moves to today by itself, outlined in red so nothing slips.
• Week strip and month calendar to jump to any day.

BIG JOBS, SMALL STEPS
• Break a task into steps, and steps into smaller steps, nested like a thread.
• The task completes itself when the last step is ticked.

EVERY CLIENT, ITS OWN TAG
• A tag for each company or project, with a colour and its logo (crop it right in the app).
• Filter your day by tag.

IMAGES ON TASKS
• Attach screenshots, receipts or whiteboard photos from the gallery or camera.
• Pinch to zoom, swipe between images.

YOUR DAY ON THE HOME SCREEN
• Two widgets: Today (4×2) and the Focus list (4×4).
• See your progress ring and what's left, and tick tasks off without opening the app.

A NUDGE BEFORE THE DAY ENDS
• An end-of-day notification (9 PM by default): what you finished, what's still open, high priority first.

SEE WHERE THE MONTH WENT
• Monthly summary with daily activity, completion rate, and progress per company.

AND
• Five themes: Light, Dark, Midnight Black (true black), Abyss (deep navy), or follow the system.
• Syncs live with the web app at tasks.skienlab.com. Changes show up on your other devices within a second.
• Opens instantly and works offline from the saved copy.
• Sign in with Google or email.
• No ads, no tracking.
```

**Category:** Productivity · **Tags:** To-do list, Planner, Productivity

**Contact email:** skienlabs@gmail.com · **Website:** https://tasks.skienlab.com

## Privacy

**Privacy policy URL:** https://tasks.skienlab.com/privacypolicy.html

The source is `web/client/public/privacypolicy.html`, deployed with the web app. It is linked in the app (Account sheet and sign-in screen) and in the web app (sign-in screen and Account dialog), as Google Play requires.

**Delete account URL** (Data safety → Data deletion): https://tasks.skienlab.com/privacypolicy.html#delete

The app's Account sheet and the web Account dialog both link to it ("Delete account"). That is Play's in-app path for asking to delete an account.

## Data safety form

- **Does your app collect or share user data?** Yes, it collects data. It shares nothing.
- **Encrypted in transit?** Yes.
- **Can users request deletion?** Yes.

| Data type | Collected | Purpose | Optional? |
| --- | --- | --- | --- |
| Personal info → Name | Yes | App functionality, Account management | Required |
| Personal info → Email address | Yes | App functionality, Account management | Required |
| Personal info → User IDs | Yes | App functionality, Account management | Required |
| Photos and videos → Photos | Yes (only those the user attaches) | App functionality | Optional |
| App activity → Other user-generated content (tasks, steps, notes, tags) | Yes | App functionality | Required |

Not collected: location, contacts, messages, financial info, health, audio, files, calendar, web history, device or other IDs, diagnostics. Photos are processed on the device and re-encoded, which removes location data.

## Content rating and the rest

- **Content rating** questionnaire: *Utility, productivity, communication*, no to everything → rated Everyone.
- **Target audience:** 18+ (or 13+). It isn't designed for children.
- **Ads:** No. **Government / financial / health app:** No.
- **App access:** reviewers need a login. Create a test account (email + password) in the app and enter it under *App content → App access*.

## Upload

Upload `app/app/build/outputs/bundle/release/app-release.aab` (`./gradlew bundleRelease`), not the APK.

When Play App Signing asks, keep **Google-generated app signing key**, and the `keystore/tasks-release.jks` key becomes your **upload key**.

After the first upload, copy the **App signing key** SHA-1 and SHA-256 from *Setup → App signing*. Add them to the Android app in Firebase (Project settings). Otherwise Google sign-in won't work for installs from the Play Store, because Google re-signs those builds with its own key.
