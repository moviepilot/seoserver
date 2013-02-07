### Welcome!
Seo Server is a command line tool that runs a server that allows GoogleBot(and any other crawlers) to crawl your heavily Javascript built websites. The tool works with very little changes to your server or client side code.


### How it works
<img src="http://yuml.me/5b1b60bb" />

Seo Server runs <a href="http://phantomjs.org/">PhantomJs</a>(headless webkit browser) which renders the page fully and returns the fully executed code to GoogleBot.

### Getting started
* Install npm dependencies <br/>
<code>sudo npm install -g seoserver</code>
* In local env: <code>node lib/seoserver.js 10300 localhost 11211</code> which starts an Express server on port 10300 with memcached
localhost:11211
* In production environment:
<code>bin/seoserver start -p 10300</code>


### Internals
The code has several parts:

**lib/phantom-server.js** A small js file loaded into PhantomJS, for fetching the webpage, and returning the response along with the headers in serialized form. Can be executed via:

<code>phantomjs lib/phantom-server.js http://moviepilot.com/stories</code>

**lib/seoserver.js** An express node server, accepting the bot's requests, poking memcached to check for already stored version, otherwise calling phantom-server to fetch the content and serving it back to the bot.

**bin/seoserver** Forever-monitor script, for launching and monitoring the main process.
