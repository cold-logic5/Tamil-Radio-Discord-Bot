const http = require('http');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const config = require('./config.json');

const PORT = 3000;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Serve simple HTML interface
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    let stationButtons = Object.keys(config.stations).map(key => {
      const s = config.stations[key];
      return `
        <div style="margin: 10px; padding: 15px; border: 1px solid #ccc; border-radius: 8px; background: #fafafa;">
          <h3>${s.name} (${key})</h3>
          <p><strong>Genre:</strong> ${s.genre}</p>
          <p>${s.description}</p>
          <audio controls src="/stream/${key}" preload="none" style="width: 100%;"></audio>
        </div>
      `;
    }).join('');

    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tamil Radio Local Stream Tester</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; line-height: 1.6; }
          h1 { text-align: center; color: #333; }
        </style>
      </head>
      <body>
        <h1>📻 Tamil Radio Local Tester</h1>
        <p>This page streams audio from the configured radio stations by running FFmpeg locally and transcoding the stream to MP3. Use this to verify if the stream URLs and FFmpeg are working on your machine.</p>
        <div>
          ${stationButtons}
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Stream audio endpoint
  if (path.startsWith('/stream/')) {
    const stationKey = path.substring('/stream/'.length);
    const station = config.stations[stationKey];

    if (!station) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Station not found');
      return;
    }

    console.log(`[HTTP] Streaming station: ${station.name} (${station.url})`);
    
    // Set headers for audio streaming
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive'
    });

    // Spawn FFmpeg to transcode to MP3 for the browser
    const ffmpegProcess = spawn(ffmpeg, [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', station.url,
      '-f', 'mp3',
      '-ab', '128k',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (data) => {
      // Log FFmpeg output locally for troubleshooting
      console.log(`[FFmpeg Log]: ${data.toString().trim()}`);
    });

    req.on('close', () => {
      console.log(`[HTTP] Client closed connection for station: ${station.name}`);
      try {
        ffmpegProcess.kill('SIGKILL');
      } catch (e) {}
    });

    ffmpegProcess.on('error', (err) => {
      console.error(`[FFmpeg Error]:`, err);
      res.end();
    });

    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`=====================================================`);
  console.log(`📡 Local Stream Tester running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to test.`);
  console.log(`=====================================================`);
});
