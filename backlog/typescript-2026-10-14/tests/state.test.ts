import { describe, expect, it } from 'vitest';
import { boundedInteger, cityQuery, DEFAULT_OPTIONS, escapeHtml, readOptions, readStyle } from '../src/state';
import { DEFAULT_STYLE } from '../src/render/map';

describe('shareable city state', () => {
  it('reconstructs every supplied original URL option without dropping false or zero', () => {
    const original = '?size=25&seed=924709892&citadel=1&urban_castle=0&plaza=1&temple=1&walls=1&shantytown=0&coast=0&river=0&greens=0&gates=-1';
    expect(readOptions(original)).toEqual(DEFAULT_OPTIONS);
    const changed = { ...DEFAULT_OPTIONS, seed: 1234, size: 90, citadel: false, temple: false, gates: 0, coast: true, river: true, shantytown: true };
    expect(readOptions(cityQuery(changed))).toEqual(changed);
  });

  it('keeps malformed query values bounded and preserves an explicit gate count of zero', () => {
    const options = readOptions('?size=Infinity&seed=NaN&gates=0&walls=undefined&coast=1');
    expect(options.size).toBe(DEFAULT_OPTIONS.size);
    expect(options.seed).toBe(DEFAULT_OPTIONS.seed);
    expect(options.gates).toBe(0);
    expect(options.walls).toBe(true);
    expect(options.coast).toBe(true);
    expect(readOptions('?size=999999&seed=-99').size).toBe(200);
    expect(readOptions('?urban_castle=1&citadel=0').citadel).toBe(false);
    expect(boundedInteger('', 25, 5, 200)).toBe(25);
  });

  it('round-trips original maximum-road mode and a resolved coast direction', () => {
    const options = { ...DEFAULT_OPTIONS, hub: true, gates: -1, sea: 1.7, coast: true, citadel: false, urban_castle: true };
    expect(readOptions(cityQuery(options))).toEqual(options);
    expect(readOptions('?hub=0&sea=0')).toEqual({ ...DEFAULT_OPTIONS, hub: false, sea: 0 });
    expect(readOptions('?hub=invalid&sea=NaN')).toEqual(DEFAULT_OPTIONS);
  });

  it('treats names as URL data and HTML text', () => {
    const name = '<img src=x onerror=alert(1)> & Market';
    const query = cityQuery(DEFAULT_OPTIONS, name, 'ink');
    expect(new URLSearchParams(query).get('name')).toBe(name);
    expect(escapeHtml(name)).not.toContain('<img');
  });

  it('validates stored style preferences and lets the permalink palette take precedence', () => {
    expect(readStyle(DEFAULT_STYLE, '', '{broken')).toEqual(DEFAULT_STYLE);
    expect(readStyle(DEFAULT_STYLE, '?style=ink', JSON.stringify({ palette: 'natural', grid: false, strokeWidth: 100, labels: 'false' }))).toEqual({ ...DEFAULT_STYLE, palette: 'ink', grid: false, strokeWidth: 2 });
    expect(readStyle(DEFAULT_STYLE, '?style=unknown', JSON.stringify({ palette: '<bad>', strokeWidth: null }))).toEqual(DEFAULT_STYLE);
  });
});
