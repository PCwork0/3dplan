/**
 * WallMeasurements.tsx — Wall length dimension lines and labels.
 *
 * For each WallMeasurement, renders:
 *   1. A <Line> segment along the wall at y=midY, offset 0.18 m outward.
 *   2. A <Html> label showing the length in metres.
 *
 * The offset direction is the wall's perpendicular unit vector (labelDX/DZ)
 * so labels sit outside the wall face, not inside rooms.
 */

import { Html, Line } from '@react-three/drei';
import type { WallMeasurement } from '@engine/types.ts';

interface Props {
  measurements: WallMeasurement[];
  visible:      boolean;
}

// How far to offset from wall centreline (metres)
const OFFSET = 0.22;

export default function WallMeasurements({ measurements, visible }: Props) {
  if (!visible) return null;

  return (
    <>
      {measurements.map((m) => {
        // Offset the midpoint perpendicular to the wall
        const ox = m.labelDX * OFFSET;
        const oz = m.labelDZ * OFFSET;

        // We need the two endpoints of the wall to draw the line.
        // Reconstruct from midpoint ± half-length along wall direction.
        // Wall direction: perpendicular of labelD rotated -90° → (labelDZ, -labelDX)
        const wallDX = m.labelDZ;   // cos(θ)
        const wallDZ = -m.labelDX;  // sin(θ)
        const hl = m.length / 2;

        const p0: [number, number, number] = [
          m.midX + ox - wallDX * hl,
          m.midY,
          m.midZ + oz - wallDZ * hl,
        ];
        const p1: [number, number, number] = [
          m.midX + ox + wallDX * hl,
          m.midY,
          m.midZ + oz + wallDZ * hl,
        ];

        return (
          <group key={m.wallId}>
            {/* Dimension line */}
            <Line
              points={[p0, p1]}
              color="#a0a0ff"
              lineWidth={1.2}
              transparent
              opacity={0.7}
            />

            {/* Length label */}
            <Html
              position={[
                m.midX + ox,
                m.midY,
                m.midZ + oz,
              ]}
              center
              distanceFactor={14}
              style={{ pointerEvents: 'none' }}
            >
              <div style={{
                background:     'rgba(8, 8, 20, 0.70)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                borderRadius:   5,
                padding:        '2px 7px',
                fontSize:       10,
                fontWeight:     700,
                color:          '#b0b0ff',
                letterSpacing:  '0.03em',
                border:         '1px solid rgba(100,100,255,0.25)',
                whiteSpace:     'nowrap',
                userSelect:     'none',
                fontFamily:     "'JetBrains Mono', 'Fira Code', monospace",
              }}>
                {m.length.toFixed(2)} m
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
