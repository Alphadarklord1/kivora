import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, '..', 'scripts', 'verify-release-consistency.js');

test('release consistency passes for matching tag and assets', () => {
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--tag=v1.2.0-beta.1',
      '--assets=Kivora-1.2.0-beta.1-arm64.dmg,Kivora-1.2.0-beta.1-arm64-mac.zip,model-manifest.json,SHA256SUMS.txt,qwen2.5-1.5b-instruct-q4_k_m.gguf,qwen2.5-3b-instruct-q4_k_m.gguf,qwen2.5-7b-instruct-q4_k_m.gguf',
    ],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
});

test('release consistency fails when tag mismatches package version', () => {
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--tag=v9.9.9',
      '--assets=Kivora-1.1.0-arm64.dmg,model-manifest.json,SHA256SUMS.txt,qwen2.5-1.5b-instruct-q4_k_m.gguf,qwen2.5-3b-instruct-q4_k_m.gguf,qwen2.5-7b-instruct-q4_k_m.gguf',
    ],
    { encoding: 'utf8' }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must match package\.json version/i);
});
