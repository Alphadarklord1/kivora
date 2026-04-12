#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist-electron');
const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

const WINDOWS_ALIASES = [
  {
    from: `Kivora Setup ${version}.exe`,
    to: `Kivora-Setup-${version}.exe`,
  },
  {
    from: `Kivora Setup ${version}.exe.blockmap`,
    to: `Kivora-Setup-${version}.exe.blockmap`,
  },
  {
    from: `Kivora ${version}.exe`,
    to: `Kivora-${version}.exe`,
  },
];

const STALE_PATTERNS = [
  /^Kivora-1\.2\.0-beta\.1/i,
  /^StudyPilot/i,
  /^StudyHarbor/i,
  /\.bak/i,
];

function exists(filePath) {
  return fs.existsSync(filePath);
}

function replaceFile(src, dest) {
  fs.copyFileSync(src, dest);
  console.log(`updated ${path.basename(dest)} from ${path.basename(src)}`);
  if (src !== dest) {
    fs.rmSync(src, { force: true });
    console.log(`removed ${path.basename(src)}`);
  }
}

function removeIfExists(filePath) {
  if (!exists(filePath)) return;
  fs.rmSync(filePath, { force: true });
  console.log(`removed ${path.basename(filePath)}`);
}

function normalizeWindowsArtifacts() {
  for (const pair of WINDOWS_ALIASES) {
    const src = path.join(DIST_DIR, pair.from);
    const dest = path.join(DIST_DIR, pair.to);
    if (!exists(src)) continue;
    replaceFile(src, dest);
  }
}

function cleanStaleArtifacts() {
  const files = fs.readdirSync(DIST_DIR);
  for (const file of files) {
    if (STALE_PATTERNS.some((pattern) => pattern.test(file))) {
      removeIfExists(path.join(DIST_DIR, file));
    }
  }
}

function main() {
  if (!exists(DIST_DIR)) {
    console.error(`dist-electron not found at ${DIST_DIR}`);
    process.exit(1);
  }
  normalizeWindowsArtifacts();
  cleanStaleArtifacts();
  console.log(`Release artifacts normalized for Kivora ${version}.`);
}

main();
