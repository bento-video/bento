const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({
  region: "us-east-1",
});
const mergeFunction = process.env.mergeLamdaArn;

exports.mergeInvoke = async (event) => {
  const eventRecord = event.Records[0];
  const dbEventType = eventRecord.eventName;
  console.log("MSSG:'mergeInvoke'(func): [FIRED] event: ", event);

  if (dbEventType !== "MODIFY") {
    console.log(
      `\nMSSG:'mergeInvoke'(func): [NOT A MODIFY] -DBEntryType: ${dbEventType}\nnot a modification of an entry in the Jobs table.`
    );
    return;
  }

  const entryInfo = eventRecord.dynamodb.NewImage;
  console.log(entryInfo);

  if (entryInfo.status.S !== "pending") {
    console.log(
      `\nMSSG:'mergeInvoke'(func): [NO INVOCATION REQUEST] \njobs table was updated, not in such a way so as to invoke the merge function.`
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
      `\nMSSG:'mergeInvoke'(func): [EQUAL TASKS] \n'merge'(func) should be invoked on this condition`
    );

    console.log("MSSG: Attempting merge invoke...");

    await lambda
      .invoke(mergeParams)
      .promise()
      .then((data) => {
        console.log("MSSG: Merge invoked successfully");
        console.log("Payload: ", data);
      })
      .catch((error) => {
        console.log("MSSG: Encountered error when trying to invoke merge");
        console.log(error);
      });
  }
};
