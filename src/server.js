import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { mergeAnnotations } from './merge.js';
import { extractAnnotations, patchAnnotationBlock } from './patch-html.js';
import { injectLatestColladoc } from './inject-script.js';

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
        // Resolve relative paths (URL pathnames) against serveDir
        const decodedFile = decodeURIComponent(body.file);
        const filePath = decodedFile.startsWith('/') && !decodedFile.startsWith(resolve(serveDir))
          ? join(serveDir, decodedFile)
          : decodedFile;
        // Confine writes to serveDir — prevents path traversal via arbitrary file paths
        if (!withinServeDir(serveDir, filePath)) {
          return json(res, 403, { error: 'File outside serve directory' });
        }
        if (!existsSync(filePath)) {
          return json(res, 404, { error: 'File not found' });
        }
        const html = readFileSync(filePath, 'utf8');
        const { annotations: onDisk, approvals: onDiskApprovals } = extractAnnotations(html);
        const merged = mergeAnnotations(onDisk, body.annotations);
        // Incoming approvals win (client is authoritative for approvals)
        const approvals = Array.isArray(body.approvals) ? body.approvals : onDiskApprovals;
        const patched = patchAnnotationBlock(html, merged, approvals);
        writeFileSync(filePath, patched, 'utf8');
        json(res, 200, { merged, approvals });
      }).catch(err => json(res, 500, { error: err.message }));
      return;
    }

    // ── API: sync status — compare MD mtime vs lastSynced timestamp ──
    if (req.method === 'GET' && url.pathname === '/colladoc/sync-status') {
      const fileParam = url.searchParams.get('file');
      const lastSynced = url.searchParams.get('lastSynced') || null;
      if (!fileParam) return json(res, 400, { error: 'file param required' });

      const decodedFile = decodeURIComponent(fileParam);
      const htmlPath = decodedFile.startsWith('/') && !decodedFile.startsWith(resolve(serveDir))
        ? join(serveDir, decodedFile)
        : decodedFile;

      if (!withinServeDir(serveDir, htmlPath)) {
        return json(res, 403, { error: 'File outside serve directory' });
      }

      const mdPath = htmlPath.replace(/\.html$/, '.md');
      const mdExists = existsSync(mdPath);

      if (!mdExists) {
        return json(res, 200, { mdExists: false, synced: false });
      }

      if (!lastSynced) {
        return json(res, 200, { mdExists: true, synced: true });
      }

      const mdMtime = statSync(mdPath).mtimeMs;
      const syncedMs = new Date(lastSynced).getTime();
      const synced = mdMtime <= syncedMs;
      return json(res, 200, { mdExists: true, synced, mdMtime, syncedMs });
    }

    // ── API: list html files in serve dir ─────────────────────────
    if (req.method === 'GET' && url.pathname === '/colladoc/files') {
      const files = readdirSync(serveDir)
        .filter(f => extname(f) === '.html')
        .map(f => join(serveDir, f));
      json(res, 200, { files });
      return;
    }

    // ── Index page — lists all CollaDoc HTML files under serveDir ────
    if (req.method === 'GET' && url.pathname === '/') {
      const htmlFiles = [];
      const SKIP_DIRS = new Set([
        'node_modules', '.git', '.Trash', 'Library', 'Applications',
        'Music', 'Movies', 'Pictures', 'System', 'Volumes',
      ]);
      function walk(dir) {
        let entries;
        try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) { walk(full); }
          else if (entry.isFile() && extname(entry.name) === '.html') {
            try {
              const content = readFileSync(full, 'utf8');
              if (content.includes('type="application/json" id="colladoc-data"')) {
                const rel  = full.slice(resolve(serveDir).length);
                const open = (content.match(/"resolved"\s*:\s*false/g) || []).length;
                const encodedPath = rel.split('/').map(s => encodeURIComponent(s)).join('/');
                htmlFiles.push({ path: rel, encodedPath, name: entry.name, open });
              }
            } catch {}
          }
        }
      }
      walk(serveDir);
      htmlFiles.sort((a, b) => a.path.localeCompare(b.path));

      const rows = htmlFiles.map(f => `
        <tr>
          <td style="padding:10px 12px">
            <a href="${f.encodedPath}" style="color:#2563eb;text-decoration:none;font-weight:500;font-size:14px">${f.name}</a>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${f.path}</div>
          </td>
          <td style="padding:10px 12px;text-align:center">
            ${f.open > 0
              ? `<span style="background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600">${f.open} open</span>`
              : `<span style="color:#94a3b8;font-size:11px">no open threads</span>`}
          </td>
        </tr>`).join('');

      const FAVICON = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%232563eb'/><path d='M6 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H10l-4 4V8z' fill='white'/><circle cx='11' cy='14' r='1.5' fill='%232563eb'/><circle cx='16' cy='14' r='1.5' fill='%232563eb'/><circle cx='21' cy='14' r='1.5' fill='%232563eb'/></svg>`;

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
        <title>CollaDoc</title>
        <link rel="icon" href="${FAVICON}">
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:40px 32px}
          h1{font-size:1.25rem;font-weight:700;color:#1e293b;margin:0 0 4px}
          p{font-size:13px;color:#94a3b8;margin:0 0 24px}
          table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
          th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;background:#f8fafc}
          tr:not(:last-child) td{border-bottom:1px solid #f1f5f9}
          tr:hover td{background:#f8fafc}
          .empty{text-align:center;padding:48px;color:#94a3b8;font-size:13px}
        </style>
      </head><body>
        <h1>CollaDoc</h1>
        <p>Serving: ${serveDir}</p>
        <table>
          <thead><tr><th>File</th><th style="text-align:center;width:140px">Open threads</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="2" class="empty">No CollaDoc HTML files found in this folder yet.</td></tr>`}</tbody>
        </table>
      </body></html>`;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // ── Serve colladoc.js from server's own directory ─────────────
    if (req.method === 'GET' && url.pathname === '/colladoc.js') {
      const jsPath = join(__dirname, '..', 'colladoc.js');
      if (existsSync(jsPath)) {
        res.writeHead(200, { 'Content-Type': 'application/javascript', ...CORS_HEADERS });
        return res.end(readFileSync(jsPath));
      }
    }

    // ── Static file serving ───────────────────────────────────────
    if (req.method === 'GET') {
      const filePath = join(serveDir, decodeURIComponent(url.pathname));
      // Prevent path traversal — resolve() collapses ../ sequences
      if (!withinServeDir(serveDir, filePath)) {
        return json(res, 403, { error: 'Forbidden' });
      }
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        if (ext === '.html') {
          const raw = readFileSync(filePath, 'utf8');
          const out = injectLatestColladoc(raw);
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          return res.end(out);
        }
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
