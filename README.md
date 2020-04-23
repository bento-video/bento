![Bento logo]
(./bento_logo.png)

<h1 align="center">Welcome to Bento</h1>

<p align="center">An open-source high speed serverless video transcoding pipeline</p>

## Getting Started

### Bento Pipeline Deployment
Bento is deployed on AWS resources. This [setup guide](https://github.com/bento-video/bento/blob/master/docs/pipeline-deployment-guide.md) outlines the four main pipeline deployment steps. 

### Bento Dashboard Deployment
Bento Dashboard provides a simple interface to use all the features of a deployed pipeline. Bento Dashboard is built in React with an Express backend that can be run locally for individual use, or deployed to Amazon EC2 for organizational use. 

The [deployment guide](https://github.com/bento-video/bento/blob/master/docs/dashboard-deployment-guide.md) (steps one through four) includes a walkthrough to containerize the Express app for easy deployment on EC2 or any other cloud computing platform. Steps five onwards details how to deploy React files on EC2.
