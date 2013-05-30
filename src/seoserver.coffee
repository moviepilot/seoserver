express = require('express')
memcached = require('memcached')
$ = require('jquery')
_ = require('underscore')
logentries = require('node-logentries')

class SeoServer

  defaultConfig:
    host: 'http://moviepilot.com'
    defaultPort: 10300
    memcached:
      enabled: true
      defaultHost: 'localhost'
      defaultPort: 11211
      maxValue: 2097152
      connectRetries: 5
      key: 'moviepilot.com'
    logentries:
      enabled: true
      token: '25ebab68-8d2f-4382-a28c-7ed0a3cd255e'

  constructor: (config = {}) ->
    @config = _.defaults(config, @defaultConfig)
    console.log("Config: ", @config)


  start: =>
    dfd = $.Deferred()

    memcached = @initMemcached()

    memcached.fail (error) ->
      console.log(error)

    memcached.done (connection) =>
      console.log "Connected to memcached"

    memcached.always =>
      console.log("Express server started at port #{@config.defaultPort}")
      @app = express()
      @app.get(/(.*)/, @responseHandler)
      @app.listen(@config.defaultPort)
      dfd.resolve()

    dfd.promise()


  responseHandler: (request, response) =>
    @timer = 0
    @now = +new Date()
    @fetchPage(request, response).done (url, headers, content) =>
      response.status(headers.status or 500)
      response.header("Access-Control-Allow-Origin", "*")
      response.header("Access-Control-Allow-Headers", "X-Requested-With")
      if headers.location?
        response.set('Location', headers.location)
        # don't send body on redirection
        console.log "Redirecting to #{headers.location}..."
        response.send('')
      else
        console.log("Got response:", content)
        response.send(content)

  fetchPage: (request, response) ->
    dfd = $.Deferred()
    url = @config.host + request.url

    if @memcachedClient
      fetchDfd = @fetchFromMemcached(request)
    else
      fetchDfd = @fetchFromPhantom(url)

    fetchDfd.fail ->
      dfd.reject()

    fetchDfd.done (url, response, headers, content) =>
      @storeResponseInCache(request, headers, content)
      dfd.resolve(url, response, headers, content)

    dfd.promise()

  storeResponseInCache: (request, headers, content) =>
    return unless @memcachedClient
    if headers.status is 301
      content = "301 #{headers.location}"

    uri = @config.host + request.path
    key = @config.memcached.key + uri

    if headers.status >= 200 and (headers.status < 300 or headers.status in [ 301, 302 ])
      @memcachedClient.set key, content, 0, (err) ->
        console.log err



  fetchFromMemcached: (request) ->
    dfd = $.Deferred()
    url = @config.host + request.url
    uri = @config.host + request.path
    key = @config.memcached.key + uri
    clearCache = request.query.plan is 'titanium'
    @memcachedClient.get key, (error, cachedContent) =>
      if error
        return dfd.reject("memcached error: #{error}")
      if cachedContent and not clearCache
        headers = {}
        if /^301/.test(cachedContent)
          matches = cachedContent.match(/\s(.*)$/)
          response.status(301)
          headers.location = matches[1]
        dfd.resolve(url, response, headers, cachedContent)
      else
        phantomRequest = @fetchFromPhantom(url)
        phantomRequest.done dfd.resolve
        phantomRequest.fail dfd.fail
    dfd.promise()

  fetchFromPhantom: (url) ->
    dfd = $.Deferred()
    timeout = null
    headers = {}
    content = ''

    phantom = require('child_process').
      spawn('phantomjs', [__dirname + '/phantom-server.js', url])

    timeout = setTimeout ->
      phantom.kill()
    , 30000

    phantom.stdout.on 'data', (data) ->
      data = data.toString()
      if match = data.match(/({.*?})\n\n/)
        responseHeaders = JSON.parse(match[1])
        console.log "Response headers from phantom:", responseHeaders
        headers.status = responseHeaders.status if responseHeaders.status
        headers.location = responseHeaders.redirectURL if responseHeaders.status is 301
        # Strip processed headers from stream
        data = data.replace(/(.*?)\n\n/, '')
      if data.match(/^\w*error/i)
        headers.status = 503
        console.log "Phantom js error: " + data.toString()
      else
        content += data.toString()

    phantom.stderr.on 'data', (data) ->
      console.log 'stderr: ' + data

    phantom.on 'exit', (code) =>
      clearTimeout(timeout)
      if code
        console.log('Error on Phantomjs process')
        dfd.fail(code)
      else
        content = @removeScriptTags(content)
        dfd.resolve(url, headers, content)

    dfd.promise()

  initMemcached: ->
    console.log "Initializing memcached client"

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
        console.log "Got connection error #{error}"
        dfd.reject(error)
      else
        console.log "Connected to memcached."
        @memcachedClient = client
        dfd.resolve()

    dfd.promise()

  logResponse: ->
    # moved into helper
    crawler = if /RedSnapper/.test(request.headers['user-agent'])
      'Crawler'
    else
      'GoogleBot'

  removeScriptTags: (content) ->
    content.replace(/<script[\s\S]*?<\/script>/gi, '')

module.exports = SeoServer

