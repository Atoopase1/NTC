/**
 * PrepTrack Local Development Server
 * Run: node server.js
 * Then open: http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.pdf':  'application/pdf',
  '.sql':  'text/plain',
  '.md':   'text/markdown',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Default to index.html for root
  if (pathname === '/') pathname = '/index.html';

  // Resolve the file path
  let filePath = path.join(ROOT, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Add appropriate headers for service worker
  res.setHeader('Service-Worker-Allowed', '/');

  // No-cache for sw.js
  if (pathname === '/sw.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  // Check if file exists
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try adding .html extension
      const htmlPath = filePath.endsWith('.html') ? null : filePath + '.html';
      if (htmlPath) {
        fs.stat(htmlPath, (err2, stat2) => {
          if (!err2 && stat2.isFile()) {
            serveFile(htmlPath, res);
          } else {
            // SPA fallback: serve index.html for unknown routes
            // But ONLY if path doesn't look like a static asset
            const ext = path.extname(pathname);
            if (!ext || ext === '.html') {
              serveFile(path.join(ROOT, 'index.html'), res);
            } else {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end(`404 Not Found: ${pathname}`);
            }
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: ${pathname}`);
      }
      return;
    }
    serveFile(filePath, res);
  });
});

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`\n  PrepTrack Dev Server running at:`);
  console.log(`  \x1b[36mhttp://localhost:${PORT}\x1b[0m\n`);
  console.log(`  Auth callback URL for Supabase:`);
  console.log(`  \x1b[33mhttp://localhost:${PORT}/pages/auth-callback.html\x1b[0m\n`);
});
