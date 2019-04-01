var WebSocket = require('ws')
var hash = require('object-hash')

const USERNAME = 'username'
const ERROR = 'error'
const SUBSCRIBE = 'subscribe'
const UNSUBSCRIBE = 'unsubscribe'
const PUBLISH = 'publish'
const PUBLISH_MESSAGE = 'publish_message'
const ERROR_MESSAGE = 'error_message'
const WEBSOCKET = 'ws'
const TOPIC = 'topic'
const REQUEST = 'request'
const GETSUBCOUNT = 'getsubcount'
const GETTOPICLIST = 'gettopiclist'
const GETSUBSCRIPTIONSLIST = 'getsublist'
const SUBSCRIPTIONLIST = 'sublist'
const TOPICLIST = 'topiclist'
const SUBCOUNT = 'subcount'
const REQUEST_ID = 'req_id' // an id to signify a request from client to server. Added to object when need to request info from server or another client

const SENDALLTOPICSINTREE = 'sendalltree' // a true or false attribute that tells it whether it should recurse down the tree

const WAIT_TIME_SIZE = 1
const MAX_WAIT_TRIES = 10

function sendMessage(username, key, msg) {
    var obj = {}
    obj[USERNAME] = username
    obj[key] = msg
    this.send(JSON.stringify(obj))
}

function sendMessageAllSubs(ws, topic, key, msg) {
    if (!this._topicMap.has(topic)) throw "Topic does not exist"
    var users = this.topicMap.get(topic)
    // iterate through all subs and send them the message
    users.foreach(function(user) {        
        user[WEBSOCKET].sendMessage(user[USERNAME], key, msg)
    })
}

function sendError(username, topic, msg) {
    let o = {}
    o[REQUEST] = ERROR
    o[USERNAME] = username
    o[TOPIC] = topic
    o[ERROR_MESSAGE] = msg
    this.send(JSON.stringify(o))
}

function addSub(topic) {
    this.subscriptions.add(topic)
}

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
        port: listenPort,
        clientTracking: true
    })
    
    var server = {}
    server._topicMap = new Map() // map in a map. Second map is username mapped to other info
    server._topicInheritMap = new Map() // shows the tree of topics. each topic mapped to a list of topics showing its children
    server._connectedUsersMap = new Map() // all users connected mapped to their ws
    server._wss = wss
    server._serversubscribe = serversubscribe
    server._serverunsubscribe = serverunsubscribe
    server._serverpublish = serverpublish
    server._servergetsubcount = servergetsubcount
    server._servergettopiclist = servergettopiclist
    server._servergetsubscriptionlist = servergetsubscriptionlist
    wss.on('connection', function(ws) {
        // add functions to ws for convinience
        ws.sendError = sendError
        ws.sendMessage = sendMessage
        ws.addSub = addSub
        ws.removeSub = removeSub
        // check if connection stays 
        ws.subscriptions = new Set() // set of subscription names
        ws.on('message', function(data) {
            // try catch to make sure that parsing the object is good
            try {
                const receiveObject = JSON.parse(data)
                if (!(USERNAME in receiveObject)) {
                    throw "Could not find username for the server"
                }
                server._connectedUsersMap.set(receiveObject[USERNAME], ws)
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
                    case GETSUBCOUNT:
                        server._servergetsubcount(ws, receiveObject[USERNAME], receiveObject[TOPIC], receiveObject[REQUEST_ID])
                        break
                    case GETTOPICLIST:
                        server._servergettopiclist(ws, receiveObject)
                        break
                    case GETSUBSCRIPTIONSLIST:
                        server._servergetsubscriptionlist(ws, receiveObject)
                    }
            }
            catch (e) {
                throw e // throw or ignore the request cause object was invalid
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
    obj._errorHandler = undefined
    obj._ws.on('open', function(data) {
        // do open stuff here
    })
    obj._ws.on('message', function(data) {
        var tmp = {}
        try {
            tmp = JSON.parse(data) 
        } catch (e) {
            throw e
        }
        if (ERROR === tmp[REQUEST]) {
            // call the error handler if there is one
            if (obj._errorHandler === undefined) {
                throw tmp[TOPIC] + ": " + tmp[ERROR_MESSAGE] // throw the error message
            }
            else {
                obj._errorHandler(tmp[TOPIC] + ": " + tmp[ERROR_MESSAGE]) // call the error handler
            }
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
    obj.setErrorHandler = setErrorHandler
    obj.getSubCount = getSubscriberCount
    obj.getTopicList = getTopicList
    obj.getSubscriptionsList = getSubscriptionsList
    return obj
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(noop, ms))
}

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
 *      @onReceiveSubCount - A function with a three arguments: usernam, topic, and subcount of that topic 
 *      @returns - nothing
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


/**
 *  setErrorHandler
 *      @handler - A function with a single argument, err, that is called with a message when an error occurs
 *      @returns - nothing
 *
*/
function setErrorHandler(handler) {
    this._errorHandler = handler // when error occurs function will be called with error as parameter
}


module.exports.createServer = createServer
module.exports.connect = connect
