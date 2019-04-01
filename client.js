var ServerPubSub = require("ServerPubSub")
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function execute() {
    var usr = ServerPubSub.connect("joey", "127.0.1.1", 8080)
    var usr2 = ServerPubSub.connect("joey2", "127.0.1.1", 8080)
    await sleep(500);

    usr.subscribe("My Topic", function(msg) {console.log(msg)})
    usr.subscribe("My second topic", function(msg) {console.log(msg)})
    usr2.subscribe("My Topic", function(msg) {console.log(msg)})
    usr.unsubscribe("My Topic")
    usr2.publish("My Topic", "Hello joey!")
    usr2.publish("My second topic", {"rand":"obj"})
    console.log(await usr2.getTopicList())
    console.log(await usr.getSubCount("My Topic"))
    console.log(await usr.getSubscriptionsList())
    console.log("DONE")
}



execute()
