/**
 * Returns a self-contained JS snippet that installs a fake `window.Telegram.WebApp`
 * BEFORE the app bundle runs (inject via Playwright `addInitScript`). The app captures
 * `window.Telegram?.WebApp` at module load and treats a non-empty `initData` as "inside
 * Telegram", so it sends the real `x-telegram-init-data` header and drives MainButton /
 * BackButton instead of in-page fallbacks.
 *
 * The mock is STATEFUL for MainButton/BackButton and exposes `window.__tg` so tests can
 * fire the native button callbacks (`__tg.clickMain()` / `__tg.clickBack()`) and assert
 * their state (`__tg.main.text`, `.visible`, `.active`).
 */
export function telegramMockScript(initData: string): string {
  function install(initDataStr: string): void {
    const noop = function () {};
    const main = { text: '', visible: false, active: true, progress: false };
    const back = { visible: false };
    // Real Telegram registers listeners additively (onClick stacks, offClick removes
    // the specific one), so mirror that with a Set rather than a single slot — a future
    // screen that stacks handlers then surfaces here instead of being silently hidden.
    const mainCbs = new Set<() => void>();
    const backCbs = new Set<() => void>();

    const MainButton = {
      setText(t: string) {
        main.text = t;
      },
      setParams(p: { text?: string; is_active?: boolean; is_visible?: boolean }) {
        if (p.text != null) main.text = p.text;
        if (p.is_active != null) main.active = p.is_active;
        if (p.is_visible != null) main.visible = p.is_visible;
      },
      show() {
        main.visible = true;
      },
      hide() {
        main.visible = false;
      },
      enable() {
        main.active = true;
      },
      disable() {
        main.active = false;
      },
      onClick(cb: () => void) {
        mainCbs.add(cb);
      },
      offClick(cb: () => void) {
        mainCbs.delete(cb);
      },
      showProgress() {
        main.progress = true;
      },
      hideProgress() {
        main.progress = false;
      },
    };

    const BackButton = {
      show() {
        back.visible = true;
      },
      hide() {
        back.visible = false;
      },
      onClick(cb: () => void) {
        backCbs.add(cb);
      },
      offClick(cb: () => void) {
        backCbs.delete(cb);
      },
    };

    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: initDataStr,
        initDataUnsafe: {},
        version: '7.10',
        colorScheme: 'light',
        themeParams: {},
        viewportHeight: 800,
        viewportStableHeight: 800,
        safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        isVersionAtLeast() {
          return true;
        },
        disableVerticalSwipes: noop,
        // Auto-confirm so confirmAction() proceeds in tests (the app uses showConfirm
        // for destructive actions; a real user taps "OK").
        showConfirm(_message: string, callback: (ok: boolean) => void) {
          callback(true);
        },
        ready: noop,
        expand: noop,
        onEvent: noop,
        offEvent: noop,
        setBackgroundColor: noop,
        setHeaderColor: noop,
        setBottomBarColor: noop,
        BackButton,
        MainButton,
        HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
      },
    };

    // Test harness handles for driving the native buttons from Playwright.
    (window as unknown as { __tg: unknown }).__tg = {
      main,
      back,
      clickMain() {
        if (main.visible && main.active) mainCbs.forEach((cb) => cb());
      },
      clickBack() {
        backCbs.forEach((cb) => cb());
      },
    };
  }

  return `(${install.toString()})(${JSON.stringify(initData)});`;
}
