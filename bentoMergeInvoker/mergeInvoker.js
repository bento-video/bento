const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({
  region: "us-east-1",
});
const mergeFunction = process.env.MERGER_LAMBDA_ADDRESS;

exports.mergeInvoke = async (event) => {
  const eventRecord = event.Records[0];
  const dbEventType = eventRecord.eventName;
  console.log("MSG:'mergeInvoke'(func): [FIRED] event: ", event);

  if (dbEventType !== "MODIFY") {
    console.log(
      `\nMSG:'mergeInvoke'(func): [NOT A MODIFY] -DBEntryType: ${dbEventType}\nnot a modification of an entry in the Jobs table.`
    );
    return;
  }

  const entryInfo = eventRecord.dynamodb.NewImage;
  console.log(entryInfo);

  if (entryInfo.status.S !== "pending") {
    console.log(
      `\nMSG:'mergeInvoke'(func): [NO INVOCATION REQUEST] \njobs table was updated, not in such a way so as to invoke the merge function.`
    );
    return;
  }

  const jobID = Number(entryInfo.id.N); //jobId is Number in updated table
  const finishedTasks = entryInfo.finishedTasks.N;
  const totalTasks = entryInfo.totalTasks.N;

  const mergeParams = {
    FunctionName: mergeFunction,
    InvocationType: "Event",
    Payload: JSON.stringify({ jobId: jobID }),
    LogType: "None",
    ClientContext: "MergeInvokerFunction",
  };

  if (finishedTasks === totalTasks) {
    console.log(
      `\nMSG:'mergeInvoke'(func): [EQUAL TASKS] \n'merge'(func) should be invoked on this condition`
    );

    console.log("MSG: Attempting merge invoke...");

    await lambda
      .invoke(mergeParams)
      .promise()
      .then((data) => {
        console.log("MSG: Merge invoked successfully");
        console.log("Payload: ", data);
      })
      .catch((error) => {
        console.log("MSG: Encountered error when trying to invoke merge");
        console.log(error);
      });
  }
};
