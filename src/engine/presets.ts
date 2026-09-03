// 세 램프 프리셋은 램프 및 WCAG 엔진에 전달하는 매개변수 묶음입니다.
// 동작과 매개변수의 출처는 docs/COLOR-ENGINE.md §5와 §9에 기록하며,
// 사용자에게 보이는 이름은 타사 제품명을 쓰지 않는 일반 용어로 유지합니다.

import { CHROMA_MUL, HUE_SHIFT, L_TABLE, LEONARDO_RATIOS, type Step } from './steps';
import type { PresetName } from './types';

export type RampMode = 'lightness' | 'contrast';

export interface PresetConfig {
  name: PresetName;
  label: string; // 사용자 화면용 일반 이름
  mode: RampMode;
  L: Record<Step, number>;
  chromaMul: Record<Step, number>;
  chromaCeiling: number;
  hueShift: Record<Step, number> | null;
  ratios?: Record<Step, number>; // 대비 모드에서만 사용
}

function lifted(base: Record<Step, number>, amt: number, steps: Step[]): Record<Step, number> {
  const out = { ...base };
  for (const s of steps) out[s] = Math.min(1, out[s] + amt);
  return out;
}
function scaled(base: Record<Step, number>, factor: number, steps: Step[]): Record<Step, number> {
  const out = { ...base };
  for (const s of steps) out[s] = out[s] * factor;
  return out;
}

export const PRESETS: Record<PresetName, PresetConfig> = {
  // Tailwind CSS v4의 OKLCH 50~950 단계와 호환되는 출력입니다.
  tailwind: {
    name: 'tailwind',
    label: 'Tailwind CSS-style',
    mode: 'lightness',
    L: { ...L_TABLE },
    chromaMul: { ...CHROMA_MUL },
    chromaCeiling: 0.16,
    hueShift: null, // 같은 색상군 안에서 색상각을 일정하게 유지함
  },
  // 차분한 채도와 완만한 색상각 이동, 밝은 틴트를 사용하는 균형형 UI 프리셋입니다.
  radix: {
    name: 'radix',
    label: 'Balanced UI',
    mode: 'lightness',
    L: lifted(L_TABLE, 0.005, [50, 100, 200]),
    chromaMul: scaled(CHROMA_MUL, 0.92, [500]),
    chromaCeiling: 0.15,
    hueShift: { ...HUE_SHIFT },
  },
  // 목표 대비율을 기준으로 각 단계를 계산하는 대비 우선 프리셋입니다.
  leonardo: {
    name: 'leonardo',
    label: 'Contrast-driven',
    mode: 'contrast',
    L: { ...L_TABLE }, // 대비 계산에 실패했을 때만 사용하는 대체값
    chromaMul: { ...CHROMA_MUL },
    chromaCeiling: 0.18,
    hueShift: { ...HUE_SHIFT },
    ratios: { ...LEONARDO_RATIOS },
  },
};
