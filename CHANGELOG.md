# Changelog

One version number for the web app and the Android app. Bug fixes bump the last number (1.3.1), new features bump the middle one (1.4.0), and big changes bump the first (2.0.0).

Where it lives: `web/client/package.json` (`version`) and `app/app/build.gradle.kts` (`versionName`, plus `versionCode` +1 for every Android release).

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
