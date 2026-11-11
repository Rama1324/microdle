/**
 * Dos usuarios el mismo día ven exactamente el mismo puzzle, aunque sus
 * dispositivos tengan otra zona horaria, otro idioma o distinto localStorage.
 * Cada "usuario" corre en un proceso aparte con su propia TZ del sistema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dayIndex, msUntilNextDay, santiagoISO } from '../src/shared/time';
import { answerForDay, MICRO_EPOCH } from '../src/micro/game/daily';
import type { RoutesFile } from '../src/micro/types';
import type { ScheduleFile } from '../src/shared/schedule';

const routes: RoutesFile = JSON.parse(readFileSync('public/micro/routes.json', 'utf8'));
const schedule: ScheduleFile = JSON.parse(readFileSync('public/micro/schedule.json', 'utf8'));

/** Puzzle que vería un dispositivo con zona horaria `tz` en el instante `iso`. */
function puzzleOnDevice(tz: string, iso: string, lang = 'es-CL'): { day: number; answer: string; date: string } {
  const code = `
    const { dayIndex, santiagoISO } = await import('./src/shared/time.ts');
    const { answerForDay, MICRO_EPOCH } = await import('./src/micro/game/daily.ts');
    const fs = await import('node:fs');
    const routes = JSON.parse(fs.readFileSync('public/micro/routes.json', 'utf8'));
    const sched = JSON.parse(fs.readFileSync('public/micro/schedule.json', 'utf8'));
    const now = new Date(${JSON.stringify(iso)});
    const day = dayIndex(MICRO_EPOCH, now);
    console.log(JSON.stringify({ day, answer: answerForDay(routes.routes, sched, day).id, date: santiagoISO(now) }));
  `;
  const out = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    env: { ...process.env, TZ: tz, LANG: lang, LC_ALL: lang },
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop()!);
}

const INSTANTS = [
  '2026-11-11T15:00:00Z', // tarde en Chile
  '2026-11-12T02:59:59Z', // 23:59:59 en Chile (UTC-3)
  '2026-11-12T03:00:00Z', // 00:00:00 en Chile: cambia el puzzle
  '2027-04-04T03:30:00Z', // noche del cambio a horario de invierno
];

test('dos dispositivos en zonas horarias distintas ven el mismo puzzle en el mismo instante', () => {
  for (const iso of INSTANTS) {
    const a = puzzleOnDevice('Asia/Tokyo', iso, 'ja-JP');
    const b = puzzleOnDevice('America/Los_Angeles', iso, 'en-US');
    const c = puzzleOnDevice('America/Santiago', iso);
    assert.deepEqual(a, b, `Tokio vs Los Ángeles en ${iso}`);
    assert.deepEqual(a, c, `Tokio vs Santiago en ${iso}`);
  }
});

test('el puzzle cambia exactamente a las 00:00 de Santiago', () => {
  const before = new Date('2026-11-12T02:59:59Z'); // 23:59:59 CLST
  const after = new Date('2026-11-12T03:00:00Z'); // 00:00:00 CLST
  assert.equal(dayIndex(MICRO_EPOCH, after) - dayIndex(MICRO_EPOCH, before), 1);
  assert.equal(santiagoISO(before), '2026-11-11');
  assert.equal(santiagoISO(after), '2026-11-12');
  assert.equal(msUntilNextDay(before), 1000);
  assert.notEqual(
    answerForDay(routes.routes, schedule, dayIndex(MICRO_EPOCH, before)).id,
    answerForDay(routes.routes, schedule, dayIndex(MICRO_EPOCH, after)).id,
  );
});

test('dos usuarios con distinto localStorage reciben la misma respuesta (no depende del estado local)', () => {
  const day = dayIndex(MICRO_EPOCH, new Date('2026-11-11T15:00:00Z'));
  const u1 = answerForDay(routes.routes, schedule, day).id;
  (globalThis as any).localStorage = { getItem: () => '{corrupto', setItem: () => {} };
  const u2 = answerForDay(routes.routes, schedule, day).id;
  delete (globalThis as any).localStorage;
  assert.equal(u1, u2);
});
