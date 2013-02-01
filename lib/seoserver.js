var express = require('express');
var memcached = require('memcached');

var app = express();
var arguments = process.argv.splice(2);
var memcachedClient = null;
var timeout = null;


var port = arguments[0] !== undefined ? arguments[0] : 11211;
var host = arguments[1] !== undefined ? arguments[1] : 'memcache-production'


var getContent = function(url, callback) {
  var content = '';
  var status = '';
  var phantom = require('child_process').spawn('phantomjs', [__dirname + '/phantom-server.js', url]);
  timeout = setTimeout(function() {
    console.log("Killed request for " + url);
    phantom.kill();
  }, 30000);
  phantom.stdout.setEncoding('utf8');
  phantom.stdout.on('data', function(data) {
    if(matches = data.match(/statuscode:(\d+)/)) {
      status = matches[1];
    } else {
      content += data.toString();
    }
  });
  phantom.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });
  phantom.on('exit', function(code) {
    if (code) {
      console.log('Error on Phantomjs process');
    } else {
      clearTimeout(timeout);
      callback(status, content);
    }
  });
};

var respond = function (req, res) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  var url = 'http://moviepilot.com' + req.url;
  var uri = 'http://moviepilot.com' + req.path;
  var clearCache = req.query.plan === 'titanium';

  console.log("Requesting: " + url);

  if (memcachedClient) {
    var key = 'moviepilot.com:' + uri;
    // Success making a connection with Memcached server...
    memcachedClient.get(key, function(err, cachedContent) {
      if (err)
        console.log('memcached:error: ' + err);

      if (!err && !clearCache && cachedContent) {
        console.log('memcached:uri: ' + uri);
        // Found no error, and no cache invaidation, so we send the content found
        // in memcached back.
        // Not good to always send a 200
        res.status(200);
        res.send(cachedContent);
      } else {
        getContent(url, function(content, status) {
          // send the crawled content back
          console.log("Delivered url: " + url);
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
    });;
  } else {
    getContent(url, function (status, content) {
      console.log("Delivered url: " + url);
      res.status(status);
      res.send(content);
    });
  }
}

var initMemcached = function(callback) {

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
};

memcachedClient = initMemcached(function(err) {
  if(err) {
    console.error(err);
    console.log('Continuing without Memcached client...');
    memcachedClient = null;
  }
  app.use(express.static('/home/moviepilot/apps/mp.com-production/current/public'));
  app.get(/(.*)/, respond);
  app.listen(port);
});
