/**
 * Created by artzub on 19.12.13.
 */

(function(env) {
    function log(label, data) {
        if (arguments.length < 2)
            console.log(label);
        else
            console.log(label, data);
    }

    function logError(error) {
        log("error", error);
    }

    env.logError = logError;
    env.log = log;
})(window);
