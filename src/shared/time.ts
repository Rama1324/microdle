/** Calendario diario en hora de Chile, compartido por todos los juegos del hub. */
export const TZ = 'America/Santiago';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function santiagoParts(d = new Date()) {
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** "2026-11-09" → ms UTC de esa fecha a medianoche UTC (solo para aritmética de días). */
function isoToUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Fecha de hoy en Santiago como "YYYY-MM-DD". */
export function santiagoISO(now = new Date()): string {
  const p = santiagoParts(now);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Índice de día respecto de `epoch` (0 = día del lanzamiento) en el calendario de Santiago. */
export function dayIndex(epoch: string, now = new Date()): number {
  return Math.round((isoToUtc(santiagoISO(now)) - isoToUtc(epoch)) / 86_400_000);
}

/** Fecha ISO de un índice de día. */
export function dateForDay(epoch: string, day: number): string {
  return new Date(isoToUtc(epoch) + day * 86_400_000).toISOString().slice(0, 10);
}

/** Días entre dos fechas ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((isoToUtc(b) - isoToUtc(a)) / 86_400_000);
}

/** Número público del puzzle (#1, #2, …). */
export const puzzleNumber = (day: number) => day + 1;

/** Milisegundos hasta la próxima medianoche en Santiago (maneja cambios de horario). */
export function msUntilNextDay(now = new Date()): number {
  const today = santiagoISO(now);
  const p = santiagoParts(now);
  let ms = ((23 - p.hour) * 3600 + (59 - p.minute) * 60 + (60 - p.second)) * 1000 - now.getMilliseconds();
  if (santiagoISO(new Date(now.getTime() + ms)) === today) {
    // Chile cambia la hora a medianoche: la "medianoche" puede llegar antes o después
    for (const delta of [3600_000, -3600_000]) {
      if (santiagoISO(new Date(now.getTime() + ms + delta)) !== today) {
        ms += delta;
        break;
      }
    }
  }
  return Math.max(0, ms);
}

export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
