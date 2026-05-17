/*
Trakt plugin for Movian Media Center Copyright (C) 2016 Fábio Ferreira

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

This program is also available under a commercial proprietary license.
*/

var http = require('showtime/http');
var itemhook = require('showtime/itemhook');
var page = require('showtime/page');
var prop = require('showtime/prop');
var service = require('showtime/service');
var settings = require('showtime/settings');

var api = require('./src/api');
var auth = require('./src/auth');
var log = require('./src/log');
var lookup = require('./src/lookup');
var itemhooks = require('./src/itemhooks');
var model = require('./src/model');
var plugin = require('./src/plugin');
var popup = require('./src/popup');
var scrobble = require('./src/scrobble');
var utils = require('./src/utils');
var view = require('./src/view');

var tnp = require('./libs/torrent-name-parser/index');

var credentials = require('showtime/store').create('credentials');

var playbackSession = {};

var plugin_info = plugin.getDescriptor();
var PREFIX = plugin_info.id;

service.create(plugin_info.title, PREFIX + ":start", "video", true,
    plugin.getLogoPath());

settings.globalSettings(PREFIX, plugin_info.title, plugin.getLogoPath(),
    plugin_info.title);

settings.createDivider("Authentication");

settings.createInfo("infoLogin", plugin.getLogoPath(),
    "You may login again if you want to use a different account");
var settingsLogin = settings.createAction("login", "Login", function(page) {
    auth.login();
});

if (Core.currentVersionInt >= 50000241) {
    settings.createDivider("Scrobble");

    settings.createInfo("infoScrobble", plugin.getLogoPath(),
        "If you are authenticated, you may scrobble automatically movies/episodes you watch.\n" +
        "With this feature you don't need to manually set a movie/episode as watched on Trakt.\n" +
        "Note: Use the video's context menu option to start scrobbling manually if automatic\n scrobble does not work for the video.");

    settings.createBool("scrobble", "Enable Scrobble", false, function(v) {
        service.scrobble = v;
    });

    settings.createBool("scrobbleNotifications", "Show Notifications", true, function(v) {
        service.scrobbleNotifications = v;
    });
}

settings.createDivider("Debug");

settings.createBool("debug", "Write to stdout debug information", false, function(v) {
    service.debug = v;
});

scrobble.init();

itemhooks.init();

new page.Route(PREFIX + ":start", function(page) {
    view.landingPage(page);
});

new page.Route(PREFIX + ":calendars:myshows", function(page) {
    view.calendars.myshows(page);
});

new page.Route(PREFIX + ":movie:(.*)", function(page, id) {
    view.movie(page, id);
});

new page.Route(PREFIX + ":movie:(.*):config:(.*)", function(page, id, config) {
    view.movie(page, id, JSON.parse(unescape(config)));
});

new page.Route(PREFIX + ":movie:(.*):similar", function(page, id) {
    view.movie.similar(page, id);
});

new page.Route(PREFIX + ":movies:anticipated", function(page) {
    view.movies.anticipated(page);
});

new page.Route(PREFIX + ":movies:played", function(page) {
    view.movies.played(page);
});

new page.Route(PREFIX + ":movies:popular", function(page) {
    view.movies.popular(page);
});

new page.Route(PREFIX + ":movies:trending", function(page) {
    view.movies.trending(page);
});

new page.Route(PREFIX + ":my:watchlist:(.*)", function(page, type) {
    view.my.watchlist(page, type);
});

new page.Route(PREFIX + ":open:list:(.*)", function(page, config) {
    view.open.list(page, JSON.parse(unescape(config)));
});

new page.Route(PREFIX + ":scrobble:list:(.*)", function(page, config) {
    view.scrobble.list(page, JSON.parse(unescape(config)));
});

new page.Route(PREFIX + ":scrobble:play:movie:(.*):(.*)", function(page, url, id) {
    url = unescape(url);

    playbackSession = {
        url: url,
        item: {
            movie: {
                ids: {
                    trakt: parseInt(id)
                }
            }
        }
    };

    page.redirect(url);
});

new page.Route(PREFIX + ":scrobble:play:episode:(.*):(.*):(.*):(.*)", function(page, url, id, season, episode) {
    url = unescape(url);

    playbackSession = {
        url: url,
        item: {
            show: {
                ids: {
                    trakt: parseInt(id)
                }
            },
            episode: {
                season: parseInt(season),
                number: parseInt(episode)
            }
        }
    };

    page.redirect(url);
});

new page.Route(PREFIX + ":search:(.*)", function(page, query) {
    view.search(page, query);
});

new page.Route(PREFIX + ":show:(.*)", function(page, id) {
    view.show(page, id);
});

new page.Route(PREFIX + ":show:(.*):config:(.*)", function(page, id, config) {
    view.show(page, id, JSON.parse(unescape(config)));
});

new page.Route(PREFIX + ":show:(.*):season:(.*)", function(page, show, number) {
    view.season(page, show, parseInt(number));
});

new page.Route(PREFIX + ":show:(.*):season:(.*):config:(.*)", function(page, show, number, config) {
    view.season(page, show, parseInt(number), JSON.parse(unescape(config)));
});

new page.Route(PREFIX + ":show:(.*):season:(.*):episode:(.*)",
    function(page, show, season, episode) {
        view.episode(page, show, season, episode);
    });

new page.Route(PREFIX + ":show:(.*):season:(.*):episode:(.*):config:(.*)",
    function(page, show, season, episode, config) {
        view.episode(page, show, season, episode, JSON.parse(unescape(config)));
    });

new page.Route(PREFIX + ":show:(.*):similar", function(page, id) {
    view.show.similar(page, id);
});

new page.Route(PREFIX + ":shows:anticipated", function(page) {
    view.shows.anticipated(page);
});

new page.Route(PREFIX + ":shows:played", function(page) {
    view.shows.played(page);
});

new page.Route(PREFIX + ":shows:popular", function(page) {
    view.shows.popular(page);
});

new page.Route(PREFIX + ":shows:trending", function(page) {
    view.shows.trending(page);
});
