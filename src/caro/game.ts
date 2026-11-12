/**
 * Reglas de "¿Qué sale más caro?" (sin DOM, testeable).
 */
import type { CaroItem, Guess, PricedRef } from './types';
import { DAILY_ROUNDS } from './types';
import type { GenerateContext } from '../shared/schedule';
import { GAMES } from '../shared/config';
import { shareUrl } from '../shared/share';
import { mulberry32 } from '../shared/rng';

export const CARO_EPOCH = GAMES.caro.epoch;
/** Sal de ofuscación del schedule de Caro (no es secreta: el repo es público) */
export const CARO_SALT = 'caro-cl';

/** Diferencia mínima entre dos precios para compararlos (10%): menos que eso es azar. */
export const MIN_RATIO = 1.1;

export function farEnough(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.max(a, b) / Math.min(a, b) >= MIN_RATIO;
}

/** ¿Acertó? Si los precios son iguales, cualquier respuesta vale. */
export function isCorrect(a: number, b: number, guess: Guess): boolean {
  if (a === b) return true;
  return guess === 'higher' ? b > a : b < a;
}

const clp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

/** 1299990 → "$1.299.990" */
export function formatCLP(n: number): string {
  return `$${clp.format(Math.round(n))}`;
}

/**
 * Comparación absurda: "Con lo que cuesta [caro], te compras N × [barato]".
 * Si la diferencia es chica, se dice en porcentaje.
 */
export function absurdPhrase(a: Pick<CaroItem, 'item' | 'precio'>, b: Pick<CaroItem, 'item' | 'precio'>): string {
  if (a.precio === b.precio) return `${a.item} y ${b.item} cuestan exactamente lo mismo.`;
  const [big, small] = a.precio > b.precio ? [a, b] : [b, a];
  const n = Math.floor(big.precio / small.precio);
  if (n >= 2) return `Con lo que cuesta ${big.item} te compras ${clp.format(n)} × ${small.item}.`;
  const pct = Math.round((big.precio / small.precio - 1) * 100);
  return `${big.item} cuesta un ${pct}% más que ${small.item}.`;
}

// ---------- secuencias ----------

/**
 * Cadena de `length` ítems distintos donde cada par consecutivo difiere ≥10%.
 * Determinística dado `rng`. Devuelve null si no es posible con este pool.
 */
export function buildChain(
  pool: PricedRef[],
  length: number,
  rng: () => number,
  avoid: Set<string> = new Set(),
): PricedRef[] | null {
  if (pool.length < length) return null;
  const preferred = pool.filter((p) => !avoid.has(p.id));
  for (let attempt = 0; attempt < 60; attempt++) {
    const source = attempt < 40 && preferred.length >= length ? preferred : pool;
    const chain: PricedRef[] = [source[Math.floor(rng() * source.length)]];
    const used = new Set([chain[0].id]);
    while (chain.length < length) {
      const last = chain[chain.length - 1];
      const next = pickDirected(source, last, used, rng);
      if (!next) break;
      chain.push(next);
      used.add(next.id);
    }
    if (chain.length === length) return chain;
  }
  return null;
}

/**
 * Elige el siguiente ítem decidiendo PRIMERO al azar (50/50) si será más caro o más
 * barato, y recién después cuál. Sin esto, un paseo aleatorio tiende a alternar
 * (tras algo caro casi todo es más barato) y "responder lo contrario de la vez
 * anterior" se vuelve una estrategia ganadora.
 */
function pickDirected(pool: PricedRef[], last: PricedRef, used: Set<string>, rng: () => number): PricedRef | null {
  const ok = pool.filter((p) => !used.has(p.id) && p.id !== last.id && farEnough(p.precio, last.precio));
  if (!ok.length) return null;
  const up = ok.filter((p) => p.precio > last.precio);
  const down = ok.filter((p) => p.precio < last.precio);
  const wantUp = rng() < 0.5;
  const list = (wantUp ? up : down).length ? (wantUp ? up : down) : wantUp ? down : up;
  return list[Math.floor(rng() * list.length)];
}

/** Pool ordenado por id (el schedule es determinístico). */
export function pricedPool(items: CaroItem[]): PricedRef[] {
  return items
    .map((i) => ({ id: i.id, precio: i.precio }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Entrada del schedule: "id@precio" (el precio queda congelado para ese día). */
export const encodeRef = (r: PricedRef) => `${r.id}@${r.precio}`;
export function decodeRef(s: string): PricedRef {
  const at = s.lastIndexOf('@');
  return { id: s.slice(0, at), precio: Number(s.slice(at + 1)) };
}

/** Generador de días futuros: 11 ítems (10 comparaciones), evitando los de ayer. */
export function generateCaroDay(pool: PricedRef[]) {
  return (day: number, ctx: GenerateContext): string[] => {
    const yesterday = new Set((ctx.history[day - 1] ?? []).map((s) => decodeRef(s).id));
    const chain = buildChain(pool, DAILY_ROUNDS + 1, ctx.rng, yesterday);
    if (!chain) throw new Error(`No se puede armar el día ${day}: faltan ítems verificados con precios distintos`);
    return chain.map(encodeRef);
  };
}

/** Siguiente ítem del modo infinito: no repetido en la partida (hasta agotar) y ≥10% de diferencia. */
export function nextInfinite(pool: PricedRef[], current: PricedRef, used: Set<string>, rng = Math.random): PricedRef | null {
  return pickDirected(pool, current, used, rng) ?? pickDirected(pool, current, new Set(), rng);
}

/** Semilla aleatoria para el infinito (no afecta al diario). */
export const randomRng = () => mulberry32(Math.floor(Math.random() * 2 ** 32));

// ---------- compartir ----------

export function buildCaroShare(opts: { number: number; results: boolean[] }): string {
  const score = opts.results.filter(Boolean).length;
  const squares = opts.results.map((r) => (r ? '🟩' : '🟥')).join('');
  return [`¿Qué sale más caro? #${opts.number} 💸 ${score}/${DAILY_ROUNDS}`, squares, shareUrl(GAMES.caro.path)].join('\n');
}
