suite('API (context)', function() {
  var validator       = require('taskcluster-lib-validate');
  var makeApp         = require('taskcluster-lib-app');
  var subject         = require('../');
  var assert          = require('assert');
  var Promise         = require('promise');
  var request         = require('superagent');
  var slugid          = require('slugid');
  var path            = require('path');

  test('Provides context', async () => {
    // Create test api
    var api = new subject({
      title:        'Test Api',
      description:  'Another test api',
    });

    api.declare({
      method:   'get',
      route:    '/context/',
      name:     'getContext',
      title:    'Test End-Point',
      description:  'Place we can call to test something',
    }, function(req, res) {
      assert(typeof this.log === 'object');
      for (let lvl of ['trace','debug','info','warn','error','fatal']) {
        assert(typeof this.log[lvl] === 'function');
        this.log[lvl]('hello from the ' + lvl + ' logging level');
      }
      res.status(200).json({myProp: this.myProp});
    });

    var value = slugid.v4();
    let validate = await validator({
      folder:         path.join(__dirname, 'schemas'),
      baseUrl:        'http://localhost:4321/',
    });
    var router = api.router({
      validator:  validate,
      context: {
        myProp: value,
      },
    });

    var app = makeApp({
      port:       60872,
      env:        'development',
      forceSSL:   false,
      trustProxy: false,
    });

    app.use('/v1', router);

    let server = await app.createServer();

    await request
      .get('http://localhost:60872/v1/context')
      .then(function(res) {
        assert(res.body.myProp === value);
      }).then(function() {
        return server.terminate();
      }, function(err) {
        return server.terminate().then(function() {
          throw err;
        });
      });
  });

  test('Context logger can be created in all supported ways', async () => {
    var api = new subject({
      title:        'Test Api no logger param',
      description:  'Another test api',
    });
    assert(typeof api._rootLogger === 'object');
    api._rootLogger.info('I was created without a name');

    api = new subject({
      title:        'Test Api',
      description:  'Another test api',
      logger:       'logger-yo',
    });
    assert(typeof api._rootLogger === 'object');
    api._rootLogger.info('I was created with a string name');

    // So we don't need to import lib-log
    var oldLogger = api._rootLogger;

    api = new subject({
      title:        'Test Api',
      description:  'Another test api',
      logger:       oldLogger,
    });
    assert(typeof api._rootLogger === 'object');
    api._rootLogger.info('I was created with a logger instance');
  });

  test('Context properties can be required', async () => {
    // Create test api
    var api = new subject({
      title:        'Test Api',
      description:  'Another test api',
      context:      ['prop1', 'prop2'],
    });

    var value = slugid.v4();
    let validate = await validator({
      folder:         path.join(__dirname, 'schemas'),
      baseUrl:        'http://localhost:4321/',
    });
    try {
      api.router({
        validator:  validate,
        context: {
          prop1: 'value1',
        },
      });
    } catch (err) {
      return; // expected error
    }
    assert(false, 'Expected an error!');
  });

  test('Context properties can provided', async () => {
    // Create test api
    var api = new subject({
      title:        'Test Api',
      description:  'Another test api',
      context:      ['prop1', 'prop2'],
    });

    var value = slugid.v4();
    let validate = await validator({
      folder:         path.join(__dirname, 'schemas'),
      baseUrl:        'http://localhost:4321/',
    });
    api.router({
      validator:  validate,
      context: {
        prop1: 'value1',
        prop2: 'value2',
      },
    });
  });
});
