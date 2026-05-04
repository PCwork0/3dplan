/**
 * keyframes.ts — Cinematic camera tour through the 4BHK house.
 *
 * Coordinates are in the *centred* world frame (FloorPlanScene shifts the
 * house so its bounding-box centre sits at origin). Reference layout:
 *   X: −7 (west)  → +7 (east)
 *   Z: −4.5 (north) → +4.5 (south)
 *   Y:   0 (floor)  →  3 (ceiling)
 *   Eye height: 1.65 m
 *
 * Room centres (after centring):
 *   Master Bedroom (-5.25, -2)   Bedroom 2 (-1.75, -2)
 *   Bedroom 3      ( 1.75, -2)   Bedroom 4 ( 5.25, -2)
 *   Living/Dining  (-3.5,   3)   Puja      ( 1.75,  3)
 *   Kitchen        ( 5.25,  3)   Corridor  (    0,  1)
 *
 * Main entrance is on the south wall (z = +4.5) at x ≈ −5.25.
 *
 * Each keyframe defines:
 *   t        — time in seconds along the tour
 *   pos      — camera world position
 *   look     — point the camera looks at
 *   fov      — perspective FOV (deg) — wider feels immersive, tighter feels cinematic
 *   caption  — short narration shown in the HUD
 */

import * as THREE from 'three';

export interface TourKeyframe {
  t:       number;
  pos:     [number, number, number];
  look:    [number, number, number];
  fov:     number;
  caption: string;
}

export const TOUR_KEYFRAMES: TourKeyframe[] = [
  // ── Approach ────────────────────────────────────────────────────────────
  { t:  0, pos: [-5.25, 1.7,  9.0], look: [-5.25, 1.6,  4.5], fov: 60,
    caption: 'Welcome — approaching the front door' },

  { t:  3, pos: [-5.25, 1.65, 5.6], look: [-5.25, 1.6,  3.0], fov: 68,
    caption: 'Stepping up to the entrance' },

  // ── Living & Dining ─────────────────────────────────────────────────────
  { t:  6, pos: [-5.25, 1.65, 3.6], look: [-3.5,  1.55, 2.5], fov: 75,
    caption: 'Crossing the threshold into the Living Room' },

  { t:  9, pos: [-3.5,  1.65, 3.0], look: [-6.2,  1.55, 3.8], fov: 78,
    caption: 'Living & Dining — open and bright' },

  { t: 12, pos: [-3.5,  1.65, 3.0], look: [ 3.0,  1.55, 3.0], fov: 78,
    caption: 'Panning east toward the Kitchen' },

  // ── Kitchen ─────────────────────────────────────────────────────────────
  { t: 15, pos: [ 2.8,  1.65, 3.0], look: [ 5.25, 1.55, 3.0], fov: 75,
    caption: 'Heading into the Kitchen' },

  { t: 18, pos: [ 5.25, 1.65, 3.0], look: [ 5.25, 1.55, 1.6], fov: 75,
    caption: 'Inside the Kitchen' },

  // ── Corridor ────────────────────────────────────────────────────────────
  { t: 21, pos: [ 5.25, 1.65, 1.2], look: [-7.0,  1.55, 1.0], fov: 82,
    caption: 'Looking down the central corridor' },

  { t: 25, pos: [ 0.0,  1.65, 1.0], look: [-5.25, 1.55, 1.0], fov: 78,
    caption: 'Walking the corridor' },

  // ── Master bedroom ──────────────────────────────────────────────────────
  { t: 28, pos: [-5.25, 1.65, 1.0], look: [-5.25, 1.55, -2.0], fov: 75,
    caption: 'Entering the Master Bedroom' },

  { t: 31, pos: [-5.25, 1.65, -2.0], look: [-5.25, 1.55, -4.2], fov: 75,
    caption: 'Master Bedroom — north-facing windows' },

  { t: 34, pos: [-5.25, 1.65, -2.0], look: [-7.0,  1.55, -3.5], fov: 78,
    caption: 'Pan around the Master Bedroom' },

  // ── Hero exterior reveal ────────────────────────────────────────────────
  { t: 38, pos: [-3.0,  6.0,  10.0], look: [ 0.0,  0.8,  0.0], fov: 55,
    caption: 'Pulling back for the hero shot' },

  { t: 42, pos: [ 9.0,  7.5,  11.0], look: [-1.0,  0.5, -1.0], fov: 50,
    caption: 'House tour complete' },
];

/**
 * Static fallback duration (only used when no dynamic plan is installed).
 * Components that need the *current* duration should call getTourDuration().
 */
export const TOUR_DURATION = TOUR_KEYFRAMES[TOUR_KEYFRAMES.length - 1].t;

// ─── Active keyframe registry ─────────────────────────────────────────────────
//
// The "active" set is what sampleTour / activeCaption / getTourDuration read.
// It defaults to TOUR_KEYFRAMES (the static authored tour) and can be replaced
// at runtime by the planner via setActiveTour(). Components keep importing
// the same module — the function calls always reflect the latest active set.

let _activeKeyframes: TourKeyframe[] = TOUR_KEYFRAMES;

/**
 * Install a new keyframe set as the active tour. Pass [] (or anything with
 * fewer than 2 frames) to revert to the static authored tour.
 */
export function setActiveTour(kfs: TourKeyframe[]): void {
  _activeKeyframes = kfs && kfs.length >= 2 ? kfs : TOUR_KEYFRAMES;
}

/** The currently active tour. */
export function getActiveTour(): TourKeyframe[] {
  return _activeKeyframes;
}

/** Total seconds the active tour runs. */
export function getTourDuration(): number {
  return _activeKeyframes[_activeKeyframes.length - 1].t;
}

// ─── Smooth-step easing ─────────────────────────────────────────────────────
// Feels more cinematic than linear interpolation between waypoints.
function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

// Internal scratch vectors so we don't allocate per frame.
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _l0 = new THREE.Vector3();
const _l1 = new THREE.Vector3();
const _l2 = new THREE.Vector3();
const _l3 = new THREE.Vector3();
const _m1 = new THREE.Vector3();
const _m2 = new THREE.Vector3();
const _tmp1 = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

export interface CameraState {
  pos:  THREE.Vector3;
  look: THREE.Vector3;
  fov:  number;
}

const _outPos  = new THREE.Vector3();
const _outLook = new THREE.Vector3();

/**
 * Sample the tour timeline at time `t` (seconds). Returns interpolated
 * camera position, lookAt target, and FOV using smooth-step easing
 * between adjacent keyframes.
 */
/**
 * Centripetal Catmull-Rom (Hermite formulation, α=0.5) on a Vector3.
 * Centripetal parameterisation prevents the loops/overshoot that uniform
 * Catmull-Rom can produce when keyframes are unevenly spaced — critical for
 * a camera tour, since overshoot is what would push the camera through walls.
 *
 * Reference: Yuksel et al., "On the Parameterization of Catmull-Rom Curves" (2009).
 */
function catmullRomCRVec(
  p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
  u: number, out: THREE.Vector3,
): void {
  const eps = 1e-4;
  const t01 = Math.max(eps, Math.sqrt(p0.distanceTo(p1)));   // α=0.5 ⇒ √dist
  const t12 = Math.max(eps, Math.sqrt(p1.distanceTo(p2)));
  const t23 = Math.max(eps, Math.sqrt(p2.distanceTo(p3)));

  // m1 = ((p2 − p1)/t12 − (p2 − p0)/(t01+t12) + (p1 − p0)/t01) · t12
  _tmp1.subVectors(p2, p1).divideScalar(t12);
  _tmp2.subVectors(p2, p0).divideScalar(t01 + t12);
  _m1.copy(_tmp1).sub(_tmp2);
  _tmp1.subVectors(p1, p0).divideScalar(t01);
  _m1.add(_tmp1).multiplyScalar(t12);

  // m2 = ((p3 − p2)/t23 − (p3 − p1)/(t12+t23) + (p2 − p1)/t12) · t12
  _tmp1.subVectors(p3, p2).divideScalar(t23);
  _tmp2.subVectors(p3, p1).divideScalar(t12 + t23);
  _m2.copy(_tmp1).sub(_tmp2);
  _tmp1.subVectors(p2, p1).divideScalar(t12);
  _m2.add(_tmp1).multiplyScalar(t12);

  // Cubic Hermite: P(u) = h00·p1 + h10·m1 + h01·p2 + h11·m2
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 =  2 * u3 - 3 * u2 + 1;
  const h10 =      u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 =      u3 -     u2;

  out.set(
    h00 * p1.x + h10 * _m1.x + h01 * p2.x + h11 * _m2.x,
    h00 * p1.y + h10 * _m1.y + h01 * p2.y + h11 * _m2.y,
    h00 * p1.z + h10 * _m1.z + h01 * p2.z + h11 * _m2.z,
  );
}

/** Uniform Catmull-Rom for scalars (FOV) — overshoot is harmless here. */
function catmullRomScalar(
  p0: number, p1: number, p2: number, p3: number, u: number,
): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * u +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * u3
  );
}

/** Reflect-extrapolate one keyframe past another for boundary segments. */
function reflectKf(near: TourKeyframe, far: TourKeyframe): TourKeyframe {
  return {
    t:    0,
    pos:  [
      2 * near.pos[0]  - far.pos[0],
      2 * near.pos[1]  - far.pos[1],
      2 * near.pos[2]  - far.pos[2],
    ],
    look: [
      2 * near.look[0] - far.look[0],
      2 * near.look[1] - far.look[1],
      2 * near.look[2] - far.look[2],
    ],
    fov:  2 * near.fov - far.fov,
    caption: '',
  };
}

export function sampleTour(t: number, out?: CameraState): CameraState {
  const result = out ?? { pos: _outPos.clone(), look: _outLook.clone(), fov: 75 };
  const kfs    = _activeKeyframes;

  // Clamp before first / after last keyframe.
  if (t <= kfs[0].t) {
    const k = kfs[0];
    result.pos.set(...k.pos);
    result.look.set(...k.look);
    result.fov = k.fov;
    return result;
  }
  const last = kfs[kfs.length - 1];
  if (t >= last.t) {
    result.pos.set(...last.pos);
    result.look.set(...last.look);
    result.fov = last.fov;
    return result;
  }

  // Find the segment [i, i+1] that contains t.
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].t <= t) i++;
  const a   = kfs[i];
  const b   = kfs[i + 1];
  const dur = b.t - a.t;
  const u_raw = dur > 0 ? (t - a.t) / dur : 0;
  // Smoothstep within each segment ⇒ ease-in/ease-out at every keyframe.
  // Combined with the C¹ spline above, this gives an unbroken eagle-glide
  // feel: the camera never accelerates abruptly and never snaps direction.
  const u = smoothstep(u_raw);

  // Four control points: previous, a, b, next. Reflect at the boundaries.
  const km1 = kfs[i - 1] ?? reflectKf(a, b);
  const kp1 = kfs[i + 2] ?? reflectKf(b, a);

  _p0.set(...km1.pos); _p1.set(...a.pos); _p2.set(...b.pos); _p3.set(...kp1.pos);
  catmullRomCRVec(_p0, _p1, _p2, _p3, u, result.pos);

  _l0.set(...km1.look); _l1.set(...a.look); _l2.set(...b.look); _l3.set(...kp1.look);
  catmullRomCRVec(_l0, _l1, _l2, _l3, u, result.look);

  result.fov = catmullRomScalar(km1.fov, a.fov, b.fov, kp1.fov, u);

  return result;
}

/** Find the keyframe whose time is closest to `t` — used for caption display. */
export function activeCaption(t: number): string {
  const kfs = _activeKeyframes;
  let active = kfs[0];
  for (const k of kfs) {
    if (k.t <= t + 0.001) active = k;
  }
  return active.caption;
}
