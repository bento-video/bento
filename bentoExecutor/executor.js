'use strict';
const path = require('path');
const { execSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const DDB = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda({
  region: "us-east-1"
});
const transcodedBucket = process.env.TRANSCODED_SEGMENTS_BUCKET;
const transcodeLambdaAddress = process.env.TRANSCODER_LAMBDA_ADDRESS;
const jobsTable = "Jobs";
const segmentsTable = "Segments";
const manifestPath = '/tmp/manifest.ffcat';
const probeKeyframesPath = "/tmp/probeKeyframes.json"
const probeStreamsPath = "/tmp/probeStreams.json"
const startBucket = process.env.NEW_VIDEO_BUCKET;


const probeVideo = objectUrl => {
  const command = `/opt/ffmpeg/ffprobe -show_entries packet=pos,pts_time,flags -select_streams v -of compact=p=0:nk=1  -print_format json -show_format -show_streams "${objectUrl}" > "${probeKeyframesPath}"`

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
    console.log('Returning probeData!');
  }

  return JSON.parse(probeData);
}

const getKeyframeTimes = probeData => {
  // Original function, getting keyframes
  let keyframeTimes = [
    ...probeData.packets.filter(p => p.flags === 'K_'),
    probeData.packets[probeData.packets.length - 1]
  ].map(kfPacket => kfPacket.pts_time);


  keyframeTimes = keyframeTimes.reduce((segments, cur, idx) => {
    return idx < keyframeTimes.length - 1 ? [...segments, [cur, keyframeTimes[idx + 1]]] : segments;
  }, [])

  return keyframeTimes;
};

const getSafeKeyFrameTimes = probeData => {
  let keyframeTimes = [
    ...probeData.packets.filter(p => p.flags === 'K_'),
    probeData.packets[probeData.packets.length - 1]
  ].map(kfPacket => kfPacket.pts_time);

  keyframeTimes = keyframeTimes.reduce((segments, cur, idx) => {
    return idx < keyframeTimes.length - 1 ? [...segments, [cur, keyframeTimes[idx + 1]]] : segments;
  }, []);

  keyframeTimes.forEach(segment => {
    segment[1] = (+segment[1] - .001).toFixed(3)
  });

  return keyframeTimes;
}

const getEvenSegments = probeData => {
  // Alt approach, using standardized segment times regardless of keyframe data
  const lastKeyframeTime = +probeData.packets[probeData.packets.length - 1].pts_time
  const segmentTimes = [];

  for (let sec = 0; sec < lastKeyframeTime; sec += 6) {
    segmentTimes.push(String(sec));
  }

  segmentTimes.push(lastKeyframeTime);

  segmentTimes = segmentTimes.reduce((segments, cur, idx) => {
    return idx < segmentTimes.length - 1 ? [...segments, [cur, segmentTimes[idx + 1]]] : segments;
  }, [])

  return segmentTimes;
}



const saveJobData = ({ jobId, keyframeTimes, fileBasename, fileExt, simulateInvoke }) => {

  const totalTasks = keyframeTimes.length;
  const params = {
    TableName: jobsTable,
    Item: {
      "id": jobId,
      "totalTasks": totalTasks,
      "finishedTasks": 0,
      "filename": fileBasename,
      "status": "pending",
      "inputType": fileExt,
      "outputType": '.mp4',
      "createdAt": Date.now(),
      "completedAt": null
    }
  };

  dbWriter(params, 'job', simulateInvoke);
};

const saveSegmentsData = ({ jobId, keyframeTimes, simulateInvoke }) => {

  let segmentNum = 0;
  const filenames = [];
  for (segmentNum; segmentNum < keyframeTimes.length; segmentNum += 1) {
    const id = String(segmentNum).padStart(3, '0');
    const filename = `${jobId}-${id}`;
    filenames.push(filename);

    const params = {
      TableName: segmentsTable,
      Item: {
        "jobId": jobId,
        "id": id,
        "startTime": keyframeTimes[segmentNum][0],
        "endTime": keyframeTimes[segmentNum][1],
        "filename": filename,
        "status": "pending",
        "createdAt": Date.now(),
        "completedAt": null
      }
    };
    dbWriter(params, 'segment', simulateInvoke)
  }

  return filenames;
}


const dbWriter = (params, item, simulateInvoke) => {
  if (simulateInvoke) {
    console.log(`Simulating write to ${item} table with params ${JSON.stringify(params)}`);
    return;
  }
  console.log(`Adding a new ${item} with params...`, params);
  DDB.put(params, (err, data) => {
    if (err) {
      console.log(`Unable to add ${item}. Error JSON:`, JSON.stringify(err, null, 2));
    } else {
      console.log(`Added ${item}:`, JSON.stringify(data, null, 2));
    }
  });
}

const writeToManifest = (filenames, jobId) => {
  const segmentPath = `file https://bento-transcoded-segments.s3.amazonaws.com/${jobId}/`
  let manifest = ""
  for (let segment of filenames) {
    // manifest += `file ${segment}.mp4\n`;
    manifest += `${segmentPath}${segment}.mp4\n`;
  }
  console.log('writing manifest: ', manifest);
  writeFileSync(manifestPath, manifest, err => {
    console.log(`${err ? err : 'successfully wrote to manifest'}`);
  })
  return readFileSync(manifestPath)
}

const invokeTranscode = async (payload, simulateInvoke) => {
  const invokeParams = {
    FunctionName: transcodeLambdaAddress,
    InvocationType: "Event",
    LogType: 'None',
    ClientContext: 'BentoExec',
  };

  invokeParams['Payload'] = JSON.stringify(payload);

  if (simulateInvoke) {
    console.log('Simulating invoke of bento-transcode with the payload: ', invokeParams);
    return;
  }

  console.log('Invoking bento-transcode with payload: ', invokeParams);

  await lambda.invoke(invokeParams).promise();
}


module.exports.execute = async (event) => {
  const INVOKE_LIMIT = event.invokeLimit || 200;

  global.gc(); // for garbage collection in warm lambda

  if (!event.Records) {
    console.log("not an s3 invocation!");
    return;
  }

  for (const record of event.Records) {
    if (!record.s3) {
      console.log("not an s3 invocation!");
      continue;
    }

    const [videoKey, videoBucket] = [record.s3.object.key, record.s3.bucket.name];
    const filePathObj = path.parse(`${videoKey}`);
    const [fileBasename, fileExt] = [filePathObj.name, filePathObj.ext];
    const jobId = `${Date.now()}`;

    const signedParams = { Bucket: startBucket, Key: videoKey, Expires: 900 };
    var signedInputUrl = s3.getSignedUrl('getObject', signedParams);

    console.log('Firing up pipeline for ', videoKey, videoBucket)
    const probeData = probeVideo(signedInputUrl);

    // Overlapping end/start times
    let keyframeTimes = getKeyframeTimes(probeData)

    console.log(`keyframeTimes: ${keyframeTimes}`);

    // Reduces keyframe times into nested array pairs of start and end times. Stylistic choice, at this point
    // keyframeTimes = keyframeTimes.reduce((segments, cur, idx) => {
    //   return idx < keyframeTimes.length - 1 ? [...segments, [cur, keyframeTimes[idx + 1]]] : segments;
    // }, [])

    const simulateInvoke = event.simulateInvoke || keyframeTimes.length >= INVOKE_LIMIT;

    console.log("Keyframe times: ", keyframeTimes)
    console.log("inputPath", inputPath)
    console.log("jobId", jobId)

    saveJobData({
      jobId,
      keyframeTimes,
      fileBasename,
      fileExt,
      simulateInvoke
    });

    const segmentFilenames = saveSegmentsData({ jobId, keyframeTimes, simulateInvoke });

    const manifest = writeToManifest(segmentFilenames, jobId);

    if (!simulateInvoke) {
      console.log('Putting manifest in transcoded bucket')
      await s3
        .putObject({
          Bucket: transcodedBucket,
          Key: `${jobId}/manifest.ffcat`,
          Body: manifest
        })
        .promise();
    }

    console.log(`${segmentFilenames.length} segments to transcode. ${simulateInvoke ? 'Simulating...' : 'Beginning invocation...'}`)

    for (let idx = 0; idx < segmentFilenames.length; idx += 1) {
      const payload = {
        segmentData: {
          videoKey: videoKey,
          jobId: jobId,
          segmentName: segmentFilenames[idx],
          startTime: keyframeTimes[idx][0],
          endTime: keyframeTimes[idx][1]
        }
      };

      await invokeTranscode(payload, simulateInvoke)
    }

    unlinkSync(manifestPath)
    unlinkSync(probeKeyframesPath)
  }
};
