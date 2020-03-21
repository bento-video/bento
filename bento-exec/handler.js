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
const transcodedBucket = process.env.TRANSCODED_VIDEO_BUCKET;
const transcodeLambdaAddress = process.env.TRANSCODE_LAMBDA_ADDRESS;
const jobsTable = "Jobs";
const segmentsTable = "Segments";
const manifestPath = '/tmp/manifest.ffcat';
const probeKeyframesPath = "/tmp/probeKeyframes.json"
const probeStreamsPath = "/tmp/probeStreams.json"
const INVOKE_LIMIT = 200;


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


const probeStreams = objectUrl => {
  const command = `/opt/ffmpeg/ffprobe ${objectUrl} -of compact=p=0:nk=1  -print_format json -show_streams > ${probeStreamsPath}`

  console.log('Probing for stream data at path ', probeStreamsPath);

  execSync(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`Success!`);
  });

  console.log('returning streams data')
  return JSON.parse(readFileSync(probeStreamsPath));
}

const saveJobData = ({ jobId, keyframeTimes, hasAudio, audioData, fileBasename, fileExt, simulateInvoke }) => {

  const totalTasks = keyframeTimes.length - 1;
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
      "hasAudio": hasAudio,
      "audioType": hasAudio ? `.${audioData.extension}` : null,
      "audioKey": hasAudio ? audioData.audioKey : null,
      "createdAt": Date.now(),
      "completedAt": null
    }
  };

  dbWriter(params, 'job', simulateInvoke);
};

const saveSegmentsData = ({ jobId, keyframeTimes, simulateInvoke }) => {

  let segmentNum = 0;
  const filenames = [];
  for (segmentNum; segmentNum < keyframeTimes.length - 1; segmentNum += 1) {
    const id = String(segmentNum).padStart(3, '0');
    const filename = `${jobId}-${id}`;
    filenames.push(filename);

    const params = {
      TableName: segmentsTable,
      Item: {
        "jobId": jobId,
        "id": id,
        "startTime": keyframeTimes[segmentNum],
        "endTime": keyframeTimes[segmentNum + 1],
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

const writeToManifest = (filenames) => {
  let manifest = ""
  for (let segment of filenames) {
    manifest += `file ${segment}.mp4\n`;
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

  await lambda.invoke(invokeParams, (err, data) => {
    console.log(`${err ? err : data}`)
  }).promise();
}

const extractAndSaveAudio = async (objectUrl, jobId, streamData) => {
  console.log("objectUrl", objectUrl)

  console.log("jobId", jobId)

  const audioData = extractAudio({ objectUrl, jobId, streamData });
  const audioKey = await putAudio(audioData, jobId);
  unlinkSync(audioData.path);

  return { ...audioData, audioKey };
}

const extractAudio = ({ objectUrl, jobId, streamData }) => {
  const extension = streamData.filter(stream => stream.codec_type === 'audio')[0].codec_name;
  const audioPath = `/tmp/${jobId}-audio.${extension}`

  const command = `/opt/ffmpeg/ffmpeg -i ${objectUrl} -vn -acodec copy ${audioPath}`

  console.log("object URL", objectUrl)
  console.log(`Extracting audio from ${objectUrl}, saving to ${audioPath}`)

  execSync(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
    }
  });

  console.log('Saved audio!')
  return {
    path: audioPath,
    extension
  };
}

const putAudio = async (audioData, jobId) => {
  const { path, extension } = audioData;
  const audioFile = readFileSync(path);
  const key = `${jobId}/${jobId}-audio.${extension}`
  console.log(`Putting audio file at ${path} in ${transcodedBucket}`)
  await s3.putObject({
    Bucket: transcodedBucket,
    Key: key,
    Body: audioFile
  }).promise();

  return key;
}

module.exports.startPipeline = async (event) => {
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



    const inputPath = `https://${videoBucket}.s3.amazonaws.com/${videoKey}`;
    console.log("inputPath", inputPath)

    console.log('Firing up pipeline for ', videoKey, videoBucket)
    const probeData = probeVideo(inputPath);

    // Overlapping end/start times
    let keyframeTimes = [
      ...probeData.packets.filter(p => p.flags === 'K_'),
      probeData.packets[probeData.packets.length - 1]
    ].map(kfPacket => kfPacket.pts_time);

    console.log(`keyframeTimes: ${keyframeTimes}`);


    // keyframeTimes = keyframeTimes.reduce((segments, cur, idx) => {
    //   return idx < keyframeTimes.length - 1 ? [...segments, [cur, keyframeTimes[idx + 1]]] : segments;
    // }, [])


    const simulateInvoke = event.simulateInvoke || keyframeTimes.length >= INVOKE_LIMIT;

    const streamData = probeStreams(inputPath).streams
    const hasAudio = streamData.map(stream => stream.codec_type).indexOf("audio") !== -1;

    console.log("Keyframe times: ", keyframeTimes)
    console.log('Streams: ', streamData);
    console.log("inputPath", inputPath)
    console.log("jobId", jobId)

    const audioData = hasAudio ?
      await extractAndSaveAudio(inputPath, jobId, streamData) :
      { path: null, extension: null };

    saveJobData({
      jobId,
      keyframeTimes,
      hasAudio,
      audioData,
      fileBasename,
      fileExt,
      simulateInvoke
    });

    const segmentFilenames = saveSegmentsData({ jobId, keyframeTimes, simulateInvoke });

    const manifest = writeToManifest(segmentFilenames);

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
          startTime: keyframeTimes[idx],
          endTime: keyframeTimes[idx + 1]
        }
      };

      await invokeTranscode(payload, simulateInvoke)
    }

    unlinkSync(manifestPath)
    unlinkSync(probeKeyframesPath)
  }
};
