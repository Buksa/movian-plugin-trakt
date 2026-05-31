---
name: testing-movian-trakt
description: Test the Movian Trakt plugin end-to-end in the Movian GUI. Use when verifying landing page categories, authentication, pagination, or image rendering.
---

# Testing Movian Trakt Plugin

## Prerequisites

- Movian must be built/installed (tarball at `/home/ubuntu/movian-f5581dfbe/` or deb package)
- Virtual display running (`Xvfb :1` or similar)
- Trakt credentials stored at `~/.hts/showtime/plugins/trakt/store/credentials`

## Devin Secrets Needed

- `TRAKT_CLIENT_SECRET` — needed for OAuth device flow authentication
- Test account credentials (email/password) for Trakt login if re-auth is needed

## Launching Movian

**Critical:** Movian MUST be launched from the tarball root directory because it resolves `res/` relative to CWD. The `-d` flag (debug/daemon mode) MUST be included.

```bash
cd /home/ubuntu/movian-f5581dfbe && DISPLAY=:1 ./build.linux/movian -d --debug-glw -p /path/to/plugin
```

Launching from any other directory causes shader/resource loading errors.

## HTTP API for Testing

Movian exposes a debug HTTP API at `http://127.0.0.1:42000/api/`:

| Endpoint | Usage |
|---|---|
| `GET /api/screenshot/raw` | Take PNG screenshot |
| `GET /api/open?url=trakt%3Astart` | Navigate to Trakt landing page |
| `GET /api/logfile/0` | Get full runtime log |
| `GET /api/prop/global` | Inspect prop tree (DOM-like structure) |

## Testing Landing Page Categories

1. Navigate: `curl -s "http://127.0.0.1:42000/api/open?url=trakt%3Astart"` then wait ~10s for API calls
2. Screenshot: `curl -s "http://127.0.0.1:42000/api/screenshot/raw" -o screenshot.png`
3. Scroll with xdotool: `DISPLAY=:1 xdotool key --repeat N --delay 200 Down`
4. Take multiple screenshots at different scroll positions to cover all categories

### Expected Categories (authenticated)

Auth-gated categories that may be empty depending on account data:
- Movies - Recommended
- Upcoming Episodes
- Upcoming Movies
- TV Shows in my Watchlist
- Movies in my Watchlist
- Recently Watched Shows
- Recently Watched Movies

Public categories (always have data):
- Movies - Trending, Popular, Most Played, Most Anticipated
- TV Shows - Trending, Popular, Most Played

### Verifying Items Render

- Each non-empty category should show up to 9 items + "See more" link
- Items should have poster images (not blank/placeholder)
- Count visible items per category in screenshots

## Log Verification

```bash
# Check for JS errors
curl -s "http://127.0.0.1:42000/api/logfile/0" | grep -ciE "TypeError|ReferenceError|SyntaxError"

# Check for non-200 API responses
curl -s "http://127.0.0.1:42000/api/logfile/0" | grep "HTTP status code:" | grep -v "200"

# Check for destroy/null-reference errors
curl -s "http://127.0.0.1:42000/api/logfile/0" | grep -ciE "destroy.*undefined|null.*reference"
```

All counts should be 0 for a clean test.

## Debug Settings

Enable verbose logging by writing to `~/.hts/showtime/settings/dev`:
```json
{ "httpdebug": 1, "ecmascriptdebug": 1 }
```

## Known Issues

- The "Movies - Trending" separator might appear with items rendering below it rather than directly under the separator — this is a pre-existing ordering issue unrelated to the empty categories fix.
- Movian uses `llvmpipe` (software rendering) on headless VMs, which may cause slower rendering. Wait 10+ seconds after navigation for all API calls to complete.
- The prop tree uses `moveBefore()` for item positioning; destroying a separator that's used as an anchor by another category's items will cause those items to be invisible. Any separator destruction must be deferred until all categories finish loading.
