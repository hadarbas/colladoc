import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { injectLatestColladoc } from '../src/inject-script.js';

const SOURCE = `/* CollaDoc v1 — embedded annotation layer\n * latest version\n */\nconsole.log('new');\n`;

describe('injectLatestColladoc', () => {

  it('replaces the inline CollaDoc script with the latest source', () => {
    const html = `<html><body>
<script type="application/json" id="colladoc-data">[]</script>
<script>/* CollaDoc v1 — embedded annotation layer */
console.log('OLD');
</script>
</body></html>`;
    const out = injectLatestColladoc(html, SOURCE);
    assert.ok(out.includes("console.log('new')"), 'should contain new source');
    assert.ok(!out.includes("console.log('OLD')"), 'should not contain old source');
    // Annotations block is untouched
    assert.ok(out.includes('id="colladoc-data"'));
  });

  it('preserves HTML outside the script block', () => {
    const html = `<html><head><title>Spec</title></head><body>
<h1>Heading</h1>
<p>paragraph</p>
<script type="application/json" id="colladoc-data">[{"id":"t_1"}]</script>
<script>/* CollaDoc v1 */ var old = true;</script>
</body></html>`;
    const out = injectLatestColladoc(html, SOURCE);
    assert.ok(out.includes('<title>Spec</title>'));
    assert.ok(out.includes('<h1>Heading</h1>'));
    assert.ok(out.includes('"id":"t_1"'));
  });

  it('returns html unchanged when no CollaDoc block is present', () => {
    const html = `<html><body><h1>Plain HTML</h1><script>var x = 1;</script></body></html>`;
    const out = injectLatestColladoc(html, SOURCE);
    assert.equal(out, html);
  });

  it('does not match a <script src="..."> pointing at colladoc.js', () => {
    // External-script form should be left alone — no body to replace
    const html = `<html><body>
<script src="/colladoc.js"></script>
</body></html>`;
    const out = injectLatestColladoc(html, SOURCE);
    assert.equal(out, html);
  });

  it('only replaces the CollaDoc script, leaving other inline scripts intact', () => {
    const html = `<html><body>
<script>window.analytics = true;</script>
<script type="application/json" id="colladoc-data">[]</script>
<script>/* CollaDoc v1 */ var old = 1;</script>
<script>console.log('after');</script>
</body></html>`;
    const out = injectLatestColladoc(html, SOURCE);
    assert.ok(out.includes('window.analytics = true'));
    assert.ok(out.includes("console.log('after')"));
    assert.ok(out.includes("console.log('new')"));
    assert.ok(!out.includes('var old = 1'));
  });

  it('handles a CollaDoc block that appears before the colladoc-data block', () => {
    // Tolerance for unusual orderings — content marker, not position
    const html = `<html><body>
<script>/* CollaDoc v1 */ var old = 1;</script>
<script type="application/json" id="colladoc-data">[]</script>
</body></html>`;
    const out = injectLatestColladoc(html, SOURCE);
    assert.ok(out.includes("console.log('new')"));
    assert.ok(!out.includes('var old = 1'));
  });
});
