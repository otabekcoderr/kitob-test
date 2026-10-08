// ========================================================================
// scripts/dev-server.js — Local Development & E2E Verification Server
// ========================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg'
};

async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch {
          req.body = body;
        }
      } else {
        req.body = {};
      }
      resolve();
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Enhance req object with query
  req.query = Object.fromEntries(parsedUrl.searchParams);

  // API Routing
  if (pathname.startsWith('/api/')) {
    await parseBody(req);

    if (pathname === '/api/quiz-check') {
      const mod = await import('../api/quiz-check.js');
      return mod.default(req, res);
    }
    if (pathname === '/api/quiz-submit') {
      const mod = await import('../api/quiz-submit.js');
      return mod.default(req, res);
    }
    if (pathname === '/api/quiz') {
      const mod = await import('../api/quiz.js');
      return mod.default(req, res);
    }
    if (pathname === '/api/question-keys') {
      const mod = await import('../api/question-keys.js');
      return mod.default(req, res);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }

  // Static file serving
  let filePath = path.join(ROOT, pathname);
  if (pathname === '/' || !path.extname(pathname)) {
    // If not a static file with extension, serve index.html (SPA)
    filePath = path.join(ROOT, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(ROOT, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      res.statusCode = 500;
      res.end('Error loading file');
    });
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[dev-server] Kitobchi platform running on http://localhost:${PORT}`);
});
