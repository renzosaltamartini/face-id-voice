const { mkdirSync, copyFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'public');
mkdirSync(output, { recursive: true });
copyFileSync(path.join(root, 'index.html'), path.join(output, 'index.html'));
