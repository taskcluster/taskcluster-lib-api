suite('api/auth', function() {
  var _               = require('lodash');
  var request         = require('superagent-hawk')(require('superagent'));
  var assert          = require('assert');
  var Promise         = require('promise');
  var validator       = require('taskcluster-lib-validate');
  var makeApp         = require('taskcluster-lib-app');
  var subject         = require('../');
  var express         = require('express');
  var hawk            = require('hawk');
  var slugid          = require('slugid');
  var crypto          = require('crypto');
  var testing         = require('taskcluster-lib-testing');
  var path            = require('path');

  // Reference for test api server
  var _apiServer = null;

  this.timeout(500);

  // Create test api
  var api = new subject({
    title:        'Test Api',
    description:  'Another test api',
  });

  // Create a mock authentication server
  setup(async () => {
    testing.fakeauth.start({
      'test-client': ['service:magic'],
      rockstar:    ['*'],
      nobody:      ['another-irrelevant-scope'],
      param:       ['service:myfolder/resource'],
      param2:      ['service:myfolder/resource', 'service:myfolder/other-resource'],
    });

    // Create router
    var router = api.router({
      validator:      await validator({
        folder:         path.join(__dirname, 'schemas'),
        baseUrl:        'http://localhost:4321/',
      }),
    });

    // Create application
    var app = makeApp({
      port:       23526,
      env:        'development',
      forceSSL:   false,
      trustProxy: false,
    });

    // Use router
    app.use(router);

    _apiServer = await app.createServer();
  });

  // Close server
  teardown(async () => {
    testing.fakeauth.stop();
    await _apiServer.terminate();
  });

  const testEndpoint = ({method, route, scopes = null, handler, tests}) => {
    api.declare({
      method,
      route,
      name: 'placeholder',
      title: 'placeholder',
      description: 'placeholder',
      scopes,
    }, handler);
    const buildUrl = (params = {}) => {
      const path = route.replace(/:[a-zA-Z][a-zA-Z0-9]+/g, match => {
        const result = params[match.replace(/^:/, '')];
        if (!result) {
          throw new Error('Bad test, must specifiy all route params!');
        }
        return result;
      });
      return `http://localhost:23526${path}`;
    };
    tests.forEach(({label, desiredStatus=200, params, tester}) => {
      const url = buildUrl(params);
      test(label, async () => {
        try {
          const res = await tester(url);
          assert.equal(res.status, desiredStatus);
        } catch (err) {
          assert.equal(err.status, desiredStatus);
        }
      });
    });
  };

  testEndpoint({
    method: 'get',
    route:  '/test-deprecated-satisfies',
    handler: (req, res) => {
      if (req.satisfies([])) {
        res.status(200).json({ok: true});
      }
    },
    tests: [
      {
        label: 'function that still uses satisfies fails',
        desiredStatus: 500,
        tester: url => request
          .get(url)
          .hawk({
            id:           'nobody',
            key:          'test-token',
            algorithm:    'sha256',
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route:  '/test-static-scope',
    scopes: {AllOf: ['service:magic']},
    handler: (req, res) => {
      res.status(200).json({ok: true});
    },
    tests: [
      {
        label: 'request with static scope',
        tester: url => request
          .get(url)
          .hawk({
            id:           'test-client',
            key:          'test-token',
            algorithm:    'sha256',
          }),
      },
      {
        label: 'request with static scope - fail no scope',
        desiredStatus: 403,
        tester: url => request
          .get(url)
          .hawk({
            id:           'nobody',
            key:          'test-token',
            algorithm:    'sha256',
          }),
      },
      {
        label: 'static-scope with authorizedScopes',
        tester: url => request
          .get(url)
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['service:magic'],
            })).toString('base64'),
          }),
      },
      {
        label: 'static-scope with authorizedScopes (star)',
        tester: url => request
          .get(url)
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['service:ma*'],
            })).toString('base64'),
          }),
      },
      {
        label: 'static-scope with authorizedScopes (too strict)',
        desiredStatus: 403,
        tester: url => request
          .get(url)
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['some-irrelevant-scope'],
            })).toString('base64'),
          }),
      },
      {
        label: 'static-scope with temporary credentials (star scope)',
        tester: url => {
          var expiry = new Date();
          expiry.setMinutes(expiry.getMinutes() + 5);

          var certificate = {
            version:          1,
            scopes:           ['service:mag*'],
            start:            new Date().getTime(),
            expiry:           expiry.getTime(),
            seed:             slugid.v4() + slugid.v4(),
            signature:        null,
          };

          var key = 'groupie';

          // Create signature
          var signature = crypto.createHmac('sha256', key)
            .update(
              [
                'version:'  + certificate.version,
                'seed:'     + certificate.seed,
                'start:'    + certificate.start,
                'expiry:'   + certificate.expiry,
                'scopes:',
              ].concat(certificate.scopes).join('\n')
            )
            .digest('base64');
          certificate.signature = signature;

          // Create temporary key
          var tempKey = crypto.createHmac('sha256', key)
            .update(certificate.seed)
            .digest('base64')
            .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
            .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
            .replace(/=/g,  '');  // Drop '==' padding

          // Send request
          return request
            .get(url)
            .hawk({
              id:           'rockstar',
              key:          tempKey,
              algorithm:    'sha256',
            }, {
              ext: new Buffer(JSON.stringify({
                certificate:  certificate,
              })).toString('base64'),
            });
        },
      },
      {
        label: 'static-scope with temporary credentials (exact scope)',
        tester: url => {
          var expiry = new Date();
          expiry.setMinutes(expiry.getMinutes() + 5);

          var certificate = {
            version:          1,
            scopes:           ['service:magic'],
            start:            new Date().getTime(),
            expiry:           expiry.getTime(),
            seed:             slugid.v4() + slugid.v4(),
            signature:        null,
          };

          var key = 'groupie';

          // Create signature
          var signature = crypto.createHmac('sha256', key)
            .update(
              [
                'version:'  + certificate.version,
                'seed:'     + certificate.seed,
                'start:'    + certificate.start,
                'expiry:'   + certificate.expiry,
                'scopes:',
              ].concat(certificate.scopes).join('\n')
            )
            .digest('base64');
          certificate.signature = signature;

          // Create temporary key
          var tempKey = crypto.createHmac('sha256', key)
            .update(certificate.seed)
            .digest('base64')
            .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
            .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
            .replace(/=/g,  '');  // Drop '==' padding

          // Send request
          return request
            .get(url)
            .hawk({
              id:           'rockstar',
              key:          tempKey,
              algorithm:    'sha256',
            }, {
              ext: new Buffer(JSON.stringify({
                certificate:  certificate,
              })).toString('base64'),
            });
        },
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/scopes',
    scopes: {AllOf: ['service:magic']},
    handler: async (req, res) => {
      res.status(200).json({
        scopes: await req.scopes(),
        clientId: await req.clientId(),
        expires: await req.expires(),
      });
    },
    tests: [
      {
        label: 'request scopes from caller',
        tester: url => request
          .get(url)
          .hawk({
            id:           'test-client',
            key:          'test-token',
            algorithm:    'sha256',
          })
          .then(function(res) {
            assert(res.ok, 'Request failed');
            assert(res.body.scopes.length === 1, 'wrong number of scopes');
            assert(res.body.scopes[0] === 'service:magic', 'failed scopes');
            assert(res.body.clientId == 'test-client', 'bad clientId');
            assert(/\d{4}-\d{2}-\d{2}.*/.test(res.body.expires), 'bad expires');
            return res;
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-scopes',
    scopes: {AllOf: ['service:<param>']},
    handler: async (req, res) => {
      await req.authorize({
        param:      'myfolder/resource',
      });
      res.status(200).json('OK');
    },
    tests: [
      {
        label: 'parameterized scopes',
        tester: url => request
          .get(url)
          .hawk({
            id:           'param',
            key:          '--',
            algorithm:    'sha256',
          }),
      },
      {
        label: 'can\'t cheat parameterized scopes',
        desiredStatus: 403,
        tester: url => request
          .get(url)
          .hawk({
            id:           'nobody',
            key:          'test-token',
            algorithm:    'sha256',
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-scopes-authorize-twice',
    scopes: {AllOf: ['service:<param>']},
    handler: async (req, res) => {
      await req.authorize({
        param:      'myfolder/resource',
      });
      await req.authorize({
        param:      'myfolder/other-resource',
      });
      res.status(200).json('OK');
    },
    tests: [
      {
        label: 'Parameterized scopes, if authorized is called twice',
        tester: url => request
          .get(url)
          .hawk({
            id:           'param2',
            key:          '--',
            algorithm:    'sha256',
          }),
      },
      {
        label: 'Parameterized scopes, if authorized is called twice, with bad scope',
        desiredStatus: 403,
        tester: url =>  request
          .get(url)
          .hawk({
            id:           'param',
            key:          '--',
            algorithm:    'sha256',
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/crash-override',
    scopes: {AllOf: ['service:<param>']},
    handler: async (req, res) => {
      try {
        await req.authorize({param: 'myfolder/resource'});
        res.reply({});
      } catch (err) {
        if (err.code === 'AuthorizationError') {
          // we probably wouldn't normally throw a resource expired error for
          // missing scopes, but this is a convenient way to assert we have
          // overridden the error
          return res.reportError('ResourceExpired', 'bad things!', {});
        }
        throw err;
      }
    },
    tests: [
      {
        label: 'override error',
        desiredStatus: 410,
        tester: url => request
          .get(url)
          .hawk({
            id:           'nobody',
            key:          'test-token',
            algorithm:    'sha256',
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-no-auth',
    handler: async (req, res) => {
      assert.equal(await req.clientId(), 'auth-failed:no-auth');
      res.status(200).json('OK');
    },
    tests: [
      {
        label: 'public unauthenticated endpoint',
        tester: url => request.get(url),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-dyn-auth',
    scopes: {AllOf: [{for: 'scope', in: 'scopes', each: '<scope>'}]},
    handler: async (req, res) => {
      await req.authorize({scopes: req.body.scopes});
      return res.status(200).json('OK');
    },
    tests: [
      {
        label: 'With dynamic authentication',
        tester: url => request
          .get(url)
          .send({
            scopes: [
              'got-all/folder/t',
              'got-all/hello/*',
              'got-all/',
              'got-all/*',
              'got-only/this',
            ],
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }),
      },
      {
        label: 'With dynamic authentication (authorizedScopes)',
        tester: url => request
          .get(url)
          .send({
            scopes: [
              'got-all/folder/t',
              'got-all/hello/*',
              'got-all/',
              'got-all/*',
              'got-only/this',
            ],
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-all/*', 'got-only/this'],
            })).toString('base64'),
          }),
      },
      {
        label: 'With dynamic authentication (miss scoped)',
        desiredStatus: 403,
        tester: url => request
          .get(url)
          .send({
            scopes: [
              'got-all/folder/t',
              'got-all/hello/*',
              'got-all/',
              'got-all/*',
              'got-only/this',
              'got-*',
            ],
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-all/*', 'got-only/this'],
            })).toString('base64'),
          }),
      },
      {
        label: 'With dynamic authentication (miss scoped again)',
        desiredStatus: 403,
        tester: url => request
          .get(url)
          .send({
            scopes: [
              'got-only/this*',
            ],
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-only/this'],
            })).toString('base64'),
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-expression-auth/:provisionerId/:workerType',
    scopes: {AllOf: [
      'queue:create-task:<provisionerId>/<workerType>',
      {for: 'route', in: 'routes', each: 'queue:route:<route>'},
      {for: 'scope', in: 'scopes', each: '<scope>'},
    ]},
    handler: async (req, res) => {
      await req.authorize({
        provisionerId:    req.params.provisionerId,
        workerType:       req.params.workerType,
        scopes:           req.body.scopes,
        routes:           req.body.routes,
      });
      return res.status(200).json('OK');
    },
    tests: [
      {
        label: 'extra scope expresesions',
        params: {provisionerId: 'test-provisioner', workerType: 'test-worker'},
        tester: url => request
          .get(url)
          .send({
            routes: ['routeA', 'routeB'],
            scopes: ['scope1', 'scope2'],
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-expression-if-then-2',
    scopes: {if: 'private', then: {AllOf: [
      'some:scope:nobody:has',
    ]}},
    handler: async (req, res) => {
      await req.authorize({
        private: !req.body.public,
      });
      return res.status(200).json('OK');
    },
    tests: [
      {
        label: 'scope expression if/then (success)',
        tester: url => request
          .get(url)
          .send({
            public: true,
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['nothing:useful'],
            })).toString('base64'),
          }),
      },
      {
        label: 'scope expression if/then (success with no client)',
        tester: url => request
          .get(url)
          .send({
            public: true,
          }),
      },
      {
        label: 'scope expression if/then (failure)',
        desiredStatus: 403,
        tester: url => request
          .get(url)
          .send({
            public: false,
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['nothing:useful'],
            })).toString('base64'),
          }),
      },
      {
        label: 'scope expression if/then (failure with no client)',
        desiredStatus: 403,
        tester: url => request
          .get(url)
          .send({
            public: false,
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-expression-if-then-forget',
    scopes: {AnyOf: [
      'some:scope:nobody:has',
      {if: 'public', then: {AllOf: []}},
    ]},
    handler: async (req, res) => {
      return res.reply({});
    },
    tests: [
      {
        label: 'forgot to auth',
        desiredStatus: 500,
        tester: url => request
          .get(url)
          .send({})
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-dyn-auth-no-authorize',
    scopes: {AllOf: [{for: 'scope', in: 'scopes', each: '<scope>'}]},
    handler: async (req, res) => {
      return res.reply({});
    },
    tests: [
      {
        label: 'forgot to auth dyn-auth',
        desiredStatus: 500,
        tester: url => request
          .get(url)
          .send({
            scopes: [
              'got-only/this*',
            ],
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-only/this'],
            })).toString('base64'),
          }),
      },
    ],
  });

  testEndpoint({
    method: 'get',
    route: '/test-dyn-auth-missing-authorize',
    scopes: {AllOf: [{for: 'scope', in: 'scopes', each: '<scope>'}]},
    handler: async (req, res) => {
      await req.authorize({foo: 'bar'});
      return res.reply({});
    },
    tests: [
      {
        label: 'forgot to auth dyn-auth',
        desiredStatus: 500,
        tester: url => request
          .get(url)
          .send({
            scopes: [
              'got-only/this*',
            ],
          })
          .hawk({
            id:           'rockstar',
            key:          'groupie',
            algorithm:    'sha256',
          }, {
            ext: new Buffer(JSON.stringify({
              authorizedScopes:    ['got-only/this'],
            })).toString('base64'),
          }),
      },
    ],
  });
});
