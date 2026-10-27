import type { City } from './model/types';

function filename(city: City): string {
  return city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'medieval-city';
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

let fonts: Promise<string> | undefined;
async function embeddedFonts(): Promise<string> {
  fonts ??= Promise.all([
    ['IM Fell', '/fonts/IMFellGreatPrimer-Regular.woff'],
    ['Share Tech', '/fonts/ShareTech-Regular.woff'],
  ].map(async ([family, path]) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Could not load export fonts.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `@font-face{font-family:'${family}';src:url(data:font/woff;base64,${btoa(binary)}) format('woff');}`;
  })).then(styles => `<style>${styles.join('')}</style>`);
  try { return await fonts; } catch (error) { fonts = undefined; throw error; }
}

export async function standaloneSvg(svg: string): Promise<string> {
  const style = await embeddedFonts();
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg.replace(/(<svg\b[^>]*>)/, `$1${style}`)}`;
}

export async function exportSvg(city: City, svg: string): Promise<void> {
  download(new Blob([await standaloneSvg(svg)], { type: 'image/svg+xml' }), `${filename(city)}.svg`);
}

export function exportJson(city: City): void {
  download(new Blob([JSON.stringify({ format: 'new-cities', version: 1, city }, null, 2)], { type: 'application/json' }), `${filename(city)}.json`);
}

export async function exportPng(city: City, svg: string, width: number, height: number): Promise<void> {
  const blob = new Blob([await standaloneSvg(svg)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser does not support PNG export.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG export failed.')), 'image/png'));
    download(png, `${filename(city)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
