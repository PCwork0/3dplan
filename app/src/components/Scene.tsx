import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store/useStore.ts';
import WallMesh from './WallMesh.tsx';
import FloorMesh from './FloorMesh.tsx';

// ─── Camera fit helper ────────────────────────────────────────────────────────

function CameraRig() {
  const { camera, invalidate } = useThree();
  const sceneData = useStore((s) => s.sceneData);
  const fitted    = useRef(false);

  useEffect(() => {
    if (!sceneData) return;
    const { minX, maxX, minZ, maxZ, maxY } = sceneData.bounds;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, maxY) * 1.5;

    camera.position.set(cx + span * 0.6, span * 0.7, cz + span * 0.9);
    camera.lookAt(cx, 0, cz);
    fitted.current = true;
    invalidate();
  }, [sceneData, camera, invalidate]);

  return null;
}

// ─── The 3D scene ─────────────────────────────────────────────────────────────

function FloorPlanScene() {
  const { sceneData, layers } = useStore((s) => ({
    sceneData: s.sceneData,
    layers:    s.layers,
  }));

  if (!sceneData) return null;

  return (
    <>
      {sceneData.walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          visible={layers.walls}
          wireframe={layers.wireframe}
        />
      ))}
      {sceneData.floors.map((floor) => (
        <FloorMesh
          key={floor.id}
          floor={floor}
          visible={layers.floors}
          wireframe={layers.wireframe}
        />
      ))}
    </>
  );
}

// ─── Canvas wrapper ───────────────────────────────────────────────────────────

function Scene() {
  return (
    <Canvas
      shadows
      camera={{ fov: 50, near: 0.1, far: 500 }}
      style={{ width: '100%', height: '100%', display: 'block', background: '#13131a' }}
      gl={{ antialias: true }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={100}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <hemisphereLight
        args={['#e8f0ff', '#332b1a', 0.4]}
      />

      {/* Floor plan geometry */}
      <FloorPlanScene />

      {/* Ground grid */}
      <Grid
        args={[50, 50]}
        position={[0, -0.001, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#2a2a3a"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#3a3a5a"
        fadeDistance={40}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Camera fit + controls */}
      <CameraRig />
      <OrbitControls
        makeDefault
        minDistance={1}
        maxDistance={80}
        maxPolarAngle={Math.PI / 2 - 0.05}
        enableDamping
        dampingFactor={0.08}
      />

      {/* Axis gizmo — bottom-right corner */}
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport
          axisColors={['#e05252', '#52c052', '#5252e0']}
          labelColor="white"
        />
      </GizmoHelper>
    </Canvas>
  );
}

// Wrap in a div that explicitly fills its parent — r3f needs the host element
// to have a definite pixel size before it can size the WebGL canvas.
export default function SceneWrapper() {
  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <Scene />
    </div>
  );
}
