---
name: testing-trakt-plugin
description: Test the Movian Trakt plugin landing page and category rendering. Use when verifying view.js changes, category layout, or API integration.
---

## Launch Movian

Movian MUST be launched from the tarball root (it resolves `res/` relative to CWD):

```bash
Xvfb :1 -screen 0 1920x1080x24 &
cd /home/ubuntu/movian-f5581dfbe && DISPLAY=:1 ./build.linux/movian -d --debug-glw -p /home/ubuntu/repos/movian-plugin-trakt
```

The `-d` flag is required (debug/daemon mode).

## HTTP API (available at `http://127.0.0.1:42000`)

| Endpoint | Purpose |
|---|---|
| `/api/screenshot/raw` | PNG screenshot of current UI |
| `/api/open?url=trakt%3Astart` | Navigate to landing page |
| `/api/logfile/0` | Full runtime log |
| `/api/prop/global/nav/currentpage` | Prop tree (text, not JSON) |

Screenshot may return 504 if GLW rendering hasn't initialized yet — wait 5-10s after launch before requesting.

## Auth Token Management

The plugin stores credentials at `~/.hts/showtime/plugins/trakt/store/credentials`.

The HTTP inspector (`src/api.js`) adds `Authorization: Bearer <token>` to ALL requests to `api.trakt.tv`. If the token is expired, even public endpoints (trending, popular) return 401.

**Workaround for expired tokens:** Clear credentials to let public endpoints work without auth:
```bash
echo '{}' > ~/.hts/showtime/plugins/trakt/store/credentials
```
Then restart Movian. Auth-gated categories will be empty (tests the empty-category-hiding fix), public categories will work normally.

## Landing Page Category Order

With auth: Movies (Trending → Popular → Most Anticipated → Most Played) → auth-gated categories (Upcoming Episodes, Upcoming Movies, Recommendations, Watchlist, Recently Watched) → TV Shows (Trending → Popular → Most Anticipated → Most Played) → Other lists.

Without auth: Only the 8 public categories + Other lists.

## Key Assertions for Landing Page

1. **Items under correct header:** Each category's items must appear between its separator header and the next separator. The `beforeItem` prop in `templateList` controls this — wrong anchors cause items to render under the wrong category.
2. **Empty categories hidden:** Auth-gated categories with no data should have their separator destroyed (no empty headers visible).
3. **Item count:** Each category shows up to 9 items + "See more" link.
4. **Poster images:** Items should have poster thumbnails, not blank placeholders.
5. **Log cleanliness:** `grep -iE 'TypeError|ReferenceError|SyntaxError' <log>` should return nothing.

## Scrolling the UI

Use xdotool to scroll through the landing page:
```bash
export DISPLAY=:1
for i in $(seq 1 N); do xdotool key Down; sleep 0.15; done
sleep 2
curl -s http://127.0.0.1:42000/api/screenshot/raw -o screenshot.png
```

## Devin Secrets Needed

None required for public endpoint testing. For auth-gated testing:
- `TRAKT_CLIENT_SECRET` (repo-scoped) — needed for device OAuth flow
- Test account credentials stored in Trakt plugin credentials file
