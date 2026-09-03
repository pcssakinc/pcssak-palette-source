import type { Step } from './steps';

export type PresetName = 'tailwind' | 'radix' | 'leonardo';

export type TextOn = 'white' | 'black';

/** A single dominant color extracted from an image. */
export interface Swatch {
  hex: string;
  oklch: [number, number, number]; // [L(0..1), C, H(deg)]
  weight: number; // 0..1 population share
}

/** One rung of a generated ramp. */
export interface RampStep {
  step: Step;
  hex: string;
  oklch: [number, number, number]; // 최종 8비트 HEX에서 역산한 [L, C, H]
  contrastWhite: number; // ratio 1..21 vs white
  contrastBlack: number; // ratio 1..21 vs black
  bestText: TextOn; // v0.1.3 고정 글자색 보정 데이터 호환용이며 신규 용도 권장이 아님
  bestTextRatio: number; // 최종 8비트 HEX와 지정 글자색의 대비
  aa: boolean; // 반올림 전 지정 글자색 대비 >= 4.5
  aaLarge: boolean; // 반올림 전 지정 글자색 대비 >= 3(큰 글자 AA 기준)
  aaa: boolean; // >= 7   (AAA)
  corrected: boolean; // lightness was moved by WCAG/monotonicity adjustment
}

/** A full 50–950 ramp for one color family. */
export interface Ramp {
  name: string; // family name, e.g. "brand"
  seedHex: string;
  preset: PresetName;
  steps: RampStep[];
}

export interface BuildOptions {
  name?: string; // family name (default 'brand')
  enforceAA?: boolean; // v0.1.3 저장 팔레트를 같은 색으로 재현하는 레거시 호환 옵션
  hueShift?: boolean; // override the preset's hue-shift toggle
  chromaCeiling?: number; // override peak-chroma ceiling
}

export type ExportFormat =
  | 'tailwind' // v4 @theme, OKLCH
  | 'tailwind-hex' // v3 config, hex
  | 'css' // CSS custom properties, hex
  | 'css-oklch' // CSS custom properties, OKLCH
  | 'dtcg' // DTCG 디자인 토큰(JSON)
  | 'scss' // SCSS variables + map
  | 'custom'; // user-defined per-step template
