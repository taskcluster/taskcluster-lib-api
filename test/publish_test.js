suite('api/publish', function() {
  var subject         = require('../');
  var config          = require('typed-env-config');
  var awsmock         = require('mock-aws-s3');
  var assert          = require('assert');
  var Promise         = require('promise');

  var cfg = config({});

  if (!cfg.aws || !cfg.referenceTestBucket) {
    console.log('Skipping \'publish\', missing config file: ' +
                'taskcluster-base-test.conf.json');
  this.skip = true;
  }

  // Test simple method
  test('publish minimal reference', function() {
    // Create test api
    var api = new subject({
      title:        'Test Api',
      description:  'Another test api',
      name:         'test',
    });

    // Declare a simple method
    api.declare({
      method:       'get',
      route:        '/test0',
      name:         'test',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
    }, function(req, res) {
      res.send(200, 'Hello World');
    });

    // Declare some methods with some fun scopes
    api.declare({
      method:       'get',
      route:        '/test1',
      name:         'test',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AllOf: ['foo:bar']},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test2',
      name:         'test',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AnyOf: ['foo:bar']},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test3',
      name:         'test',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {if: 'not_public', then: {AllOf: ['foo:bar']}},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test4',
      name:         'test',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AllOf: [{for: 'foo', in: 'whatever', each: 'bar:<foo>'}]},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test5',
      name:         'test',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {AllOf: [{for: 'foo', in: 'whatever', each: 'bar:<foo>'}]},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });
    api.declare({
      method:       'get',
      route:        '/test6',
      name:         'test',
      title:        'Test End-Point',
      description:  'Place we can call to test something',
      stability:    subject.stability.stable,
      scopes:       {if: 'not_public', then: {AllOf: ['abc', {AnyOf: ['e']}, {for: 'a', in: 'b', each: 'c'}]}},
    }, function(req, res) {
      res.send(200, 'Hello World');
    });

    return api
      .publish({
        baseUrl: 'http://localhost:23243/v1',
        referencePrefix: 'fake file',
        referenceBucket: cfg.referenceTestBucket,
        aws: cfg.aws,
        publish: true,
      })
      .then(function() {
        // Get the file... we don't bother checking the contents this is good
        // enough
        var s3 = new aws.S3({accessKeyId: 'fake', secretAccessKey: 'fake'});
        // return s3.getObject({
        //  Bucket:     cfg.referenceTestBucket,
        //   Key:        'base/test/simple-api.json',
        // }).promise();

        awsmock.mock('S3', 'getObject', function(param, callback) {
          // Contents: [{Bucket: 'bucket'}, {Key: 'fakekey'}],
          callback(null, {
            Bucket: 'bucket',
            Key: 'fakekey',
          });
        });
      }).then(function(res) {
      var reference = JSON.parse(res.Body);
      assert(reference.entries, 'Missing entries');
      assert.equal(reference.entries.length, 8);
      assert(reference.title, 'Missing title');
    });
  });
});
