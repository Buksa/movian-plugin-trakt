var imageDimensions = {
    banner: {
        full: {
            // 1000x185 (movie/show), 758x140 (show)
            width: 1000,
            height: 185
        }
    },

    fanart: {
        full: {
            width: 1920,
            height: 1080
        },
        medium: {
            width: 1280,
            height: 720
        },

        thumb: {
            width: 853,
            height: 480
        }
    },

    logo: {
        full: {
            width: 800,
            height: 310
        }
    },

    poster: {
        full: {
            width: 1000,
            height: 1500
        },
        medium: {
            width: 600,
            height: 900
        },

        thumb: {
            width: 300,
            height: 450
        }
    },

    screenshot: {
        full: {
            // 1920x1080, 1280x720, 400x225 (typical)
            width: 1920,
            height: 1080
        },
        medium: {
            width: 1280,
            height: 720
        },

        thumb: {
            width: 853,
            height: 480
        }
    },

    thumb: {
        full: {
            // 1000x562 (movie), 500x281 (show)
            width: 1000,
            height: 562
        }
    }
};

/*******************************************************************************
 * Exported Functions
 ******************************************************************************/

// Trakt's image API has changed shape over time. The current API returns
// arrays of CDN URLs (without protocol), e.g.
//   images.poster = ["media.trakt.tv/.../poster.jpg.webp", ...]
// Older versions returned an object keyed by size, and at one point images
// were dropped entirely. These helpers tolerate all three shapes so the
// plugin never crashes while reading image fields.
function safeImages(obj) {
    return (obj && obj.images) || {};
}

exports.firstUrl = function (obj, type) {
    var v = safeImages(obj)[type];
    if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
            if (v[i]) return ensureProtocol(v[i]);
        }
        return null;
    }
    if (v && typeof v === 'object') {
        return v.medium || v.full || v.thumb || null;
    }
    return null;
};

function ensureProtocol(url) {
    if (typeof url !== 'string') return url;
    if (url.indexOf('://') !== -1) return url;
    if (url.indexOf('//') === 0) return 'https:' + url;
    return 'https://' + url;
}

exports.formatNumber = function (num, numDigits) {
    var output = num + '';
    while (output.length < numDigits) {
        output = '0' + output;
    }
    return output;
};

exports.sortByField = function (arr, field, asc) {
    function compare(a, b) {
        if (a[field] !== b[field])
            return (a[field] < b[field] ? -1 : 1) * (asc ? 1 : -1);
        return 0;
    }

    arr.sort(compare);
};

exports.getChild = function (arr, field, value) {
    for (var i in arr) {
        var item = arr[i];
        if (item[field] === value)
            return item;
    }

    return null;
};

exports.prettyStatus = function (status) {
    return status.capitalize(status);
};

exports.toImageSet = function (obj, type, useDefault) {
    if (useDefault === null || useDefault === undefined) useDefault = true;
    var items = safeImages(obj)[type];
    if (!items) items = {};

    var images = [];
    var dimensionsForType = imageDimensions[type] || {};
    var fullDims = dimensionsForType.full ||
        { width: 0, height: 0 };

    if (Array.isArray(items)) {
        // Current API: array of URLs (no protocol).
        for (var i = 0; i < items.length; i++) {
            if (items[i]) {
                images.push({
                    width: fullDims.width,
                    height: fullDims.height,
                    url: ensureProtocol(items[i])
                });
            }
        }
    } else {
        // Legacy API: object keyed by size.
        for (var size in items) {
            var dimensions = dimensionsForType[size];
            if (!dimensions) continue;
            if (items[size]) {
                images.push({
                    width: dimensions.width,
                    height: dimensions.height,
                    url: items[size]
                });
            }
        }
    }

    if (images.length === 0) {
        if (useDefault) {
            images = [{
                width: imageDimensions[type].full.width,
                height: imageDimensions[type].full.height,
                url: Plugin.path + "views/img/" + type + "_default.png"
            }];
        } else return null;
    }
    return "imageset:" + JSON.stringify(images);
};

exports.appendImageSet = function (imageset1, imageset2) {
    var arr1 = JSON.parse(imageset1.substr(9));
    var arr2 = JSON.parse(imageset2.substr(9));
    for (var i in arr2)
        arr1.push(arr2[i]);
    return "imageset:" + JSON.stringify(arr1);
}

String.prototype.capitalize = function (lower) {
    return (lower ? this.toLowerCase() : this).replace(/(?:^|\s)\S/g, function (a) {
        return a.toUpperCase();
    });
};
