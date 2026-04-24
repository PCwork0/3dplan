#!/usr/bin/env node
/**
 * extract-plan.mjs — CLI: image → floor plan JSON
 *
 * Usage:
 *   node tools/extract-plan.mjs <image-path> [output.json]
 *   ANTHROPIC_API_KEY=sk-ant-... node tools/extract-plan.mjs floor.png
 *
 * Options:
 *   --model    Claude model to use (default: claude-opus-4-5)
 *   --retries  Max validation retry attempts (default: 2)
 *   --verbose  Print progress to stderr
 *
 * Examples:
 *   node tools/extract-plan.mjs floor.jpg                  # prints JSON to stdout
 *   node tools/extract-plan.mjs floor.jpg plan.json        # saves to file
 *   node tools/extract-plan.mjs floor.jpg --verbose        # shows progress
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { SYSTEM_PROMPT, USER_PROMPT } from './prompt.mjs';

// ─── Parse CLI args ───────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const flags    = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));

const imagePath  = positional[0];
const outputPath = positional[1];
const verbose    = flags.includes('--verbose');
const modelFlag  = flags.find(f => f.startsWith('--model='));
const retriesFlag = flags.find(f => f.startsWith('--retries='));

const MODEL    = modelFlag  ? modelFlag.split('=')[1]  : 'claude-opus-4-5';
const RETRIES  = retriesFlag ? parseInt(retriesFlag.split('=')[1]) : 2;
const API_KEY  = process.env.ANTHROPIC_API_KEY;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const log  = (...a) => verbose && process.stderr.write('[extract-plan] ' + a.join(' ') + '\n');
const err  = (...a) => process.stderr.write('[extract-plan] ERROR: ' + a.join(' ') + '\n');

function usage() {
  console.error(`
Usage: node tools/extract-plan.mjs <image-path> [output.json] [--verbose] [--model=<model>] [--retries=N]

Environment:
  ANTHROPIC_API_KEY    Required — your Anthropic API key

Examples:
  ANTHROPIC_API_KEY=sk-ant-... node tools/extract-plan.mjs floor.png
  ANTHROPIC_API_KEY=sk-ant-... node tools/extract-plan.mjs floor.jpg plan.json --verbose
`);
  process.exit(1);
}

// ─── Image loading ────────────────────────────────────────────────────────────

function loadImageAsBase64(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    err(`File not found: ${abs}`);
    process.exit(1);
  }

  const ext = extname(abs).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  const mediaType = mimeMap[ext];
  if (!mediaType) {
    err(`Unsupported image format: ${ext}. Use jpg, png, gif, or webp.`);
    process.exit(1);
  }

  const data = readFileSync(abs).toString('base64');
  return { data, mediaType };
}

// ─── Lightweight schema validation (no engine dependency) ─────────────────────

function validateSchema(json) {
  const errors = [];
  const { nodes, walls, rooms, openings } = json;

  // Required arrays
  if (!Array.isArray(nodes) || nodes.length === 0)
    errors.push('nodes must be a non-empty array');
  if (!Array.isArray(walls) || walls.length === 0)
    errors.push('walls must be a non-empty array');
  if (!Array.isArray(rooms) || rooms.length === 0)
    errors.push('rooms must be a non-empty array');
  if (errors.length) return errors;

  const nodeIds = new Set(nodes.map(n => n.id));
  const wallIds = new Set(walls.map(w => w.id));

  // Nodes
  for (const n of nodes) {
    if (!n.id) errors.push(`node missing id: ${JSON.stringify(n)}`);
    if (typeof n.x !== 'number') errors.push(`node ${n.id}: x must be number`);
    if (typeof n.z !== 'number') errors.push(`node ${n.id}: z must be number`);
  }

  // Walls
  for (const w of walls) {
    if (!nodeIds.has(w.startNode)) errors.push(`wall ${w.id}: unknown startNode "${w.startNode}"`);
    if (!nodeIds.has(w.endNode))   errors.push(`wall ${w.id}: unknown endNode "${w.endNode}"`);
    if (w.startNode === w.endNode) errors.push(`wall ${w.id}: startNode === endNode (self-loop)`);
  }

  // Rooms
  for (const r of rooms) {
    if (!r.name) errors.push(`room ${r.id}: missing name`);
    if (!Array.isArray(r.nodeIds) || r.nodeIds.length < 3)
      errors.push(`room ${r.id}: nodeIds must have ≥ 3 entries`);
    for (const nid of (r.nodeIds ?? [])) {
      if (!nodeIds.has(nid)) errors.push(`room ${r.id}: unknown nodeId "${nid}"`);
    }
  }

  // Openings (optional)
  for (const o of (openings ?? [])) {
    if (!wallIds.has(o.wallId)) errors.push(`opening ${o.id}: unknown wallId "${o.wallId}"`);
    if (typeof o.t !== 'number' || o.t < 0 || o.t > 1)
      errors.push(`opening ${o.id}: t must be 0–1, got ${o.t}`);
    if (!['door', 'window'].includes(o.type))
      errors.push(`opening ${o.id}: type must be "door" or "window"`);
  }

  return errors;
}

// ─── Claude API call ──────────────────────────────────────────────────────────

async function callClaude(imageData, mediaType, extraUserContext = '') {
  const body = {
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type:  'image',
            source: { type: 'base64', media_type: mediaType, data: imageData },
          },
          {
            type: 'text',
            text: USER_PROMPT + (extraUserContext ? '\n\n' + extraUserContext : ''),
          },
        ],
      },
    ],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ─── JSON extraction from Claude response ─────────────────────────────────────

function extractJSON(text) {
  // Strip markdown code fences if Claude ignored our instructions
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Find the outermost { ... }
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');

  return JSON.parse(stripped.slice(start, end + 1));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!imagePath) usage();
  if (!API_KEY)   { err('ANTHROPIC_API_KEY env var is not set'); process.exit(1); }

  log(`Loading image: ${imagePath}`);
  const { data: imageData, mediaType } = loadImageAsBase64(imagePath);
  log(`Image loaded (${Math.round(imageData.length * 0.75 / 1024)} KB), model: ${MODEL}`);

  let attempt    = 0;
  let lastErrors = [];
  let lastRaw    = '';

  while (attempt <= RETRIES) {
    attempt++;
    log(`Attempt ${attempt}/${RETRIES + 1} — calling Claude Vision API...`);

    // On retry: include the previous validation errors so Claude can self-correct
    const context = lastErrors.length > 0
      ? `The previous attempt produced these validation errors — please fix them:\n` +
        lastErrors.map(e => `  • ${e}`).join('\n')
      : '';

    try {
      lastRaw = await callClaude(imageData, mediaType, context);
      log(`Response received (${lastRaw.length} chars)`);
    } catch (e) {
      err(e.message);
      process.exit(1);
    }

    let parsed;
    try {
      parsed = extractJSON(lastRaw);
    } catch (e) {
      lastErrors = [`Failed to parse JSON: ${e.message}`];
      log(`JSON parse failed: ${e.message}`);
      continue;
    }

    // Ensure required top-level fields
    parsed.version = parsed.version ?? '1.0';
    parsed.units   = parsed.units   ?? 'meters';
    parsed.openings = parsed.openings ?? [];

    lastErrors = validateSchema(parsed);
    if (lastErrors.length === 0) {
      log(`Validation passed ✓ — ${parsed.nodes.length} nodes, ${parsed.walls.length} walls, ${parsed.rooms.length} rooms, ${parsed.openings.length} openings`);

      const output = JSON.stringify(parsed, null, 2);

      if (outputPath) {
        writeFileSync(outputPath, output, 'utf8');
        log(`Saved to ${outputPath}`);
      } else {
        process.stdout.write(output + '\n');
      }
      process.exit(0);
    }

    log(`Validation failed (${lastErrors.length} errors) — retrying...`);
    lastErrors.forEach(e => log(`  • ${e}`));
  }

  // All retries exhausted
  err(`Failed after ${attempt} attempt(s). Last errors:`);
  lastErrors.forEach(e => err(`  • ${e}`));
  err(`\nRaw Claude response:\n${lastRaw}`);
  process.exit(1);
}

main().catch(e => { err(e.message); process.exit(1); });
