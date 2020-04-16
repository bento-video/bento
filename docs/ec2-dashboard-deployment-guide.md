# AWS Infrastructure Deployment Guide

## Prerequisites
- [Node](https://nodejs.org/en/) 6 or higher
- [npm](https://www.npmjs.com/get-npm)
- [Docker](https://www.docker.com/), ensure docker daemon is running
- [Docker Hub Account](https://hub.docker.com), and log in to [CLI](https://docs.docker.com/engine/reference/commandline/login/)
- [AWS](https://aws.amazon.com) account
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) installed and [configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)


## 1. Install [Docker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/docker-basics.html) on Amazon Linux 2

connect to your EC2 instance within terminal

`sudo yum update -y`

`sudo amazon-linux-extras install docker`

`sudo service docker start`

`sudo usermod -a -G docker ec2-user`

## 2. Create and run the React Dashboard Docker container
### Clone repo
create a new folder (anywhere on your file system that isn't within a git repository), within that folder:

`git clone https://github.com/bento-video/bento-dashboard.git`

`cd bento-dashboard`

### Update the Dockerfile

the following environment variables require values: 

`ENV PUBLIC_EC2_IP`

your EC2 instance's public IP or DNS, can be found within the return of the following command: `aws ec2 describe-instances`
  
### Build and tag a Docker image
`docker build -t yourhubusername/bentodashboard .`

### Push image to Docker Hub
`docker push yourhubusername/bentodashboard`

## 3. Create and run the Node Express Docker container
connect to your EC2 instance within terminal

`docker run --rm -d -v ${PWD}:/app -v /app/node_modules -v app/package.json -p 3001:3001 yourhubusername/bentobackend`

## 4. Create and run the Node Express Docker container
connect to your EC2 instance within terminal

`docker run -it --rm -d -v ${PWD}:/app -v /app/node_modules -v /app/package.json -p 4000:4000 mikedr40/bentodashboard`

## 5. Create the Node Express Docker image
### Clone repo
create a new folder (anywhere on your file system that isn't within a git repository), within that folder:

`git clone https://github.com/thinkybeast/bento-dashboard-backend.git`

`cd bento-dashboard-backend`

### Update the Dockerfile
the following environment variables require values: 

`ENV START_BUCKET` 

S3 bucket that includes **bento-dev-videouploadbucket** in its name, command to view all your bucket names: `aws s3api list-buckets --query "Buckets[].Name"`

`ENV RECORD_UPLOAD_LAMBDA`

arn of the recordUpload Lambda, the following command lists the properties of this Lambda: `aws lambda get-function --function-name  recordUpload`

`ENV REGION` your AWS region 

`ENV AWS_ACCESS_KEY_ID` 

`ENV AWS_SECRET_ACCESS_KEY`

### Build and tag a Docker image
`docker build -t yourhubusername/bentobackend .`

### Push image to Docker Hub
IMPORTANT, immediately after pushing this image login to [Docker hub](https://hub.docker.com) and configure settings to make this repo private as it contains your AWS keys

`docker push yourhubusername/bentobackend`

## 6. Create and run the Node Express Docker container
connect to your EC2 instance within terminal

`docker run --rm -d -v ${PWD}:/app -v /app/node_modules -v app/package.json -p 3001:3001 yourhubusername/bentobackend`

## 7. Modify EC2 Security Group settings
within AWS console modify the inbound rules for your EC2 instance

1. add a rule for React

Type: Custom TCP
Protocol: TCP
Port range: 4000
Source: My IP (or any that you choose)

2. add a rule for Expresss

Type: Custom TCP
Protocol: TCP
Port range: 3001
Source: My IP (or any that you choose)

