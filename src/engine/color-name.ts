import { parseToOklch } from './color';

export type ApproximateColorFamily =
  | 'neutral'
  | 'red'
  | 'orange'
  | 'brown'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'pink';

export type ApproximateLightness = 'very-dark' | 'dark' | 'medium' | 'light' | 'very-light';
export type ApproximateSaturation = 'neutral' | 'muted' | 'moderate' | 'vivid';
export type ApproximateColorConfidence = 'low' | 'medium' | 'high';

export interface ApproximateColorDescriptor {
  /** 색 이름은 관찰 조건과 개인차에 따라 달라질 수 있으므로 항상 근사값임을 명시합니다. */
  approximate: true;
  family: ApproximateColorFamily;
  alternativeFamily: ApproximateColorFamily | null;
  lightness: ApproximateLightness;
  saturation: ApproximateSaturation;
  confidence: ApproximateColorConfidence;
  oklch: {
    l: number;
    c: number;
    h: number;
  };
}

interface HueAnchor {
  family: Exclude<ApproximateColorFamily, 'neutral' | 'brown'>;
  hue: number;
}

interface RankedHue {
  family: HueAnchor['family'];
  distance: number;
  order: number;
}

// 간격이 균등하지 않은 이유는 OKLCH 색상각과 일상적인 색 이름의 범위가 일치하지 않기 때문입니다.
const HUE_ANCHORS: readonly HueAnchor[] = [
  { family: 'red', hue: 25 },
  { family: 'orange', hue: 60 },
  { family: 'yellow', hue: 100 },
  { family: 'lime', hue: 125 },
  { family: 'green', hue: 145 },
  { family: 'teal', hue: 175 },
  { family: 'cyan', hue: 205 },
  { family: 'blue', hue: 255 },
  { family: 'indigo', hue: 280 },
  { family: 'violet', hue: 300 },
  { family: 'purple', hue: 325 },
  { family: 'pink', hue: 350 },
] as const;

const NEUTRAL_CHROMA = 0.025;
const NEUTRAL_BOUNDARY_CHROMA = 0.04;

function normalizeHue(hue: number): number {
  const normalized = hue % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function circularHueDistance(a: number, b: number): number {
  const difference = Math.abs(normalizeHue(a) - normalizeHue(b));
  return Math.min(difference, 360 - difference);
}

function rankHueFamilies(hue: number): RankedHue[] {
  return HUE_ANCHORS.map(({ family, hue: anchorHue }, order) => ({
    family,
    distance: circularHueDistance(hue, anchorHue),
    order,
  })).sort((a, b) => a.distance - b.distance || a.order - b.order);
}

function classifyLightness(lightness: number): ApproximateLightness {
  if (lightness < 0.25) return 'very-dark';
  if (lightness < 0.45) return 'dark';
  if (lightness < 0.7) return 'medium';
  if (lightness < 0.88) return 'light';
  return 'very-light';
}

function classifySaturation(chroma: number): ApproximateSaturation {
  if (chroma < NEUTRAL_CHROMA) return 'neutral';
  if (chroma < 0.07) return 'muted';
  if (chroma < 0.16) return 'moderate';
  return 'vivid';
}

function isBrownRegion(lightness: number, chroma: number, hue: number): boolean {
  // 갈색은 독립된 색상각이라기보다 어두운 주황·황색 영역에 해당하는 지각 범주로 취급합니다.
  return lightness >= 0.22
    && lightness < 0.62
    && chroma >= NEUTRAL_CHROMA
    && chroma < 0.19
    && hue >= 35
    && hue <= 95;
}

function confidenceForHue(primary: RankedHue, secondary: RankedHue, chroma: number): ApproximateColorConfidence {
  // 두 중심점까지의 거리 차가 작을수록 색 이름 경계에 가까운 것으로 봅니다.
  const separation = secondary.distance - primary.distance;
  if (separation <= 4 || chroma < NEUTRAL_BOUNDARY_CHROMA) return 'low';
  if (separation <= 12 || chroma < 0.07) return 'medium';
  return 'high';
}

/**
 * CSS 색상을 사람이 이해하기 쉬운 근사 색 계열로 분류합니다.
 *
 * 반환값은 정확한 고유 색 이름이나 의학적 판정이 아니므로 UI에서 반드시 "계열" 또는 "근사"라는
 * 표현과 함께 표시해야 합니다. 입력을 해석할 수 없으면 null을 반환합니다.
 */
export function describeApproximateColor(input: string): ApproximateColorDescriptor | null {
  const parsed = parseToOklch(input);
  if (!parsed) return null;

  const hue = normalizeHue(parsed.h);
  const chroma = Math.max(0, parsed.c);
  const lightness = Math.max(0, Math.min(1, parsed.l));
  const ranked = rankHueFamilies(hue);
  const primary = ranked[0];
  const secondary = ranked[1];
  const lightnessName = classifyLightness(lightness);
  const saturation = classifySaturation(chroma);

  if (chroma < NEUTRAL_CHROMA) {
    return {
      approximate: true,
      family: 'neutral',
      alternativeFamily: chroma >= 0.015 ? primary.family : null,
      lightness: lightnessName,
      saturation,
      confidence: chroma >= 0.015 ? 'medium' : 'high',
      oklch: { l: lightness, c: chroma, h: hue },
    };
  }

  if (isBrownRegion(lightness, chroma, hue)) {
    const nearBrownBoundary = lightness >= 0.57
      || chroma < NEUTRAL_BOUNDARY_CHROMA
      || chroma >= 0.16
      || hue <= 42
      || hue >= 88;

    return {
      approximate: true,
      family: 'brown',
      alternativeFamily: nearBrownBoundary ? primary.family : null,
      lightness: lightnessName,
      saturation,
      confidence: nearBrownBoundary ? 'medium' : 'high',
      oklch: { l: lightness, c: chroma, h: hue },
    };
  }

  const confidence = confidenceForHue(primary, secondary, chroma);
  return {
    approximate: true,
    family: primary.family,
    alternativeFamily: confidence === 'high' ? null : secondary.family,
    lightness: lightnessName,
    saturation,
    confidence,
    oklch: { l: lightness, c: chroma, h: hue },
  };
}
