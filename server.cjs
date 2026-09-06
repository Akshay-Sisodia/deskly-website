const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type.startsWith('video')) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1, 'Cache-Control': 'no-cache' });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    }
  });
});
server.listen(3000, () => console.log('Deskly serving at http://localhost:3000'));
