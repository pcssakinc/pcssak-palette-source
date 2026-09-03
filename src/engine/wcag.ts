// WCAG 2.x relative-luminance, contrast, and lightness-solving. Exact formulas from
// WCAG 2.0/2.1 (unchanged in 2.2) — see docs/COLOR-ENGINE.md §4. These match any online checker.

import { hexToRgb, oklchToHex, oklchToRgb, type Rgb } from './color';
import type { TextOn } from './types';

/** WCAG relative luminance from gamma-encoded sRGB channels (0..1). */
export function relLuminance({ r, g, b }: Rgb): number {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast ratio (1..21) between two relative luminances. */
export function contrastRatio(lumA: number, lumB: number): number {
  const hi = Math.max(lumA, lumB);
  const lo = Math.min(lumA, lumB);
  return (hi + 0.05) / (lo + 0.05);
}

const LUM_WHITE = 1;
const LUM_BLACK = 0;

/** Contrast of an sRGB color vs pure white or black. */
export function contrastVs(rgb: Rgb, ref: 'white' | 'black'): number {
  return contrastRatio(relLuminance(rgb), ref === 'white' ? LUM_WHITE : LUM_BLACK);
}

/** WCAG 2.x contrast ratio (1..21) between any two hex/CSS colors. */
export function contrastBetween(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  return contrastRatio(relLuminance(a), relLuminance(b));
}

export interface BackgroundTextRecommendation {
  text: TextOn;
  textHex: '#000000' | '#ffffff';
  ratio: number;
}

/**
 * 지정 색을 배경으로 사용할 때 검정·흰색 중 실제 대비가 더 높은 글자색을 반환합니다.
 * 이는 해당 색 자체의 WCAG 적합 판정이 아니라, 이 배경과 이 글자색 조합에만 유효한 조건부 안내입니다.
 */
export function recommendTextOnBackground(backgroundHex: string): BackgroundTextRecommendation {
  const contrastBlack = contrastBetween(backgroundHex, '#000000');
  const contrastWhite = contrastBetween(backgroundHex, '#ffffff');
  if (contrastBlack >= contrastWhite) {
    return { text: 'black', textHex: '#000000', ratio: contrastBlack };
  }
  return { text: 'white', textHex: '#ffffff', ratio: contrastWhite };
}

/**
 * 대비 판정과 표시 숫자가 모순되지 않도록 지정 자릿수 아래를 보수적으로 버립니다.
 * 예를 들어 실제 4.499888:1을 4.500:1로 반올림해 합격처럼 보이지 않게 합니다.
 */
export function formatContrastRatio(ratio: number, fractionDigits = 3): string {
  const digits = Math.max(0, Math.min(10, Math.trunc(fractionDigits)));
  const scale = 10 ** digits;
  return (Math.floor(ratio * scale) / scale).toFixed(digits);
}

/** Contrast of an OKLCH color (gamut-mapped) vs white or black. */
export function contrastOklchVs(l: number, c: number, h: number, ref: 'white' | 'black'): number {
  return contrastVs(oklchToRgb(l, c, h), ref);
}

/** 최종 내보내기용 8비트 HEX로 양자화한 뒤 흰색 또는 검은색과의 대비를 계산합니다. */
export function contrastOklchHexVs(l: number, c: number, h: number, ref: 'white' | 'black'): number {
  return contrastBetween(oklchToHex(l, c, h), ref === 'white' ? '#ffffff' : '#000000');
}

/**
 * Move lightness L (holding C,H) so contrast vs `ref` just reaches `target`, staying as close
 * to `Lstart` as possible. Returns Lstart unchanged if it already passes. §4.3.
 *   vs white: contrast decreases as L rises → find the MAX L that still passes.
 *   vs black: contrast increases as L rises → find the MIN L that passes.
 */
export function solveLForContrast(
  c: number,
  h: number,
  ref: 'white' | 'black',
  target: number,
  Lstart: number,
): number {
  if (contrastOklchVs(Lstart, c, h, ref) >= target) return Lstart;
  let lo: number;
  let hi: number;
  if (ref === 'white') {
    lo = 0;
    hi = Lstart;
  } else {
    lo = Lstart;
    hi = 1;
  }
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const passes = contrastOklchVs(mid, c, h, ref) >= target;
    if (ref === 'white') {
      if (passes) lo = mid;
      else hi = mid;
    } else if (passes) hi = mid;
    else lo = mid;
  }
  return ref === 'white' ? lo : hi;
}

/**
 * 최종 8비트 HEX가 목표 대비를 실제로 만족하는 가장 가까운 명도를 찾습니다.
 * 통과·미통과 경계를 고정 횟수로 이분 탐색하고 항상 통과 쪽 경계를 반환합니다.
 */
export function solveLForHexContrast(
  c: number,
  h: number,
  ref: 'white' | 'black',
  target: number,
  Lstart: number,
): number {
  if (contrastOklchHexVs(Lstart, c, h, ref) >= target) return Lstart;

  let passing = ref === 'white' ? 0 : 1;
  let failing = Lstart;
  if (contrastOklchHexVs(passing, c, h, ref) < target) return passing;

  for (let i = 0; i < 32; i++) {
    const mid = (passing + failing) / 2;
    if (contrastOklchHexVs(mid, c, h, ref) >= target) passing = mid;
    else failing = mid;
  }
  return passing;
}

/**
 * Solve L so contrast vs `ref` equals `ratio` (Leonardo contrast-driven mode). §5.3.
 * Monotonic in L, so a plain binary search converges.
 */
export function solveLForRatio(c: number, h: number, ref: 'white' | 'black', ratio: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const cur = contrastOklchVs(mid, c, h, ref);
    if (ref === 'white') {
      // contrast decreasing in L: too much contrast → go lighter
      if (cur > ratio) lo = mid;
      else hi = mid;
    } else if (cur < ratio) lo = mid; // contrast increasing in L: too little → go lighter
    else hi = mid;
  }
  return (lo + hi) / 2;
}
