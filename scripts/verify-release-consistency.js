#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
const MODEL_FILES = new Map([
  ['mini', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'],
  ['balanced', 'qwen2.5-3b-instruct-q4_k_m.gguf'],
  ['pro', 'qwen2.5-7b-instruct-q4_k_m.gguf'],
]);
const REQUIRED_STATIC_ASSETS = ['model-manifest.json', 'SHA256SUMS.txt'];

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--')) continue;
    const [k, v = ''] = arg.slice(2).split('=');
    args[k] = v;
  }
  return args;
}

function fail(message) {
  console.error(`Release consistency check failed: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv);
const tag = args.tag || process.env.GITHUB_REF_NAME || '';
const assetsCsv = args.assets || '';
const assets = assetsCsv
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const requiredModels = (args['required-models'] || 'mini,balanced')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!tag) fail('missing --tag');

if (!/^v\d+\.\d+\.\d+(-[\w.-]+)?$/.test(tag)) {
  fail(`tag "${tag}" does not follow vX.Y.Z format`);
}

const version = pkg.version;
if (!version) fail('package.json version is missing');

if (tag !== `v${version}`) {
  fail(`tag ${tag} must match package.json version v${version}`);
}

if (assets.length === 0) {
  console.warn('Release consistency check: no assets provided, skipped asset-name verification.');
  process.exit(0);
}

for (const requiredName of REQUIRED_STATIC_ASSETS) {
  if (!assets.includes(requiredName)) {
    fail(`missing required release asset "${requiredName}"`);
  }
}

for (const key of requiredModels) {
  const fileName = MODEL_FILES.get(key);
  if (!fileName) {
    fail(`unknown required model key "${key}". Allowed: mini, balanced, pro`);
  }
  if (!assets.includes(fileName)) {
    fail(`missing required model asset "${fileName}"`);
  }
}

const mismatched = assets.filter((name) => {
  if (REQUIRED_STATIC_ASSETS.includes(name)) return false;
  if (name.endsWith('.gguf')) return false;
  if (name.endsWith('.blockmap')) return false;
  return !name.includes(version);
});

if (mismatched.length > 0) {
  fail(`asset names must include version ${version}. Mismatched: ${mismatched.join(', ')}`);
}

console.log(`Release consistency check passed for ${tag} with ${assets.length} assets.`);
