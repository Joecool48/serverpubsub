# serverpubsub
A over the internet multiple client server publish subscribe model using websockets.

### Installing
`npm install serverpubsub`

### Example

```javascript
var serverpubsub = require('serverpubsub')

var server = createServer("192.168.0.12", 8080)

var user1 = connect("user1", "192.168.0.12", 8080) // connect as user1

// function is a callback for when data is published to the topic
user1.subscribe("my_topic", (message) => {
    // do stuff with data received 
})

var user2 = connect("user2", "192.168.0.12", 8080)
// user1 will receive both the string and the object sent
user2.publish("my_topic", "Hello my_topic!")
user2.publish("my_topic", {hello: "Hello", goodbye: "Goodbye"})

user1.unsubscribe("my_topic") // after this, user1 will no longer receive messages from my_topic

user1.disconnect() // tells the server you are done with the users
user2.disconnect()
```



