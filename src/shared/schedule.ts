/**
 * Schedule diario APPEND-ONLY, compartido por los juegos del hub.
 *
 * - El schedule se genera con un script y se COMMITEA (public/<juego>/schedule.json).
 *   El cliente solo lo lee: nunca recalcula días publicados.
 * - Al regenerarlo, los días ya congelados (pasados, hoy y mañana) se copian tal
 *   cual del archivo anterior. Solo se recalculan los días futuros, así que agregar
 *   o quitar ítems de los datos nunca cambia un puzzle ya publicado.
 * - Cada día es una lista de ids (Microdle: 1 recorrido; Caro: la cadena de ítems)
 *   guardada como token ofuscado por día: el repo y el bundle no traen las
 *   respuestas en texto plano. Es ofuscación, no seguridad.
 */
import { hashString, mulberry32 } from './rng';

export interface ScheduleFile {
  version: 1;
  game: string;
  /** Fecha ISO del día 0 */
  epoch: string;
  /** Último día (índice) congelado: no puede cambiar en futuras regeneraciones */
  frozenThrough: number;
  /** Fecha ISO en que se generó (informativo) */
  generatedOn: string;
  /** days[i] = token del día i */
  days: string[];
}

// ---------- ofuscación ----------
const te = new TextEncoder();
const td = new TextDecoder();

function keystream(salt: string, day: number, n: number): number[] {
  const r = mulberry32(hashString(`${salt}#${day}`));
  return Array.from({ length: n }, () => Math.floor(r() * 256));
}

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str: string): Uint8Array {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

export function encodeEntry(ids: string[], day: number, salt: string): string {
  const bytes = te.encode(ids.join('\n'));
  const ks = keystream(salt, day, bytes.length);
  return toB64url(bytes.map((b, i) => b ^ ks[i]));
}

export function decodeEntry(token: string, day: number, salt: string): string[] {
  const bytes = fromB64url(token);
  const ks = keystream(salt, day, bytes.length);
  return td.decode(bytes.map((b, i) => b ^ ks[i])).split('\n');
}

/** Entrada de un día, o null si el schedule no lo cubre. */
export function entryForDay(file: ScheduleFile, day: number, salt: string): string[] | null {
  const tok = file.days[day];
  return tok ? decodeEntry(tok, day, salt) : null;
}

// ---------- generación ----------
export interface GenerateContext {
  /** PRNG determinístico para este día */
  rng: () => number;
  /** Entradas de todos los días anteriores (decodificadas), en orden */
  history: string[][];
}

export interface ExtendOptions {
  prev: ScheduleFile | null;
  game: string;
  epoch: string;
  salt: string;
  /** Índice de "hoy" en el calendario de Santiago */
  today: number;
  /** Días después de hoy que también se congelan (default 1 = mañana) */
  freezeAhead?: number;
  /** Cuántos días hacia adelante cubrir (default 365) */
  horizon?: number;
  /** Para días congelados que no están en `prev` (p. ej. migración desde un algoritmo anterior) */
  bootstrap?: (day: number) => string[] | null;
  generate: (day: number, ctx: GenerateContext) => string[];
  generatedOn: string;
}

export interface ExtendResult {
  file: ScheduleFile;
  /** Días copiados sin cambios desde `prev` */
  kept: number;
  /** Días congelados que se generaron por primera vez */
  newlyFrozen: number;
}

export function extendSchedule(o: ExtendOptions): ExtendResult {
  const { prev, salt } = o;
  if (prev) {
    if (prev.game !== o.game) throw new Error(`Schedule de "${prev.game}", se esperaba "${o.game}"`);
    if (prev.epoch !== o.epoch) throw new Error(`El epoch cambió (${prev.epoch} → ${o.epoch}): rompería días publicados`);
  }
  // Nunca se descongela: si el reloj está atrasado, respetamos lo ya congelado
  const frozenThrough = Math.max(prev?.frozenThrough ?? -1, o.today + (o.freezeAhead ?? 1));
  const last = Math.max(frozenThrough, o.today + (o.horizon ?? 365));

  const days: string[] = [];
  const history: string[][] = [];
  let kept = 0;
  let newlyFrozen = 0;

  for (let d = 0; d <= last; d++) {
    let token: string | undefined;
    if (d <= frozenThrough && prev?.days[d]) {
      token = prev.days[d];
      kept++;
    } else {
      const ids =
        (d <= frozenThrough ? o.bootstrap?.(d) : null) ??
        o.generate(d, { rng: mulberry32(hashString(`${salt}:gen:${d}`)), history });
      token = encodeEntry(ids, d, salt);
      if (d <= frozenThrough) newlyFrozen++;
    }
    days.push(token);
    history.push(decodeEntry(token, d, salt));
  }

  return {
    file: { version: 1, game: o.game, epoch: o.epoch, frozenThrough, generatedOn: o.generatedOn, days },
    kept,
    newlyFrozen,
  };
}

/**
 * Elige un id que no haya salido desde que se agotó la lista por última vez
 * ("no se repite hasta agotar"). `pool` debe venir ordenado.
 */
export function pickNoRepeat(pool: string[], history: string[][], rng: () => number): string {
  const inPool = new Set(pool);
  let used = new Set<string>();
  for (const entry of history) {
    for (const id of entry) {
      if (!inPool.has(id)) continue;
      used.add(id);
      if (used.size >= inPool.size) used = new Set();
    }
  }
  const candidates = pool.filter((id) => !used.has(id));
  const list = candidates.length ? candidates : pool;
  return list[Math.floor(rng() * list.length)];
}
