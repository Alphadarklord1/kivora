import test from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../lib/auth/two-factor-core.ts');

test('generateTwoFactorSecret returns a base32 secret', () => {
  const secret = mod.generateTwoFactorSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.ok(secret.length >= 32);
});

test('normalizeTwoFactorCode strips non-digits and limits length', () => {
  assert.equal(mod.normalizeTwoFactorCode('12 34-56'), '123456');
  assert.equal(mod.normalizeTwoFactorCode('123456789'), '123456');
});

test('verifyTwoFactorCode accepts a current valid code', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const now = 1_700_000_000_000;
  const code = mod.getCurrentTwoFactorCode(secret, now);
  assert.equal(mod.verifyTwoFactorCode(secret, code, now), true);
  assert.equal(mod.verifyTwoFactorCode(secret, '000000', now), false);
});

test('buildOtpAuthUri includes issuer and account email', () => {
  const uri = mod.buildOtpAuthUri('student@example.com', 'JBSWY3DPEHPK3PXP');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /issuer=Kivora/);
  assert.match(uri, /student%40example\.com/);
});
