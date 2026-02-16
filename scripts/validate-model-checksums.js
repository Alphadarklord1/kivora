#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CHECKSUMS = path.join(PROJECT_ROOT, 'electron', 'runtime', 'SHA256SUMS.txt');
const DEFAULT_MANIFEST = path.join(PROJECT_ROOT, 'electron', 'runtime', 'model-manifest.json');

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v = ''] = arg.slice(2).split('=');
    args[k] = v;
  }
  return args;
}

function fail(message) {
  throw new Error(message);
}

function parseChecksumFile(content) {
  const lines = content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    fail('Checksum file is empty.');
  }

  const map = new Map();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/);
    if (!match) {
      fail(`Invalid checksum line: "${line}"`);
    }
    const [, digest, file] = match;
    if (map.has(file)) {
      fail(`Duplicate checksum entry for "${file}"`);
    }
    map.set(file, digest);
  }
  return map;
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
  const checksumsPath = path.resolve(args.checksums || DEFAULT_CHECKSUMS);
  const manifestPath = path.resolve(args.manifest || DEFAULT_MANIFEST);
  const modelsDir = args['models-dir'] ? path.resolve(args['models-dir']) : null;

  if (!fs.existsSync(checksumsPath)) {
    fail(`Checksum file not found: ${checksumsPath}`);
  }
  if (!fs.existsSync(manifestPath)) {
    fail(`Manifest file not found: ${manifestPath}`);
  }

  const checksumMap = parseChecksumFile(fs.readFileSync(checksumsPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.models)) {
    fail('Manifest must include models[]');
  }

  for (const model of manifest.models) {
    if (!model || typeof model !== 'object') {
      fail('Invalid model entry in manifest.');
    }
    if (typeof model.file !== 'string' || !model.file.endsWith('.gguf')) {
      fail(`Invalid model.file value: ${model.file}`);
    }
    if (typeof model.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(model.sha256)) {
      fail(`Manifest sha256 is invalid for ${model.file}`);
    }
    const checksum = checksumMap.get(model.file);
    if (!checksum) {
      fail(`Missing checksum entry for ${model.file}`);
    }
    if (checksum !== model.sha256) {
      fail(`Checksum mismatch between manifest and SHA256SUMS for ${model.file}`);
    }
    if (modelsDir) {
      const filePath = path.join(modelsDir, model.file);
      if (!fs.existsSync(filePath)) {
        fail(`Model file missing for checksum validation: ${filePath}`);
      }
      // eslint-disable-next-line no-await-in-loop
      const actualDigest = await sha256File(filePath);
      if (actualDigest !== checksum) {
        fail(`Checksum mismatch for ${model.file} against local file`);
      }
    }
  }

  console.log(`Checksum validation passed: ${checksumsPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
