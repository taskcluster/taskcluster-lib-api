const fs = require('fs');
const aws = require('aws-sdk');
const taskcluster = require('taskcluster-client');

const main = async () => {
  const secrets = new taskcluster.Secrets({baseUrl: 'http://taskcluster'});
  const secret = (await secrets.get('repo:github.com/taskcluster/taskcluster-lib-api:legacy-api-refs-uploader')).secret;

  const s3 = new aws.S3(secret);
  await s3.putObject({
    Bucket: 'schemas.taskcluster.net',
    Key: 'base/v1/api-reference.json',
    Body: fs.readFileSync('src/schemas/api-reference.json'),
    ContentType: 'application/json',
  }).promise();
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
