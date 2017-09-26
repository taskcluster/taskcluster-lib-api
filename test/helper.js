import testing from 'taskcluster-lib-testing';
import validate from 'taskcluster-lib-validate';
import assert from 'assert';
import path from 'path';
import express from 'express';

var runningServer = null;

/**
 * Set up a testing server on port 23525 serving the given API.  If mointor is
 * specified, it is added to the router.
 */
export const setupServer = async ({api, monitor}) => {
  testing.fakeauth.start();
  assert(runningServer === null);

  let validator = await validate({
    folder: path.join(__dirname, 'schemas'),
    baseUrl: 'http://localhost:4321/',
  });

  let router = api.router({
    authBaseUrl: 'http://localhost:23243',
    validator,
    monitor,
  });

  // Create application
  let app = express();
  app.use(router);

  return await new Promise(function(accept, reject) {
    var server = app.listen(23525);
    server.once('listening', function() {
      runningServer = server;
      accept(server)
    });
    server.once('error', reject);
  });
};

export const teardownServer = async () => {
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
