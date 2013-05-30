### Welcome!
Seo Server is a command line tool that runs a server that allows GoogleBot (and any other crawlers) to crawl your heavily Javascript built websites. The tool works with very little changes to your server or client side code.


### Getting started
* Add your configuration into `src/seoserver.coffee` (domain, memcached, logentries)
* Install npm dependencies <br/>
<code>npm install</code>
* Install PhantomJS <br/>
<code>npm install -g phantomjs</code>
* Start the main process on port 10300 and with default memcached conf:<br/>
<code>bin/seoserver start -p 10300</code>


### Internals
The crawler has three parts:

**lib/phantom-server.js** A small PhantomJS script for fetching the page and returning the response along with the response headers in serialized form. It can be executed via:

<code>phantomjs lib/phantom-server.js http://moviepilot.com/stories</code>

**lib/seoserver.js** A node express app responsible for accepting the requests from Googlebot, checking if there is a cached version on memcached, otherwise fetching the page via `phantom-server.js`. 

You can start it locally with:

<code>node lib/seoserver.js start</code>

And test its output with:

<code>curl -v http://localhost:10300</code>

**bin/seoserver** Forever-monitor script, for launching and monitoring the node main process.

<code>bin/seoserver start -p 10300</code>

### Credits

This code is based on a [tutorial by Thomas Davis](http://backbonetutorials.com/seo-for-single-page-apps/) and on https://github.com/apiengine/seoserver


