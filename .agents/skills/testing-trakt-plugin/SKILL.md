---
name: testing-trakt-plugin
description: Test the Trakt plugin end-to-end inside Movian. Use when verifying view.js changes, category layout, pagination, auth flows, or image rendering.
---

# Testing Trakt Plugin in Movian

## Prerequisites

- Movian binary built from source tarball (e.g. `$MOVIAN_ROOT/build.linux/movian`)
- Plugin source checked out (e.g. `$PLUGIN_DIR`)
- Virtual display: `Xvfb :1 -screen 0 1920x1080x24 &`

## Launching Movian

**Critical:** Must launch from the tarball root directory — Movian resolves `res/` relative to CWD. The `-d` flag (debug mode) is required.

```bash
export DISPLAY=:1
cd "$MOVIAN_ROOT" && ./build.linux/movian -d --debug-glw -p "$PLUGIN_DIR"
```

Typical paths on Devin VM:
- `MOVIAN_ROOT=/home/ubuntu/movian-f5581dfbe`
- `PLUGIN_DIR=/home/ubuntu/repos/movian-plugin-trakt`

HTTP API becomes available at `http://127.0.0.1:42000` once started. Screenshot endpoint may return 504 for the first 5–10s while GLW rendering initializes.

## HTTP API

| Endpoint | Purpose |
|---|---|
| `GET /api/screenshot/raw` | PNG screenshot of current UI |
| `GET /api/open?url=<encoded>` | Navigate to a plugin URL |
| `GET /api/logfile/0` | Full runtime log |
| `GET /api/prop/global` | Inspect prop tree (text format) |

## Plugin Routes

All routes use the `trakt:` prefix (from `plugin.json` `id` field).

| Route | Page | Auth required |
|---|---|---|
| `trakt:start` | Landing page (home) | No |
| `trakt:movies:trending` | Movies Trending | No |
| `trakt:movies:popular` | Movies Popular | No |
| `trakt:movies:played` | Movies Most Played | No |
| `trakt:movies:anticipated` | Movies Most Anticipated | No |
| `trakt:shows:trending` | TV Shows Trending | No |
| `trakt:shows:popular` | TV Shows Popular | No |
| `trakt:shows:played` | TV Shows Most Played | No |
| `trakt:shows:anticipated` | TV Shows Most Anticipated | No |
| `trakt:movie:<id>` | Movie detail | No |
| `trakt:movie:<id>:similar` | Similar movies | No |
| `trakt:show:<id>` | Show detail | No |
| `trakt:show:<id>:similar` | Similar shows | No |
| `trakt:show:<id>:season:<n>` | Season detail | No |
| `trakt:search:<query>` | Search results | No |
| `trakt:recommendations:movies` | Recommended Movies | Yes |
| `trakt:recommendations:shows` | Recommended Shows | Yes |
| `trakt:history:movies` | Recently Watched Movies | Yes |
| `trakt:history:shows` | Recently Watched Shows | Yes |
| `trakt:calendars:myshows` | Upcoming Episodes | Yes |
| `trakt:calendars:mymovies` | Upcoming Movies | Yes |
| `trakt:my:watchlist:<type>` | Watchlist (movies/shows) | Yes |
| `trakt:my:lists` | Custom Lists | Yes |
| `trakt:my:list:<listId>` | Individual list items | Yes |

## Auth Token Management

Credentials are stored at `~/.hts/showtime/plugins/trakt/store/credentials`.

The HTTP inspector (`src/api.js`) adds `Authorization: Bearer <token>` to **all** requests to `api.trakt.tv`. If the token is expired, even public endpoints return 401.

**Workaround for expired tokens:**
```bash
echo '{}' > ~/.hts/showtime/plugins/trakt/store/credentials
```
Then restart Movian. Public endpoints work without auth; auth-gated categories correctly show as empty.

**Authentication flow:** Device OAuth via Settings → Trakt → Login. Plugin shows a code → user enters at `trakt.tv/activate` → plugin polls for token. Requires `TRAKT_CLIENT_SECRET`.

## Landing Page Categories

**Public** (always have data, no auth needed):
- Movies — Trending, Popular, Most Anticipated, Most Played
- TV Shows — Trending, Popular, Most Anticipated, Most Played

**Auth-gated** (depend on user's Trakt account data):
- Upcoming Episodes, Upcoming Movies
- Movies/Shows Recommended
- Movies/Shows in Watchlist
- Recently Watched Movies/Shows

Each non-empty category shows up to 9 items + "See more" link.

## Key Test Assertions

1. **Items under correct header:** Each category's items appear between its separator and the next. The `beforeItem` prop in `templateList` controls positioning.
2. **Empty categories hidden:** Categories with no data should not show separator headers.
3. **Poster images:** Items should have poster thumbnails, not blank placeholders.
4. **Pagination:** "See more" navigates to full page; scrolling down loads page 2 (items 21+).
5. **Log cleanliness:** Zero `TypeError|ReferenceError|SyntaxError` in log.

## Scrolling the UI

```bash
export DISPLAY=:1
for i in $(seq 1 N); do xdotool key Down; sleep 0.15; done
sleep 2
curl -s http://127.0.0.1:42000/api/screenshot/raw -o screenshot.png
```

## Log Verification

```bash
LOG=$(curl -s http://127.0.0.1:42000/api/logfile/0)

# JS errors (should be 0)
echo "$LOG" | grep -ciE "TypeError|ReferenceError|SyntaxError"

# HTTP failures (should be 0 for expected endpoints)
echo "$LOG" | grep -E "HTTP/1\.1 [45][0-9][0-9]"
```

## Debug Settings

Enable verbose logging by writing to `~/.hts/showtime/settings/dev`:
```json
{ "httpdebug": 1, "ecmascriptdebug": 1 }
```

## Secrets Needed

- `TRAKT_CLIENT_SECRET` (repo-scoped) — for device OAuth flow
- Test account credentials for authenticated testing
