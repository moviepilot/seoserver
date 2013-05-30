// Node.js tests
var buster = require("buster");

var Seoserver = require('../lib/seoserver');

buster.testCase("A module", {
    "states the obvious": function () {
      new Seoserver();
    }
});
