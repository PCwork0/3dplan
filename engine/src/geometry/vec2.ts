/**
 * vec2.ts — Immutable 2D vector utilities for the XZ plane.
 *
 * All functions are pure (no mutation) and dependency-free.
 * Coordinates use {x, z} to match Three.js world convention
 * (X = east, Z = south, Y = up).
 */

import type { Vec2 } from '../types.ts';

export const EPSILON = 1e-9;

// ─── Construction ─────────────────────────────────────────────────────────────

export const v2 = (x: number, z: number): Vec2 => ({ x, z });

export const fromArray = ([x, z]: [number, number]): Vec2 => ({ x, z });

export const toArray = (v: Vec2): [number, number] => [v.x, v.z];

export const clone = (v: Vec2): Vec2 => ({ x: v.x, z: v.z });

// ─── Arithmetic ───────────────────────────────────────────────────────────────

export const add = (a: Vec2, b: Vec2): Vec2 =>
  ({ x: a.x + b.x, z: a.z + b.z });

export const sub = (a: Vec2, b: Vec2): Vec2 =>
  ({ x: a.x - b.x, z: a.z - b.z });

export const scale = (a: Vec2, s: number): Vec2 =>
  ({ x: a.x * s, z: a.z * s });

export const negate = (a: Vec2): Vec2 =>
  ({ x: -a.x, z: -a.z });

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 =>
  add(a, scale(sub(b, a), t));

// ─── Scalar products ──────────────────────────────────────────────────────────

/** Dot product. */
export const dot = (a: Vec2, b: Vec2): number =>
  a.x * b.x + a.z * b.z;

/**
 * 2D "cross product" (scalar).
 * a × b = ax·bz − az·bx
 * Positive → b is CCW from a; negative → b is CW from a.
 */
export const cross = (a: Vec2, b: Vec2): number =>
  a.x * b.z - a.z * b.x;

// ─── Length / distance ────────────────────────────────────────────────────────

export const lengthSq = (a: Vec2): number => a.x * a.x + a.z * a.z;

export const length = (a: Vec2): number => Math.sqrt(lengthSq(a));

export const distanceTo = (a: Vec2, b: Vec2): number => length(sub(b, a));

export const distanceSqTo = (a: Vec2, b: Vec2): number => lengthSq(sub(b, a));

// ─── Normalisation ────────────────────────────────────────────────────────────

/**
 * Returns a unit vector, or {x:0, z:0} if the input is near-zero.
 */
export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  if (len < EPSILON) return { x: 0, z: 0 };
  return { x: a.x / len, z: a.z / len };
};

// ─── Perpendiculars ───────────────────────────────────────────────────────────

/**
 * Rotate 90° clockwise in the XZ plane.
 * If `a` points east (+X), perpCW points south (+Z).
 *
 *   perpCW({x:1, z:0}) → {x:0, z:1}
 */
export const perpCW = (a: Vec2): Vec2 => ({ x: -a.z, z: a.x });

/**
 * Rotate 90° counter-clockwise in the XZ plane (looking down from +Y).
 * If `a` points east (+X), perpCCW points north (−Z).
 *
 *   perpCCW({x:1, z:0}) → {x:0, z:-1}
 */
export const perpCCW = (a: Vec2): Vec2 => ({ x: a.z, z: -a.x });

// ─── Comparison ───────────────────────────────────────────────────────────────

export const equal = (a: Vec2, b: Vec2, eps = EPSILON): boolean =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps;

// ─── Angle utilities ──────────────────────────────────────────────────────────

/**
 * Signed angle (radians) from vector `a` to vector `b`, measured CCW.
 * Range: (−π, π].
 */
export const signedAngle = (a: Vec2, b: Vec2): number =>
  Math.atan2(cross(a, b), dot(a, b));

/**
 * Angle of a vector relative to +X axis, in radians.
 * Range: [0, 2π).
 */
export const angle = (a: Vec2): number => {
  const raw = Math.atan2(a.z, a.x);
  return raw < 0 ? raw + 2 * Math.PI : raw;
};

// ─── Midpoint / projection ────────────────────────────────────────────────────

export const midpoint = (a: Vec2, b: Vec2): Vec2 =>
  scale(add(a, b), 0.5);

/**
 * Project point `p` onto the infinite line defined by `origin` + t·`dir`.
 * Returns the t parameter.
 */
export const projectOntoLine = (
  p: Vec2,
  origin: Vec2,
  dir: Vec2,
): number => dot(sub(p, origin), dir) / dot(dir, dir);

/**
 * Closest point on the infinite line origin + t·dir to point p.
 */
export const closestPointOnLine = (
  p: Vec2,
  origin: Vec2,
  dir: Vec2,
): Vec2 => add(origin, scale(dir, projectOntoLine(p, origin, dir)));
