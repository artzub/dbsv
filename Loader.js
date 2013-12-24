/**
 * Created by artzub on 18.12.13.
 */

(function(env) {
    var log = env.log || console.log
        , logError = env.logError || log
        ;

    /**
     * Get instance of file.
     * @param name
     * @param path
     * @param level
     * @param isDir
     * @param size
     * @returns {{name: *, path: *, level: *, isDir: *, size: *}}
     * @constructor
     */
    function File(name, path, level, isDir, size) {
        return {
            name : name,
            path : path,
            level : level,
            isDir : isDir,
            size : size
        }
    }

    /**
     * Implements loading data using the request queue.
     * @param getData
     * @returns {{appendToRT: appendToRT, insertDataBack: insertDataBack, resume: resume, pause: pause, isPaused: isPaused}}
     * @constructor
     */
    function Loader(getData) {
        var requestTurn = []
            , loop
            , pause
            , to = 10
            , seq = 0
            ;

        function appendToRT(item) {
            item && (item.file.seqid = (++seq)) && requestTurn.push(item);
            if (pause || loop)
                return;
            loop = setTimeout(function run() {
                var d = !pause;

                d && (d = requestTurn.shift());

                if (d) {
                    getData && getData(d.path, d.file);
                    loop = setTimeout(run, to);
                }
                else {
                    clearTimeout(loop);
                    loop = null;
                }
            }, to);
        }

        function insertDataBack(dir) {
            requestTurn.splice(0, 0, {path : dir.path, file : dir});
            requestTurn.sort(function(a, b) {
                return d3.ascending(a.file.seqid, b.file.seqid);
            });
        }

        return {
            appendToRT : appendToRT,
            insertDataBack : insertDataBack,
            resume : function() {
                pause = false;
                appendToRT();
            },
            pause : function() {
                pause = true;
            },
            isPaused : function() {
                return pause;
            }
        };
    }

    /**
     * Implements
     * @param option
     * @returns {{doIncBar: doIncBar, doSetMaxBar: doSetMaxBar, doGetMaxBar: doGetMaxBar, doBeginWaiting: doBeginWaiting, doEndWaiting: doEndWaiting, doWork: doWork, doSingIn: doSingIn, doSingOut: doSingOut}}
     * @constructor
     */
    function Behavior(option) {

        function haveFunction(name) {
            return option
                && option.hasOwnProperty(name)
                && option[name] instanceof Function
                && option[name]
                ;
        }

        return {
            doIncBar: function() {
                var fun = haveFunction("incBar");
                fun && fun();
            },

            doSetMaxBar: function(value) {
                var fun = haveFunction("setMaxBar");
                fun && fun(value);
            },

            doGetMaxBar: function() {
                var fun = haveFunction("getMaxBar");
                return fun && fun() || 0;
            },

            doBeginWaiting: function() {
                var fun = haveFunction("onBeginWaiting");
                fun && fun();
            },

            doEndWaiting: function() {
                var fun = haveFunction("onEndWaiting");
                fun && fun();
            },

            doWork: function(data) {
                var fun = haveFunction("onWork");
                fun && fun(data);
            },

            doSingIn: function(data) {
                var fun = haveFunction("onSingIn");
                fun && fun(data);
            },

            doSingOut: function(data) {
                var fun = haveFunction("onSingOut");
                fun && fun(data);
            }
        }
    }

    function DropBoxClient(option) {
        var loader = Loader(getData)
            , client
            , loop
            , dirTree
            , userData
            ;

        var behavior = Behavior(option);

        function singIn(key, redirectUrl) {
            client = new Dropbox.Client({
                key: key,
                rememberUser: true
            });

            client.authDriver(new Dropbox.AuthDriver.Redirect({
                receiverUrl: redirectUrl
            }));

            client.authenticate(function(error, client) {
                if (error) {
                    log("authError", error);
                    return;
                }

                getUserInfo(client);
            });
        }

        function singOut() {
            client.signOut(function(error) {
                if (error) {
                    log("error", error);
                    return;
                }

                behavior.singOut(error);
            });
        }

        function getUserInfo(client) {
            client.getUserInfo(parseUserInfo);
        }

        function parseUserInfo(error, data) {
            if (error) {
                logError(error);
                return;
            }

            userData = data;
            behavior.doSingIn(data);
            option
                && option.startImmediately
            && run(option.root);
        }

        function getData(path, dir) {
            client.metadata(path, {readDir : true}, parseDirInfo(dir));
        }

        function getName(path) {
            return path.substr(path.lastIndexOf("/") + 1);
        }

        function analyseDirInfo(dir) {
            if (!dir.children)
                dir.children = [];

            return function(d) {
                var file = File(
                    getName(d.path),
                    d.path,
                    dir.level + 1,
                    d.is_dir
                );

                var add = d.is_dir;
                if (add) {
                    loader.appendToRT({path : d.path, file : file});
                }
                else {
                    behavior.doIncBar();
                    file.orignsize = d.size || 0;
                    file.size = d.bytes || 0;
                    add = !!file.size;
                }
                if (add) {
                    dir.children.push(file);
                }
                behavior.doWork(dirTree);
            }
        }

        function parseDirInfo(dir) {
            return function(error, data) {
                if (error) {
                    //send error
                    if (error.status == 429) {
                        loader.pause();
                        loader.insertDataBack(dir);
                        resetWaiting();
                    }
                    logError(error);
                    return;
                }

                behavior.doSetMaxBar(behavior.doGetMaxBar() + data._json.contents.length);

                data._json.contents
                && data._json.contents.forEach(analyseDirInfo(dir));

                behavior.doIncBar();
            }
        }

        function resetWaiting() {
            if (loop) {
                clearTimeout(loop);
                loop = null;
            }
            behavior.doBeginWaiting();
            loop = setTimeout(function(){
                behavior.doEndWaiting();
                loader.resume();
                loop = null;
            }, 3000);
        }

        function run(root) {
            var path = decodeURIComponent(root || "/");

            dirTree = File(
                "",
                path,
                0,
                true,
                userData.quota
            );

            if (path == "/")
                dirTree.children = [File(
                    "Free Space",
                    "/.FreeSpace",
                    1,
                    false,
                    userData.quota - userData.usedQuota
                )];

            behavior.doSetMaxBar(0);

            getData(dirTree.path, dirTree);

            return dirTree;
        }

        return {
            singIn : singIn,
            singOut : singOut,
            run : run,
            getDirTree : function() {
                return dirTree;
            },
            resume : loader.resume.bind(loader),
            pause : loader.pause.bind(loader),
            isPaused : loader.isPaused.bind(loader)
        }
    }

    env.DropBoxClient = DropBoxClient;
})(window);