#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.join(__dirname, '..');
const RUNTIME_MODELS_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime', 'models');

const MODEL_REGISTRY = {
  mini: {
    key: 'mini',
    label: 'Qwen2.5-1.5B-Instruct (Q4_K_M)',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    recommendation: '8-16GB RAM laptops',
  },
  balanced: {
    key: 'balanced',
    label: 'Qwen2.5-3B-Instruct (Q4_K_M)',
    file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    recommendation: '16-24GB RAM laptops/desktops',
  },
  pro: {
    key: 'pro',
    label: 'Qwen2.5-7B-Instruct (Q4_K_M)',
    file: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    recommendation: '24GB+ RAM desktops/workstations',
  },
};

const TARGETS = {
  laptop: ['mini'],
  balanced: ['mini', 'balanced'],
  pc: ['mini', 'balanced', 'pro'],
};

function printUsageAndExit() {
  console.log('Usage: node scripts/prepare-model-bundle.js --target=<laptop|balanced|pc> [--source=<path>] [--dry-run]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { target: null, source: null, dryRun: false };

  for (const arg of argv) {
    if (arg.startsWith('--target=')) {
      args.target = arg.split('=')[1];
    } else if (arg.startsWith('--source=')) {
      args.source = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function resolveSourceDir(sourceArg) {
  if (sourceArg) return path.resolve(sourceArg);
  if (process.env.KIVORA_MODEL_STORE) return path.resolve(process.env.KIVORA_MODEL_STORE);
  return path.join(os.homedir(), 'Kivora-model-store');
}

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function bytesToGb(bytes) {
  return (bytes / (1024 ** 3)).toFixed(2);
}

function run() {
  const { target, source, dryRun } = parseArgs(process.argv.slice(2));
  if (!target || !TARGETS[target]) {
    printUsageAndExit();
  }

  const sourceDir = resolveSourceDir(source);
  const modelKeys = TARGETS[target];
  const models = modelKeys.map((key) => MODEL_REGISTRY[key]);

  const missing = [];
  const existingModelFiles = [];
  let totalBytes = 0;

  for (const model of models) {
    const src = path.join(sourceDir, model.file);
    if (!fs.existsSync(src)) {
      missing.push({ ...model, src });
      continue;
    }
    const stat = fs.statSync(src);
    totalBytes += stat.size;
    existingModelFiles.push({ ...model, src, size: stat.size });
  }

  if (missing.length > 0) {
    console.error('Missing required model files in source directory:');
    for (const item of missing) {
      console.error(`- ${item.label}`);
      console.error(`  expected: ${item.src}`);
    }
    console.error('\nPlace these files in the source directory and re-run.');
    process.exit(2);
  }

  console.log(`Target: ${target}`);
  console.log(`Source: ${sourceDir}`);
  console.log(`Destination: ${RUNTIME_MODELS_DIR}`);
  console.log(`Models to bundle (${existingModelFiles.length}):`);
  for (const model of existingModelFiles) {
    console.log(`- ${model.label}`);
    console.log(`  ${model.file} (${bytesToGb(model.size)} GB)`);
  }
  console.log(`Total model size: ${bytesToGb(totalBytes)} GB`);

  if (dryRun) {
    console.log('\nDry run complete. No files copied.');
    return;
  }

  ensureDirExists(RUNTIME_MODELS_DIR);

  for (const entry of fs.readdirSync(RUNTIME_MODELS_DIR)) {
    if (entry === '.gitkeep') continue;
    const filePath = path.join(RUNTIME_MODELS_DIR, entry);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      fs.rmSync(filePath);
    }
  }

  for (const model of existingModelFiles) {
    const dest = path.join(RUNTIME_MODELS_DIR, model.file);
    fs.copyFileSync(model.src, dest);
  }

  console.log('\nModel bundle staged successfully.');
  console.log('Next step: run your Electron build command (for example `npm run electron:build:mac`).');
}

run();
