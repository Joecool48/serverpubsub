var ServerPubSub = require("ServerPubSub")
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function execute() {
    var usr = ServerPubSub.connect("joey", "127.0.1.1", 8080)
    var usr2 = ServerPubSub.connect("joey2", "127.0.1.1", 8080)
    await sleep(2000);

    usr.subscribe("My Topic", function(msg) {console.log(msg)})
    usr2.publish("My Topic", "Hello joey!")
    usr2.getSubCount("My Topic", function(username, topic, count) {console.log(topic + " has " + count + " subs")})
    usr.unsubscribe("My Topic")
//    usr2.publish("My Topic", "Shouldnt get this message")
}



execute()
