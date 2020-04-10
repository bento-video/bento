# Deployment Guide

## Prerequisites
- [Node](https://nodejs.org/en/) 6 or higher
- [npm](https://www.npmjs.com/get-npm)
- [Docker](https://www.docker.com/), ensure docker daemon is running
- [AWS](https://aws.amazon.com) account
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) installed and [configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)


## 1. Install [Serverless](https://serverless.com/framework/docs/getting-started/) framework

`npm install -g serverless`

## 2. Install Serverless [pseudo-parameters](https://serverless.com/plugins/serverless-pseudo-parameters/) package 

`npm install serverless-pseudo-parameters`

## 3. Create ffmpeg Lambda layer
create a new folder (anywhere on your file system that isn't within a git repository), within that folder:

`git clone https://github.com/bento-video/ffmpeg-lambda-layer.git`

`cd ffmpeg-lambda-layer`

`mkdir layer`

`cd layer`

`curl -O https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz`

`tar xf ffmpeg-git-amd64-static.tar.xz`

`rm ffmpeg-git-amd64-static.tar.xz`

`mv ffmpeg-git-*-amd64-static ffmpeg`

`cd ..`

`sls deploy`

## 4. Create [AWS CLI Lambda layer](https://github.com/aws-samples/aws-lambda-layer-awscli/tree/node12-runtime-support)
### Clone Node 12 runtime branch 
create a new folder (anywhere on your file system that isn't within a git repository), within this new folder:

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

## 5. Clone and deploy[Bento] (https://github.com/bento-video/bento.git) repo
create a new folder to store the Bento app, within this new folder:

`git clone https://github.com/bento-video/bento.git`

`cd bento`

`sls deploy`

## 6. add awsCLI layer to merge function

- login to AWS console
- navigate to Lambda services
- click on `Layers`
- take note of `awscli-layer`'s arn
- click on `Functions`
- select `merger`
- click `Layers` found underneath `merger` adjacent to Lambda icon
- select `Add a layer` below
- select `Provide a layer version ARN`
- enter the `Layer version ARN`








