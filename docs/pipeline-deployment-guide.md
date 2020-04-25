# Bento Pipeline (on AWS Resources) Deployment Guide

## Prerequisites
- [Node](https://nodejs.org/en/) 6 or higher
- [npm](https://www.npmjs.com/get-npm)
- [Docker](https://www.docker.com/), ensure Docker Engine is running
- [AWS](https://aws.amazon.com) account
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) installed and [configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)

## 1. Clone [Bento](https://github.com/bento-video/bento.git) repo
Create a new folder to store the Bento app, we'll refer to this folder as the **Bento root folder**, within this folder:

```console
git clone https://github.com/bento-video/bento.git && mv ./bento/pipeline-setup.js ./
```

### Customize S3 bucket policy (optional)

Within the *Bento root folder* there is a **serverless.yml** deployment file. By default the S3 bucket that contains your processed videos will allow GET requests originating from any IP address. If you wish to restrict access to only a given IP address edit line 20 of the **serverless.yml** file. Note that you will have to update this IP address whenever your IP address changes. Refer to [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/dev/example-bucket-policies.html#example-bucket-policies-use-case-2) for further details. 

## 2. Install and configure [Serverless] Framework(https://serverless.com/framework/docs/) 

```console
npm install -g serverless 
```

Configure Serverless with your AWS credentials with the command below or visit [Serverless AWS docs](https://serverless.com/framework/docs/providers/aws/cli-reference/config-credentials/) for more options.

```console
serverless config credentials --provider provider --key aws_access_key_id --secret aws_secret_access_key
```

## 3. Create a [ffmpeg](https://www.ffmpeg.org/) Lambda layer, install Serverless [pseudo-parameters](https://serverless.com/plugins/serverless-pseudo-parameters/) plugin, deploy Bento 

```console
node pipeline-setup.js
```

## 4. Create a [AWS CLI Lambda layer](https://github.com/aws-samples/aws-lambda-layer-awscli/tree/node12-runtime-support)
### Clone Node 12 runtime branch 
within *Bento root folder*:

```console
git clone -b node12-runtime-support https://github.com/aws-samples/aws-lambda-layer-awscli.git &&
cd aws-lambda-layer-awscli
```

### Update the makefile
An S3 bucket name is needed. You can use the bucket Serverless created during the ffmpeg layer deployment as decribed below. To view all you S3 buckets:

```console
aws s3 ls
```

The newly created bucket's name will contain `bento-prod-serverlessdeploymentbucket`, take note of the bucket's full name. Make the following change in the *makefile* (found within the `aws-lambda-layer-awscli` folder):

```console
S3BUCKET ?= your-bucket-name
```

### Build and upload the awscli layer

```console
make layer-build-python27 layer-zip layer-upload layer-publish
```

## 5. Add the awsCLI layer to the Merger Lambda

Enter the following:

```console
aws lambda list-layers
```

This will output all of your available layers' attributes. The **arn** of the **awsCLI** and **ffmpeg layers** are needed for the following command:

```console
aws lambda update-function-configuration --function-name merger --layers awsCLI-layer-arn ffmpeg-layer-arn
```






