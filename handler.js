const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

AWS.config.update({
  region: "us-east-2",
  endpoint: "https://dynamodb.us-east-2.amazonaws.com"
});

const docClient = new AWS.DynamoDB.DocumentClient();

const getJobData = async dbQueryParams => {
  return await docClient.get(dbQueryParams, function (err, data) {
    if (err) {
      console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("GetItem succeeded:");
      return data;
    }
  }).promise();
};

module.exports.simpleMerge = async () => {
  const transcodedChunksBucket = process.env.TRANSCODED_CHUNKS_BUCKET;
  const endBucket = process.env.END_BUCKET;

  const table = "Jobs";
  const id = 12345;

  const dbQueryParams = {
    TableName: table,
    Key: { id }
  };

  // is this await still required?
  const jobData = await getJobData(dbQueryParams);

  const jobId = String(jobData.Item.id);
  const fileFormat = jobData.Item.outputType;
  const chunkCount = jobData.Item.totalTasks;
  const filename = jobData.Item.filename;

  const chunkNameTemplate = `${jobId}/${jobId}-000`;
  const templateLength = chunkNameTemplate.length;

  const localMasterFilePath = `/tmp/${filename}${fileFormat}`;
  const manifestPath = `/tmp/merge-manifest.txt`;

  // write each chunk to lambda temp
  // loopChunks(params, getFiles);

  for (let num = 0; num < chunkCount; num += 1) {
    let suffix = String(num);
    let keep_char_count = templateLength - suffix.length;
    let prefix = chunkNameTemplate.slice(0, keep_char_count);

    let chunkKey = `${prefix}${suffix}${fileFormat}`;

    let s3Object = await s3.getObject({
      Bucket: transcodedChunksBucket,
      Key: chunkKey
    }).promise();
    //write file to disk
    writeFileSync(`/tmp/${chunkKey.slice(6)}`, s3Object.Body);
  }

  // write manifest
  let s3Object = await s3.getObject({
    Bucket: "testencodeinput",
    Key: "12345/merge-manifest.txt"
  }).promise();
  //write file to disk
  writeFileSync(manifestPath, s3Object.Body);

  // merge files stored on lambda
  spawnSync(
    "/opt/ffmpeg/ffmpeg",
    [
      "-f", "concat",
      "-safe", "0",
      "-i", manifestPath,
      "-c", "copy",
      localMasterFilePath
    ],
    { stdio: "inherit" }
  );
  // read concatenated file from disk
  const masterFile = readFileSync(localMasterFilePath);

  // delete the temp files
  unlinkSync(localMasterFilePath);
  unlinkSync(manifestPath);

  for (let num = 0; num < chunkCount; num += 1) {
    let suffix = String(num);
    let keep_char_count = templateLength - suffix.length;
    let prefix = chunkNameTemplate.slice(0, keep_char_count);

    let chunkKey = `${prefix}${suffix}${fileFormat}`;

    unlinkSync('/tmp/' + chunkKey.slice(6));
  }

  // upload mp4 to s3
  await s3
    .putObject({
      Bucket: endBucket,
      Key: `${jobId}-${filename}${fileFormat}`,

      Body: masterFile
    })
    .promise();

  // update job status on DB to completed

  const putParams = {
    TableName: table,
    Key: { 'id': id },
    UpdateExpression: "set #s = :stat",
    ExpressionAttributeNames: {
      "#s": "status"
    },
    ExpressionAttributeValues: {
      ":stat": "completed"
    },
    ReturnValues: `UPDATED_NEW`
  };

  console.log("Updating the item...");
  await docClient.update(putParams, function (err, data) {
    if (err) {
      console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
    }
  }).promise()
};
