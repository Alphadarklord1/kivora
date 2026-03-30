/**
 * electron-builder afterPack hook.
 * Adds the Open Kivora launcher and enforces the 1.0 Mac offline bundle contract.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const productName = context.packager?.appInfo?.productFilename || 'Kivora';
  const verifyScript = path.join(__dirname, 'verify-desktop-bundle.js');
  const verifyResult = spawnSync(process.execPath, [
    verifyScript,
    '--platform=mac',
    '--packaged=1',
    `--app-out-dir=${context.appOutDir}`,
    `--product-name=${productName}`,
  ], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
  });

  if (verifyResult.status !== 0) {
    const details = [verifyResult.stdout, verifyResult.stderr].filter(Boolean).join('\n').trim();
    throw new Error(details || 'Mac desktop bundle verification failed');
  }

  const src = path.join(__dirname, 'open-kivora.command');
  const dst = path.join(context.appOutDir, 'Open Kivora.command');

  if (!fs.existsSync(src)) {
    console.warn('[after-pack-mac] open-kivora.command not found — skipping');
    return;
  }

  fs.copyFileSync(src, dst);
  fs.chmodSync(dst, 0o755);
  console.log('[after-pack-mac] Added Open Kivora.command to DMG contents');
};
