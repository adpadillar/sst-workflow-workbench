import { Resource } from "sst";
import { createLambdaHandler } from "sst-wdk-world";

export const handler = createLambdaHandler({
  queueUrl: Resource.WorkflowQueue.url,
  schedulerRoleArn: Resource.SchedulerRole.arn,
  workflowServerUrl: Resource.MyWeb.url,
});
