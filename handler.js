const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");

const s3 = new AWS.S3();

module.exports.simpleMerge = async (event, context) => {
  // if (!event.Records) {
  //   console.log("not an s3 invocation!");
  //   return;
  // }

  // for (const record of event.Records) {
  // r/v purpose of this outer for loop when refactoring to response to events

  // write concat txt file to lambda temp
  let s3Object = await s3
    // get the file
    .getObject({
      Bucket: "testencodeinput",
      Key: "concat_list.txt"
    })
    .promise();
  // write file to disk
  writeFileSync(`/tmp/concat_list.txt`, s3Object.Body);

  // write each chunk to lambda temp,
  const strTemplate = "output000";
  const templateLength = strTemplate.length;

  for (let num = 0; num < 41; num += 1) {
    let keep_char_count = templateLength - String(num).length;
    let suffix = String(num);

    let chunkKey = strTemplate.slice(0, keep_char_count) + suffix + ".mov";

    //get the file
    let s3Object = await s3
      .getObject({
        Bucket: "testencodeinput",
        Key: chunkKey
      })
      .promise();
    // write file to disk
    writeFileSync(`/tmp/` + chunkKey, s3Object.Body);
  }
  // merge files stored on lambda
  spawnSync(
    "/opt/ffmpeg/ffmpeg",
    [
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      `/tmp/concat_list.txt`,
      "-c",
      "copy",
      "/tmp/humility_transcoded.mov"
    ],
    { stdio: "inherit" }
  );
  // read .mov from disk
  const gifFile = readFileSync("/tmp/humility_transcoded.mov");

  // delete the temp files
  unlinkSync(`/tmp/humility_transcoded.mov`);
  unlinkSync(`/tmp/concat_list.txt`);

  for (let num = 0; num < 41; num += 1) {
    let keep_char_count = templateLength - String(num).length;
    let suffix = String(num);

    let chunkKey =
      `/tmp/` + strTemplate.slice(0, keep_char_count) + suffix + ".mov";

    unlinkSync(chunkKey);
  }

  // upload gif to s3
  await s3
    .putObject({
      Bucket: "testencodeoutput",
      Key: "humility_transcoded.mov",
      Body: gifFile
    })
    .promise();
};
