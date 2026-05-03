/**
 * TheatreTour.tsx — Cinematic camera tour through the house.
 *
 * Playback is driven from the store's `tourTime` (advanced in useFrame),
 * NOT from `tourSheet.sequence.play()`. Reasons:
 *   • Theatre's default sequence length is 10s; our keyframes span 42s
 *     (TOUR_DURATION), so calling sequence.play({ range: [0, 42] }) fires
 *     "range[1] longer than sequence duration" warnings.
 *   • Without authored Studio keyframes, tourCameraObj.value.progress stays
 *     at 0, so the camera never moves.
 *
 * The Theatre project/sheet/object are kept so Studio can still attach for
 * future authoring, but they are not on the playback hot path.
 */

import { useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleTour, TOUR_DURATION } from '../tour/keyframes';
import { useStore } from '../store/useStore.ts';

const _state = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 75 };

export default function TheatreTour() {
  const { camera } = useThree();

  // Advance time and apply the sampled camera frame.
  useFrame((_, dt) => {
    const { tourPlaying, tourTime, setTourTime, setTourPlaying } = useStore.getState();

    let t = tourTime;
    if (tourPlaying) {
      t = Math.min(tourTime + dt, TOUR_DURATION);
      setTourTime(t);
      if (t >= TOUR_DURATION) setTourPlaying(false);
    }

    sampleTour(t, _state);

    camera.position.copy(_state.pos);
    camera.lookAt(_state.look);
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.isPerspectiveCamera && Math.abs(persp.fov - _state.fov) > 0.01) {
      persp.fov = _state.fov;
      persp.updateProjectionMatrix();
    }
  });

  // Reset to the start whenever tour mode is entered.
  useEffect(() => {
    useStore.getState().setTourTime(0);
  }, []);

  return null;
}

/** Imperative seek helper used by the HUD scrub bar. */
export function seekTour(seconds: number) {
  const t = Math.max(0, Math.min(TOUR_DURATION, seconds));
  useStore.getState().setTourTime(t);
}
