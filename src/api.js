var StackTraceable = require('./stacktraceable');
var io = require('native/io');

exports.API_BASE_URL = "https://api.trakt.tv";

// please use your own API KEY
exports.CLIENT_ID = "c752231dbc78daf7c76d0b3fb2b7a18403e0a2c9b968bcbee5f79a0268ac5ea0";
exports.CLIENT_SECRET = "437e14f28915d4afd752c0a9b3b9f8d690c1c8bdc91893f79c7ee50bb8bff48b";

// Transparent auth interceptor — adds Authorization header and handles 401
io.httpInspectorCreate('https://api.trakt.tv/.*', function(ctrl) {
    // Skip OAuth endpoints to avoid auth loops
    if (ctrl.url.indexOf('/oauth/') !== -1) {
        ctrl.ignore();
        return;
    }

    if (!ctrl.authFailed) {
        if (credentials.apiauth)
            ctrl.setHeader('Authorization', credentials.apiauth);
        ctrl.proceed();
        return;
    }

    // 401 received — clear current token and try to recover
    credentials.apiauth = null;

    if (credentials.refresh_token) {
        auth.refreshToken();
        if (credentials.apiauth) {
            ctrl.setHeader('Authorization', credentials.apiauth);
            ctrl.proceed();
            return;
        }
    }

    // Refresh failed or no refresh token — device-code login
    auth.login(function(success) {
        if (success && credentials.apiauth)
            ctrl.setHeader('Authorization', credentials.apiauth);
        ctrl.proceed();
    });
}, true);

var Api = function() {
    return {
        call: function(uri, opts, callback) {
            if (service.debug) {
                log.d("API Call:");
                log.d("Arguments:");
                log.d(arguments);
                this.trace();
            }

            try {
                if (uri === null) throw new Error("API's URI can't be null");

                var url = api.API_BASE_URL + uri;

                opts.args = opts.args || {};
                for (var key in opts.args) {
                    if (!opts.args[key] || opts.args[key] === 'null')
                        delete opts.args[key];
                }

                if (service.debug)
                    log.d(opts.args);

                opts.headers = opts.headers || {};
                opts.headers['Content-Type'] = "application/json";
                opts.headers['trakt-api-key'] = api.CLIENT_ID;
                opts.headers['trakt-api-version'] = 2;

                opts.noFail = true; // Don't throw on HTTP errors (400- status code)
                opts.compression = true; // Will send 'Accept-Encoding: gzip' in request
                opts.caching = true; // Enables Movian's built-in HTTP cache
                opts.debug = service.debug;

                http.request(url, opts, function(err, result) {
                    if (result) {
                        var fullUrl = api.API_BASE_URL + uri;
                        if (opts.args) {
                            fullUrl += "?";
                            var firstArg = true;
                            for (var key in opts.args) {
                                if (!firstArg) fullUrl += "&";
                                fullUrl += key + "=" + escape(opts.args[key]);
                                firstArg = false;
                            }
                        }
                        log.d(fullUrl);

                        log.d("HTTP status code: " + result.statuscode);

                        if (400 <= result.statuscode && result.statuscode < 600) {
                            var error = {
                                statuscode: result.statuscode
                            };
                            callback(null, null, error);
                        } else {
                            if (err) {
                                log.e("HTTP Error:");
                                log.e(err);
                                callback(null, null, err);
                            } else {
                                try {
                                    var pagination = null;

                                    if (result.headers['x-pagination-item-count']) {
                                        pagination = {
                                            currentPage: parseInt(result.headers['x-pagination-page']),
                                            itemCount: parseInt(result.headers['x-pagination-item-count']),
                                            pageCount: parseInt(result.headers['x-pagination-page-count'])
                                        };

                                        if (pagination.currentPage < pagination.pageCount) {
                                            pagination.hasNext = true;
                                            var newOpts = opts;
                                            newOpts.args.page++;
                                            pagination.loadNextPage = Api.call.bind(api, uri, newOpts, callback);
                                        }
                                    }

                                    var json = JSON.parse(result);
                                    callback(json, pagination);
                                } catch (e) {
                                    log.e("HTTP Exception:");
                                    log.e("API call arguments:");
                                    log.e(this.call.arguments);
                                    log.e(e);

                                    try {
                                        callback(null, null, e);
                                    } catch (e) {
                                        log.e("Exception when calling error callback:");
                                        log.e(e);
                                    }
                                }
                            }
                        }
                    }
                }.bind({
                    api: this,
                    call: {
                        arguments: arguments
                    }
                }));
            } catch (e) {
                log.e("API call failed:");
                log.e(arguments);
                log.e(e);
            }
        }
    };
}();
Api.__proto__ = StackTraceable.prototype;

/*******************************************************************************
 * Exported Functions
 ******************************************************************************/

exports.calendars = {
    myMovies: function(startDate, numberDays, callback) {
        Api.call("/calendars/my/movies/" + startDate + "/" + numberDays, {
            method: 'GET',
            args: {
                extended: 'images'
            }
        }, callback);
    },

    myShows: function(startDate, numberDays, callback) {
        Api.call("/calendars/my/shows/" + startDate + "/" + numberDays, {
            method: 'GET',
            args: {
                extended: 'images'
            }
        }, callback);
    }
};

exports.checkin = function(item, callback) {
    var postdata = item;
    postdata.app_version = plugin.getDescriptor().version;
    Api.call("/checkin", {
        method: 'POST',
        postdata: JSON.stringify(postdata)
    }, callback);
};

exports.episodes = {};
exports.episodes.stats = function(show, season, episode, callback) {
    Api.call("/shows/" + show + "/seasons/" + season + "/episodes/" + episode +
        "/stats", {
            method: 'GET',
            args: {
                extended: 'full'
            },
            compression: true,
            caching: true
        }, callback);
};

exports.movies = {};
exports.movies.anticipated = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/movies/anticipated", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.movies.played = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/movies/played", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.movies.popular = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/movies/popular", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.movies.related = function(id, pageNum, numberItemsPerPage, callback) {
    Api.call("/movies/" + id + "/related", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.movies.stats = function(id, callback) {
    Api.call("/movies/" + id + "/stats", {
        method: 'GET',
        args: {}
    }, callback);
};

exports.movies.summary = function(id, callback) {
    Api.call("/movies/" + id, {
        method: 'GET',
        args: {
            extended: 'full,images'
        }
    }, callback);
};

exports.movies.trending = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/movies/trending", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.recommendations = {
    movies: function(pageNum, numberItemsPerPage, callback) {
        Api.call("/recommendations/movies", {
            method: 'GET',
            args: {
                page: pageNum,
                limit: numberItemsPerPage,
                extended: 'full,images'
            }
        }, callback);
    },

    shows: function(pageNum, numberItemsPerPage, callback) {
        Api.call("/recommendations/shows", {
            method: 'GET',
            args: {
                page: pageNum,
                limit: numberItemsPerPage,
                extended: 'full,images'
            }
        }, callback);
    }
};

exports.search = {};
exports.search.idLookup = function(type, id, pageNum, numberItemsPerPage, callback) {
    Api.call("/search", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            id_type: type,
            id: id
        }
    }, callback);
};

exports.search.textQuery = function(query, type, year, pageNum, numberItemsPerPage, callback) {
    if (!type) type = 'movie,show';

    Api.call("/search", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            query: query,
            type: type,
            year: year
        }
    }, callback);
};

exports.seasons = {};

exports.seasons.season = function(show, number, callback) {
    Api.call("/shows/" + show + "/seasons/" + number, {
        method: 'GET',
        args: {
            extended: 'full,images'
        },
        compression: true,
        caching: true
    }, callback);
};

exports.seasons.summary = function(id, callback) {
    Api.call("/shows/" + id + "/seasons", {
        method: 'GET',
        args: {
            extended: 'full,images'
        },
        compression: true,
        caching: true
    }, callback);
};

exports.shows = {};
exports.shows.summary = function(id, callback) {
    Api.call("/shows/" + id, {
        method: 'GET',
        args: {
            extended: 'full,images'
        }
    }, callback);
};

exports.shows.anticipated = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/shows/anticipated", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.shows.played = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/shows/played", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.shows.popular = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/shows/popular", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.shows.related = function(id, pageNum, numberItemsPerPage, callback) {
    Api.call("/shows/" + id + "/related", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.shows.trending = function(pageNum, numberItemsPerPage, callback) {
    Api.call("/shows/trending", {
        method: 'GET',
        args: {
            page: pageNum,
            limit: numberItemsPerPage,
            extended: 'full,images'
        }
    }, callback);
};

exports.shows.watchedProgress = function(show, callback) {
    Api.call("/shows/" + show + "/progress/watched", {
        method: 'GET',
        args: {
            extended: 'full,images'
        }
    }, callback);
};

exports.scrobble = {};
exports.scrobble.start = function(item, progress, callback) {
    var postdata = item;
    postdata.progress = progress;
    postdata.app_version = plugin.getDescriptor().version;
    Api.call("/scrobble/start", {
        method: 'POST',
        postdata: JSON.stringify(postdata)
    }, callback);
};

exports.scrobble.pause = function(item, progress, callback) {
    var postdata = item;
    postdata.progress = progress;
    postdata.app_version = plugin.getDescriptor().version;
    Api.call("/scrobble/pause", {
        method: 'POST',
        postdata: JSON.stringify(postdata)
    }, callback);
};

exports.scrobble.stop = function(item, progress, callback) {
    var postdata = item;
    postdata.progress = progress;
    postdata.app_version = plugin.getDescriptor().version;
    Api.call("/scrobble/stop", {
        method: 'POST',
        postdata: JSON.stringify(postdata)
    }, callback);
};

exports.sync = {
    addToHistory: function(postdata, callback) {
        Api.call("/sync/history", {
            method: 'POST',
            postdata: JSON.stringify(postdata)
        }, callback);
    },

    addToWatchlist: function(postdata, callback) {
        Api.call("/sync/watchlist", {
            method: 'POST',
            postdata: JSON.stringify(postdata)
        }, callback);
    },

    getHistory: function(type, id, callback) {
        var url = "/sync/history/" + type;
        if (id) url += "/" + id;
        Api.call(url, {
            method: 'GET',
            args: {}
        }, callback);
    },

    getWatchlist: function(type, callback) {
        Api.call("/sync/watchlist/" + type, {
            method: 'GET',
            args: {
                extended: 'images'
            }
        }, callback);
    },

    removeFromWatchlist: function(postdata, callback) {
        Api.call("/sync/watchlist/remove", {
            method: 'POST',
            postdata: JSON.stringify(postdata)
        }, callback);
    }
};
