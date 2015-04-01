var fs = require('fs'),
    http = require('http'),
    Slack = require('slack-node'),
    Client = require('websocket').client,
    Index = require('node-index');

var slack = new Slack("xoxb-4235797741-tz6k3z8Y1qkiSmj4CJgRGaIt"),
    client = new Client(),
    index = new Index(),
    userId = null,
    names = JSON.parse(fs.readFileSync('names.json')).names;

console.log('Indexing card names...');

for (id in names) {
  index.addDocument(id, {name: names[id]});
}

console.log('Ready for requests...');

client.on('connectFailed', function(error) {
  console.log('error connecting', error);
});

client.on('connect', function(connection) {
  connection.on('message', function(message) {
    data = JSON.parse(message.utf8Data);
    if (data.user != userId && data.type == 'message') {
      var results = index.query(data.text),
          target = data.text.toLowerCase().replace(/[^ \w]/g, ' ').replace(/ +/g, ' '),
          bestMatch = null;

      for (i in results) {
        var test = results[i].doc.name.toLowerCase().replace(/[^ \w]/g, ' ').replace(/ +/g, ' ');

        if (target.indexOf(test) >= 0 && (!bestMatch || results[i].doc.name.length > bestMatch.doc.name.length)) {
          bestMatch = results[i];
        }
      }
      if (bestMatch) {
        http.get('http://api.mtgapi.com/v2/cards?name='+bestMatch.doc.name, function(res) {
          var output = '';

          res.on('data', function (chunk) {
            output += chunk;
          });

          res.on('end', function() {
            var card = JSON.parse(output).cards[0];

            var attachments = JSON.stringify([{
              title: bestMatch.doc.name,
              title_link: 'http://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid='+card.multiverseid,
              image_url: card.images.gatherer
            }]);

            slack.api("chat.postMessage", {channel: data.channel, as_user: true, text: ' ', attachments: attachments}, function() {});
          });
        });
      }
    }
  });
});

slack.api("rtm.start", function(err, response) {
  userId = response.self.id;
  client.connect(response.url);
});
