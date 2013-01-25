// Modules
var express = require('express');
var memcached = require('memcached');
var phantom = require('phantom');
// Argument's preping.
var arguments = process.argv.splice(2);

var port = arguments[0] !== undefined ? arguments[0] : 11211;
var host = arguments[1] !== undefined ? arguments[1] : 'memcache-production'

function getContent(url, callback) {
  phantomConn.createPage(function(page) {
    var statusCode = 500;
    var openingTime = 0;
    var now = new Date().getTime()
    // 'close' only introduced in Phantom.js 1.7+
    var closeMethod = 'close';
    if (!(typeof page.close === 'function'))
      closeMethod = 'release';

    page.set('onResourceReceived', function(res) {
      if (url === res.url && res.stage == 'end')
        statusCode = res.status
    });
    page.open(url, function(status) {
      t = 4000
      if (statusCode >= 400) t = 1;
      openingTime = (+new Date - now);
      console.log('url: ' + url + ' - opening time: ' + openingTime + ' | ' + (openingTime / 1000).toFixed(2) + 's');

      setTimeout(function() {
        page.evaluate((function() {
          return document.documentElement.outerHTML;
        }), function(html) {
          callback(html, statusCode);
          page[closeMethod]();
        });
      }, t);
    });
  });
}

function handler(req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  var url = 'http://moviepilot.com' + req.url;
  var uri = 'http://moviepilot.com' + req.path;
  var clearCache = req.query.plan === 'titanium';

  var memcachedClient = createMemcachedClient(function(err) {
    var key = 'moviepilot.com:' + uri;
    var afterGet = function(err, cachedContent) {
      if (err) console.log('memcached:error: ' + err);
      if (!err && !clearCache && cachedContent) {
        console.log('memcached:uri: ' + uri);
        // Found no error, and no cache invaidation, so we send the content found
        // in memcached back.
        memcachedClient.end();
        res.send(cachedContent);
      }
      else {
        getContent(url, function(content, status) {
          // send the crawled content back
          res.status(status);
          res.send(content);
          // generate a unique key for memcached of this path (which
          // includes the query string) store in memcached
          if (!err && status === 200) {
            memcachedClient.set(key, content, 0, function() {
              console.log('memcached key stored: ' + uri);
              memcachedClient.end();
            });
          }
        });
      }
    };
    if (!err) {
      // Success making a connection with Memcached server...
      return memcachedClient.get(key, afterGet);
    }
    console.log('url: ' + url);
    // Failsafe: ignore Memcache connection, just use the Phantom.js to server the content.
    getContent(url, function(content, status) {
      res.status(status);
      res.send(content);
    });
  });
};

// Create a client and send messages across respectively.
function createMemcachedClient(callback) {
  var client = new memcached(host + ':' + port);

  client.on('timeout', function() {
    console.log('memcached: socked timed out.');
  });

  client.on('error', function(err) {
    console.log('memcached: error', err);
  });

  client.connect(host + ':' + port, callback);

  return client;
}

// Phantom instance
var phantomConn = null;
// Express app
var app = null;

function main(){
  phantom.create(function(ph) {
    phantomConn = ph;

    app = express()
    app.listen(10300);

    //app.use(express.static('/Users/luismerino/dev/mp.com/public/assets'));
    app.use(express.static('/home/moviepilot/apps/mp.com-production/current/public'));
    app.get(/(.*)/, handler);
  });
}

main();
