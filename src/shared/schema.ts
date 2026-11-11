/**
 * Validación mínima de datos persistidos (sin dependencias).
 * Un esquema es una función que devuelve null si el valor es válido o un
 * mensaje que describe el primer problema encontrado.
 */
export type Schema = (v: unknown, path?: string) => string | null;

const at = (path: string) => (path ? ` en ${path}` : '');

export const str: Schema = (v, p = '') => (typeof v === 'string' ? null : `se esperaba texto${at(p)}`);
export const bool: Schema = (v, p = '') => (typeof v === 'boolean' ? null : `se esperaba booleano${at(p)}`);
export const int =
  (min = -Infinity): Schema =>
  (v, p = '') =>
    Number.isInteger(v) && (v as number) >= min ? null : `se esperaba entero ≥ ${min}${at(p)}`;
export const num: Schema = (v, p = '') =>
  typeof v === 'number' && Number.isFinite(v) ? null : `se esperaba número${at(p)}`;

export const oneOf =
  (...values: readonly unknown[]): Schema =>
  (v, p = '') =>
    values.includes(v) ? null : `valor no permitido${at(p)}`;

export const nullable =
  (s: Schema): Schema =>
  (v, p) =>
    v === null ? null : s(v, p);

export const optional =
  (s: Schema): Schema =>
  (v, p) =>
    v === undefined ? null : s(v, p);

export const arr =
  (item: Schema, opts: { len?: number } = {}): Schema =>
  (v, p = '') => {
    if (!Array.isArray(v)) return `se esperaba lista${at(p)}`;
    if (opts.len != null && v.length !== opts.len) return `se esperaban ${opts.len} elementos${at(p)}`;
    for (let i = 0; i < v.length; i++) {
      const e = item(v[i], `${p}[${i}]`);
      if (e) return e;
    }
    return null;
  };

/** Objeto con campos conocidos (campos extra se permiten: datos de versiones futuras/anteriores). */
export const obj =
  (shape: Record<string, Schema>): Schema =>
  (v, p = '') => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return `se esperaba objeto${at(p)}`;
    for (const [k, s] of Object.entries(shape)) {
      const e = s((v as Record<string, unknown>)[k], p ? `${p}.${k}` : k);
      if (e) return e;
    }
    return null;
  };

/** Diccionario con claves libres y valores del mismo esquema. */
export const record =
  (value: Schema, key: (k: string) => boolean = () => true): Schema =>
  (v, p = '') => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return `se esperaba objeto${at(p)}`;
    for (const [k, val] of Object.entries(v)) {
      if (!key(k)) return `clave inválida "${k}"${at(p)}`;
      const e = value(val, `${p}.${k}`);
      if (e) return e;
    }
    return null;
  };
