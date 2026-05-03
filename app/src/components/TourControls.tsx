/**
 * TourControls.tsx — Export/import tour state as JSON
 *
 * Allows end users to:
 * - Create tours visually in Theatre Studio
 * - Export tour state as JSON for sharing/storage
 * - Load previously saved tours from JSON
 */

import { useState } from 'react';
import { exportTourJSON, importTourJSON } from '../tour/theatreProject.ts';

export default function TourControls() {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [message, setMessage] = useState('');

  const handleExport = () => {
    const json = exportTourJSON();
    setJsonInput(json);
    setMessage('✓ Tour exported. Copy below to save.');
  };

  const handleImport = () => {
    if (!jsonInput.trim()) {
      setMessage('❌ Please paste a tour JSON first');
      return;
    }

    const success = importTourJSON(jsonInput);
    if (success) {
      setMessage('✓ Tour imported! Refresh the page to see changes.');
      setJsonInput('');
    } else {
      setMessage('❌ Invalid JSON format');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonInput);
    setMessage('✓ Copied to clipboard!');
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1000,
      }}
    >
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #6060ee, #9060e0)',
          color: '#fff',
          fontSize: 20,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(96, 96, 238, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        title="Tour Controls"
      >
        🎬
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 70,
            right: 0,
            background: 'rgba(13, 12, 22, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(96, 96, 238, 0.3)',
            borderRadius: 12,
            padding: 16,
            minWidth: 320,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Title */}
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#9090c0',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 12,
            }}
          >
            Tour Editor
          </p>

          {/* Message */}
          {message && (
            <div
              style={{
                fontSize: 11,
                color: message.includes('✓') ? '#60cc60' : '#ff6060',
                marginBottom: 12,
                padding: '8px 12px',
                borderRadius: 6,
                background:
                  message.includes('✓')
                    ? 'rgba(96, 204, 96, 0.15)'
                    : 'rgba(255, 96, 96, 0.15)',
              }}
            >
              {message}
            </div>
          )}

          {/* JSON Editor */}
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder="Tour JSON will appear here..."
            style={{
              width: '100%',
              height: 120,
              padding: 8,
              borderRadius: 6,
              border: '1px solid rgba(96, 96, 238, 0.2)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e4e2f4',
              fontSize: 10,
              fontFamily: 'monospace',
              resize: 'none',
              marginBottom: 12,
            }}
          />

          {/* Buttons */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <button
              onClick={handleExport}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(96, 96, 238, 0.3)',
                color: '#a0a0f0',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(96, 96, 238, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(96, 96, 238, 0.3)';
              }}
            >
              📥 Export
            </button>

            <button
              onClick={handleImport}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(96, 204, 96, 0.3)',
                color: '#a0f0a0',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(96, 204, 96, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(96, 204, 96, 0.3)';
              }}
            >
              📤 Import
            </button>

            {jsonInput && (
              <button
                onClick={handleCopy}
                style={{
                  gridColumn: '1 / -1',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(96, 96, 238, 0.2)',
                  background: 'transparent',
                  color: '#8080c0',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(96, 96, 238, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                📋 Copy JSON
              </button>
            )}
          </div>

          {/* Info */}
          <p
            style={{
              fontSize: 10,
              color: '#6060a0',
              marginTop: 12,
              lineHeight: 1.5,
            }}
          >
            💡 Use Theatre Studio to create tours visually. Press <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: 3 }}>Ctrl+\</kbd> (Cmd+\ on Mac) to open.
          </p>
        </div>
      )}
    </div>
  );
}
