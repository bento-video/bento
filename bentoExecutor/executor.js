"use strict";
const path = require("path");
const { execSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const DDB = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda({
  region: "us-east-1",
});
const transcodedBucket = process.env.TRANSCODED_SEGMENTS_BUCKET;
const startBucket = process.env.NEW_VIDEO_BUCKET;
const transcodeLambdaAddress = process.env.TRANSCODE_LAMBDA_ADDRESS;
const jobsTable = process.env.JOBS_TABLE;
const segmentsTable = process.env.SEGMENTS_TABLE;
const manifestPath = "/tmp/manifest.ffcat";
const probeKeyframesPath = "/tmp/probeKeyframes.json";

const probeVideo = (objectUrl) => {
  const command = `/opt/ffmpeg/ffprobe -show_entries packet=pos,pts_time,flags -select_streams v -of compact=p=0:nk=1  -print_format json -show_format -show_streams "${objectUrl}" > "${probeKeyframesPath}"`;

  execSync(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout.toString()}`);
    console.error(`stderr: ${stderr.toString()}`);
  });

  console.log(`Trying to read file at: ${probeKeyframesPath}`);
  const probeData = readFileSync(probeKeyframesPath);
  if (probeData) {
    // console.log(`Here is the probeData: ${probeData}`);
    // console.log('Returning probeData:', JSON.parse(probeData));
    console.log("Returning probeData!");
  }

  return JSON.parse(probeData);
};

const getKeyframeTimes = (probeData) => {
  // Original function, getting keyframes
  let keyframeTimes = [
    ...probeData.packets.filter((p) => p.flags === "K_"),
    probeData.packets[probeData.packets.length - 1],
  ].map((kfPacket) => kfPacket.pts_time);

  keyframeTimes = keyframeTimes.reduce((segments, cur, idx) => {
    return idx < keyframeTimes.length - 1
      ? [...segments, [cur, keyframeTimes[idx + 1]]]
      : segments;
  }, []);

  return keyframeTimes;
};

const getSafeKeyFrameTimes = (probeData) => {
  let keyframeTimes = [
    ...probeData.packets.filter((p) => p.flags === "K_"),
    probeData.packets[probeData.packets.length - 1],
  ].map((kfPacket) => kfPacket.pts_time);

  keyframeTimes = keyframeTimes.reduce((segments, cur, idx) => {
    return idx < keyframeTimes.length - 1
      ? [...segments, [cur, keyframeTimes[idx + 1]]]
      : segments;
  }, []);

  keyframeTimes.forEach((segment) => {
    segment[1] = (+segment[1] - 0.001).toFixed(3);
  });

  return keyframeTimes;
};

const getEvenSegments = (probeData) => {
  // Alt approach, using standardized segment times regardless of keyframe data
  const lastKeyframeTime = +probeData.packets[probeData.packets.length - 1]
    .pts_time;
  let segmentTimes = [];

  for (let sec = 0; sec < lastKeyframeTime; sec += 6) {
    segmentTimes.push(String(sec));
  }

  segmentTimes.push(lastKeyframeTime);

  segmentTimes = segmentTimes.reduce((segments, cur, idx) => {
    return idx < segmentTimes.length - 1
      ? [...segments, [cur, segmentTimes[idx + 1]]]
      : segments;
  }, []);

  return segmentTimes;
};

const saveJobData = ({
  jobId,
  keyframeTimes,
  fileBasename,
  fileExt,
  videoId,
  res,
  simulateInvoke,
}) => {
  const totalTasks = keyframeTimes.length;
  const shortRes = res ? res.split("x")[1] : null;
  const outputType = ".mp4";
  const outputKey = `${jobId}/${fileBasename}-${shortRes}${outputType}`;
  const params = {
    TableName: jobsTable,
    Item: {
      id: jobId,
      videoId: videoId,
      resolution: res,
      totalTasks: totalTasks,
      finishedTasks: 0,
      filename: fileBasename,
      status: "pending",
      inputType: fileExt,
      outputType: outputType,
      outputKey: outputKey,
      createdAt: Date.now(),
      completedAt: null,
    },
  };

  dbWriter(params, "job", simulateInvoke);
};

const saveSegmentsData = ({ jobId, keyframeTimes, simulateInvoke }) => {
  let segmentNum = 0;
  const filenames = [];
  for (segmentNum; segmentNum < keyframeTimes.length; segmentNum += 1) {
    const id = String(segmentNum).padStart(3, "0");
    const filename = `${jobId}-${id}`;
    filenames.push(filename);

    const params = {
      TableName: segmentsTable,
      Item: {
        jobId: jobId,
        id: id,
        startTime: keyframeTimes[segmentNum][0],
        endTime: keyframeTimes[segmentNum][1],
        filename: filename,
        status: "pending",
        createdAt: Date.now(),
        completedAt: null,
      },
    };
    dbWriter(params, "segment", simulateInvoke);
  }

  return filenames;
};

const dbWriter = (params, item, simulateInvoke) => {
  if (simulateInvoke) {
    console.log(
      `Simulating write to ${item} table with params ${JSON.stringify(params)}`
    );
    return;
  }
  console.log(`Adding a new ${item} with params...`, params);
  DDB.put(params, (err, data) => {
    if (err) {
      console.log(
        `Unable to add ${item}. Error JSON:`,
        JSON.stringify(err, null, 2)
      );
    } else {
      console.log(`Added ${item}:`, JSON.stringify(data, null, 2));
    }
  });
};

// const writeToManifest = (filenames, jobId) => {
//   const segmentPath = `file https://${transcodedBucket}.s3.amazonaws.com/${jobId}/`;
//   let manifest = "";
//   for (let segment of filenames) {
//     manifest += `${segmentPath}${segment}.mp4\n`;
//   }
//   console.log("writing manifest: ", manifest);
//   writeFileSync(manifestPath, manifest, (err) => {
//     console.log(`${err ? err : "successfully wrote to manifest"}`);
//   });
//   return readFileSync(manifestPath);
// };

const invokeTranscode = async (payload, simulateInvoke) => {
  const invokeParams = {
    FunctionName: transcodeLambdaAddress,
    InvocationType: "Event",
    LogType: "None",
    ClientContext: "BentoExec",
  };

  invokeParams["Payload"] = JSON.stringify(payload);

  if (simulateInvoke) {
    console.log(
      "Simulating invoke of bento-transcode with the payload: ",
      invokeParams
    );
    return;
  }

  console.log("Invoking bento-transcode with payload: ", invokeParams);

  await lambda.invoke(invokeParams).promise();
};

module.exports.execute = async (event) => {
  const INVOKE_LIMIT = event.invokeLimit || 600;
  const eventSegmentDuration = event.segmentDuration || 6;

  global.gc(); // for garbage collection in warm lambda

  if (!event["body-json"]) {
    // edit to perform additional checks for proper values
    console.log("not a valid invocation!"); // generalized error mssg
    return;
  }

  const dataFromAPI = event["body-json"] ? event["body-json"] : false;
  const { key, res, videoId } = { ...dataFromAPI };

  console.log("EVENT IS: ", event);
  console.log("API BODY IS: ", event["body-json"]);

  const filePathObj = path.parse(`${key}`);
  const [fileBasename, fileExt] = [filePathObj.name, filePathObj.ext];
  const jobId = Date.now();

  const inputPath = `https://${startBucket}.s3.amazonaws.com/${key}`;
  console.log("inputPath", inputPath);

  const signedParams = { Bucket: startBucket, Key: key, Expires: 120 };
  var signedInputUrl = s3.getSignedUrl("getObject", signedParams);

  console.log("Firing up pipeline for ", key, startBucket);
  const probeData = probeVideo(signedInputUrl);

  // Overlapping end/start times
  let keyframeTimes = getKeyframeTimes(probeData, eventSegmentDuration);

  console.log(`keyframeTimes: ${keyframeTimes}`);

  const simulateInvoke =
    event.simulateInvoke || keyframeTimes.length >= INVOKE_LIMIT;

  console.log("Keyframe times: ", keyframeTimes);
  console.log("inputPath", inputPath);
  console.log("jobId", jobId);

  saveJobData({
    jobId,
    keyframeTimes,
    fileBasename,
    fileExt,
    videoId,
    res,
    simulateInvoke,
  });

  const segmentFilenames = saveSegmentsData({
    jobId,
    keyframeTimes,
    simulateInvoke,
  });

  // const manifest = writeToManifest(segmentFilenames, jobId);

  // if (!simulateInvoke) {
  //   console.log("Putting manifest in transcoded bucket");
  //   await s3
  //     .putObject({
  //       Bucket: transcodedBucket,
  //       Key: `${jobId}/manifest.ffcat`,
  //       Body: manifest,
  //     })
  //     .promise();
  // }

  console.log(
    `${segmentFilenames.length} segments to transcode. ${
      simulateInvoke ? "Simulating..." : "Beginning invocation..."
    }`
  );

  for (let idx = 0; idx < segmentFilenames.length; idx += 1) {
    const payload = {
      segmentData: {
        key: key,
        jobId: jobId,
        resolution: res,
        segmentName: segmentFilenames[idx],
        startTime: keyframeTimes[idx][0],
        endTime: keyframeTimes[idx][1],
      },
    };

    await invokeTranscode(payload, simulateInvoke);
  }

  // unlinkSync(manifestPath);
  unlinkSync(probeKeyframesPath);
};
