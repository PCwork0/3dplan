import SceneWrapper from './components/Scene.tsx';
import LayerControls from './components/LayerControls.tsx';
import JsonPanel from './components/JsonPanel.tsx';
import { useStore } from './store/useStore.ts';

export default function App() {
  const sceneData = useStore((s) => s.sceneData);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width:      320,
        flexShrink: 0,
        background: '#16161e',
        borderRight: '1px solid #22223a',
        display:    'flex',
        flexDirection: 'column',
        padding:    16,
        gap:        20,
        overflow:   'hidden',
      }}>
        {/* Header */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width:        32,
            height:       32,
            borderRadius: 8,
            background:   'linear-gradient(135deg, #4a4aee, #9050e0)',
            flexShrink:   0,
          }} />
          <div>
            <h1 style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8', lineHeight: 1 }}>
              3D Floor Plan
            </h1>
            <p style={{ fontSize: 11, color: '#555570', marginTop: 3 }}>
              Geometry Viewer
            </p>
          </div>
        </header>

        {/* Stats */}
        {sceneData && (
          <div style={{
            display:       'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap:           8,
            padding:       '10px 0',
            borderTop:     '1px solid #22223a',
            borderBottom:  '1px solid #22223a',
          }}>
            {[
              { label: 'Walls',  value: sceneData.walls.length },
              { label: 'Rooms',  value: sceneData.floors.length },
              { label: 'Height', value: `${sceneData.bounds.maxY}m` },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#8080f0' }}>{value}</p>
                <p style={{ fontSize: 10, color: '#555570', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Layer toggles */}
        <LayerControls />

        {/* JSON editor — takes remaining height */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <JsonPanel />
        </div>
      </aside>

      {/* ── Canvas ── */}
      <main style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        <SceneWrapper />

        {/* Hint overlay */}
        <div style={{
          position:   'absolute',
          bottom:     16,
          left:       '50%',
          transform:  'translateX(-50%)',
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          borderRadius: 20,
          padding:    '6px 14px',
          fontSize:   11,
          color:      '#8888aa',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          Left drag to orbit · Scroll to zoom · Right drag to pan
        </div>
      </main>
    </div>
  );
}
