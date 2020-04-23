<div align="center">
  <img src="https://i.imgur.com/3H8JUoS.png?2">
</div>

<h1 align="center">Welcome to Bento</h2>

## Overview

[Bento](https://bento-video.github.io/) is a blazing fast serverless video transcoding pipeline that can be easily deployed to Amazon Web Services (AWS).  It is built for individuals and small businesses seeking a fast, simple, open-source solution to their video transcoding needs.

## Getting Started

### Bento Pipeline Deployment
Bento is deployed on AWS resources. This [setup guide](https://github.com/bento-video/bento/blob/master/docs/pipeline-deployment-guide.md) outlines the four main pipeline deployment steps. 

### Bento Dashboard Deployment
Bento Dashboard provides a simple interface to use all the features of a deployed pipeline. Bento Dashboard is built in React with an Express backend that can be run locally for individual use, or deployed to Amazon EC2 for organizational use. 

The [deployment guide](https://github.com/bento-video/bento/blob/master/docs/dashboard-deployment-guide.md) (steps one through four) includes a walkthrough to containerize the Express app for easy deployment on EC2 or any other cloud computing platform. Steps five onwards details how to deploy React files on EC2.
