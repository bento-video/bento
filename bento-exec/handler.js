'use strict';
const path = require('path');
const { spawnSync } = require("child_process");
const { execSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync, createWriteStream } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const DDB = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda({
  region: "us-east-1"
});
const transcodedBucket = process.env.TRANSCODED_VIDEO_BUCKET;
const jobsTable = "Jobs";
const segmentsTable = "Segments";
const manifestPath = '/tmp/manifest.ffcat';

const getVideo = async (key, bucket) => {

  const videoObject = await s3.getObject({
    Bucket: bucket,
    Key: key
  }).promise();

  const path = `/tmp/${key}`;
  console.log(`Writing file to ${path}`);

  writeFileSync(path, videoObject.Body);

  return path;
};

const probeVideo = filepath => {
  const jsonPath = `${filepath}.json`
  console.log('Probing ', filepath, ' saving to ', jsonPath)

  const result = spawnSync(
    '/opt/ffmpeg/ffprobe',
    [
      "-show_entries", "packet=pos,pts_time,flags", "-select_streams", "v", "-of", "compact=p=0:nk=1", "-print_format", "json", "-show_format", "-show_streams", `${filepath}`
    ],
    { stdio: "pipe", stderr: "pipe" }
  );

  console.log("Result is:", result.stdout.toString(), result.stderr.toString());

  writeFileSync(jsonPath, result.stdout, err => {
    if (err) {
      console.log(err)
    }
    console.log("success?")
  })

  console.log(`Trying to read file at: ${jsonPath}`);
  const probeData = readFileSync(jsonPath);
  if (probeData) {
    console.log('Returning probeData:', JSON.parse(probeData));
  }

  return JSON.parse(probeData);
};

const saveJobData = (jobId, keyframeTimes, fileBasename, fileExt) => {

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
      "createdAt": new Date,
      "completedAt": null
    }
  };

  dbWriter(params, 'job');
};

const saveSegmentsData = (jobId, keyframeTimes) => {

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
        "filename": filename,
        "status": "pending",
        "createdAt": new Date,
        "completedAt": null
      }
    };
    dbWriter(params, 'segment')
  }

  return filenames;
}


const dbWriter = (params, item) => {
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
  const stream = createWriteStream(manifestPath, { flags: 'a' })
  for (let segment of filenames) {
    stream.write(`file ${segment}.mp4\n`);
  }

  return readFileSync(manifestPath)
}

module.exports.startPipeline = async (event) => {
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

    console.log('Firing up pipeline for ', videoKey, videoBucket)

    const videoPath = await getVideo(videoKey, videoBucket);

    const probeData = probeVideo(videoPath);

    const keyframeTimes = probeData.packets.filter(p => p.flags === 'K_').map(kfPacket => kfPacket.pts_time);

    console.log("Keyframe times: ", keyframeTimes)

    saveJobData(jobId, keyframeTimes, fileBasename, fileExt);
    const segmentFilenames = saveSegmentsData(jobId, keyframeTimes);
    const manifest = writeToManifest(segmentFilenames);



    await s3
      .putObject({
        Bucket: transcodedBucket,
        Key: `${jobId}/manifest.ffcat`,
        Body: manifest
      })
      .promise();

    segmentFilenames.forEach((segmentFilename, idx) => {
      const payload = {
        videoKey: videoKey,
        jobId: jobId,
        segmentFilename: segmentFilename,
        startTime: keyframeTimes[idx],
        endTime: keyframeTimes[idx + 1]
      }
      console.log('Invoking bento-transcode with payload: ', payload)
    })

    unlinkSync(manifestPath)
    unlinkSync(`${videoPath}.json`)
    unlinkSync(videoPath)
  }


};
