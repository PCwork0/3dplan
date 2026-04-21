import { useStore } from '../store/useStore.ts';

const LAYERS = [
  { key: 'walls'     as const, label: 'Walls',     icon: '🧱' },
  { key: 'floors'    as const, label: 'Floors',    icon: '▭' },
  { key: 'wireframe' as const, label: 'Wireframe', icon: '⬡' },
];

export default function LayerControls() {
  const { layers, toggleLayer } = useStore((s) => ({
    layers:      s.layers,
    toggleLayer: s.toggleLayer,
  }));

  return (
    <section>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666880', marginBottom: 8 }}>
        Layers
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {LAYERS.map(({ key, label, icon }) => {
          const on = layers[key];
          return (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           10,
                padding:       '8px 12px',
                borderRadius:  6,
                border:        `1px solid ${on ? '#4a4a7a' : '#2a2a3e'}`,
                background:    on ? '#24243a' : '#18181f',
                color:         on ? '#c8c8f0' : '#505068',
                cursor:        'pointer',
                fontSize:      13,
                fontWeight:    on ? 500 : 400,
                transition:    'all 0.15s',
                userSelect:    'none',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
              {/* Toggle pill */}
              <span style={{
                width:        28,
                height:       16,
                borderRadius: 8,
                background:   on ? '#5a5aee' : '#2e2e42',
                position:     'relative',
                flexShrink:   0,
                transition:   'background 0.15s',
              }}>
                <span style={{
                  position:     'absolute',
                  top:          2,
                  left:         on ? 14 : 2,
                  width:        12,
                  height:       12,
                  borderRadius: '50%',
                  background:   on ? '#fff' : '#555',
                  transition:   'left 0.15s',
                }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
