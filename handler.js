const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

AWS.config.update({
  region: "us-east-1",
  endpoint: "https://dynamodb.us-east-1.amazonaws.com"
});

const docClient = new AWS.DynamoDB.DocumentClient();

const getJobData = async dbQueryParams => {
  console.log('Getting data from jobs table: ', dbQueryParams);
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

  const tableName = "Jobs";
  const jobId = event.jobId;

  const dbQueryParams = {
    TableName: tableName,
    Key: { id: jobId }
  };

  // get job data
  const jobData = await getJobData(dbQueryParams);

  const jobStartTime = jobData.Item.createdAt;
  const inputFormat = jobData.Item.inputType;
  const fileFormat = jobData.Item.outputType;
  const chunkCount = jobData.Item.totalTasks;
  const filename = jobData.Item.filename;
  const hasAudio = jobData.Item.hasAudio;

  const localMasterFilePath = `/tmp/${filename}${fileFormat}`;
  const localFinalFilePath = `/tmp/${filename}-final${fileFormat}`;
  const localOriginalFilePath = `/tmp/${filename}-original${inputFormat}`;
  const localManifestPath = `/tmp/manifest.ffcat`;

  const localChunkFilePrefix = `/tmp/${jobId}-`;
  let chunkFileSuffix;

  // write each chunk to lambda temp

  console.log('Grabbing segments from transcodedChunksBucket');
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

    console.log('Getting segment', s3chunkKey, ' from ', transcodedChunksBucket);
    console.log('localChunkFilePath', localChunkFilePath);

    let s3Object = await s3.getObject({
      Bucket: transcodedChunksBucket,
      Key: s3chunkKey
    }).promise();
    //write file to disk
    //console.log('Received chunk body:', s3Object);

    console.log('Attempting write to : ', localChunkFilePath);
    writeFileSync(localChunkFilePath, s3Object.Body);
  }

  // write manifest
  console.log('Getting manifest from s3');
  let s3Object = await s3.getObject({
    Bucket: transcodedChunksBucket,
    Key: `${jobId}/manifest.ffcat`
  }).promise();

  //write file to disk
  console.log('writing to ', localManifestPath);
  writeFileSync(localManifestPath, s3Object.Body);
  console.log('post get/write manifest and pre merge');

  console.log('getting original video: ', `${filename}${inputFormat}`);

  // get original video
  if (hasAudio) {
    s3Object = await s3.getObject({
      Bucket: 'bento-video-start',
      Key: `${filename}${inputFormat}`
    }).promise();

    console.log('saving original to ', localOriginalFilePath);
    // save original video to /tmp
    writeFileSync(localOriginalFilePath, s3Object.Body);
  }


  // merge files stored on lambda and save to /tmp
  console.log('merging segments into a single video at ', localMasterFilePath);
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

  let finalFile;

  if (hasAudio) {
    // combine merged segments video stream and original audio stream
    console.log(`combining video stream at ${localMasterFilePath} with audio at ${localOriginalFilePath}, saving to ${localFinalFilePath}`);
    spawnSync(
      "/opt/ffmpeg/ffmpeg",
      [
        "-i", localMasterFilePath,
        "-i", localOriginalFilePath,
        "-c", "copy",
        "-map", "0:v",
        "-map", "1:a",
        localFinalFilePath
      ]
    );

    console.log('reading from ', localFinalFilePath);
    // read concatenated file from disk
    finalFile = readFileSync(localFinalFilePath);
  } else {
    console.log('reading from ', localMasterFilePath);
    // read concatenated file from disk
    finalFile = readFileSync(localMasterFilePath);
  }


  console.log('masterFile has been read');
  // delete the tmp files
  unlinkSync(localMasterFilePath);
  unlinkSync(localManifestPath);

  if (hasAudio) {
    unlinkSync(localOriginalFilePath);
    unlinkSync(localFinalFilePath);
  }

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
    console.log('localChunkFilePath', localChunkFilePath);

    unlinkSync(localChunkFilePath);
  }

  // upload mp4 to s3
  await s3
    .putObject({
      Bucket: endBucket,
      Key: `${jobId}-${filename}${fileFormat}`,

      Body: finalFile
    })
    .promise();

  // update job status on DB to completed

  const jobEndTime = Date.now();
  const timeToCompleteSeconds = (jobEndTime - jobStartTime) / 1000;
  // const timeToCompleteMinutes = Math.floor(timeToCompleteSeconds / 60);
  // const remainingSeconds = Math.floor(timeToCompleteSeconds % 60);
  // const jobTimeToComplete = `${timeToCompleteMinutes}:${remainingSeconds}`;

  const putParams = {
    TableName: tableName,
    Key: { 'id': jobId },
    UpdateExpression: "set #s = :stat, completedAt = :completedAt, timeToComplete = :timeToComplete",
    ExpressionAttributeNames: {
      "#s": "status"
    },
    ExpressionAttributeValues: {
      ":stat": "completed",
      ":completedAt": jobEndTime,
      ":timeToComplete": timeToCompleteSeconds
    },
    ReturnValues: `UPDATED_NEW`
  };

  await writeJob(putParams);
};
