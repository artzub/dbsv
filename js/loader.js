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
     * @param {number} seqid
     * @param id
     * @param type
     * @param icon
     * @returns {{name: *, path: *, level: *, isDir: *, size: *, seqid: number, id: *, type: *, icon: *}}
     * @constructor
     */
    function File(name, path, level, isDir, size, seqid, id, type, icon) {
        return {
            name : name,
            path : path,
            level : level,
            isDir : isDir,
            size : size,
            seqid : seqid,
            id : id || seqid,
            type : type,
            icon : icon
        }
    }

    /**
     * Implements loading data using the request queue.
     * @param getData
     * @returns {{appendToRT: appendToRT, insertDataBack: insertDataBack, seqNextValue : seqNextValue, resume: resume, pause: pause, isPaused: isPaused}}
     * @constructor
     */
    function Loader(getData) {
        var requestTurn = []
            , loop
            , pause
            , to = 10
            , seq = 0
            ;

        function seqNextValue() {
            return ++seq;
        }

        function appendToRT(item) {
            item && (item.file.seqid = (seqNextValue())) && requestTurn.push(item);
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

        function sort(a, b) {
            return d3.ascending(a.file.seqid, b.file.seqid);
        }

        function insertDataBack(dir) {
            requestTurn.splice(0, 0, {path : dir.path, file : dir});
            requestTurn.sort(sort);
        }

        return {
            appendToRT : appendToRT,
            insertDataBack : insertDataBack,
            seqNextValue : seqNextValue,
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

    /**
     * Dropbox wrapper for loading data from dropbox
     * @param option
     * @returns {{singIn: singIn, singOut: singOut, run: run, getDirTree: getDirTree, resume: (function(this:{appendToRT: appendToRT, insertDataBack: insertDataBack, resume: resume, pause: pause, isPaused: isPaused})), pause: (function(this:{appendToRT: appendToRT, insertDataBack: insertDataBack, resume: resume, pause: pause, isPaused: isPaused})), isPaused: (function(this:{appendToRT: appendToRT, insertDataBack: insertDataBack, resume: resume, pause: pause, isPaused: isPaused}))}}
     * @constructor
     */
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

                behavior.doSingOut(error);
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

                file.type = d.mime_type;
                file.icon = "sprite_web s_web_" + d.icon + "_32 icon";

                var add = d.is_dir;
                if (add) {
                    loader.appendToRT({path : d.path, file : file});
                }
                else {
                    behavior.doIncBar();
                    file.orignsize = d.size || 0;
                    file.size = d.bytes || 0;
                    add = !!file.size;
                    file.seqid = loader.seqNextValue();
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
                    logError(error ? error.responseText ? error.responseText : error : "");
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
                userData.quota,
                -2
            );

            dirTree.icon = "sprite_web s_web_folder_32 icon";

            if (path == "/") {
                dirTree.children = [File(
                    "Free Space",
                    "/.FreeSpace",
                    1,
                    false,
                    userData.quota - userData.usedQuota,
                    -1,
                    -1,
                    ".FreeSpace",
                    "sprite_web s_web_page_white_32 icon"
                )];
            }

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
            isPaused : loader.isPaused.bind(loader),
            getNextId : loader.seqNextValue.bind(loader)
        }
    }

    function YandexDiskClient(option) {

        var loader = Loader(getData)
            , userData = {}
            , dirTree
            , loop
            , at
            ;

        var behavior = Behavior(option);

        function parseUserInfo(error, data) {
            if (error) {
                logError(error);
                return;
            }

            if (data) {
                userData = data;
                userData.name = data.real_name + '(' + data.display_name + ')';

                getQuotaInfo(at);
            }
        }

        function parseQuoteInfo(data) {
            var doc = d3.select(data.responseXML);
            userData.quota = parseInt(doc.select("quota-available-bytes").text());
            userData.usedQuota = parseInt(doc.select("quota-used-bytes").text());
            userData.quota += userData.usedQuota;
            behavior.doSingIn(userData);

            option
                && option.startImmediately
            && run(option.root);
        }

        function getUserInfo(at) {
            d3.json("/proxy/https/login.yandex.ru/info?format=json&oauth_token=" + at, parseUserInfo);
        }

        function getQuotaInfo(at) {
            var xhr = d3.xhr(
                "/proxy/https/webdav.yandex.ru/",
                "application/xml"
            );
            xhr.header("Authorization", "OAuth " + at);
            xhr.header("Depth", 0);


            var quota = '<D:propfind xmlns:D="DAV:"><D:prop><D:quota-available-bytes/><D:quota-used-bytes/></D:prop></D:propfind>';

            xhr.on("load", parseQuoteInfo);
            xhr.on("error", logError);

            xhr.send("PROPFIND", quota);
        }

        function getDirInfo(path, callback) {
            var xhr = d3.xhr(
                "/proxy/https/webdav.yandex.ru" + path,
                "application/xml"
            );
            xhr.header("Authorization", "OAuth " + at);
            xhr.header("Depth", 1);

            xhr.on("load", callback);
            xhr.on("error", callback);

            xhr.send("PROPFIND");
        }

        function singIn(key) {
            at = localStorage.getItem("yad-access_token");
            if (document.location.hash.indexOf("access_token=") > -1)  {
                at = document.location.hash.replace(/.*access_token=(.*?)&.*/, "$1");
                localStorage.setItem("yad-access_token", at);
                document.location.href = document.location.href.replace(document.location.hash, "");
            }
            else if(at) {
                getUserInfo(at);
            }
            else {
                document.location = "https://oauth.yandex.ru/authorize?response_type=token&client_id=" + key;
            }
        }

        function singOut() {
            localStorage.removeItem("yad-access_token");
            behavior.doSingOut();
        }

        function run(root) {
            var path = decodeURIComponent(root || "/");

            dirTree = File(
                "",
                path,
                0,
                true,
                userData.quota,
                -2
            );

            if (path == "/") {
                dirTree.children = [File(
                    "Free Space",
                    "/.FreeSpace",
                    1,
                    false,
                    userData.quota - userData.usedQuota,
                    -1,
                    -1,
                    ".FreeSpace"
                )];
            }

            behavior.doSetMaxBar(0);

            getData(dirTree.path, dirTree);

            return dirTree;
        }

        function getData(path, dir) {
            getDirInfo(path, parseDirInfo(dir));
        }

        function getName(path) {
            path = path.replace(/\/$/, '');
            return path.substr(path.lastIndexOf("/") + 1);
        }

        function analyseDirInfo(dir) {
            if (!dir.children)
                dir.children = [];

            return function(d) {

                d = d3.select(d);
                var path = decodeURIComponent(d.select("href").text());
                d = d.select("propstat");
                var is_dir = d.select("resourcetype").node().children.length > 0;
                var sizenode = d.select("getcontentlength");
                var size = sizenode.empty() ? 0 : parseInt(sizenode.text());
                var type = is_dir ? "" : d.select("getcontenttype").text();

                if (path == dir.path)
                    return;

                var file = File(
                    getName(path),
                    path,
                    dir.level + 1,
                    is_dir
                );

                var add = is_dir;
                if (add) {
                    loader.appendToRT({path : path, file : file});
                }
                else {
                    behavior.doIncBar();
                    file.orignsize = size || 0;
                    file.size = size || 0;
                    file.type = type;
                    add = !!file.size;
                    file.seqid = loader.seqNextValue();
                }
                if (add) {
                    dir.children.push(file);
                }
                behavior.doWork(dirTree);
            }
        }

        function parseDirInfo(dir) {
            return function(data) {
                if (data.status != 207) {
                    //send error
                    if (data.status == 503) {
                        loader.pause();
                        loader.insertDataBack(dir);
                        resetWaiting();
                    }
                    logError(data);
                    return;
                }

                if (data.responseXML) {
                    var doc = d3.select(data.responseXML).selectAll("response")[0];
                    if (doc) {
                        behavior.doSetMaxBar(behavior.doGetMaxBar() + doc.length - 1);

                        doc.forEach(analyseDirInfo(dir));
                    }
                }

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

        return {
            singIn : singIn,
            singOut : singOut,
            run : run,
            getDirTree : function() {
                return dirTree;
            },
            resume : loader.resume.bind(loader),
            pause : loader.pause.bind(loader),
            isPaused : loader.isPaused.bind(loader),
            getNextId : loader.seqNextValue.bind(loader)
        }
    }

    function GoogleDriveClient(callback) {
        var SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
        var MaxResults = 100000000;

        env.JSONP("https://apis.google.com/js/client.js", handleClientLoad, {
            callbackParam : 'onload',
            onerror_callback : logError,
            script_order : 'defer'
        });

        function handleClientLoad() {
            env.GoogleDriveClient = InsideGoogleClientDrive;
            callback && callback();
        }

        function InsideGoogleClientDrive(option) {

            var loader = Loader(getData)
                , userData = {}
                , dirTree
                , loop
                , at
                , dirHash = {}
                , dirs = []
                ;

            var behavior = Behavior(option);

            function asyncForEach(items, fn, time) {
                if (!(items instanceof Array))
                    return;

                var workArr = items.concat();

                while(workArr.length) {
                    step(workArr.shift(), workArr.length);
                }

                function step(item, ind) {
                    setTimeout(function () {
                        fn(item, ind);
                    }, time || 1);
                }

                /*setTimeout(function aloop() {
                    if (workArr.length > 0)
                        fn(workArr.shift(), workArr);
                    if (workArr.length > 0)
                        setTimeout(aloop, time || 1);
                }, time || 1);*/
            }

            function parseQuoteInfo(data) {
                if (!data || data.error) {
                    data.error && logError(data.error);
                    return;
                }

                userData = data;

                userData.quota = parseInt(data.quotaBytesTotal);
                userData.usedQuota = parseInt(data.quotaBytesUsedAggregate);
                userData.usedQuotaInTrash = parseInt(data.quotaBytesUsedInTrash);
                behavior.doSingIn(userData);

                option
                    && option.startImmediately
                && run(option.root);
            }

            function getUserInfo() {
                gapi.client.load('drive', 'v2', function() {
                    var request = gapi.client.drive.about.get({});
                    request.execute(parseQuoteInfo);
                });
            }

            function getDirInfo(path, callback) {
                behavior.doBeginWaiting();
                var request = gapi.client.drive.files.list({
                    maxResults: MaxResults,
                    pageToken: path,
                    fields: "items(labels,mimeType,createdDate,embedLink,fileExtension,fileSize,iconLink,id,kind,originalFilename,parents(id,isRoot,kind),quotaBytesUsed,selfLink,title),nextPageToken"
                });
                request.execute(callback);
            }

            function singIn(key) {
                if (key.error) {
                    logError(key.error);
                    localStorage.removeItem("ga-access_token");
                }
                else if (key.access_token) {
                    var now = Date.now();
                    var msToAdd = (parseInt(key.expires_in) - 100) * 1000;
                    at = {};
                    at.expiration = now + msToAdd;
                    at.access_token = key.access_token;
                    localStorage.setItem("ga-access_token", at);

                    getUserInfo();
                }
                else {
                    at = localStorage.getItem("ga-access_token");

                    gapi.auth.authorize({
                        client_id: key,
                        scope: SCOPES,
                        immediate: at && at.expiration > Date.now()
                    }, singIn);
                }
            }

            function singOut() {
                localStorage.removeItem("ga-access_token");
                behavior.doSingOut();
            }

            function run(root) {
                var path = decodeURIComponent(root || "/");

                dirTree = File(
                    "",
                    path,
                    0,
                    true,
                    userData.quota,
                    -2,
                    userData.rootFolderId
                );

                dirTree.icon = "https://ssl.gstatic.com/docs/doclist/images/icon_11_collection_list.png";

                dirHash[userData.rootFolderId] = dirs.push(dirTree) - 1;

                if (path == "/") {
                    dirTree.children = [File(
                        ".FreeSpace",
                        "/.FreeSpace",
                        1,
                        false,
                        userData.quota - userData.usedQuota,
                        -1,
                        -1,
                        ".FreeSpace",
                        "https://ssl.gstatic.com/docs/doclist/images/icon_10_generic_list.png"
                    ), File(
                        ".Trash",
                        "/.Trash",
                        1,
                        false,
                        userData.usedQuotaInTrash,
                        -3,
                        -3,
                        ".Trash",
                        "https://ssl.gstatic.com/docs/doclist/images/icon_10_generic_list.png"
                    )];


                }

                behavior.doSetMaxBar(0);

                getData(null, { path : null });

                return dirTree;
            }

            function getData(path, dir) {
                getDirInfo(path, parseDirInfo(dir));
            }

            function analyseDirInfo(d) {

                behavior.doIncBar();

                if (d.labels.trashed)
                    return;

                var id = d.id
                    , i
                    , dir
                    ;

                if (d.parents && d.parents.length > 0) {
                    id = d.parents[0].id;
                }

                i = dirHash[id];

                if (typeof(i) === "undefined") {
                    dir = File("", "", 1, false, 0, loader.seqNextValue(), id);
                    i = dirHash[id] = dirs.push(dir) - 1;
                }

                dir = dir || dirs[i];

                if (dir.id == d.id) {
                    dir.name =
                        dir.path = d.title;
                }

                if (dir.id != d.id) {

                    if (!dir.children) {
                        dir.isDir = true;
                        dir.children = [];
                    }

                    i = dirHash[d.id];

                    var file = (i && dirs[i]) || File(
                        d.title,
                        d.title,
                        dir.level + 1,
                        d.mimeType == "application/vnd.google-apps.folder",
                        parseInt(d.quotaBytesUsed),
                        loader.seqNextValue(),
                        d.id
                    );

                    if (!dirHash[d.id])
                        dirHash[d.id] = dirs.push(file) - 1;

                    file.name = d.title;
                    file.level = dir.level + 1;
                    file.size = parseInt(d.quotaBytesUsed);
                    file.type = d.mimeType;
                    file.icon = d.iconLink;

//                    !file.isDir && file.size < 1 && (file.size = 1);

                    if (!file.pushed && (file.isDir || file.size > 0)) {
                        dir.children.push(file);
                        file.pushed = true;
                    }
                }

                makePaths();

                behavior.doWork(dirTree);
            }

            function makePaths() {
                function path_(p, level) {
                    return function(d) {
                        d.level = level + 1;
                        d.path = p + "/" + d.name;
                        d.children && d.children.forEach(path(d.path, d.level));
                    }
                }

                function path(p, level) {
                    return function(d) {
                        d.level = level + 1;
                        d.path = p + "/" + d.name;
                        d.children && d.children.forEach(path_(d.path, d.level));
                    }
                }

                dirTree.level = 0;
                dirTree.children.forEach(path("", dirTree.level));
            }

            function parseDirInfo(dir) {
                return function(data) {
                    behavior.doEndWaiting();

                    if (data.error) {
                        //send error
                        if (data.error != 500) {
                            loader.pause();
                            loader.insertDataBack(dir);
                            resetWaiting();
                        }
                        logError(data);
                        return;
                    }

                    if (data.items) {
                        behavior.doSetMaxBar(behavior.doGetMaxBar() + data.items.length - 1);

                        if (data.nextPageToken)
                            loader.appendToRT({path : data.nextPageToken, file : { path : data.nextPageToken }});

                        asyncForEach(data.items, analyseDirInfo, 1);
                    }

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

            return {
                singIn : singIn,
                singOut : singOut,
                run : run,
                getDirTree : function() {
                    return dirTree;
                },
                resume : loader.resume.bind(loader),
                pause : loader.pause.bind(loader),
                isPaused : loader.isPaused.bind(loader),
                getNextId : loader.seqNextValue.bind(loader)
            }
        }
    }

    env.GoogleDriveClient = GoogleDriveClient;
    env.DropBoxClient = DropBoxClient;
    env.YandexDiskClient = YandexDiskClient;
})(window);