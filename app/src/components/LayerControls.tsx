import { useStore } from '../store/useStore.ts';

const LAYERS = [
  { key: 'walls'        as const, label: 'Walls',        icon: '▣', hint: 'Wall geometry + glass' },
  { key: 'floors'       as const, label: 'Floors',       icon: '▥', hint: 'Room floor surfaces' },
  { key: 'ceilings'     as const, label: 'Ceilings',     icon: '▤', hint: 'Flat plaster ceilings at wall height' },
  { key: 'labels'       as const, label: 'Labels',       icon: '◎', hint: 'Room name overlays' },
  { key: 'measurements' as const, label: 'Dimensions',   icon: '↔', hint: 'Wall length measurements' },
  { key: 'wireframe'    as const, label: 'Wireframe',    icon: '⬡', hint: 'Debug mesh structure' },
];

export default function LayerControls() {
  const { layers, toggleLayer } = useStore((s) => ({
    layers:      s.layers,
    toggleLayer: s.toggleLayer,
  }));

  return (
    <section>
      <p style={{
        fontSize:      10,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         '#58566e',
        marginBottom:  8,
      }}>
        Layers
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {LAYERS.map(({ key, label, icon, hint }) => {
          const on = layers[key];
          return (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              title={hint}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           10,
                padding:       '8px 10px',
                borderRadius:  8,
                border:        `1px solid ${on ? '#3a3870' : '#1c1b2e'}`,
                background:    on ? 'rgba(80,76,180,0.14)' : 'rgba(255,255,255,0.02)',
                color:         on ? '#cccaee' : '#44425a',
                cursor:        'pointer',
                fontSize:      12,
                fontWeight:    on ? 600 : 400,
                transition:    'all 0.15s ease',
                userSelect:    'none',
                textAlign:     'left',
              }}
            >
              {/* Icon */}
              <span style={{ fontSize: 14, lineHeight: 1, width: 18, textAlign: 'center' }}>
                {icon}
              </span>

              {/* Label */}
              <span style={{ flex: 1 }}>{label}</span>

              {/* Toggle pill */}
              <span style={{
                width:         30,
                height:        17,
                borderRadius:  9,
                background:    on ? '#5050ee' : '#1e1d30',
                position:      'relative',
                flexShrink:    0,
                transition:    'background 0.2s ease',
                border:        `1px solid ${on ? '#6868ff' : '#2e2c48'}`,
              }}>
                <span style={{
                  position:     'absolute',
                  top:          2,
                  left:         on ? 14 : 2,
                  width:        11,
                  height:       11,
                  borderRadius: '50%',
                  background:   on ? '#ffffff' : '#444260',
                  transition:   'left 0.2s ease',
                  boxShadow:    on ? '0 1px 4px rgba(80,80,255,0.5)' : 'none',
                }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
