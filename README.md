  <h3>Welcome!</h3>
  <p>Seo Server is a command line tool that runs a server that allows GoogleBot(and any other crawlers) to crawl your heavily Javascript built websites. The tool works with very little changes to your server or client side code.</p>
  <p><i>This entire site is driven by Javascript(view the source or see the <a href="https://github.com/apiengine/seoserver-site">code</a>). Click the `What does Google see?` button at the bottom of each page to see Seo Server in action.</i></p>

  <h3>How it works</h3>
  <img src="http://yuml.me/5b1b60bb" /><br /><br />
  <p>Seo Server runs <a href="http://phantomjs.org/">PhantomJs</a>(headless webkit browser) which renders the page fully and returns the fully executed code to GoogleBot.</p>

  <h3>Getting started</h3>
  <p>1) Install npm dependencies</p>
  <code>sudo npm install -g seoserver</code>
  <p>2) For local testing then:</p>
  <code>node lib/seoserver.js 10300 localhost 11211</code>
  <p>Which starts an Express server on port 10300 with memcached
localhost:1211 or in production environment:</p>
  <code>bin/seoserver.js start -p 10300</code>

  <h3>Telling GoogleBot to fetch from Seo Server</h3>
  <code>httpie get http://moviepilot.com/stories/841678-mp-exclusive-scott-z-burns-gives-us-his-take-on-dawn-of-the-planet-of-the-apes plan==titanium User-Agent:Googlebot --verbose

