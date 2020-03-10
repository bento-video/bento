const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

const strTemplate = "output000";
const templateLength = strTemplate.length;

const loopChunks = (params, action => {
  for (let num = 0; num < params.chunkCount; num += 1) {
    let suffix = String(num);
    let keep_char_count = templateLength - suffix.length;
    let prefix = strTemplate.slice(0, keep_char_count);

    let chunkKey = `${prefix}${suffix}.${params.fileFormat}`;

    action(params, chunkKey); 
  }
});

const getFiles = (params, chunkKey => {
  //get the file
  let s3Object = await s3
  .getObject({
    Bucket: "testencodeinput",
    Key: chunkKey
  })
  .promise();
  // write file to disk
  writeFileSync(`/tmp/${params.videoName}/${chunkKey}`, s3Object.Body);
});

const unlink = (chunkCount) => {unlinkSync(chunkKey)}

module.exports.simpleMerge = async params => {
  const concatFilePath = `/tmp/${params.videoName}/${params.videoName}.${params.fileFormat}`;
  const manifestPath = `/tmp/${params.videoName}/merge_manifest.txt`

  // write each chunk to lambda temp
  loopChunks(params, getFiles);

  // merge files stored on lambda
  spawnSync(
    "/opt/ffmpeg/ffmpeg",
    [
      "-f", "concat",
      "-safe", "0",
      "-i", manifestPath,
      "-c", "copy",
      concatFilePath
    ],
    { stdio: "inherit" }
  );
  // read concatenated file from disk
  const concatFile = readFileSync(concatFilePath);

  // delete the temp files
  unlinkSync(concatFilePath);
  unlinkSync(manifestPath);

  loopChunks(_, unlink);

  // upload mp4 to s3
  await s3
    .putObject({
      Bucket: "testencodeoutput",
      Key: `${params.videoName}.${params.fileFormat}`,
      Body: concatenatedFile
    })
    .promise();
};
