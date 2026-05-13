// RED: Tests for HTML annotation block patch logic
// These will fail until patch-html.js is implemented.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAnnotations, patchAnnotationBlock } from '../src/patch-html.js';

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<p>Hello world</p>
<!-- CollaDoc annotation store — readable by any AI -->
<script type="application/json" id="colladoc-data">
[{"id":"t_001","anchor":"Hello","comment":"test","author":"hadar","ts":"2026-05-13T09:00:00Z","resolved":false,"replies":[]}]
</script>
</body>
</html>`;

const EMPTY_HTML = `<!DOCTYPE html>
<html><body><p>Hi</p>
<script type="application/json" id="colladoc-data">
[]
</script>
</body></html>`;

describe('extractAnnotations', () => {
  it('parses the annotation block from valid HTML', () => {
    const annotations = extractAnnotations(SAMPLE_HTML);
    assert.equal(annotations.length, 1);
    assert.equal(annotations[0].id, 't_001');
  });

  it('returns empty array for empty annotation block', () => {
    const annotations = extractAnnotations(EMPTY_HTML);
    assert.deepEqual(annotations, []);
  });

  it('returns empty array when colladoc-data block is absent', () => {
    const html = '<html><body><p>no annotations here</p></body></html>';
    const annotations = extractAnnotations(html);
    assert.deepEqual(annotations, []);
  });

  it('throws on malformed JSON in annotation block', () => {
    const bad = `<html><body><script type="application/json" id="colladoc-data">
not-json
</script></body></html>`;
    assert.throws(() => extractAnnotations(bad), /JSON/);
  });
});

describe('patchAnnotationBlock', () => {
  it('replaces annotation block content with merged array', () => {
    const merged = [
      { id: 't_001', anchor: 'Hello', comment: 'test', author: 'hadar', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] },
      { id: 't_002', anchor: 'world', comment: 'new', author: 'yuval', ts: '2026-05-13T10:00:00Z', resolved: false, replies: [] }
    ];
    const patched = patchAnnotationBlock(SAMPLE_HTML, merged);
    const extracted = extractAnnotations(patched);
    assert.equal(extracted.length, 2);
    assert.ok(extracted.find(a => a.id === 't_002'));
  });

  it('preserves all HTML outside the annotation block', () => {
    const merged = [];
    const patched = patchAnnotationBlock(SAMPLE_HTML, merged);
    assert.ok(patched.includes('<p>Hello world</p>'));
    assert.ok(patched.includes('<title>Test</title>'));
  });

  it('round-trips — extract after patch returns the merged array', () => {
    const merged = [
      { id: 't_abc', anchor: 'test', comment: 'hi', author: 'hadar', ts: '2026-05-13T09:00:00Z', resolved: true, replies: [] }
    ];
    const patched = patchAnnotationBlock(EMPTY_HTML, merged);
    const extracted = extractAnnotations(patched);
    assert.deepEqual(extracted, merged);
  });

  it('throws if colladoc-data block is not found in HTML', () => {
    const noBlock = '<html><body><p>nothing</p></body></html>';
    assert.throws(() => patchAnnotationBlock(noBlock, []), /colladoc-data/);
  });
});
