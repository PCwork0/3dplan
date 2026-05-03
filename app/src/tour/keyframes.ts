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

export const TOUR_DURATION = TOUR_KEYFRAMES[TOUR_KEYFRAMES.length - 1].t;

// ─── Smooth-step easing ─────────────────────────────────────────────────────
// Feels more cinematic than linear interpolation between waypoints.
function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

// Internal scratch vectors so we don't allocate per frame.
const _aPos    = new THREE.Vector3();
const _bPos    = new THREE.Vector3();
const _aLook   = new THREE.Vector3();
const _bLook   = new THREE.Vector3();

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
export function sampleTour(t: number, out?: CameraState): CameraState {
  const result = out ?? { pos: _outPos.clone(), look: _outLook.clone(), fov: 75 };

  // Clamp before first / after last keyframe.
  if (t <= TOUR_KEYFRAMES[0].t) {
    const k = TOUR_KEYFRAMES[0];
    result.pos.set(...k.pos);
    result.look.set(...k.look);
    result.fov = k.fov;
    return result;
  }
  const last = TOUR_KEYFRAMES[TOUR_KEYFRAMES.length - 1];
  if (t >= last.t) {
    result.pos.set(...last.pos);
    result.look.set(...last.look);
    result.fov = last.fov;
    return result;
  }

  // Find the keyframe pair surrounding t.
  for (let i = 0; i < TOUR_KEYFRAMES.length - 1; i++) {
    const a = TOUR_KEYFRAMES[i];
    const b = TOUR_KEYFRAMES[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = smoothstep((t - a.t) / (b.t - a.t));
      _aPos .set(...a.pos);  _bPos .set(...b.pos);
      _aLook.set(...a.look); _bLook.set(...b.look);
      result.pos .copy(_aPos ).lerp(_bPos,  u);
      result.look.copy(_aLook).lerp(_bLook, u);
      result.fov = a.fov + (b.fov - a.fov) * u;
      return result;
    }
  }

  // Should be unreachable.
  return result;
}

/** Find the keyframe whose time is closest to `t` — used for caption display. */
export function activeCaption(t: number): string {
  let active = TOUR_KEYFRAMES[0];
  for (const k of TOUR_KEYFRAMES) {
    if (k.t <= t + 0.001) active = k;
  }
  return active.caption;
}
