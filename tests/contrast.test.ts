/**
 * Contraste WCAG 2.x de todos los pares de tokens de color, calculado a partir de
 * los valores REALES de src/shared/tokens.css (tema claro y oscuro).
 * Si alguien cambia un token y baja de AA, este test falla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ---------- lectura de tokens ----------
const css = readFileSync('src/shared/tokens.css', 'utf8');

function block(selectorRe: RegExp): Record<string, string> {
  const m = css.match(selectorRe);
  assert.ok(m, `no encontré el bloque ${selectorRe}`);
  const out: Record<string, string> = {};
  for (const d of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) out[d[1]] = d[2];
  return out;
}

const light = block(/:root\s*\{([^}]*)\}/);
const dark = { ...light, ...block(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/) };

// ---------- WCAG ----------
function rgb(hex: string): number[] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------- pares exigidos ----------
const TEXT = 4.5; // texto normal (AA)
const UI = 3; // límites de controles, foco, gráficos (WCAG 1.4.11)

const PAIRS: [fg: string, bg: string, min: number, uso: string][] = [
  ['ink', 'bg', TEXT, 'texto principal'],
  ['ink', 'surface', TEXT, 'texto en tarjetas y diálogos'],
  ['ink', 'empty', TEXT, 'texto sobre fondos neutros (hover, chips)'],
  ['ink-2', 'bg', TEXT, 'texto secundario'],
  ['ink-2', 'surface', TEXT, 'texto secundario en tarjetas'],
  ['bg', 'ink', TEXT, 'texto invertido (toast, tab activa, botón Siguiente)'],
  ['on-sign', 'sign', TEXT, 'franja amarilla y avisos'],
  ['on-plate', 'sign-plate', TEXT, 'placa del letrero (número de micro)'],
  ['micro', 'sign-plate', TEXT, 'etiqueta MICRO en la placa'],
  ['on-feedback', 'ok', TEXT, '✓ acierto, botón principal de Microdle'],
  ['on-feedback', 'near', TEXT, '≈ cerca'],
  ['on-feedback', 'miss', TEXT, '✗ en Microdle, barras de distribución'],
  ['on-feedback', 'bad', TEXT, '✗ error en Caro'],
  ['on-feedback', 'caro', TEXT, 'botón MÁS CARO y VS'],
  ['micro-ink', 'bg', TEXT, 'acento Microdle como texto'],
  ['micro-ink', 'surface', TEXT, 'acento Microdle como texto en tarjetas'],
  ['caro-ink', 'bg', TEXT, 'acento Caro como texto'],
  ['caro-ink', 'surface', TEXT, 'acento Caro como texto en tarjetas'],
  ['ok-ink', 'surface', TEXT, '✓ en la boleta final'],
  ['bad-ink', 'surface', TEXT, '✗ en la boleta final'],
  ['line', 'bg', UI, 'borde de controles sobre el fondo'],
  ['line', 'surface', UI, 'borde del input sobre su superficie'],
  ['ink', 'bg', UI, 'filetes de letrero'],
  ['focus', 'bg', UI, 'anillo de foco'],
  ['focus', 'surface', UI, 'anillo de foco en diálogos'],
  ['route', 'map-bg', UI, 'línea del recorrido sin mapa base'],
];

test('el CSS define todos los tokens usados en los pares', () => {
  for (const theme of [light, dark]) {
    for (const [fg, bg] of PAIRS) {
      assert.ok(theme[fg], `falta --${fg}`);
      assert.ok(theme[bg], `falta --${bg}`);
    }
  }
});

for (const [name, theme] of [
  ['claro', light],
  ['oscuro', dark],
] as const) {
  test(`contraste AA — tema ${name}`, () => {
    const fails: string[] = [];
    for (const [fg, bg, min, uso] of PAIRS) {
      const r = contrast(theme[fg], theme[bg]);
      if (r < min) fails.push(`--${fg} ${theme[fg]} sobre --${bg} ${theme[bg]} = ${r.toFixed(2)}:1 (mín ${min}) · ${uso}`);
    }
    assert.deepEqual(fails, [], `\n${fails.join('\n')}`);
  });
}

test('la fórmula coincide con valores de referencia', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#787c7e', '#101212').toFixed(2), '4.46'); // el gris viejo, que fallaba
});
