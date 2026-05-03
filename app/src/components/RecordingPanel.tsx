/**
 * RecordingPanel.tsx — DOM-only UI for recording, playback, and export.
 *
 * IMPORTANT: This component lives OUTSIDE the R3F <Canvas>, so it must not
 * call useThree/useFrame. The actual playback frame loop lives in
 * RecordingPlayback.tsx (rendered inside the Canvas). State is shared via
 * the tourRecorder singleton; this panel polls it on a timer.
 */

import { useState, useEffect } from 'react';
import { tourRecorder } from '../tour/tourRecorder.ts';

const C = {
  accent:  '#6060ee',
  accent2: '#9060e0',
  success: '#60cc60',
  danger:  '#ff6060',
  text:    '#e4e2f4',
  muted:   '#6060a0',
};

export default function RecordingPanel() {
  const [isRecording,   setIsRecording]   = useState(false);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [frameCount,    setFrameCount]    = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [playbackTime,  setPlaybackTime]  = useState(0);
  const [exportFormat,  setExportFormat]  = useState<'typescript' | 'json'>('typescript');

  // Single polling loop keeps UI in sync with the singleton.
  useEffect(() => {
    const id = setInterval(() => {
      setFrameCount(tourRecorder.getFrameCount());
      setDuration(tourRecorder.getDuration());
      setIsPlayingBack(tourRecorder.isPlayingBack());
      setPlaybackTime(tourRecorder.getPlaybackTime());
    }, 100);
    return () => clearInterval(id);
  }, []);

  const handleStartRecord = () => {
    tourRecorder.clear();
    tourRecorder.start();
    setIsRecording(true);
    setFrameCount(0);
    setDuration(0);
  };

  const handleStopRecord = () => {
    tourRecorder.stop();
    setIsRecording(false);
    setFrameCount(tourRecorder.getFrameCount());
    setDuration(tourRecorder.getDuration());
  };

  const handlePlayback = () => {
    if (tourRecorder.isPlayingBack()) {
      tourRecorder.stopPlayback();
    } else {
      tourRecorder.startPlayback();
    }
  };

  const handleExport = () => {
    const frames = tourRecorder.getFrames();
    if (frames.length === 0) {
      alert('No frames recorded');
      return;
    }

    const content  = exportFormat === 'typescript'
      ? tourRecorder.exportAsTypeScript()
      : tourRecorder.exportAsJSON();
    const filename = exportFormat === 'typescript'
      ? 'tour-keyframes.ts'
      : 'tour-recording.json';

    navigator.clipboard.writeText(content);
    alert(`✓ Exported ${frames.length} frames to clipboard!\n\nSave as: ${filename}`);
  };

  if (frameCount === 0 && !isRecording) {
    return (
      <button
        onClick={handleStartRecord}
        style={{
          position:     'fixed',
          top:          20,
          right:        20,
          padding:      '12px 20px',
          borderRadius: 10,
          border:       'none',
          background:   `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
          color:        '#fff',
          fontSize:     13,
          fontWeight:   700,
          cursor:       'pointer',
          boxShadow:    '0 4px 16px rgba(96, 96, 238, 0.3)',
          transition:   'all 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        title="Start recording camera movement"
      >
        🎥 Record Tour
      </button>
    );
  }

  return (
    <div
      style={{
        position:       'fixed',
        top:            20,
        right:          20,
        background:     'rgba(13, 12, 22, 0.95)',
        backdropFilter: 'blur(12px)',
        border:         '1px solid rgba(96, 96, 238, 0.3)',
        borderRadius:   12,
        padding:        16,
        minWidth:       300,
        boxShadow:      '0 8px 32px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Title */}
      <p style={{
        fontSize:      12,
        fontWeight:    700,
        color:         '#9090c0',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom:  12,
      }}>
        🎥 Tour Recorder
      </p>

      {/* Status */}
      <div style={{
        padding:      '8px 12px',
        borderRadius: 6,
        background:   isRecording
          ? 'rgba(255, 96, 96, 0.15)'
          : 'rgba(96, 204, 96, 0.15)',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Status:</span>
          <span style={{
            fontSize:   11,
            fontWeight: 700,
            color:      isRecording ? C.danger : C.success,
          }}>
            {isRecording ? '● RECORDING' : isPlayingBack ? '▶ PLAYBACK' : '● READY'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: C.muted }}>Frames:</span>
          <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>
            {frameCount}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: C.muted }}>Duration:</span>
          <span style={{
            fontSize:   11,
            color:      C.text,
            fontWeight: 600,
            fontFamily: 'monospace',
          }}>
            {duration.toFixed(1)}s {isPlayingBack && `/ ${playbackTime.toFixed(1)}s`}
          </span>
        </div>
      </div>

      {/* Playback bar */}
      {frameCount > 0 && duration > 0 && (
        <div
          onClick={(e) => {
            if (!isPlayingBack) return;
            const rect  = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            tourRecorder.setPlaybackTime(ratio * duration);
          }}
          style={{
            width:        '100%',
            height:       4,
            background:   '#23223a',
            borderRadius: 2,
            cursor:       isPlayingBack ? 'pointer' : 'default',
            position:     'relative',
            marginBottom: 12,
          }}
        >
          <div style={{
            position:     'absolute',
            top:          0,
            left:         0,
            height:       '100%',
            width:        `${Math.min(100, (playbackTime / duration) * 100)}%`,
            background:   `linear-gradient(90deg, ${C.accent}, ${C.accent2})`,
            borderRadius: 2,
            transition:   'width 0.05s linear',
          }} />
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={isRecording ? handleStopRecord : handleStartRecord}
          style={{
            flex:         1,
            padding:      '8px 12px',
            borderRadius: 6,
            border:       'none',
            background:   isRecording
              ? 'rgba(255, 96, 96, 0.3)'
              : 'rgba(96, 96, 238, 0.3)',
            color:        isRecording ? '#ff9090' : '#a0a0f0',
            fontSize:     11,
            fontWeight:   600,
            cursor:       'pointer',
            transition:   'all 0.2s',
          }}
        >
          {isRecording ? '⏹ Stop' : '● Record'}
        </button>

        {frameCount > 0 && (
          <button
            onClick={handlePlayback}
            style={{
              flex:         1,
              padding:      '8px 12px',
              borderRadius: 6,
              border:       'none',
              background:   'rgba(96, 204, 96, 0.3)',
              color:        '#a0f0a0',
              fontSize:     11,
              fontWeight:   600,
              cursor:       'pointer',
              transition:   'all 0.2s',
            }}
          >
            {isPlayingBack ? '❚❚ Pause' : '▶ Play'}
          </button>
        )}
      </div>

      {/* Export */}
      {frameCount > 0 && (
        <>
          <div style={{ borderTop: '1px solid rgba(96, 96, 238, 0.2)', marginBottom: 12 }} />

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 6 }}>
              Export Format:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                onClick={() => setExportFormat('typescript')}
                style={{
                  padding:      '6px 8px',
                  borderRadius: 4,
                  border:       exportFormat === 'typescript'
                    ? '1px solid rgba(96, 96, 238, 0.8)'
                    : '1px solid rgba(96, 96, 238, 0.2)',
                  background:   exportFormat === 'typescript'
                    ? 'rgba(96, 96, 238, 0.2)'
                    : 'transparent',
                  color:        '#a0a0f0',
                  fontSize:     10,
                  cursor:       'pointer',
                }}
              >
                TypeScript
              </button>
              <button
                onClick={() => setExportFormat('json')}
                style={{
                  padding:      '6px 8px',
                  borderRadius: 4,
                  border:       exportFormat === 'json'
                    ? '1px solid rgba(96, 96, 238, 0.8)'
                    : '1px solid rgba(96, 96, 238, 0.2)',
                  background:   exportFormat === 'json'
                    ? 'rgba(96, 96, 238, 0.2)'
                    : 'transparent',
                  color:        '#a0a0f0',
                  fontSize:     10,
                  cursor:       'pointer',
                }}
              >
                JSON
              </button>
            </div>
          </div>

          <button
            onClick={handleExport}
            style={{
              width:        '100%',
              padding:      '8px 12px',
              borderRadius: 6,
              border:       'none',
              background:   'rgba(96, 204, 96, 0.3)',
              color:        '#a0f0a0',
              fontSize:     11,
              fontWeight:   600,
              cursor:       'pointer',
              transition:   'all 0.2s',
            }}
          >
            📥 Export & Copy
          </button>

          <p style={{ fontSize: 9, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
            💡 Export copies keyframes to clipboard. Paste into your codebase or Theatre Studio.
          </p>
        </>
      )}
    </div>
  );
}
