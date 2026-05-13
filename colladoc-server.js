#!/usr/bin/env node
// CollaDoc server — run as: node colladoc-server.js [folder] [port]
// Serves HTML files from folder at localhost:PORT.
// POST /colladoc/patch — merges annotation block by ID, writes to disk.

import { startServer } from './src/server.js';
import { resolve } from 'node:path';

const serveDir = resolve(process.argv[2] || process.cwd());
const port = parseInt(process.argv[3] || '3000', 10);

const server = await startServer({ port, serveDir });
console.log(`CollaDoc server running at http://127.0.0.1:${port}`);
console.log(`Serving: ${serveDir}`);
console.log('Press Ctrl+C to stop.');

process.on('SIGTERM', () => server.stop().then(() => process.exit(0)));
process.on('SIGINT',  () => server.stop().then(() => process.exit(0)));
