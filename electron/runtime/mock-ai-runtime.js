#!/usr/bin/env node

const http = require('http');

function parseArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

const host = parseArg('--host', '127.0.0.1');
const port = Number(parseArg('--port', process.env.KIVORA_AI_PORT || 48612));
const model = parseArg('--model', process.env.KIVORA_AI_MODEL || 'unknown');

function summarize(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Add course material to generate study content.';
  const trimmed = clean.slice(0, 420);
  return `Local desktop runtime is active (mock mode).\n\nPreview source:\n${trimmed}${clean.length > 420 ? '...' : ''}`;
}

function buildContent(mode, text) {
  return {
    mode,
    displayText: summarize(text),
    questions: [],
    flashcards: [],
    sourceText: text,
    keyTopics: ['Study Material'],
    subjectArea: 'general',
    learningObjectives: ['Review source material', 'Generate practice content'],
  };
}

const server = http.createServer((req, res) => {
  const respond = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  if (req.method === 'GET' && req.url === '/health') {
    respond(200, { ok: true, mode: 'mock', model });
    return;
  }

  if (req.method === 'GET' && req.url === '/model') {
    respond(200, { ok: true, model });
    return;
  }

  if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        respond(413, { error: 'Payload too large' });
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        if (!parsed.mode || !parsed.text) {
          respond(400, { errorCode: 'INVALID_REQUEST', message: 'mode and text are required' });
          return;
        }

        respond(200, { ok: true, content: buildContent(parsed.mode, parsed.text) });
      } catch (error) {
        respond(400, { errorCode: 'INVALID_REQUEST', message: 'Invalid JSON payload', reason: String(error) });
      }
    });
    return;
  }

  respond(404, { error: 'Not found' });
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`mock desktop AI runtime listening on http://${host}:${port}`);
});
