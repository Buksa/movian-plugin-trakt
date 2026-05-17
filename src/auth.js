exports.isAuthenticated = function() {
    return credentials.apiauth !== undefined;
};

exports.getAuthorizationHeader = function() {
    return credentials.apiauth;
};

exports.login = function() {
    var response = JSON.parse(http.request(api.API_BASE_URL + "/oauth/device/code", {
        headers: {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': api.CLIENT_ID
        },
        postdata: JSON.stringify({
            client_id: api.CLIENT_ID
        })
    }));

    var deviceCode = response.device_code;

    // Create a popup
    // We do this manually using properties because we want to wait for event asyncronously
    var message = prop.createRoot();
    message.type = 'message';
    prop.setRichStr(message, 'message',
        'To give Movian access to your Trakt account,\n' +
        'open a web browser on your computer or smartphone and visit:\n\n<font size="6">' +
        response.verification_url +
        '</font>\n\nWhen asked, enter the code:\n\n<font size="7">' +
        response.user_code +
        '</font>\n\nThis popup will close automatically once the authentication is completed.');
    message.cancel = true; // Show the cancel button

    // Insert the popup in the global popup tree (this will display it to the user)
    prop.setParent(message, prop.global.popups);

    var timer = null;
    var interval = response.interval ? response.interval * 1000 : 5000;

    // Check if user have accepted in a loop
    function checktoken() {
        var response = http.request(api.API_BASE_URL + "/oauth/device/token", {
            headers: {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': api.CLIENT_ID
            },
            noFail: true,
            postdata: JSON.stringify({
                code: deviceCode,
                client_id: api.CLIENT_ID,
                client_secret: api.CLIENT_SECRET
            })
        });

        if (response.statuscode === 400) {
            // pending
            timer = setTimeout(checktoken, interval);
            return;
        } else if (response.statuscode === 410) {
            // expired
            prop.destroy(message);
            popup.notify('Code expired. Try again.', 3);
            return;
        } else if (response.statuscode === 418) {
            // denied
            prop.destroy(message);
            popup.notify('Authentication denied by user', 3);
            return;
        } else if (response.statuscode === 404) {
            // invalid device_code
            prop.destroy(message);
            popup.notify('Invalid code. Try again.', 3);
            return;
        } else if (response.statuscode === 409) {
            // already used
            prop.destroy(message);
            popup.notify('Code already used. Try again.', 3);
            return;
        } else if (response.statuscode === 429) {
            // slow down
            interval += 1000;
            timer = setTimeout(checktoken, interval);
            return;
        }

        var token = JSON.parse(response);
        log.d(token);

        // Ok, we're done (in one way or another). Destroy the message
        prop.destroy(message);

        // All looks good
        credentials.refresh_token = token.refresh_token;
        credentials.apiauth = token.token_type + ' ' + token.access_token;

        popup.notify('Successfully authenticated', 3);

        return;
    }

    // Start the refresh loop
    timer = setTimeout(checktoken, interval);

    // Subscribe to the popup eventSink to detect if user presses cancel
    prop.subscribe(message.eventSink, function(event, data) {
        if (event == 'action' && data == 'Cancel') {
            prop.destroy(message);
            clearTimeout(timer);
            popup.notify('Cancelled by user', 3);
        }
    }, {
        // This will make the subscription destroy itself when the popup
        // is destroyed. Without this we will retain references to captured
        // variables indefinitely
        autoDestroy: true
    });
};

exports.refreshToken = function() {
    try {
        var response = http.request(api.API_BASE_URL + "/oauth/token", {
            headers: {
                'Content-Type': 'application/json',
                'trakt-api-version': '2',
                'trakt-api-key': api.CLIENT_ID
            },
            noFail: true,
            postdata: JSON.stringify({
                refresh_token: credentials.refresh_token,
                client_id: api.CLIENT_ID,
                client_secret: api.CLIENT_SECRET,
                redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
                grant_type: 'refresh_token'
            })
        });

        if (response.statuscode && response.statuscode >= 400) {
            log.e('Token refresh failed (HTTP ' + response.statuscode + '), clearing credentials');
            delete credentials.apiauth;
            delete credentials.refresh_token;
            return;
        }

        var token = JSON.parse(response);
        log.d(token);

        credentials.refresh_token = token.refresh_token;
        credentials.apiauth = token.token_type + ' ' + token.access_token;

        log.d('Successfully renewed token');
    } catch (e) {
        log.e('Token refresh error: ' + e);
        delete credentials.apiauth;
        delete credentials.refresh_token;
    }
};
