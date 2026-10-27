import './style.css';
import type { Camera, City, CityOptions, MapStyle, PaletteName, Point } from './model/types';
import { generateCity, generateBlueprintCity, rerollNames } from './model/generator';
import { DEFAULT_STYLE, getMapTransform, PALETTES, renderMap } from './render/map';
import { boundedInteger, cityQuery, escapeHtml, FEATURE_KEYS, freshSeed, PALETTE_NAMES, readOptions, readStyle } from './state';
import { exportJson, exportPng, exportSvg } from './export';
import { warpCity } from './warp';
import type { WarpTool } from './warp';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main id="map-stage" aria-label="Interactive city map"><div class="loading">Drawing the city…</div></main>
  <button class="menu-button" id="menu-toggle" aria-expanded="false" aria-controls="main-menu">Menu</button>
  <nav class="main-menu" id="main-menu" aria-label="Map menu" hidden>
    <button class="menu-item" data-action="new">New city <small>Enter</small></button>
    <button class="menu-item" data-action="warp">Warp <small>W</small></button>
    <button class="menu-item" data-action="colors">Colors… <small>C</small></button>
    <button class="menu-item" data-action="export-menu" aria-expanded="false" aria-controls="export-menu">Export as <span>›</span></button>
    <div class="submenu" id="export-menu" aria-label="Export format" hidden>
      <button class="menu-item" data-action="png">PNG</button>
      <button class="menu-item" data-action="svg">SVG</button>
      <button class="menu-item" data-action="json">JSON</button>
    </div>
    <div class="menu-divider"></div>
    <button class="menu-item" data-action="generate">Generate <small>G</small></button>
    <button class="menu-item" data-action="settlement">Settlement <small>T</small></button>
    <button class="menu-item" data-action="style">Style <small>S</small></button>
    <div class="menu-divider"></div>
    <button class="menu-item" data-action="reset-view">Reset view <small>0</small></button>
    <button class="menu-item" data-action="about">About &amp; keys</button>
  </nav>
  <section id="panel" role="dialog" aria-labelledby="panel-title" hidden>
    <header class="panel-header"><h2 id="panel-title"></h2><button id="panel-close" aria-label="Close panel" title="Close (Esc)">×</button></header>
    <div id="panel-body" class="panel-body"></div>
  </section>
  <aside id="warp-tools" class="warp-tools" aria-label="Warp tools" hidden>
    <header class="panel-header"><span>Warp</span><button data-action="warp-done" aria-label="Finish warping">×</button></header>
    <div class="warp-body">
      <button class="tool" data-tool="move" aria-pressed="true">Displace</button>
      <button class="tool" data-tool="expand" aria-pressed="false">Expand</button>
      <button class="tool" data-tool="contract" aria-pressed="false">Contract</button>
      <button class="tool" data-tool="rotate" aria-pressed="false">Rotate</button>
      <label class="field">Brush size<input id="brush-size" type="range" min="25" max="240" value="100" aria-label="Brush size" /></label>
      <p class="hint">Drag on the map to reshape it. Hold Shift to pan.</p>
      <div class="button-row"><button data-action="undo" id="undo-button" disabled>Undo</button><button data-action="warp-reset">Reset</button></div>
      <button data-action="warp-done">Done</button>
    </div>
  </aside>
  <div id="warp-cursor" class="warp-cursor"></div>
  <div id="tooltip" class="tooltip" role="tooltip" hidden></div>
  <div id="toast" class="toast" role="status" hidden></div>
`;

const stage = document.querySelector<HTMLElement>('#map-stage')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const panelBody = document.querySelector<HTMLElement>('#panel-body')!;
const menu = document.querySelector<HTMLElement>('#main-menu')!;
const menuToggle = document.querySelector<HTMLButtonElement>('#menu-toggle')!;
const tooltip = document.querySelector<HTMLElement>('#tooltip')!;
const warpCursor = document.querySelector<HTMLElement>('#warp-cursor')!;
const warpTools = document.querySelector<HTMLElement>('#warp-tools')!;
const viewport = { width: window.innerWidth, height: window.innerHeight };
let options = readOptions(location.search);
let savedStyle: string | null = null;
try { savedStyle = localStorage.getItem('new-cities-style'); } catch { /* Storage can be unavailable. */ }
let style = readStyle(DEFAULT_STYLE, location.search, savedStyle);
let city: City;
let camera: Camera = { x: 0, y: 0, zoom: 1 };
let currentPanel: string | null = null;
let renderPending = false;
let randomFeatures = false;
let customName = new URLSearchParams(location.search).get('name')?.slice(0, 80) ?? '';
let warpMode = false;
let warped = false;
let warpTool: WarpTool = 'move';
let brushRadius = 100;
let warpBaseline: City | undefined;
const undoStack: City[] = [];
let toastTimer: number | undefined;

function toast(message: string): void {
  const element = document.querySelector<HTMLElement>('#toast')!;
  element.textContent = message;
  element.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element.hidden = true; }, 3400);
}

function render(): void {
  if (!city) return;
  stage.innerHTML = renderMap(city, style, viewport, camera);
  document.documentElement.style.backgroundColor = 'var(--ui-paper)';
  document.title = `${city.name} · Medieval City Generator`;
}

function scheduleRender(): void {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; render(); });
}

function syncUrl(): void {
  history.replaceState(null, '', `${location.pathname}${cityQuery(options, customName, style.palette)}${location.hash}`);
}

function saveStyle(): void {
  try { localStorage.setItem('new-cities-style', JSON.stringify(style)); } catch { /* Map still works without storage. */ }
  syncUrl();
  scheduleRender();
}

function regenerate(nextOptions: CityOptions, preserveName = false, randomize?: boolean): void {
  try {
    const name = preserveName ? customName : undefined;
    const nextCity = randomize === undefined ? generateCity(nextOptions, name) : generateBlueprintCity(nextOptions, randomize, name);
    options = { ...nextCity.options };
    city = nextCity;
    if (!preserveName) customName = '';
    if (customName) city.name = customName;
    camera = { x: 0, y: 0, zoom: 1 };
    warped = false;
    warpBaseline = undefined;
    undoStack.length = 0;
    if (warpMode) setWarp(false);
    syncUrl();
    render();
    if (currentPanel === 'settlement') openPanel('settlement');
  } catch (error) {
    console.error(error);
    toast('The city could not be generated. Try another seed or a smaller size.');
    if (!city) stage.innerHTML = '<div class="error-screen"><p>The city could not be generated.</p><button data-action="new">Try another seed</button></div>';
  }
}

function readGenerationForm(): CityOptions {
  const result = { ...options };
  if (currentPanel !== 'generate') return result;
  for (const key of FEATURE_KEYS) {
    const input = panelBody.querySelector<HTMLInputElement>(`[name="${key}"]`);
    if (input) result[key] = input.checked;
  }
  result.seed = boundedInteger(panelBody.querySelector<HTMLInputElement>('[name="seed"]')?.value, options.seed, 1, 2147483646);
  result.size = boundedInteger(panelBody.querySelector<HTMLInputElement>('[name="size"]')?.value, options.size, 5, 200);
  const mode = panelBody.querySelector<HTMLSelectElement>('[name="road-mode"]')?.value;
  if (mode) {
    result.gates = mode === 'specific' ? boundedInteger(panelBody.querySelector<HTMLInputElement>('[name="gates"]')?.value, 4, 0, 30) : -1;
    if (mode === 'maximum' || result.hub !== undefined) result.hub = mode === 'maximum';
  }
  return result;
}

function newCity(size?: number): void {
  const next = readGenerationForm();
  next.seed = freshSeed();
  if (size !== undefined) next.size = size;
  regenerate(next, false, randomFeatures);
  if (currentPanel === 'generate') openPanel('generate');
}

function toggleMenu(force?: boolean): void {
  const open = force ?? menu.hidden;
  menu.hidden = !open;
  menuToggle.setAttribute('aria-expanded', String(open));
  if (!open) {
    document.querySelector<HTMLElement>('#export-menu')!.hidden = true;
    menu.querySelector('[data-action="export-menu"]')!.setAttribute('aria-expanded', 'false');
  }
  tooltip.hidden = true;
}

function closePanel(): void {
  panel.hidden = true;
  currentPanel = null;
  menuToggle.focus({ preventScroll: true });
}

function checkbox(key: string, text: string, checked: boolean): string {
  return `<label class="check"><input type="checkbox" name="${key}" ${checked ? 'checked' : ''}>${text}</label>`;
}

function openPanel(kind: string): void {
  const reopening = currentPanel === kind;
  currentPanel = kind;
  toggleMenu(false);
  tooltip.hidden = true;
  if (!reopening) {
    panel.style.left = '50%'; panel.style.top = '50%'; panel.style.transform = 'translate(-50%, -50%)';
  }
  panel.hidden = false;
  panelBody.className = 'panel-body';
  const title = document.querySelector<HTMLElement>('#panel-title')!;
  if (kind === 'generate') {
    title.textContent = 'Generate';
    panelBody.classList.add('flush');
    panelBody.innerHTML = `<form id="generate-form">
      <div class="generate-layout">
        <div class="generate-settings">
          <div class="tabs" role="tablist" aria-label="Generation settings"><button type="button" role="tab" aria-selected="true" data-tab="features">Features</button><button type="button" role="tab" aria-selected="false" data-tab="roads">Roads</button></div>
          <div class="tab-body" data-tab-content="features">
            ${checkbox('random', 'Random', randomFeatures)}<hr>
            <div class="checks">${checkbox('citadel', 'Citadel', options.citadel)}${checkbox('temple', 'Temple', options.temple)}${checkbox('urban_castle', 'Inner castle', options.urban_castle)}${checkbox('plaza', 'Plaza', options.plaza)}${checkbox('walls', 'Walls', options.walls)}${checkbox('shantytown', 'Shanty town', options.shantytown)}${checkbox('river', 'River', options.river)}${checkbox('coast', 'Coast', options.coast)}${checkbox('greens', 'Greens', options.greens)}</div>
          </div>
          <div class="tab-body" data-tab-content="roads" hidden>
            <label class="field">Roads<select name="road-mode"><option value="default" ${options.gates === -1 && !options.hub ? 'selected' : ''}>Default</option><option value="maximum" ${options.gates === -1 && options.hub ? 'selected' : ''}>Maximum</option><option value="specific" ${options.gates >= 0 ? 'selected' : ''}>Specific</option></select></label>
            <label class="field">Number<input name="gates" type="number" min="0" max="30" value="${Math.max(0, options.gates === -1 ? 4 : options.gates)}"></label>
            <p class="hint">Roads connect the city gates to the surrounding countryside.</p>
          </div>
        </div>
        <div class="generate-actions"><button type="button" data-action="small">Small</button><button type="button" data-action="medium">Medium</button><button type="button" data-action="large">Large</button><input name="size" aria-label="City size" type="number" min="5" max="200" value="${options.size}" title="Number of city wards (5–200)"><button type="submit">Rebuild</button></div>
      </div>
      <div class="generate-footer"><hr><label class="field seed-field">Seed<input name="seed" aria-label="Seed" type="number" min="1" max="2147483646" value="${options.seed}"></label></div>
    </form>`;
    setRandomState();
    updateRoadControls();
    panelBody.querySelector('form')!.addEventListener('submit', event => {
      event.preventDefault();
      regenerate(readGenerationForm(), true, randomFeatures);
      toast('City rebuilt from seed ' + options.seed);
    });
  } else if (kind === 'colors') {
    title.textContent = 'Colors';
    panelBody.innerHTML = `<div class="palette-grid">${PALETTE_NAMES.map(palette => {
      const colors = PALETTES[palette];
      return `<button class="palette-choice" data-palette="${palette}" aria-pressed="${style.palette === palette}"><span class="palette-swatches" aria-hidden="true">${[colors.paper, colors.roof, colors.ink, colors.water].map(color => `<span style="background:${color}"></span>`).join('')}</span>${colors.name}</button>`;
    }).join('')}</div>`;
  } else if (kind === 'style') {
    title.textContent = 'Style';
    panelBody.classList.add('flush');
    panelBody.innerHTML = `<div class="tabs" role="tablist" aria-label="Map style"><button role="tab" aria-selected="true" data-tab="elements">Elements</button><button role="tab" aria-selected="false" data-tab="graphics">Graphics</button><button role="tab" aria-selected="false" data-tab="buildings">Buildings</button></div>
      <div class="tab-body style-content" data-tab-content="elements"><div class="checks">${checkbox('title', 'Title', style.title)}${checkbox('labels', 'Districts', style.labels)}${checkbox('grid', 'Grid', style.grid)}${checkbox('compass', 'Compass', style.compass)}${checkbox('scale', 'Scale bar', style.scale)}${checkbox('fields', 'Fields', style.fields)}${checkbox('trees', 'Trees', style.trees)}</div></div>
      <div class="tab-body style-content" data-tab-content="graphics" hidden><button data-action="colors">Color scheme…</button><hr><label class="field">Line weight<input name="strokeWidth" aria-label="Line weight" type="range" min="0.4" max="2" step="0.1" value="${style.strokeWidth}"></label><p class="hint">Map styles are remembered in this browser.</p></div>
      <div class="tab-body style-content" data-tab-content="buildings" hidden><div class="checks">${checkbox('buildings', 'Buildings', style.buildings)}${checkbox('shadows', 'Raised', style.shadows)}${checkbox('roofs', 'Roof lines', style.roofs)}</div></div>`;
  } else if (kind === 'settlement') {
    title.textContent = 'Settlement';
    const buildings = city.wards.reduce((sum, ward) => sum + ward.buildings.length, 0);
    panelBody.innerHTML = `<div class="settlement-body"><form id="name-form"><input class="full-input" name="city-name" aria-label="City name" maxlength="80" value="${escapeHtml(city.name)}"><div class="settlement-stats">${city.wards.filter(ward => ward.withinCity).length} wards · ${buildings.toLocaleString('en')} buildings<br>Seed ${options.seed}</div><button type="submit" style="width:100%">Rename</button></form><hr><div class="section-label">Reroll names</div><div class="button-row"><button data-action="rename-city">Town</button><button data-action="rename-districts">Districts</button></div><hr><div class="button-row"><button data-action="warp">Warp</button><button data-action="permalink">Permalink</button></div><hr><div class="section-label">Export</div><div class="button-row"><button data-action="png">PNG</button><button data-action="svg">SVG</button><button data-action="json">JSON</button></div>${warped ? '<p class="hint" style="margin-top:10px">Your reshaped geometry is included in exports. The permalink opens the original seed.</p>' : ''}</div>`;
    panelBody.querySelector('form')!.addEventListener('submit', event => {
      event.preventDefault();
      const name = panelBody.querySelector<HTMLInputElement>('[name="city-name"]')!.value.trim();
      if (!name) { toast('Enter a name for the city.'); return; }
      city.name = customName = name.slice(0, 80);
      syncUrl(); scheduleRender(); toast('City renamed.');
    });
  } else {
    title.textContent = 'About';
    panelBody.innerHTML = `<div class="about-body"><h3>Medieval City Generator</h3><p>Create a city, follow its streets, and make it your own.</p><p>A TypeScript reconstruction of <a href="https://watabou.github.io/city-generator/" target="_blank" rel="noopener noreferrer">Watabou’s Medieval Fantasy City Generator</a>. The generation rules are reconstructed; maps are not identical to the original for the same seed.</p><hr><dl class="shortcut-list"><dt>New city</dt><dd><kbd>Enter</kbd></dd><dt>Generate</dt><dd><kbd>G</kbd></dd><dt>Settlement / style</dt><dd><kbd>T</kbd> / <kbd>S</kbd></dd><dt>Colors / warp</dt><dd><kbd>C</kbd> / <kbd>W</kbd></dd><dt>Labels / grid</dt><dd><kbd>L</kbd> / <kbd>D</kbd></dd><dt>Reset view</dt><dd><kbd>0</kbd></dd><dt>Color presets</dt><dd><kbd>1</kbd> – <kbd>6</kbd></dd><dt>Pan / zoom</dt><dd>Drag / scroll</dd><dt>Touch zoom</dt><dd>Pinch</dd><dt>Close</dt><dd><kbd>Esc</kbd></dd></dl></div>`;
  }
  if (!reopening) document.querySelector<HTMLButtonElement>('#panel-close')!.focus({ preventScroll: true });
}

function setRandomState(): void {
  if (currentPanel !== 'generate') return;
  for (const key of FEATURE_KEYS) {
    const input = panelBody.querySelector<HTMLInputElement>(`[name="${key}"]`)!;
    input.disabled = randomFeatures && key !== 'greens';
  }
}

function updateRoadControls(): void {
  const input = panelBody.querySelector<HTMLInputElement>('[name="gates"]');
  if (input) input.disabled = panelBody.querySelector<HTMLSelectElement>('[name="road-mode"]')?.value !== 'specific';
}

function setWarp(enabled: boolean): void {
  warpMode = enabled;
  warpTools.hidden = !enabled;
  stage.classList.toggle('warping', enabled);
  warpCursor.classList.remove('visible');
  if (enabled) {
    warpBaseline = structuredClone(city);
    undoStack.length = 0;
    closePanel();
    updateUndo();
    toast('Drag the map to reshape it. Shift-drag to pan.');
  }
}

function updateUndo(): void {
  document.querySelector<HTMLButtonElement>('#undo-button')!.disabled = undoStack.length === 0;
}

function undoWarp(): void {
  const previous = undoStack.pop();
  if (previous) { city = previous; updateUndo(); scheduleRender(); }
}

async function action(name: string): Promise<void> {
  if (name === 'export-menu') {
    const submenu = document.querySelector<HTMLElement>('#export-menu')!;
    submenu.hidden = !submenu.hidden;
    menu.querySelector('[data-action="export-menu"]')!.setAttribute('aria-expanded', String(!submenu.hidden));
    return;
  }
  toggleMenu(false);
  switch (name) {
    case 'new': newCity(); break;
    case 'small': newCity(15); break;
    case 'medium': newCity(25); break;
    case 'large': newCity(50); break;
    case 'generate': case 'settlement': case 'colors': case 'style': case 'about': openPanel(name); break;
    case 'reset-view': camera = { x: 0, y: 0, zoom: 1 }; scheduleRender(); break;
    case 'warp': setWarp(!warpMode); break;
    case 'warp-done': setWarp(false); break;
    case 'undo': undoWarp(); break;
    case 'warp-reset': if (warpBaseline) { undoStack.push(structuredClone(city)); city = structuredClone(warpBaseline); updateUndo(); scheduleRender(); } break;
    case 'rename-city': {
      rerollNames(city, freshSeed(), 'city');
      customName = city.name;
      syncUrl(); scheduleRender(); openPanel('settlement'); break;
    }
    case 'rename-districts': {
      rerollNames(city, freshSeed(), 'districts');
      scheduleRender(); toast('District names changed.'); break;
    }
    case 'permalink':
      try { await navigator.clipboard.writeText(location.href); toast(warped ? 'Seed link copied. Export SVG or JSON to keep your warp edits.' : 'Permalink copied to clipboard.'); }
      catch {
        panelBody.insertAdjacentHTML('beforeend', `<label class="field" style="margin-top:12px">Copy link<input class="wide" readonly value="${escapeHtml(location.href)}" aria-label="Permalink"></label>`);
        const input = panelBody.querySelector<HTMLInputElement>('[aria-label="Permalink"]')!;
        input.focus(); input.select();
      }
      break;
    case 'png': case 'svg': case 'json':
      try {
        if (name === 'json') exportJson(city);
        else {
          toast(`Preparing ${name.toUpperCase()}…`);
          const svg = renderMap(city, style, viewport, camera);
          if (name === 'svg') await exportSvg(city, svg);
          else await exportPng(city, svg, viewport.width, viewport.height);
        }
        toast(`${name.toUpperCase()} exported.`);
      } catch (error) { console.error(error); toast('Export failed. Please try again.'); }
      break;
  }
}

menuToggle.addEventListener('click', () => toggleMenu());
document.querySelector('#panel-close')!.addEventListener('click', closePanel);
document.addEventListener('click', event => {
  const target = event.target as Element;
  const button = target.closest<HTMLElement>('[data-action]');
  if (button) void action(button.dataset.action!);
  if (!menu.contains(target) && target !== menuToggle) toggleMenu(false);
  const tab = target.closest<HTMLButtonElement>('[data-tab]');
  if (tab) {
    panelBody.querySelectorAll<HTMLElement>('[data-tab]').forEach(element => element.setAttribute('aria-selected', String(element === tab)));
    panelBody.querySelectorAll<HTMLElement>('[data-tab-content]').forEach(element => { element.hidden = element.dataset.tabContent !== tab.dataset.tab; });
  }
  const palette = target.closest<HTMLButtonElement>('[data-palette]');
  if (palette) {
    style.palette = palette.dataset.palette as PaletteName;
    saveStyle();
    panelBody.querySelectorAll('[data-palette]').forEach(element => element.setAttribute('aria-pressed', String(element === palette)));
  }
  const tool = target.closest<HTMLButtonElement>('[data-tool]');
  if (tool) {
    warpTool = tool.dataset.tool as WarpTool;
    warpTools.querySelectorAll('[data-tool]').forEach(element => element.setAttribute('aria-pressed', String(element === tool)));
  }
});

panelBody.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (currentPanel === 'generate') {
    if (input.name === 'random') { randomFeatures = input.checked; setRandomState(); }
    if (input.name === 'road-mode') updateRoadControls();
  }
  if (currentPanel === 'style' && input.type === 'checkbox' && input.name in style) {
    const key = input.name as Exclude<keyof MapStyle, 'palette' | 'strokeWidth'>;
    style[key] = input.checked; saveStyle();
  }
});
panelBody.addEventListener('input', event => {
  const input = event.target as HTMLInputElement;
  if (input.name === 'strokeWidth') { style.strokeWidth = Number(input.value); saveStyle(); }
});
document.querySelector('#brush-size')!.addEventListener('input', event => { brushRadius = Number((event.target as HTMLInputElement).value); });

const panelHeader = panel.querySelector<HTMLElement>('.panel-header')!;
let panelDrag: { id: number; dx: number; dy: number } | undefined;
panelHeader.addEventListener('pointerdown', event => {
  if ((event.target as Element).closest('button')) return;
  const rect = panel.getBoundingClientRect();
  panelDrag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
  panelHeader.setPointerCapture(event.pointerId);
  panel.style.transform = 'none'; panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
});
panelHeader.addEventListener('pointermove', event => {
  if (!panelDrag) return;
  panel.style.left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, event.clientX - panelDrag.dx)) + 'px';
  panel.style.top = Math.max(0, Math.min(window.innerHeight - 40, event.clientY - panelDrag.dy)) + 'px';
});
panelHeader.addEventListener('pointerup', () => { panelDrag = undefined; });
panelHeader.addEventListener('pointercancel', () => { panelDrag = undefined; });

type Gesture = { start: Point; previous: Point; moved: boolean; warp: boolean };
let gesture: Gesture | undefined;
const touches = new Map<number, Point>();
let pinch: { distance: number; center: Point } | undefined;
let lastHoverWard = '';

function zoomAt(point: Point, factor: number): void {
  const before = getMapTransform(city, viewport, camera);
  const world = { x: (point.x - before.x) / before.scale, y: (point.y - before.y) / before.scale };
  camera.zoom = Math.min(12, Math.max(0.25, camera.zoom * factor));
  const after = getMapTransform(city, viewport, camera);
  camera.x += point.x - (world.x * after.scale + after.x);
  camera.y += point.y - (world.y * after.scale + after.y);
  scheduleRender();
}

stage.addEventListener('wheel', event => {
  event.preventDefault();
  if (!city) return;
  tooltip.hidden = true;
  zoomAt({ x: event.clientX, y: event.clientY }, Math.exp(-event.deltaY * 0.0015));
}, { passive: false });

stage.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !city) return;
  toggleMenu(false); tooltip.hidden = true;
  const point = { x: event.clientX, y: event.clientY };
  touches.set(event.pointerId, point);
  stage.setPointerCapture(event.pointerId);
  if (touches.size === 2) {
    const [a, b] = [...touches.values()];
    pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    gesture = undefined; return;
  }
  gesture = { start: point, previous: point, moved: false, warp: warpMode && !event.shiftKey };
  if (gesture.warp) {
    undoStack.push(structuredClone(city));
    if (undoStack.length > 20) undoStack.shift();
    updateUndo();
  } else stage.classList.add('dragging');
});

stage.addEventListener('pointermove', event => {
  const point = { x: event.clientX, y: event.clientY };
  if (warpMode) {
    warpCursor.style.left = point.x + 'px'; warpCursor.style.top = point.y + 'px';
    warpCursor.style.width = warpCursor.style.height = brushRadius * 2 + 'px';
    warpCursor.classList.add('visible');
  }
  if (touches.has(event.pointerId)) touches.set(event.pointerId, point);
  if (touches.size >= 2 && pinch) {
    const [a, b] = [...touches.values()];
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    camera.x += center.x - pinch.center.x; camera.y += center.y - pinch.center.y;
    if (pinch.distance > 0) zoomAt(center, distance / pinch.distance);
    pinch = { distance, center }; return;
  }
  if (gesture) {
    const delta = { x: point.x - gesture.previous.x, y: point.y - gesture.previous.y };
    if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 3) gesture.moved = true;
    if (gesture.warp && gesture.moved) {
      const transform = getMapTransform(city, viewport, camera);
      warpCity(city, { x: (point.x - transform.x) / transform.scale, y: (point.y - transform.y) / transform.scale }, { x: delta.x / transform.scale, y: delta.y / transform.scale }, brushRadius / transform.scale, warpTool);
      warped = true;
    } else if (!gesture.warp) { camera.x += delta.x; camera.y += delta.y; }
    gesture.previous = point;
    scheduleRender();
    return;
  }
  if (warpMode || !panel.hidden || !menu.hidden) return;
  const wardId = (event.target as Element).closest<SVGGElement>('[data-ward-id]')?.dataset.wardId;
  if (wardId && city) {
    if (wardId !== lastHoverWard) {
      const ward = city.wards.find(ward => String(ward.id) === wardId);
      tooltip.textContent = ward?.name || ward?.kind || '';
      lastHoverWard = wardId;
    }
    tooltip.hidden = !tooltip.textContent;
    tooltip.style.left = Math.min(point.x + 14, viewport.width - tooltip.offsetWidth - 8) + 'px';
    tooltip.style.top = Math.max(5, point.y - 30) + 'px';
  } else tooltip.hidden = true;
});

function finishGesture(event: PointerEvent): void {
  touches.delete(event.pointerId);
  if (touches.size < 2) pinch = undefined;
  if (gesture?.warp && !gesture.moved) { undoStack.pop(); updateUndo(); }
  gesture = undefined;
  stage.classList.remove('dragging');
}
stage.addEventListener('pointerup', finishGesture);
stage.addEventListener('pointercancel', finishGesture);
stage.addEventListener('pointerleave', () => { tooltip.hidden = true; warpCursor.classList.remove('visible'); });
stage.addEventListener('dblclick', event => {
  if (warpMode) return;
  if (event.clientY < 90 && style.title) openPanel('settlement');
  else zoomAt({ x: event.clientX, y: event.clientY }, 1.5);
});
stage.addEventListener('contextmenu', event => { event.preventDefault(); toggleMenu(); });

document.addEventListener('keydown', event => {
  const target = event.target as HTMLElement;
  if (event.key === 'Escape') {
    if (!menu.hidden) toggleMenu(false);
    else if (!panel.hidden) closePanel();
    else if (warpMode) setWarp(false);
    return;
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === 'z' && warpMode) { event.preventDefault(); undoWarp(); }
    return;
  }
  if (event.key === 'Enter' && target.tagName === 'BUTTON') return;
  const key = event.key.toLowerCase();
  if (['g','t','s','c','w','0','l','d','n','b','enter','+','=','-'].includes(key) || /^[1-6]$/.test(key)) event.preventDefault();
  const actions: Record<string, string> = { g: 'generate', t: 'settlement', s: 'style', c: 'colors', w: 'warp', '0': 'reset-view', enter: 'new', '?': 'about' };
  if (actions[key]) void action(actions[key]);
  else if (key === 'l') { style.labels = !style.labels; saveStyle(); }
  else if (key === 'd') { style.grid = !style.grid; saveStyle(); }
  else if (key === 'b') { style.buildings = !style.buildings; saveStyle(); }
  else if (key === 'n') { style.strokeWidth = style.strokeWidth < 1 ? 1 : 0.6; saveStyle(); }
  else if (/^[1-6]$/.test(key)) { style.palette = (['default','ink','bw','vivid','natural','modern'] as PaletteName[])[Number(key) - 1]; saveStyle(); }
  else if (['+', '=', '-'].includes(key)) zoomAt({ x: viewport.width / 2, y: viewport.height / 2 }, key === '-' ? 0.8 : 1.25);
});

window.addEventListener('resize', () => {
  viewport.width = window.innerWidth; viewport.height = window.innerHeight;
  scheduleRender();
  if (!panel.hidden && panel.style.transform === 'none') {
    panel.style.left = Math.max(0, Math.min(parseFloat(panel.style.left), viewport.width - panel.offsetWidth)) + 'px';
    panel.style.top = Math.max(0, Math.min(parseFloat(panel.style.top), viewport.height - 60)) + 'px';
  }
});
window.addEventListener('popstate', () => {
  customName = new URLSearchParams(location.search).get('name')?.slice(0, 80) ?? '';
  style = readStyle(style, location.search, null);
  regenerate(readOptions(location.search), true);
});

regenerate(options, true);
void document.fonts.ready.then(scheduleRender);
