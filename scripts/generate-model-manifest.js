#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'electron', 'runtime', 'model-manifest.json');
const DEFAULT_MODELS_DIR = path.join(PROJECT_ROOT, 'electron', 'runtime', 'models');
const DEFAULT_REPO = process.env.STUDYPILOT_MODEL_REPO || 'Alphadarklord1/kivora';

const MODEL_DEFS = [
  { key: 'mini', modelId: 'Qwen2.5-1.5B-Instruct', quantization: 'Q4_K_M', file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf', minRamGb: 8 },
  { key: 'balanced', modelId: 'Qwen2.5-3B-Instruct', quantization: 'Q4_K_M', file: 'qwen2.5-3b-instruct-q4_k_m.gguf', minRamGb: 16 },
  {
    key: 'pro',
    modelId: 'Qwen2.5-7B-Instruct',
    quantization: 'Q4_K_M',
    file: 'qwen2.5-7b-instruct-q4_k_m.gguf',
    minRamGb: 24,
    externalUrl: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
  },
];

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [k, v = ''] = arg.slice(2).split('=');
    args[k] = v;
  }
  return args;
}

function normalizeTag(tagOrVersion) {
  const value = String(tagOrVersion || '').trim();
  if (!value) throw new Error('Missing --tag (example: --tag=v1.1.3)');
  return value.startsWith('v') ? value : `v${value}`;
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
  const tag = normalizeTag(args.tag || process.env.STUDYPILOT_RELEASE_TAG);
  const repo = (args.repo || process.env.STUDYPILOT_RELEASE_REPO || DEFAULT_REPO).trim();
  const outPath = path.resolve(args.out || DEFAULT_OUTPUT);
  const modelsDir = path.resolve(args['models-dir'] || process.env.STUDYPILOT_MODELS_DIR || DEFAULT_MODELS_DIR);

  if (!repo.includes('/')) {
    throw new Error(`Invalid repo "${repo}". Use owner/name format.`);
  }

  const models = [];
  for (const def of MODEL_DEFS) {
    const filePath = path.join(modelsDir, def.file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing model file: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`Model file invalid (size <= 0): ${filePath}`);
    }
    // eslint-disable-next-line no-await-in-loop
    const sha256 = await sha256File(filePath);
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`Invalid sha256 for ${def.file}`);
    }

    models.push({
      key: def.key,
      modelId: def.modelId,
      quantization: def.quantization,
      file: def.file,
      sizeBytes: stat.size,
      sha256,
      minRamGb: def.minRamGb,
      url: def.externalUrl || `https://github.com/${repo}/releases/download/${tag}/${def.file}`,
    });
  }

  const manifest = {
    version: tag.replace(/^v/, ''),
    generatedAt: new Date().toISOString(),
    models,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote manifest: ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
