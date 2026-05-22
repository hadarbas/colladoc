# CollaDoc UX Review

A short test document for reviewing the new CollaDoc UX improvements.

## Background

CollaDoc lets teams annotate HTML specs without leaving the browser. Comments are stored as JSON inside the file itself, so the agent can read and address them directly.

## What changed

Four new features shipped in this round:

**Ghost quotes** — when the agent rewrites a section and an anchor text disappears, the comment no longer silently vanishes. It shows as an amber card with the original context: prefix, anchor, and suffix. You can still resolve it.

**Edit and delete** — you can now fix a typo in your own comment using the pencil icon, or retract it entirely with the X button. Both require confirmation. Edited comments show an "(edited)" label.

**Clean resolved** — the topbar now shows a "Clean N resolved" button when resolved threads exist. One click (plus confirm) permanently removes them from the JSON.

**Sync warning** — when the server is running, the topbar shows an amber "Out of sync" badge if the `.md` file was modified after the HTML was last generated.

## How to test

1. Open this file at `http://localhost:3000/test-doc.html`
2. Check the sidebar — you should see three pre-seeded threads
3. The amber card is a ghost quote (anchor text no longer in the document)
4. Try editing or deleting the open thread tagged to your name
5. Click "Clean 1 resolved" in the topbar to remove the resolved thread
6. Add a new comment on any text and verify it appears
