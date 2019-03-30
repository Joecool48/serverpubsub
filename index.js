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

var window = {}

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
    o[USERNAME] = username
    o[ERROR] = topic
    o[ERROR_MESSAGE] = msg
    this.send(JSON.stringify(o))
}

function serversubscribe(ws, username, topic) {
    let obj = {}
    obj[USERNAME] = username
    obj[WEBSOCKET] = ws
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
    }
}



function serverpublish(ws, username, topic, publishTxt) {
    if (!this._topicMap.has(topic)) {
        ws.sendError(username, PUBLISH, "Topic " + topic + " does not exist")
        return
    }
    var obj = {}
    obj[PUBLISH] = topic
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
        // check if connection stays 
        ws.isAlive = true
        ws.on('pong', heartbeat)
        ws.on('message', function(data) {
            // try catch to make sure that parsing the object is good
            try {
                const receiveObject = JSON.parse(data)
                if (!(USERNAME in  receiveObject)) {
                    throw "Could not find username for the server"
                }
                if (SUBSCRIBE in receiveObject) {
                    server._serversubscribe(ws, receiveObject[USERNAME], receiveObject[SUBSCRIBE])
                }
                if (UNSUBSCRIBE in receiveObject) {
                    server._serverunsubscribe(ws, receiveObject[USERNAME], receiveObject[UNSUBSCRIBE])
                }
                if (PUBLISH in receiveObject) {
                    server._serverpublish(ws, receiveObject[USERNAME], receiveObject[PUBLISH], receiveObject[PUBLISH_MESSAGE])
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

        if (ERROR in tmp) {
            // call the error handler if there is one
            if (obj._errorHandler === undefined) {
                throw tmp[ERROR] + ": " + tmp[ERROR_MESSAGE] // throw the error message
            }
            else {
                obj._errorHandler(tmp[ERROR] + ": " + tmp[ERROR_MESSAGE]) // call the error handler
            }
        }
        if (PUBLISH in tmp) {
            if (!obj._callbackMap.has(tmp[PUBLISH])) throw "Cannot find topic that was subscribed to"
            else {
                var func = obj._callbackMap.get(tmp[PUBLISH])
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
    })
    obj.subscribe = subscribe
    obj.unsubscribe = unsubscribe
    obj.publish = publish
    obj.setErrorHandler = setErrorHandler
    return obj
}

// onMessagePublished takes in a message and is called when it receives a message to the topic it subscribed to. 
function subscribe(topic, onMessagePublished) {
    console.log("Subscribing")
    var obj = {}
    obj[USERNAME] = this._username
    obj[SUBSCRIBE] = topic
    this._callbackMap.set(topic, onMessagePublished)
    this._ws.send(JSON.stringify(obj))
}

function unsubscribe(topic) {
    console.log("Unsubscribing")
    var obj = {}
    obj[USERNAME] = this._username
    obj[UNSUBSCRIBE] = topic
    if (this._callbackMap.has(topic)) {
        this._callbackMap.delete(topic)
    }
    this._ws.send(JSON.stringify(obj))
}

function publish(topic, message) {
    console.log("Publishing")
    var obj = {}
    obj[USERNAME] = this._username
    obj[PUBLISH] = topic
    if (typeof message === 'object') {
        obj[PUBLISH_MESSAGE] = JSON.stringify(message)
    } else {
        obj[PUBLISH_MESSAGE] = message
    }
    this._ws.send(JSON.stringify(obj))
}

function setErrorHandler(handler) {
    this._errorHandler = handler // when error occurs function will be called with error as parameter
}


module.exports.createServer = createServer
module.exports.connect = connect
