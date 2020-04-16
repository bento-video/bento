"use strict";
const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const DDB = new AWS.DynamoDB.DocumentClient();
const bucket = process.env.NEW_VIDEO_BUCKET;
const { readFileSync, unlinkSync } = require("fs");
const { execSync } = require("child_process");
const { extname } = require("path");

const probeVideoDataPath = "/tmp/probeVideoData.json";
const videosTable = "BentoVideos"; //process.env.VIDEOS_TABLE; notify Mike of this ENV var. Should be set up already. Needs to be BentoVideos rather than Videos

const probeVideo = (objectUrl) => {
  const command = `/opt/ffmpeg/ffprobe -v error -show_entries stream=width,height -show_entries format=size,duration -print_format json -i "${objectUrl}" > "${probeVideoDataPath}"`;

  execSync(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`ERROR when probing for video data: ${error}`);
      return;
    }
  });

  const probeData = readFileSync(probeVideoDataPath);
  return JSON.parse(probeData);
};

module.exports.recordUpload = async (event, context, callback) => {
  const id = event.id;
  const filename = event.filename;
  const format = extname(filename);

  global.gc();

  const urlParams = { Bucket: bucket, Key: filename, Expires: 900 };
  const signedUrl = s3.getSignedUrl("getObject", urlParams);
  const probeData = probeVideo(signedUrl);

  const { width, height } = probeData.streams[0];
  const { duration, size } = probeData.format;
  const resolution = `${width}x${height}`;

  const videoDbParams = {
    TableName: videosTable,
    Item: {
      id,
      filename,
      format,
      resolution,
      duration: Number(duration),
      size: Number(size),
      versions: 0,
    },
  };

  const dbEntry = await DDB.put(videoDbParams)
    .promise()
    .then((data) => {
      console.log("Added video");
      return videoDbParams;
    })
    .catch((err) => {
      console.log(
        `Unable to add video. Error JSON:`,
        JSON.stringify(err, null, 2)
      );
    });

  console.log("DB ENTRY: ", dbEntry);
  unlinkSync(probeVideoDataPath);
  callback(null, dbEntry.Item);
};
