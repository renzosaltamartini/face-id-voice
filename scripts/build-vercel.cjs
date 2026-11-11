const { mkdirSync, copyFileSync, cpSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'public');
mkdirSync(output, { recursive: true });
copyFileSync(path.join(root, 'index.html'), path.join(output, 'index.html'));
cpSync(path.join(root, 'panel', 'room'), path.join(output, 'panel', 'room'), { recursive: true });
cpSync(path.join(root, 'shared'), path.join(output, 'shared'), { recursive: true });
