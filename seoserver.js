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

    page.set('onResourceReceived', function(res) {
      if (url === res.url && res.stage == 'end')
        statusCode = res.status
    });
    page.open(url, function(status) {
      t = 5000
      if (statusCode >= 400) t = 1;
      openingTime = (+new Date - now);
      console.log('url: ' + url + ' - opening time: ' + openingTime + ' | ' + (openingTime / 1000).toFixed(2) + 's');

      setTimeout(function() {
        page.evaluate((function() {
          return document.documentElement.outerHTML;
        }), function(html) {
          callback(html, statusCode);
          //phantomConn.exit();
        });
      }, t);
    });
  });
}

function handler(req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  var url = 'http://moviepilot.com' + req.url;
  var clearCache = req.query.plan === 'titanium';

  var memcachedClient = createMemcachedClient(function(err) {
    var key = 'moviepilot.com:' + url;
    var afterGet = function(err, cachedContent) {
      if (!err && !clearCache && cachedContent) {
        console.log('memcached:url: ' + url);
        // Found no error, and no cache invaidation, so we send the content found
        // in memcached back.
        memcachedClient.end();
        res.send(cachedContent);
      }
      else {
        console.log('url: ' + url);
        getContent(url, function(content, status) {
          // send the crawled content back
          res.status(status);
          res.send(content);
          // generate a unique key for memcached of this path (which
          // includes the query string) store in memcached
          if (!err && status === 200) {
            memcachedClient.set(key, content, 0, function() {
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
    /*ph.set('onError', function(msg, trace) {
      var msgStack = ['PHANTOM ERROR: ' + msg];
      if (trace) {
        msgStack.push('TRACE:');
        trace.forEach(function(t) {
            msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function ' + t.function + ')' : ''));
        });
      }
      console.error(msgStack.join('\n'));
      try
        phantomConn.exit();
        app.close()
      catch err
        console.log(err);
      // Start the app again
      main();
    });*/

    app = express()
    app.listen(10300);
    //app.use(express.static('/home/moviepilot/apps/mp.com-production/current/public'));
    app.get(/(.*)/, handler);
  });
}

main();
