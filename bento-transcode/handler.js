'use strict';
const path = require('path');
const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, unlinkSync } = require("fs");
const AWS = require("aws-sdk");
const outputBucketName = process.env.TRANSCODED_VIDEO_BUCKET;
const startBucketName = process.env.START_VIDEO_BUCKET;
const mergeLambdaAddress = process.env.MERGE_LAMBDA_ARN;
const s3 = new AWS.S3();
const DDB = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda({
  region: "us-east-1"
});
const jobsTable = "Jobs";
const tasksTable = "Segments";


const transcodeVideo = async (segmentData) => {
  console.log('In transcodeVideo fx: ', segmentData);

  // get the file
  const s3Object = await s3
    .getObject({
      Bucket: startBucketName,
      Key: segmentData.videoKey
    })
    .promise();
  const inputPath = `/tmp/${segmentData.videoKey}`
  const outputPath = `/tmp/${segmentData.segmentName}-transcoded.mp4`
  console.log(`Writing to ${inputPath}`)

  // write file to disk
  writeFileSync(inputPath, s3Object.Body);
  // convert to mp4!

  console.log(`Spawning ffmpeg transcoding, inputPath is: ${inputPath}  outputPath is: ${outputPath}`)

  spawnSync(
    '/opt/ffmpeg/ffmpeg',
    [
      "-i", inputPath,
      "-ss", segmentData.startTime,
      "-to", segmentData.endTime,
      "-c:v", "libx264", "-c:a", "aac", outputPath
    ],
    { stdio: "inherit" }
  )

  console.log(`Trying to read file at: ${outputPath}`)
  // read file from disk
  const transcodedVideo = readFileSync(outputPath);
  // delete the temp files
  console.log(`Trying to delete ${outputPath}`)

  unlinkSync(outputPath);

  console.log(`Trying to delete ${inputPath}`)

  unlinkSync(inputPath);
  // upload mp4 to s3
  // upload as 12345/12345-001.mp4
  await s3
    .putObject({
      Bucket: outputBucketName,
      Key: `${segmentData.jobId}/${segmentData.segmentName}.mp4`,
      Body: transcodedVideo
    })
    .promise();
}

const recordTransaction = async (segmentData) => {
  console.log('In recordTransaction fx: ', segmentData);

  // build transaction params
  const subTaskParams = {
    Key: {
      "jobId": segmentData.jobId,
      "id": segmentData.segmentId
    },
    TableName: tasksTable,
    UpdateExpression: 'SET #s = :new_status',
    ConditionExpression: '#s = :pending',
    ExpressionAttributeNames: {
      '#s': 'status'
    },
    ExpressionAttributeValues: {
      ':new_status': 'completed',
      ':pending': 'pending'
    },
    ReturnValues: "UPDATED_NEW"
  };

  const jobParams = {
    Key: {
      "id": segmentData.jobId
    },
    TableName: jobsTable,
    UpdateExpression: 'SET finishedTasks = finishedTasks + :val',
    ExpressionAttributeValues: {
      ':val': 1
    },
    ReturnValues: "UPDATED_NEW"
  };

  const params = {
    TransactItems: [
      {
        Update: subTaskParams
      }, {
        Update: jobParams
      }
    ]
  };

  console.log('Attempting write to db: ', JSON.stringify(params));
  let transactionResult = await DDB.update(subTaskParams).promise()
    .then(data => {
      console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
      return data;
    })
    .catch(err => {
      console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2))
      return null;
    });

  if (transactionResult) {
    return await DDB.update(jobParams).promise()
      .then(data => {
        console.log("UpdateItem succeeded:", JSON.stringify(data, null, 2));
        return data;
      })
      .catch(err => {
        console.error("Unable to update item. Error JSON:", JSON.stringify(err, null, 2))
        return null;
      });
  }
}


/*
{
  videoKey: 'humility_original.mp4',
  jobId: '1584375307747',
  segmentName: '1584375307747-039',
  startTime: '92.640000',
  endTime: '96.000000'
}
*/
module.exports.transcodeVideo = async (event) => {
  if (!event.segmentData) {
    console.log("not an bento-exec invocation!");
    return;
  }

  // grab data sent from event

  const segmentData = { ...event.segmentData };
  segmentData.segmentId = segmentData.segmentName.split('-')[1];  // => 000
  console.log(`Starting transcode function for ${JSON.stringify(segmentData)}`)

  // create params for DDB queries
  const getSubTaskParams = {
    TableName: tasksTable,
    Key: {
      "jobId": segmentData.jobId,
      "id": segmentData.segmentId
    }
  }

  const getJobStateParams = {
    TableName: jobsTable,
    Key: {
      "id": segmentData.jobId
    },
    ConsistentRead: true      // for strongly consistent reads
  }
  // grab subtask data from DDB
  // NOTE: DDB.get returns an empty object if it can't find a record that matches the query. must test for this condition
  const subtaskData = await DDB.get(getSubTaskParams).promise()
    .then(data => {
      console.log("Get subtask succeeded:", JSON.stringify(data, null, 2));
      return data;
    })
    .catch(err => console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2)));

  // if segment already transcoded, exit function
  if (!subtaskData.Item.status || subtaskData.Item.status !== 'pending') {
    console.log("Segment not in pending state. Current status: ", subtaskData.Item.status)
    return;
  }

  await transcodeVideo(segmentData);
  const transactionResult = await recordTransaction(segmentData);

  const mergeParams = {
    FunctionName: mergeLambdaAddress,
    InvocationType: "Event",
    Payload: JSON.stringify({ jobId: segmentData.jobId }),
    LogType: 'None',
    ClientContext: 'TranscodeFunction',
  };

  // get updated job and invoke merge lambda if all jobs show as completed 
  const subtasksComplete = await DDB.get(getJobStateParams).promise()
    .then(data => {
      console.log("Get job succeeded:", JSON.stringify(data, null, 2));
      if (data.Item.finishedTasks === data.Item.totalTasks) {
        console.log("I'm the winner!")
        return true;
      }
    })
    .catch(err => console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2)));

  if (subtasksComplete) {
    console.log('Simulating merge invoke...')
    /*
    await lambda.invoke(mergeParams, (err, data) => {
      if (err) {
        console.error(JSON.stringify(err));
      } else {
        console.log(data);
      }
    }).promise() */
  }
};



