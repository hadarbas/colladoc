import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COLLADOC_PATH = join(__dirname, '..', 'colladoc.js');

// Walk every <script>…</script> block, find the one whose body contains the
// CollaDoc banner comment (`/* CollaDoc v1`), and replace its body. Scanning
// rather than a multi-block regex avoids matches that span tag boundaries.
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
const BANNER       = /\/\*\s*CollaDoc v1/;

export function injectLatestColladoc(html, source) {
  let latest = null;
  return html.replace(SCRIPT_BLOCK, (full, attrs, body) => {
    if (/\bsrc\s*=/.test(attrs)) return full;
    if (!BANNER.test(body))      return full;
    if (latest == null) latest = source != null ? source : readLatestSource();
    if (latest == null) return full;
    return `<script>\n${latest}\n</script>`;
  });
}

function readLatestSource() {
  if (!existsSync(COLLADOC_PATH)) return null;
  return readFileSync(COLLADOC_PATH, 'utf8');
}
