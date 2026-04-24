/**
 * PlanExtractor — Isolated drag-drop component: image → JSON floor plan.
 *
 * Supports two extraction modes:
 *   • CV  — OpenCV + Tesseract via /api/extract-plan-cv  (no API key, offline)
 *   • AI  — Claude Vision via /api/extract-plan   (requires ANTHROPIC_API_KEY)
 */

import { useCallback, useRef, useState } from 'react';

type Phase = 'idle' | 'uploading' | 'done' | 'error';
type Mode  = 'cv' | 'ai';

interface Props {
  onSuccess: (jsonString: string) => void;
}

const C = {
  border:  '#1f1e32',
  accent:  '#6060ee',
  muted:   '#58566e',
  text:    '#e4e2f4',
  success: '#48b878',
  error:   '#e05252',
  warn:    '#e0a032',
  cv:      '#38b2a0',
  ai:      '#6060ee',
};

async function uploadImage(file: File, mode: Mode): Promise<string> {
  const endpoint = mode === 'cv' ? '/api/extract-plan-cv' : '/api/extract-plan';
  const form = new FormData();
  form.append('image', file);
  const res  = await fetch(endpoint, { method: 'POST', body: form });
  const body = await res.json() as { ok?: boolean; plan?: unknown; error?: string; details?: string[] };
  if (!res.ok || !body.ok) {
    const detail = body.details ? '\n' + body.details.join('\n') : '';
    throw new Error((body.error ?? 'Extraction failed') + detail);
  }
  return JSON.stringify(body.plan, null, 2);
}

function Spinner() {
  return (
    <div style={{
      width: 20, height: 20,
      border: `2px solid ${C.border}`,
      borderTop: `2px solid ${C.accent}`,
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

interface ModeToggleProps { mode: Mode; onChange: (m: Mode) => void; disabled: boolean; }

function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  const btn = (m: Mode, label: string, title: string) => (
    <button
      key={m}
      title={title}
      disabled={disabled}
      onClick={() => onChange(m)}
      style={{
        flex: 1, padding: '4px 0', fontSize: 10,
        fontWeight: mode === m ? 700 : 400, letterSpacing: '0.04em',
        border: 'none',
        borderRadius: m === 'cv' ? '5px 0 0 5px' : '0 5px 5px 0',
        background: mode === m ? (m === 'cv' ? C.cv : C.ai) : 'rgba(255,255,255,0.05)',
        color: mode === m ? '#fff' : C.muted,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden',
                  border: `1px solid ${C.border}`, marginBottom: 10 }}>
      {btn('cv', '⚙ CV / OCR', 'OpenCV + Tesseract — offline, no API key')}
      {btn('ai', '✦ AI', 'Claude Vision — requires ANTHROPIC_API_KEY')}
    </div>
  );
}

export default function PlanExtractor({ onSuccess }: Props) {
  const [phase,     setPhase]    = useState<Phase>('idle');
  const [message,   setMessage]  = useState('');
  const [preview,   setPreview]  = useState<string | null>(null);
  const [isDragOver,setDragOver] = useState(false);
  const [mode,      setMode]     = useState<Mode>('cv');
  const inputRef = useRef<HTMLInputElement>(null);

  const process = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setPhase('error'); setMessage('Please drop an image file (JPG, PNG, WebP).'); return;
    }
    setPreview(URL.createObjectURL(file));
    setPhase('uploading');
    setMessage(mode === 'cv' ? 'Analysing with OpenCV + Tesseract…' : `Sending ${file.name} to Claude Vision…`);
    try {
      const json = await uploadImage(file, mode);
      setPhase('done'); setMessage('Extraction complete!'); onSuccess(json);
    } catch (e) {
      setPhase('error'); setMessage((e as Error).message);
    }
  }, [onSuccess, mode]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) process(f); e.target.value = '';
  };
  const onDrop      = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) process(f); };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = ()                    => setDragOver(false);
  const reset       = ()                    => { setPhase('idle'); setMessage(''); setPreview(null); };

  const modeAccent  = mode === 'cv' ? C.cv : C.ai;
  const statusColor = phase === 'done' ? C.success : phase === 'error' ? C.error : phase === 'uploading' ? C.warn : C.muted;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <section>
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 10 }}>
          Import Floor Plan
        </p>

        <ModeToggle mode={mode} onChange={setMode} disabled={phase === 'uploading'} />

        <div
          onClick={() => phase !== 'uploading' && inputRef.current?.click()}
          onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          style={{
            border: `1.5px dashed ${isDragOver ? modeAccent : C.border}`,
            borderRadius: 10, padding: '16px 12px', textAlign: 'center',
            cursor: phase === 'uploading' ? 'wait' : 'pointer',
            background: isDragOver ? `${modeAccent}14` : 'rgba(255,255,255,0.02)',
            transition: 'all 0.15s ease',
          }}
        >
          {preview && (
            <img src={preview} alt="floor plan preview" style={{
              maxWidth: '100%', maxHeight: 90, objectFit: 'contain',
              borderRadius: 6, marginBottom: 8, opacity: phase === 'uploading' ? 0.5 : 0.85,
            }} />
          )}
          {phase === 'uploading' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Spinner />
              <span style={{ fontSize: 11, color: C.warn }}>
                {mode === 'cv' ? 'OpenCV analysing…' : 'Claude analysing…'}
              </span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 22, marginBottom: 6 }}>
                {phase === 'done' ? '✅' : phase === 'error' ? '❌' : '🗺️'}
              </div>
              <p style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>
                {phase === 'idle' ? 'Drop a floor plan image' : phase === 'done' ? 'Plan loaded!' : 'Try another image'}
              </p>
              <p style={{ fontSize: 10, color: C.muted }}>JPG · PNG · WebP · click or drag</p>
            </>
          )}
        </div>

        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
               onChange={onFileChange} style={{ display: 'none' }} />

        {message && (
          <div style={{
            marginTop: 8, padding: '7px 10px', borderRadius: 7,
            background: `${statusColor}14`, border: `1px solid ${statusColor}40`,
            fontSize: 11, color: statusColor, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {message}
          </div>
        )}

        {(phase === 'done' || phase === 'error') && (
          <button
            onClick={(e) => { e.stopPropagation(); reset(); }}
            style={{
              marginTop: 6, width: '100%', padding: '6px', borderRadius: 7,
              border: `1px solid ${C.border}`, background: 'transparent',
              color: C.muted, fontSize: 10, cursor: 'pointer',
            }}
          >
            ↺ Clear
          </button>
        )}

        <p style={{ fontSize: 10, color: '#38365a', marginTop: 8, lineHeight: 1.5 }}>
          {mode === 'cv'
            ? <><strong style={{ color: C.cv }}>CV mode</strong> — OpenCV + Tesseract, fully offline.
                Works best on clean architectural drawings.</>
            : <><strong style={{ color: C.ai }}>AI mode</strong> — needs{' '}
                <code style={{ color: '#5858a0' }}>ANTHROPIC_API_KEY</code> in dev server.
                Handles hand-drawn &amp; complex plans.</>
          }
        </p>
      </section>
    </>
  );
}
