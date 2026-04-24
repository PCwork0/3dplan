/**
 * RoomLabels.tsx — Room name overlays with two visibility modes.
 *
 * Flag ON  (visible=true)  : labels are always shown, regardless of camera distance.
 * Flag OFF (visible=false) : labels appear only when the camera comes within
 *                            PROXIMITY_M metres of the room centroid — useful for
 *                            peeking through a doorway and seeing the room name.
 *
 * Visibility is driven by a per-frame useFrame loop that writes directly to a
 * DOM ref (no React state → zero re-renders).  A CSS transition provides the
 * smooth fade-in / fade-out.
 */

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { FloorMesh3D } from '@engine/types.ts';

// Distance from camera to room centroid (world space) at which the label appears
// when the labels flag is OFF.
const PROXIMITY_M = 5.0;

// ─── Single label ─────────────────────────────────────────────────────────────

interface LabelProps {
  floor:        FloorMesh3D;
  wallHeight:   number;
  labelsOn:     boolean;
  /** X offset applied to the parent <group> so we can convert centroid → world. */
  offsetX:      number;
  /** Z offset applied to the parent <group>. */
  offsetZ:      number;
}

function RoomLabel({ floor, wallHeight, labelsOn, offsetX, offsetZ }: LabelProps) {
  const { camera } = useThree();
  const divRef = useRef<HTMLDivElement>(null);

  useFrame(() => {
    const el = divRef.current;
    if (!el) return;

    let show: boolean;
    if (labelsOn) {
      show = true;
    } else {
      // Centroid is in local group space; add the group offset to get world space.
      const worldX = floor.centroid[0] + offsetX;
      const worldZ = floor.centroid[1] + offsetZ;
      const dx = camera.position.x - worldX;
      const dz = camera.position.z - worldZ;
      show = Math.sqrt(dx * dx + dz * dz) < PROXIMITY_M;
    }

    el.style.opacity = show ? '1' : '0';
  });

  const [cx, cz] = floor.centroid;
  const y = wallHeight * 0.42;

  return (
    <Html
      position={[cx, y, cz]}
      center
      // No occlude — always renders on top so labels are readable through doorways.
      zIndexRange={[100, 0]}
      distanceFactor={12}
      style={{ pointerEvents: 'none' }}
    >
      <div
        ref={divRef}
        style={{
          opacity:             0,                            // starts hidden; useFrame drives it
          transition:          'opacity 0.25s ease',
          background:          'rgba(8, 8, 18, 0.72)',
          backdropFilter:      'blur(6px)',
          WebkitBackdropFilter:'blur(6px)',
          borderRadius:        6,
          padding:             '4px 10px',
          fontSize:            11,
          fontWeight:          600,
          color:               '#e4e2f4',
          letterSpacing:       '0.04em',
          textTransform:       'uppercase',
          textShadow:          '0 1px 4px rgba(0,0,0,0.8)',
          border:              '1px solid rgba(255,255,255,0.10)',
          whiteSpace:          'nowrap',
          userSelect:          'none',
        }}
      >
        {floor.name}
      </div>
    </Html>
  );
}

// ─── Parent ───────────────────────────────────────────────────────────────────

interface Props {
  floors:     FloorMesh3D[];
  wallHeight: number;
  visible:    boolean;
  offsetX:    number;
  offsetZ:    number;
}

export default function RoomLabels({ floors, wallHeight, visible, offsetX, offsetZ }: Props) {
  // Always mounted — proximity detection must run even when the flag is off.
  return (
    <>
      {floors.map((floor) => (
        <RoomLabel
          key={floor.id}
          floor={floor}
          wallHeight={wallHeight}
          labelsOn={visible}
          offsetX={offsetX}
          offsetZ={offsetZ}
        />
      ))}
    </>
  );
}
