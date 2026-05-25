---
name: testing-trakt-plugin
description: Test the Trakt plugin end-to-end inside Movian. Use when verifying plugin changes, new sections, pagination, or auth flows.
---

# Testing Trakt Plugin in Movian

## Prerequisites

- Movian binary at `/home/ubuntu/movian-f5581dfbe/build.linux/movian`
- Plugin source at `/home/ubuntu/repos/movian-plugin-trakt`
- Xvfb running: `Xvfb :1 -screen 0 1920x1080x24 &`
- `DISPLAY=:1` exported

## Devin Secrets Needed

- `TRAKT_CLIENT_SECRET` — embedded in `src/api.js`, needed for OAuth device-code flow
- Trakt test account credentials for authenticated testing

## Launch Movian

**CRITICAL:** Must launch from tarball root and include `-d` flag:

```bash
export DISPLAY=:1
cd /home/ubuntu/movian-f5581dfbe/ && build.linux/movian -d --debug-glw -p /home/ubuntu/repos/movian-plugin-trakt
```

Run as background process. HTTP API available at `http://localhost:42000` once started.

## HTTP API Endpoints

| Endpoint | Purpose |
|----------|--------|
| `/api/screenshot/raw` | Capture current screen as PNG |
| `/api/open?url=<encoded>` | Navigate to a plugin URL |
| `/api/logfile/0` | Get console logs |

## Plugin URL Routes

Prefix is `trakt:` (from plugin.json `id` field).

| Route | Page |
|-------|------|
| `trakt:start` | Landing page (home) |
| `trakt:movies:trending` | Movies Trending (full page) |
| `trakt:movies:popular` | Movies Popular |
| `trakt:movies:played` | Movies Most Played |
| `trakt:movies:anticipated` | Movies Most Anticipated |
| `trakt:movie:<id>` | Movie detail page |
| `trakt:recommendations:movies` | Recommended Movies |
| `trakt:recommendations:shows` | Recommended Shows |
| `trakt:my:lists` | Custom Lists |
| `trakt:my:list:<listId>` | Individual list items |
| `trakt:history:movies` | Recently Watched Movies |
| `trakt:history:shows` | Recently Watched Shows |
| `trakt:calendars:mymovies` | Upcoming Movies |
| `trakt:calendars:myshows` | Upcoming Episodes |

## Key Test Scenarios

### 1. Landing Page Load
```bash
curl -s "http://localhost:42000/api/open?url=trakt%3Astart"
sleep 8
curl -s http://localhost:42000/api/screenshot/raw > landing.png
```
Verify: Title shows "Trakt - Home Page", sections with posters visible.

### 2. Check for JS Errors
The HTTP API logfile might not show detailed trace output. Instead, check the Movian process stdout/stderr directly (from the background shell output).

Filter for: `TypeError`, `ReferenceError`, `SyntaxError`, `Maximum call stack`.

**Known pre-existing issue:** `api.js:52` TypeError (`this.trace()` in debug mode) — ignore this.

### 3. Verify API Calls
In Movian's stdout, look for lines like:
```
trakt      |D|  HTTP status code: 200
```
All API calls should return 200.

### 4. Pagination Test
1. Navigate to full page: `curl -s "http://localhost:42000/api/open?url=trakt%3Amovies%3Atrending"`
2. First page should show 20 items in grid
3. Scroll down with: `DISPLAY=:1 xdotool key Down Down Down ...` (20+ times)
4. Page 2 should load automatically (items 21+)

### 5. Movie Detail + Watchlist Toggle
```bash
curl -s "http://localhost:42000/api/open?url=trakt%3Amovie%3A943606"
sleep 5
curl -s http://localhost:42000/api/screenshot/raw > movie.png
```
Verify: "Add to Watchlist" (or "Remove from Watchlist") action visible. No TypeError.

### 6. Authentication Flow
1. Auth is done via Settings in Movian UI
2. Device code flow: plugin shows code → user enters at trakt.tv/activate
3. After auth, landing page shows user-specific sections (Watchlist, Recently Watched, Calendar)

## Common Issues

- **"Unable to open resource" / "No handler for URL"**: Plugin not loaded. Kill and restart Movian.
- **`trakt:landing` doesn't exist**: Correct URL is `trakt:start`.
- **Empty recommendations section**: Normal if test account has limited watch history.
- **api.js:52 TypeError**: Pre-existing debug mode issue, not a bug in plugin code.
- **Pagination not loading**: Check that `templateList` receives API function with `bind(null, 1, 20)` where limit > numberItems.
