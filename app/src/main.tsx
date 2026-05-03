/**
 * main.tsx — entry point.
 *
 * Theatre.js initialization order matters:
 *   1. @theatre/core must be loaded FIRST (a static top-level import).
 *   2. @theatre/studio is then dynamically imported (dev-only) and initialized.
 *   3. ONLY THEN may we import any module that calls getProject() (App).
 *
 * If we load studio before core → studio throws "imported without core".
 * If we load core before studio.initialize() runs → core warns "no studio
 * loaded, project state will be empty".
 *
 * The static `import '@theatre/core'` below pins core into the bundle so
 * studio.initialize() always sees it, while the dynamic studio import keeps
 * studio out of production builds (import.meta.env.DEV is statically false
 * in production, so the branch is dead-code-eliminated).
 */

// 1. Load @theatre/core synchronously so it's registered before studio runs.
import '@theatre/core';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// 2. Initialize Theatre Studio (dev-only).
if (import.meta.env.DEV) {
  const studio = (await import('@theatre/studio')).default;
  studio.initialize();
  // eslint-disable-next-line no-console
  console.log('🎬 Theatre Studio loaded. Press Ctrl+\\ to open.');
}

// 3. Now safe to import App (transitively imports tour/theatreProject.ts,
//    which calls getProject()).
const { default: App } = await import('./App.tsx');
await import('./index.css');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
