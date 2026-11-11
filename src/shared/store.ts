/**
 * localStorage con espacio de nombres por juego. Nunca lanza (modo privado,
 * cuota llena, cookies bloqueadas…): sin persistencia el juego sigue en memoria.
 *
 * Las keys quedan como `<namespace>:<key>`. Microdle usa el namespace "microdle"
 * (el mismo de antes del refactor), así los jugadores conservan su progreso.
 */
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

export interface Store {
  load<T>(key: string, fallback: T): T;
  save<T>(key: string, value: T): void;
}

export function createStore(namespace: string): Store {
  return {
    load: (key, fallback) => readJSON(`${namespace}:${key}`, fallback),
    save: (key, value) => writeJSON(`${namespace}:${key}`, value),
  };
}
