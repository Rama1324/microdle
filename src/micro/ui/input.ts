import type { RouteData } from '../types';
import { varianteDe } from '../game/feedback';

export const normalizeId = (s: string) => s.toUpperCase().replace(/[\s\-_.]/g, '');

const collator = new Intl.Collator('es', { numeric: true });

/**
 * Combobox accesible con autocompletado de recorridos.
 * Solo se busca por número/código (no por nombre) para no regalar la respuesta.
 */
export class GuessInput {
  private input: HTMLInputElement;
  private list: HTMLUListElement;
  private active = -1;
  private items: RouteData[] = [];
  private routes: RouteData[] = [];
  private excluded = new Set<string>();

  constructor(
    private form: HTMLFormElement,
    private onSubmit: (value: string) => void,
  ) {
    this.input = form.querySelector('input')!;
    this.list = form.querySelector('ul')!;

    this.input.addEventListener('input', () => this.update());
    this.input.addEventListener('focus', () => this.update());
    this.input.addEventListener('blur', () => setTimeout(() => this.close(), 120));
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.list.addEventListener('mousedown', (e) => e.preventDefault()); // no perder foco
    this.list.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li[data-id]') as HTMLLIElement | null;
      if (li) this.choose(li.dataset.id!);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.active >= 0 && this.items[this.active]) this.input.value = this.items[this.active].id;
      else if (this.items.length === 1) this.input.value = this.items[0].id;
      this.close();
      this.onSubmit(this.input.value);
    });
  }

  setRoutes(routes: RouteData[]) {
    this.routes = routes.slice().sort((a, b) => collator.compare(a.id, b.id));
  }

  setExcluded(ids: string[]) {
    this.excluded = new Set(ids);
  }

  setDisabled(disabled: boolean) {
    this.input.disabled = disabled;
    (this.form.querySelector('button[type=submit]') as HTMLButtonElement).disabled = disabled;
    if (disabled) this.close();
  }

  clear() {
    this.input.value = '';
    this.close();
  }

  focus() {
    // En móvil no abrimos el teclado automáticamente
    if (window.matchMedia('(pointer: fine)').matches) this.input.focus({ preventScroll: true });
  }

  shake() {
    this.form.classList.remove('shake');
    void this.form.offsetWidth;
    this.form.classList.add('shake');
  }

  private update() {
    const q = normalizeId(this.input.value);
    if (!q) return this.close();
    const starts: RouteData[] = [];
    const contains: RouteData[] = [];
    for (const r of this.routes) {
      if (this.excluded.has(r.id)) continue;
      const id = normalizeId(r.id);
      if (id.startsWith(q)) starts.push(r);
      else if (q.length >= 2 && id.includes(q)) contains.push(r);
    }
    // Primero los recorridos "normales", luego variantes
    starts.sort((a, b) => Number(b.elegible) - Number(a.elegible) || collator.compare(a.id, b.id));
    const exact = starts.findIndex((r) => normalizeId(r.id) === q);
    if (exact > 0) starts.unshift(...starts.splice(exact, 1));
    this.items = [...starts, ...contains].slice(0, 8);
    this.active = this.items.length && normalizeId(this.items[0].id) === q ? 0 : -1;
    this.paint();
  }

  private paint() {
    this.list.innerHTML = '';
    if (!this.items.length) return this.close();
    this.items.forEach((r, i) => {
      const li = document.createElement('li');
      li.id = `opt-${i}`;
      li.dataset.id = r.id;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === this.active));
      const v = varianteDe(r.id);
      li.innerHTML = `<span class="opt-id">${r.id}</span>${v ? `<span class="opt-tag">${v}</span>` : ''}`;
      this.list.appendChild(li);
    });
    this.list.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.input.setAttribute('aria-activedescendant', this.active >= 0 ? `opt-${this.active}` : '');
  }

  private close() {
    this.list.hidden = true;
    this.items = [];
    this.active = -1;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  private choose(id: string) {
    this.input.value = id;
    this.close();
    this.input.focus();
  }

  private onKey(e: KeyboardEvent) {
    if (this.list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.items.length;
      this.active = e.key === 'ArrowDown' ? (this.active + 1) % n : (this.active - 1 + n) % n;
      this.paint();
    } else if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'Tab' && this.active >= 0) {
      e.preventDefault();
      this.choose(this.items[this.active].id);
    }
  }
}
