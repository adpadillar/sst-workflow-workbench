// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return {
      name: "sst-wf-workbench",
      removal: "remove",
      home: "aws",
    };
  },
  async run() {
    const queue = new sst.aws.Queue("WorkflowQueue");

    const workflowTable = new sst.aws.Dynamo("WorkflowTable", {
      fields: {
        PK: "string", // e.g. RUN#id, HOOK#id
        SK: "string", // e.g. STEP#1, EVT#xyz, RUN
        entityType: "string", // "RUN" | "STEP" | "EVENT" | "HOOK"
        runId: "string",
        workflowName: "string",
        status: "string",
        correlationId: "string",
        token: "string",
        createdAt: "number",
      },
      primaryIndex: { hashKey: "PK", rangeKey: "SK" },

      globalIndexes: {
        // List all runs for a workflow name
        workflowNameIndex: { hashKey: "workflowName", rangeKey: "createdAt" },
        // List all runs by status
        statusIndex: { hashKey: "status", rangeKey: "createdAt" },
        // Get hook by token
        tokenIndex: { hashKey: "token" },
        // Get events by correlationId
        correlationIndex: { hashKey: "correlationId", rangeKey: "createdAt" },
        // Optional: query all steps/events for a given run
        runIdIndex: { hashKey: "runId", rangeKey: "createdAt" },
        // NEW: query by entity type (e.g., list all runs globally)
        entityTypeIndex: { hashKey: "entityType", rangeKey: "createdAt" },
      },
    });

    const nextjs = new sst.aws.Nextjs("MyWeb", {
      link: [queue, workflowTable],
      environment: {
        WORKFLOW_TARGET_WORLD: "sst-wdk-world",
        WORKFLOW_SQS_QUEUE_URL: queue.url,
        WORKFLOW_TABLE_NAME: workflowTable.name,
      },
      dev: {
        url: "http://localhost:3000",
      },
    });

    const awsSchedulerRole = new aws.iam.Role("AwsSchedulerRole", {
      assumeRolePolicy: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "scheduler.amazonaws.com",
            },
          },
        ],
      },
    });

    const schedulerRole = new sst.Linkable("SchedulerRole", {
      properties: {
        arn: awsSchedulerRole.arn,
      },
    });

    const subscriberLambda = queue.subscribe({
      link: [queue, nextjs, schedulerRole],
      handler: "aws/lambda.handler",
      permissions: [
        {
          effect: "allow",
          actions: ["scheduler:CreateSchedule"],
          resources: ["*"],
        },
        {
          effect: "allow",
          actions: ["iam:PassRole"],
          resources: [awsSchedulerRole.arn],
        },
      ],
    });

    // --- 3. The Permission Policy for the Role ---
    // This policy attaches to the role and grants 'lambda:InvokeFunction'.
    new aws.iam.RolePolicy("schedulerPolicy", {
      role: awsSchedulerRole.name,
      policy: $interpolate`{
      "Version": "2012-10-17",
      "Statement": [{
          "Effect": "Allow",
          "Action": "lambda:InvokeFunction",
          "Resource": "${subscriberLambda.nodes.function.arn}"
      }]
  }`,
    });
  },
});
