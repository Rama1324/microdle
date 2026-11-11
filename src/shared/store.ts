/**
 * localStorage con espacio de nombres por juego. Nunca lanza (modo privado,
 * cuota llena, cookies bloqueadas…): sin persistencia el juego sigue en memoria.
 *
 * Las keys quedan como `<namespace>:<key>`. Microdle usa el namespace "microdle"
 * (el mismo de antes del refactor), así los jugadores conservan su progreso.
 */
import type { Schema } from './schema';

function ls(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readRaw(fullKey: string): string | null {
  try {
    return ls()?.getItem(fullKey) ?? null;
  } catch {
    return null;
  }
}

export function writeRaw(fullKey: string, value: string): void {
  try {
    ls()?.setItem(fullKey, value);
  } catch {
    /* sin persistencia */
  }
}

export function readJSON<T>(fullKey: string, fallback: T): T {
  const raw = readRaw(fullKey);
  if (raw == null) return fallback;
  try {
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(fullKey: string, value: unknown): void {
  writeRaw(fullKey, JSON.stringify(value));
}

export function removeRaw(fullKey: string): void {
  try {
    ls()?.removeItem(fullKey);
  } catch {
    /* sin persistencia */
  }
}

/**
 * Lee una key y la valida con un esquema. Si el JSON es inválido o no calza con
 * el esquema, borra SOLO esa key, lo avisa en consola y devuelve `fallback`.
 * Nunca lanza.
 */
export function readValid<T>(fullKey: string, schema: Schema, fallback: T): T {
  const raw = readRaw(fullKey);
  if (raw == null) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[la-once] "${fullKey}" no es JSON válido: se reinicia esa key.`);
    removeRaw(fullKey);
    return fallback;
  }
  const err = schema(parsed);
  if (err) {
    console.warn(`[la-once] "${fullKey}" con datos inválidos (${err}): se reinicia esa key.`);
    removeRaw(fullKey);
    return fallback;
  }
  return parsed as T;
}

export interface Store {
  load<T>(key: string, fallback: T): T;
  /** Carga validando contra un esquema (resetea la key si está corrupta) */
  loadValid<T>(key: string, schema: Schema, fallback: T): T;
  save<T>(key: string, value: T): void;
}

export function createStore(namespace: string): Store {
  return {
    load: (key, fallback) => readJSON(`${namespace}:${key}`, fallback),
    loadValid: (key, schema, fallback) => readValid(`${namespace}:${key}`, schema, fallback),
    save: (key, value) => writeJSON(`${namespace}:${key}`, value),
  };
}
