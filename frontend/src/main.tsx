import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getInitialTheme, getSystemTheme, THEME_STORAGE_KEY } from "./lib/theme";

applyTheme(getInitialTheme());
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
systemTheme.addEventListener("change", () => {
  if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
    applyTheme(getSystemTheme());
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(reg => {
        // optional: listen for updates
        console.log('ServiceWorker registered:', reg.scope);
      })
      .catch(err => console.warn('ServiceWorker registration failed:', err));
  });
}
