/**
 * Scene.tsx — Photorealistic interior rendering pipeline + first-person walk mode
 *
 * Camera modes:
 *  • Orbit (default) — drag to rotate, scroll to zoom, right-drag to pan
 *  • Walk  — Google Street View style: mouse look, WASD movement, ESC to pause
 *
 * Rendering stack:
 *  • Environment (HDR IBL, apartment preset)
 *  • PCFSoftShadowMap + SoftShadows (PCSS)
 *  • ContactShadows + BakeShadows
 *  • EffectComposer: SMAA → SSAO → Bloom → ACES Filmic → Vignette
 */

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  OrbitControls,
  PointerLockControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  Environment,
  ContactShadows,
  SoftShadows,
  BakeShadows,
} from '@react-three/drei';
import {
  EffectComposer,
  SSAO,
  Bloom,
  ToneMapping,
  Vignette,
  SMAA,
} from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction } from 'postprocessing';
import { useStore } from '../store/useStore.ts';
import { sunPosition, tempToHex } from '../utils/colorTemp.ts';
import WallMesh from './WallMesh.tsx';
import FloorMesh from './FloorMesh.tsx';
import CeilingMesh from './CeilingMesh.tsx';
import RoomLabels from './RoomLabels.tsx';
import WallMeasurements from './WallMeasurements.tsx';

const EYE_HEIGHT  = 1.65;  // metres — average eye height
const WALK_SPEED  = 1.4;   // m/s  — comfortable indoor walking pace
const WALK_FOV    = 75;    // degrees — wider in walk mode for immersion
const ORBIT_FOV   = 60;    // degrees — wider overview so the house fills the screen

// ─── Post-processing pipeline ─────────────────────────────────────────────────

function PostFX() {
  return (
    <EffectComposer multisampling={0} disableNormalPass={false}>
      <SMAA />
      <SSAO
        samples={32}
        radius={0.35}
        intensity={22}
        luminanceInfluence={0.4}
        bias={0.025}
        resolutionScale={0.75}
        depthAwareUpsampling
      />
      <Bloom
        luminanceThreshold={0.85}
        luminanceSmoothing={0.08}
        intensity={0.25}
        mipmapBlur
        blendFunction={BlendFunction.SCREEN}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.12} darkness={0.65} />
    </EffectComposer>
  );
}

// ─── Orbit camera auto-fit ────────────────────────────────────────────────────

function OrbitCameraRig() {
  const { camera, invalidate } = useThree();
  const sceneData  = useStore((s) => s.sceneData);
  const fitted     = useRef(false);

  useEffect(() => {
    if (!sceneData || fitted.current) return;
    const { minX, maxX, minZ, maxZ, maxY } = sceneData.bounds;
    const span = Math.max(maxX - minX, maxZ - minZ, maxY) * 1.1; // tighter fit
    // Geometry is centred at world origin by FloorPlanScene's group offset
    camera.position.set(span * 0.45, span * 0.50, span * 0.70);
    camera.lookAt(0, maxY * 0.25, 0);
    (camera as THREE.PerspectiveCamera).fov = ORBIT_FOV;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    fitted.current = true;
    invalidate();
  }, [sceneData, camera, invalidate]);

  useEffect(() => { fitted.current = false; }, [sceneData]);

  return null;
}

// ─── First-person walk controls ───────────────────────────────────────────────

interface WalkControlsProps {
  onLock:   () => void;
  onUnlock: () => void;
}

function WalkControls({ onLock, onUnlock }: WalkControlsProps) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const controlsRef = useRef<any>(null);

  // Position camera at eye height when entering walk mode
  useEffect(() => {
    (camera as THREE.PerspectiveCamera).fov = WALK_FOV;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    // Drop camera to eye height, keep XZ position
    camera.position.y = EYE_HEIGHT;
  }, [camera]);

  // WASD key tracking
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      // Prevent page scroll while walking
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const up   = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, []);

  // Movement loop — runs every frame while pointer is locked
  useFrame((_, dt) => {
    if (!controlsRef.current?.isLocked) return;

    const speed = WALK_SPEED * dt;
    const k     = keys.current;

    // Forward direction (horizontal only — no flying)
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    // Right = forward rotated 90° around Y
    const right = new THREE.Vector3(-dir.z, 0, dir.x);

    if (k['KeyW'] || k['ArrowUp'])    camera.position.addScaledVector(dir,  speed);
    if (k['KeyS'] || k['ArrowDown'])  camera.position.addScaledVector(dir, -speed);
    if (k['KeyA'] || k['ArrowLeft'])  camera.position.addScaledVector(right,-speed);
    if (k['KeyD'] || k['ArrowRight']) camera.position.addScaledVector(right, speed);

    // Lock Y to eye height — no crouching or flying
    camera.position.y = EYE_HEIGHT;
  });

  return (
    <PointerLockControls
      ref={controlsRef}
      onLock={onLock}
      onUnlock={onUnlock}
      pointerSpeed={0.9}
      maxPolarAngle={Math.PI * 0.85}
      minPolarAngle={Math.PI * 0.10}
    />
  );
}

// ─── Floor plan geometry ──────────────────────────────────────────────────────

function FloorPlanScene() {
  const { sceneData, layers } = useStore((s) => ({
    sceneData: s.sceneData,
    layers:    s.layers,
  }));

  if (!sceneData) return null;

  // Shift the entire house so its bounding-box centre sits at world origin (0, 0, 0).
  // Without this, plans with non-zero node coordinates render offset to one side.
  const { minX, maxX, minZ, maxZ } = sceneData.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  return (
    <group position={[-cx, 0, -cz]}>
      {sceneData.walls.map((wall) => (
        <WallMesh key={wall.id} wall={wall} visible={layers.walls} wireframe={layers.wireframe} />
      ))}
      {sceneData.floors.map((floor) => (
        <FloorMesh key={floor.id} floor={floor} visible={layers.floors} wireframe={layers.wireframe} />
      ))}
      {sceneData.ceilings.map((ceil) => (
        <CeilingMesh key={ceil.id} ceiling={ceil} visible={layers.ceilings} wireframe={layers.wireframe} />
      ))}
      <RoomLabels
        floors={sceneData.floors}
        wallHeight={sceneData.bounds.maxY}
        visible={layers.labels}
        offsetX={-cx}
        offsetZ={-cz}
      />
      <WallMeasurements measurements={sceneData.measurements} visible={layers.measurements} />
    </group>
  );
}

// ─── Inner canvas contents ────────────────────────────────────────────────────

interface SceneContentsProps {
  onLock:   () => void;
  onUnlock: () => void;
}

function SceneContents({ onLock, onUnlock }: SceneContentsProps) {
  const { cameraMode, lighting } = useStore((s) => ({
    cameraMode: s.cameraMode,
    lighting:   s.lighting,
  }));

  const { sun, sky, ambient } = lighting;
  const sunPos   = sunPosition(sun.elevation, sun.azimuth, 40);
  const sunColor = tempToHex(sun.temperature);

  return (
    <>
      <SoftShadows size={30} samples={20} focus={0.6} />

      <Suspense fallback={<ambientLight intensity={0.6} />}>
        <Environment preset="apartment" />
      </Suspense>

      {/* Key light — driven by store sun settings */}
      <directionalLight
        position={sunPos}
        intensity={sun.intensity}
        color={sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      {/* Fill light — opposite side, cool sky */}
      <directionalLight
        position={[-sunPos[0] * 0.6, sunPos[1] * 0.5, -sunPos[2] * 0.6]}
        intensity={sky.intensity}
        color="#c8dcff"
      />
      <ambientLight intensity={ambient.intensity} />

      <FloorPlanScene />

      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.55}
        scale={60}
        blur={2.2}
        far={14}
        frames={1}
        color="#201c10"
      />
      <BakeShadows />

      <Grid
        args={[80, 80]}
        position={[0, -0.002, 0]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#1e1e2e"
        sectionSize={5}
        sectionThickness={0.9}
        sectionColor="#2a2a46"
        fadeDistance={50}
        fadeStrength={1.2}
        infiniteGrid
      />

      {/* ── Camera controls — orbit OR walk, never both ── */}
      {cameraMode === 'orbit' ? (
        <>
          <OrbitCameraRig />
          <OrbitControls
            makeDefault
            minDistance={1}
            maxDistance={100}
            enableDamping
            dampingFactor={0.06}
            rotateSpeed={0.7}
            zoomSpeed={0.9}
          />
        </>
      ) : (
        <WalkControls onLock={onLock} onUnlock={onUnlock} />
      )}

      <PostFX />

      {cameraMode === 'orbit' && (
        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport axisColors={['#e05252', '#52c052', '#5252e0']} labelColor="white" />
        </GizmoHelper>
      )}
    </>
  );
}

// ─── Walk-mode HUD overlays (outside Canvas, in DOM) ─────────────────────────

function Crosshair() {
  return (
    <div style={{
      position:   'absolute',
      top:        '50%',
      left:       '50%',
      transform:  'translate(-50%, -50%)',
      width:      22,
      height:     22,
      pointerEvents: 'none',
    }}>
      {/* Horizontal bar */}
      <div style={{
        position:  'absolute',
        top:       '50%',
        left:      0,
        right:     0,
        height:    1.5,
        marginTop: -0.75,
        background: 'rgba(255,255,255,0.80)',
        boxShadow: '0 0 3px rgba(0,0,0,0.8)',
      }} />
      {/* Vertical bar */}
      <div style={{
        position:   'absolute',
        left:       '50%',
        top:        0,
        bottom:     0,
        width:      1.5,
        marginLeft: -0.75,
        background: 'rgba(255,255,255,0.80)',
        boxShadow:  '0 0 3px rgba(0,0,0,0.8)',
      }} />
    </div>
  );
}

interface WalkOverlayProps {
  isLocked: boolean;
  onExit:   () => void;
}

function WalkOverlay({ isLocked, onExit }: WalkOverlayProps) {
  if (isLocked) {
    // Pointer is locked — show crosshair + minimal controls hint
    return (
      <>
        <Crosshair />
        <div style={{
          position:       'absolute',
          bottom:         20,
          left:           '50%',
          transform:      'translateX(-50%)',
          background:     'rgba(6,6,14,0.60)',
          backdropFilter: 'blur(8px)',
          borderRadius:   20,
          border:         '1px solid rgba(255,255,255,0.08)',
          padding:        '7px 18px',
          fontSize:       11,
          color:          '#8888bb',
          pointerEvents:  'none',
          whiteSpace:     'nowrap',
          userSelect:     'none',
          display:        'flex',
          gap:            16,
          alignItems:     'center',
        }}>
          <span>🖱 Move mouse to look</span>
          <span style={{ color: '#444466' }}>│</span>
          <span><kbd style={kbdStyle}>W</kbd><kbd style={kbdStyle}>A</kbd><kbd style={kbdStyle}>S</kbd><kbd style={kbdStyle}>D</kbd> Walk</span>
          <span style={{ color: '#444466' }}>│</span>
          <span><kbd style={kbdStyle}>ESC</kbd> Pause</span>
        </div>
      </>
    );
  }

  // Pointer unlocked — show "click to resume" panel
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position:       'absolute',
        top:            '50%',
        left:           '50%',
        transform:      'translate(-50%, -50%)',
        background:     'rgba(6,6,16,0.78)',
        backdropFilter: 'blur(16px)',
        borderRadius:   16,
        border:         '1px solid rgba(100,100,200,0.25)',
        padding:        '28px 36px',
        textAlign:      'center',
        color:          '#e4e2f4',
        userSelect:     'none',
        minWidth:       280,
        boxShadow:      '0 8px 40px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>🚶</div>
      <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#c0bef0' }}>
        Walk Mode
      </p>
      <p style={{ fontSize: 12, color: '#6868a0', marginBottom: 20, lineHeight: 1.6 }}>
        Click the scene to lock mouse &amp; start walking.<br />
        Press <strong style={{ color: '#a0a0d0' }}>ESC</strong> to pause.
      </p>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 8, marginBottom: 20, fontSize: 11, color: '#8888b0',
      }}>
        <ControlHint keys="W / ↑" label="Forward" />
        <ControlHint keys="S / ↓" label="Backward" />
        <ControlHint keys="A / ←" label="Strafe left" />
        <ControlHint keys="D / →" label="Strafe right" />
      </div>
      <button
        onClick={onExit}
        style={{
          background:   'rgba(255,255,255,0.06)',
          border:       '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color:        '#7070a0',
          padding:      '6px 16px',
          fontSize:     11,
          cursor:       'pointer',
          width:        '100%',
        }}
      >
        ← Back to Orbit view
      </button>
    </div>
  );
}

function ControlHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 6,
      padding: '6px 8px',
    }}>
      <div style={{ fontFamily: 'monospace', color: '#a0a0d0', fontWeight: 700, marginBottom: 2 }}>{keys}</div>
      <div>{label}</div>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  background:    'rgba(255,255,255,0.10)',
  border:        '1px solid rgba(255,255,255,0.18)',
  borderRadius:  4,
  padding:       '1px 5px',
  fontSize:      10,
  fontFamily:    'monospace',
  color:         '#c0bef0',
  marginRight:   2,
};

// ─── Canvas wrapper ───────────────────────────────────────────────────────────

interface CanvasSceneProps {
  onLock:   () => void;
  onUnlock: () => void;
}

function CanvasScene({ onLock, onUnlock }: CanvasSceneProps) {
  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      camera={{ fov: ORBIT_FOV, near: 0.05, far: 500 }}
      style={{ width: '100%', height: '100%', display: 'block', background: '#12111a' }}
      gl={{
        antialias:        false,
        toneMapping:      THREE.NoToneMapping,
        outputColorSpace: THREE.SRGBColorSpace,
        powerPreference:  'high-performance',
      }}
      dpr={[1, 1.5]}
    >
      <SceneContents onLock={onLock} onUnlock={onUnlock} />
    </Canvas>
  );
}

// ─── Mode toggle button (used in App.tsx sidebar, exported separately) ────────

export function CameraModeButton() {
  const { cameraMode, setCameraMode } = useStore((s) => ({
    cameraMode:    s.cameraMode,
    setCameraMode: s.setCameraMode,
  }));

  const isWalk = cameraMode === 'walk';

  return (
    <button
      onClick={() => setCameraMode(isWalk ? 'orbit' : 'walk')}
      title={isWalk ? 'Switch to Orbit view' : 'Enter first-person Walk mode'}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            8,
        width:          '100%',
        padding:        '10px 12px',
        borderRadius:   10,
        border:         `1px solid ${isWalk ? '#5050cc' : '#242235'}`,
        background:     isWalk
          ? 'linear-gradient(135deg, rgba(60,60,200,0.25), rgba(80,40,180,0.20))'
          : 'rgba(255,255,255,0.03)',
        color:          isWalk ? '#b0aef8' : '#6060a0',
        cursor:         'pointer',
        fontSize:       12,
        fontWeight:     700,
        letterSpacing:  '0.04em',
        transition:     'all 0.18s ease',
      }}
    >
      <span style={{ fontSize: 16 }}>{isWalk ? '🚶' : '🔭'}</span>
      {isWalk ? 'Walk Mode  ON' : 'Walk Mode'}
    </button>
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export default function SceneWrapper() {
  const { cameraMode, setCameraMode } = useStore((s) => ({
    cameraMode:    s.cameraMode,
    setCameraMode: s.setCameraMode,
  }));

  const [isLocked, setIsLocked] = useState(false);

  const handleLock   = useCallback(() => setIsLocked(true),  []);
  const handleUnlock = useCallback(() => setIsLocked(false), []);

  // When exiting walk mode, restore orbit FOV
  const exitWalkMode = useCallback(() => {
    setCameraMode('orbit');
    setIsLocked(false);
  }, [setCameraMode]);

  // If user switches from walk → orbit via sidebar button, reset locked state
  useEffect(() => {
    if (cameraMode === 'orbit') setIsLocked(false);
  }, [cameraMode]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <CanvasScene onLock={handleLock} onUnlock={handleUnlock} />

      {/* Walk-mode DOM overlays */}
      {cameraMode === 'walk' && (
        <WalkOverlay isLocked={isLocked} onExit={exitWalkMode} />
      )}
    </div>
  );
}
