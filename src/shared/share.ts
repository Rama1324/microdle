import { HUB } from './config';

/** URL corta para textos de compartir: "dominio/ruta" (sin https://). */
export const shareUrl = (path = '') => `${HUB.domain}${path}`;

const isMobile = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: coarse)').matches &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Web Share API en móvil, portapapeles en desktop. */
export async function shareResult(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (isMobile() && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }
}
