const PREFIX = 'microdle:';

/** localStorage envuelto: nunca lanza (modo privado, cuota llena, cookies bloqueadas…). */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* sin persistencia: el juego sigue funcionando en memoria */
  }
}
