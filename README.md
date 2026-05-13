# CollaDoc

An annotation layer for HTML documents that humans and AI agents can both read and write.

You generate a spec or plan as HTML. You or a teammate open it in Chrome and leave inline comments by selecting text. The comments are stored as JSON inside the HTML file itself. The agent reads the file directly — no export, no clipboard, no extra steps. You address the feedback in the markdown source, regenerate the HTML, and the cycle repeats.

**[Open architecture diagram](architecture.html)** — download and open in any browser for an interactive walkthrough with animated sync arrows.

---

## The workflow

```
  YOU / TEAMMATE                         AGENT
  ─────────────────                      ──────────────────────────────────

  "Write a spec for X"         ────►    Creates spec.md
                                         Asks: "Generate reviewable HTML?"

  "Yes"                        ────►    Creates spec.html  (same name, same folder)
                                         CollaDoc UI embedded inside

  Open spec.html in Chrome
  Select text → leave comment
  Select text → leave comment
  Close browser

  "Address the feedback"       ────►    Reads spec.html
                                         Parses open threads (resolved:false)
                                         ┌─ Correction → edits spec.md silently
                                         └─ Decision/opinion → embeds as
                                            > Note (author): ... in spec.md
                                         Regenerates spec.html
                                         Marks addressed threads resolved:true

  Review again, repeat                   ◄────  Cycle continues
```

**File naming:** `spec.md` and `spec.html` always share the same name in the same folder. If `spec.html` already exists when you ask for HTML, the agent updates it — no duplicates.

**When you only have a `.md` file:** ask "generate a reviewable HTML for this file" or "generate HTML for all specs in this folder." The agent creates the `.html` alongside the `.md`. You never create HTML manually.

**When you do not need review:** not every `.md` needs an HTML version. Notes, reference docs, archives — skip it. The agent will ask after finishing a spec but will never create HTML unless you say yes.

---

## How it works

**File structure per document:**

```
spec.md          — source of truth, edited by the agent
spec.html        — review surface, generated from spec.md, contains annotations
```

The HTML file has two additions:
1. A `<script id="colladoc-data">` block holding all annotations as JSON
2. The `colladoc.js` script, inlined, which injects the review UI

**The review cycle:**

```
Agent writes spec.md
  → Agent generates spec.html (with CollaDoc embedded)
  → Human opens spec.html in Chrome, selects text, leaves comments
  → Agent reads spec.html, parses colladoc-data block
  → Agent edits spec.md, regenerates spec.html, marks comments resolved
  → Repeat
```

**When you only have a `.md` file:**

CollaDoc only activates on HTML. If you have a markdown file you want to review, ask the agent:
> "Generate a reviewable HTML version of this file"

The agent creates `spec.html` with CollaDoc embedded. You never need to create HTML manually.

**When you do not need review at all:**

Not every markdown file needs an HTML version. Reference docs, notes, archives — skip it. Only generate HTML when you want a review surface. The agent will ask after completing a spec, but it will not create HTML unless you say yes.

---

## Using the annotation UI

1. Open any CollaDoc HTML file in Chrome (via `http://localhost:3000/spec.html` if the server is running, or directly as a file)
2. Select any text in the document
3. A "+ Comment" tooltip appears — click it
4. Type your comment and press **Post** (or Cmd+Enter)
5. The comment appears highlighted in yellow in the document and as a card in the right sidebar
6. To reply, type in the reply field inside a card and press Enter
7. To resolve a thread, click the checkmark. To reopen it, click "resolved ↩"
8. The agent reads open threads (`"resolved": false`) and addresses them in the next cycle

---

## What the agent sees

When an agent reads your HTML file, the `colladoc-data` block looks like this:

```json
[
  {
    "id": "t_1715512800000",
    "anchor": "DLOM range: 15%–35%",
    "comment": "Should we let the user override this range?",
    "author": "yuval",
    "ts": "2026-05-12T09:15:00.000Z",
    "resolved": false,
    "replies": []
  }
]
```

The agent filters for `"resolved": false`, reads the anchor text to find the location in the source, edits the `.md`, regenerates the HTML, and sets `"resolved": true`.

---

## Install

### Requirements

- Node.js 18+ (for the optional local server)
- Chrome or Edge (for the annotation UI — uses `position:fixed` overlay, not an extension)
- Google Drive desktop app (for syncing between machines — no cloud service needed)

### Setup (each machine)

**1. Clone the repo and sync to Drive**

The repo should live inside your Google Drive folder so both machines see the same files:

```bash
cd ~/Library/CloudStorage/GoogleDrive-you@example.com/YourFolder
git clone https://github.com/your-org/colladoc
cd colladoc
```

Or if it is already on Drive (synced from another machine), just `cd` to it.

**2. Install the server as a background service**

```bash
bash install.sh /path/to/your/drive/folder 3000
```

Replace `/path/to/your/drive/folder` with the root folder you want to serve. All HTML files in that folder (and subdirectories, via the static server) become accessible at `http://localhost:3000`.

The script creates a macOS LaunchAgent that starts the server automatically on login. Logs go to `~/Library/Logs/colladoc/`.

To uninstall:
```bash
launchctl unload ~/Library/LaunchAgents/com.colladoc.server.plist
rm ~/Library/LaunchAgents/com.colladoc.server.plist
```

**3. Set up Claude Code to embed CollaDoc in HTML output**

Add the following rule to your global `CLAUDE.md` file (`~/.claude/CLAUDE.md`):

````
## HTML Output — CollaDoc annotation layer

When you finish generating any HTML spec, plan, report, or document, always:

1. Embed this block at the end of `<body>`, just before `</body>`:
```html
<!-- CollaDoc annotation store — readable by any AI -->
<script type="application/json" id="colladoc-data">
[]
</script>
<script src="/colladoc.js"></script>
```
If the file will not be served from localhost (standalone HTML), inline `colladoc.js` content directly instead of using `src`.

2. Include this in `<head>`:
```html
<meta name="colladoc" content="v1">
```

Rules:
- The `colladoc-data` block must always be present, even if empty (`[]`)
- Never pre-populate it — start empty
- Use exactly `id="colladoc-data"` and `type="application/json"`
- Place `colladoc-data` BEFORE the `colladoc.js` script tag

After completing any spec or plan as a `.md` file, ask: "Want me to generate a reviewable HTML version with CollaDoc?" — but do NOT auto-generate without being asked.

When asked to "address feedback" or "resolve comments" on an HTML file:
1. Read the HTML file
2. Parse the `<script id="colladoc-data">` block
3. Filter for `"resolved": false` — only act on open threads
4. Read the corresponding `.md` source file
5. Edit the `.md` to address each open thread
6. Regenerate the HTML from the updated `.md`
7. In the regenerated HTML, set `"resolved": true` on each thread you addressed
8. Preserve all threads (resolved and open)
````

Or ask Claude Code to do it for you:

> "Add the CollaDoc rule to my global CLAUDE.md. The rule is in the README at [path to this repo]/README.md under '## Set up Claude Code'."

---

## How the server handles concurrent saves

Both machines can have the same HTML file open and post comments at the same time. The server merges annotation arrays by `id`:

- New annotations from either side are added
- If both sides modified the same annotation (e.g. both resolved it), the most recent write wins for `resolved` and `replies`
- Sort order is always by timestamp ascending
- No annotation is ever dropped

If the server is not reachable (file opened directly, server not running), annotations are saved to `localStorage` and the in-file block is updated in the browser's DOM. The on-disk file is not updated until the server is available. This means the agent will see stale data until the server patches the file.

---

## Embedding CollaDoc in your own HTML

The `colladoc.js` file is a self-contained IIFE. Drop it at the end of any HTML file:

```html
<script type="application/json" id="colladoc-data">
[]
</script>
<script>
  /* paste colladoc.js content here */
</script>
```

Or serve it from localhost and use:

```html
<script src="http://localhost:3000/colladoc.js"></script>
```

The script detects `window.__colladocLoaded` and refuses to run twice if embedded multiple times.

---

## Architecture

```
spec.md                    source of truth
  │
  ▼ (agent generates)
spec.html
  ├── document content
  ├── <script id="colladoc-data">[ annotations ]</script>
  └── <script> colladoc.js </script>
        │
        ├── fixed topbar (position:fixed, z-index 9000)
        ├── fixed sidebar (position:fixed, z-index 8999)
        ├── localStorage  ← primary persistence (works on file://)
        └── POST /colladoc/patch ← server merge when available

colladoc-server.js
  └── src/server.js
        ├── POST /colladoc/patch  → merge by id → write to disk
        └── GET  /colladoc/files  → list .html files in serve dir

src/merge.js      annotation merge logic
src/patch-html.js extract / replace colladoc-data block
```

---

## Development

```bash
npm test          # run all tests (Node built-in test runner, no deps)
node colladoc-server.js ./path/to/serve 3000
```

Tests cover merge logic, HTML patching, and server endpoints (24 tests, no external dependencies).
