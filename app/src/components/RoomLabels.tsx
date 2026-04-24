/**
 * RoomLabels.tsx — Room name overlays using @react-three/drei <Html>.
 *
 * Each label is positioned at the room centroid, halfway up the wall height.
 * The Html component keeps the DOM element in world-space so it tracks the
 * camera properly.  `occlude` makes labels hide behind geometry (walls, etc.).
 */

import { Html } from '@react-three/drei';
import type { FloorMesh3D } from '@engine/types.ts';

interface Props {
  floors:      FloorMesh3D[];
  wallHeight:  number;
  visible:     boolean;
}

export default function RoomLabels({ floors, wallHeight, visible }: Props) {
  if (!visible) return null;

  return (
    <>
      {floors.map((floor) => {
        const [cx, cz] = floor.centroid;
        const y = wallHeight * 0.42; // slightly below mid-height for readability

        return (
          <Html
            key={floor.id}
            position={[cx, y, cz]}
            center
            occlude
            distanceFactor={12}
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              background:     'rgba(8, 8, 18, 0.62)',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              borderRadius:   6,
              padding:        '4px 10px',
              fontSize:       11,
              fontWeight:     600,
              color:          '#e4e2f4',
              letterSpacing:  '0.04em',
              textTransform:  'uppercase',
              textShadow:     '0 1px 4px rgba(0,0,0,0.8)',
              border:         '1px solid rgba(255,255,255,0.08)',
              whiteSpace:     'nowrap',
              userSelect:     'none',
            }}>
              {floor.name}
            </div>
          </Html>
        );
      })}
    </>
  );
}
