// Node.js tests
var buster = require("buster");

var Seoserver = require('../lib/seoserver');

var http = require('http');

buster.testCase("A module", {
    setUp: function() {
      this.timeout = 30000;
    },

    "states the obvious": function (done) {
      server = new Seoserver({ memcached: {enabled: false}})
      server.start().done(function() {
        http.get("http://localhost:10300/stories", function(res) {
          console.log("Got response: " + res.statusCode);
          done();
        }).on('error', function(e) {
          console.log("Got error: " + e.message);
          done();
        });
      });
    }
});
