// Thin wrapper around the Telegram WebApp SDK (loaded via telegram-web-app.js).
// Everything degrades gracefully when opened in a plain browser for local dev.

interface TgWebApp {
  initData: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>;
  contentSafeAreaInset?: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>;
  isVersionAtLeast?(version: string): boolean;
  ready(): void;
  expand(): void;
  onEvent?(eventType: string, cb: () => void): void;
  offEvent?(eventType: string, cb: () => void): void;
  setBackgroundColor?(color: string): void;
  setHeaderColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton: {
    setText(t: string): void;
    setParams?(params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
  };
  HapticFeedback?: {
    impactOccurred(style: string): void;
    notificationOccurred(type: string): void;
    selectionChanged(): void;
  };
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
}

export function expandViewport(): void {
  wa?.expand();
  applyViewport();
}

function colorScheme(): 'light' | 'dark' {
  return wa?.colorScheme ?? 'light';
}

export function getThemeParams(): Record<string, string> {
  return wa?.themeParams ?? {};
}

/** Apply Telegram theme params as CSS variables so styling matches the client. */
export function applyTheme(): void {
  const p = getThemeParams();
  const root = document.documentElement;
  const scheme = colorScheme();
  const map: Record<string, string> = {
    '--tg-bg': p.bg_color ?? (scheme === 'dark' ? '#17212b' : '#ffffff'),
    '--tg-text': p.text_color ?? (scheme === 'dark' ? '#f5f5f5' : '#1a1a1a'),
    '--tg-hint': p.hint_color ?? '#8a8f99',
    '--tg-link': p.link_color ?? '#2f7bf6',
    '--tg-button': p.button_color ?? '#2f7bf6',
    '--tg-button-text': p.button_text_color ?? '#ffffff',
    '--tg-secondary-bg': p.secondary_bg_color ?? (scheme === 'dark' ? '#232e3c' : '#f1f3f6'),
    '--tg-header-bg': p.header_bg_color ?? p.bg_color ?? (scheme === 'dark' ? '#17212b' : '#ffffff'),
    '--tg-bottom-bar-bg': p.bottom_bar_bg_color ?? p.secondary_bg_color ?? p.bg_color ?? (scheme === 'dark' ? '#17212b' : '#ffffff'),
    '--tg-section-bg': p.section_bg_color ?? p.secondary_bg_color ?? (scheme === 'dark' ? '#232e3c' : '#f1f3f6'),
    '--tg-subtitle': p.subtitle_text_color ?? p.hint_color ?? '#8a8f99',
    '--tg-destructive': p.destructive_text_color ?? '#ef4444',
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);
  root.dataset.theme = scheme;
  setChromeColors(map);
}

function applyViewport(): void {
  const root = document.documentElement;
  if (wa?.viewportHeight != null) root.style.setProperty('--tg-viewport-height', `${wa.viewportHeight}px`);
  if (wa?.viewportStableHeight != null) root.style.setProperty('--tg-viewport-stable-height', `${wa.viewportStableHeight}px`);
}

function applyInset(prefix: string, inset?: Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>): void {
  const root = document.documentElement;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = inset?.[side] ?? 0;
    root.style.setProperty(`--tg-${prefix}-area-inset-${side}`, `${value}px`);
  }
}

function applySafeAreas(): void {
  applyInset('safe', wa?.safeAreaInset);
  applyInset('content-safe', wa?.contentSafeAreaInset);
}

function setChromeColors(theme: Record<string, string>): void {
  const bg = theme['--tg-bg'];
  const header = theme['--tg-header-bg'] ?? bg;
  const bottom = theme['--tg-bottom-bar-bg'] ?? bg;
  try { if (bg && wa?.setBackgroundColor) wa.setBackgroundColor(bg); } catch {}
  try { if (header && wa?.setHeaderColor) wa.setHeaderColor(header); } catch {}
  try { if (bottom && wa?.setBottomBarColor) wa.setBottomBarColor(bottom); } catch {}
}

export function syncTelegramEnvironment(): () => void {
  const syncAll = () => {
    applyTheme();
    applyViewport();
    applySafeAreas();
  };
  syncAll();
  const handlers: Array<[string, () => void]> = [
    ['themeChanged', syncAll],
    ['viewportChanged', syncAll],
    ['safeAreaChanged', syncAll],
    ['contentSafeAreaChanged', syncAll],
  ];
  for (const [event, cb] of handlers) wa?.onEvent?.(event, cb);
  return () => {
    for (const [event, cb] of handlers) wa?.offEvent?.(event, cb);
  };
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

// Telegram exposes a single MainButton. React effects re-run the setter on every
// keystroke (text/enabled change with the form), and React runs an effect's
// cleanup *before* the next setup. A cleanup that calls hide() therefore produces
// a hide()→show() flicker on each re-run. We avoid it by (a) tracking the one
// active onClick so re-registration never stacks handlers, and (b) deferring the
// hide one frame so an immediately-following setMainButton can cancel it — a real
// teardown (navigating to a screen with no MainButton) still hides next frame.
//
// SINGLE-CONSUMER ASSUMPTION: at most one MainButton consumer is mounted at a
// time. The App renders exactly one screen (OrderDetail replaces the tab content
// via an early return), and within a screen the button-owning branches are
// mutually exclusive by state. If that ever changes (a composite screen mounting
// two consumers), the deferred hide from screen A's cleanup could offClick/hide
// screen B's still-active button — switch this module to a small refcount then.
let activeOnClick: (() => void) | null = null;
let pendingHide: number | null = null;

export function setMainButton({
  text,
  onClick,
  enabled = true,
  loading = false,
}: {
  text: string;
  onClick: () => void;
  enabled?: boolean;
  loading?: boolean;
}): () => void {
  if (!wa) return () => {};
  const button = wa.MainButton;
  if (pendingHide != null) { cancelAnimationFrame(pendingHide); pendingHide = null; }
  if (activeOnClick) button.offClick(activeOnClick);
  activeOnClick = onClick;
  button.setText(text);
  button.setParams?.({
    text,
    color: getComputedStyle(document.documentElement).getPropertyValue('--pd-accent').trim() || undefined,
    text_color: getComputedStyle(document.documentElement).getPropertyValue('--pd-accent-text').trim() || undefined,
    is_active: enabled,
    is_visible: true,
  });
  if (enabled) button.enable(); else button.disable();
  if (loading) button.showProgress(false); else button.hideProgress();
  button.onClick(onClick);
  button.show();
  return () => {
    if (pendingHide != null) cancelAnimationFrame(pendingHide);
    pendingHide = requestAnimationFrame(() => {
      pendingHide = null;
      if (activeOnClick) { button.offClick(activeOnClick); activeOnClick = null; }
      button.hideProgress();
      button.hide();
    });
  };
}

export function hasMainButton(): boolean {
  return Boolean(wa);
}

export function hapticSelection(): void {
  wa?.HapticFeedback?.selectionChanged();
}

export function hapticSuccess(): void {
  wa?.HapticFeedback?.notificationOccurred('success');
}

export function hapticError(): void {
  wa?.HapticFeedback?.notificationOccurred('error');
}

export function haptic(type: 'success' | 'warning' | 'error' = 'success'): void {
  wa?.HapticFeedback?.notificationOccurred(type);
}
