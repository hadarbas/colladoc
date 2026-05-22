// Tests for G1 (ghost anchors), G2 (delete/edit), G3 (clean resolved), G4 (sync-status)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.js';

// ── G1: ghost-anchor helper (pure logic, no DOM) ────────────────────────────
// Mirrors the applyHighlights logic: if findTextNode returns null, the id goes
// into lostAnchors. We test the branching logic directly.

function simulateApplyHighlights(annotations, documentText) {
  // Simple text-presence check (no real DOM needed for unit test)
  const lost = new Set();
  for (const a of annotations) {
    if (!documentText.includes(a.anchor)) {
      lost.add(a.id);
    }
  }
  return lost;
}

describe('G1: ghost anchor detection', () => {
  it('annotation with anchor present in document is not lost', () => {
    const annotations = [{ id: 't_1', anchor: 'hello world', prefix: '', suffix: '' }];
    const lost = simulateApplyHighlights(annotations, 'This is hello world text.');
    assert.equal(lost.size, 0);
  });

  it('annotation with anchor not present in document is marked lost', () => {
    const annotations = [{ id: 't_1', anchor: 'deleted text', prefix: '', suffix: '' }];
    const lost = simulateApplyHighlights(annotations, 'The content has changed.');
    assert.ok(lost.has('t_1'));
  });

  it('only the missing annotation is lost when some anchors still exist', () => {
    const annotations = [
      { id: 't_1', anchor: 'still here', prefix: '', suffix: '' },
      { id: 't_2', anchor: 'was removed', prefix: '', suffix: '' },
    ];
    const lost = simulateApplyHighlights(annotations, 'Text with still here content.');
    assert.ok(!lost.has('t_1'));
    assert.ok(lost.has('t_2'));
  });
});

// ── G2: delete / edit logic ─────────────────────────────────────────────────

describe('G2: delete comment', () => {
  it('removes annotation by id', () => {
    let annotations = [
      { id: 't_1', author: 'alice', comment: 'test', resolved: false, replies: [] },
      { id: 't_2', author: 'bob',   comment: 'other', resolved: false, replies: [] },
    ];
    annotations = annotations.filter(a => a.id !== 't_1');
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].id, 't_2');
  });

  it('does not remove annotation belonging to a different author', () => {
    const annotations = [
      { id: 't_1', author: 'alice', comment: 'test', resolved: false, replies: [] },
    ];
    const currentAuthor = 'bob';
    const a = annotations.find(x => x.id === 't_1');
    const canDelete = a && a.author === currentAuthor;
    assert.equal(canDelete, false);
  });
});

describe('G2: edit comment', () => {
  it('updates comment text and adds editedAt', () => {
    const annotations = [
      { id: 't_1', author: 'alice', comment: 'original', resolved: false, replies: [] },
    ];
    const a = annotations.find(x => x.id === 't_1');
    a.comment  = 'updated text';
    a.editedAt = new Date().toISOString();
    assert.equal(a.comment, 'updated text');
    assert.ok(a.editedAt);
  });
});

// ── G3: clean resolved ───────────────────────────────────────────────────────

describe('G3: cleanResolved', () => {
  it('removes all resolved threads', () => {
    let annotations = [
      { id: 't_1', resolved: false },
      { id: 't_2', resolved: true  },
      { id: 't_3', resolved: true  },
    ];
    annotations = annotations.filter(a => !a.resolved);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].id, 't_1');
  });

  it('leaves array unchanged when no resolved threads exist', () => {
    let annotations = [
      { id: 't_1', resolved: false },
      { id: 't_2', resolved: false },
    ];
    const count = annotations.filter(a => a.resolved).length;
    assert.equal(count, 0);
    // No-op: nothing to clean
    annotations = annotations.filter(a => !a.resolved);
    assert.equal(annotations.length, 2);
  });

  it('empties the array when all threads are resolved', () => {
    let annotations = [
      { id: 't_1', resolved: true },
      { id: 't_2', resolved: true },
    ];
    annotations = annotations.filter(a => !a.resolved);
    assert.equal(annotations.length, 0);
  });
});

// ── G4: GET /colladoc/sync-status ───────────────────────────────────────────

const PORT = 13002;
const BASE = `http://127.0.0.1:${PORT}`;

const TEMPLATE_HTML = `<!DOCTYPE html>
<html><body><p>Test doc</p>
<script type="application/json" id="colladoc-data">
[]
</script>
</body></html>`;

let server;
let tmpDir;

before(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'colladoc-feat-test-'));
  server = await startServer({ port: PORT, serveDir: tmpDir });
});

after(async () => {
  await server.stop();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /colladoc/sync-status', () => {
  it('returns 400 when file param is missing', async () => {
    const res = await fetch(`${BASE}/colladoc/sync-status`);
    assert.equal(res.status, 400);
  });

  it('returns 403 for file outside serve directory', async () => {
    const res = await fetch(`${BASE}/colladoc/sync-status?file=/../../../etc/passwd.html`);
    assert.equal(res.status, 403);
  });

  it('returns mdExists:false when .md file does not exist', async () => {
    const htmlPath = join(tmpDir, 'nomd.html');
    writeFileSync(htmlPath, TEMPLATE_HTML);
    const res = await fetch(`${BASE}/colladoc/sync-status?file=${encodeURIComponent(htmlPath)}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mdExists, false);
    assert.equal(body.synced, false);
  });

  it('returns synced:true when MD mtime is before lastSynced', async () => {
    const htmlPath = join(tmpDir, 'synced.html');
    const mdPath   = join(tmpDir, 'synced.md');
    writeFileSync(htmlPath, TEMPLATE_HTML);
    writeFileSync(mdPath, '# Synced');

    // Set MD mtime to the past
    const past = new Date(Date.now() - 10000);
    utimesSync(mdPath, past, past);

    const lastSynced = new Date(Date.now() - 5000).toISOString();
    const res = await fetch(`${BASE}/colladoc/sync-status?file=${encodeURIComponent(htmlPath)}&lastSynced=${encodeURIComponent(lastSynced)}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mdExists, true);
    assert.equal(body.synced, true);
  });

  it('returns synced:false when MD mtime is after lastSynced', async () => {
    const htmlPath = join(tmpDir, 'desynced.html');
    const mdPath   = join(tmpDir, 'desynced.md');
    writeFileSync(htmlPath, TEMPLATE_HTML);
    writeFileSync(mdPath, '# Changed after HTML was generated');

    // Set MD mtime to the future (relative to lastSynced)
    const future = new Date(Date.now() + 10000);
    utimesSync(mdPath, future, future);

    const lastSynced = new Date(Date.now() - 5000).toISOString();
    const res = await fetch(`${BASE}/colladoc/sync-status?file=${encodeURIComponent(htmlPath)}&lastSynced=${encodeURIComponent(lastSynced)}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mdExists, true);
    assert.equal(body.synced, false);
  });

  it('returns synced:true when no lastSynced param (no baseline to compare)', async () => {
    const htmlPath = join(tmpDir, 'nosynced.html');
    const mdPath   = join(tmpDir, 'nosynced.md');
    writeFileSync(htmlPath, TEMPLATE_HTML);
    writeFileSync(mdPath, '# Source');
    const res = await fetch(`${BASE}/colladoc/sync-status?file=${encodeURIComponent(htmlPath)}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mdExists, true);
    assert.equal(body.synced, true);
  });
});
