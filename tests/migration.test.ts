/**
 * Un usuario que jugó Microdle ANTES del refactor (keys viejas "microdle:*",
 * tema guardado dentro de microdle:settings) conserva todo después.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage en memoria, igual al del navegador
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
}
const storage = new MemoryStorage();
(globalThis as any).localStorage = storage;

const { getThemeSetting, THEME_KEY } = await import('../src/shared/theme');
const { THEME_INLINE_SCRIPT } = await import('../src/shared/theme-inline');
const { loadSettings, saveSettings, loadDaily, MICRO_STATS } = await import('../src/micro/state');
const { getStats, recordResult } = await import('../src/shared/stats');

const TODAY = 2;
const OLD_STATS = {
  played: 7,
  wins: 6,
  currentStreak: 3,
  maxStreak: 4,
  dist: [0, 1, 2, 2, 1, 0],
  lastWinDay: TODAY - 1,
  lastRecordedDay: TODAY - 1,
};

/** Exactamente lo que guardaba la versión anterior (commit 415eb47) */
function seedLegacyUser() {
  storage.clear();
  storage.setItem('microdle:settings', JSON.stringify({ theme: 'dark', seenHelp: true, showGuesses: false }));
  storage.setItem('microdle:stats', JSON.stringify(OLD_STATS));
  storage.setItem('microdle:daily', JSON.stringify({ day: TODAY, guesses: ['210', 'B27'], status: 'playing' }));
  storage.setItem('microdle:practice', JSON.stringify({ a: 'xyz', guesses: [], status: 'playing' }));
}

beforeEach(seedLegacyUser);

test('el tema guardado con la key vieja se conserva y se migra a hub:theme', () => {
  assert.equal(storage.getItem(THEME_KEY), null);
  assert.equal(getThemeSetting(), 'dark');
  assert.equal(storage.getItem(THEME_KEY), 'dark', 'queda migrado a la key nueva');
  assert.equal(getThemeSetting(), 'dark');
});

test('el script inline (antes de pintar) también lee el tema viejo', () => {
  const doc = { documentElement: { dataset: {} as Record<string, string> } };
  new Function('localStorage', 'document', 'window', 'matchMedia', THEME_INLINE_SCRIPT)(
    storage,
    doc,
    { matchMedia: () => ({ matches: false }) },
    () => ({ matches: false }),
  );
  assert.equal(doc.documentElement.dataset.theme, 'dark');
});

test('si ya existe hub:theme, manda sobre la key vieja', () => {
  storage.setItem(THEME_KEY, 'light');
  assert.equal(getThemeSetting(), 'light');
});

test('las estadísticas viejas se leen intactas', () => {
  const s = getStats(MICRO_STATS, TODAY);
  assert.equal(s.played, 7);
  assert.equal(s.wins, 6);
  assert.equal(s.currentStreak, 3, 'racha viva (ganó ayer)');
  assert.equal(s.maxStreak, 4);
  assert.deepEqual(s.dist, [0, 1, 2, 2, 1, 0]);
});

test('ganar hoy continúa la racha vieja', () => {
  const s = recordResult(MICRO_STATS, TODAY, { won: true, bucket: 3, score: 4 });
  assert.equal(s.played, 8);
  assert.equal(s.currentStreak, 4);
  assert.equal(s.maxStreak, 4);
  assert.deepEqual(s.dist, [0, 1, 2, 3, 1, 0]);
});

test('ajustes y partida en curso se conservan', () => {
  assert.deepEqual(loadSettings(), { seenHelp: true, showGuesses: false });
  assert.deepEqual(loadDaily(TODAY).guesses, ['210', 'B27']);
});

test('guardar ajustes no borra el tema viejo (por si queda una versión cacheada)', () => {
  saveSettings({ seenHelp: true, showGuesses: true });
  const raw = JSON.parse(storage.getItem('microdle:settings')!);
  assert.equal(raw.theme, 'dark');
  assert.equal(raw.showGuesses, true);
});
