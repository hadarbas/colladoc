// RED: Tests for annotation merge logic (server-side)
// These will fail until merge.js is implemented.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAnnotations } from '../src/merge.js';

describe('mergeAnnotations', () => {

  it('keeps all threads when two people add different threads simultaneously', () => {
    const onDisk = [
      { id: 't_001', anchor: 'paragraph A', comment: 'from alice', author: 'alice', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];
    const incoming = [
      { id: 't_002', anchor: 'paragraph B', comment: 'from bob', author: 'bob', ts: '2026-05-13T09:00:01Z', resolved: false, replies: [] }
    ];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged.length, 2);
    assert.ok(merged.find(a => a.id === 't_001'));
    assert.ok(merged.find(a => a.id === 't_002'));
  });

  it('deduplicates threads with the same id', () => {
    const thread = { id: 't_001', anchor: 'text', comment: 'hi', author: 'alice', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] };
    const onDisk = [thread];
    const incoming = [thread];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged.length, 1);
  });

  it('never drops a thread that exists on disk but is absent from incoming', () => {
    const onDisk = [
      { id: 't_001', anchor: 'A', comment: 'old', author: 'alice', ts: '2026-05-13T08:00:00Z', resolved: false, replies: [] },
      { id: 't_002', anchor: 'B', comment: 'also old', author: 'bob', ts: '2026-05-13T08:01:00Z', resolved: false, replies: [] }
    ];
    const incoming = [
      { id: 't_001', anchor: 'A', comment: 'old', author: 'alice', ts: '2026-05-13T08:00:00Z', resolved: false, replies: [] }
    ];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged.length, 2, 'disk thread t_002 must not be dropped');
  });

  it('resolving same thread simultaneously produces resolved:true with no conflict', () => {
    const base = { id: 't_001', anchor: 'text', comment: 'q', author: 'bob', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] };
    const onDisk = [{ ...base, resolved: true }];
    const incoming = [{ ...base, resolved: true }];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].resolved, true);
  });

  it('incoming resolve wins over disk unresolved (last-writer for resolved field)', () => {
    const base = { id: 't_001', anchor: 'text', comment: 'q', author: 'bob', ts: '2026-05-13T09:00:00Z', replies: [] };
    const onDisk = [{ ...base, resolved: false }];
    const incoming = [{ ...base, resolved: true }];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged[0].resolved, true);
  });

  it('sorts merged threads by ts ascending', () => {
    const onDisk = [
      { id: 't_002', anchor: 'B', comment: '', author: 'bob', ts: '2026-05-13T10:00:00Z', resolved: false, replies: [] }
    ];
    const incoming = [
      { id: 't_001', anchor: 'A', comment: '', author: 'alice', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged[0].id, 't_001');
    assert.equal(merged[1].id, 't_002');
  });

  it('handles empty disk gracefully', () => {
    const incoming = [
      { id: 't_001', anchor: 'A', comment: 'new', author: 'alice', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];
    const merged = mergeAnnotations([], incoming);
    assert.equal(merged.length, 1);
  });

  it('handles empty incoming gracefully — returns disk as-is', () => {
    const onDisk = [
      { id: 't_001', anchor: 'A', comment: 'existing', author: 'alice', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];
    const merged = mergeAnnotations(onDisk, []);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 't_001');
  });

  it('preserves edited comment text and editedAt from incoming', () => {
    const onDisk = [
      { id: 't_001', anchor: 'A', comment: 'original', author: 'alice', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];
    const incoming = [
      { id: 't_001', anchor: 'A', comment: 'edited text', author: 'alice', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [], editedAt: '2026-05-23T12:00:00Z' }
    ];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].comment, 'edited text');
    assert.equal(merged[0].editedAt, '2026-05-23T12:00:00Z');
  });

  it('merges replies — incoming replies win if thread id matches', () => {
    const onDisk = [
      { id: 't_001', anchor: 'A', comment: 'q', author: 'bob', ts: '2026-05-13T09:00:00Z', resolved: false, replies: [] }
    ];
    const incoming = [
      { id: 't_001', anchor: 'A', comment: 'q', author: 'bob', ts: '2026-05-13T09:00:00Z', resolved: false,
        replies: [{ author: 'alice', text: 'answered', ts: '2026-05-13T10:00:00Z' }] }
    ];
    const merged = mergeAnnotations(onDisk, incoming);
    assert.equal(merged[0].replies.length, 1);
    assert.equal(merged[0].replies[0].text, 'answered');
  });
});
