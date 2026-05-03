/**
 * tourRecorder.ts — Record manual camera movements and convert to Theatre keyframes
 *
 * Captures camera position, lookAt target, and FOV at regular intervals
 * during manual exploration, then converts to a playable tour sequence.
 */

import * as THREE from 'three';

export interface RecordedFrame {
  t: number;  // time in seconds
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

export class TourRecorder {
  private isRecording = false;
  private startTime = 0;
  private frames: RecordedFrame[] = [];
  private lastFrameTime = 0;
  private captureInterval = 0.5; // Capture every 0.5 seconds

  // ── Playback state (driven outside React, applied inside Canvas) ─────────
  private playbackActive = false;
  private playbackTime   = 0;

  /** Start recording camera movements */
  start(): void {
    this.isRecording = true;
    this.startTime = Date.now() / 1000;
    this.frames = [];
    this.lastFrameTime = 0;
    console.log('🎥 Tour recording started');
  }

  /** Stop recording */
  stop(): RecordedFrame[] {
    this.isRecording = false;
    console.log(`🎥 Tour recording stopped. Captured ${this.frames.length} frames over ${this.frames[this.frames.length - 1]?.t ?? 0}s`);
    return this.frames;
  }

  /** Record a camera frame */
  captureFrame(camera: THREE.PerspectiveCamera): void {
    if (!this.isRecording) return;

    const elapsed = Date.now() / 1000 - this.startTime;

    // Only capture at the specified interval
    if (elapsed - this.lastFrameTime < this.captureInterval) return;

    this.lastFrameTime = elapsed;

    const pos = camera.position.toArray() as [number, number, number];
    const lookDir = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(10);
    const look = camera.position
      .clone()
      .add(lookDir)
      .toArray() as [number, number, number];

    this.frames.push({
      t: elapsed,
      pos,
      look,
      fov: camera.fov,
    });
  }

  /** Get current recording state */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /** Get current frame count */
  getFrameCount(): number {
    return this.frames.length;
  }

  /** Get duration of recording */
  getDuration(): number {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1].t : 0;
  }

  /** Export frames as TypeScript code for keyframes.ts */
  exportAsTypeScript(): string {
    if (this.frames.length === 0) {
      return '// No frames recorded';
    }

    const lines = [
      '// Auto-generated tour keyframes from recording',
      'export const RECORDED_TOUR_KEYFRAMES = [',
    ];

    for (const frame of this.frames) {
      const [px, py, pz] = frame.pos;
      const [lx, ly, lz] = frame.look;
      lines.push(
        `  { t: ${frame.t.toFixed(1)}, pos: [${px.toFixed(2)}, ${py.toFixed(2)}, ${pz.toFixed(2)}], look: [${lx.toFixed(2)}, ${ly.toFixed(2)}, ${lz.toFixed(2)}], fov: ${frame.fov.toFixed(0)} },`
      );
    }

    lines.push('];');
    return lines.join('\n');
  }

  /** Export as JSON for easy sharing */
  exportAsJSON(): string {
    return JSON.stringify(this.frames, null, 2);
  }

  /** Import frames from JSON */
  importFromJSON(jsonString: string): boolean {
    try {
      const frames = JSON.parse(jsonString) as RecordedFrame[];
      if (!Array.isArray(frames) || frames.length === 0) {
        console.error('Invalid frames array');
        return false;
      }
      this.frames = frames;
      this.isRecording = false;
      console.log(`🎥 Imported ${frames.length} frames`);
      return true;
    } catch (err) {
      console.error('Failed to import frames:', err);
      return false;
    }
  }

  /** Get all recorded frames */
  getFrames(): RecordedFrame[] {
    return [...this.frames];
  }

  /** Clear recording */
  clear(): void {
    this.frames = [];
    this.isRecording = false;
    this.playbackActive = false;
    this.playbackTime = 0;
  }

  // ── Playback API ──────────────────────────────────────────────────────────

  startPlayback(): void {
    if (this.frames.length === 0) return;
    this.playbackActive = true;
    this.playbackTime   = 0;
  }

  stopPlayback(): void {
    this.playbackActive = false;
    this.playbackTime   = 0;
  }

  isPlayingBack(): boolean {
    return this.playbackActive;
  }

  getPlaybackTime(): number {
    return this.playbackTime;
  }

  setPlaybackTime(t: number): void {
    this.playbackTime = Math.max(0, Math.min(this.getDuration(), t));
  }

  /**
   * Advance playback by `dt` seconds and apply the interpolated frame to
   * the supplied camera. Called from a `useFrame` inside the R3F Canvas.
   * Returns false when playback finishes naturally so the caller can update UI.
   */
  applyToCamera(camera: THREE.PerspectiveCamera, dt: number): boolean {
    if (!this.playbackActive || this.frames.length === 0) return false;

    const total = this.frames[this.frames.length - 1].t;
    this.playbackTime += dt;

    if (this.playbackTime >= total) {
      this.playbackActive = false;
      this.playbackTime   = 0;
      return false;
    }

    const t    = this.playbackTime;
    const next = this.frames.find((f) => f.t >= t) ?? this.frames[this.frames.length - 1];
    const prev = [...this.frames].reverse().find((f) => f.t <= t) ?? this.frames[0];
    const span = next.t - prev.t;
    const a    = span <= 0 ? 0 : (t - prev.t) / span;

    camera.position.lerpVectors(
      new THREE.Vector3(...prev.pos),
      new THREE.Vector3(...next.pos),
      a,
    );
    const lookTarget = new THREE.Vector3(...prev.look).lerp(
      new THREE.Vector3(...next.look),
      a,
    );
    camera.lookAt(lookTarget);
    camera.fov = prev.fov + (next.fov - prev.fov) * a;
    camera.updateProjectionMatrix();
    return true;
  }
}

// Singleton recorder instance
export const tourRecorder = new TourRecorder();
