import test from 'node:test';
import assert from 'node:assert/strict';

const { sanitizeSupportedLocale, isRtlLocale } = await import('../lib/i18n/locales.ts');
const { getOcrLanguagePack } = await import('../lib/pdf/extract.ts');

test('sanitizes supported locales and keeps rtl detection correct', () => {
  assert.equal(sanitizeSupportedLocale('ar'), 'ar');
  assert.equal(sanitizeSupportedLocale('fr'), 'fr');
  assert.equal(sanitizeSupportedLocale('jp'), 'en');
  assert.equal(isRtlLocale('ar'), true);
  assert.equal(isRtlLocale('fr'), false);
});

test('maps frontend locales to OCR language packs', () => {
  assert.equal(getOcrLanguagePack('en'), 'eng');
  assert.equal(getOcrLanguagePack('ar'), 'ara+eng');
  assert.equal(getOcrLanguagePack('zh'), 'chi_sim+eng');
  assert.equal(getOcrLanguagePack('unknown'), 'eng');
});
