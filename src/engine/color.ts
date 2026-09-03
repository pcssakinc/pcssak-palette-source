// Thin, deterministic wrappers over culori (MIT). All color-space math lives here so the
// rest of the engine never re-implements conversions. culori implements CSS Color 4 / OKLCH.

import { clampChroma, converter, formatHex, oklch, parse } from 'culori';

export interface Oklch {
  mode: 'oklch';
  l: number;
  c: number;
  h: number;
}
export interface Rgb {
  r: number; // 0..1 (gamma-encoded sRGB)
  g: number;
  b: number;
}

const toRgb = converter('rgb');

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Parse any CSS color string / hex into OKLCH. Returns null if invalid. */
export function parseToOklch(input: string): Oklch | null {
  if (!input) return null;
  const parsed = parse(input.trim());
  if (!parsed) return null;
  const o = oklch(parsed);
  if (!o || typeof o.l !== 'number' || Number.isNaN(o.l)) return null;
  return { mode: 'oklch', l: o.l, c: o.c ?? 0, h: o.h ?? 0 };
}

/** Reduce chroma (holding L,H) until the color is inside the sRGB gamut — §3.5. */
export function toGamutOklch(l: number, c: number, h: number): Oklch {
  const clamped = clampChroma({ mode: 'oklch', l, c, h }, 'oklch', 'rgb') as
    | { l?: number; c?: number; h?: number }
    | undefined;
  return {
    mode: 'oklch',
    l: clamped?.l ?? l,
    c: clamped?.c ?? 0,
    h: clamped?.h ?? h,
  };
}

/** Convert OKLCH → in-gamut sRGB (channels 0..1). */
export function oklchToRgb(l: number, c: number, h: number): Rgb {
  const g = toGamutOklch(l, c, h);
  const rgb = toRgb(g) as { r: number; g: number; b: number };
  return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) };
}

/** Convert OKLCH → "#rrggbb" (always in gamut, never clipped). */
export function oklchToHex(l: number, c: number, h: number): string {
  return formatHex(toGamutOklch(l, c, h)) ?? '#000000';
}

/** Parse any hex/CSS color into gamma-encoded sRGB (0..1). Returns null if invalid. */
export function hexToRgb(input: string): Rgb | null {
  const parsed = parse(input?.trim());
  if (!parsed) return null;
  const rgb = toRgb(parsed) as { r: number; g: number; b: number };
  return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) };
}
