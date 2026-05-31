// Thin wrapper around the Telegram WebApp SDK (loaded via telegram-web-app.js).
// Everything degrades gracefully when opened in a plain browser for local dev.

interface TgWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: {
    setText(t: string): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
  };
  HapticFeedback?: { impactOccurred(style: string): void; notificationOccurred(type: string): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const wa = window.Telegram?.WebApp;

export const isTelegram = Boolean(wa && wa.initData);

/** Raw signed initData string (empty when not inside Telegram). */
export function initData(): string {
  return wa?.initData ?? '';
}

export function ready(): void {
  wa?.ready();
  wa?.expand();
}

export const colorScheme: 'light' | 'dark' = wa?.colorScheme ?? 'light';

/** Apply Telegram theme params as CSS variables so styling matches the client. */
export function applyTheme(): void {
  const p = wa?.themeParams ?? {};
  const root = document.documentElement;
  const map: Record<string, string> = {
    '--tg-bg': p.bg_color ?? (colorScheme === 'dark' ? '#17212b' : '#ffffff'),
    '--tg-text': p.text_color ?? (colorScheme === 'dark' ? '#f5f5f5' : '#1a1a1a'),
    '--tg-hint': p.hint_color ?? '#8a8f99',
    '--tg-link': p.link_color ?? '#2f7bf6',
    '--tg-button': p.button_color ?? '#2f7bf6',
    '--tg-button-text': p.button_text_color ?? '#ffffff',
    '--tg-secondary-bg': p.secondary_bg_color ?? (colorScheme === 'dark' ? '#232e3c' : '#f1f3f6'),
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);
  root.dataset.theme = colorScheme;
}

export function showBackButton(cb: () => void): () => void {
  if (!wa) return () => {};
  wa.BackButton.onClick(cb);
  wa.BackButton.show();
  return () => {
    wa.BackButton.offClick(cb);
    wa.BackButton.hide();
  };
}

export function haptic(type: 'success' | 'warning' | 'error' = 'success'): void {
  wa?.HapticFeedback?.notificationOccurred(type);
}
