import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { disableSwipes, expandViewport, ready, setupKeyboardTracking, syncTelegramEnvironment } from './tg.js';
import './pairdesk-tokens.css';
import './styles.css';

const cleanupTelegram = syncTelegramEnvironment();
const cleanupKeyboard = setupKeyboardTracking();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

requestAnimationFrame(() => {
  ready();
  expandViewport();
  disableSwipes();
});

window.addEventListener(
  'pagehide',
  () => {
    cleanupTelegram();
    cleanupKeyboard();
  },
  { once: true },
);
