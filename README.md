<div align="center">
  <img src="https://i.imgur.com/LL7X6Ro.png?2">
</div>

<h1 align="center">Welcome to Bento</h2>

## Overview

[Bento](https://bento-video.github.io/) is a blazing fast serverless video transcoding pipeline that can be easily deployed to Amazon Web Services (AWS). It is built for individuals and small businesses seeking a fast, simple, open-source solution to their video transcoding needs.

## Getting Started

### Bento Pipeline Deployment

Bento is deployed on AWS resources. This [setup guide](https://github.com/bento-video/bento/blob/master/docs/pipeline-deployment-guide.md) outlines the pipeline deployment steps.

### Bento Dashboard Deployment

Bento Dashboard provides a simple interface to use all the features of a deployed pipeline. Bento Dashboard is built in React with an Express backend that can be run locally for individual use, or deployed to Amazon EC2 for organizational use.

The [deployment guide](https://github.com/bento-video/bento/blob/master/docs/dashboard-deployment-guide.md) (steps one through four) includes a walkthrough to containerize the Express app for easy deployment on EC2 or any other cloud computing platform. Steps five onwards details how to deploy React files on EC2.

## Using Bento

### Uploading videos

Once Bento has been installed, navigate to your Dashboard. From there, upload any videos you'd like to transcode via the Add a Video button. Your videos are uploaded to a private bucket in your AWS S3 account.

Bento supports videos up to 2 GB in the following common formats: .mp4, .mkv, .mov, .3gp, .ts.

#### Steps

**Navigate to the dashboard and click the Add a Video button**

<div align="center">
  <img width="640" src="https://i.postimg.cc/7h41p3Vw/walkthrough-getstarted.png">
</div>

**Select a video to upload**

<div align="center">
  <img width="640" src="https://i.postimg.cc/25P7xRLq/walkthrough-uploadvideo.png">
</div>

**The upload may take some time for large files. When the upload has completed, the video's details will appear.**

<div align="center">
  <img width="640" src="https://i.postimg.cc/SsC7TTcg/walkthrough-uploadprogress.png">
</div>
<div align="center">
  <img width="640" src="https://i.postimg.cc/mgmdC5SM/walkthrough-uploadcomplete.png">
</div>

### Transcoding a video

From the dashboard, click on a video you've uploaded to see the Video page. A Video page shows details about the original video you uploaded, as well as any versions of the video you've transcoded. At this time, Bento supports .mp4 output at a variety of common resolutions. Follow these steps to transcode a new video.

#### Steps

**Click on create a new version**

<div align="center">
  <img width="640" src="https://i.postimg.cc/pTbKFf3z/walkthough-showvideo.png">
</div>

**Select the resolution you would like to transcode to and click Begin Job**

<div align="center">
  <img width="640" src="https://i.postimg.cc/3xNj5Jg4/walkthrough-createjob.png">
</div>

**Grab a coffee. Most video files take less that a few minutes to transcode!**

<div align="center">
  <img width="640" src="https://i.postimg.cc/fTB7r00Q/walkthrough-pendingjob.png">
</div>
<div align="center">
  <img width="640" src="https://i.postimg.cc/Hsp4ztnt/walkthrough-completejob.png">
</div>

### Deleting a video

You can delete versions of a video you've transcoded, or the original video you uploaded. Deleting the original video will also delete all versions of the video you've created, so make sure to back them up before taking this action.

#### Steps

**Click the Delete button next to any version you've created to delete that version**

<div align="center">
  <img width="640" src="https://i.postimg.cc/3xNj5Jg4/walkthrough-createjob.png">
</div>

**Click the Delete button to the right of the original video's details to delete that video and all versions you've created**

<div align="center">
  <img width="640" src="https://i.postimg.cc/P57Wts46/walkthrough-deleteversion.png">
</div>
<div align="center">
  <img width="640" src="https://i.postimg.cc/43hzyL2X/walkthrough-deletevideo.png">
</div>
