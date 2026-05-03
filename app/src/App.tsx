/**
 * App.tsx — Main layout
 *
 * Sidebar (320 px): header, camera mode toggle, room stats, layer toggles, JSON editor
 * Canvas (flex 1):  3D scene + overlays
 *
 * Design language: dark-glass, indigo accent, minimal chrome
 */

import SceneWrapper, { CameraModeButton } from './components/Scene.tsx';
import LayerControls from './components/LayerControls.tsx';
import LightingPanel from './components/LightingPanel.tsx';
import JsonPanel from './components/JsonPanel.tsx';
import PlanExtractor from './components/PlanExtractor/index.tsx';
import { useStore } from './store/useStore.ts';

// ─── Shared tokens ────────────────────────────────────────────────────────────

const C = {
  bg:      '#0e0e16',
  sidebar: '#13121f',
  border:  '#1f1e32',
  accent:  '#6060ee',
  accent2: '#9060e0',
  text:    '#e4e2f4',
  muted:   '#58566e',
  dim:     '#2a2840',
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      textAlign:    'center',
      padding:      '8px 4px',
      borderRadius: 8,
      background:   C.dim,
    }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: C.accent, lineHeight: 1 }}>
        {value}
      </p>
      <p style={{
        fontSize:      10,
        color:         C.muted,
        marginTop:     4,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        {label}
      </p>
    </div>
  );
}

// ─── Room legend chip ─────────────────────────────────────────────────────────

const ROOM_COLORS: Record<string, string> = {
  'master bedroom': '#c8a882',
  'bedroom':        '#c8a882',
  'living':         '#c4b090',
  'dining':         '#c4b090',
  'kitchen':        '#9eaab0',
  'corridor':       '#b0a898',
  'puja':           '#a8b8b0',
  'utility':        '#a8b8b0',
  'bathroom':       '#a8b8b0',
};

function roomColor(name: string): string {
  const n = name.toLowerCase();
  for (const [key, color] of Object.entries(ROOM_COLORS)) {
    if (n.includes(key)) return color;
  }
  return '#8888aa';
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { sceneData, cameraMode } = useStore((s) => ({
    sceneData:  s.sceneData,
    cameraMode: s.cameraMode,
  }));
  // Theatre Studio is initialized in main.tsx (must run before any
  // module calls getProject()). See top of main.tsx for the rationale.

  return (
    <div style={{
      display:    'flex',
      height:     '100vh',
      width:      '100%',  // CRITICAL: without this the flex item collapses
      flex:       1,       //   to its content width (≈ aside) and the Canvas
      minWidth:   0,       //   inside <main> ends up 0px wide → blank screen.
      overflow:   'hidden',
      background: C.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* ════════════════════ SIDEBAR ════════════════════ */}
      <aside style={{
        width:         320,
        flexShrink:    0,
        background:    C.sidebar,
        borderRight:   `1px solid ${C.border}`,
        display:       'flex',
        flexDirection: 'column',
        padding:       '16px 14px',
        gap:           14,
        overflowY:     'auto',
        overflowX:     'hidden',
      }}>

        {/* ── Logo / header ── */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width:          34,
            height:         34,
            borderRadius:   10,
            background:     `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
            flexShrink:     0,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       16,
          }}>
            🏠
          </div>
          <div>
            <h1 style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1 }}>
              3D Floor Plan
            </h1>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              Interactive Viewer · PBR Renderer
            </p>
          </div>
        </header>

        {/* ── Divider ── */}
        <div style={{ borderTop: `1px solid ${C.border}` }} />

        {/* ── Camera mode toggle ── */}
        <CameraModeButton />

        {/* ── Orbit / Walk hint ── */}
        <p style={{
          fontSize:     10,
          color:        C.muted,
          textAlign:    'center',
          lineHeight:   1.5,
          marginTop:    -6,
          padding:      '0 4px',
        }}>
          {cameraMode === 'orbit'
            ? 'Drag · Scroll · Right-drag to pan'
            : cameraMode === 'walk'
            ? 'Click scene → mouse to look · WASD to move · ESC to pause'
            : '🎬 Cinematic camera tour · Theatre.js timeline · scrub or pause anytime'}
        </p>

        {/* ── Divider ── */}
        <div style={{ borderTop: `1px solid ${C.border}` }} />

        {/* ── Stats row ── */}
        {sceneData && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <StatCard label="Walls"  value={sceneData.walls.length} />
            <StatCard label="Rooms"  value={sceneData.floors.length} />
            <StatCard label="Height" value={`${sceneData.bounds.maxY}m`} />
          </div>
        )}

        {/* ── Room legend ── */}
        {sceneData && sceneData.floors.length > 0 && (
          <div>
            <p style={{
              fontSize:      10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color:         C.muted,
              marginBottom:  8,
            }}>
              Rooms
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sceneData.floors.map((f) => (
                <div key={f.id} style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          8,
                  padding:      '5px 8px',
                  borderRadius: 6,
                  background:   'rgba(255,255,255,0.03)',
                }}>
                  <div style={{
                    width:        10,
                    height:       10,
                    borderRadius: 3,
                    background:   roomColor(f.name),
                    flexShrink:   0,
                  }} />
                  <span style={{ fontSize: 12, color: C.text }}>{f.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Layer toggles ── */}
        <LayerControls />

        {/* ── Divider ── */}
        <div style={{ borderTop: `1px solid ${C.border}` }} />

        {/* ── Lighting controls ── */}
        <LightingPanel />

        {/* ── Divider ── */}
        <div style={{ borderTop: `1px solid ${C.border}` }} />

        {/* ── Image → JSON extractor ── */}
        <PlanExtractor
          onSuccess={(json) => {
            useStore.getState().setJsonInput(json);
            useStore.getState().buildScene();
          }}
        />

        {/* ── Divider ── */}
        <div style={{ borderTop: `1px solid ${C.border}` }} />

        {/* ── JSON editor (takes remaining space) ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <JsonPanel />
        </div>
      </aside>

      {/* ════════════════════ CANVAS ════════════════════ */}
      <main style={{
        flex:     1,
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <SceneWrapper />
      </main>
    </div>
  );
}
