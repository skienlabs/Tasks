# Changelog

One version number for the web app and the Android app. Bug fixes bump the last number (1.3.1), new features bump the middle one (1.4.0), and big changes bump the first (2.0.0).

Where it lives: `web/client/package.json` (`version`) and `app/app/build.gradle.kts` (`versionName`, plus `versionCode` +1 for every Android release).

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
