import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = path.join(__dirname, '..', 'scripts');

const MODEL_FILES = [
  'qwen2.5-1.5b-instruct-q4_k_m.gguf',
  'qwen2.5-3b-instruct-q4_k_m.gguf',
  'qwen2.5-7b-instruct-q4_k_m.gguf',
];

function makeFixtureDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kivora-models-'));
  const modelsDir = path.join(root, 'models');
  fs.mkdirSync(modelsDir, { recursive: true });
  for (const file of MODEL_FILES) {
    fs.writeFileSync(path.join(modelsDir, file), `fixture-${file}`, 'utf8');
  }
  return {
    root,
    modelsDir,
    manifestPath: path.join(root, 'model-manifest.json'),
    checksumsPath: path.join(root, 'SHA256SUMS.txt'),
  };
}

test('checksum generation + validation passes for manifest models', () => {
  const fixture = makeFixtureDir();

  const generateManifest = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'generate-model-manifest.js'),
      '--tag=v1.1.0',
      '--repo=Alphadarklord1/kivora',
      `--models-dir=${fixture.modelsDir}`,
      `--out=${fixture.manifestPath}`,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(generateManifest.status, 0, generateManifest.stderr);

  const generateChecksums = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'generate-model-checksums.js'),
      `--models-dir=${fixture.modelsDir}`,
      `--out=${fixture.checksumsPath}`,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(generateChecksums.status, 0, generateChecksums.stderr);

  const validate = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'validate-model-checksums.js'),
      `--checksums=${fixture.checksumsPath}`,
      `--manifest=${fixture.manifestPath}`,
      `--models-dir=${fixture.modelsDir}`,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(validate.status, 0, validate.stderr);

  fs.rmSync(fixture.root, { recursive: true, force: true });
});

test('checksum validation fails when checksums are tampered', () => {
  const fixture = makeFixtureDir();

  const generateManifest = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'generate-model-manifest.js'),
      '--tag=v1.1.0',
      '--repo=Alphadarklord1/kivora',
      `--models-dir=${fixture.modelsDir}`,
      `--out=${fixture.manifestPath}`,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(generateManifest.status, 0, generateManifest.stderr);

  const generateChecksums = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'generate-model-checksums.js'),
      `--models-dir=${fixture.modelsDir}`,
      `--out=${fixture.checksumsPath}`,
    ],
    { encoding: 'utf8' }
  );
  assert.equal(generateChecksums.status, 0, generateChecksums.stderr);

  const contents = fs.readFileSync(fixture.checksumsPath, 'utf8');
  fs.writeFileSync(fixture.checksumsPath, contents.replace(/[a-f0-9]/, '0'), 'utf8');

  const validate = spawnSync(
    process.execPath,
    [
      path.join(scriptsDir, 'validate-model-checksums.js'),
      `--checksums=${fixture.checksumsPath}`,
      `--manifest=${fixture.manifestPath}`,
      `--models-dir=${fixture.modelsDir}`,
    ],
    { encoding: 'utf8' }
  );
  assert.notEqual(validate.status, 0);
  assert.match(validate.stderr, /checksum mismatch/i);

  fs.rmSync(fixture.root, { recursive: true, force: true });
});
