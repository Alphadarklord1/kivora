import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, '..', 'scripts', 'verify-desktop-bundle.js');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kivora-bundle-'));
  const manifestPath = path.join(root, 'model-manifest.json');
  const modelsDir = path.join(root, 'models');
  const binDir = path.join(root, 'bin');
  const macBinDir = path.join(binDir, 'darwin-arm64');
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(macBinDir, { recursive: true });

  fs.writeFileSync(path.join(modelsDir, 'qwen2.5-1.5b-instruct-q4_k_m.gguf'), 'mini-model', 'utf8');
  fs.writeFileSync(path.join(macBinDir, 'llama-server'), 'runtime-binary', 'utf8');

  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    models: [
      {
        key: 'mini',
        modelId: 'Qwen2.5-1.5B-Instruct',
        quantization: 'Q4_K_M',
        file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        sizeBytes: 10,
        sha256: 'a'.repeat(64),
        minRamGb: 8,
      },
      {
        key: 'balanced',
        modelId: 'Qwen2.5-3B-Instruct',
        quantization: 'Q4_K_M',
        file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
        sizeBytes: 20,
        sha256: '',
        minRamGb: 16,
      },
      {
        key: 'pro',
        modelId: 'Qwen2.5-7B-Instruct',
        quantization: 'Q4_K_M',
        file: 'qwen2.5-7b-instruct-q4_k_m.gguf',
        sizeBytes: 30,
        sha256: '',
        minRamGb: 24,
      },
    ],
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { root, manifestPath, modelsDir, binDir };
}

test('desktop bundle verification passes when mini and runtime are staged', () => {
  const fixture = makeFixture();
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--platform=mac',
      `--manifest=${fixture.manifestPath}`,
      `--models-dir=${fixture.modelsDir}`,
      `--bin-dir=${fixture.binDir}`,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

test('desktop bundle verification fails when bundled mini is missing', () => {
  const fixture = makeFixture();
  fs.rmSync(path.join(fixture.modelsDir, 'qwen2.5-1.5b-instruct-q4_k_m.gguf'));

  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--platform=mac',
      `--manifest=${fixture.manifestPath}`,
      `--models-dir=${fixture.modelsDir}`,
      `--bin-dir=${fixture.binDir}`,
    ],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr || result.stdout, /Bundled Mini model is missing/i);
  fs.rmSync(fixture.root, { recursive: true, force: true });
});
