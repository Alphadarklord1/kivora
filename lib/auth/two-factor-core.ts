import { randomBytes, createHmac } from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TWO_FACTOR_ISSUER = 'Kivora';
const TWO_FACTOR_PERIOD_SECONDS = 30;
const TWO_FACTOR_DIGITS = 6;
const TWO_FACTOR_WINDOW = 1;

function normalizeBase32(secret: string) {
  return secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(secret: string): Buffer {
  const normalized = normalizeBase32(secret);
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) % (10 ** TWO_FACTOR_DIGITS);

  return String(code).padStart(TWO_FACTOR_DIGITS, '0');
}

export function generateTwoFactorSecret(): string {
  return base32Encode(randomBytes(20));
}

export function normalizeTwoFactorCode(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '').slice(0, TWO_FACTOR_DIGITS);
}

export function verifyTwoFactorCode(secret: string, code: string, now = Date.now()): boolean {
  const normalizedCode = normalizeTwoFactorCode(code);
  if (normalizedCode.length !== TWO_FACTOR_DIGITS) return false;

  const counter = Math.floor(now / 1000 / TWO_FACTOR_PERIOD_SECONDS);
  for (let drift = -TWO_FACTOR_WINDOW; drift <= TWO_FACTOR_WINDOW; drift += 1) {
    if (hotp(secret, counter + drift) === normalizedCode) {
      return true;
    }
  }
  return false;
}

export function getCurrentTwoFactorCode(secret: string, now = Date.now()): string {
  const counter = Math.floor(now / 1000 / TWO_FACTOR_PERIOD_SECONDS);
  return hotp(secret, counter);
}

export function formatTwoFactorSecret(secret: string): string {
  return normalizeBase32(secret).replace(/(.{4})/g, '$1 ').trim();
}

export function buildOtpAuthUri(email: string, secret: string): string {
  const accountLabel = encodeURIComponent(`${TWO_FACTOR_ISSUER}:${email}`);
  const normalizedSecret = normalizeBase32(secret);
  return `otpauth://totp/${accountLabel}?secret=${normalizedSecret}&issuer=${encodeURIComponent(TWO_FACTOR_ISSUER)}&algorithm=SHA1&digits=${TWO_FACTOR_DIGITS}&period=${TWO_FACTOR_PERIOD_SECONDS}`;
}
