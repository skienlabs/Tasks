# Changelog

One version number for the web app and the Android app. Bug fixes bump the last number (1.3.1), new features bump the middle one (1.4.0), and big changes bump the first (2.0.0).

Where it lives: `web/client/package.json` (`version`) and `app/app/build.gradle.kts` (`versionName`, plus `versionCode` +1 for every Android release).

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
