import { useStore } from '../store/useStore.ts';

export default function JsonPanel() {
  const { jsonInput, errors, setJsonInput, buildScene } = useStore((s) => ({
    jsonInput:    s.jsonInput,
    errors:       s.errors,
    setJsonInput: s.setJsonInput,
    buildScene:   s.buildScene,
  }));

  const handleKey = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to render
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') buildScene();
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666880' }}>
        Floor Plan JSON
      </p>

      <textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        onKeyDown={handleKey}
        spellCheck={false}
        style={{
          flex:        1,
          minHeight:   240,
          resize:      'vertical',
          background:  '#0d0d14',
          color:       '#a8c0d8',
          border:      '1px solid #2a2a3e',
          borderRadius: 6,
          padding:     10,
          fontSize:    11.5,
          fontFamily:  '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          lineHeight:  1.6,
          outline:     'none',
        }}
      />

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{
          background:  '#2a1020',
          border:      '1px solid #6b2040',
          borderRadius: 6,
          padding:     '8px 10px',
          maxHeight:   100,
          overflow:    'auto',
        }}>
          {errors.map((e, i) => (
            <p key={i} style={{ fontSize: 11, color: '#e07090', lineHeight: 1.5 }}>
              {e}
            </p>
          ))}
        </div>
      )}

      <button
        onClick={buildScene}
        style={{
          padding:      '10px 0',
          borderRadius: 6,
          border:       'none',
          background:   '#4a4aee',
          color:        '#fff',
          fontSize:     13,
          fontWeight:   600,
          cursor:       'pointer',
          letterSpacing: '0.02em',
          transition:   'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#6060ff')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '#4a4aee')}
      >
        ↻  Render  <kbd style={{ fontSize: 10, opacity: 0.7 }}>⌘↵</kbd>
      </button>
    </section>
  );
}
