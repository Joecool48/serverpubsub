var WebSocket = require('ws')
var http = require('http')
const USERNAME = 'username'
const ERROR = 'error'
const SUBSCRIBE = 'subscribe'
const UNSUBSCRIBE = 'unsubscribe'
const PUBLISH = 'publish'
const PUBLISH_MESSAGE = 'publish_message'
const ERROR_MESSAGE = 'error_message'

function sendMessage(username, key, msg) {
    var obj = {}
    obj[USERNAME] = username
    obj[key] = msg
    wss.send(JSON.stringify(obj))
}

function sendMessageAllSubs(topic, key, msg) {
    if (!topicMap.has(topic)) throw "Topic does not exist"
    var users = topicMap.get(topic)
    // iterate through all subs and send them the message
    users.foreach(function(user) {        
        sendMessage(user, key, msg)
    })
}

function sendError(username, topic, msg) {
    var obj = {}
    obj[USERNAME] = username
    obj[ERROR] = topic
    obj[ERROR_MESSAGE] = msg
    wss.send(JSON.stringify(obj))
}

function serversubscribe(username, topic) {
    if (!topicMap.has(topic)) {
        sendError(username, SUBSCRIBE, "Cant subscribe. Topic does not exist")
    } else {
        topicMap.get(topic).push(username) // add the user to subscribe set
    }
}

function serverunsubscribe(username, topic) {
    if (!topicMap.has(topic)) {
        sendError(username, UNSUBSCRIBE, "Cant unsubscribe. Topic " + topic + " doesnt exist.")
    }
    else if (!topicMap.get(topic).has(username)) {
        sendError(username, UNSUBSCRIBE, "Cant unsubscribe. User isnt subscribed to " + topic)
    }
    else {
        topicMap.get(topic).delete(username)
    }
}



function serverpublish(username, topic, publishTxt) {
    if (!topicMap.has(topic)) {
        sendError(username, PUBLISH, "Topic " + topic + " does not exist")
        return
    }
    var obj
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
    topicMap.get(topic).foreach(function(user) {
        obj[USERNAME] = user
        wss.send(JSON.stringify(obj))
    })
}

function createServer(socketIp, listenPort) {
    topicMap = new Map() 
    var server = http.createServer(function(request, response) {
    })
    server.listen(listenPort)
    wss = new WebSocket.Server({
        server: server
    })
    wss.on('connection', function(ws, req) {
        const ip = req.connection.remoteAddress
        
        ws.on('message', function(data) {
            // try catch to make sure that parsing the object is good
            try {
                const receiveObject = JSON.parse(data)
                if (!(USERNAME in  receiveObject)) {
                    throw "Could not find username for the server"
                }
                if (SUBSCRIBE in receiveObject) {
                    serversubscribe(receiveObject[USERNAME], receiveObject[SUBSCRIBE])
                }
                if (UNSUBSCRIBE in receiveObject) {
                    serverunsubscribe(receiveObject[USERNAME], receiveObject[UNSUBSCRIBE])
                }
                if (PUBLISH in receiveObject) {
                    serverpublish(receiveObject[USERNAME], receiveObject[PUBLISH], receiveObject[PUBLISH_MESSAGE])
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
                throw obj[ERROR] // throw the error message
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
    console.log(this)
    while(this._ws.readyState != 1){}
    console.log("Subscribing")
    var obj = {}
    obj[USERNAME] = this._username
    obj[SUBSCRIBE] = topic
    this._callbackMap.set(topic, onMessagePublished)
    this._ws.send(JSON.stringify(obj))
}

function unsubscribe(topic) {
    while(this._ws != 1) {}
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
    while(this._ws != 1) {}
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
