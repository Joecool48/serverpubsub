var WebSocket = require('ws')

const USERNAME = 'username'
const ERROR = 'error'
const UNSUBSCRIBE = 'unsubscribe'
const PUBLISH = 'publish'
const PUBLISH_MESSAGE = 'publish_message'
const ERROR_MESSAGE = 'error_message'

function connect(username, address, socketPort) {
    var obj
    obj._ws = new WebSocket(address, {port: socketPort})
    obj._username = username
    obj._callbackMap = new Map()
    obj._errorHandler = undefined
    obj._ws.on('message', function(data) {
        var obj
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
    var obj = {}
    obj[USERNAME] = this._username
    obj[SUBSCRIBE] = topic
    this._callbackMap.set(topic, onMessagePublished)
    this._ws.send(JSON.stringify(obj))
}

function unsubscribe(topic) {
    var obj = {}
    obj[USERNAME] = this._username
    obj[UNSUBSCRIBE] = topic
    if (this._callbackMap.has(topic)) {
        this._callbackMap.delete(topic)
    }
    this._ws.send(JSON.stringify(obj))
}

function publish(topic, message) {
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

