let API = require('taskcluster-lib-api');

var api = new API({
  title:      "Ping API",
  description: [
    "Single ping API for all tools"
  ].join('\n')
});

api.declare({
  method:   'get',
  route:    '/ping',
  name:     'ping',
  stability:  'stable',
  title:    'Ping Server',
  description: [
    'Respond without doing anything.',
    'This endpoint is used to check that the service is up.'
  ].join('\n')
}, function(req, res) {
  res.status(200).json({
    alive:    true,
    uptime:   process.uptime()
  });
});

module.exports = api;