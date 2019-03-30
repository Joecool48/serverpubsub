var ServerPubSub = require("ServerPubSub")
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function execute() {
    var usr = ServerPubSub.connect("joey", "127.0.1.1", 8080)
    var usr2 = ServerPubSub.connect("joey2", "127.0.1.1", 8080)
    var usr3 = ServerPubSub.connect("joey3", "127.0.1.1", 8080)
    await sleep(2000);

    usr.subscribe("My Topic", function(msg) {console.log(msg)})
    usr2.subscribe("My Topic", function(msg) {console.log(msg)})
    usr3.publish("My Topic", "Hello joey!")
}



execute()
