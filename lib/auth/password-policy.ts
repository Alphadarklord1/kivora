/**
 * Shared password complexity policy.
 *
 * Used at registration and at password change. Returns the first violation
 * message, or null if the password is acceptable.
 *
 * Rules tuned to be stricter than "8 characters" without becoming user-hostile:
 * minimum length, plus requires letters AND digits to defeat trivial dictionary
 * attempts. Symbols / mixed case are NOT required — research consistently shows
 * length matters far more than character-class diversity.
 */

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

/** A small set of obviously-bad passwords to reject outright. Not exhaustive —
 *  defense-in-depth comes from a HIBP breach check, which is on the roadmap. */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssword',
  'qwerty', 'qwerty123', 'abc123', 'letmein', 'welcome', 'welcome1',
  'monkey', 'dragon', 'iloveyou', 'admin', 'admin123', 'login',
  '12345678', '123456789', '1234567890', '1q2w3e4r', '0987654321',
  'kivora', 'kivora123', 'studypilot', 'studypilot123',
]);

export function validatePasswordPolicy(password: unknown): string | null {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `Password must be at most ${MAX_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.';
  if (/^\s|\s$/.test(password)) return 'Password cannot start or end with whitespace.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'That password is on the common-password block list. Please choose a different one.';
  }
  return null;
}
