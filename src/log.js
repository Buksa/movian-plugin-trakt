function logData(data, logFunction) {
    if (data === null) logFunction("NULL");
    else if (data === undefined) logFunction("UNDEFINED");
    else if (typeof(data) === 'boolean') logFunction(data);
    else if (typeof(data) === 'number') logFunction(data);
    else if (typeof(data) === 'string') logFunction(data);
    else if (Array.isArray(data)) logFunction(JSON.stringify(data, null, 4));
    else if (typeof(data) === 'object') {
        if (data.__Proxy) prop.print(data);
        else if (data instanceof Error) {
            // print info related to error
            logFunction(data.stack);
        } else logFunction(JSON.stringify(data, null, 4));
    } else if (typeof(data) === 'function') {
        logFunction(data.toString());
    } else logFunction("Unknown data type");
}

exports.d = function(data) {
    logData(data, console.log);
};

exports.e = function(data) {
    logData(data, console.error);
};

/*
 * Print to stdout the stacktrace of function calls.
 * Useful when we want to know the stacktrace but we are not handling an exception.
 */
exports.d.trace = function() {
    exports.d("Stacktrace:");

    var e = new Error();
    // slice 2 so to not print the line with "Error" and the line of current function
    var stack = e.stack.split("\n").slice(2).join("\n");
    exports.d(stack);
};

/*
 * Print to stdout the stacktrace of function calls.
 * Useful when we want to know the stacktrace but we are not handling an exception.
 */
exports.e.trace = function() {
    exports.e("Stacktrace:");

    var e = new Error();
    // slice 2 so to not print the line with "Error" and the line of current function
    var stack = e.stack.split("\n").slice(2).join("\n");
    exports.e(stack);
};
