- S3 name hardcoded

## DB Schema:
JOBS
```javascript
{
  id: 12345 (partition key)
  totalTasks: N
  finishedTasks: 0
  filename: cool_music_video
  status: pending
  inputType:
  outputType:
  created_at:
  completed_at:
  ...
}
```
SUBTASKS
```javascript
{
    jobId: 12345 (partition key)
    segmentId: 001 (sort key)
    filename: 12345-001
    status: pending
    created_at:
    completed_at:
    ...
}
```

## Manifest file content template
file '/tmp/12345-001.mp4'

file '/tmp/12345-002.mp4'
...

## Path/object keys in S3 (post transcoding)
- chunks:

/jobId/jobId-segmentId.outputType

`/12345/12345-001.mp4`

- manifest file:
 `/jobId/merge-manifest.txt`


- transcode chunk file 'path'(key) on Lambda: `/tmp/jobId-segmentId.ext`
