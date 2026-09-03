// Post-processing of raw dominant colors coming from the (Rust) extractor:
// merge near-duplicates, drop noise, rank by weight, and pick the seed brand color. §2.3.

import { parseToOklch } from './color';
import type { Swatch } from './types';

/** Raw swatch as returned by the native extractor. OKLCH is recomputed in JS for consistency. */
export interface RawSwatch {
  hex: string;
  weight: number;
}

const NEUTRAL_CHROMA = 0.03; // below this, a color reads as near-gray
const NOISE_FLOOR = 0.015; // discard clusters holding < 1.5% of pixels

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Two swatches are "the same color" if very close in OKLab, or same hue+lightness. */
function near(a: Swatch, b: Swatch): boolean {
  const [la, ca, ha] = a.oklch;
  const [lb, cb, hb] = b.oklch;
  const dEuclid = Math.hypot(
    la - lb,
    ca * Math.cos(rad(ha)) - cb * Math.cos(rad(hb)),
    ca * Math.sin(rad(ha)) - cb * Math.sin(rad(hb)),
  );
  if (dEuclid < 0.02) return true;
  // Same hue + lightness is only "the same color" if chroma is also close — otherwise a vivid
  // color could be merged into (and lost behind) a muted one of the same hue.
  return hueDiff(ha, hb) < 8 && Math.abs(la - lb) < 0.05 && Math.abs(ca - cb) < 0.03;
}

/** Merge near-duplicates, normalize weights, drop noise, sort by weight desc. */
export function refineSwatches(raw: RawSwatch[]): Swatch[] {
  const parsed: Swatch[] = [];
  for (const r of raw) {
    const o = parseToOklch(r.hex);
    if (!o) continue;
    parsed.push({ hex: r.hex, oklch: [o.l, o.c, o.h], weight: Math.max(0, r.weight) });
  }

  const merged: Swatch[] = [];
  for (const s of parsed.sort((a, b) => b.weight - a.weight)) {
    const hit = merged.find((m) => near(m, s));
    if (hit) hit.weight += s.weight;
    else merged.push({ ...s });
  }

  const total = merged.reduce((sum, m) => sum + m.weight, 0) || 1;
  return merged
    .map((m) => ({ ...m, weight: m.weight / total }))
    .filter((m) => m.weight >= NOISE_FLOOR)
    .sort((a, b) => b.weight - a.weight);
}

/** The seed brand color: highest-weight non-neutral swatch, else the highest-weight one. */
export function pickSeed(swatches: Swatch[]): Swatch | null {
  if (swatches.length === 0) return null;
  return swatches.find((s) => s.oklch[1] >= NEUTRAL_CHROMA) ?? swatches[0];
}
