/**
 * LightingPanel.tsx — Sidebar panel for real-time light control.
 *
 * Controls:
 *  • Time-of-day presets (one click to set everything)
 *  • Sun intensity  [0 – 5]
 *  • Sun elevation  [0° – 90°]   — height in sky
 *  • Sun azimuth    [0° – 360°]  — compass direction
 *  • Color temperature [1500 – 9000 K]  — maps to a warm→cool gradient
 *  • Sky (fill) intensity [0 – 3]
 *  • Ambient intensity   [0 – 1]
 */

import { useStore } from '../store/useStore.ts';
import type { LightingPreset } from '../store/useStore.ts';
import { tempToHex } from '../utils/colorTemp.ts';

// ─── Time-of-day presets ──────────────────────────────────────────────────────

const PRESETS: { id: LightingPreset; label: string; icon: string }[] = [
  { id: 'dawn',      label: 'Dawn',      icon: '🌅' },
  { id: 'morning',   label: 'Morning',   icon: '🌄' },
  { id: 'noon',      label: 'Noon',      icon: '☀️'  },
  { id: 'afternoon', label: 'Afternoon', icon: '🌤️'  },
  { id: 'sunset',    label: 'Sunset',    icon: '🌇' },
  { id: 'night',     label: 'Night',     icon: '🌙' },
];

// ─── Colour temperature gradient (visual only) ────────────────────────────────

// CSS gradient representing 1500–9000 K along a horizontal bar
const TEMP_GRADIENT =
  'linear-gradient(to right, #ff6020, #ffad60, #ffd57a, #fff8e8, #e8f0ff, #c0d4ff)';

// ─── Slider row component ─────────────────────────────────────────────────────

interface SliderProps {
  label:    string;
  value:    number;
  min:      number;
  max:      number;
  step:     number;
  unit?:    string;
  gradient?: string;
  fmt?:     (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, unit = '', gradient, fmt, onChange }: SliderProps) {
  const display = fmt ? fmt(value) : value.toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#6868a0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#a0a0d0', fontFamily: 'monospace' }}>
          {display}{unit}
        </span>
      </div>
      <div style={{ position: 'relative', height: 20 }}>
        {/* Coloured track */}
        {gradient && (
          <div style={{
            position:     'absolute',
            top:          '50%',
            left:         0,
            right:        0,
            height:       4,
            borderRadius: 2,
            marginTop:    -2,
            background:   gradient,
            pointerEvents:'none',
          }} />
        )}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            width:          '100%',
            accentColor:    '#6060ee',
            cursor:         'pointer',
            position:       'relative',
            height:         20,
            margin:         0,
            background:     gradient ? 'transparent' : undefined,
          }}
        />
      </div>
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────

function SectionHead({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <div style={{ width: 3, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#58566e' }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function LightingPanel() {
  const { lighting, setLighting, applyPreset } = useStore((s) => ({
    lighting:    s.lighting,
    setLighting: s.setLighting,
    applyPreset: s.applyPreset,
  }));

  const { sun, sky, ambient } = lighting;
  const sunColor = tempToHex(sun.temperature);

  return (
    <section>
      {/* ── Section label ── */}
      <p style={{
        fontSize:      10,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color:         '#58566e',
        marginBottom:  10,
      }}>
        Lighting
      </p>

      {/* ── Time-of-day preset chips ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 12 }}>
        {PRESETS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => applyPreset(id)}
            title={label}
            style={{
              padding:      '6px 4px',
              borderRadius: 7,
              border:       '1px solid #1e1d30',
              background:   'rgba(255,255,255,0.03)',
              color:        '#8888b0',
              cursor:       'pointer',
              fontSize:     10,
              display:      'flex',
              flexDirection:'column',
              alignItems:   'center',
              gap:          3,
              transition:   'all 0.14s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(96,96,238,0.15)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3870';
              (e.currentTarget as HTMLButtonElement).style.color = '#c0bef8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e1d30';
              (e.currentTarget as HTMLButtonElement).style.color = '#8888b0';
            }}
          >
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Sun / Key light ── */}
        <SectionHead label="Sun" color="#f0c060" />

        {/* Sun colour swatch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width:        20,
            height:       20,
            borderRadius: 4,
            background:   sunColor,
            border:       '1px solid rgba(255,255,255,0.12)',
            flexShrink:   0,
            boxShadow:    `0 0 8px ${sunColor}88`,
          }} />
          <div style={{ flex: 1, fontSize: 10, color: '#6060a0', fontFamily: 'monospace' }}>
            {sunColor.toUpperCase()}  ·  {sun.temperature.toFixed(0)} K
          </div>
        </div>

        <Slider
          label="Intensity"
          value={sun.intensity}
          min={0} max={5} step={0.05}
          onChange={(v) => setLighting({ sun: { ...sun, intensity: v } })}
        />
        <Slider
          label="Elevation"
          value={sun.elevation}
          min={0} max={90} step={1}
          unit="°"
          onChange={(v) => setLighting({ sun: { ...sun, elevation: v } })}
        />
        <Slider
          label="Azimuth"
          value={sun.azimuth}
          min={0} max={360} step={1}
          unit="°"
          fmt={(v) => {
            const dirs = ['N','NE','E','SE','S','SW','W','NW','N'];
            const idx = Math.round(v / 45) % 8;
            return `${v.toFixed(0)}° ${dirs[idx]}`;
          }}
          onChange={(v) => setLighting({ sun: { ...sun, azimuth: v } })}
        />
        <Slider
          label="Color temp"
          value={sun.temperature}
          min={1500} max={9000} step={100}
          unit=" K"
          gradient={TEMP_GRADIENT}
          onChange={(v) => setLighting({ sun: { ...sun, temperature: v } })}
        />

        {/* ── Sky / fill light ── */}
        <SectionHead label="Sky / Fill" color="#6090e0" />
        <Slider
          label="Intensity"
          value={sky.intensity}
          min={0} max={3} step={0.05}
          onChange={(v) => setLighting({ sky: { intensity: v } })}
        />

        {/* ── Ambient ── */}
        <SectionHead label="Ambient" color="#9090b0" />
        <Slider
          label="Intensity"
          value={ambient.intensity}
          min={0} max={1} step={0.01}
          onChange={(v) => setLighting({ ambient: { intensity: v } })}
        />
      </div>
    </section>
  );
}
