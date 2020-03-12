const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const s3 = new AWS.S3();

AWS.config.update({
  region: "us-east-2",
  endpoint: "https://dynamodb.us-east-2.amazonaws.com"
});

const docClient = new AWS.DynamoDB.DocumentClient();

const getJobData = async dbQueryParams => {
  return await docClient.get(dbQueryParams, function (err, data) {
    if (err) {
      console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("GetItem succeeded:");
      return data;
    }
  }).promise();
};

// const loopChunks = (params, action => {
//   for (let num = 0; num < params.chunkCount; num += 1) {
//     let suffix = String(num);
//     let keep_char_count = templateLength - suffix.length;
//     let prefix = chunkNameTemplate.slice(0, keep_char_count);

//     let chunkKey = `${prefix}${suffix}.${params.fileFormat}`;

//     action(params, chunkKey);
//   }
// });

// const getFiles = async(params, chunkKey => {
//   //get the file
//   let s3Object =
//     await s3.getObject({
//       Bucket: "testencodeinput",
//       Key: chunkKey
//     })
//       .promise();
//   // write file to disk
//   writeFileSync(`/tmp/${params.videoName}/${chunkKey}`, s3Object.Body);
// });

// const unlink = (chunkCount) => { unlinkSync(chunkKey) }

module.exports.simpleMerge = async () => {
  const table = "Jobs";
  const id = 12345;

  const dbQueryParams = {
    TableName: table,
    Key: { id }
  };

  // is this await still required?
  const jobData = await getJobData(dbQueryParams);

  const jobId = String(jobData.Item.id);
  const fileFormat = jobData.Item.outputType;
  const chunkCount = jobData.Item.totalTasks;
  const filename = jobData.Item.filename;

  const params = {
    jobId,
    fileFormat,
    chunkCount
  };

  const chunkNameTemplate = `${jobId}/${jobId}-000`;
  const templateLength = chunkNameTemplate.length;

  const concatFilePath = `/tmp/${filename}${fileFormat}`;
  const manifestPath = `/tmp/merge-manifest.txt`;

  // write each chunk to lambda temp
  // loopChunks(params, getFiles);

  for (let num = 0; num < chunkCount; num += 1) {
    let suffix = String(num);
    let keep_char_count = templateLength - suffix.length;
    let prefix = chunkNameTemplate.slice(0, keep_char_count);

    let chunkKey = `${prefix}${suffix}${fileFormat}`;

    let s3Object = await s3.getObject({
      Bucket: "testencodeinput",
      Key: chunkKey
    }).promise();
    //write file to disk
    writeFileSync(`/tmp/${chunkKey.slice(6)}`, s3Object.Body);
  }

  // write manifest
  let s3Object = await s3.getObject({
    Bucket: "testencodeinput",
    Key: "12345/merge-manifest.txt"
  }).promise();
  //write file to disk
  writeFileSync(manifestPath, s3Object.Body);

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

  for (let num = 0; num < chunkCount; num += 1) {
    let suffix = String(num);
    let keep_char_count = templateLength - suffix.length;
    let prefix = chunkNameTemplate.slice(0, keep_char_count);

    let chunkKey = `${prefix}${suffix}${fileFormat}`;

    unlinkSync('/tmp/' + chunkKey.slice(6));
  }

  // upload mp4 to s3
  await s3
    .putObject({
      Bucket: "testencodeoutput",
      Key: `${jobId}-${filename}${fileFormat}`,

      Body: concatFile
    })
    .promise();

  // update job status on DB to completed

  const putParams = {
    TableName: table,
    Key: { 'id': id },
    UpdateExpression: "set #s = :stat",
    ExpressionAttributeNames: {
      "#s": "status"
    },
    ExpressionAttributeValues: {
      ":stat": "completed"
    },
    ReturnValues: `UPDATED_NEW`
  };

  console.log("Updating the item...");
  await docClient.update(putParams, function (err, data) {
    if (err) {
      console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2));
    } else {
      console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
    }
  }).promise()
};
