/**
 * vite-plan-extractor.mjs — Vite dev-server plugin for /api/extract-plan
 *
 * Adds a single POST endpoint that accepts a multipart image upload,
 * calls Claude Vision, and returns JSON.
 *
 * Used only during development (the Vite plugin is a no-op in production builds).
 * Import into vite.config.ts as an optional plugin — zero runtime footprint.
 */

import { SYSTEM_PROMPT, USER_PROMPT } from './prompt.mjs';

// ─── Multipart parser (no dependencies — pure Node) ──────────────────────────

async function parseMultipartImage(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] ?? '';
      const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
      if (!boundaryMatch) return reject(new Error('No boundary in multipart'));

      const boundary = '--' + boundaryMatch[1];
      const parts    = buf.toString('binary').split(boundary);
      for (const part of parts) {
        if (!part.includes('filename=')) continue;
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headers  = part.slice(0, headerEnd);
        const bodyBin  = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'));
        const mtMatch  = headers.match(/Content-Type:\s*([^\r\n]+)/i);
        const mediaType = mtMatch ? mtMatch[1].trim() : 'image/jpeg';
        const data = Buffer.from(bodyBin, 'binary').toString('base64');
        return resolve({ data, mediaType });
      }
      reject(new Error('No image part found in multipart body'));
    });
    req.on('error', reject);
  });
}

// ─── Claude call (same logic as CLI) ─────────────────────────────────────────

async function callClaude(apiKey, model, imageData, mediaType, extraContext = '') {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageData } },
          { type: 'text',  text: USER_PROMPT + (extraContext ? '\n\n' + extraContext : '') },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.content?.[0]?.text ?? '';
}

function extractJSON(text) {
  const s = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end   = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON in response');
  return JSON.parse(s.slice(start, end + 1));
}

function validateSchema(json) {
  const errors = [];
  const { nodes = [], walls = [], rooms = [], openings = [] } = json;
  const nodeIds = new Set(nodes.map(n => n.id));
  const wallIds = new Set(walls.map(w => w.id));
  if (!nodes.length) errors.push('nodes is empty');
  if (!walls.length) errors.push('walls is empty');
  if (!rooms.length) errors.push('rooms is empty');
  for (const w of walls) {
    if (!nodeIds.has(w.startNode)) errors.push(`wall ${w.id}: unknown startNode`);
    if (!nodeIds.has(w.endNode))   errors.push(`wall ${w.id}: unknown endNode`);
  }
  for (const r of rooms) {
    if (!Array.isArray(r.nodeIds) || r.nodeIds.length < 3) errors.push(`room ${r.id}: needs ≥3 nodeIds`);
    for (const nid of (r.nodeIds ?? [])) if (!nodeIds.has(nid)) errors.push(`room ${r.id}: unknown node ${nid}`);
  }
  for (const o of openings) {
    if (!wallIds.has(o.wallId)) errors.push(`opening ${o.id}: unknown wallId`);
    if (o.t < 0 || o.t > 1)    errors.push(`opening ${o.id}: t out of range`);
  }
  return errors;
}

// ─── Vite plugin ─────────────────────────────────────────────────────────────

export function planExtractorPlugin() {
  return {
    name: 'plan-extractor',

    configureServer(server) {
      server.middlewares.use('/api/extract-plan', async (req, res) => {
        // CORS for dev
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'POST')    { res.statusCode = 405; res.end('Method Not Allowed'); return; }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        const model  = process.env.VITE_CLAUDE_MODEL ?? 'claude-opus-4-5';

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in server environment' }));
          return;
        }

        try {
          const { data: imageData, mediaType } = await parseMultipartImage(req);

          let parsed, errors, attempt = 0;
          const RETRIES = 2;

          while (attempt <= RETRIES) {
            attempt++;
            const extra = errors?.length
              ? 'Fix these validation errors:\n' + errors.map(e => '• ' + e).join('\n')
              : '';

            const raw = await callClaude(apiKey, model, imageData, mediaType, extra);

            try { parsed = extractJSON(raw); }
            catch { errors = ['JSON parse failed']; continue; }

            parsed.version  = parsed.version  ?? '1.0';
            parsed.units    = parsed.units    ?? 'meters';
            parsed.openings = parsed.openings ?? [];

            errors = validateSchema(parsed);
            if (!errors.length) break;
          }

          if (errors?.length) {
            res.statusCode = 422;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Validation failed after retries', details: errors }));
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, plan: parsed }));

        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}
