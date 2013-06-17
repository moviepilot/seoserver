express = require('express')
memcached = require('memcached')
$ = require('jquery')
_ = require('underscore')
logentries = require('node-logentries')
querystring = require('querystring')
defaultConfig = require('./config')

class SeoServer

  constructor: (config = {}) ->
    @config = _.defaults(config, defaultConfig)
    console.log("Launching with config: ", @config)

  start: =>
    dfd = $.Deferred()

    @initLogentries() if @config.logentries.enabled

    memcached = @initMemcached()
    memcached.fail (error) ->
      console.log "Got memcached connection error: #{error}"
    memcached.done (connection) =>
      console.log "Connected to memcached."
    memcached.always =>
      @app = express()
      @app.get(/(.*)/, @responseHandler)
      @app.listen(@config.defaultPort)
      console.log("Express server started at port #{@config.defaultPort}")
      dfd.resolve()
    dfd.promise()

  initLogentries: ->
    @log = logentries.logger
      token: @config.logentries.token
    console.log("Initialized logentries logger")

  responseHandler: (request, response) =>
    @timer = 0
    now = +new Date()
    @fetchPage(request, response).done (url, headers, content) =>
      @logResponseStats(request, headers, (+new Date - now))
      response.status(headers.status or 500)
      response.header("Content-type", headers.contentType) if headers.contentType
      response.header("Access-Control-Allow-Origin", "*")
      response.header("Access-Control-Allow-Headers", "X-Requested-With")
      if headers.location?
        response.set('Location', headers.location)
        # don't send body on redirection
        response.send('')
      else
        response.send(content)

  fetchPage: (request, response) ->
    dfd = $.Deferred()
    url = @buildURL(request)

    if @memcachedClient
      fetchDfd = @fetchFromMemcached(request)
    else
      fetchDfd = @fetchFromPhantom(url)

    fetchDfd.fail -> dfd.reject()

    fetchDfd.done (url, headers, content) =>
      # we should only store non cached content here
      @storeResponseInCache(request, headers, content)
      dfd.resolve(url, headers, content)

    dfd.promise()

  storeResponseInCache: (request, headers, content) =>
    return unless @memcachedClient
    if headers.status is 301
      content = "301 #{headers.location}"

    url = @buildURL(request)
    key = @buildKey(url)

    if headers.status >= 200 and (headers.status < 300 or headers.status in [ 301, 302 ])
      @memcachedClient.set key, content, 259200, (err) ->
        console.log err if err

  buildURL: (request) ->
    params = _(request.query).pick @config.getParamWhitelist
    if _(params).isEmpty()
      @config.host + request.path
    else
      "#{@config.host}#{request.path}?#{querystring.stringify(params)}"

  buildKey: (url) ->
    "#{@config.memcached.key}:#{url}"

  fetchFromMemcached: (request) ->
    dfd = $.Deferred()

    url = @buildURL(request)
    key = @buildKey(url)

    clearCache = request.query.plan is 'titanium'
    @memcachedClient.get key, (error, cachedContent) =>
      if error
        return dfd.reject("memcached error: #{error}")
      if cachedContent and not clearCache
        headers = {}
        # We store 301's in memcached as well
        if /^301/.test(cachedContent)
          matches = cachedContent.match(/\s(.*)$/)
          headers.status = 301
          headers.location = matches[1]
        headers.memcached = true
        headers.status = 200
        dfd.resolve(url, headers, cachedContent)
      else
        phantomRequest = @fetchFromPhantom(url)
        phantomRequest.done dfd.resolve
        phantomRequest.fail dfd.fail
    dfd.promise()

  fetchFromPhantom: (url) =>
    dfd = $.Deferred()
    timeout = null
    headers = {}
    content = ''

    phantom = require('child_process').
      spawn('phantomjs', [__dirname + '/phantom-server.js', url])

    timeout = setTimeout ->
      phantom.kill()
    , 30000

    phantom.stdout.on 'data', (data) =>
      data = data.toString()
      # return in case of js error
      return if headers.status is 503
      # Match response headers
      if match = data.match(/\n--HEADERS--\n({.*?})\n--HEADERS-END--\n/)
        responseHeaders = JSON.parse(match[1])
        # console.log "Response headers from phantom:", responseHeaders
        headers.status = responseHeaders.status if responseHeaders.status
        headers.location = responseHeaders.redirectURL if responseHeaders.status is 301
        headers.contentType = responseHeaders["contentType"]
        # Strip processed headers from stream
        data = data.replace(/.*?--HEADERS-END--\n/g, '')
      if data.match(/^\w*error/i)
        headers.status = 503
        console.log "js error: " + data.toString()
        @logEntries url: url, phantomError: data.toString()
      else
        content += data.toString()

    phantom.stderr.on 'data', (data) ->
      console.log 'stderr: ' + data

    phantom.on 'exit', (code) =>
      clearTimeout(timeout)
      if code
        console.log('Error on PhantomJS process')
        dfd.fail(code)
      else
        content = @removeScriptTags(content)
        dfd.resolve(url, headers, content)

    dfd.promise()

  initMemcached: ->
    console.log "Launching memcached client"

    dfd = $.Deferred()

    unless @config.memcached.enabled
      return dfd.reject('memcached is disabled')

    memcached.config.retries = @config.memcached.connectRetries
    memcached.config.maxValue = @config.memcached.maxValue

    server = "#{@config.memcached.defaultHost}:#{@config.memcached.defaultPort}"
    client = new memcached(server)

    client.on 'failure', (details) ->
      error = "Memcached connection failure on: #{details.server}
        due to: #{details.messages.join(' ')}"
      dfd.reject(error)

    client.on 'reconnecting', (details) ->
      console.log("memcached: Total downtime caused by server
        #{details.server} : #{details.totalDownTime} ms")

    console.log("Trying to connect to memcached server #{server}")

    client.connect server, (error, connection) =>
      if error
        dfd.reject(error)
      else
        @memcachedClient = client
        dfd.resolve()

    dfd.promise()

  logResponseStats: (request, headers, time) ->
    fullURL = @buildURL(request)
    url = fullURL.replace(new RegExp("#{@config.host}"), '')
    status = if headers.memcached
      "MEMCACHED"
    else if headers.status
      headers.status
    else
      "KILLED"
    crawler = if /RedSnapper/.test(request.headers['user-agent'])
      'Crawler'
    else
      'GoogleBot'

    console.log crawler, status, "Time:", time + "ms", "|", (time / 1000).toFixed(2) + "s", url

    if status >= 400 or status is "KILLED"
      @logEntries status: status, time: time, url: fullURL

  logEntries: (payload) ->
    return unless @config.logentries.enabled
    @log.err payload

  # We chose to remove all script tags,
  # otherwise if/when google bot will start to parse js
  # it will lead to duplicate renderings of the page.
  removeScriptTags: (content) ->
    content.replace(/<script[\s\S]*?<\/script>/gi, '')

module.exports = SeoServer

# For starting via command line
args = process.argv.splice(2)
if args?[0] is 'start'
  seoserver = new SeoServer()
  seoserver.start()

