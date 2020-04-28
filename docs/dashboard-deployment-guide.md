# Bento Dashboard Deployment Guide

## Prerequisites
On your local machine:
- [Docker](https://www.docker.com/), ensure Docker Engine is running
- [Docker Hub Account](https://hub.docker.com), and log in to [CLI](https://docs.docker.com/engine/reference/commandline/login/)
- [npm](https://www.npmjs.com/get-npm)
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html) installed and [configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html)

AWS EC2, type - Amazon Linux 2 instance 

## 1. Create the Bento Node Express Docker image
### Clone repo
In your your local machine's terminal, within the *Bento root folder* (created in the Bento pipeline deployment process), or any other folder:

```console
git clone https://github.com/bento-video/bento-dashboard-backend.git && cd bento-dashboard-backend
```

### Update the Dockerfile
Within the Dockerfile the following environment variables require values: 

1. `ENV START_BUCKET` 
2. `ENV END_BUCKET` 

enter the following command to view view all of your bucket names:

```console
`aws s3api list-buckets --query "Buckets[].Name"`
```

There will be a bucket with **bento-dev-videouploadbucket** in its name. Use this bucket's full name for the value of *ENV START_BUCKET*. 

There will be a bucket with **bento-dev-processedvideosbucket** in its name. Use the full bucket name for the value of *ENV END_BUCKET*. 

3. `ENV RECORD_UPLOAD_LAMBDA`
4. `ENV EXECUTOR_LAMBDA`

These variables reference the **arn** of the **recordUpload** and **executor** Lambdas. The following commands lists the properties of these Lambdas: 

```console
aws lambda get-function --function-name recordUpload
aws lambda get-function --function-name executor
```

5. `ENV REGION` your AWS region 

6. `ENV AWS_ACCESS_KEY_ID` your AWS access key

7. `ENV AWS_SECRET_ACCESS_KEY` your AWS secret access key

### Build and tag a Docker image
```console
docker build -t yourhubusername/bentobackend .
```

### Push Docker image to Docker Hub
***IMPORTANT***: immediately after pushing this image login to [Docker hub](https://hub.docker.com) and configure your settings to make this repo private as it contains your AWS keys.

```console
docker push yourhubusername/bentobackend
```

## 2. Install [Docker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/docker-basics.html) on Amazon Linux 2
Connect to your EC2 instance within terminal and enter the following commands:

```console
sudo yum update -y &&
sudo amazon-linux-extras install docker &&
sudo service docker start &&
sudo usermod -a -G docker ec2-user &&
sudo chmod 666 /var/run/docker.sock &&
```

## 3. Create and run the Bento Node Express Docker container
Log in to Docker hub (`docker login --username=yourhubusername`)within your EC2 terminal and enter the following command:

```console
docker run --rm -d -v ${PWD}:/app -v /app/node_modules -v app/package.json -p 3001:3001 yourhubusername/bentobackend
```

## 4. Modify EC2 Security Group settings
Within AWS web console modify the inbound rules for your EC2 instance:

**Type**: Custom TCP

**Protocol**: TCP

**Port range**: 3001

**Source**: My IP (or any you want to aurhorize to interact with your Bento pipeline)

## 5. Build the Bento React Dashboard 
### Clone repo
In your your local machine's terminal, within the *Bento root folder*, or any other folder:

```console
git clone https://github.com/bento-video/bento-dashboard.git &&
cd bento-dashboard
```

### Update .env.production file
The following variable references the public endpoint of your EC2 instance:

`REACT_APP_API_ENDPOINT` 

Change the hostname to your EC2 instance's public IP or DNS name, both values are returned within the output of the following command:

```console
aws ec2 describe-instances
```
 
### Build the React app
```console
npm install build &&
npm run build
```

## Serve React build files on S3
Within the AWS S3 web console:

- create a new S3 bucket

- remove the *Block all public access* selection

- move all the files (and folder) within *bento-dashboard/build* to this bucket

- navigate to the *Properties* tag and select *Static website hosting*

- select *Use this bucket to host a website*, *Index document*: `index.html`

- copy *Endpoint*, this is your endpoint to access the Bento Dashboard front-end from your browser

- add a policy (*Permissions* -> *Bucket Policy*) to this bucket to enable GET requests to the objects (files) of this bucket (note, this will allow anyone with the above end point to access these static React files however access to the content of your pipeline is still secured with the entry IP address you configured for the Express app port on EC2 in step 4):
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
		"Resource":["arn:aws:s3:::yourbucketname/*"]
	}]
} 
```



