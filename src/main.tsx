import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Placeholder only. The UI is phase 4 — the engine and its distributions come
// first. This file exists so the build toolchain is verifiable from phase 1.
function App() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 font-mono text-sm">
      <h1 className="text-base font-semibold">Football Career</h1>
      <p className="mt-2 opacity-70">Engine under construction. No UI until phase 4.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
