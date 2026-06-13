# Trakt Landing Focus

## Page Contract

The landing route is `trakt:start` and uses
`views/landing_shelf.view`. Its stable order is:

1. Search.
2. Movies - Trending shelf and `See more`.
3. Movies - Most Anticipated shelf and `See more`.
4. TV Shows - Trending shelf and `See more`.
5. TV Shows - Most Anticipated shelf and `See more`.
6. `Other lists`, containing the four Popular/Played directory links.

Popular and Played must not appear as preview sections. Played routes must call
`/movies/played/weekly` and `/shows/played/weekly`.

Authenticated shelves may appear before the public sections. Empty or failed
authenticated sections must remove their complete section node, but they must
still complete the landing readiness barrier.

## Implementation Pattern

The page creates every section node before starting API requests. Each
`landingSection` node owns a `data` array of card props. A request callback may
only populate or destroy its pre-created node, so response order cannot reorder
the shelves.

`views/landing_shelf.view` renders the page as an outer `list_y`.
`views/landing_section.view` renders each section as a title plus an independent
`list_x`, and `views/landing_card.view` opens the card URL. This establishes the
navigation contract:

- `Right` and `Left` move within the current shelf.
- `Up` and `Down` move between Search and shelves through the outer `list_y`.
- A shelf entered for the first time starts on its first card.
- A previously visited shelf may retain its local horizontal focus.

Do not add column synchronization between shelves.

`src/view.js` sets these metadata props:

- `traktLandingReady`: all scheduled public/auth preview requests completed.
- `traktUserNavigated`: an early navigation or activation event occurred.
- `traktFocusDelay`: numeric `onInactivity` trigger, armed only when ready and
  only if the user has not navigated.

The pending count is the four public previews plus seven auth previews when
authenticated. The landing-specific loader calls the shared completion function
exactly once after success, error, an empty response, or a loader/callback
exception. The general `templateList` helper remains unchanged for other routes.

The shelf view's root has early, non-final event guards that disarm auto-focus
without consuming navigation.
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
metadata.glwview = .../views/landing_shelf.view
metadata.traktLandingReady = 1
metadata.traktUserNavigated = 0
metadata.traktFocusDelay = 1
```

Expected GLW anchors:

```text
landing_search.view ... by FocusMethod
landing_shelf.view ... event-map 'down' ... during descent final=no
landing_card.view ... by NavStep
list_y @ .../landing_shelf.view
list_x @ .../landing_section.view
```

Send `Down`, then `Right`, `Left`, `Up`, and `Down` through Movian's input API.
The first `Down` must enter the first Movies Trending card. Horizontal events
must be intercepted by the nested `list_x`; vertical events must be intercepted
by the outer `list_y`. After the first event, expect
`traktUserNavigated=1` and `traktFocusDelay=0`.

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
- nodes 1-4 are the four public `landingSection` nodes in fixed order;
- each section's cards live under `node/data`;
- each public shelf ends with the correct `See more` route;
- Popular/Played links live in the `Other lists` section's `data`;
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
