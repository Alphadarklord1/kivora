#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MODELS_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime', 'models');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'electron', 'runtime', 'SHA256SUMS.txt');

const MODEL_FILES = new Map([
  ['mini', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'],
  ['balanced', 'qwen2.5-3b-instruct-q4_k_m.gguf'],
  ['pro', 'qwen2.5-7b-instruct-q4_k_m.gguf'],
]);

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v = ''] = arg.slice(2).split('=');
    args[k] = v;
  }
  return args;
}

function normalizeKeys(value) {
  const raw = String(value || 'mini,balanced,pro')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = [...new Set(raw)];
  if (unique.length === 0) {
    throw new Error('No model keys provided.');
  }
  for (const key of unique) {
    if (!MODEL_FILES.has(key)) {
      throw new Error(`Unsupported model key "${key}". Allowed: mini, balanced, pro.`);
    }
  }
  return unique;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelsDir = path.resolve(args['models-dir'] || process.env.STUDYPILOT_MODELS_DIR || DEFAULT_MODELS_DIR);
  const output = path.resolve(args.out || DEFAULT_OUTPUT);
  const keys = normalizeKeys(args.models);

  const rows = [];
  for (const key of keys) {
    const file = MODEL_FILES.get(key);
    const fullPath = path.join(modelsDir, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing model file for "${key}": ${fullPath}`);
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`Invalid model file (size <= 0): ${fullPath}`);
    }
    // eslint-disable-next-line no-await-in-loop
    const digest = await sha256File(fullPath);
    rows.push(`${digest}  ${file}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${rows.join('\n')}\n`, 'utf8');
  console.log(`Wrote checksums: ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
