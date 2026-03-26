/**
 * electron-builder afterPack hook.
 * Copies the Open Kivora.command launcher into the DMG content directory
 * so students can double-click it to bypass macOS Gatekeeper.
 */

const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

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
