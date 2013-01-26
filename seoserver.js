// Modules
var express = require('express');
var memcached = require('memcached');
var phantom = require('phantom');
// Argument's preping.
var arguments = process.argv.splice(2);

var port = arguments[0] !== undefined ? arguments[0] : 11211;
var host = arguments[1] !== undefined ? arguments[1] : 'memcache-production'

function getContent(url, callback) {
  // Failsafe timeout, will return 500 error and restart every connection and client.
  var failureTimeout = setTimeout(function() {
    callback('Internal Server Error', 500);
    main();
  }, 30000);

  phantomConn.createPage(function(page) {
    var queue = [];
    var statusCode = 500;
    var openingTime = 0;
    var now = +new Date()
    // 'close' only introduced in Phantom.js 1.7+
    var closeMethod = 'close';
    if (!(typeof page.close === 'function'))
      closeMethod = 'release';

    page.set('onResourceReceived', function(res) {
      if (url === res.url && res.stage === 'end')
        statusCode = res.status
    });

    page.open(url, function(status) {
      clearTimeout(failureTimeout);
      if (status === 'success') {
        queue[url] = 'queued';
        setTimeout(function(){
          if (queue[url] !== 'done') {
            openingTime = (+new Date - now);
            console.log('url: ' + url + ' - opening time: ' + openingTime + ' | ' + (openingTime / 1000).toFixed(2) + 's');

            page.evaluate(function() {
              return document.documentElement.outerHTML;
            }, function(html) {
              callback(html, statusCode);
              page[closeMethod]();
            });

            queue[url] = 'done';
          }
        }, 5000);
      }
    });
  });
}

function handler(req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  var url = 'http://moviepilot.com' + req.url;
  var uri = 'http://moviepilot.com' + req.path;
  var clearCache = req.query.plan === 'titanium';

  function afterGet(err, cachedContent) {
    if (err)
      console.log('memcached:error: ' + err);

    if (!err && !clearCache && cachedContent) {
      console.log('memcached:uri: ' + uri);
      // Found no error, and no cache invaidation, so we send the content found
      // in memcached back.
      res.status(200);
      res.send(cachedContent);
    } else {
      getContent(url, function(content, status) {
        // send the crawled content back
        res.status(status);
        res.send(content);
        // generate a unique key for memcached of this path (which
        // includes the query string) store in memcached
        if (status >= 200 && status < 300 && memcachedClient) {
          memcachedClient.set(key, content, 0, function(err) {
            if (err) console.error(err);
          });
        }
      });
    }
  };

  if (memcachedClient) {
    var key = 'moviepilot.com:' + uri;
    // Success making a connection with Memcached server...
    memcachedClient.get(key, afterGet);
  } else {
    // Failsafe: ignore Memcache connection, just use the Phantom.js to server the content.
    getContent(url, function(content, status) {
      res.status(status);
      res.send(content);
    });
  }
};

// Create a client and send messages across respectively.
function createMemcachedClient(callback) {
  memcached.config.retries = 0;

  var client = new memcached(host + ':' + port);

  client.on('failure', function(details) {
    console.error( "memcached: Server " + details.server + "went down due to: " + details.messages.join( '' ) );
  });
  client.on('reconnecting', function(details) {
    console.debug( "memcached: Total downtime caused by server " + details.server + " :" + details.totalDownTime + "ms");
  });

  client.connect(host + ':' + port, callback);

  memcached.config.retries = 5;

  return client;
}

// Phantom instance
var phantomConn = null;
// Memcached client
var memcachedClient = null;
// Express app
var app = null;
var server = null;

function onExit() {
  if (phantomConn) phantomConn.exit();
  if (memcachedClient) memcachedClient.end();
  if (server) server.close();
}

function main(){
  onExit();

  phantom.create(function(ph) {
    phantomConn = ph;
    memcachedClient = createMemcachedClient(function(err) {
      if (err) {
        console.error(err);
        console.log('Continuing without Memcached client...');
        memcachedClient = null;
      }

      app = express()
      server = app.listen(10300);

      app.use(express.static('/home/moviepilot/apps/mp.com-production/current/public'));
      app.get(/(.*)/, handler);
    });
  });
}

process.on('exit', onExit);

main();
