var WebSocket = require('ws')
var http = require('http')

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
    let obj = {}
    obj[USERNAME] = username
    obj[WEBSOCKET] = ws
    ws.addSub(topic) 
    if (this._topicMap.has(topic)) {
        this._topicMap.get(topic).push(obj) // add the user to subscribe set
    } else {
        this._topicMap.set(topic, [obj]) // if nothing there before create new list
    }
}

function serverunsubscribe(ws, username, topic) {
    if (!this._topicMap.has(topic)) {
        ws.sendError(username, UNSUBSCRIBE, "Cant unsubscribe. Topic " + topic + " doesnt exist.")
    }
    else if (!this.topicMap.get(topic).has(username)) {
        ws.sendError(username, UNSUBSCRIBE, "Cant unsubscribe. User isnt subscribed to " + topic)
    }
    else {
        this._topicMap.get(topic).delete(username)
        ws.removeSub(topic)
    }
}



function serverpublish(ws, username, topic, publishTxt) {
    if (!this._topicMap.has(topic)) {
        ws.sendError(username, PUBLISH, "Topic " + topic + " does not exist")
        return
    }
    var obj = {}
    obj[REQUEST] = PUBLISH
    obj[TOPIC] = topic
    console.log(publishTxt)
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
    var users = this._topicMap.get(topic)
    for (var i = 0; i < users.length; i++) {
        console.log("send to: " + users[i][USERNAME])
        obj[USERNAME] = users[i][USERNAME]
        users[i][WEBSOCKET].send(JSON.stringify(obj))
    }
}

function noop(){}

function heartbeat() {
    this.isAlive = true
}

function heartbeatStart() {
    const interval = setInterval(function ping() {
        wss.clients.forEach(function each(ws) {
            if (ws.isAlive === false) return ws.terminate()
            ws.isAlive = false
            ws.ping(noop) // resend ping
        })
    }, 30000)
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
    console.log("Starting server")
    wss = new WebSocket.Server({
        host: socketIp,
        port: listenPort,
        clientTracking: true
    })
    
    var server = {}
    server["_topicMap"] = new Map()
    server["_wss"] = wss
    server._serversubscribe = serversubscribe
    server._serverunsubscribe = serverunsubscribe
    server._serverpublish = serverpublish
    
    wss.on('connection', function(ws) {
        // add functions to ws for convinience
        ws.sendError = sendError
        ws.sendMessage = sendMessage
        ws.addSub = addSub
        ws.removeSub = removeSub
        // check if connection stays 
        ws.isAlive = true
        ws.subscriptions = new Set() // set of subscription names
        ws.on('pong', heartbeat)
        ws.on('message', function(data) {
            console.log("Got: " + data)
            // try catch to make sure that parsing the object is good
            try {
                const receiveObject = JSON.parse(data)
                if (!(USERNAME in  receiveObject)) {
                    throw "Could not find username for the server"
                }
                if (SUBSCRIBE === receiveObject[REQUEST]) {
                    server._serversubscribe(ws, receiveObject[USERNAME], receiveObject[TOPIC])
                }
                if (UNSUBSCRIBE === receiveObject[REQUEST]) {
                    server._serverunsubscribe(ws, receiveObject[USERNAME], receiveObject[TOPIC])
                }
                if (PUBLISH === receiveObject[REQUEST]) {
                    server._serverpublish(ws, receiveObject[USERNAME], receiveObject[TOPIC], receiveObject[PUBLISH_MESSAGE])
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
    obj._errorHandler = undefined
    obj._ws.on('open', function(data) {
        // do open stuff here
    })
    obj._ws.on('message', function(data) {
        var tmp = {}
        try {
            tmp = JSON.parse(data) 
        } catch (e) {
            console.err("Malformatted object received")
            throw e
        }
        console.log(data)
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
        if (GETSUBCOUNT === tmp[REQUEST]) {
            if (obj._subcountCallback in obj) {
                obj._subcountCallback(tmp[SUBCOUNT])
            } else {
                throw "Could not locate sub count callback"
            }
        }
    })
    obj.subscribe = subscribe
    obj.unsubscribe = unsubscribe
    obj.publish = publish
    obj.setErrorHandler = setErrorHandler
    obj.getSubscriberCount = getSubscriberCount
    return obj
}

function getSubscriberCount(topic, onReceiveSubCount) {
    var obj = {}
    obj[USERNAME] = this._username
    obj[REQUEST] = GETSUBCOUNT
    obj[TOPIC] = topic
    obj._subcountCallback = onReceiveSubCount
    this._ws.send(JSON.stringify(obj))
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
    console.log("Subscribing")
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
    console.log("Unsubscribing")
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
    console.log("Publishing")
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
    console.log("Finished sending")
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
