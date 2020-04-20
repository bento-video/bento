# Bento Pipeline (on AWS Resources) Deployment Guide

## Prerequisites
- [Node](https://nodejs.org/en/) 6 or higher
- [npm](https://www.npmjs.com/get-npm)
- [Docker](https://www.docker.com/), ensure docker daemon is running
- [AWS](https://aws.amazon.com) account
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) installed and [configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)

## 1. Clone [Bento](https://github.com/bento-video/bento.git) repo
create a new folder to store the Bento app, we'll refer to this folder as the **Bento root folder**, within this new folder:

`git clone https://github.com/bento-video/bento.git`

`mv ./bento/pipeline-setup.js ./`

### customize S3 bucket policy (optional)

Within the *Bento root folder* there is a **serverless.yml** deployment file. By default the S3 bucket that contains your processed videos will allow GET requests originating from any IP address. If you wish to restrict access to only a given IP address edit line 20 of the **serverless.yml** file. Note that you will have to update this IP address whenever your IP address changes. Refer to [AWS docs](https://docs.aws.amazon.com/AmazonS3/latest/dev/example-bucket-policies.html#example-bucket-policies-use-case-2) for further details. 

## 2. Create [ffmpeg](https://www.ffmpeg.org/) layer, install [Serverless](https://serverless.com/framework/docs/getting-started/) framework, install Serverless [pseudo-parameters](https://serverless.com/plugins/serverless-pseudo-parameters/) package, deploy Bento 

`node pipeline-setup.js`

## 3. Create [AWS CLI Lambda layer](https://github.com/aws-samples/aws-lambda-layer-awscli/tree/node12-runtime-support)
### Clone Node 12 runtime branch 
within *Bento root folder* create a new folder, within this new folder:

`git clone -b node12-runtime-support https://github.com/aws-samples/aws-lambda-layer-awscli.git`

`cd aws-lambda-layer-awscli`

### Update the makefile
an S3 bucket name is needed, you can use the bucket Serverless created during the ffmpeg layer deployment

view all your S3 buckets:

`aws s3 ls`

the newly created bucket's name will contain `serverlessdeploymentbucket`, take note of the bucket's full name

make the following change in the *makefile* (found within the `aws-lambda-layer-awscli` folder):

`S3BUCKET ?= your-bucket-name`

### Build and upload the awscli layer
`make layer-build-python27 layer-zip layer-upload layer-publish`

## 4. Add the awsCLI layer to the Merger Lambda

Enter the following:

`aws lambda list-layers`

it will list your Layer attributes, the **arn** of the **awsCLI** and **ffmpeg layers** are needed for the following command:

`aws lambda update-function-configuration --function-name merger --layers awsCLI-layer-arn ffmpeg-layer-arn`





