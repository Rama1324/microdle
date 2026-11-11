/**
 * localStorage corrupto: si una key no calza con su esquema se reinicia SOLO esa
 * key, se avisa en consola y nada lanza. Las demás keys quedan intactas.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
};
const warns: string[] = [];
console.warn = (...a: unknown[]) => void warns.push(a.join(' '));

const { loadDaily, loadPractice, loadSettings, MICRO_STATS } = await import('../src/micro/state');
const { getStats } = await import('../src/shared/stats');
const { globalStreak, recordDailyPlayed } = await import('../src/shared/activity');

const GOOD_STATS = JSON.stringify({ played: 3, wins: 2, currentStreak: 1, maxStreak: 2, dist: [0, 1, 1, 0, 0, 0], lastWinDay: 1, lastRecordedDay: 1 });

beforeEach(() => {
  mem.clear();
  warns.length = 0;
});

const CORRUPT_DAILY = [
  '{"day":2,"guesses":123,"status":"playing"}',
  '{"day":2,"guesses":null,"status":"won"}',
  '{"day":"2","guesses":[],"status":"playing"}',
  '{"day":2,"guesses":[1,2],"status":"playing"}',
  '{"day":2,"guesses":[],"status":"ganado"}',
  '[]',
  '"texto"',
  '{corrupto',
];

for (const raw of CORRUPT_DAILY) {
  test(`daily corrupto ${raw} → partida nueva, solo se borra esa key`, () => {
    mem.set('microdle:daily', raw);
    mem.set('microdle:stats', GOOD_STATS);
    const d = loadDaily(2);
    assert.deepEqual(d, { day: 2, guesses: [], status: 'playing' });
    assert.equal(mem.has('microdle:daily'), false, 'la key corrupta se borra');
    assert.equal(mem.get('microdle:stats'), GOOD_STATS, 'las otras keys quedan intactas');
    assert.equal(warns.length, 1, 'se loguea una advertencia');
  });
}

test('stats con tipos incorrectos → stats en cero, sin NaN', () => {
  mem.set('microdle:stats', '{"played":"x","wins":1,"dist":"abc"}');
  const s = getStats(MICRO_STATS, 2);
  assert.equal(s.played, 0);
  assert.deepEqual(s.dist, [0, 0, 0, 0, 0, 0]);
  assert.equal(mem.has('microdle:stats'), false);
});

test('stats válidas del formato viejo (sin totalScore) no se tocan', () => {
  mem.set('microdle:stats', GOOD_STATS);
  assert.equal(getStats(MICRO_STATS, 2).played, 3);
  assert.equal(mem.get('microdle:stats'), GOOD_STATS);
  assert.equal(warns.length, 0);
});

test('practice y settings corruptos se reinician', () => {
  mem.set('microdle:practice', '{"a":5}');
  mem.set('microdle:settings', '{"seenHelp":"sí"}');
  assert.equal(loadPractice(), null);
  assert.deepEqual(loadSettings(), { seenHelp: false, showGuesses: true });
  assert.equal(mem.size, 0);
});

test('hub:activity corrupto → racha 0 y se puede volver a registrar', () => {
  mem.set('hub:activity', '{"days":{"2026-11-10":"micro"}}');
  assert.equal(globalStreak(new Date('2026-11-11T15:00:00Z')), 0);
  recordDailyPlayed('micro', '2026-11-11');
  assert.equal(globalStreak(new Date('2026-11-11T15:00:00Z')), 1);
});

test('la racha global usa la fecha del puzzle, no la de terminar', () => {
  // partida del 11 terminada a las 00:00:30 del 12
  recordDailyPlayed('micro', '2026-11-11');
  const a = JSON.parse(mem.get('hub:activity')!);
  assert.deepEqual(Object.keys(a.days), ['2026-11-11']);
});

test('localStorage que lanza en cada acceso no rompe nada', () => {
  const real = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  try {
    assert.deepEqual(loadDaily(2).guesses, []);
    assert.equal(getStats(MICRO_STATS, 2).played, 0);
    recordDailyPlayed('micro', '2026-11-11');
  } finally {
    (globalThis as any).localStorage = real;
  }
});
