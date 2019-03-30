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

function sendMessage(ws, username, key, msg) {
    var obj = {}
    obj[USERNAME] = username
    obj[key] = msg
    ws.send(JSON.stringify(obj))
}

function sendMessageAllSubs(ws, topic, key, msg) {
    if (!window.topicMap.has(topic)) throw "Topic does not exist"
    var users = window.topicMap.get(topic)
    // iterate through all subs and send them the message
    users.foreach(function(user) {        
        sendMessage(ws, user, key, msg)
    })
}

function sendError(ws, username, topic, msg) {
    let o = {}
    o[USERNAME] = username
    o[ERROR] = topic
    o[ERROR_MESSAGE] = msg
    console.log(wss)
    ws.send(JSON.stringify(o))
}

function serversubscribe(ws, username, topic) {
    let obj = {
            USERNAME: username,
            WEBSOCKET: ws
    }
    if (window.topicMap.has(topic)) {
        window.topicMap.get(topic).push(obj) // add the user to subscribe set
    } else {
        window.topicMap.set(topic, [obj]) // if nothing there before create new list
    }
}

function serverunsubscribe(ws, username, topic) {
    if (!window.topicMap.has(topic)) {
        sendError(wss, username, UNSUBSCRIBE, "Cant unsubscribe. Topic " + topic + " doesnt exist.")
    }
    else if (!window.topicMap.get(topic).has(username)) {
        sendError(ws, username, UNSUBSCRIBE, "Cant unsubscribe. User isnt subscribed to " + topic)
    }
    else {
        window.topicMap.get(topic).delete(username)
    }
}



function serverpublish(ws, username, topic, publishTxt) {
    if (!window.topicMap.has(topic)) {
        sendError(ws, username, PUBLISH, "Topic " + topic + " does not exist")
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
    var users = window.topicMap.get(topic)
    for (var i = 0; i < users.length; i++) {
        console.log("YAY: " + users[i][USERNAME])
        obj[USERNAME] = users[i][USERNAME]
        console.log(users[i])
        users[i][WEBSOCKET].send(JSON.stringify(obj))
    }
}

function createServer(socketIp, listenPort) {
    console.log("Starting server")
    window["topicMap"] = new Map() 
    console.log(window.topicMap)
    wss = new WebSocket.Server({
        host: socketIp,
        port: listenPort,
        clientTracking: true
    })
    wss.on('connection', function(ws) {
        console.log(window)
        console.log("Got connection")
        ws.on('message', function(data) {
            console.log(window)
            // try catch to make sure that parsing the object is good
            try {
                const receiveObject = JSON.parse(data)
                if (!(USERNAME in  receiveObject)) {
                    throw "Could not find username for the server"
                }
                if (SUBSCRIBE in receiveObject) {
                    serversubscribe(ws, receiveObject[USERNAME], receiveObject[SUBSCRIBE])
                }
                if (UNSUBSCRIBE in receiveObject) {
                    serverunsubscribe(ws, receiveObject[USERNAME], receiveObject[UNSUBSCRIBE])
                }
                if (PUBLISH in receiveObject) {
                    serverpublish(ws, receiveObject[USERNAME], receiveObject[PUBLISH], receiveObject[PUBLISH_MESSAGE])
                }
            }
            catch (e) {
                throw e // throw or ignore the request cause object was invalid
            }
        })
    })

}

// client side functions

function connect(username, address, socketPort) {
    let obj = {}
    obj._ws = new WebSocket("ws://" + address + ":" + socketPort) 
    obj._username = username
    obj._callbackMap = new Map()
    obj._errorHandler = undefined
    obj._ws.on('open', function(data) {
        console.log("Opened connection")
    })
    obj._ws.on('message', function(data) {
        var obj = {}
        try {
            obj = JSON.parse(data) 
        } catch (e) {
            console.err("Malformatted object received")
            throw e
        }

        if (ERROR in obj) {
            // call the error handler if there is one
            if (obj._errorHandler === undefined) {
                throw obj[ERROR] + ": " + obj[ERROR_MESSAGE] // throw the error message
            }
            else {
                obj._errorHandler(obj[ERROR] + ": " + obj[ERROR_MESSAGE]) // call the error handler
            }
        }
        if (PUBLISH in obj) {
            if (!obj._callbackMap.has(obj[PUBLISH])) throw "Cannot find topic that was subscribed to"
            else {
                var func = obj._callbackMap.get(obj[PUBLISH])
                var messageObj = {}
                try {
                    messageObj = JSON.parse(obj[PUBLISH_MESSAGE])
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
