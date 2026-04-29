# Trakt plugin for Movian

Track TV & movies on [Trakt](https://trakt.tv) from inside [Movian](https://movian.eu).

## Status

The plugin is alive again on Movian M7 (7.0.255+) against the current Trakt
v2 API. Browsing of trending / popular / anticipated / search and movie /
show / episode detail pages works without authentication. Login, scrobble
and watchlist features still depend on an OAuth proxy and need a separate
deployment to be useful (see *Known limitations* below).

## Install

Drop a zipped copy of this directory into Movian's installed-plugins
directory:

```
cd movian-plugin-trakt
zip -r ~/.hts/showtime/installedplugins/trakt.zip . -x '.git/*'
```

Restart Movian. The plugin will appear under *Sources* as **Trakt**.

## Develop

Movian's `-p` flag loads a plugin straight from a working tree, which is
the easiest way to iterate:

```
showtime -d -p /path/to/movian-plugin-trakt trakt:start
```

Enable verbose ECMAScript / HTTP debug output by writing to
`~/.hts/showtime/settings/dev`:

```
{
  "httpdebug": 1,
  "ecmascriptdebug": 1
}
```

## Known limitations

* `src/auth.js` posts to `https://movian.tv/oauthproxy/token`. That host no
  longer resolves, so login (and anything that depends on it: scrobble,
  watchlist, sync, calendars) is currently unavailable. Pointing
  `auth.js` at a working OAuth proxy is enough to bring those features
  back.
* OMDB metadata enrichment in `src/model.js` requires an API key today.
  The plugin tolerates an empty/erroring response and simply skips the
  extra fields.
