const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const docClient = new AWS.DynamoDB.DocumentClient();
const transcodedChunksBucket = process.env.TRANSCODED_CHUNKS_BUCKET;
const endBucket = process.env.END_BUCKET;
const jobsTable = "Jobs";
const manifestPath = `/tmp/manifest.ffcat`;

const getJobData = async jobId => {
  const dbQueryParams = {
    TableName: jobsTable,
    Key: { id: jobId }
  };

  console.log('Getting data from jobs table: ', JSON.stringify(dbQueryParams));

  return await docClient.get(dbQueryParams, function (err, data) {
    if (err) {
      console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Get from Jobs table succeeded: ", JSON.stringify(data));
      return data;
    }
  }).promise();
};

const writeJob = async putParams => {
  console.log(`Updating jobs table with params: ${JSON.stringify(putParams)}`);
  return await docClient.update(putParams, function (err, data) {
    if (err) {
      console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("Update to table succeeded:", JSON.stringify(data, null, 2));
    }
  }).promise();
};

const getSegments = async ({ id: jobId, outputType, totalTasks }) => {
  console.log('Grabbing segments from transcodedChunksBucket');
  for (let num = 0; num < totalTasks; num += 1) {

    let segmentId = String(num).padStart(3, '0');
    let segmentKey = `${jobId}/${jobId}-${segmentId}${outputType}`;
    let segmentPath = `/tmp/${jobId}-${segmentId}${outputType}`


    console.log('Getting segmentKey ', segmentKey, ' from ', transcodedChunksBucket);

    let s3Object = await s3.getObject({
      Bucket: transcodedChunksBucket,
      Key: segmentKey
    }).promise();
    //write file to disk
    console.log('Received segment ', segmentId);

    console.log('Attempting write to : ', segmentPath);
    writeFileSync(segmentPath, s3Object.Body);
  }
}

const unlinkSegmentsAndManifest = ({ id: jobId, outputType, totalTasks }) => {
  for (let num = 0; num < totalTasks; num += 1) {

    let segmentId = String(num).padStart(3, '0');
    let segmentPath = `/tmp/${jobId}-${segmentId}${outputType}`

    console.log(`Unlinking ${segmentPath}`)
    unlinkSync(segmentPath);
  }
  console.log(`Unlinking ${manifestPath}`)
  unlinkSync(manifestPath);
}

const getManifest = async (jobId) => {
  // write manifest
  console.log('Getting manifest from s3');
  let s3Object = await s3.getObject({
    Bucket: transcodedChunksBucket,
    Key: `${jobId}/manifest.ffcat`
  }).promise();

  //write file to disk
  console.log(`Writing manifest to ${manifestPath}`)
  writeFileSync(manifestPath, s3Object.Body);
}

const getOriginalVideo = async (originalVideoPath, jobData) => {
  const { filename, inputType, hasAudio } = jobData
  if (!hasAudio) {
    console.log(`Video has no audio stream: won't fetch original video.`)
    return;
  }
  console.log(`Retrieving original video from start bucket: ${filename}${inputType}`);

  // get original video
  let s3Object = await s3.getObject({
    Bucket: 'bento-video-start',
    Key: `${filename}${inputType}`
  }).promise();

  console.log(`Writing original video to ${originalVideoPath}`)
  // save original video to /tmp
  writeFileSync(originalVideoPath, s3Object.Body);
}

const getOriginalAudio = async (originalAudioPath, jobData) => {
  const { id, audioType, audioKey, hasAudio } = jobData
  if (!hasAudio) {
    console.log(`Video has no audio stream: won't fetch original audio.`)
    return;
  }
  console.log(`Retrieving original audio from transcoded bucket: ${audioKey}`);

  // get original audio
  let s3Object = await s3.getObject({
    Bucket: transcodedChunksBucket,
    Key: audioKey
  }).promise();

  console.log(`Writing original audio to ${originalAudioPath}`)
  // save original audio to /tmp
  writeFileSync(originalAudioPath, s3Object.Body);
}

const mergeSegmentsIntoVideo = mergedSegmentsPath => {
  // merge segments into single file and save to /tmp
  console.log(`Merging segments into single video, saving to ${mergedSegmentsPath}`)
  spawnSync(
    "/opt/ffmpeg/ffmpeg",
    [
      "-f", "concat",
      "-safe", "0",
      "-i", manifestPath,
      "-c", "copy",
      mergedSegmentsPath
    ],
    { stdio: "inherit" }
  );
}

const buildCompletedVideo = (videoPaths, jobData) => {
  if (!jobData.hasAudio) {
    console.log(`Video has no audio stream: completed path is now ${videoPaths.mergedPath}`);
    videoPaths.completedPath = videoPaths.mergedPath;
    return;
  }
  // const { mergedPath, originalPath, completedPath } = videoPaths
  const { mergedPath, audioPath, completedPath } = videoPaths
  spawnSync(
    "/opt/ffmpeg/ffmpeg",
    [
      "-i", mergedPath,
      "-i", audioPath,
      "-c", "copy",
      "-map", "0:v",
      "-map", "1:a",
      completedPath
    ]
  );
}

const unlinkMergedVideo = (mergedPath) => {
  console.log(`Unlinking ${mergedPath}`)
  unlinkSync(mergedPath);
}

const unlinkOriginalVideo = (originalVideoPath, jobData) => {
  if (!jobData.hasAudio) {
    return;
  }
  console.log(`Unlinking  ${originalVideoPath}`)
  unlinkSync(originalVideoPath);
}

const putCompletedVideoInBucket = async (jobData, completedVideoPath) => {
  const { id: jobId, filename, outputType } = jobData;
  console.log(`Reading completed file from ${completedVideoPath}`)
  const completedVideo = readFileSync(completedVideoPath);

  // delete the tmp files
  console.log('Completed file read into memory, unlinking file at path ', completedVideoPath);
  unlinkSync(completedVideoPath);

  const completedKey = `${jobId} - ${filename}${outputType}`;
  console.log(`Putting completed video ${completedKey} in bucket ${endBucket}`);
  await s3
    .putObject({
      Bucket: endBucket,
      Key: completedKey,
      Body: completedVideo
    })
    .promise();
}

const recordJobCompleted = async ({ id: jobId, createdAt }) => {
  // update job status on DB to completed

  const jobEndTime = Date.now();
  const timeToCompleteSeconds = (jobEndTime - createdAt) / 1000;

  const putParams = {
    TableName: jobsTable,
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
}

module.exports.simpleMerge = async (event) => {
  const jobId = event.jobId;
  let jobData = await getJobData(jobId);
  jobData = { ...jobData.Item };

  const { inputType, outputType, audioType, filename } = jobData;

  const videoPaths = {
    mergedPath: `/tmp/${filename}-Merged${outputType}`,
    originalPath: `/tmp/${filename}-Original${inputType}`,
    audioPath: `/tmp/${filename}-Audio${audioType}`,
    completedPath: `/tmp/${filename}-Completed${outputType}`
  }

  await getSegments(jobData);
  await getManifest(jobId);

  mergeSegmentsIntoVideo(videoPaths.mergedPath);
  unlinkSegmentsAndManifest(jobData)

  // await getOriginalVideo(videoPaths.originalPath, jobData)
  await getOriginalAudio(videoPaths.audioPath, jobData)

  buildCompletedVideo(videoPaths, jobData);
  unlinkMergedVideo(videoPaths.mergedPath);
  unlinkOriginalVideo(videoPaths.originalPath, jobData)

  await putCompletedVideoInBucket(jobData, videoPaths.completedPath)
  await recordJobCompleted(jobData);
};
