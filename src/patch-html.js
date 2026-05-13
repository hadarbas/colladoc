const BLOCK_RE = /(<script[^>]*type="application\/json"[^>]*id="colladoc-data"[^>]*>|<script[^>]*id="colladoc-data"[^>]*type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/g;

function findLastMatch(html) {
  let last = null;
  let m;
  const re = new RegExp(BLOCK_RE.source, 'g');
  while ((m = re.exec(html)) !== null) last = m;
  return last;
}

export function extractAnnotations(html) {
  const match = findLastMatch(html);
  if (!match) return [];
  try {
    return JSON.parse(match[2].trim());
  } catch (e) {
    throw new SyntaxError(`JSON parse failed in colladoc-data block: ${e.message}`);
  }
}

export function patchAnnotationBlock(html, mergedAnnotations) {
  const match = findLastMatch(html);
  if (!match) throw new Error('colladoc-data block not found in HTML');
  const replacement = `${match[1]}\n${JSON.stringify(mergedAnnotations, null, 2)}\n${match[3]}`;
  return html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length);
}
