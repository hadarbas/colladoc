// RED: Integration tests for the CollaDoc server
// Tests the /colladoc/patch endpoint end-to-end against a real server instance.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.js';

const PORT = 13001;
const BASE = `http://127.0.0.1:${PORT}`;

const TEMPLATE_HTML = `<!DOCTYPE html>
<html><body><p>Test doc</p>
<!-- CollaDoc annotation store — readable by any AI -->
<script type="application/json" id="colladoc-data">
[]
</script>
</body></html>`;

let server;
let tmpDir;

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'colladoc-test-'));
  server = await startServer({ port: PORT, serveDir: tmpDir });
});

after(async () => {
  await server.stop();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /colladoc/patch', () => {
  it('returns 400 when body is missing required fields', async () => {
    const res = await fetch(`${BASE}/colladoc/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [] })
    });
    assert.equal(res.status, 400);
  });

  it('returns 403 when file path is outside serveDir', async () => {
    const res = await fetch(`${BASE}/colladoc/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: '/etc/passwd', annotations: [] })
    });
    assert.equal(res.status, 403);
  });

  it('returns 404 when file is inside serveDir but does not exist', async () => {
    const res = await fetch(`${BASE}/colladoc/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: join(tmpDir, 'ghost.html'), annotations: [] })
    });
    assert.equal(res.status, 404);
  });

  it('merges and writes annotations to file, returns merged array', async () => {
    const filePath = join(tmpDir, 'spec.html');
    writeFileSync(filePath, TEMPLATE_HTML);

    const incoming = [
      { id: 't_001', anchor: 'Test doc', comment: 'looks good', author: 'hadar',
        ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];

    const res = await fetch(`${BASE}/colladoc/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filePath, annotations: incoming })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.merged.length, 1);
    assert.equal(body.merged[0].id, 't_001');

    // Verify file on disk was actually updated
    const onDisk = readFileSync(filePath, 'utf8');
    assert.ok(onDisk.includes('t_001'));
  });

  it('merges concurrent saves — disk thread not in incoming is preserved', async () => {
    const filePath = join(tmpDir, 'concurrent.html');
    // Pre-seed with one thread on disk
    const seedHtml = TEMPLATE_HTML.replace('[]', JSON.stringify([
      { id: 't_disk', anchor: 'existing', comment: 'on disk', author: 'yuval',
        ts: '2026-05-13T08:00:00Z', resolved: false, replies: [] }
    ]));
    writeFileSync(filePath, seedHtml);

    // Incoming only contains a NEW thread (simulating Hadar commenting at same time)
    const incoming = [
      { id: 't_new', anchor: 'Test doc', comment: 'new from hadar', author: 'hadar',
        ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];

    const res = await fetch(`${BASE}/colladoc/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filePath, annotations: incoming })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.merged.length, 2, 'both t_disk and t_new must be present');
    assert.ok(body.merged.find(a => a.id === 't_disk'), 'disk thread must be preserved');
    assert.ok(body.merged.find(a => a.id === 't_new'), 'new thread must be present');
  });

  it('only binds to 127.0.0.1 — server is not accessible on external interface', async () => {
    // Can't easily test this without network namespace tricks, so just verify
    // the server address in the server object
    assert.ok(server.address().address === '127.0.0.1');
  });
});

describe('GET /colladoc/files', () => {
  it('returns list of html files in serve directory', async () => {
    writeFileSync(join(tmpDir, 'brief.html'), TEMPLATE_HTML);
    writeFileSync(join(tmpDir, 'spec.html'), TEMPLATE_HTML);

    const res = await fetch(`${BASE}/colladoc/files`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.files));
    assert.ok(body.files.some(f => f.endsWith('spec.html')));
    assert.ok(body.files.some(f => f.endsWith('brief.html')));
  });
});
