/**
 * vite-plan-extractor-cv.mjs — Vite dev-server plugin for /api/extract-plan-cv
 *
 * Zero-AI, zero-API-key alternative to /api/extract-plan.
 * Receives a multipart image upload, saves to a temp file, spawns
 *   python3 tools/cv/extract_plan.py <tempfile>
 * and returns the JSON result.
 *
 * Deps: Python 3 + OpenCV + pytesseract (pre-installed in this environment).
 * No npm packages required beyond what Vite already provides.
 */

import { spawn }        from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname }    from 'node:path';
import { fileURLToPath }    from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT    = join(__dirname, 'cv', 'extract_plan.py');

// ─── Multipart parser (reused from the AI plugin — pure Node) ─────────────────

async function parseMultipartImage(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf         = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] ?? '';
      const boundaryM   = contentType.match(/boundary=([^\s;]+)/);
      if (!boundaryM) return reject(new Error('No multipart boundary'));

      const boundary = '--' + boundaryM[1];
      const parts    = buf.toString('binary').split(boundary);

      for (const part of parts) {
        if (!part.includes('filename=')) continue;
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        const headers   = part.slice(0, headerEnd);
        const bodyBin   = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'));
        const mtMatch   = headers.match(/Content-Type:\s*([^\r\n]+)/i);
        const mediaType = mtMatch ? mtMatch[1].trim() : 'image/jpeg';
        const ext       = mediaType.split('/')[1]?.split('+')[0] ?? 'jpg';
        const data      = Buffer.from(bodyBin, 'binary');
        return resolve({ data, mediaType, ext });
      }
      reject(new Error('No image part found'));
    });
    req.on('error', reject);
  });
}

// ─── Spawn python extractor ───────────────────────────────────────────────────

function runPythonExtractor(imagePath) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [SCRIPT, imagePath], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';
    py.stdout.on('data', d => { stdout += d.toString(); });
    py.stderr.on('data', d => { stderr += d.toString(); });

    py.on('close', code => {
      if (code !== 0) {
        reject(new Error(`extract_plan.py exited ${code}: ${stderr.trim()}`));
      } else {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(`JSON parse failed. stderr: ${stderr.trim()}`));
        }
      }
    });

    py.on('error', err => reject(new Error(`Failed to spawn python3: ${err.message}`)));
  });
}

// ─── Validation (mirrors the AI plugin) ──────────────────────────────────────

function validateSchema(json) {
  const errors  = [];
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
    if (!Array.isArray(r.nodeIds) || r.nodeIds.length < 3)
      errors.push(`room ${r.id}: needs ≥3 nodeIds`);
    for (const nid of (r.nodeIds ?? []))
      if (!nodeIds.has(nid)) errors.push(`room ${r.id}: unknown node ${nid}`);
  }
  for (const o of openings) {
    if (!wallIds.has(o.wallId)) errors.push(`opening ${o.id}: unknown wallId`);
    if (o.t < 0 || o.t > 1)    errors.push(`opening ${o.id}: t out of range`);
  }
  return errors;
}

// ─── Vite plugin ─────────────────────────────────────────────────────────────

export function planExtractorCvPlugin() {
  return {
    name: 'plan-extractor-cv',

    configureServer(server) {
      server.middlewares.use('/api/extract-plan-cv', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin',  '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
        if (req.method !== 'POST')    { res.statusCode = 405; res.end('Method Not Allowed'); return; }

        let tmpPath = null;
        try {
          const { data, ext } = await parseMultipartImage(req);

          // Write to temp file
          const tmpDir = mkdtempSync(join(tmpdir(), 'floorplan-'));
          tmpPath = join(tmpDir, `upload.${ext}`);
          writeFileSync(tmpPath, data);

          const plan   = await runPythonExtractor(tmpPath);
          const errors = validateSchema(plan);

          if (errors.length) {
            res.statusCode = 422;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'CV extraction produced invalid schema', details: errors }));
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, plan }));

        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message }));
        } finally {
          if (tmpPath) {
            try { unlinkSync(tmpPath); } catch {}
          }
        }
      });
    },
  };
}
