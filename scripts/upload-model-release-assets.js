#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPO = process.env.STUDYPILOT_RELEASE_REPO || 'Alphadarklord1/kivora';
const DEFAULT_MODELS_DIR = process.env.STUDYPILOT_MODELS_DIR || path.join(process.env.HOME || '', 'Kivora-model-store');
const DEFAULT_MANIFEST = path.join(PROJECT_ROOT, 'electron', 'runtime', 'model-manifest.json');
const DEFAULT_CHECKSUMS = path.join(PROJECT_ROOT, 'electron', 'runtime', 'SHA256SUMS.txt');
const MODEL_FILES = [
  'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  'qwen2.5-3b-instruct-q4_k_m.gguf',
  'qwen2.5-7b-instruct-q4_k_m.gguf',
];
const RELEASE_UPLOAD_LIMIT_BYTES = 2147483648;

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v = ''] = arg.slice(2).split('=');
    args[k] = v;
  }
  return args;
}

function normalizeTag(input) {
  const value = String(input || '').trim();
  if (!value) {
    throw new Error('Missing --tag (example: --tag=v1.1.3)');
  }
  return value.startsWith('v') ? value : `v${value}`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function ensureFilesExist(files) {
  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`File not found: ${file}`);
    }
  }
}

function splitModelPaths(modelPaths) {
  const releasable = [];
  const externalOnly = [];
  for (const modelPath of modelPaths) {
    const size = fs.statSync(modelPath).size;
    if (size >= RELEASE_UPLOAD_LIMIT_BYTES) {
      externalOnly.push(modelPath);
    } else {
      releasable.push(modelPath);
    }
  }
  return { releasable, externalOnly };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = normalizeTag(args.tag || process.env.STUDYPILOT_RELEASE_TAG);
  const repo = String(args.repo || DEFAULT_REPO).trim();
  const modelsDir = path.resolve(args['models-dir'] || DEFAULT_MODELS_DIR);
  const manifestPath = path.resolve(args.manifest || DEFAULT_MANIFEST);
  const checksumsPath = path.resolve(args.checksums || DEFAULT_CHECKSUMS);

  if (!repo.includes('/')) {
    throw new Error(`Invalid repo "${repo}". Use owner/name format.`);
  }

  const modelPaths = MODEL_FILES.map((file) => path.join(modelsDir, file));
  ensureFilesExist(modelPaths);
  const { releasable, externalOnly } = splitModelPaths(modelPaths);

  run(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts', 'generate-model-manifest.js'),
    `--tag=${tag}`,
    `--repo=${repo}`,
    `--models-dir=${modelsDir}`,
    `--out=${manifestPath}`,
  ]);

  run(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts', 'generate-model-checksums.js'),
    `--models-dir=${modelsDir}`,
    '--models=mini,balanced,pro',
    `--out=${checksumsPath}`,
  ]);

  run(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts', 'validate-model-manifest.js'),
    `--manifest=${manifestPath}`,
    `--repo=${repo}`,
  ]);

  run(process.execPath, [
    path.join(PROJECT_ROOT, 'scripts', 'validate-model-checksums.js'),
    `--checksums=${checksumsPath}`,
    `--manifest=${manifestPath}`,
    `--models-dir=${modelsDir}`,
  ]);

  run('gh', [
    'release',
    'upload',
    tag,
    ...releasable,
    manifestPath,
    checksumsPath,
    '--repo',
    repo,
    '--clobber',
  ]);

  console.log('');
  console.log(`Uploaded release-safe model assets + manifest + checksums to ${repo} ${tag}`);
  if (externalOnly.length > 0) {
    console.log(`Skipped oversized models that must stay externally hosted: ${externalOnly.map((file) => path.basename(file)).join(', ')}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
