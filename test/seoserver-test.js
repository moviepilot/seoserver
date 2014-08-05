// Here will be teh specs :)
var buster = require("buster");
var Seoserver = require('../lib/seoserver');
var http = require('http');
var assert = buster.referee.assert;

buster.testCase("A module", {
    setUp: function() {
      this.timeout = 30000;
    },

    "fetches /stories from mp.com": function (done) {
      server = new Seoserver({ memcached: {enabled: false}});
      server.start().done(function() {
        http.get("http://localhost:10300/stories", function(res) {
          assert.equals(res.statusCode, 200);
          done();
        }).on('error', function(e) {
          console.log("Got error: " + e.message);
          done();
        });
      });
    }
});
