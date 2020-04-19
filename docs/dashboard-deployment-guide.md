# AWS Infrastructure Deployment Guide

## Prerequisites
EC2 instance with the following installed:
- [Node](https://nodejs.org/en/) 6 or higher
- [npm](https://www.npmjs.com/get-npm)
- [Docker](https://www.docker.com/), ensure docker daemon is running
- [Docker Hub Account](https://hub.docker.com), and log in to [CLI](https://docs.docker.com/engine/reference/commandline/login/)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) installed and [configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)
- AWS EC2 type - Amazon Linux 2 

## 1. Create the Bento Node Express Docker image
### Clone repo
create a new folder on your local machine (anywhere on your file system that isn't within a git repository), within that folder:

`git clone https://github.com/thinkybeast/bento-dashboard-backend.git`

`cd bento-dashboard-backend`

### Update the Dockerfile
within the Dockerfile the following environment variables requires a value: 

- `ENV START_BUCKET` 

enter the following command to view view all of your bucket names:

`aws s3api list-buckets --query "Buckets[].Name"`

there will a bucket with **bento-dev-videouploadbucket** in its name use the full bucket name for the value of **ENV START_BUCKET** 

- `ENV RECORD_UPLOAD_LAMBDA`

**arn** of the **recordUpload** Lambda, the following command lists the properties of this Lambda: `aws lambda get-function --function-name  recordUpload`

- `ENV REGION` your AWS region 

- `ENV AWS_ACCESS_KEY_ID` your AWS access key

- `ENV AWS_SECRET_ACCESS_KEY` your AWS secret access key

### Build and tag a Docker image
`docker build -t yourhubusername/bentobackend .`

### Push image to Docker Hub
IMPORTANT, immediately after pushing this image login to [Docker hub](https://hub.docker.com) and configure settings to make this repo private as it contains your AWS keys

`docker push yourhubusername/bentobackend`

## 2. Install [Docker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/docker-basics.html) on Amazon Linux 2
connect to your EC2 instance within terminal and enter the following commands:

`sudo yum update -y`

`sudo amazon-linux-extras install docker`

`sudo service docker start`

`sudo usermod -a -G docker ec2-user`

`sudo chmod 666 /var/run/docker.sock`

## 3. Create and run the Bento Node Express Docker container
connect to your EC2 instance and log in to Docker hub (`docker login --username=yourhubusername`)within terminal and then enter the following command:

`docker run --rm -d -v ${PWD}:/app -v /app/node_modules -v app/package.json -p 3001:3001 yourhubusername/bentobackend`

## 4. Modify EC2 Security Group settings
within AWS console modify the inbound rules for your EC2 instance

add a rule for Expresss

**Type**: Custom TCP, **Protocol**: TCP, **Port range**: 3001
**Source**: My IP (or any that you choose)

## 5. Build the Bento React Dashboard 
### Clone repo
create a new folder (anywhere on your file system that isn't within a git repository), within that folder enter the following command:

`git clone https://github.com/bento-video/bento-dashboard.git`

`cd bento-dashboard`

### Update .env.production

the following variable references the public endpoint of your EC2 instance

`ENV PUBLIC_EC2_IP` ec2IP:3001

the hostname and port need to be replaced with your EC2 instance's public IP or DNS name, both values are returned withing the output the following command:

`aws ec2 describe-instances`
 
### Build React app
`npm install build`

`npm run build`

## Serve React build files on S3
within the AWS S3 console:

create a new S3 bucket

remove the **Block all public access** selection

move all the files (and folder) within **bento-dashboard/build** to this bucket

navigate to the **Properties** tag and select **Static website hosting**

select **Use this bucket to host a website**, **Index document**: index.html

copy **Endpoint**, this is your endpoint to access the Bento Dashboard front-end

add a policy to this bucket to enable GET requests to the objects (files) of this bucket (note, this will allow anyone with the above end point to access these static React files however access to the content of your pipeline is still secured with the entry IP address you configure for the Express app):
```javascript
{
	"Version":"2008-10-17",
	"Statement":[{
	"Sid":"AllowPublicRead",
		"Effect":"Allow",
		"Principal": {
			"AWS": "*"
			},
		"Action":["s3:GetObject"],
		"Resource":["arn:aws:s3:::bucket/*"
		]
	}
	]
} 




