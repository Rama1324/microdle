let timer = 0;

/** Mensaje breve; requiere un <div id="toast" class="toast" role="status"> en la página. */
export function toast(msg: string, ms = 1800) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => t.classList.remove('show'), ms);
}

/** Anuncio solo para lectores de pantalla; requiere <div id="sr-live" aria-live="polite">. */
export function announce(msg: string) {
  const el = document.getElementById('sr-live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => (el.textContent = msg), 50);
}

/** Actualiza cada segundo los elementos [data-countdown]; llama a onNewDay al cambiar el día. */
export function startCountdown(compute: () => string, isNewDay: () => boolean, onNewDay: () => void) {
  const tick = () => {
    const txt = compute();
    document.querySelectorAll('[data-countdown]').forEach((el) => (el.textContent = txt));
    if (isNewDay()) onNewDay();
  };
  tick();
  setInterval(tick, 1000);
  return tick;
}
