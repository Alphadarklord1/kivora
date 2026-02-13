#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_MANIFEST = path.join(PROJECT_ROOT, 'electron', 'runtime', 'model-manifest.json');
const DEFAULT_REPO = process.env.STUDYPILOT_MODEL_REPO || 'Alphadarklord1/studypilot';
const ALLOWED_KEYS = new Set(['mini', 'balanced', 'pro']);

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v = ''] = arg.slice(2).split('=');
    args[k] = v;
  }
  return args;
}

function asTag(version) {
  if (typeof version !== 'string' || !version.trim()) return null;
  return version.startsWith('v') ? version : `v${version}`;
}

function fail(message) {
  throw new Error(message);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.resolve(args.manifest || DEFAULT_MANIFEST);
  const repo = (args.repo || process.env.STUDYPILOT_RELEASE_REPO || DEFAULT_REPO).trim();

  if (!fs.existsSync(manifestPath)) {
    fail(`Manifest not found: ${manifestPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!raw || typeof raw !== 'object') fail('Manifest must be an object');
  if (!Array.isArray(raw.models)) fail('Manifest must include models[]');
  if (!raw.models.length) fail('Manifest models[] cannot be empty');

  const versionTag = asTag(raw.version);
  if (!versionTag) fail('Manifest version is required');
  const keySet = new Set();

  for (const model of raw.models) {
    if (!model || typeof model !== 'object') fail('Every model entry must be an object');
    if (!ALLOWED_KEYS.has(model.key)) fail(`Invalid model key: ${model.key}`);
    if (keySet.has(model.key)) fail(`Duplicate model key: ${model.key}`);
    keySet.add(model.key);

    if (typeof model.file !== 'string' || !model.file.endsWith('.gguf')) {
      fail(`Invalid file for ${model.key}`);
    }
    if (typeof model.modelId !== 'string' || !model.modelId.trim()) {
      fail(`Missing modelId for ${model.key}`);
    }
    if (typeof model.quantization !== 'string' || !model.quantization.trim()) {
      fail(`Missing quantization for ${model.key}`);
    }
    if (!Number.isFinite(model.sizeBytes) || Number(model.sizeBytes) <= 0) {
      fail(`sizeBytes must be > 0 for ${model.key}`);
    }
    if (typeof model.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(model.sha256)) {
      fail(`sha256 must be 64 lowercase hex chars for ${model.key}`);
    }
    if (!Number.isFinite(model.minRamGb) || Number(model.minRamGb) <= 0) {
      fail(`minRamGb must be > 0 for ${model.key}`);
    }
    if (typeof model.url !== 'string' || !model.url.startsWith(`https://github.com/${repo}/releases/download/${versionTag}/`)) {
      fail(`url is invalid or tag/repo mismatch for ${model.key}`);
    }
    if (!model.url.endsWith(`/${model.file}`)) {
      fail(`url/file mismatch for ${model.key}`);
    }
  }

  for (const requiredKey of ALLOWED_KEYS) {
    if (!keySet.has(requiredKey)) {
      fail(`Missing required model key: ${requiredKey}`);
    }
  }

  console.log(`Manifest validation passed: ${manifestPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
