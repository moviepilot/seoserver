// Modules
var express = require('express');
var Memcached = require('memcached');

// Argument's preping.
var arguments = process.argv.splice(2);
var port = arguments[0] !== 'undefined' ? arguments[0] : 3000;

// Express app
var app = express();

// Functions
var getContent = function(url, callback) {
  var content = '';
  var status = null;
  var phantom = require('child_process').spawn('phantomjs', ['phantom-server.js', url]);

  phantom.stdout.setEncoding('utf8');
  phantom.stdout.on('data', function(data) {
    if (data.indexOf('statuscode:') != -1)
      status = parseInt(data.replace('statuscode:', ''), 10);
    else
      content += data.toString();
  });
  phantom.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });
  phantom.on('exit', function(code) {
    if (code !== 0) {
      console.log('We have an error');
    } else {
      callback(content, status);
    }
  });
};
var handler = function(req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  var url = 'http://moviepilot.com' + req.url;
  var originalUrl = req.path;
  var clearCache = req.query.plan === 'titanium';

  (function(u, o, c, r) {
    var client = createClient(function(err) {
      var key = 'moviepilot.com:' + u;

      var afterGet = function(err, cachedContent) {
        if (!err && !c && cachedContent) {
          console.log('memcached:url: ' + u);
          client.end();
          r.send(cachedContent);
        }
        else {
          console.log('url: ' + u);
          getContent(u, function(content, status) {
            // send the crawled content back
            r.status(status);
            r.send(content);
            // generate a unique key for memcached of this path (which
            // includes the query string) store in memcached
            if (!err && status == 200) {
              client.set(key, content, 0, function() {
                client.end();
              });
            }
          });
        }
      };

      if (!err)
        return client.get(key, afterGet);

      console.log('url: ' + u);
      getContent(u, function(content, status) {
        // send the crawled content back
        r.status(status);
        r.send(content);
      });
    });
  }(url, originalUrl, clearCache, res));
};
// Create a client and send messages across respectively.
var createClient = function(callback) {
  var client = new Memcached();

  client.on('timeout', function() {
    console.log('memcached: socked timed out.');
  });

  client.on('error', function(err) {
    console.log('memcached: error', err);
  });

  client.connect('memcache-production:11211', callback);

  return client;
};

app.listen(port);
app.get(/(.*)/, function(req, res, next) {
  if (req.url === '/favicon.ico')
    next('route');
  else
    next();
}, handler);
