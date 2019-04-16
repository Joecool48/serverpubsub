var WebSocket = require('ws')
var hash = require('object-hash')


// constants to describe json requests and responses
const USERNAME = 'u'
const SUBSCRIBE = 's'
const UNSUBSCRIBE = 'us'
const PUBLISH = 'p'
const PUBLISH_MESSAGE = 'pm'
const WEBSOCKET = 'ws'
const TOPIC = 't'
const REQUEST = 'r'
const GETSUBCOUNT = 'gsc'
const GETTOPICLIST = 'gtl'
const GETSUBSCRIPTIONSLIST = 'gsl'
const SUBSCRIPTIONLIST = 'sl'
const TOPICLIST = 'tl'
const SUBCOUNT = 'sc'
const REQUEST_ID = 'ri' // An id to signify a request from client to server. Added to object when need to request info from server or another client

const DISCONNECT = 'd'

const WAIT_TIME_SIZE = 1
const MAX_WAIT_TRIES = 10

const PING_TIME_INTERVAL = 10000

// Add a subscriber to this users sub set
function addSub(topic) {
    this.subscriptions.add(topic)
}

// Remove a subscriber from this users sub set
function removeSub(topic) {
    this.subscriptions.delete(topic)
}

function serversubscribe(ws, username, topic) {
    ws.addSub(topic)
    if (this._topicMap.has(topic)) {
        this._topicMap.get(topic).set(username, ws) // add the user to subscribe set
    } else {
        let m = new Map()
        m.set(username, ws)
        this._topicMap.set(topic, m) // if nothing there before create new map
    }
}

function serverunsubscribe(ws, username, topic) {
    let users = this._topicMap.get(topic)
    users.delete(username) // remove user from topic map to map
    ws.removeSub(topic)
}



function serverpublish(ws, username, topic, publishTxt) {
    var obj = {}
    obj[REQUEST] = PUBLISH
    obj[TOPIC] = topic
    if (typeof publishTxt === 'object') {
        try {
            obj[PUBLISH_MESSAGE] = JSON.stringify(publishTxt)
        }
        catch (e) {
            throw e
        }
    }
    else {
        obj[PUBLISH_MESSAGE] = publishTxt
    }
    // iterate over all users in the topic
    var users = this._topicMap.get(topic)
    let mapIter = users.entries()
    let res = mapIter.next()
    while(!res.done) {
        obj[USERNAME] = res.value[0] // get the key
        res.value[1].send(JSON.stringify(obj)) // get the websocket and send
        res = mapIter.next()
    }
}

function servergetsubcount(ws, username, topic, request_id) {
    let obj = {}
    obj[USERNAME] = username
    obj[REQUEST] = GETSUBCOUNT
    obj[TOPIC] = topic
    let subcount = this._topicMap.get(topic).size
    obj[SUBCOUNT] = subcount
    obj[REQUEST_ID] = request_id
    ws.send(JSON.stringify(obj))
}

// Function that takes in a map or set, and returns an array of its keys
function getKeys(map) {
    let keys = new Array(map.size)
    let i = 0
    let mapIter = map.keys()
    while(i < map.size) {
        keys[i] = mapIter.next().value
        i += 1
    }
    return keys
}

function servergettopiclist(ws, receiveObj) {
    let obj = {}
    obj[USERNAME] = receiveObj[USERNAME]
    obj[REQUEST] = GETTOPICLIST
    obj[REQUEST_ID] = receiveObj[REQUEST_ID]
    obj[TOPICLIST] = getKeys(this._topicMap)
    ws.send(JSON.stringify(obj))
}

function servergetsubscriptionlist(ws, receiveObj) {
    let obj = {}
    obj[USERNAME] = receiveObj[USERNAME]
    obj[REQUEST] = GETSUBSCRIPTIONSLIST
    obj[REQUEST_ID] = receiveObj[REQUEST_ID]
    obj[SUBSCRIPTIONLIST] = getKeys(ws.subscriptions) // get all the subs for this user
    ws.send(JSON.stringify(obj))
}

function serverDisconnect(ws, username) {
    this._connectedUsersMap.delete(username)
    // iterate through all the users subscriptions, and remove them from each one
    for (key of getKeys(ws.subscriptions)) {
        this._topicMap.get(key).delete(username)
        // if there are no other users subscribed, then delete the topic
        if (this._topicMap.get(key).size === 0) {
            this._topicMap.delete(key)
        }
    }
    ws.close()
}

/*
 *  createServer
 *      @this - nothing
 *      @socketIp - IP address you want the server to host the socket on
 *      @listenPort - An active port clients can connect on
 *      @returns - A server object used to control the server at any point in time
 *
*/
function createServer(socketIp, listenPort) {
    wss = new WebSocket.Server({
        host: socketIp,
        port: listenPort
    })

    var server = {}
    server._topicMap = new Map() // map in a map. Second map is username mapped to other info
    server._connectedUsersMap = new Map() // all users connected mapped to their ws
    server._wss = wss
    server._serversubscribe = serversubscribe
    server._serverunsubscribe = serverunsubscribe
    server._serverpublish = serverpublish
    server._servergetsubcount = servergetsubcount
    server._servergettopiclist = servergettopiclist
    server._servergetsubscriptionlist = servergetsubscriptionlist
    server._disconnect = serverDisconnect

    server._checkUsersInterval = setInterval(function ping() {
        // Go through all the connected clients
        for (key of getKeys(server._connectedUsersMap)) {
            let sock = server._connectedUsersMap.get(key)
            if (sock.isAlive === false && USERNAME in sock) {
                server._disconnect(sock, key) // remove it
            }
            sock.isAlive = false
            sock.ping(noop)
        }
    }, PING_TIME_INTERVAL)
    // setup pinging on server side
    function noop() {}
    function heartbeat() {
        this.isAlive = true
    }
    wss.on('close', function() {
        clearInterval(server._checkUsersinterval)
    })
    wss.on('connection', function(ws) {
        ws.isAlive = true
        ws.on('pong', heartbeat) // listen for pong event (client responsee)

        // add functions to ws for convinience
        ws.addSub = addSub
        ws.removeSub = removeSub
        ws.subscriptions = new Set() // set of subscription names
        ws.on('message', function(data) {
            const receiveObject = JSON.parse(data)
            if (!(USERNAME in receiveObject)) {
                throw "Could not find username for the server"
            }
            ws[USERNAME] = receiveObject[USERNAME]
            server._connectedUsersMap.set(receiveObject[USERNAME], ws)
            // check all the different types of request
            switch (receiveObject[REQUEST]) {
                case SUBSCRIBE:
                    server._serversubscribe(ws, receiveObject[USERNAME], receiveObject[TOPIC])
                    break
                case UNSUBSCRIBE:
                    server._serverunsubscribe (ws, receiveObject[USERNAME], receiveObject[TOPIC])
                    break
                case PUBLISH:
                    server._serverpublish(ws, receiveObject[USERNAME], receiveObject[TOPIC], receiveObject[PUBLISH_MESSAGE])
                    break
                case DISCONNECT:
                    server._disconnect(ws, receiveObject[USERNAME])
                    break
                case GETSUBCOUNT:
                    server._servergetsubcount(ws, receiveObject[USERNAME], receiveObject[TOPIC], receiveObject[REQUEST_ID])
                    break
                case GETTOPICLIST:
                    server._servergettopiclist(ws, receiveObject)
                    break
                case GETSUBSCRIPTIONSLIST:
                    server._servergetsubscriptionlist(ws, receiveObject)
                    break
              }
        })
    })
    return server
}

// client side functions


/**
 *  connect
 *      @this - nothing
 *      @username - A unique username that will be used to identify a possibly subscriber or publisher
 *      @address - IP address of the host in standard format ex. "192.168.0.5"
 *      @socketPort - A port number that the server is listening on
 *      @returns - A object used to call the other functions for this user to subscribe, publish, etc
 *
*/
function connect(username, address, socketPort) {
    let obj = {}
    obj._ws = new WebSocket("ws://" + address + ":" + socketPort)
    obj._username = username
    obj._callbackMap = new Map()
    obj._requestMap = new Map() // maps each request id to the object gotten back
    obj.disconnect = disconnect
    obj._ws.on('close', function(code, reason) {
        // if not already closed, then close
        if (disconnect in obj)
            obj.disconnect()  // remove everything from object and let it be collected
    })
    obj._ws.on('message', function(data) {
        var tmp = {}
        try {
            tmp = JSON.parse(data)
        } catch (e) {
            throw e
        }
        if (PUBLISH === tmp[REQUEST]) {
            if (!obj._callbackMap.has(tmp[TOPIC])) throw "Cannot find topic that was subscribed to"
            else {
                var func = obj._callbackMap.get(tmp[TOPIC])
                var messageObj = {}
                try {
                    if (typeof(tmp[PUBLISH_MESSAGE]) === 'object') {
                        messageObj = JSON.parse(tmp[PUBLISH_MESSAGE])
                    }
                    else {
                        messageObj = tmp[PUBLISH_MESSAGE]
                    }
                } catch (e) {
                    throw e
                }
                func(messageObj)
            }
        }
        if (REQUEST_ID in tmp) {
            // map the request id to the object in the map
            obj._requestMap.set(tmp[REQUEST_ID], tmp)
        }
    })
    obj.subscribe = subscribe
    obj.unsubscribe = unsubscribe
    obj.publish = publish
    obj.getSubCount = getSubscriberCount
    obj.getTopicList = getTopicList
    obj.getSubscriptionsList = getSubscriptionsList

    obj._freeClient = freeClient

    return obj
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(noop, ms))
}

// function that blocks until the req_id is in the requestMap
// used for synchronous server request functions (bad practice, but should allow the option)
async function block_until_response(requestMap, req_id) {
    let num_tries = 0
    do {
        await new Promise(r => setTimeout(r, WAIT_TIME_SIZE)) // wait for WAIT_TIME_SIZE amount of seconds
        num_tries++
        if (num_tries > MAX_WAIT_TRIES) {
            throw "Server request timed out"
        }
    } while(!requestMap.has(req_id))
}

/**
 *  getSubscriberCount
 *      @this - A user object given by connect
 *      @topic - The topic it should fetch the sub count from
 *      @returns - A number that is all the subscribers for that specific topic
 *
*/
async function getSubscriberCount(topic) {
    var obj = {}
    obj[USERNAME] = this._username
    obj[REQUEST] = GETSUBCOUNT
    obj[TOPIC] = topic
    let obj_hash = hash(obj)

    obj[REQUEST_ID] = obj_hash
    this._ws.send(JSON.stringify(obj))
    await block_until_response(this._requestMap, obj_hash) // wait till the client receives the server response
    let ret_val = this._requestMap.get(obj_hash) // get object at the request hash location
    this._requestMap.delete(obj_hash) // remove the object to free up space
    return ret_val[SUBCOUNT]
}


/**
 *  getTopicList
 *      @this - A user object given by connect
 *      @returns - A list of all the topics that anyone is subscribed too.
 */
async function getTopicList() {
    var obj = {}
    obj[USERNAME] = this._username
    obj[REQUEST] = GETTOPICLIST
    let obj_hash = hash(obj)

    obj[REQUEST_ID] = obj_hash
    this._ws.send(JSON.stringify(obj))
    await block_until_response(this._requestMap, obj_hash) // wait till client gets server response
    let ret_val = this._requestMap.get(obj_hash)
    this._requestMap.delete(obj_hash)
    return ret_val[TOPICLIST]
}

/**
 *  getSubscriptionsList
 *      @this - A user object given by connect
 *      @returns - A list of all the topics this user is subbed to
*/
async function getSubscriptionsList() {
    let obj = {}
    obj[USERNAME] = this._username
    obj[REQUEST] = GETSUBSCRIPTIONSLIST

    let obj_hash = hash(obj)
    obj[REQUEST_ID] = obj_hash

    this._ws.send(JSON.stringify(obj))
    await block_until_response(this._requestMap, obj_hash) // wait till server gets data
    let ret_val = this._requestMap.get(obj_hash)
    this._requestMap.delete(obj_hash)
    return ret_val[SUBSCRIPTIONLIST]

}

/**
 *  subscribe
 *      @this - A user object given by connect
 *      @topic - The topic this user should subscribe to
 *      @onMessagePublished - A callback function that is called anytime anything is published to this topic. The function takes an arg that specifies the message, topic, and user it came from
 *      @returns - nothing
 *
*/
function subscribe(topic, onMessagePublished) {
    var obj = {}
    obj[REQUEST] = SUBSCRIBE
    obj[USERNAME] = this._username
    obj[TOPIC] = topic
    this._callbackMap.set(topic, onMessagePublished)
    this._ws.send(JSON.stringify(obj))
}


/**
 *  unsubscribe
 *      @this - A user object given by connect
 *      @topic - Unsubscribe the current user from this topic
 *      @returns - nothing
*/
function unsubscribe(topic) {
    var obj = {}
    obj[REQUEST] = UNSUBSCRIBE
    obj[USERNAME] = this._username
    obj[TOPIC] = topic
    if (this._callbackMap.has(topic)) {
        this._callbackMap.delete(topic)
    }
    this._ws.send(JSON.stringify(obj))
}


/**
 *  publish
 *      @this - A user object given by connect
 *      @topic - The topic you want to publish to
 *      @message - The message you want to send. Can be either a string or object
 *      @returns - nothing
*/
function publish(topic, message) {
    var obj = {}
    obj[REQUEST] = PUBLISH
    obj[USERNAME] = this._username
    obj[TOPIC] = topic
    if (typeof message === 'object') {
        obj[PUBLISH_MESSAGE] = JSON.stringify(message)
    } else {
        obj[PUBLISH_MESSAGE] = message
    }
    this._ws.send(JSON.stringify(obj))
}


function freeClient() {
    for (const key of Object.keys(this)) {
        this[key] = undefined // delete the reference so the memory can be reclaimed
    }
}

/**
 *  disconnect
 *      Removes this user from the server and destroys the user object
 *      @this - A user object given by connect
 *      @returns - nothing
*/
function disconnect() {
    var obj = {}
    obj[REQUEST] = DISCONNECT
    obj[USERNAME] = this._username
    this._ws.send(JSON.stringify(obj)) // tells server to remove this user
    this._ws.close()
    this._freeClient() // free all client members
}

module.exports.createServer = createServer
module.exports.connect = connect
