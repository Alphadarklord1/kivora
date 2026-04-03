/**
 * electron-builder afterSign hook — notarizes the Mac app.
 *
 * Runs after code-signing. Skips silently when the required Apple
 * credentials are not present (local dev / unsigned builds).
 *
 * Required env vars for notarization:
 *   KIVORA_APPLE_TEAM_ID   — 10-character Apple Developer Team ID (e.g. AB12CD34EF)
 *   APPLE_ID               — Apple ID email used for the Developer account
 *   APPLE_ID_PASSWORD      — App-specific password for the Apple ID
 *
 * Generate an app-specific password at appleid.apple.com → Security → App Passwords.
 */

'use strict';

const path = require('node:path');

exports.default = async function notarize(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const teamId = process.env.KIVORA_APPLE_TEAM_ID;
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;

  if (!teamId || !appleId || !appleIdPassword) {
    console.log(
      '[notarize] Skipping — set KIVORA_APPLE_TEAM_ID, APPLE_ID, and APPLE_ID_PASSWORD to enable notarization.',
    );
    return;
  }

  // Require lazily so the package is optional during unsigned builds.
  let notarize;
  try {
    ({ notarize } = require('@electron/notarize'));
  } catch {
    console.warn('[notarize] @electron/notarize not installed — skipping. Run: npm i -D @electron/notarize');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[notarize] Submitting ${appPath} to Apple notary service…`);

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });

  console.log('[notarize] Notarization complete.');
};
