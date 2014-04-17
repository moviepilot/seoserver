### Welcome!
Seo Server is a command line tool that runs a server that allows GoogleBot (and any other crawlers) to crawl your heavily Javascript built websites. The tool works with very little changes to your server or client side code.


### Getting started
* Edit configuration file `src/config.coffee.sample` and save it as
`src/config.coffee`
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

### Nginx and Varnish configuration examples

Your webserver has to detect incoming search engine requests in order to
route them to the seoserver. A way of doing so is looking for the string "bot" 
in the User-Agent-Header, or by checking for Google's [escaped fragment](https://developers.google.com/webmasters/ajax-crawling/docs/specification). In Nginx you can check the
variable $http_user_agent and set the backend similar to this:

```nginx
location / {
  proxy_pass  http://defaultbackend;
  if ($http_user_agent ~* bot)  {
    proxy_pass  http://seoserver;
}
location ~* escaped_fragment {
  proxy_pass  http://seoserver;
}
```

If you deliver a cached version of your website with a reverse proxy
in front, you can do a similar check. A vcl example for Varnish:

```nginx
if (req.http.User-Agent ~ "bot" || req.url ~ "escaped_fragment") {
  set req.http.UA-Type = "crawler";
} else {
  set req.http.UA-Type = "regular";
}
```

### Credits

This code is based on a [tutorial by Thomas Davis](http://backbonetutorials.com/seo-for-single-page-apps/) and on https://github.com/apiengine/seoserver


