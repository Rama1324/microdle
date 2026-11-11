import { readJSON, readRaw, writeRaw } from './store';

export type ThemeSetting = 'auto' | 'light' | 'dark';

/** Key del tema, común a todo el hub. */
export const THEME_KEY = 'hub:theme';
/** Antes del refactor, Microdle guardaba el tema en microdle:settings.theme */
export const LEGACY_SETTINGS_KEY = 'microdle:settings';

const valid = (t: unknown): t is ThemeSetting => t === 'auto' || t === 'light' || t === 'dark';

/** Lee el tema guardado; si no hay, migra desde la key vieja de Microdle. */
export function getThemeSetting(): ThemeSetting {
  const raw = readRaw(THEME_KEY);
  if (valid(raw)) return raw;
  const legacy = readJSON<{ theme?: unknown }>(LEGACY_SETTINGS_KEY, {}).theme;
  if (valid(legacy)) {
    writeRaw(THEME_KEY, legacy);
    return legacy;
  }
  return 'auto';
}

export function setThemeSetting(t: ThemeSetting) {
  writeRaw(THEME_KEY, t);
  applyTheme();
}

const mql = () => (typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined);

export function effectiveTheme(setting = getThemeSetting()): 'light' | 'dark' {
  return setting === 'auto' ? (mql()?.matches ? 'dark' : 'light') : setting;
}

const listeners = new Set<(t: 'light' | 'dark') => void>();

export function onThemeChange(fn: (t: 'light' | 'dark') => void) {
  listeners.add(fn);
}

export function applyTheme() {
  const t = effectiveTheme();
  document.documentElement.dataset.theme = t;
  listeners.forEach((fn) => fn(t));
}

/** Inicializa el tema y escucha cambios del sistema cuando está en "auto". */
export function initTheme() {
  applyTheme();
  mql()?.addEventListener?.('change', () => getThemeSetting() === 'auto' && applyTheme());
}

/** Conecta un grupo de radios name="theme" al ajuste. */
export function bindThemeRadios(root: ParentNode = document) {
  root.querySelectorAll<HTMLInputElement>('input[name=theme]').forEach((r) => {
    r.checked = r.value === getThemeSetting();
    r.addEventListener('change', () => r.checked && setThemeSetting(r.value as ThemeSetting));
  });
}
