const { execSync } = require("child_process");
const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const endBucket = process.env.FINAL_VIDEO_BUCKET;
const transcodedBucket = process.env.TRANSCODED_SEGMENTS_BUCKET;
const jobsTable = process.env.JOBS_TABLE;
const videosTable = process.env.VIDEOS_TABLE;
const segmentsTable = process.env.SEGMENTS_TABLE;
const manifestPath = `/tmp/manifest.ffcat`;

const getJobData = async (jobId) => {
  const dbQueryParams = {
    TableName: jobsTable,
    Key: { id: jobId },
  };

  console.log("Getting data from jobs table: ", JSON.stringify(dbQueryParams));

  return await docClient
    .get(dbQueryParams, function (err, data) {
      if (err) {
        console.error(
          "Unable to read item. Error JSON:",
          JSON.stringify(err, null, 2)
        );
      } else {
        console.log("Get from Jobs table succeeded: ", JSON.stringify(data));
        return data;
      }
    })
    .promise();
};

const getSegmentFilenames = async (jobId) => {
  const dbQueryParams = {
    TableName: segmentsTable,
    KeyConditionExpression: "jobId = :j",
    ExpressionAttributeValues: {
      ":j": jobId,
    },
  };

  const filenames = [];

  await docClient
    .query(dbQueryParams, function (err, data) {
      if (err) {
        console.error("Unable to query. Error:", JSON.stringify(err, null, 2));
      } else {
        console.log("Query succeeded.");
        data.Items.forEach(function (item) {
          filenames.push(item.filename);
        });
      }
    })
    .promise();

  return filenames;
};

const writeToManifest = async (jobId) => {
  const filenames = await getSegmentFilenames(jobId);
  let manifest = "";
  let key;
  let signedParams;
  let signedInputUrl;

  filenames.forEach((filename) => {
    console.log("segment file name", filename);
    console.log("segment key", `${jobId}/${filename}`);

    key = `${jobId}/${filename}.mp4`;
    signedParams = {
      Bucket: transcodedChunksBucket,
      Key: key,
      Expires: 900,
    };
    signedInputUrl = s3.getSignedUrl("getObject", signedParams);

    manifest += `file ${signedInputUrl}\n`;
  });

  console.log("writing manifest: ", manifest);
  writeFileSync(manifestPath, manifest, (err) => {
    console.log(`${err ? err : "successfully wrote to manifest"}`);
  });
};

const writeJob = async (putParams) => {
  console.log(`Updating jobs table with params: ${JSON.stringify(putParams)}`);
  return await docClient
    .update(putParams, function (err, data) {
      if (err) {
        console.error(
          "Unable to update item. Error JSON:",
          JSON.stringify(err, null, 2)
        );
      } else {
        console.log(
          "Update to table succeeded:",
          JSON.stringify(data, null, 2)
        );
      }
    })
    .promise();
};

const recordJobCompleted = async ({ id: jobId, createdAt, outputKey }) => {
  // update job status on DB to completed

  const jobEndTime = Date.now();
  const timeToCompleteSeconds = (jobEndTime - createdAt) / 1000;
  const completedUrl = `https://${endBucket}.s3.amazonaws.com/${outputKey}`;

  const putParams = {
    TableName: jobsTable,
    Key: { id: jobId },
    UpdateExpression:
      "set #s = :stat, completedAt = :completedAt, timeToComplete = :timeToComplete, versionUrl = :completedUrl",
    ExpressionAttributeNames: {
      "#s": "status",
    },
    ExpressionAttributeValues: {
      ":stat": "completed",
      ":completedAt": jobEndTime,
      ":timeToComplete": timeToCompleteSeconds,
      ":completedUrl": completedUrl,
    },
    ReturnValues: `UPDATED_NEW`,
  };

  await writeJob(putParams);
};

const incrementVersionCount = async ({ videoId }) => {
  // const videoId = await getVideoId(jobId);

  const updateParams = {
    Key: {
      id: videoId,
    },
    TableName: videosTable,
    UpdateExpression: "SET versions = versions + :val",
    ExpressionAttributeValues: {
      ":val": 1,
    },
    ReturnValues: "UPDATED_NEW",
  };

  console.log(`Attempting to increment version counter for video ${videoId}`);

  await docClient
    .update(updateParams)
    .promise()
    .then((data) => {
      console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
      return data;
    })
    .catch((err) => {
      console.error(
        "Unable to update item. Error JSON:",
        JSON.stringify(err, null, 2)
      );
      return null;
    });
};

const concatHttpToS3 = async (jobData) => {
  const { outputKey } = jobData;
  // const manifestPath = `https://${transcodedBucket}.s3.amazonaws.com/${jobId}/manifest.ffcat`;
  // const videoKey = `${jobId}-${filename}${outputType}`;
  const s3Path = `s3://${endBucket}/${outputKey}`;

  console.log(`Attempting http concat with output to ${s3Path}`);

  const command = `/opt/ffmpeg/ffmpeg -f concat -safe 0 -protocol_whitelist file,https,tls,tcp -i ${manifestPath} -c copy -f mp4 -movflags frag_keyframe+empty_moov pipe:1 | /opt/awscli/aws s3 cp - ${s3Path}`;

  execSync(command, { stdio: "ignore" }, (err) => {
    if (err) {
      console.log(err);
      return false;
    } else {
      console.log("Sent to s3!");
    }
  });

  return true;
};

module.exports.merge = async (event) => {
  const simulateInvoke = event.simulateInvoke;
  const jobId = Number(event.jobId);
  let jobData = await getJobData(jobId);
  jobData = { ...jobData.Item };

  await writeToManifest(jobId);

  concatHttpToS3(jobData);
  unlinkSync(manifestPath);
  if (simulateInvoke) {
    console.log(`Simulation complete, exiting!`);
    return;
  }

  await recordJobCompleted(jobData);
  await incrementVersionCount(jobData);
};
