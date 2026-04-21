import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { WallMesh3D } from '@engine/types.ts';

interface Props {
  wall:      WallMesh3D;
  visible:   boolean;
  wireframe: boolean;
}

export default function WallMesh({ wall, visible, wireframe }: Props) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wall.positions), 3));
    g.setAttribute('normal',   new THREE.BufferAttribute(new Float32Array(wall.normals),   3));
    g.setAttribute('uv',       new THREE.BufferAttribute(new Float32Array(wall.uvs),       2));
    return g;
  }, [wall]);

  return (
    <mesh geometry={geo} visible={visible} castShadow receiveShadow>
      <meshStandardMaterial
        color="#d6cfc4"
        roughness={0.85}
        metalness={0.0}
        wireframe={wireframe}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
