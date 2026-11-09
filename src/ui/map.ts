import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng, RouteData } from '../types';
import { routePoints } from '../game/feedback';
import { icons } from './icons';

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions/" target="_blank" rel="noopener">CARTO</a>';

/**
 * CARTO Basemaps exige una API key gratuita (https://carto.com/basemaps/apikey).
 * Se define en VITE_CARTO_KEY (.env / variables del hosting). Sin key, los tiles
 * llegan con la marca de agua "API KEY REQUIRED".
 */
const CARTO_KEY = (import.meta.env.VITE_CARTO_KEY as string | undefined)?.trim() ?? '';
if (!CARTO_KEY) console.warn('[microdle] Falta VITE_CARTO_KEY: el mapa base mostrará la marca de agua de CARTO.');

/** light/dark × nolabels (fallo 1) / all (fallo 2, con nombres de calles) */
const tileUrl = (theme: 'light' | 'dark', labels: boolean) =>
  `https://basemaps.cartocdn.com/rastertiles/${theme}_${labels ? 'all' : 'nolabels'}/{z}/{x}/{y}.png` +
  (CARTO_KEY ? `?key=${encodeURIComponent(CARTO_KEY)}` : '');

/** Bounding box aproximado de la RM para limitar el paneo. */
const RM_BOUNDS = L.latLngBounds([-34.4, -71.8], [-32.8, -69.9]);

export interface MapRenderOpts {
  answer: RouteData;
  /** 0..5: cuántas pistas visuales están abiertas */
  level: number;
  guesses: RouteData[];
  showGuesses: boolean;
  finished: boolean;
  /** true solo la primera vez que se muestra el final, para animar */
  animateReveal: boolean;
}

export class MapView {
  private map: L.Map;
  private theme: 'light' | 'dark' = 'light';
  private base: L.TileLayer | null = null;
  /** Estilo cargado actualmente, p. ej. "dark:true" */
  private baseKey = '';
  private routeLayer = L.layerGroup();
  private guessLayer = L.layerGroup();
  private markerLayer = L.layerGroup();
  private currentAnswerId: string | null = null;
  private bounds: L.LatLngBounds | null = null;
  private lastOpts: MapRenderOpts | null = null;

  constructor(el: HTMLElement) {
    this.map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      maxBounds: RM_BOUNDS.pad(0.2),
      minZoom: 9,
      maxZoom: 17,
      zoomSnap: 0.25,
      preferCanvas: false,
    });
    this.map.attributionControl.setPrefix(false);
    this.map.attributionControl.addAttribution(ATTRIBUTION);
    this.guessLayer.addTo(this.map);
    this.routeLayer.addTo(this.map);
    this.markerLayer.addTo(this.map);
    this.map.setView([-33.45, -70.65], 11);

    // Botón "recentrar"
    const Recenter = L.Control.extend({
      onAdd: () => {
        const b = L.DomUtil.create('button', 'map-btn');
        b.type = 'button';
        b.innerHTML = icons.recenter;
        b.setAttribute('aria-label', 'Recentrar el mapa en el recorrido');
        b.title = 'Recentrar';
        L.DomEvent.disableClickPropagation(b);
        b.addEventListener('click', () => this.fit(true));
        return b;
      },
    });
    new Recenter({ position: 'topleft' }).addTo(this.map);
  }

  setTheme(theme: 'light' | 'dark') {
    if (theme === this.theme) return;
    this.theme = theme;
    if (this.lastOpts) this.render(this.lastOpts);
  }

  invalidate() {
    this.map.invalidateSize();
  }

  private fit(animate = false) {
    if (this.bounds) this.map.fitBounds(this.bounds, { padding: [24, 24], animate });
  }

  private setTiles(level: number) {
    const wantBase = level >= 1;
    const key = wantBase ? `${this.theme}:${level >= 2}` : '';
    if (key !== this.baseKey) {
      const old = this.base;
      this.base = wantBase
        ? L.tileLayer(tileUrl(this.theme, level >= 2), { maxZoom: 19, className: 'tiles-base' }).addTo(this.map)
        : null;
      // Quitamos la capa anterior cuando la nueva ya cargó, para no "parpadear"
      if (old) {
        if (this.base) this.base.once('load', () => old.remove());
        else old.remove();
      }
      this.baseKey = key;
    }
    this.map.getContainer().classList.toggle('no-basemap', !wantBase);
  }

  render(opts: MapRenderOpts) {
    this.lastOpts = opts;
    const { answer, level, guesses, showGuesses, finished, animateReveal } = opts;
    this.setTiles(level);

    const pts = routePoints(answer);
    const isNew = this.currentAnswerId !== answer.id;
    this.currentAnswerId = answer.id;

    // Intentos (líneas punteadas, debajo del recorrido)
    this.guessLayer.clearLayers();
    if (showGuesses) {
      for (const g of guesses) {
        if (g.id === answer.id) continue;
        L.polyline(routePoints(g), {
          className: 'guess-line',
          weight: 3,
          interactive: true,
        })
          .bindTooltip(g.id, { sticky: true, className: 'map-tip' })
          .addTo(this.guessLayer);
      }
    }

    // Recorrido misterioso
    this.routeLayer.clearLayers();
    L.polyline(pts, { className: 'route-casing', weight: 9, interactive: false }).addTo(this.routeLayer);
    const line = L.polyline(pts, {
      className: finished ? 'route-line route-final' : 'route-line',
      weight: 5,
      interactive: false,
    }).addTo(this.routeLayer);

    // Terminales
    this.markerLayer.clearLayers();
    if (level >= 3 || finished) {
      this.addTerminal(pts[0], 'A', finished ? `Origen: ${answer.origen}` : 'Terminal');
      this.addTerminal(pts[pts.length - 1], 'B', finished ? `Destino: ${answer.destino}` : 'Terminal');
    }

    this.bounds = L.latLngBounds(pts.map((p) => L.latLng(p[0], p[1])));
    if (isNew) {
      this.map.invalidateSize();
      this.fit(false);
    }

    if (finished && animateReveal) {
      requestAnimationFrame(() => this.animateLine(line));
    }
  }

  private addTerminal(p: LatLng, letter: string, label: string) {
    const icon = L.divIcon({
      className: 'terminal-icon',
      html: `<span aria-hidden="true">${letter}</span>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    L.marker(p, { icon, keyboard: false, title: label, alt: label })
      .bindTooltip(label, { direction: 'top', offset: [0, -12], className: 'map-tip' })
      .addTo(this.markerLayer);
  }

  /** Dibuja la línea progresivamente animando stroke-dashoffset. */
  private animateLine(line: L.Polyline) {
    const path = line.getElement() as SVGPathElement | undefined;
    if (!path || typeof path.getTotalLength !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const len = path.getTotalLength();
    path.style.transition = 'none';
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.getBoundingClientRect(); // forzar reflow
    path.style.transition = 'stroke-dashoffset 2.2s ease-in-out';
    path.style.strokeDashoffset = '0';
    const done = () => {
      path.style.strokeDasharray = '';
      path.style.strokeDashoffset = '';
      path.style.transition = '';
    };
    path.addEventListener('transitionend', done, { once: true });
    // si el usuario hace zoom durante la animación, Leaflet redibuja: limpiamos igual
    this.map.once('zoomstart', done);
  }
}
