# API Documentation

Currently staged BentoAPI URL: https://jk18pxrip6.execute-api.us-east-1.amazonaws.com/dev

## 1. job

## 1.1. POST /job

This route is used to begin a new transcoding job on a video that currently exists
within the starting S3 bucket, (`bento-video-start`)

### Expected request body

A JSON object that 
includes:

- the name of the video to be transcoded
  - must include video name and proper extension, e.g. `"myVideo.mov"`.
- the name of the start bucket
  - this should be the same everytime, e.g. `"bento-video-start"`
- _optional_ resolution settings
  - if no resoltution transformation should occur, then this value should be `"null"`
  - if resolution transformation is desired, this value should be the desired _new width_ value and desired _new height_ value separated by a colon.
  - e.g. `"1280:720"`
  - this may change the aspect ratio of the video

#### Examples:
```
 {
    "key": "videoName.ext",
    "bucket": "bento-video-start",
    "res": "null" 
 }
 
```
```
 {
    "key": "videoName.ext",
    "bucket": "bento-video-start",
    "res": "720:480" 
 }
 
```

## 2. records

## 2.1. GET /records

This route is used to retrieve database entries for all transcoding jobs past and present, completed or pending

### Expected parameters

none

### Example response
A JSON object:
```
{
  "Count": 165,
  "Items": [
    {
      "filename": {
        "S": "SoftServe"
      },
      "completedAt": {
        "N": "1586198510269"
      },
      "inputType": {
        "S": ".mkv"
      },
      "status": {
        "S": "completed"
      },
      "finishedTasks": {
        "N": "44"
      },
      "createdAt": {
        "N": "1586198476192"
      },
      "timeToComplete": {
        "N": "34.077"
      },
      "outputType": {
        "S": ".mp4"
      },
      "id": {
        "S": "1586198475128"
      },
      "totalTasks": {
        "N": "44"
      }
    },
    ...164 more items...
  ],
  "ScannedCount": 165
}
```

## 2.2. GET records/{id}

This route will return a database entry for a single job, specified by `{id}`.

### Expected parameters

a _job id_ in place of the path parameter `{id}`

### Example request

**/records/1586198475128**

`https://jk18pxrip6.execute-api.us-east-1.amazonaws.com/dev/records/1586198475128`

### Example resonse

```
{
  "Count": 1,
  "Items": [
    {
      "filename": {
        "S": "SoftServe"
      },
      "completedAt": {
        "N": "1586198510269"
      },
      "inputType": {
        "S": ".mkv"
      },
      "status": {
        "S": "completed"
      },
      "finishedTasks": {
        "N": "44"
      },
      "createdAt": {
        "N": "1586198476192"
      },
      "timeToComplete": {
        "N": "34.077"
      },
      "outputType": {
        "S": ".mp4"
      },
      "id": {
        "S": "1586198475128"
      },
      "totalTasks": {
        "N": "44"
      }
    }
  ],
  "ScannedCount": 1
}
```

### Example of requesting non-existant job and resulting response

**/records/5555**

`https://jk18pxrip6.execute-api.us-east-1.amazonaws.com/dev/records/5555`

```
{
  "Count": 0,
  "Items": [],
  "ScannedCount": 0
}
```

## 3. videos

This resource refers to video files currently stored in an S3 bucket. Used to access videos in the start and end buckets of the pipeline.
(`bento-video-start` | `bento-video-end`).

Returns XML

## 3.1. GET /videos/{bucket}

This route is used to obtain a list of all the videos currently stored in S3 bucket, `{bucket}`

### Expected parameters

a _bucket name_ in place of path parameter `{bucket}`

### Example request

**/videos/bento-video-start**
`https://jk18pxrip6.execute-api.us-east-1.amazonaws.com/dev/videos/bento-video-start`

### Example response

```
<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bento-video-start</Name>
  <Prefix></Prefix>
  <Marker></Marker>
  <MaxKeys>1000</MaxKeys>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>Alex_fear.mov</Key>
    <LastModified>2020-03-18T23:07:16.000Z</LastModified>
    <ETag>&quot;55194a8367c351ff79b3fbdd924fb5a0-6&quot;</ETag>
    <Size>93257959</Size>
    <Owner>
      <ID>479cb427bf16fc324269832031c19daa64ddf024fcdbd968a35dddbe7cedc9bc</ID>
      <DisplayName>maximuskwame</DisplayName>
    </Owner>
    <StorageClass>STANDARD</StorageClass>
   </Contents>
  <Contents>
    <Key>Alone_in_the_Wilderness.mkv</Key>
    <LastModified>2020-03-19T17:36:02.000Z</LastModified>
    <ETag>&quot;71612ae6631670b8c834ef5aaed6ff2a-53&quot;</ETag>
    <Size>436220747</Size>
    <Owner>
      <ID>479cb427bf16fc324269832031c19daa64ddf024fcdbd968a35dddbe7cedc9bc</ID>
      <DisplayName>maximuskwame</DisplayName>
    </Owner>
    <StorageClass>STANDARD</StorageClass>
   </Contents>   
 </ListBucketResult>
```

