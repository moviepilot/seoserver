/*
  SeoServer
    initialize: ->
    initMemcached: ->
    initExpress: ->
    initPhantom: ->
    requestCallback: ->
    responseCallback: ->
*/
var express = require('express');
var memcached = require('memcached');

memcached.config.maxValue = 2097152;

var app = express();
var arguments = process.argv.splice(2);
var memcachedClient = null;
var port          = arguments[0] !== undefined ? arguments[0] : 10300;
var memcachedHost = arguments[1] !== undefined ? arguments[1] : 'memcache-production';
var memcachedPort = arguments[2] !== undefined ? arguments[2] : 11211;

console.log('SeoServer successfully started on port: ' + port + '\nmemcached: ' + memcachedHost + ':' + memcachedPort);

// remove all script tags so google won't redo all actions
// when its running the js (for previews and stuff).
// Also what we store in memcached will be way less
var removeScripts = function(content) {
  return content.replace(/<script[\s\S]*?<\/script>/gi, '');
}

var getContent = function(url, callback) {
  var timeout = null;
  var headers = {};
  var content = '';

  var phantom = require('child_process').spawn('phantomjs', [__dirname + '/phantom-server.js', url]);

  timeout = setTimeout(function() {
    phantom.kill();
  }, 30000);

  phantom.stdout.on('data', function(data) {
    data = data.toString();
    if(match = data.match(/({.*?})\n\n/)) {
      response = JSON.parse(match[1]);
      headers.status = response.status;
      if(response.status == 301) {
        headers.location = response.redirectURL;
      }
      // removed json object from response
      // just in case we have the whole response
      // in one chunk
      data = data.replace(/(.*?)\n\n/, '');
    }
    if(data.match(/^\w*error/i)){
      console.log("Phantom js error: " + data.toString());
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
      content = removeScripts(content);
      callback(headers, content);
    }
  });
};

var deliverContent = function(url, res, headers, content) {
  // check if we have a normal response
  var status = 500;
  if(headers.status) {
    status = headers.status;
  }
  res.status(status);

  if(headers.location) {
    res.set('Location', headers.location);
    res.send('');
  }
  else {
    res.send(content);
  }
}

var logResponseStats = function(crawler, status, time, url) {
  url = url.replace(/.*moviepilot\.com/, '');
  if(typeof status == 'undefined')
    status = 'KILLED';
  console.log(crawler, status, 'Time:', time + 'ms', "|", (time / 1000).toFixed(2) + 's', url);
}

var respond = function (req, res) {
  var crawler = 'GoogleBot';
  if(/RedSnapper/.test(req.headers['user-agent'])) {
    crawler = 'Crawler';
  }

  var openingTime = 0;
  var now = +new Date();

  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");

  //console.log(crawler, req.url);

  var url = 'http://moviepilot.com' + req.url;
  var uri = 'http://moviepilot.com' + req.path;
  var clearCache = req.query.plan === 'titanium';


  if (memcachedClient) {
    var key = 'moviepilot.com:' + uri;
    // Success making a connection with Memcached server...
    memcachedClient.get(key, function(err, cachedContent) {
      if (err)
        console.log('memcached:error: ' + err);

      if (!err && !clearCache && cachedContent) {
        openingTime = (+new Date - now);
        logResponseStats(crawler, 'MEMCACHED', openingTime, url);
        // Found no error, and no cache invaidation, so we send the content found
        // in memcached back.
        if(/^301/.test(cachedContent)) {
          var matches = cachedContent.match(/\s(.*)$/);
          res.status(301);
          res.header("Location", matches[1]);
          res.send();
        }
        else {
          res.status(200);
          res.send(cachedContent);
        }
      } else {
        getContent(url, function(headers, content) {
          // send the crawled content back
          openingTime = (+new Date - now);
          logResponseStats(crawler, headers.status, openingTime, url);
          deliverContent(url, res, headers, content, openingTime, crawler);

          // Store 301 location in memcached
          if(headers.status == 301 && memcachedClient) {
            content = "301 " + headers.location;
          }
          if (headers.status >= 200 && (headers.status < 300 || headers.status == 301) && memcachedClient) {
            memcachedClient.set(key, content, 0, function(err) {
              if (err) console.error(err);
            });
          }
        });
      }
    });
  } else {
    getContent(url, function (headers, content) {
      openingTime = (+new Date - now);
      logResponseStats(crawler, headers.status, openingTime, url);
      deliverContent(url, res, headers, content, openingTime, crawler);
    });
  }
}

var initMemcached = function(callback) {

  memcached.config.retries = 0;

  var client = new memcached(memcachedHost + ':' + memcachedPort);

  client.on('failure', function(details) {
    console.error( "memcached: Server " + details.server + "went down due to: " + details.messages.join( '' ) );
  });
  client.on('reconnecting', function(details) {
    console.debug( "memcached: Total downtime caused by server " + details.server + " :" + details.totalDownTime + "ms");
  });

  client.connect(memcachedHost + ':' + memcachedPort, callback);

  memcached.config.retries = 5;

  memcachedClient = client;
};

function main() {
  app.use(express.static('/home/moviepilot/apps/mp.com-production/current/public'));
  app.get(/(.*)/, respond);
  app.listen(port);
}

initMemcached(function(err) {
  if(err) {
    console.error(err);
    console.log('Continuing without Memcached client...');
    memcachedClient = null;
  }
  main();
});

