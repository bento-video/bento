const { spawnSync } = require("child_process");
const { mkdirSync, readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

AWS.config.update({
  region: "us-east-1",
  endpoint: "https://dynamodb.us-east-1.amazonaws.com"
});

const docClient = new AWS.DynamoDB.DocumentClient();

const getJobData = async dbQueryParams => {
  return await docClient.get(dbQueryParams, function (err, data) {
    if (err) {
      console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("GetItem succeeded:", data);
      return data;
    }
  }).promise();
};

const writeJob = async putParams => {
  console.log("Updating the item...");
  return await docClient.update(putParams, function (err, data) {
    if (err) {
      console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
    }
  }).promise();
};

module.exports.simpleMerge = async (event) => {
  const transcodedChunksBucket = process.env.TRANSCODED_CHUNKS_BUCKET;
  const endBucket = process.env.END_BUCKET;

  // console.log(event);
  const tableName = "Jobs";
  const jobId = event.jobId;
  // const jobId = "1584058009225";


  const dbQueryParams = {
    TableName: tableName,
    Key: { id: jobId }
  };

  // is this await still required?
  const jobData = await getJobData(dbQueryParams);

  // const jobId = String(jobData.Item.id);
  const fileFormat = jobData.Item.outputType;
  const chunkCount = jobData.Item.totalTasks;
  const filename = jobData.Item.filename;

  // const chunkNameTemplate = `${jobId}/${jobId}-000`;
  // const templateLength = chunkNameTemplate.length;

  const localMasterFilePath = `/tmp/${filename}${fileFormat}`;
  const localManifestPath = `/tmp/manifest.ffcat`;

  const localChunkFilePrefix = `/tmp/${jobId}-`;
  let chunkFileSuffix;

  // write each chunk to lambda temp
  // mkdirSync(`/tmp/${jobId}`)

  for (let num = 0; num < chunkCount; num += 1) {
    let digitCount = String(num).length;

    if (digitCount === 1) {
      chunkFileSuffix = `00${String(num)}${fileFormat}`;
    } else if (digitCount === 2) {
      chunkFileSuffix = `0${String(num)}${fileFormat}`;
    } else if (digitCount === 3) {
      chunkFileSuffix = `${String(num)}${fileFormat}`;
    }

    let s3chunkKey = `${jobId}/${jobId}-${chunkFileSuffix}`;
    let localChunkFilePath = localChunkFilePrefix + chunkFileSuffix;

    console.log('s3chunkKey', s3chunkKey)
    console.log('localChunkFilePath', localChunkFilePath)

    let s3Object = await s3.getObject({
      Bucket: transcodedChunksBucket,
      Key: s3chunkKey
    }).promise();
    //write file to disk
    console.log('chunk body', s3Object);

    writeFileSync(localChunkFilePath, s3Object.Body);
  }

  // write manifest
  let s3Object = await s3.getObject({
    Bucket: transcodedChunksBucket,
    Key: `${jobId}/manifest.ffcat`
  }).promise();
  console.log('manifest body', s3Object);

  //write file to disk

  writeFileSync(localManifestPath, s3Object.Body);
  console.log('post get/write manifest and pre merge')

  // merge files stored on lambda
  spawnSync(
    "/opt/ffmpeg/ffmpeg",
    [
      "-f", "concat",
      "-safe", "0",
      "-i", localManifestPath,
      "-c", "copy",
      localMasterFilePath
    ],
    { stdio: "inherit" }
  );
  // read concatenated file from disk
  const masterFile = readFileSync(localMasterFilePath);

  console.log('masterFile has been read');
  // delete the tmp files
  unlinkSync(localMasterFilePath);
  unlinkSync(localManifestPath);

  for (let num = 0; num < chunkCount; num += 1) {
    let digitCount = String(num).length;

    if (digitCount === 1) {
      chunkFileSuffix = `00${String(num)}${fileFormat}`;
    } else if (digitCount === 2) {
      chunkFileSuffix = `0${String(num)}${fileFormat}`;
    } else if (digitCount === 3) {
      chunkFileSuffix = `${String(num)}${fileFormat}`;
    }

    let localChunkFilePath = localChunkFilePrefix + chunkFileSuffix;

    console.log('unlinking');
    console.log('localChunkFilePath', localChunkFilePath)

    unlinkSync(localChunkFilePath);
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
    TableName: tableName,
    Key: { 'id': jobId },
    UpdateExpression: "set #s = :stat",
    ExpressionAttributeNames: {
      "#s": "status"
    },
    ExpressionAttributeValues: {
      ":stat": "completed"
    },
    ReturnValues: `UPDATED_NEW`
  };

  await writeJob(putParams);
};
