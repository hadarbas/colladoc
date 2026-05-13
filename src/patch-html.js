const BLOCK_RE = /(<script[^>]+id="colladoc-data"[^>]*>)([\s\S]*?)(<\/script>)/;

export function extractAnnotations(html) {
  const match = html.match(BLOCK_RE);
  if (!match) return [];
  try {
    return JSON.parse(match[2].trim());
  } catch (e) {
    throw new SyntaxError(`JSON parse failed in colladoc-data block: ${e.message}`);
  }
}

export function patchAnnotationBlock(html, mergedAnnotations) {
  if (!BLOCK_RE.test(html)) {
    throw new Error('colladoc-data block not found in HTML');
  }
  return html.replace(
    BLOCK_RE,
    (_, open, _content, close) =>
      `${open}\n${JSON.stringify(mergedAnnotations, null, 2)}\n${close}`
  );
}
