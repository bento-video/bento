/*


ffmpeg -i https://bento-video-start.s3.amazonaws.com/SoftServe2.mkv -f mp4 -movflags frag_keyframe+empty_moov pipe:1 | aws s3 cp - s3://bento-video-end/streamTestOutput.mp4



ffmpeg -f concat -safe 0 -protocol_whitelist file,http,tcp -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/httpManifest.ffcat -c copy robotClubHttp.mp4



Step 1: Concat segments via http manifest
- requires manifest to list urls

ffmpeg -f concat -safe 0 -protocol_whitelist file,https,tls,tcp -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/httpManifest.ffcat -c copy robotClubHttp.mp4

Step 2: Stream Http Concat to s3

ffmpeg -f concat -safe 0 -protocol_whitelist file,https,tls,tcp -i https://bento-transcoded-segments.s3.amazonaws.com/1584830180296/manifestHttp2.ffcat -c copy -f mp4 -movflags frag_keyframe+empty_moov pipe:1 | aws s3 cp - s3://bento-video-end/robotClubFinalAudio.mp4

Step 3: Combine silent video and audio and output to s3

Not working, result is not playable in QT
ffmpeg -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/robotClubHttp.mp4 -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/1584822728644-audio.aac -c copy -map 0:v -map 1:a  -bsf:a aac_adtstoasc -f mp4 -movflags frag_keyframe+empty_moov pipe:1 | aws s3 cp - s3://bento-video-end/robotClubFinal.mp4


Works when saving locally
ffmpeg -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/robotClubHttp.mp4 -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/1584822728644-audio.aac -c copy -map 0:v -map 1:a robotClubMerged.mp4


Error: Malformed AAC bitstream detected: use the audio bitstream filter 'aac_adtstoasc' to fix it ('-bsf:a aac_adtstoasc' option with ffmpeg)
ffmpeg -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/robotClubHttp.mp4 -i https://bento-transcoded-segments.s3.amazonaws.com/1584822728644/1584822728644-audio.aac -c copy -map 0:v -map 1:a -f mp4 -movflags frag_keyframe+empty_moov  pipe:1 | aws s3 cp - s3://bento-video-end/robotClubMerge.mp4


If i transcode audio with video, then i can just concat the resulting file without combining audio stream later.

this seemed to create syncing issues before but we should test it

seems to work locally

steps
- update manifest to use urls DONE
- update transcode to copy audio track DONE
- update exec to just do concat step and stream to s3.


Transcode stage

ffmpeg -ss 6 -t 12 -i https://s3.amazonaws.com/bento-video-start/humility_original.mp4 -y humSegment.mp4


Concat stage


 https://bento-transcoded-segments.s3.amazonaws.com/1585107523087/1585107523087-002.mp4



 ffmpeg -i https://bento-transcoded-segments.s3.amazonaws.com/1585107523087/1585107523087-002.mp4 -c copy -bsf:v h264_mp4toannexb -f mpegts intermediate1.ts

 ffmpeg -i https://bento-transcoded-segments.s3.amazonaws.com/1585107523087/1585107523087-003.mp4 -c copy -bsf:v h264_mp4toannexb -f mpegts intermediate2.ts


 ffmpeg -i "concat:intermediate1.ts|intermediate2.ts" -c copy -bsf:a aac_adtstoasc  -avoid_negative_ts -fflags +genpts -async 1 -y outputTS.mp4


mkfifo temp1 temp2
ffmpeg -y -i input1.mp4 -c copy -bsf:v h264_mp4toannexb -f mpegts temp1 2> /dev/null & \
ffmpeg -y -i input2.mp4 -c copy -bsf:v h264_mp4toannexb -f mpegts temp2 2> /dev/null & \
ffmpeg -f mpegts -i "concat:temp1|temp2" -c copy -bsf:a aac_adtstoasc output.mp4
*/