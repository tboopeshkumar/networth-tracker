import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { applyStoredTheme } from './hooks/useTheme';
import './styles/app.css';

applyStoredTheme();

// Keeps the app's files on the device, so opening it is instant (sw/service-worker.js).
// Production only: the dev server serves changing, unhashed files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    // updateViaCache: GitHub Pages caches files for 10 minutes; a new sw.js shouldn't wait for that
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' }).catch(() => { /* runs without it */ });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
