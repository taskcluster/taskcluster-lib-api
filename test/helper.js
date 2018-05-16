var testing         = require('taskcluster-lib-testing');
var validate        = require('taskcluster-lib-validate');
var assert          = require('assert');
var path            = require('path');
var express         = require('express');
var urls            = require('taskcluster-lib-urls');

var runningServer = null;

/**
 * Set up a testing server on port 23525 serving the given API.  If monitor is
 * specified, it is added to the router.
 */
exports.setupServer = async ({api, monitor}) => {
  const rootUrl = 'http://localhost:4321';
  testing.fakeauth.start([], {rootUrl});
  assert(runningServer === null);

  let validator = await validate({
    rootUrl,
    serviceName: 'test',
    folder: path.join(__dirname, 'schemas'),
  });

  const svc = await api.setup({
    rootUrl,
    validator,
    monitor,
  });
  const router = svc.router();

  // Create application
  let app = express();
  app.use(router);

  return await new Promise(function(accept, reject) {
    var server = app.listen(23525);
    server.once('listening', function() {
      runningServer = server;
      accept(server);
    });
    server.once('error', reject);
  });
};

exports.teardownServer = async () => {
  if (runningServer) {
    await new Promise(function(accept) {
      runningServer.once('close', function() {
        runningServer = null;
        accept();
      });
      runningServer.close();
    });
  }
  testing.fakeauth.stop();
};
