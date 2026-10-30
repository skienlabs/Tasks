# Changelog

One version number for the web app and the Android app. Bug fixes bump the last number (1.3.1), new features bump the middle one (1.4.0), and big changes bump the first (2.0.0).

Where it lives: `web/client/package.json` (`version`) and `app/app/build.gradle.kts` (`versionName`, plus `versionCode` +1 for every Android release).

## 2.0.0 · 31 Oct 2026

Teams grow up: everything a small company needs to hand out work, follow it and sign it off, on the web and on Android.

- **Sign-off**: mark a task "Needs sign-off". When the person finishes it, it shows "Waiting for review" and the admins are told; an admin **approves** it or **sends it back** with a note (the note goes into its comments and the task opens again). Approved tasks can only be reopened by an admin.
- **One task for several people**: pick several people, or a whole **group**, and choose "Each does their own" (everyone gets their own copy) or "First one to finish closes it" (when one finishes, the others' copies close with "Finished by Ann"; reopening it opens them again).
- **Groups** inside a team (Design, Sales, Night shift…) to give tasks to at once and to filter the board by.
- **Repeating team tasks**: daily, weekdays, weekly on chosen days, or monthly on a day (the 31st means the month's last day), with an optional finish-by time. Each one appears in the person's list on its day, also in time zones ahead of the server's; pause, resume, change or stop them under Settings.
- **Templates**: save a task you give often (steps, priority, time, team tags, sign-off) and start from it.
- **Comments** on team tasks: the person, whoever gave it and the admins talk on the task itself (one thread shared by all copies of a shared task).
- **Files**: attach PDFs, documents and sheets (up to 10 MB each) to any task; admins can add files and images to someone's team task, and attach files when giving one. Files always download, never open inside the app's pages.
- **Notifications**: a bell (web and Android) with team news: a task given to you or changed, comments, done / to review / approved / sent back, reminders, late tasks, join requests, the admins' morning summary and the Monday report. Live while the app is open; on Android also in the background (about every 15 minutes, as Android allows); on the web, an optional desktop alert while you're in another tab.
- **Remind** (nudge) someone about an open task, at most every half hour.
- **Morning summary for admins** ("Today in Acme: 4 due today · 1 late · 2 to review") and a **weekly report** every Monday (done, late, who did most).
- **New team pages for admins**: **Calendar** (a month of team tasks, coloured by person), **Workload** (open, due this week, late, urgent and to review per person, busy people marked), **Reports** (this week, last week or 30 days per person: given, done, on time, open, late) with **CSV and PDF export**, **Activity** (who did what, when) and **Settings**.
- **Person page**: tap someone for their open tasks, late count, done and on-time rate over 30 days, groups, and a quick "Give a task" or "Remind".
- **Job titles**: set your own, or anyone's as an admin; they show on the people list, the workload and the person page.
- **Invite link and QR code**: share a link (or let people scan the QR code); they ask to join and an admin lets them in or declines. Make a new link to stop the old one, or turn it off. On Android the link opens the app; "Join" on the Teams screen takes a pasted link.
- **Team tags** everyone in the team sees (Urgent, Client A…), set by admins, shown on team tasks and used to filter the board; people keep their own tags too.
- **Who can give tasks**: a setting lets members give tasks too (they follow and edit the ones they gave; only admins delete).
- **Archive a team**: for a finished project; it stays readable but nothing changes until its owner brings it back.
- The team board also filters by "To review" and "Late", by group and by team tag, and shows comment and file counts. Members see the tasks they have or gave.
- **The date strip is a scroll wheel** (Android): flick it and it keeps going (a fast flick travels weeks), with a tick on every day it passes, and it settles on a day, which opens. The month shows while it moves, and the 1st of each month is marked. Tap a day to pick it directly; the selected day stays in the middle.
- **Swipes ask first** (Android): swiping a task no longer completes or postpones it at once. The card turns green ("Mark as done?") or teal ("Postpone to tomorrow?") with No / Done (or Postpone) on the card itself, so an accidental swipe is harmless. It goes back by itself after a few seconds.
- **Team logos** (web and Android): add a logo to a team, picked and cropped like a tag's logo. It shows on the team list, the team page and invites. **Edit team** (name, colour, logo) now has its own button on the team page, besides the menu. The new team sheet's text is laid out properly.
- **Profile**: the name box is gone from the account sheet (Android); a small pencil next to your name on the profile card edits it.
- Glass White (Android): the floating buttons (+, Give a task) are solid now; they were see-through, so cards showed through them.
- API: teams take an optional `logo` (PNG/JPEG/WebP data URL, `null` removes it); invites include `teamLogo`. Database v8.
- API: see the Teams section of web/README.md: review, nudge, many people (`assignees` / `groupId` / `mode`), files (`/api/tasks/:id/files`, `/api/files/:id`), comments, notifications, groups, team tags, templates, repeating tasks, invite links and join requests, job titles, activity, settings and archive. Tasks gain `needsReview, review, groupId, groupMode, closedBy, teamTagIds, recurringId, files`. New live events `notifications` and `comments`. Database v9 (v8 added team logos).

## 1.9.0 · 28 Oct 2026

- **Teams** (web and Android). Make a team for your company, invite people by their email (Gmail or any other), and give them tasks.
  - **Invites** wait in the app: when someone signs in with the invited email (Google or email and password), the invite is on the Teams screen to accept or decline (a red badge shows on Teams). Tasks doesn't send emails itself, so after inviting you get a ready message to send them (copy, or share on WhatsApp, email, Slack…) with the app download link, the email to sign in with, and where to accept.
  - **Roles**: the owner, admins and members. Admins give out tasks, see everyone's progress and manage people; they can make other members admins. The owner can also make an admin a member again, hand the team over, or delete it. Anyone can leave.
  - **Giving out tasks**: pick the person, the task, details, steps, priority, day and an optional time limit. It shows up in their own Tasks list (and their phone's widgets and end-of-day summary), works offline, and carries over like their own tasks, with a "Team · from Boss" badge. Admins can edit, reassign (with its images), cancel, reopen or delete it.
  - **Members work on it, admins change it**: the person can complete it, postpone it, tick its steps, and add notes, images and their own tags. Only the team's admins change its title, priority, time limit or steps, cancel it or delete it.
  - **See who completed what**: Overview has this week / last 7 / last 30 days: done, open, late and due within a day, each person's progress, and recently completed tasks with who finished them and when. Tasks lists every team task by person and status. Updates live as people work.
  - If someone leaves or is removed, or the team is deleted, its tasks stay in each person's list as their own.
- **Time limits** (web and Android): an optional "Time limit" switch when adding or editing a task (off by default; the quick add box has a timer button). Pick a date and time; the task shows a countdown ("Fri 5:00 PM · 2d left"), amber within a day and red once it has passed, and "on time" or "finished 30m late" once done. Android reminds you an hour before and when the time is up, also offline.
- **A tag is required for new tasks**: pick one or more tags, or choose the new "No tag" option. Adding a task without either shows a warning (quick add opens the tag menu). Editing existing tasks is unchanged.
- **Get the Android app from the web**: the sign-in page and the account menu offer the APK download (Tasks.apk, with its size) when the server has one.
- **Web on phones**: the sign-in page now fits the screen. The animated scene scales to the phone's width (narrow phones and large text sizes drew it off-centre), is hidden on short screens, and the form (Google, email, password, Sign in) is in view without scrolling. Teams pages fit phones too.
- Fixed (web): live sync since 1.8.0. Changes made on another device or by a teammate showed only after switching back to the tab; now they show within a second again.
- API: teams (`/api/teams`, `/api/invites`, team tasks), `dueAt` on tasks, `teamId` / `assignee` / `assignedBy` on team tasks, `teams` and `invites` in `/api/sync`, `teams` / `invites` live events, `GET /download/android`, `android` in `/api/config`. Database v7.

## 1.8.0 · 23 Oct 2026

- **Works offline** (web and Android). The app opens and works with no connection: every day, search, the summary, adding, completing, editing, postponing, moving, deleting tasks, steps, images and tags. Changes are saved on the device and sent, in order, as soon as it's back online; a badge in the top bar shows "Offline · 3 waiting" and then "Syncing". The device keeps a full copy of your account (refreshed from the server whenever it's online), so even days you never opened are there.
  - Changes made offline reach the server before anything is carried over, so a task you completed offline yesterday stays done on yesterday. A task added offline is accepted even when it syncs the next day.
  - Sending a change twice (for example when the reply was lost) is harmless: postponing moves the task once, deleting something already gone is fine.
  - If the server refuses an offline change (say, a tag name that's now taken), only that change is undone, with a message.
  - Signing out with changes not yet sent asks first. Signing out also deletes this device's copy.
  - Web: the whole app is saved by the service worker (every screen works offline, even ones not opened before), images are kept on the device, and several tabs share one queue without sending anything twice. Android: changes also wait safely if the app is closed, images to upload are kept in app storage, and widget ticks work offline too.
- **Task cards redesigned**: calm, neutral cards with normal text everywhere. Colour now only marks things: the tag spine, a soft outline for tasks from earlier days (red for high priority), the logo ringed in its tag's colour, and the clock icon on "From Tue, 20 Oct". No more coloured fills, coloured names or tinted pills, so pink (or any) tags stay readable.
- **Glass themes removed** on the web, and Glass Black removed on Android (Glass White stays on Android). Anyone using one is moved to System.
- **Light Gray is now Dark Gray**: VS Code's dark theme (charcoal greys, a darker title bar and side bar around the page, hairline borders, VS Code blue and syntax colours).
- **New themes: Black & White and White & Black**: pure ink on a black or white page; priorities, tags and charts in shades of grey, with only lateness kept red.
- API: `GET /api/sync?today=` (the whole account, after carry-over); `POST /api/tasks/:id/postpone` takes an optional `from`.

## 1.7.0 · 22 Oct 2026

- **Search every task** (web and Android). Results show as you type, best first: title matches before tag names, steps and notes, open tasks before finished ones, nearer days first, with the matched words highlighted and the step or note that matched. Suggestions complete the word you're typing (title words, tags, filters). Filters: `#tag`, `is:open` / `is:done` / `is:cancelled` / `is:late`, `p:high`, `date:today|tomorrow|week|month|2026-10-22`, `before:` / `after:`, `has:steps|images|notes`, and "quoted phrases". Close spellings still find things ("sevrer" → server). Recent searches and one-tap filters when the box is empty. Opening a result jumps to its day and shows its details.
  - Web: the search box in the top bar, or press `/` or `Ctrl K` (`⌘K` on Mac); arrow keys and Enter to pick, Tab takes a suggestion. Full screen on phones.
  - Android: the search button in the top bar. Without a connection it searches the days saved on the phone.
- **The date moved to the top bar**: "Thursday, 22 October 2026", with the weekday in the theme's gradient on today (it shortens to "Thu, 22 Oct 2026" when space is tight). The big "Today" heading is gone; above the list is one compact line: a greeting (or "Tomorrow", "In 3 days", "2 days ago"), the counts, and a small progress ring. Web: the Today button is filled while you're on today.
- **Unfinished days now show as unfinished** in the summary. When a task moves on to the next day by itself, the day it left still counts it, as "not finished", in red: in the daily chart, the day-by-day list ("2 done · 3 not finished"), the week strip and a past day's header ("3 moved on"). Before, those days looked 100% done. The server remembers every day a task was carried past (history from earlier carry-overs is filled in once).
- **Profile card redesigned** (Android account sheet and the web account menu): a card with a soft wash of your theme's colours, your photo in a slowly turning gradient ring, name, email, how you sign in, member since, and this week at a glance (done, still open, % complete). Android's settings are grouped into Profile, Notifications and Appearance, with a full-width Sign out.
- **Two new themes: Glass Black and Glass White**, after Apple's Liquid Glass. Frosted, see-through panels float over slowly drifting coloured light; each panel has a bright rim that catches the light and a sheen that sweeps across now and then. Cards float in with a soft spring, lift on hover (web) and sink a little when pressed (Android); menus and dialogs pop in with a blur. Respects "reduce motion".
- API: `GET /api/search?q=&today=&limit=`; `/api/summary` and `/api/stats` days include `missed`.

## 1.6.0 · 21 Oct 2026

- **End-of-day notification redesigned** (Android): a progress ring (done of total), a colour bar of done and open tasks by priority with a legend, then the open tasks with a priority dot and how long each has waited ("since Mon"), and "+ 13 more". Taller when expanded, one clean line each.
- **One properly sorted list** everywhere (web, Android, widgets, notification): open first, then **priority** (High → None), then **company** (tasks of the same tag together, tags A–Z, untagged last), then **title A–Z** with numbers read as numbers ("Server 9" before "Server 10"). A task's company is its first tag in your own tag order.
- **New theme: Light Gray**: medium light grey after VS Code's light theme (grey chrome, lighter raised panels, VS Code blue).
- **Abyss improved**: deeper layered navy with more contrast, a soft background glow with a frosted top bar (web), and Abyss's own blue → purple → gold accent on "Today".
- Web: the "Today" heading now shows its whole colour gradient. Theme picker shows six themes in a 3×2 grid (web and Android).

## 1.5.0 · 19 Oct 2026

- **Tasks from earlier days are outlined in their tag's colour**, not red: the Skien task in blue, the Softop task in orange. **High-priority** ones stay red, and tasks without a tag get a neutral outline. The "From yesterday" pill uses the same colour. Today's own tasks have no outline.
- **No new tasks on past days**, on web, Android and the server. A past day shows "This day has passed" with a button to today, the date picker starts at today, and the server refuses earlier dates (Undo can still restore a task to its old day).
- **Web: tags moved to the right of each task** as a bigger plate with the company's logo and name; more tags stack as logos beside it (logo only on narrow screens).
- Web: fixed a faint line at the right edge of task cards.

## 1.4.0 · 18 Oct 2026

- **Android: tapping a task shows its details** (status, date, priority, tags, notes, steps you can tick, images, history), like the web app. Editing is only under ⋮ → Edit (or a long press).
- **Tag colours redesigned** (web and Android): instead of a strip glued to the card's edge, a slim rounded spine sits just inside it, one segment per tag, with a soft wash of the tag colour behind open tasks. It no longer clashes with the outline of a selected or carried-over task.
- **Web:** the theme picker is only on the palette button now, not in the profile menu.
- **Android:** the theme cards are folded under a "Theme" dropdown in Account.

## 1.3.0 · 18 Oct 2026

- **Unfinished tasks move to today by themselves.** No more "Move all to today": the server carries them over the first time a device opens today. They're outlined in red with where they came from ("From yesterday", "From Thu, 15 Oct"). Postponing or moving one on purpose clears the mark, and Undo brings it back.
- **Web: click a task to see its details** in a pane on the right (a sheet on phones): status, date, priority, tags, notes, steps you can tick, images, history. Editing is now only under ⋮ → Edit. Esc closes the pane.
- **New themes** on web and Android: Dark (soft grey) and Abyss (deep navy, like the VS Code theme). AMOLED is now called Midnight Black.
- **Web: account menu and Account dialog reorganized**: who's signed in, tags, theme cards, privacy, sign out.
- Copyright and version at the bottom of the sidebar.

## 1.2.3

- Privacy policy (web and in the app), Play Store listing images.

## 1.2.2

- Android: saving a tag that already had a logo failed (NetworkOnMainThreadException).

## 1.2.1

- Web: welcome screen text centred. Android: clearer error messages.
