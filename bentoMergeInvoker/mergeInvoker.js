const AWS = require("aws-sdk");
const lambda = new AWS.Lambda({
  region: "us-east-1"
});
const mergeFunction = process.env.MERGER_LAMBDA_ADDRESS;

exports.mergeInvoke = async (event) => {
  const eventRecord = event.Records[0];
  const dbEventType = eventRecord.eventName;

  if (dbEventType !== "MODIFY") {
    console.log(`\nFrom 'mergeInvoke'(func):[NOT A MODIFY] -DBEntryType: ${dbEventType}\nnot a modification of an entry in the Jobs table.`);
    return;
  }

  const entryInfo = eventRecord.dynamodb.NewImage;

  if (entryInfo.status.S !== "pending") {
    console.log(`\nFrom 'mergeInvoke'(func):[NO INVOCATION REQUEST] \njobs table was updated, not in such a way so as to invoke the merge function.`);
    return;
  }

  const jobID = entryInfo.id.S;
  const finishedTasks = entryInfo.finishedTasks.N;
  const totalTasks = entryInfo.totalTasks.N;

  const mergeParams = {
    FunctionName: mergeFunction,
    InvocationType: "Event",
    Payload: JSON.stringify({ jobId: jobID }),
    LogType: 'None',
    ClientContext: 'MergeInvokerFunction',
  };

  if (finishedTasks === totalTasks) {
    console.log(`\nFrom 'mergeInvoke'(func):[EQUAL TASKS] \n'merge'(func) should be invoked on this condition`);

    console.log('Attempting merge invoke...')

    await lambda.invoke(mergeParams).promise()
      .then(data => {
        console.log("MSSG: Merge invoked successfully");
        console.log("Payload: ", data);
      })
      .catch(error => {
        console.log("MSSG: Encountered error when trying to invoke merge");
        console.log(error);
      });
  }
};
