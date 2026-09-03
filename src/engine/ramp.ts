// The ramp generator: seed color + preset → 11 gamut-mapped, WCAG-annotated steps.
// Deterministic: same (seed, preset, options) in ⇒ byte-identical ramp out.

import { STEPS, type Step } from './steps';
import { PRESETS } from './presets';
import { oklchToHex, parseToOklch } from './color';
import { contrastBetween, solveLForHexContrast, solveLForRatio } from './wcag';
import { sanitizeTokenName } from './name';
import type { BuildOptions, PresetName, Ramp, RampStep, TextOn } from './types';

const AA = 4.5;
// 브라우저·디자인 도구 사이의 부동소수점 차이를 흡수하는 자동 보정 전용 최소 여유입니다.
const AA_CORRECTION_TARGET = 4.501;
const AA_LARGE = 3;
const AAA = 7;
const MIN_GAP = 0.006; // minimal L gap to keep the ramp strictly monotonic

// A solid step (>=500) is used as a fill under WHITE text; a light step (<500) is a tint under
// BLACK text. That role decides which contrast actually matters (best-of-black-or-white is
// mathematically always >= ~4.58, so it can never "fail" — a useless metric).
function roleTextFor(step: number): TextOn {
  return step >= 500 ? 'white' : 'black';
}

export function buildRamp(seedInput: string, presetName: PresetName, opts: BuildOptions = {}): Ramp {
  const seed = parseToOklch(seedInput);
  if (!seed) throw new Error(`Invalid color: "${seedInput}"`);

  const preset = PRESETS[presetName];
  const H = seed.h;
  const ceiling = opts.chromaCeiling ?? preset.chromaCeiling;
  const Cpeak = Math.min(seed.c, ceiling);
  const useHueShift = opts.hueShift ?? preset.hueShift != null;
  // Leonardo ratios (steps.ts) are calibrated against a WHITE background, which yields a
  // correct light→dark ramp. A black reference would invert lightness and collide with the
  // monotonic-decreasing enforcement below, so the reference is fixed to white.
  const bg = 'white' as const;

  // 1) target L, C, H per step
  const Ls = {} as Record<Step, number>;
  const Cs = {} as Record<Step, number>;
  const Hs = {} as Record<Step, number>;
  for (const step of STEPS) {
    const hShift = useHueShift && preset.hueShift ? preset.hueShift[step] : 0;
    const h = H + hShift;
    const c = Cpeak * preset.chromaMul[step];
    const l =
      preset.mode === 'contrast' && preset.ratios
        ? solveLForRatio(c, h, bg, preset.ratios[step])
        : preset.L[step];
    Ls[step] = l;
    Cs[step] = c;
    Hs[step] = h;
  }

  // 2) 선택적 WCAG AA 보정: 최종 8비트 HEX와 지정 글자색의 대비가 4.5 이상이 되도록 조정합니다.
  const corrected = {} as Record<Step, boolean>;
  for (const step of STEPS) corrected[step] = false;
  if (opts.enforceAA) {
    for (const step of STEPS) {
      const ref = roleTextFor(step);
      const cur = contrastBetween(
        oklchToHex(Ls[step], Cs[step], Hs[step]),
        ref === 'white' ? '#ffffff' : '#000000',
      );
      if (cur < AA_CORRECTION_TARGET) {
        const newL = solveLForHexContrast(Cs[step], Hs[step], ref, AA_CORRECTION_TARGET, Ls[step]);
        if (Math.abs(newL - Ls[step]) > 1e-4) {
          Ls[step] = newL;
          corrected[step] = true;
        }
      }
    }
  }

  // 3) enforce strictly-decreasing lightness (a valid ramp is monotone light→dark)
  for (let i = 1; i < STEPS.length; i++) {
    const prev = STEPS[i - 1];
    const cur = STEPS[i];
    if (Ls[cur] >= Ls[prev] - MIN_GAP) {
      Ls[cur] = Math.max(0.001, Ls[prev] - MIN_GAP);
      corrected[cur] = true;
    }
  }

  // 4) 단조성 보정 뒤에도 최종 HEX가 AA를 만족하도록 경계값을 다시 확인합니다.
  // 검은 글자 단계의 상향은 앞쪽 밝은 단계로, 흰 글자 단계의 하향은 뒤쪽 어두운 단계로
  // 필요한 만큼만 전파하므로 단조성을 깨뜨리지 않습니다.
  if (opts.enforceAA) {
    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];
      const ref = roleTextFor(step);
      const textHex = ref === 'white' ? '#ffffff' : '#000000';
      const currentHex = oklchToHex(Ls[step], Cs[step], Hs[step]);
      if (contrastBetween(currentHex, textHex) >= AA_CORRECTION_TARGET) continue;

      Ls[step] = solveLForHexContrast(
        Cs[step],
        Hs[step],
        ref,
        AA_CORRECTION_TARGET,
        Ls[step],
      );
      corrected[step] = true;
      if (ref === 'black') {
        for (let j = i - 1; j >= 0; j--) {
          const required = Math.min(1, Ls[STEPS[j + 1]] + MIN_GAP);
          if (Ls[STEPS[j]] >= required) break;
          Ls[STEPS[j]] = required;
          corrected[STEPS[j]] = true;
        }
      } else {
        for (let j = i + 1; j < STEPS.length; j++) {
          const required = Math.max(0.001, Ls[STEPS[j - 1]] - MIN_GAP);
          if (Ls[STEPS[j]] <= required) break;
          Ls[STEPS[j]] = required;
          corrected[STEPS[j]] = true;
        }
      }
    }
  }

  // 5) 최종 HEX를 먼저 확정하고 모든 대비 수치와 플래그를 그 HEX에서 산출합니다.
  const steps: RampStep[] = STEPS.map((step) => {
    const l = Ls[step];
    const c = Cs[step];
    const h = ((Hs[step] % 360) + 360) % 360;
    const hex = oklchToHex(l, c, h);
    // 모든 내보내기 형식이 같은 실제 색을 가리키도록 최종 HEX에서 OKLCH를 다시 산출합니다.
    // 소수 자릿수를 임의로 줄이지 않아 Tailwind/CSS OKLCH에서도 대비 경계가 달라지지 않습니다.
    const exportedOklch = parseToOklch(hex);
    if (!exportedOklch) throw new Error(`Failed to convert generated color: "${hex}"`);
    const contrastWhite = contrastBetween(hex, '#ffffff');
    const contrastBlack = contrastBetween(hex, '#000000');
    // Judge each step against the text color it is actually used with (role-based).
    const roleText = roleTextFor(step);
    const roleRatio = roleText === 'white' ? contrastWhite : contrastBlack;
    return {
      step,
      hex,
      oklch: [exportedOklch.l, exportedOklch.c, exportedOklch.h],
      contrastWhite,
      contrastBlack,
      bestText: roleText,
      bestTextRatio: roleRatio,
      aa: roleRatio >= AA,
      aaLarge: roleRatio >= AA_LARGE,
      aaa: roleRatio >= AAA,
      corrected: corrected[step],
    };
  });

  return {
    name: sanitizeTokenName(opts.name),
    seedHex: oklchToHex(seed.l, seed.c, H),
    preset: presetName,
    steps,
  };
}
