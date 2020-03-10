- S3 name hardcoded

Assumptions:

- params is an object:

```javascript
  {
  chunkCount: numberOfFilesToConcat,
  fileFormat: extensionOfTranscodedFiles,
  videoName: chosenName
  }
```

- transcoded files naming will be `output000.ext, output001.ext...`

- name of the manifest file found in S3 `merge_manifest.txt`
  - file 'path'(key) on lambda will be `/tmp/${params.videoName}/output000.ext`
