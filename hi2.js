var ServerPubSub = require("ServerPubSub")

var usr = ServerPubSub.connect("joey", "127.0.1.1", 8080)

usr.subscribe("My Topic", function(msg) {console.log(msg)})
