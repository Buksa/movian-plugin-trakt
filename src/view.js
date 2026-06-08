var lookup = require('./lookup');
var model = require('./model');
var utils = require('./utils');

function handleEpisodeItem(page, item, config) {
    var title = item.show.title +
        " - S" + utils.formatNumber(item.episode.season, 1) +
        "E" + utils.formatNumber(item.episode.number, 1);
    var subtitle = new Date(item.first_aired).toLocaleString();

    var screenshot = utils.toImageSet(item.episode, 'screenshot', false);
    if (!screenshot) screenshot = utils.toImageSet(item.show, 'thumb', false);
    if (!screenshot) screenshot = utils.toImageSet(item.show, 'fanart', true);

    var pageItem = page.appendItem(PREFIX + ":show:" + item.show.ids.trakt +
        ":season:" + item.episode.season + ":episode:" + item.episode.number, 'directory', {
            title: title,
            subtitle: subtitle,
            icon: screenshot
        });

    if (config.beforeItem)
        pageItem.moveBefore(config.beforeItem);
}

function handleMovieItem(page, item, config) {
    var id = item.ids.trakt;
    var title = item.title;
    var poster = utils.toImageSet(item, 'fanart', true);
    //if (!poster) poster = utils.toImageSet(item, 'thumb', false);
    //if (!poster) poster = utils.toImageSet(item, 'poster');
    var pageItem = page.appendItem(PREFIX + ":movie:" + id, 'directory', {
        title: title,
        icon: poster
    });

    if (config.beforeItem)
        pageItem.moveBefore(config.beforeItem);
}

function handleShowItem(page, item, config) {
    var id = item.ids.trakt;
    var title = item.title;
    var poster = utils.toImageSet(item, 'thumb', false);
    if (!poster) poster = utils.toImageSet(item, 'fanart', true);
    //if (!poster) poster = utils.toImageSet(item, 'poster');
    var pageItem = page.appendItem(PREFIX + ":show:" + id, 'directory', {
        title: title,
        icon: poster
    });

    if (config.beforeItem)
        pageItem.moveBefore(config.beforeItem);
}

function templateList(page, model, config) {
    if (model === null) throw 'Model has not been specified';
    config = config || {};

    var processedEntries = 0;
    var totalEntries = 0;

    var pageNum = config.pageNum ? config.pageNum : 1;
    var numberItemsPerPage = config.numberItems ? config.numberItems : 10;

    var loader = model.bind(null, function (data, pagination, error) {
        page.loading = false;

        if (error) {
            log.d("Cancelling pagination due to error:");
            log.e(error);
            page.haveMore(false);
            if (config.destroyIfNoElements) {
                if (typeof config.destroyIfNoElements === 'function')
                    config.destroyIfNoElements();
                else
                    config.destroyIfNoElements.destroy();
            }
            if (config.onComplete) config.onComplete();
            return;
        }

        var hadMore = false;

        if (pagination)
            totalEntries = pagination.itemCount;

        var i, item;
        for (i = 0; i < data.length; i++) {
            if (config.numberItems && processedEntries >= config.numberItems) {
                hadMore = true;
                break;
            }

            item = data[i];
            processedEntries++;

            if (item.movie)
                handleMovieItem(page, item.movie, config);
            else if (item.episode)
                handleEpisodeItem(page, item, config);
            else if (item.show)
                handleShowItem(page, item.show, config);
            else if (config.itemType === 'movie')
                handleMovieItem(page, item, config);
            else if (config.itemType === 'show')
                handleShowItem(page, item, config);
            else {
                log.e('Unknown item type.');
                continue;
                //log.e(item);
            }

            page.entries++;
        }

        if (processedEntries === 0) {
            if (config.destroyIfNoElements) {
                if (typeof config.destroyIfNoElements === 'function')
                    config.destroyIfNoElements();
                else
                    config.destroyIfNoElements.destroy();
            } else {
                var item = page.appendPassiveItem("default", null, {
                    "title": "There are no resources available"
                });

                if (config.beforeItem) item.moveBefore(config.beforeItem);
            }
        }

        if (config.noPaginator && config.moreItemsUri && (processedEntries < totalEntries || hadMore)) {
            var item = page.appendItem(config.moreItemsUri, "directory", {
                "title": "See more"
            });

            if (config.beforeItem) item.moveBefore(config.beforeItem);
        }

        if (pagination && pagination.hasNext) {
            if (!config.noPaginator) {
                page.asyncPaginator = pagination.loadNextPage;
                page.haveMore(true);
            }
        }

        if (config.onComplete) config.onComplete();
    }, pageNum, numberItemsPerPage);

    if (!config.noPaginator) page.asyncPaginator = loader;
    loader();
}

/**
 * Sets up watchlist check + add/remove toggle for a movie or show detail page.
 * @param {object} opts
 * @param {object} opts.page - the page object
 * @param {string} opts.type - 'movies' or 'shows'
 * @param {string} opts.typeName - 'movie' or 'TV show' (for notifications)
 * @param {string} opts.itemKey - 'movie' or 'show' (key in watchlist items)
 * @param {function} opts.getItem - returns the item object or null
 * @param {function} opts.buildPostdata - builds postdata from item
 * @param {object} opts.itemManipulateWatchlist - initial action item ref (mutated)
 */
function setupWatchlistToggle(opts) {
    var page = opts.page;
    var type = opts.type;
    var typeName = opts.typeName;
    var itemKey = opts.itemKey;

    prop.subscribe(page.metadata.ids.trakt, function (event, data) {
        if (event === "set" && data !== null) {
            model.trakt.sync.getWatchlist(type, function (data, pagination, error) {
                if (data) {
                    var inWatchlist = false;
                    for (var i in data) {
                        var item = data[i];
                        if (item[itemKey].ids.trakt === parseInt(page.metadata.ids.trakt.toString())) {
                            inWatchlist = true;
                            log.d(typeName + " is in watchlist!");
                        }
                    }

                    if (!inWatchlist) {
                        log.d(typeName + " is not in watchlist!");
                    }

                    page.metadata.inWatchlist = inWatchlist;
                }
            });
        }
    });

    var itemManipulateWatchlist = opts.itemManipulateWatchlist;

    prop.subscribe(page.metadata.inWatchlist, function (event, data) {
        if (event === "set" && data !== null) {
            if (data) {
                var newItemManipulateWatchlist = page.appendAction('Remove from Watchlist', function (v) {
                    log.d('Removing from watchlist');
                    var currentItem = opts.getItem();
                    if (currentItem) {
                        var postdata = opts.buildPostdata(currentItem);
                        model.trakt.sync.removeFromWatchlist(postdata, function (data, pagination, error) {
                            if (data) {
                                if (data.deleted[type] > 0) {
                                    page.metadata.inWatchlist = false;
                                    popup.notify("Removed successfully " + typeName + " from watchlist", 4);
                                } else if (data.not_found[type] > 0) popup.notify("Trakt couldn't find the " + typeName + "...", 4);
                            } else
                                popup.notify("Failed to remove from watchlist", 3);
                        });
                    } else popup.notify("Operation not yet available", 3);
                });

                newItemManipulateWatchlist.moveBefore(itemManipulateWatchlist);
                itemManipulateWatchlist.destroy();
                itemManipulateWatchlist = newItemManipulateWatchlist;

            } else {
                var newItemManipulateWatchlist = page.appendAction('Add to Watchlist', function (v) {
                    log.d('Adding to watchlist');
                    var currentItem = opts.getItem();
                    if (currentItem) {
                        var postdata = opts.buildPostdata(currentItem);
                        model.trakt.sync.addToWatchlist(postdata, function (data, pagination, error) {
                            if (data) {
                                if (data.added[type] > 0) {
                                    page.metadata.inWatchlist = true;
                                    popup.notify("Added successfully " + typeName + " to watchlist", 4);
                                } else if (data.existing[type] > 0) popup.notify(typeName + " was already in watchlist", 4);
                                else if (data.not_found[type] > 0) popup.notify("Trakt couldn't find the " + typeName + "...", 4);
                            } else
                                popup.notify("Failed to add to watchlist", 3);
                        });
                    } else popup.notify("Operation not yet available", 3);
                });

                newItemManipulateWatchlist.moveBefore(itemManipulateWatchlist);
                itemManipulateWatchlist.destroy();
                itemManipulateWatchlist = newItemManipulateWatchlist;
            }
        }
    });
}

/*******************************************************************************
 * Exported Functions
 ******************************************************************************/

exports.landingPage = function (page) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.metadata.title = "Trakt - Home Page";
    page.metadata.icon = plugin.getLogoPath();
    page.metadata.glwview = Plugin.path + "views/landing_grid.view";
    page.metadata.traktLandingReady = 0;
    page.metadata.traktUserNavigated = 0;
    page.metadata.traktFocusDelay = 0;
    page.loading = true;

    page.entries = 0;

    var isAuthenticated = auth.isAuthenticated();
    var landingPending = 4 + (isAuthenticated ? 7 : 0);

    function landingComplete() {
        if (--landingPending === 0) {
            page.metadata.traktLandingReady = 1;
            if (parseInt(page.metadata.traktUserNavigated.toString(), 10) === 0)
                page.metadata.traktFocusDelay = 1;
        }
    }

    page.appendItem(PREFIX + ":search:", 'search', {
        title: 'Search'
    });

    // separators
    var firstSeparator = null;
    if (isAuthenticated) {
        var separatorMoviesRecommended = page.appendPassiveItem('separator', null, {
            title: 'Movies - Recommended'
        });
        firstSeparator = separatorMoviesRecommended;
    }
    if (isAuthenticated) {
        var separatorUpcomingEpisodes = page.appendPassiveItem('separator', null, {
            title: 'Upcoming Episodes'
        });
        firstSeparator = separatorUpcomingEpisodes;

        var separatorUpcomingMovies = page.appendPassiveItem('separator', null, {
            title: 'Upcoming Movies'
        });

        var separatorMoviesInWatchlist = page.appendPassiveItem('separator', null, {
            title: 'Movies in my Watchlist'
        });

        var separatorTvShowsInWatchlist = page.appendPassiveItem('separator', null, {
            title: 'TV Shows in my Watchlist'
        });

        var separatorRecentlyWatchedMovies = page.appendPassiveItem('separator', null, {
            title: 'Recently Watched Movies'
        });

        var separatorRecentlyWatchedShows = page.appendPassiveItem('separator', null, {
            title: 'Recently Watched Shows'
        });
    }
    var separatorMoviesTrending = page.appendPassiveItem('separator', null, {
        title: 'Movies - Trending'
    });
    if (!firstSeparator) firstSeparator = separatorMoviesTrending;
    var separatorMoviesMostAnticipated = page.appendPassiveItem('separator', null, {
        title: 'Movies - Most Anticipated'
    });
    var separatorShowsTrending = page.appendPassiveItem('separator', null, {
        title: 'TV Shows - Trending'
    });
    var separatorShowsMostAnticipated = page.appendPassiveItem('separator', null, {
        title: 'TV Shows - Most Anticipated'
    });
    var separatorOtherLists = page.appendPassiveItem('separator', null, {
        title: 'Other lists'
    });

    if (isAuthenticated) {
        var authPending = 7;
        var separatorsToDestroy = [];

        function deferDestroy(separator) {
            return function() { separatorsToDestroy.push(separator); };
        }

        function authComplete() {
            if (--authPending === 0) {
                for (var i = 0; i < separatorsToDestroy.length; i++)
                    separatorsToDestroy[i].destroy();
            }
            landingComplete();
        }

        templateList(page, model.trakt.recommendations.movies.bind(null, 1, 20), {
            noPaginator: true,
            moreItemsUri: PREFIX + ":recommendations:movies",
            numberItems: 9,
            itemType: 'movie',
            beforeItem: separatorUpcomingEpisodes,
            destroyIfNoElements: deferDestroy(separatorMoviesRecommended),
            onComplete: authComplete
        });

        var startDate = new Date();
        startDate = startDate.getFullYear() + "-" + utils.formatNumber(startDate.getMonth() + 1, 2) + "-" + utils.formatNumber(startDate.getDate(), 2);
        templateList(page, model.trakt.calendars.myShows.bind(null, startDate, 31), {
            noPaginator: true,
            moreItemsUri: PREFIX + ":calendars:myshows",
            numberItems: 9,
            beforeItem: separatorUpcomingMovies,
            destroyIfNoElements: deferDestroy(separatorUpcomingEpisodes),
            onComplete: authComplete
        });

        templateList(page, model.trakt.calendars.myMovies.bind(null, startDate, 31), {
            noPaginator: true,
            moreItemsUri: PREFIX + ":calendars:mymovies",
            numberItems: 9,
            itemType: 'movie',
            beforeItem: separatorMoviesInWatchlist,
            destroyIfNoElements: deferDestroy(separatorUpcomingMovies),
            onComplete: authComplete
        });

        templateList(page, model.trakt.sync.getWatchlist.bind(null, 'movies'), {
            noPaginator: true,
            moreItemsUri: PREFIX + ":my:watchlist:movies",
            numberItems: 9,
            beforeItem: separatorTvShowsInWatchlist,
            destroyIfNoElements: deferDestroy(separatorMoviesInWatchlist),
            onComplete: authComplete
        });

        templateList(page, model.trakt.sync.getWatchlist.bind(null, 'shows'), {
            noPaginator: true,
            moreItemsUri: PREFIX + ":my:watchlist:shows",
            numberItems: 9,
            beforeItem: separatorRecentlyWatchedMovies,
            destroyIfNoElements: deferDestroy(separatorTvShowsInWatchlist),
            onComplete: authComplete
        });

        templateList(page, model.trakt.sync.getWatched.bind(null, 'movies', 1, 20), {
            noPaginator: true,
            moreItemsUri: PREFIX + ":history:movies",
            numberItems: 9,
            itemType: 'movie',
            beforeItem: separatorRecentlyWatchedShows,
            destroyIfNoElements: deferDestroy(separatorRecentlyWatchedMovies),
            onComplete: authComplete
        });

        templateList(page, model.trakt.sync.getWatched.bind(null, 'shows', 1, 20), {
            noPaginator: true,
            moreItemsUri: PREFIX + ":history:shows",
            numberItems: 9,
            beforeItem: separatorMoviesTrending,
            destroyIfNoElements: deferDestroy(separatorRecentlyWatchedShows),
            onComplete: authComplete
        });
    }

    templateList(page, model.trakt.movies.trending.bind(null, 1, 20), {
        noPaginator: true,
        moreItemsUri: PREFIX + ":movies:trending",
        numberItems: 9,
        beforeItem: separatorMoviesMostAnticipated,
        onComplete: landingComplete
    });

    templateList(page, model.trakt.movies.anticipated.bind(null, 1, 20), {
        noPaginator: true,
        moreItemsUri: PREFIX + ":movies:anticipated",
        numberItems: 9,
        beforeItem: separatorShowsTrending,
        onComplete: landingComplete
    });

    templateList(page, model.trakt.shows.trending.bind(null, 1, 20), {
        noPaginator: true,
        moreItemsUri: PREFIX + ":shows:trending",
        numberItems: 9,
        beforeItem: separatorShowsMostAnticipated,
        onComplete: landingComplete
    });

    templateList(page, model.trakt.shows.anticipated.bind(null, 1, 20), {
        noPaginator: true,
        moreItemsUri: PREFIX + ":shows:anticipated",
        numberItems: 9,
        beforeItem: separatorOtherLists,
        onComplete: landingComplete
    });


    //log.d(page.entries);
    var processedFirstMove = false;
    prop.subscribe(page.model.nodes, function (event, data) {
        if (event === "movechild" && !processedFirstMove) {
            // we only have movechilds when adding actual items
            processedFirstMove = true;

            // Other lists
            page.appendItem(PREFIX + ":movies:popular", 'directory', {
                title: 'Movies - Most Popular'
            });
            page.appendItem(PREFIX + ":movies:played", 'directory', {
                title: 'Movies - Most Played (Week)'
            });
            page.appendItem(PREFIX + ":shows:popular", 'directory', {
                title: 'TV Shows - Most Popular'
            });
            page.appendItem(PREFIX + ":shows:played", 'directory', {
                title: 'TV Shows - Most Played (Week)'
            });
            if (isAuthenticated) {
                page.appendItem(PREFIX + ":recommendations:movies", 'directory', {
                    title: 'Movies - Recommended'
                });
                page.appendItem(PREFIX + ":recommendations:shows", 'directory', {
                    title: 'TV Shows - Recommended'
                });
                page.appendItem(PREFIX + ":my:lists", 'directory', {
                    title: 'My Custom Lists'
                });
            }
        }
    });
};

exports.calendars = {
    mymovies: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.metadata.title = "Upcoming Movies (Next 31 days)";
        page.metadata.icon = plugin.getLogoPath();
        page.loading = true;

        var startDate = new Date();
        startDate = startDate.getFullYear() + "-" + utils.formatNumber(startDate.getMonth() + 1, 2) + "-" + utils.formatNumber(startDate.getDate(), 2);
        templateList(page, model.trakt.calendars.myMovies.bind(null, startDate, 31), {
            itemType: 'movie'
        });
    },

    myshows: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.metadata.title = "Upcoming Episodes (Next 31 days)";
        page.metadata.icon = plugin.getLogoPath();
        page.loading = true;

        var startDate = new Date();
        startDate = startDate.getFullYear() + "-" + utils.formatNumber(startDate.getMonth() + 1, 2) + "-" + utils.formatNumber(startDate.getDate(), 2);
        templateList(page, model.trakt.calendars.myShows.bind(null, startDate, 31), {});
    }
};

exports.episode = function (page, show, season, episode, config) {
    season = parseInt(season);
    episode = parseInt(episode);
    config = config || {};

    page.type = "raw";
    page.metadata.glwview = Plugin.path + "views/episode.view";

    page.loading = 0;

    page.loading++;
    model.trakt.getSeasonEpisodes(show, season, function (data, pagination) {
        data = utils.getChild(data, 'number', episode);
        //log.d(data);

        page.metadata.imdbid = data.ids.imdb;

        page.metadata.title = data.title;
        var screenshotUrl = utils.firstUrl(data, 'screenshot');
        if (screenshotUrl)
            page.metadata.screenshot = screenshotUrl;
        page.metadata.description = data.overview;
        page.metadata.trakt.rating = Math.round(data.rating * 10) + "%";
        if (data.first_aired)
            page.metadata.firstAired = new Date(data.first_aired).toLocaleString();

        if (auth.isAuthenticated()) {
            // watch history
            page.loading++;
            model.trakt.sync.getHistory('episodes', data.ids.trakt, function (data, pagination, error) {
                //log.d(data);

                if (data && data.length > 0) {
                    page.metadata.seen = true;
                    page.metadata.lastSeen = new Date(data[0].watched_at).toLocaleString();
                }

                page.loading--;
            });

            page.appendAction("Check in", function () {
                var postdata = {
                    episode: data
                };
                model.trakt.checkin(postdata, function (response, pagination, error) {
                    if (response) popup.notify("Successfully checked in", 3);
                    else if (error && error.statuscode === 409) popup.notify("Already checked in", 3);
                    else popup.notify("Failed to check in", 3);
                });
            });

            page.appendAction("Mark as seen", function () {
                var postdata = {
                    episodes: [data]
                };
                model.trakt.sync.addToHistory(postdata, function (response, pagination, error) {
                    if (response) {
                        popup.notify("Successfully added to history", 3);
                        page.metadata.lastSeen = new Date().toLocaleString();
                    } else popup.notify("Failed to add to history", 3);
                });
            });
        }

        page.loading--;
    });

    page.loading++;
    model.trakt.getShowInfo(show, function (data, pagination) {
        page.metadata.show.title = data.title;
        if (page.metadata.screenshot.toString() === "null")
            page.metadata.screenshot = utils.toImageSet(data, 'poster');

        page.metadata.background_landscape = utils.toImageSet(data, 'fanart');
        page.metadata.background_portrait = utils.toImageSet(data, 'poster');

        page.loading--;
    });

    page.loading++;
    model.trakt.getEpisodeStats(show, season, episode, function (data, pagination) {
        //log.d(data);

        page.metadata.watchers = data.watchers;
        page.metadata.plays = data.plays;

        page.loading--;
    });

    prop.subscribe(page.metadata.imdbid, function (event, data) {
        if (event === "set" && data !== null) {
            var imdbid = data;
            log.d("IMDB ID: " + imdbid);

            page.loading++;
            model.imdb.getMovieInfo(imdbid, function (data) {
                if (data.Response === "True") {
                    //log.d(data);
                    page.metadata.director = data.Director;
                    page.metadata.rated = data.Rated;
                    page.metadata.runtime = data.Runtime;

                    page.metadata.rt = {};
                    page.metadata.rt.image = data.tomatoImage;
                    page.metadata.rt.criticsMeter = data.tomatoMeter + "%";

                    page.metadata.metacritic = data.Metascore + "%";
                }

                page.loading--;
            });
        }
    }, {
            autoDestroy: true
        });

    prop.subscribe(page.metadata.show.title, function (event, data) {
        if (event === 'set' && data !== null) {
            page.appendItem("search:" + page.metadata.show.title +
                " S" + utils.formatNumber(season, 2) +
                "E" + utils.formatNumber(episode, 2), 'directory', {
                    title: 'Search',
                    icon: Plugin.path + "views/img/search.png"
                });
        }
    });

    if (config.play) {
        page.appendItem(config.play.url, 'video', {
            title: 'Continue',
            icon: Plugin.path + "views/img/play.png"
        });
    }
};

exports.movies = {};

exports.history = {
    movies: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "Recently Watched Movies";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.sync.getWatched.bind(null, 'movies', 1, 20), {
            itemType: 'movie'
        });
    },

    shows: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "Recently Watched Shows";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.sync.getWatched.bind(null, 'shows', 1, 20), {});
    }
};

exports.recommendations = {
    movies: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "Movies - Recommended";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.recommendations.movies.bind(null, 1, 20), {
            itemType: 'movie'
        });
    },

    shows: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "TV Shows - Recommended";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.recommendations.shows.bind(null, 1, 20), {
            itemType: 'show'
        });
    }
};

exports.movies.anticipated = function (page) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.loading = true;
    page.metadata.title = "Movies - Most Anticipated";
    page.metadata.icon = plugin.getLogoPath();

    templateList(page, model.trakt.movies.anticipated.bind(null, 1, 20));
};

exports.movies.played = function (page) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.loading = true;
    page.metadata.title = "Movies - Most Played (Week)";
    page.metadata.icon = plugin.getLogoPath();

    templateList(page, model.trakt.movies.played.bind(null, 1, 20));
};

exports.movies.popular = function (page) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.loading = true;
    page.metadata.title = "Movies - Most Popular";
    page.metadata.icon = plugin.getLogoPath();

    templateList(page, model.trakt.movies.popular.bind(null, 1, 20), {
        itemType: 'movie'
    });
};

exports.movies.trending = function (page) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.loading = true;
    page.metadata.title = "Movies - Trending";
    page.metadata.icon = plugin.getLogoPath();

    templateList(page, model.trakt.movies.trending.bind(null, 1, 20));
};

exports.movie = function (page, id, config) {
    config = config || {};

    page.type = "raw";
    page.metadata.glwview = Plugin.path + "views/movie.view";

    page.loading = 0;

    var movie = null;

    page.loading++;
    model.trakt.getMovieInfo(id, function (data, pagination) {
        //log.d(data);
        movie = data;

        page.metadata.imdbid = data.ids.imdb;
        page.metadata.ids.trakt = data.ids.trakt;
        page.metadata.title = data.title;
        page.metadata.poster = utils.toImageSet(data, 'poster');
        page.metadata.logo = utils.toImageSet(data, 'logo', false);
        page.metadata.year = data.year;
        page.metadata.tagline = data.tagline;
        page.metadata.description = data.overview;
        if (data.runtime)
            page.metadata.runtime = data.runtime + " minutes";
        page.metadata.trakt.rating = Math.round(data.rating * 10) + "%";
        page.metadata.certification = data.certification;


        page.metadata.background_landscape = utils.toImageSet(data, 'fanart');
        page.metadata.background_portrait = utils.toImageSet(data, 'poster');

        if (auth.isAuthenticated()) {
            page.appendAction("Check in", function () {
                var postdata = {
                    movie: data
                };
                model.trakt.checkin(postdata, function (response, pagination, error) {
                    if (response) popup.notify("Successfully checked in", 3);
                    else if (error && error.statuscode === 409) popup.notify("Already checked in", 3);
                    else popup.notify("Failed to check in", 3);
                });
            }).moveBefore(itemSimilar);

            page.appendAction("Mark as seen", function () {
                var postdata = {
                    movies: [data]
                };
                model.trakt.sync.addToHistory(postdata, function (response, pagination, error) {
                    if (response) {
                        popup.notify("Successfully added to history", 3);
                        page.metadata.lastSeen = new Date().toLocaleString();
                    } else popup.notify("Failed to add to history", 3);
                });
            }).moveBefore(itemSimilar);
        }

        if (data.trailer) {
            data.trailer = data.trailer.replace("youtube.com", "www.youtube.com");
            var itemTrailer = page.appendItem(data.trailer, 'video', {
                title: 'Trailer',
                icon: Plugin.path + "views/img/play.png"
            });
        }

        page.appendItem("search:" + page.metadata.title, 'directory', {
            title: 'Search',
            icon: Plugin.path + "views/img/search.png"
        });

        page.loading--;
    });

    if (auth.isAuthenticated()) {
        // watch history
        page.loading++;
        model.trakt.sync.getHistory('movies', id, function (data, pagination, error) {
            //log.d(data);

            if (data && data.length > 0) {
                page.metadata.seen = true;
                page.metadata.lastSeen = new Date(data[0].watched_at).toLocaleString();
            }

            page.loading--;
        });
    }

    prop.subscribe(page.metadata.imdbid, function (event, data) {
        if (event === "set" && data !== null) {
            var imdbid = data;
            log.d("IMDB ID: " + imdbid);

            page.loading++;
            model.imdb.getMovieInfo(imdbid, function (data) {
                if (data.Response === "True") {
                    //log.d(data);
                    page.metadata.director = data.Director;
                    page.metadata.genre = data.Genre;
                    page.metadata.released = data.Released;

                    page.metadata.rt = {};
                    page.metadata.rt.image = data.tomatoImage;
                    page.metadata.rt.criticsMeter = data.tomatoMeter + "%";

                    page.metadata.metacritic = data.Metascore + "%";
                }

                page.loading--;
            });
        }
    }, {
            autoDestroy: true
        });

    /*page.loading++;
    model.trakt.movies.stats(id, function(data, pagination) {
        //log.d(data);

        page.metadata.plays = data.plays;

        page.loading--;
    });*/

    if (config.play) {
        page.appendItem(config.play.url, 'video', {
            title: 'Continue',
            icon: Plugin.path + "views/img/play.png"
        });
    }

    if (auth.isAuthenticated()) {
        var itemManipulateWatchlist = page.appendAction('Manipulate watchlist (not available)', function (v) {
            popup.notify("Operation not available right now", 3);
        });

        setupWatchlistToggle({
            page: page,
            type: 'movies',
            typeName: 'movie',
            itemKey: 'movie',
            getItem: function() { return movie; },
            buildPostdata: function(m) {
                return { movies: [{ ids: { trakt: m.ids.trakt } }] };
            },
            itemManipulateWatchlist: itemManipulateWatchlist
        });
    }

    var itemSimilar = page.appendItem(PREFIX + ":movie:" + id + ":similar", 'directory', {
        title: 'Similar',
        icon: Plugin.path + "views/img/movie.png"
    });
};

exports.movie.similar = function (page, id) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.metadata.title = "Trakt - Similar Movies";
    page.metadata.icon = plugin.getLogoPath();
    page.loading = true;

    templateList(page, model.trakt.movies.related.bind(null, id, 1, 20), {
        itemType: 'movie'
    });
};

exports.my = {
    watchlist: function (page, type) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "My Watchlist";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.sync.getWatchlist.bind(null, type));
    },

    lists: function (page) {
        page.type = 'directory';
        page.loading = true;
        page.metadata.title = "My Custom Lists";
        page.metadata.icon = plugin.getLogoPath();

        model.trakt.users.lists(function(data) {
            if (data && data.length) {
                for (var i = 0; i < data.length; i++) {
                    var list = data[i];
                    page.appendItem(PREFIX + ":my:list:" + list.ids.slug, 'directory', {
                        title: list.name,
                        subtitle: list.description || (list.item_count + ' items')
                    });
                }
            }
            page.loading = false;
        });
    },

    list: function (page, listId) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "Custom List";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.users.listItems.bind(null, listId, 1, 20), {});
    }
};

exports.open = {
    list: function (page, config) {
        page.type = 'directory';
        page.metadata.title = "Choose the Movie/Episode that matches the selected item";
        page.loading = false;

        var title = config.title;

        lookup.getItems(page, config, function (items) {
            if (items.length === 0) {
                page.appendPassiveItem("default", null, {
                    title: "There are no potential matches"
                });
                return;
            }

            if (items[0].score === 100) {
                if (items[0].type === 'movie')
                    page.redirect(PREFIX + ":movie:" + items[0].movie.ids.trakt + ":config:" + escape(JSON.stringify(config)));
                else if (items[0].type === 'show')
                    page.redirect(PREFIX + ":show:" + items[0].show.ids.trakt + ":config:" + escape(JSON.stringify(config)));
                else if (items[0].type === 'episode')
                    page.redirect(PREFIX + ":show:" + items[0].show.ids.trakt +
                        ":season:" + items[0].episode.season + ":episode:" + items[0].episode.number +
                        ":config:" + escape(JSON.stringify(config)));

                return;
            }

            for (var i in items) {
                var item = items[i];
                if (item.type === 'movie')
                    page.appendItem(PREFIX + ":movie:" + item.movie.ids.trakt + ":config:" + escape(JSON.stringify(config)),
                        'video', {
                            title: '[MOVIE] ' + item.movie.title /* + " (score: " + item.score + ")"*/,
                            icon: utils.toImageSet(item.movie, 'poster')
                        });
                else if (item.type === 'show')
                    page.appendItem(PREFIX + ":show:" + item.show.ids.trakt + ":config:" + escape(JSON.stringify(config)),
                        'video', {
                            title: '[TV SHOW] ' + item.show.title /* + " (score: " + item.score + ")"*/,
                            icon: utils.toImageSet(item.show, 'poster')
                        });
                else if (item.type === 'episode')
                    page.appendItem(PREFIX + ":show:" + item.show.ids.trakt +
                        ":season:" + item.episode.season + ":episode:" + item.episode.number +
                        ":config:" + escape(JSON.stringify(config)),
                        'video', {
                            title: '[TV SHOW - EPISODE] ' + item.show.title +
                            " (Season #" + item.episode.season + ", Episode #" + item.episode.number + ")"
                            /* + " (score: " + item.score + ")"*/
                            ,
                            icon: utils.toImageSet(item.show, 'poster')
                        });
            }
        });
    }
};

exports.season = function (page, show, number, config) {
    config = config || {};

    page.type = "raw";
    page.metadata.glwview = Plugin.path + "views/season.view";

    var seasonName = number ? "Season #" + number : "Specials";

    page.loading = 0;

    var showItem = null;

    page.loading++;
    model.trakt.getShowInfo(show, function (data, pagination) {
        //log.d(data);

        showItem = data;

        page.metadata.title = data.title + " - " + seasonName;
        page.metadata.description = data.overview;
        page.metadata.certification = data.certification;
        page.metadata.network = data.network;
        page.metadata.runtime = data.runtime + " minutes";
        page.metadata.poster = utils.toImageSet(data, 'poster');

        page.metadata.background_landscape = utils.toImageSet(data, 'fanart', false);
        page.metadata.background_portrait = utils.toImageSet(data, 'poster', true);

        /*page.appendAction('navopen', "search:" + page.metadata.title, false, {
          title: 'Search',
          icon: Plugin.path + "views/img/search.png"
        });*/

        page.loading--;
    });

    var episodeMapping = {};
    prop.subscribe(page.metadata.poster, function (event, data) {
        if (event === "set" && data !== null) {
            page.loading++;
            model.trakt.getSeasonsInfo(show, function (data, pagination) {
                data = utils.getChild(data, 'number', number);

                var tmpImageset = utils.toImageSet(data, 'thumb', false);
                if (tmpImageset) {
                    page.metadata.background_landscape = tmpImageset;
                }

                if (data && data.images && data.images.poster)
                    page.metadata.poster = utils.toImageSet(data, 'poster');
                page.metadata.trakt.rating = Math.round(data.rating * 10) + "%";
                if (data.first_aired)
                    page.metadata.firstAired = new Date(data.first_aired).toLocaleString();
                page.metadata.tagline = data.tagline;
                page.metadata.description = data.overview;
                page.metadata.certification = data.certification;
                page.metadata.network = data.network;

                page.loading--;
            });

            page.loading++;
            model.trakt.getSeasonEpisodes(show, number, function (data, pagination) {
                var episodes = [];
                for (var i in data) {
                    var item = data[i];
                    episodes.push({
                        episode: item.number,
                        title: "Episode #" + item.number,
                        subtitle: item.title,
                        screenshot: utils.toImageSet(item, 'screenshot', false) || utils.toImageSet(showItem, 'fanart', true),
                        url: PREFIX + ":show:" + show + ":season:" + number + ":episode:" + item.number
                    });

                    episodeMapping[item.number] = parseInt(i);
                }

                page.metadata.episodes = episodes;
                page.metadata.episodesReady = true;

                page.loading--;
            });
        }
    });

    if (auth.isAuthenticated()) {
        prop.subscribe(page.metadata.episodesReady, function (event, data) {
            if (event === "set" && data !== null) {
                page.loading++;
                model.trakt.shows.watchedProgress(show, function (data, pagination) {
                    data = utils.getChild(data.seasons, 'number', number);
                    if (data) {
                        data = data.episodes;

                        var watched = {};
                        for (var i = 0; i < data.length; i++) {
                            var item = data[i];
                            if (item.completed) {
                                var index = episodeMapping[item.number];
                                page.metadata.episodes[index].watched = true;
                            }
                        }
                    }

                    page.loading--;
                });
            }
        });
    }

    prop.subscribe(page.metadata.imdbid, function (event, data) {
        if (event === "set" && data !== null) {
            var imdbid = data;
            log.d("IMDB ID: " + imdbid);

            page.loading++;
            model.imdb.getMovieInfo(imdbid, function (data) {
                if (data.Response === "True") {
                    //log.d(data);
                    page.metadata.director = data.Director;
                    page.metadata.genre = data.Genre;
                    page.metadata.released = data.Released;
                    page.metadata.awards = data.Awards;

                    page.metadata.rt = {};
                    page.metadata.rt.image = data.tomatoImage;
                    page.metadata.rt.criticsMeter = data.tomatoMeter;

                    page.metadata.metacritic = data.Metascore;
                }

                page.loading--;
            });
        }
    }, {
            autoDestroy: true
        });

    /*if (config.play) {
      page.appendAction('navopen', config.play.url, false, {
        title: 'Continue',
        icon: Plugin.path + "views/img/play.png"
      });
    }*/
};

exports.scrobble = {
    list: function (page, config) {
        page.type = 'directory';
        page.metadata.title = "Choose the Movie/Episode that matches what you want to watch";
        page.loading = false;

        config.excludeTypes = ['show'];
        lookup.getItems(page, config, function (items) {
            if (items.length === 0) {
                page.appendPassiveItem("default", null, {
                    title: "There are no potential matches, scrobbling for this video is not possible"
                });
                return;
            }

            if (items[0].score === 100) {
                if (items[0].type === 'movie')
                    page.redirect(PREFIX + ":scrobble:play:movie:" + escape(config.play.url) + ":" + items[0].movie.ids.trakt);
                else if (items[0].type === 'episode')
                    page.redirect(PREFIX + ":scrobble:play:episode:" + escape(config.play.url) + ":" +
                        items[0].show.ids.trakt + ":" + items[0].episode.season + ":" + items[0].episode.number);

                return;
            }

            for (var i in items) {
                var item = items[i];
                if (item.type === 'movie') {
                    page.appendItem(PREFIX + ":scrobble:play:movie:" + escape(config.play.url) + ":" + item.movie.ids.trakt, 'video', {
                        title: '[MOVIE] ' + item.movie.title /* + " (score: " + item.score + ")"*/,
                        icon: utils.toImageSet(item.movie, 'poster')
                    });
                } else if (item.type === 'episode')
                    page.appendItem(PREFIX + ":scrobble:play:episode:" + escape(config.play.url) + ":" +
                        item.show.ids.trakt + ":" + item.episode.season + ":" + item.episode.number,
                        'video', {
                            title: '[TV SHOW - EPISODE] ' + item.show.title +
                            " (Season #" + item.episode.season + ", Episode #" + item.episode.number + ")"
                            /* + " (score: " + item.score + ")"*/
                            ,
                            icon: utils.toImageSet(item.show, 'poster')
                        });
            }
        });
    }
};

exports.search = function (page, query) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.metadata.title = "Trakt - Search";
    page.metadata.icon = plugin.getLogoPath();
    page.loading = true;

    templateList(page, model.trakt.search.textQuery.bind(null, query, null, null, 1, 20));
};

exports.show = function (page, id, config) {
    config = config || {};

    page.type = "raw";
    page.metadata.glwview = Plugin.path + "views/show.view";

    page.metadata.ids.trakt = {};

    var show = null;

    if (config.play) {
        page.appendItem(config.play.url, 'video', {
            title: 'Continue',
            icon: Plugin.path + "views/img/play.png"
        });
    }

    if (auth.isAuthenticated()) {
        var itemManipulateWatchlist = page.appendAction('Manipulate watchlist (not available)', function (v) {
            popup.notify("Operation not available right now", 3);
        });
    }

    page.appendItem(PREFIX + ":show:" + id + ":similar", 'directory', {
        title: 'Similar',
        icon: Plugin.path + "views/img/tv.png"
    });

    page.loading++;
    model.trakt.getShowInfo(id, function (data, pagination) {
        //log.d(data);

        show = data;

        page.metadata.ids.trakt = data.ids.trakt;
        page.metadata.imdbid = data.ids.imdb;

        page.metadata.title = data.title;
        page.metadata.logo = utils.toImageSet(data, 'logo', false);
        page.metadata.icon = page.metadata.logo;
        page.metadata.poster = utils.toImageSet(data, 'poster');
        page.metadata.year = data.year;
        page.metadata.tagline = data.tagline;
        page.metadata.description = data.overview;
        page.metadata.runtime = data.runtime + " minutes";
        page.metadata.trakt.rating = Math.round(data.rating * 10) + "%";
        page.metadata.certification = data.certification;
        page.metadata.network = data.network;
        page.metadata.airedEpisodes = data.aired_episodes;
        page.metadata.status = utils.prettyStatus(data.status);

        page.metadata.background_landscape = utils.toImageSet(data, 'fanart', true);
        page.metadata.background_portrait = utils.toImageSet(data, 'poster', true);

        if (data.trailer) {
            data.trailer = data.trailer.replace("youtube.com", "www.youtube.com");
            var itemTrailer = page.appendItem(data.trailer, 'video', {
                title: 'Trailer',
                icon: Plugin.path + "views/img/play.png"
            });
        }

        page.appendItem("search:" + page.metadata.title, 'directory', {
            title: 'Search',
            icon: Plugin.path + "views/img/search.png"
        });

        page.loading--;
    });

    if (auth.isAuthenticated()) {
        page.loading++;
        model.trakt.shows.watchedProgress(id, function (data, pagination, error) {
            //log.d(data);

            if (data && data.next_episode) {
                var nextEpisode = data.next_episode;
                page.metadata.nextEpisode = {
                    title: 'Next to Watch: Season #' + nextEpisode.season + ', Episode #' + nextEpisode.number,
                    subtitle: nextEpisode.title,
                    screenshot: utils.toImageSet(nextEpisode, 'screenshot'),
                    url: PREFIX + ":show:" + id + ":season:" + nextEpisode.season + ":episode:" + nextEpisode.number
                };
            }

            page.loading--;
        });
    }

    if (auth.isAuthenticated()) {
        setupWatchlistToggle({
            page: page,
            type: 'shows',
            typeName: 'TV show',
            itemKey: 'show',
            getItem: function() { return show; },
            buildPostdata: function(s) {
                return {
                    shows: [{
                        title: s.title,
                        year: s.year,
                        ids: {
                            trakt: s.ids.trakt,
                            slug: s.ids.slug,
                            tvdb: s.ids.tvdb,
                            imdb: s.ids.imdb,
                            tmdb: s.ids.tmdb,
                            tvrage: s.ids.tvrage
                        }
                    }]
                };
            },
            itemManipulateWatchlist: itemManipulateWatchlist
        });
    }

    prop.subscribe(page.metadata.poster, function (event, data) {
        if (event === "set" && data !== null) {
            page.loading++;
            model.trakt.getSeasonsInfo(id, function (data, pagination) {
                utils.sortByField(data, 'number', false);
                //log.d(data);

                var seasons = [];
                for (var i in data) {
                    var item = data[i];

                    var image = utils.toImageSet(item, 'thumb', false);
                    if (!image) image = utils.toImageSet(item, 'fanart', false);
                    if (!image) image = utils.toImageSet(item, 'poster', false);
                    if (!image) image = page.metadata.poster;

                    var metadata = {
                        title: item.number ? "Season #" + item.number : "Specials",
                        subtitle: item.episode_count + " episodes",
                        url: PREFIX + ":show:" + id + ":season:" + item.number,
                        poster: image
                    };
                    seasons.push(metadata);
                }

                page.metadata.seasons = seasons;

                page.loading--;
            });
        }
    });

    prop.subscribe(page.metadata.imdbid, function (event, data) {
        if (event === "set" && data !== null) {
            var imdbid = data;
            log.d("IMDB ID: " + imdbid);

            page.loading++;
            model.imdb.getMovieInfo(imdbid, function (data) {
                if (data.Response === "True") {
                    //log.d(data);
                    page.metadata.director = data.Director;
                    page.metadata.genre = data.Genre;
                    page.metadata.released = data.Released;
                    page.metadata.awards = data.Awards;

                                page.metadata.numberAwardsWins = 0;
                                page.metadata.numberAwardsNominations = 0;
                                if (data.Awards) {
                                    // check for golden globes
                                    var match = data.Awards.match(/Won (\d+) Golden Globes?/);
                                    if (match) {
                                        page.metadata.numberAwardsWins += parseInt(match[1]);
                                    }

                                    match = data.Awards.match(/(\d+) wins?/);
                                    if (match) {
                                        page.metadata.numberAwardsWins += parseInt(match[1]);
                                    }

                                    match = data.Awards.match(/(\d+) nominations?/);
                                    if (match) {
                                        page.metadata.numberAwardsNominations += parseInt(match[1]);
                        }
                    }

                    page.metadata.rt = {};
                    page.metadata.rt.image = data.tomatoImage;
                    page.metadata.rt.criticsMeter = data.tomatoMeter + "%";

                    page.metadata.metacritic = data.Metascore + "%";
                }

                page.loading--;
            });
        }
    }, {
            autoDestroy: true
        });
};

exports.show.similar = function (page, id) {
    page.type = 'directory';
    page.model.contents = 'grid';
    page.metadata.title = "Trakt - Similar TV Shows";
    page.metadata.icon = plugin.getLogoPath();
    page.loading = true;

    templateList(page, model.trakt.shows.related.bind(null, id, 1, 20), {
        itemType: 'show'
    });
};

exports.shows = {
    anticipated: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "TV Shows - Most Anticipated";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.shows.anticipated.bind(null, 1, 20));
    },

    played: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "TV Shows - Most Played (Week)";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.shows.played.bind(null, 1, 20));
    },

    popular: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "TV Shows - Most Popular";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.shows.popular.bind(null, 1, 20), {
            itemType: 'show'
        });
    },

    trending: function (page) {
        page.type = 'directory';
        page.model.contents = 'grid';
        page.loading = true;
        page.metadata.title = "TV Shows - Trending";
        page.metadata.icon = plugin.getLogoPath();

        templateList(page, model.trakt.shows.trending.bind(null, 1, 20));
    }
};
