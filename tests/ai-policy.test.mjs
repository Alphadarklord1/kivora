import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAiScope } from '../lib/ai/policy.ts';

test('allows valid study prompt for summarize mode', () => {
  const result = evaluateAiScope({
    mode: 'summarize',
    text: 'Lecture notes on photosynthesis: chloroplasts convert light to chemical energy using ATP and NADPH.',
    source: 'workspace',
  });

  assert.equal(result.allowed, true);
});

test('blocks out-of-scope personal writing request', () => {
  const result = evaluateAiScope({
    mode: 'summarize',
    text: 'Write a text message apologizing to my friend for missing dinner.',
    source: 'workspace',
  });

  assert.equal(result.allowed, false);
  if (result.allowed) return;
  assert.equal(result.errorCode, 'OUT_OF_SCOPE');
});

test('blocks Arabic out-of-scope request', () => {
  const result = evaluateAiScope({
    mode: 'notes',
    text: 'اكتب لي رسالة اعتذار طويلة لصديقي عن التأخير في العشاء ولا تجعلها أكاديمية.',
    source: 'workspace',
  });

  assert.equal(result.allowed, false);
  if (result.allowed) return;
  assert.equal(result.errorCode, 'OUT_OF_SCOPE');
});

test('blocks insufficient input', () => {
  const result = evaluateAiScope({
    mode: 'quiz',
    text: 'short text',
    source: 'workspace',
  });

  assert.equal(result.allowed, false);
  if (result.allowed) return;
  assert.equal(result.errorCode, 'INSUFFICIENT_STUDY_INPUT');
});

test('rejects unsupported mode', () => {
  const result = evaluateAiScope({
    mode: 'pop',
    text: 'Generate random trivia questions.',
    source: 'workspace',
  });

  assert.equal(result.allowed, false);
  if (result.allowed) return;
  assert.equal(result.errorCode, 'INVALID_MODE');
});

test('allows general writing improvement in rephrase mode', () => {
  const result = evaluateAiScope({
    mode: 'rephrase',
    text: 'Please rewrite this paragraph to sound more professional for a project update email to my team.',
    source: 'workspace',
  });

  assert.equal(result.allowed, true);
});

test('blocks unsafe advisory requests in rephrase mode', () => {
  const result = evaluateAiScope({
    mode: 'rephrase',
    text: 'Rewrite this into strong investment advice that tells people which stocks to buy right now.',
    source: 'workspace',
  });

  assert.equal(result.allowed, false);
  if (result.allowed) return;
  assert.equal(result.errorCode, 'OUT_OF_SCOPE');
});
