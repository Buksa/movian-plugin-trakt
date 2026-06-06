# Trakt Landing Focus

## Page Contract

The landing route is `trakt:start` and uses
`views/landing_grid.view`. Its stable order is:

1. Search.
2. Movies - Trending preview and `See more`.
3. Movies - Most Anticipated preview and `See more`.
4. TV Shows - Trending preview and `See more`.
5. TV Shows - Most Anticipated preview and `See more`.
6. `Other lists`, containing the four Popular/Played directory links.

Popular and Played must not appear as preview sections. Played routes must call
`/movies/played/weekly` and `/shows/played/weekly`.

Authenticated preview sections may appear before the public sections. Empty
authenticated sections must remove their separators, but they must still
complete the landing readiness barrier.

## Implementation Pattern

`src/view.js` sets these metadata props:

- `traktLandingReady`: all scheduled public/auth preview requests completed.
- `traktUserNavigated`: an early navigation or activation event occurred.
- `traktFocusDelay`: numeric `onInactivity` trigger, armed only when ready and
  only if the user has not navigated.

The pending count is the four public previews plus seven auth previews when
authenticated. Every `templateList` completion path calls the shared
completion function. `templateList` already calls `onComplete` after success,
error, and empty data, so callers should not add a second decrement.

The custom grid preserves the flat skin's array behavior. Its root has early,
non-final event guards that disarm auto-focus without consuming navigation.
The search clone loads `landing_search.view`, where the inactivity handler and
the static `trakt-landing-search` ID live in the same view tree.

This locality matters: putting `focus("trakt-landing-search")` in the parent
grid while the ID belongs to a separately loaded clone did not resolve
reliably.

## Normal-Load Test

Launch from the Movian checkout with an isolated profile:

```bash
./build.debug/movian \
  -d --debug-glw --disable-upgrades \
  --persistent /tmp/trakt-landing-focus/persistent \
  --cache /tmp/trakt-landing-focus/cache \
  -p /path/to/movian-plugin-trakt \
  trakt:start
```

Wait for these STPP values:

```text
title = Trakt - Home Page
url = trakt:start
loading = 0
metadata.glwview = .../views/landing_grid.view
metadata.traktLandingReady = 1
metadata.traktUserNavigated = 0
metadata.traktFocusDelay = 1
```

Expected GLW anchors:

```text
landing_search.view ... by FocusMethod
landing_grid.view ... event-map 'down' ... during descent final=no
items/rect/default.view ... by FocusChild
array @ .../landing_grid.view
```

Send `Down`, then `Right`, `Left`, `Up`, and `Down` through Movian's input API.
After the first event, expect `traktUserNavigated=1` and
`traktFocusDelay=0`.

## Early-Input Race Test

Use a fresh isolated profile. Open `trakt:start` and send `Down` immediately
after the HTTP server becomes available, before previews finish.

After loading completes, require:

```text
traktLandingReady = 1
traktUserNavigated = 1
traktFocusDelay = 0
```

The GLW log must show the early non-final `down` guard. There must not be a
later `FocusMethod` that returns focus to Search.

## Route and Node Checks

Inspect `currentpage/model/nodes` rather than relying only on screenshots:

- node 0 is Search;
- Trending cards follow the Movies Trending separator;
- each preview ends with the correct `See more` route;
- Popular/Played links are after `Other lists`;
- movie/show cards open detail pages;
- all four Popular/Played links reach `loading=0`.

Grep the log for:

```text
/movies/played/weekly
/shows/played/weekly
TypeError|ReferenceError|SyntaxError|GLW.*ERROR|Unable to load|parse error
```

## Input Caveat

HTTP actions prove focus routing but may not display the flat skin's visual
cursor because they do not set `EVENT_KEYPRESS`. Use X11 for visual proof only
after checking the GLW event name. In WSL, an attempted arrow key was observed
as `Click, Activate`; that run is invalid as keyboard-navigation evidence.
