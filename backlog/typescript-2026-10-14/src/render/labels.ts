import type { MapLabel, Point } from '../model/types';
import metrics from './font-metrics.json';

// Metrics extracted from the bundled OFL IM Fell Great Primer font. Original
// OpenFL TextEngine measures each pair minus the next character's advance.
const advances: Record<string, number> = metrics.advances;
const kerning: Record<string, number> = metrics.kerning;
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const delta = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const unit = (a: Point): Point => {
  const length = Math.hypot(a.x, a.y);
  return length ? { x: a.x / length, y: a.y / length } : { x: 0, y: 0 };
};
const length = (line: Point[]) => line.slice(1).reduce((total, point, index) => total + distance(line[index], point), 0);

function along(line: Point[], offset: number): { point: Point; angle: number; index: number } {
  let remaining = offset;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], span = distance(a, b);
    if (remaining <= span || i === line.length - 2) return {
      point: mix(a, b, span ? Math.min(1, Math.max(0, remaining / span)) : 0),
      angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, index: i,
    };
    remaining -= span;
  }
  return { point: line[0] ?? { x: 0, y: 0 }, angle: 0, index: 0 };
}

/** PolyUtils.visvalingam(path, 3, 1.2), preserving the original length guard. */
function simplify(line: Point[]): void {
  const spans = line.map((point, index) => index < line.length - 1 ? distance(point, line[index + 1]) : 0);
  const area = (a: Point, b: Point, c: Point) => Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const areas = line.map((point, index) => index === 0 || index === line.length - 1 ? 0 : area(line[index - 1], point, line[index + 1]));
  const initialLength = spans.reduce((total, span) => total + span, 0);
  let currentLength = initialLength;
  while (line.length > 3) {
    let index = 1;
    for (let i = 1; i < line.length - 1; i++) if (areas[i] < areas[index]) index = i;
    const span = distance(line[index - 1], line[index + 1]);
    currentLength = currentLength - spans[index - 1] - spans[index] + span;
    if (initialLength / currentLength > 1.2) break;
    line.splice(index, 1);
    spans.splice(index, 1);
    spans[index - 1] = span;
    areas.splice(index, 1);
    if (index > 1) areas[index - 1] = area(line[index - 2], line[index - 1], line[index]);
    if (index < line.length - 1) areas[index] = area(line[index - 1], line[index], line[index + 1]);
  }
}

/** Cubic.smoothOpen(path, 4), including its reflected endpoint tangents. */
function smooth(line: Point[]): Point[] {
  if (line.length <= 2) return line.slice();
  const extrapolate = (a: Point, b: Point, c: Point): Point => {
    const first = delta(b, a), second = delta(c, b);
    const product = Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y);
    if (!product) return { x: c.x + second.x, y: c.y + second.y };
    const sin = (first.x * second.y - first.y * second.x) / product;
    const cos = (first.x * second.x + first.y * second.y) / product;
    return { x: c.x + second.x * cos - second.y * sin, y: c.y + second.y * cos + second.x * sin };
  };
  const count = line.length;
  const extended = [extrapolate(line[2], line[1], line[0]), ...line, extrapolate(line[count - 3], line[count - 2], line[count - 1])];
  const result: Point[] = [];
  for (let i = 1; i < extended.length - 2; i++) {
    const a = extended[i], b = extended[i + 1];
    const previous = unit(delta(a, extended[i - 1])), direction = unit(delta(b, a)), next = unit(delta(extended[i + 2], b));
    const start = unit({ x: previous.x + direction.x, y: previous.y + direction.y });
    const end = unit({ x: direction.x + next.x, y: direction.y + next.y });
    const controlLength = distance(a, b) / (1 + start.x * direction.x + start.y * direction.y + end.x * direction.x + end.y * direction.y);
    const first = { x: a.x + start.x * controlLength, y: a.y + start.y * controlLength };
    const second = { x: b.x - end.x * controlLength, y: b.y - end.y * controlLength };
    for (let step = 0; step < 4; step++) {
      const t = step / 4, u = 1 - t;
      result.push({
        x: a.x * u ** 3 + 3 * first.x * u * u * t + 3 * second.x * u * t * t + b.x * t ** 3,
        y: a.y * u ** 3 + 3 * first.y * u * u * t + 3 * second.y * u * t * t + b.y * t ** 3,
      });
    }
  }
  result.push({ ...line[count - 1] });
  return result;
}

/** CurvedLabel.getRidgeSegment; all derived points stay separate from the city. */
export function originalLabelRidge(ridge: Point[], textLength: number): Point[] {
  if (ridge.length < 2) return ridge.slice();
  const total = length(ridge), available = total * 0.8;
  const padding = (total - (available > textLength ? (available + textLength) * 0.5 : available)) / 2;
  const first = along(ridge, padding), last = along(ridge, total - padding);
  const selected = [first.point, ...ridge.slice(first.index + 1, last.index + 1), last.point];
  simplify(selected);
  selected.unshift(ridge[0]);
  selected.push(ridge[ridge.length - 1]);
  const curve = smooth(selected).slice(4, -4);
  if (curve.length > 1 && curve[0].x > curve[curve.length - 1].x) curve.reverse();
  return curve;
}

export interface LabelLetter { text: string; point: Point; angle: number; size: number; baseline: number }

/** CurvedLabel.arrange: 27px base font, per-glyph scaling and extra tracking. */
export function layoutOriginalLabel(label: MapLabel, mapScale: number): LabelLetter[] {
  const characters = [...label.text.toUpperCase()];
  if (!characters.length || !label.path || label.path.length < 2) return [];
  const fontSize = 27 / mapScale;
  const widths = characters.map((character, index) => {
    const code = character.codePointAt(0)!;
    const next = characters[index + 1]?.codePointAt(0);
    return ((advances[code] ?? metrics.unitsPerEm * 0.6) + (next === undefined ? 0 : kerning[`${code},${next}`] ?? 0)) / metrics.unitsPerEm * fontSize;
  });
  const textLength = widths.reduce((total, width) => total + width, 0);
  if (!textLength) return [];
  const ridge = originalLabelRidge(label.path, textLength);
  if (ridge.length < 2) return [];
  const ridgeLength = length(ridge);
  let scale = ridgeLength / textLength, spacing = 0;
  if (scale > 1) {
    scale = Math.min(Math.sqrt(scale), 1.5);
    if (characters.length > 1) spacing = (ridgeLength - textLength * scale) / (characters.length - 1);
  }
  const start = (ridgeLength - (textLength * scale + spacing * (characters.length - 1))) / 2;
  let advance = 2 / mapScale;
  return characters.map((character, index) => {
    const position = along(ridge, start + (advance + widths[index] / 2) * scale + index * spacing);
    advance += widths[index];
    return { text: character, point: position.point, angle: position.angle, size: fontSize * scale,
      baseline: (metrics.ascent + metrics.descent) / (2 * metrics.unitsPerEm) * fontSize * scale };
  });
}
