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
  disableVerticalSwipes?(): void;
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

// Stop Telegram's swipe-to-minimise gesture from stealing the vertical drag
// while the user scrolls a focused field above the keyboard. Bot API 7.7+ only
// (guarded), and a no-op in a plain browser / older client where the method is
// absent. Wrapped in try/catch so a client that exposes a half-implemented stub
// can't break boot.
export function disableSwipes(): void {
  if (!wa?.isVersionAtLeast?.('7.7')) return;
  // Called once at init and left off for the whole session (not scoped to a
  // focus handler): the gesture would otherwise steal vertical drags even in
  // the brief gaps between keyboard opens, and this is a form-heavy app.
  try { wa.disableVerticalSwipes?.(); } catch {}
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

// Track the on-screen keyboard via `window.visualViewport`. Telegram fires no
// keyboard event on Android and does NOT shrink the layout viewport, but the
// WebView's visual viewport *does* shrink — so the gap between `innerHeight`
// and the visual viewport (minus any pinch-zoom pan offset) is the keyboard
// height. We publish that as `--pd-keyboard-height` (px, 0 when closed) plus a
// `data-keyboard-open` flag on <html>, which the CSS uses to pad the scroll
// root and slide the fixed tabbar out of the way. We deliberately do NOT use
// `interactive-widget=resizes-content` (which would shrink the layout viewport
// and defeat this overlap signal); driving the keyboard state in JS lets us
// also slide our fixed tabbar, which the meta alone cannot do. A >120px
// threshold rejects small visual-viewport jitter that isn't a keyboard.
// Returns a cleanup that detaches listeners and clears the styling.
export function setupKeyboardTracking(): () => void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) {
    // No visualViewport (very old WebView): we can't measure the keyboard, so
    // scrollFieldIntoView falls back to centring. Flag it so the CSS restores
    // the generous scroll-margin clearance for this path (see styles.css).
    root.setAttribute('data-no-visualviewport', '');
    return () => root.removeAttribute('data-no-visualviewport');
  }
  const update = () => {
    const overlap = window.innerHeight - vv.height - vv.offsetTop;
    const keyboard = Math.max(0, Math.round(overlap));
    const open = keyboard > 120;
    root.style.setProperty('--pd-keyboard-height', `${open ? keyboard : 0}px`);
    if (open) root.setAttribute('data-keyboard-open', '');
    else root.removeAttribute('data-keyboard-open');
  };
  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    root.style.removeProperty('--pd-keyboard-height');
    root.removeAttribute('data-keyboard-open');
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
  // Drive the native MainButton ONLY in a real Telegram session. In a plain
  // browser / AUTH_DEV_BYPASS run, telegram-web-app.js makes `wa` truthy but no
  // native button is ever rendered — so we no-op here and let the in-page
  // fallbacks (gated by !hasMainButton()) be the visible CTA instead.
  if (!isTelegram || !wa) return () => {};
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

// True only when a real Telegram client is present to render the native
// MainButton. Equals `isTelegram` (non-empty initData) — NOT merely "the SDK
// object exists", which is also true in a plain browser where no button shows.
export function hasMainButton(): boolean {
  return isTelegram;
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

// onFocus handler: nudge a focused field clear of the on-screen keyboard.
// Telegram/Android don't shrink the *layout* viewport on focus, so a blind
// `scrollIntoView({block:'center'})` centres against the full pre-keyboard
// height and can leave low fields under the keyboard. Instead we measure the
// field against the *visual* viewport (which does shrink) and scroll the window
// by only the delta needed to bring it into the visible band — never more.
// Deferred ~200ms so the keyboard has finished animating in (and visualViewport
// has settled) before we measure; `behavior:'instant'` avoids fighting that
// animation. Falls back to the old centring when visualViewport is unavailable.
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

export function scrollFieldIntoView(el: HTMLElement | null): void {
  if (!el) return;
  const MARGIN = 16;
  // Cancel a pending scroll so tapping the keyboard's "Next" through several
  // fields in quick succession only ever scrolls toward the last-focused one.
  if (scrollTimer != null) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    scrollTimer = null;
    const vv = window.visualViewport;
    if (!vv) {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
      return;
    }
    const rect = el.getBoundingClientRect();
    const visibleTop = vv.offsetTop;
    const visibleBottom = vv.offsetTop + vv.height;
    let delta = 0;
    if (rect.bottom > visibleBottom - MARGIN) {
      delta = rect.bottom - (visibleBottom - MARGIN);
    } else if (rect.top < visibleTop + MARGIN) {
      delta = rect.top - (visibleTop + MARGIN);
    }
    if (delta !== 0) window.scrollBy({ top: delta, behavior: 'instant' });
  }, 200);
}
