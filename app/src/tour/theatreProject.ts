/**
 * theatreProject.ts — Theatre.js project + sheet with Studio support for tour authoring.
 *
 * Users can now:
 * 1. Use Theatre Studio to visually create/edit the tour
 * 2. Export the project state as JSON
 * 3. Load pre-saved tour states from JSON
 *
 * The Camera object tracks progress [0-1] which drives the actual animation.
 */

import { getProject, types } from '@theatre/core';
import { TOUR_DURATION } from './keyframes';

// Project + sheet are global singletons. Re-importing this module always
// returns the same instances, which keeps sequence state stable across
// React re-renders / Strict Mode double-mounts.
export const tourProject = getProject('3D-Plan House Tour');
export const tourSheet = tourProject.sheet('Tour');

// Camera object with progress property [0, 1] that drives the tour animation.
// This can be keyframed in Theatre Studio for visual authoring.
export const tourCameraObj = tourSheet.object('Camera', {
  progress: types.number(0, { range: [0, 1], label: 'Progress' }),
});

// Set the sequence duration to match the tour duration (42 seconds)
// This prevents Theatre warnings about range being longer than duration
tourSheet.sequence.pointer.range = [0, TOUR_DURATION] as [number, number];

/** Total seconds the tour runs, exposed for UI progress bars. */
export const TOUR_LENGTH_SEC = TOUR_DURATION;

/**
 * Export the current tour project state as JSON.
 * Users can save this and reload it later.
 */
export function exportTourJSON(): string {
  const state = tourProject.getState();
  return JSON.stringify(state, null, 2);
}

/**
 * Import a previously exported tour state from JSON.
 */
export function importTourJSON(jsonString: string): boolean {
  try {
    const state = JSON.parse(jsonString);
    tourProject.setState(state);
    return true;
  } catch (err) {
    console.error('Failed to import tour state:', err);
    return false;
  }
}
