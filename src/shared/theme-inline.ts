/**
 * Script que se inyecta en el <head> de cada página (ver vite.config.ts) para fijar
 * el tema antes de pintar y evitar parpadeo. Debe calzar con theme.ts:
 * lee hub:theme y, si no existe, la key vieja microdle:settings.theme.
 */
export const THEME_INLINE_SCRIPT = `(function(){var t='auto';try{var h=localStorage.getItem('hub:theme');if(h==='light'||h==='dark'||h==='auto'){t=h}else{var s=JSON.parse(localStorage.getItem('microdle:settings')||'{}');if(s&&s.theme)t=s.theme}}catch(e){}var d=t==='dark'||(t==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'})();`;
