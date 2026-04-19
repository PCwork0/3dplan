/**
 * schema.ts — Runtime validation of FloorPlanInput.
 *
 * Zero external dependencies — intentionally hand-written so the engine
 * remains a pure TypeScript module with no npm peer requirements.
 *
 * Returns typed ValidationError[] so callers can surface specific field
 * errors in a UI without parsing error message strings.
 */

import type { FloorPlanInput, ValidationError } from './types.ts';

// ─── Type guards ──────────────────────────────────────────────────────────────

const isString  = (v: unknown): v is string  => typeof v === 'string';
const isNumber  = (v: unknown): v is number  => typeof v === 'number' && isFinite(v);
const isArray   = (v: unknown): v is unknown[] => Array.isArray(v);
const isObject  = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function err(field: string, message: string): ValidationError {
  return { field, message };
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationError[],
): boolean {
  if (!isString(obj[key])) {
    errors.push(err(`${path}.${key}`, `"${key}" must be a string`));
    return false;
  }
  if ((obj[key] as string).trim() === '') {
    errors.push(err(`${path}.${key}`, `"${key}" must not be empty`));
    return false;
  }
  return true;
}

function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  errors: ValidationError[],
  min?: number,
  max?: number,
): boolean {
  if (!isNumber(obj[key])) {
    errors.push(err(`${path}.${key}`, `"${key}" must be a finite number`));
    return false;
  }
  const n = obj[key] as number;
  if (min !== undefined && n < min) {
    errors.push(err(`${path}.${key}`, `"${key}" must be ≥ ${min} (got ${n})`));
    return false;
  }
  if (max !== undefined && n > max) {
    errors.push(err(`${path}.${key}`, `"${key}" must be ≤ ${max} (got ${n})`));
    return false;
  }
  return true;
}

// ─── Section validators ───────────────────────────────────────────────────────

function validateNodes(
  raw: unknown,
  errors: ValidationError[],
): Set<string> {
  const ids = new Set<string>();

  if (!isArray(raw)) {
    errors.push(err('nodes', '"nodes" must be an array'));
    return ids;
  }
  if (raw.length === 0) {
    errors.push(err('nodes', '"nodes" must have at least one entry'));
    return ids;
  }

  for (let i = 0; i < raw.length; i++) {
    const path = `nodes[${i}]`;
    const node = raw[i];
    if (!isObject(node)) { errors.push(err(path, 'must be an object')); continue; }

    requireString(node, 'id', path, errors);
    requireNumber(node, 'x', path, errors);
    requireNumber(node, 'z', path, errors);

    const id = node['id'];
    if (isString(id)) {
      if (ids.has(id)) errors.push(err(`${path}.id`, `Duplicate node id "${id}"`));
      ids.add(id);
    }
  }

  return ids;
}

function validateWalls(
  raw: unknown,
  nodeIds: Set<string>,
  errors: ValidationError[],
): Set<string> {
  const ids = new Set<string>();

  if (!isArray(raw)) {
    errors.push(err('walls', '"walls" must be an array'));
    return ids;
  }
  if (raw.length === 0) {
    errors.push(err('walls', '"walls" must have at least one entry'));
    return ids;
  }

  for (let i = 0; i < raw.length; i++) {
    const path = `walls[${i}]`;
    const wall = raw[i];
    if (!isObject(wall)) { errors.push(err(path, 'must be an object')); continue; }

    requireString(wall, 'id', path, errors);
    requireString(wall, 'startNode', path, errors);
    requireString(wall, 'endNode', path, errors);

    const id = wall['id'];
    if (isString(id)) {
      if (ids.has(id)) errors.push(err(`${path}.id`, `Duplicate wall id "${id}"`));
      ids.add(id);
    }

    const sn = wall['startNode'];
    const en = wall['endNode'];
    if (isString(sn) && !nodeIds.has(sn))
      errors.push(err(`${path}.startNode`, `Unknown node id "${sn}"`));
    if (isString(en) && !nodeIds.has(en))
      errors.push(err(`${path}.endNode`, `Unknown node id "${en}"`));
    if (isString(sn) && isString(en) && sn === en)
      errors.push(err(`${path}`, `startNode and endNode must differ`));

    if ('thickness' in wall) requireNumber(wall, 'thickness', path, errors, 0.01, 2);
    if ('height'    in wall) requireNumber(wall, 'height',    path, errors, 0.1,  20);
  }

  return ids;
}

function validateRooms(
  raw: unknown,
  nodeIds: Set<string>,
  errors: ValidationError[],
): void {
  if (!isArray(raw)) {
    errors.push(err('rooms', '"rooms" must be an array'));
    return;
  }

  const ids = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const path = `rooms[${i}]`;
    const room = raw[i];
    if (!isObject(room)) { errors.push(err(path, 'must be an object')); continue; }

    requireString(room, 'id',   path, errors);
    requireString(room, 'name', path, errors);

    const id = room['id'];
    if (isString(id)) {
      if (ids.has(id)) errors.push(err(`${path}.id`, `Duplicate room id "${id}"`));
      ids.add(id);
    }

    const nodeIdsField = room['nodeIds'];
    if (!isArray(nodeIdsField)) {
      errors.push(err(`${path}.nodeIds`, '"nodeIds" must be an array'));
    } else {
      if (nodeIdsField.length < 3)
        errors.push(err(`${path}.nodeIds`, 'A room needs at least 3 nodes'));
      for (let j = 0; j < nodeIdsField.length; j++) {
        const nid = nodeIdsField[j];
        if (!isString(nid)) {
          errors.push(err(`${path}.nodeIds[${j}]`, 'must be a string'));
        } else if (!nodeIds.has(nid)) {
          errors.push(err(`${path}.nodeIds[${j}]`, `Unknown node id "${nid}"`));
        }
      }
    }

    if ('elevation' in room) requireNumber(room, 'elevation', path, errors, -100, 1000);
  }
}

function validateOpenings(
  raw: unknown,
  wallIds: Set<string>,
  errors: ValidationError[],
): void {
  if (raw === undefined || raw === null) return;
  if (!isArray(raw)) {
    errors.push(err('openings', '"openings" must be an array'));
    return;
  }

  const ids = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const path = `openings[${i}]`;
    const op = raw[i];
    if (!isObject(op)) { errors.push(err(path, 'must be an object')); continue; }

    requireString(op, 'id',     path, errors);
    requireString(op, 'wallId', path, errors);
    requireNumber(op, 't',      path, errors, 0, 1);
    requireNumber(op, 'width',  path, errors, 0.1, 10);

    const id = op['id'];
    if (isString(id)) {
      if (ids.has(id)) errors.push(err(`${path}.id`, `Duplicate opening id "${id}"`));
      ids.add(id);
    }

    const wid = op['wallId'];
    if (isString(wid) && !wallIds.has(wid))
      errors.push(err(`${path}.wallId`, `Unknown wall id "${wid}"`));

    const type = op['type'];
    if (type !== 'door' && type !== 'window')
      errors.push(err(`${path}.type`, `"type" must be "door" or "window" (got "${type}")`));

    if ('height'     in op) requireNumber(op, 'height',     path, errors, 0.1, 10);
    if ('sillHeight' in op) requireNumber(op, 'sillHeight', path, errors, 0,   5);
  }
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * Validate a raw (unknown) object as FloorPlanInput.
 *
 * Returns { ok: true, data } on success, or { ok: false, errors } on failure.
 * Never throws.
 */
export function validateInput(
  raw: unknown,
): { ok: true; data: FloorPlanInput } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: [err('root', 'Input must be a JSON object')] };
  }

  // version
  if (!isString(raw['version']))
    errors.push(err('version', '"version" must be a string'));

  // units
  if (raw['units'] !== 'meters')
    errors.push(err('units', '"units" must be "meters"'));

  // sections
  const nodeIds = validateNodes(raw['nodes'], errors);
  const wallIds = validateWalls(raw['walls'], nodeIds, errors);
  validateRooms(raw['rooms'], nodeIds, errors);
  validateOpenings(raw['openings'], wallIds, errors);

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, data: raw as unknown as FloorPlanInput };
}

/**
 * Parse a JSON string and validate it.  Catches JSON.parse errors.
 */
export function parseAndValidate(
  json: string,
): { ok: true; data: FloorPlanInput } | { ok: false; errors: ValidationError[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      errors: [{ field: 'root', message: `Invalid JSON: ${(e as Error).message}` }],
    };
  }
  return validateInput(raw);
}
