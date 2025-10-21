const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const outDir = path.join(projectRoot, 'out');
const outPackageJsonPath = path.join(outDir, 'package.json');

const minimalPackageJson = {
  name: '@talex-touch/core-app',
  version: '2.0.0',
  description: 'A powerful productivity launcher and automation tool',
  main: './main/index.js',
  author: 'TalexDreamSoul',
  homepage: 'https://talex-touch.tagzxia.com'
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPackageJsonPath, JSON.stringify(minimalPackageJson, null, 2));

console.log('Generated out/package.json for electron-builder');
