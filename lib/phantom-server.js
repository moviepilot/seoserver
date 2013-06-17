var page = require('webpage').create();
page.viewportSize = { width: 1900, height: 1200};

var system = require('system');
var lastReceived = new Date().getTime();
var requestCount = 0;
var responseCount = 0;
var requestIds = [];

var initialRequest = null;
var initialResponse = null;

page.onResourceRequested = function (request) {
  initialRequest = initialRequest || request;
  if(requestIds.indexOf(request.id) === -1) {
    requestIds.push(request.id);
    requestCount++;
  }
};

page.onResourceReceived = function (response) {
  initialResponse = initialResponse || response;
  if(requestIds.indexOf(response.id) !== -1) {
    lastReceived = new Date().getTime();
    responseCount++;
    requestIds[requestIds.indexOf(response.id)] = null;
  }
};

page.open(system.args[1]);

var checkComplete = function () {
  if(new Date().getTime() - lastReceived > 1000 && requestCount === responseCount)  {
    clearInterval(checkCompleteInterval);
    console.log(JSON.stringify(initialResponse) + "\n\n");
    if(initialResponse["contentType"] === "text/plain") {
      console.log(page.plainText);
    } else {
      console.log(page.content);
    }
    phantom.exit();
  }
}
var checkCompleteInterval = setInterval(checkComplete, 1);
