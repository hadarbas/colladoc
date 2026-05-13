import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { mergeAnnotations } from './merge.js';
import { extractAnnotations, patchAnnotationBlock } from './patch-html.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.md':   'text/plain; charset=utf-8',
};

const BODY_LIMIT = 2_000_000; // 2MB max body

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > BODY_LIMIT) { req.destroy(); reject(new Error('Body too large')); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Only allow file:// origin (null) and localhost — nothing else gets CORS
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(payload);
}

// Returns true if abs path is safely inside base dir
function withinServeDir(base, abs) {
  const safeBase = resolve(base);
  const safeAbs  = resolve(abs);
  return safeAbs === safeBase || safeAbs.startsWith(safeBase + '/');
}

export function startServer({ port = 3000, serveDir } = {}) {
  const server = createServer((req, res) => {
    // CORS preflight for file:// pages
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    // ── API: patch annotation block ───────────────────────────────
    if (req.method === 'POST' && url.pathname === '/colladoc/patch') {
      readBody(req).then(raw => {
        let body;
        try { body = JSON.parse(raw); } catch {
          return json(res, 400, { error: 'Invalid JSON body' });
        }
        if (!body.file || !Array.isArray(body.annotations)) {
          return json(res, 400, { error: 'Body must have { file, annotations }' });
        }
        // Confine writes to serveDir — prevents path traversal via arbitrary file paths
        if (!withinServeDir(serveDir, body.file)) {
          return json(res, 403, { error: 'File outside serve directory' });
        }
        if (!existsSync(body.file)) {
          return json(res, 404, { error: 'File not found' });
        }
        const html = readFileSync(body.file, 'utf8');
        const onDisk = extractAnnotations(html);
        const merged = mergeAnnotations(onDisk, body.annotations);
        const patched = patchAnnotationBlock(html, merged);
        writeFileSync(body.file, patched, 'utf8');
        json(res, 200, { merged });
      }).catch(err => json(res, 500, { error: err.message }));
      return;
    }

    // ── API: list html files in serve dir ─────────────────────────
    if (req.method === 'GET' && url.pathname === '/colladoc/files') {
      const files = readdirSync(serveDir)
        .filter(f => extname(f) === '.html')
        .map(f => join(serveDir, f));
      json(res, 200, { files });
      return;
    }

    // ── Static file serving ───────────────────────────────────────
    if (req.method === 'GET') {
      const safePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = join(serveDir, safePath);
      // Prevent path traversal — resolve() collapses ../ sequences
      if (!withinServeDir(serveDir, filePath)) {
        return json(res, 403, { error: 'Forbidden' });
      }
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        return res.end(readFileSync(filePath));
      }
    }

    json(res, 404, { error: 'Not found' });
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      server.stop = () => new Promise(r => server.close(r));
      resolve(server);
    });
    server.on('error', reject);
  });
}
