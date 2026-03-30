#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(PROJECT_ROOT, 'electron', 'runtime', 'model-manifest.json');
const DEFAULT_MODELS_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime', 'models');
const DEFAULT_BIN_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime', 'bin');
const REQUIRED_MODEL_KEY = 'mini';
const REQUIRED_MODEL_FILE = 'qwen2.5-1.5b-instruct-q4_k_m.gguf';

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value = ''] = arg.slice(2).split('=');
    args[key] = value;
  }
  return args;
}

function fail(message) {
  console.error(`[verify-desktop-bundle] ${message}`);
  process.exit(1);
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} is missing: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    fail(`${label} is not a file: ${filePath}`);
  }
  if (stat.size <= 0) {
    fail(`${label} is empty: ${filePath}`);
  }
  return stat;
}

function resolvePackagedResourcesDir(appOutDir, productName) {
  if (!appOutDir) return null;
  const base = path.resolve(appOutDir);
  const candidates = [
    path.join(base, 'Contents', 'Resources'),
    path.join(base, 'resources'),
  ];

  if (productName) {
    candidates.unshift(path.join(base, `${productName}.app`, 'Contents', 'Resources'));
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    fail(`Manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.models)) {
    fail(`Manifest is invalid: ${manifestPath}`);
  }
  return manifest;
}

function validateManifestEntry(manifest) {
  const mini = manifest.models.find((model) => model.key === REQUIRED_MODEL_KEY);
  if (!mini) {
    fail('Manifest is missing the required "mini" model entry');
  }
  if (mini.file !== REQUIRED_MODEL_FILE) {
    fail(`Manifest mini file mismatch: expected ${REQUIRED_MODEL_FILE}, got ${mini.file}`);
  }
  if (!/^[a-f0-9]{64}$/.test(mini.sha256 || '')) {
    fail('Manifest mini sha256 must be a full lowercase hex digest');
  }
  if (!Number.isFinite(mini.sizeBytes) || Number(mini.sizeBytes) <= 0) {
    fail('Manifest mini sizeBytes must be greater than 0');
  }
}

function validateOptionalEntries(manifest) {
  const optionalKeys = ['balanced', 'pro'];
  for (const key of optionalKeys) {
    const entry = manifest.models.find((model) => model.key === key);
    if (!entry) {
      fail(`Manifest is missing the optional "${key}" entry`);
    }
    if (entry.sha256 && !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      fail(`Manifest ${key} sha256 is malformed`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = args.platform || 'mac';
  const manifestPath = path.resolve(args.manifest || DEFAULT_MANIFEST);
  const productName = args['product-name'] || 'Kivora';
  const modelsDir = path.resolve(args['models-dir'] || DEFAULT_MODELS_DIR);
  const binDir = path.resolve(args['bin-dir'] || DEFAULT_BIN_DIR);
  const appOutDir = args['app-out-dir'];
  const requirePackaged = args.packaged === '1' || args.packaged === 'true';

  const manifest = loadManifest(manifestPath);
  validateManifestEntry(manifest);
  validateOptionalEntries(manifest);

  const runtimeBinary = platform === 'mac'
    ? path.join(binDir, 'darwin-arm64', 'llama-server')
    : platform === 'win'
      ? path.join(binDir, 'win32-x64', 'llama-server.exe')
      : null;

  if (!runtimeBinary) {
    fail(`Unsupported platform "${platform}"`);
  }

  ensureFile(path.join(modelsDir, REQUIRED_MODEL_FILE), 'Bundled Mini model');
  ensureFile(runtimeBinary, 'Desktop runtime binary');

  if (requirePackaged) {
    const resourcesDir = resolvePackagedResourcesDir(appOutDir, productName);
    if (!resourcesDir) {
      fail(`Could not find packaged resources directory from ${appOutDir}`);
    }

    ensureFile(path.join(resourcesDir, 'model-manifest.json'), 'Packaged model manifest');
    ensureFile(path.join(resourcesDir, 'models', REQUIRED_MODEL_FILE), 'Packaged Mini model');
    const packagedRuntime = platform === 'mac'
      ? path.join(resourcesDir, 'bin', 'darwin-arm64', 'llama-server')
      : path.join(resourcesDir, 'bin', 'win32-x64', 'llama-server.exe');
    ensureFile(packagedRuntime, 'Packaged runtime binary');
  }

  console.log(`[verify-desktop-bundle] ${platform} bundle is valid for first-launch offline Mini`);
}

main();
