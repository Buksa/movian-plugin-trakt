---
name: testing-trakt-plugin
description: How to test the movian-plugin-trakt plugin in movian runtime on Ubuntu 22.04. Covers launching movian, HTTP API testing, and verifying image rendering.
---

# Testing movian-plugin-trakt

## Prerequisites

- Movian binary built from source tarball at `/home/ubuntu/movian-f5581dfbe/build.linux/movian`
- Plugin repo at `/home/ubuntu/repos/movian-plugin-trakt`
- X11 display available (`:0`)

## Launching Movian

**Critical:** Movian must be started from the tarball root directory (`/home/ubuntu/movian-f5581dfbe/`), not from any other path. The binary resolves `dataroot://res/` relative to CWD. If started from elsewhere, ECMAScript modules fail with `Can't find module movian/http`.

```bash
PERSIST=/home/ubuntu/movian-test-persist
CACHE=/home/ubuntu/movian-test-cache
LOG=/home/ubuntu/movian-test.log
mkdir -p "$PERSIST/settings" "$CACHE"
echo '{ "httpdebug": 1, "ecmascriptdebug": 1 }' > "$PERSIST/settings/dev"

cd /home/ubuntu/movian-f5581dfbe
DISPLAY=:0 ./build.linux/movian -d --persistent "$PERSIST" --cache "$CACHE" -p /home/ubuntu/repos/movian-plugin-trakt >"$LOG" 2>&1 &
```

**Flags:**
- `-d` — debug mode (enables verbose logging to stdout)
- `--persistent` — custom settings/credentials directory (avoids polluting default `~/.hts/showtime/`)
- `--cache` — custom cache directory
- `-p` — load development plugin from path

## HTTP API (port 42000)

Movian exposes an HTTP API for automated testing:

| Endpoint | Purpose |
|---|---|
| `GET /api/open?url=<encoded>` | Navigate to a plugin route |
| `GET /api/prop/global/...` | Read prop tree values |
| `GET /api/screenshot/raw` | Capture current screen as PNG |

### Common routes to test

```bash
BASE="http://127.0.0.1:42000"

# Landing page
curl -fsSL "$BASE/api/open?url=trakt%3Astart"

# Movies Trending
curl -fsSL "$BASE/api/open?url=trakt%3Amovies%3Atrending"

# Shows Popular
curl -fsSL "$BASE/api/open?url=trakt%3Ashows%3Apopular"

# Movie Detail (by Trakt ID)
curl -fsSL "$BASE/api/open?url=trakt%3Amovie%3A531178"

# Screenshot
curl -fsS -o screenshot.png "$BASE/api/screenshot/raw"
```

### Checking prop tree values

```bash
# First item icon URL
curl -fsS "$BASE/api/prop/global/navigators/current/currentpage/model/nodes/*0/metadata/icon"

# Page title
curl -fsS "$BASE/api/prop/global/navigators/current/currentpage/metadata/title"
```

## WebP Image Testing

Trakt API serves `.webp` image URLs. Movian cannot decode WebP. The plugin has a `useWebp` setting (default: off) that strips `.webp` suffix to get JPG fallback.

### Verifying WebP strip works

1. Launch movian with plugin
2. Open movies trending: `curl -fsSL "$BASE/api/open?url=trakt%3Amovies%3Atrending"`
3. Wait 5-6 seconds for data to load
4. Check icon URL: `curl -fsS "$BASE/api/prop/global/navigators/current/currentpage/model/nodes/*0/metadata/icon"`
   - **PASS:** URL ends with `.jpg` (not `.jpg.webp`)
5. Take screenshot and verify posters are visible (not blank boxes)

### Pass criteria

- Icon URLs end with `.jpg` not `.webp`
- Screenshots show visible poster artwork
- Zero `TypeError|ReferenceError|SyntaxError` in log
- Zero `Unable to load image` errors for JPG URLs

## Log Verification

```bash
# Check for JS errors
rg 'TypeError|ReferenceError|SyntaxError|is not defined' /home/ubuntu/movian-test.log

# Check for image loading errors
rg 'Unable to load image' /home/ubuntu/movian-test.log
```

## Notes

- Allow 5-8 seconds after opening a route before querying props or taking screenshots
- Movie detail pages use GLW views — prop paths differ from list pages
- The `service` object is a global in Movian's plugin scope — do NOT use `require('showtime/service')` in sub-modules; use the global directly (same as `api.js` does with `service.debug`)
