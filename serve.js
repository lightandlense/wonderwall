// serve.js — zero-dependency static file server for the Reactable Wall app.
// The app fetches local audio loops, which the browser BLOCKS under file:// (CORS:
// "file: URLs are treated as unique security origins"). Serving over http://localhost
// fixes that AND gives the webcam a secure context. Run: `npm start` (or `node serve.js`).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

// App code must never be served stale — browsers heuristically cache .js, which has
// served old logic during development. Large audio assets may still cache normally.
const NO_CACHE = new Set(['.html', '.js', '.css', '.json', '.map']);

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Resolve safely inside ROOT (no path traversal).
  const filePath = path.join(ROOT, path.normalize(urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    if (NO_CACHE.has(ext)) headers['Cache-Control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Reactable Wall served at  http://localhost:${PORT}/`);
  console.log('Open that URL in your browser (NOT the index.html file directly).');
  console.log('Ctrl+C to stop.');
});
