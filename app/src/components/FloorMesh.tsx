import { useMemo } from 'react';
import * as THREE from 'three';
import type { FloorMesh3D } from '@engine/types.ts';

interface Props {
  floor:     FloorMesh3D;
  visible:   boolean;
  wireframe: boolean;
}

export default function FloorMesh({ floor, visible, wireframe }: Props) {
  const geo = useMemo(() => {
    // Build a THREE.Shape from the CCW polygon (XZ coords)
    const shape = new THREE.Shape();
    floor.polygon.forEach(([x, z], i) => {
      if (i === 0) shape.moveTo(x, z);
      else         shape.lineTo(x, z);
    });

    // ShapeGeometry lives in the XY plane; rotate -90° around X to lay flat on XZ
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [floor]);

  return (
    <mesh
      geometry={geo}
      position={[0, floor.elevation, 0]}
      visible={visible}
      receiveShadow
    >
      <meshStandardMaterial
        color="#c8bea8"
        roughness={0.9}
        metalness={0.0}
        wireframe={wireframe}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
