const { exec, spawn, spawnSync } = require('child_process');

const execProcess = async (command) => {
  await new Promise((resolve, reject) => {
    const ls = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        // return;
      }
      console.log(`stdout: ${stdout}`);
    });

    ls.on('exit', function (code) {
      console.log('Child process exited with exit code ' + code);
      resolve();
    });
  });
}

const spawnProcess = async (command, flags, resolve) => {
  await new Promise((resolve, reject) => {
    const ls = spawn(command, flags);

    ls.stdout.on("data", data => {
      console.log(`stdout: ${data}`);
    });

    ls.stderr.on("data", data => {
      console.log(`stderr: ${data}`);
    });

    ls.on('error', (error) => {
      console.log(`error: ${error.message}`);
      reject();
    });

    ls.on("close", code => {
      console.log(`child process exited with code ${code}`);
      resolve()
    });

  });
}

const main = async () => {
  console.log('creating ffmpeg Lambda layer')

  // clone bento ffmpeg deployment folder
  await spawnProcess('git', ['clone', 'https://github.com/bento-video/ffmpeg-lambda-layer.git']);

  await spawnProcess('mkdir', ['./ffmpeg-lambda-layer/layer']);

  // download ffmpeg binary
  await spawnProcess('curl', ['-O', 'https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz']);

  // extract binary files
  await spawnProcess('mv', ['ffmpeg-git-amd64-static.tar.xz', './ffmpeg-lambda-layer/layer']);

  await spawnProcess('tar', ['xf', './ffmpeg-lambda-layer/layer/ffmpeg-git-amd64-static.tar.xz', '-C', './ffmpeg-lambda-layer/layer']);

  await spawnProcess('rm', ['./ffmpeg-lambda-layer/layer/ffmpeg-git-amd64-static.tar.xz']);

  await execProcess('mv ./ffmpeg-lambda-layer/layer/ffmpeg-git-*-amd64-static ./ffmpeg-lambda-layer/layer/ffmpeg');

  // deploy ffmpeg 
  console.log('deploying ffmpeg Lambda layer')
  await execProcess('cd ffmpeg-lambda-layer && sls deploy');

  // deploy bento 
  console.log('deploying bento')
  await execProcess('cd bento && sls deploy');
}

main()