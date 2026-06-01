import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { expandViewport, ready, syncTelegramEnvironment } from './tg.js';
import './pairdesk-tokens.css';
import './styles.css';

const cleanupTelegram = syncTelegramEnvironment();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

requestAnimationFrame(() => {
  ready();
  expandViewport();
});

window.addEventListener('pagehide', cleanupTelegram, { once: true });
