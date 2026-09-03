import {
  compareUnder,
  contrastBetween,
  createRolePalette,
  nearestContrastHex,
  normalizeRolePalette,
  oklabDistance,
  roleEquals,
  setRoleColor,
  type CvdType,
  type RolePalette,
} from './engine';
export { resolveRoleReportPreference } from './persisted-state';

export interface ContrastSafeBadgeColors {
  color: '#000000' | '#ffffff';
  background: '#000000' | '#ffffff';
  ratio: number;
}

/** 사용자가 붙여 넣은 앞뒤 공백을 제거하고 유효한 6자리 HEX만 소문자로 정규화합니다. */
export function normalizeHex6(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

export interface RoleWorkspaceMetaV1 {
  version: 1;
  status: 'not-started' | 'legacy-unconfirmed' | 'active';
  source: 'example' | 'pair' | 'legacy' | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRoleWorkspaceMeta(value: unknown): RoleWorkspaceMetaV1 | null {
  if (!isRecord(value) || value.version !== 1) return null;

  if (value.status === 'not-started' && value.source === null) {
    return { version: 1, status: 'not-started', source: null };
  }
  if (value.status === 'legacy-unconfirmed' && value.source === 'legacy') {
    return { version: 1, status: 'legacy-unconfirmed', source: 'legacy' };
  }
  if (
    value.status === 'active'
    && (value.source === 'example' || value.source === 'pair' || value.source === 'legacy')
  ) {
    return { version: 1, status: 'active', source: value.source };
  }
  return null;
}

/**
 * 저장된 역할 작업 메타를 검증하고, 없거나 손상됐으면 실제 역할 팔레트에서 안전하게 유도합니다.
 * 기본 예시와 완전히 같더라도 유효한 active 메타가 있으면 사용자가 시작한 작업으로 유지합니다.
 * 반대로 색이나 잠금이 기본값과 다르면 잘못된 not-started 메타보다 기존 작업 보존을 우선합니다.
 */
export function deriveRoleWorkspaceMeta(
  storedMeta: unknown,
  rolePalette: unknown,
): RoleWorkspaceMetaV1 {
  const normalizedPalette = normalizeRolePalette(rolePalette);
  const hasExistingWork = !roleEquals(normalizedPalette, createRolePalette());
  const normalizedMeta = normalizeRoleWorkspaceMeta(storedMeta);

  if (hasExistingWork && normalizedMeta?.status === 'not-started') {
    return { version: 1, status: 'legacy-unconfirmed', source: 'legacy' };
  }
  if (normalizedMeta) return normalizedMeta;
  return hasExistingWork
    ? { version: 1, status: 'legacy-unconfirmed', source: 'legacy' }
    : { version: 1, status: 'not-started', source: null };
}

/**
 * 유효한 실제 글자·배경 두 색을 역할 팔레트에 한 번 복사합니다.
 * text와 background의 HEX만 바꾸며 나머지 다섯 역할과 일곱 역할의 잠금은 모두 보존합니다.
 */
export function importPairIntoRolePalette(
  rolePalette: RolePalette,
  foreground: string,
  background: string,
): RolePalette | null {
  const normalizedForeground = normalizeHex6(foreground);
  const normalizedBackground = normalizeHex6(background);
  if (!normalizedForeground || !normalizedBackground) return null;

  const withText = setRoleColor(rolePalette, 'text', normalizedForeground);
  return setRoleColor(withText, 'background', normalizedBackground);
}

/** 제품 UI 글자는 검정과 흰색 중 실제 대비가 더 높은 색을 사용합니다. */
export function readableTextOn(hex: string): '#ffffff' | '#000000' {
  return contrastBetween('#ffffff', hex) >= contrastBetween('#000000', hex) ? '#ffffff' : '#000000';
}

/**
 * 반투명 배지 배경 때문에 상위 견본에서 계산한 글자 대비가 무너지지 않도록
 * 배지 자체에는 완전 불투명한 검정·흰색 조합을 사용합니다.
 */
export function contrastSafeBadgeColors(hex: string): ContrastSafeBadgeColors {
  const color = readableTextOn(hex);
  const background = color === '#000000' ? '#ffffff' : '#000000';
  return {
    color,
    background,
    ratio: contrastBetween(color, background),
  };
}

/** 경계값 아래의 원시 대비가 반올림으로 통과처럼 보이지 않도록 표시값을 내립니다. */
export function conservativeContrastValue(ratio: number): number {
  return Math.floor(ratio * 10_000) / 10_000;
}

export interface PairContrastCandidate {
  before: string;
  after: string;
  ratio: number;
}

export interface PairContrastCandidates {
  foreground: PairContrastCandidate | null;
  background: PairContrastCandidate | null;
}

export type PairRole = 'foreground' | 'background';
export type PairContrastTarget = 3 | 4.5 | 7;
export type PairRecommendationSource = 'adjusted' | 'palette' | 'black-white';

export interface PairPaletteCandidate {
  step: number;
  hex: string;
}

export interface PairRoleRecommendation {
  source: PairRecommendationSource;
  hex: string;
  /** 반올림하지 않은 WCAG 대비값입니다. */
  ratio: number;
  /** 현재 팔레트에서 가져온 후보일 때만 존재합니다. */
  step?: number;
}

export interface FixedRoleContrastRecommendationRequest {
  fixedRole: PairRole;
  fixedHex: string;
  otherHex: string;
  palette: readonly PairPaletteCandidate[];
  target: PairContrastTarget;
  maxPaletteCandidates?: number;
}

export type ActualPairState = 'empty' | 'invalid' | 'pass' | 'fail';

export interface ActualPairCheck {
  state: ActualPairState;
  foreground: string | null;
  background: string | null;
  foregroundInvalid: boolean;
  backgroundInvalid: boolean;
  ratio: number | null;
}

export interface ActualPairVisionPreview {
  type: CvdType;
  foreground: string;
  background: string;
}

const ACTUAL_PAIR_VISION_TYPES: readonly CvdType[] = [
  'normal',
  'protan',
  'deutan',
  'tritan',
  'mono',
];

/** 빈 입력과 잘못된 입력을 구분하고, 실제 두 색이 모두 유효할 때만 대비 판정을 만듭니다. */
export function evaluateActualPair(foreground: string, background: string): ActualPairCheck {
  const normalizedForeground = normalizeHex6(foreground);
  const normalizedBackground = normalizeHex6(background);
  const foregroundInvalid = foreground.trim().length > 0 && normalizedForeground === null;
  const backgroundInvalid = background.trim().length > 0 && normalizedBackground === null;

  if (foregroundInvalid || backgroundInvalid) {
    return {
      state: 'invalid',
      foreground: normalizedForeground,
      background: normalizedBackground,
      foregroundInvalid,
      backgroundInvalid,
      ratio: null,
    };
  }

  if (!normalizedForeground || !normalizedBackground) {
    return {
      state: 'empty',
      foreground: normalizedForeground,
      background: normalizedBackground,
      foregroundInvalid: false,
      backgroundInvalid: false,
      ratio: null,
    };
  }

  const ratio = contrastBetween(normalizedForeground, normalizedBackground);
  return {
    state: ratio >= 4.5 ? 'pass' : 'fail',
    foreground: normalizedForeground,
    background: normalizedBackground,
    foregroundInvalid: false,
    backgroundInvalid: false,
    ratio,
  };
}

/**
 * 실제 글자·배경 두 색만 사용해 일반·색각 유형별 근사 미리보기 값을 만듭니다.
 * 별도 UI 역할 팔레트를 입력받거나 변경하지 않으므로 저장된 역할색에 부작용이 없습니다.
 */
export function buildActualPairVisionPreviews(
  foreground: string,
  background: string,
): ActualPairVisionPreview[] | null {
  const pair = evaluateActualPair(foreground, background);
  if (!pair.foreground || !pair.background || pair.state === 'invalid' || pair.state === 'empty') {
    return null;
  }
  const normalizedForeground = pair.foreground;
  const normalizedBackground = pair.background;

  return ACTUAL_PAIR_VISION_TYPES.map((type) => {
    const preview = compareUnder(normalizedForeground, normalizedBackground, type);
    return {
      type,
      foreground: preview.a,
      background: preview.b,
    };
  });
}

/**
 * v0.1.3이 저장한 현재 AA 보정 선택값만 호환 모드로 복원합니다.
 * 값이 없거나 손상된 신규 설치에서는 false 기본값을 사용하도록 undefined를 반환합니다.
 */
export function decodeLegacyEnforceAA(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * 사용자가 명시한 글자·배경 조합이 목표에 미달할 때 두 비파괴 후보를 계산합니다.
 * 한쪽 색만 바꿔 목표에 도달할 수 없는 방향은 null로 반환합니다.
 * 입력 객체나 원본 HEX는 바꾸지 않으며 실제 적용 여부는 UI에서 사용자가 결정합니다.
 */
export function buildPairContrastCandidates(
  foreground: string,
  background: string,
  minimum = 4.501,
): PairContrastCandidates | null {
  const normalizedForeground = normalizeHex6(foreground);
  const normalizedBackground = normalizeHex6(background);
  if (!normalizedForeground || !normalizedBackground) return null;
  if (contrastBetween(normalizedForeground, normalizedBackground) >= minimum) return null;

  const nextForeground = nearestContrastHex(normalizedForeground, normalizedBackground, minimum);
  const nextBackground = nearestContrastHex(normalizedBackground, normalizedForeground, minimum);
  const foregroundRatio = contrastBetween(nextForeground, normalizedBackground);
  const backgroundRatio = contrastBetween(normalizedForeground, nextBackground);
  return {
    foreground: nextForeground !== normalizedForeground && foregroundRatio >= minimum
      ? {
          before: normalizedForeground,
          after: nextForeground,
          ratio: foregroundRatio,
        }
      : null,
    background: nextBackground !== normalizedBackground && backgroundRatio >= minimum
      ? {
          before: normalizedBackground,
          after: nextBackground,
          ratio: backgroundRatio,
        }
      : null,
  };
}

function isPairContrastTarget(value: number): value is PairContrastTarget {
  return value === 3 || value === 4.5 || value === 7;
}

/**
 * 팔레트에서 선택한 한 색을 고정하고 반대 역할에만 적용할 대비 후보를 만듭니다.
 *
 * 팔레트 후보 정렬은 현재 반대색이 유효하면 그 색과의 OKLab 거리가 가까운 순서입니다.
 * 현재 반대색이 없으면 목표 대비를 적게 초과하는 순서이며, 동률은 원래 팔레트 순서,
 * 단계 번호, HEX 순서로 해소합니다. 후보 전체 우선순위는 현재색 최소 변경, 팔레트,
 * 검정·흰색 중 대비가 높은 색 순이고 HEX 중복은 한 번만 제시합니다.
 *
 * 반환값 `null`은 요청 자체가 잘못된 경우이고, 빈 배열은 유효한 요청이지만 고정색으로
 * 해당 목표 대비에 도달할 수 없는 경우입니다. 입력 객체와 배열은 변경하지 않습니다.
 */
export function buildFixedRoleContrastRecommendations({
  fixedRole,
  fixedHex,
  otherHex,
  palette,
  target,
  maxPaletteCandidates = 3,
}: FixedRoleContrastRecommendationRequest): PairRoleRecommendation[] | null {
  if ((fixedRole !== 'foreground' && fixedRole !== 'background') || !isPairContrastTarget(target)) return null;

  const normalizedFixed = normalizeHex6(fixedHex);
  if (!normalizedFixed) return null;

  const normalizedOther = normalizeHex6(otherHex);
  const blackRatio = contrastBetween(normalizedFixed, '#000000');
  const whiteRatio = contrastBetween(normalizedFixed, '#ffffff');
  const maximumRatio = Math.max(blackRatio, whiteRatio);
  if (maximumRatio < target) return [];

  const recommendations: PairRoleRecommendation[] = [];
  const usedHexes = new Set<string>();
  const currentOtherRatio = normalizedOther
    ? contrastBetween(normalizedFixed, normalizedOther)
    : null;
  // 이미 적용 중인 통과색은 대안 목록에서 제외해 다른 후보만 비교할 수 있게 합니다.
  if (normalizedOther && currentOtherRatio !== null && currentOtherRatio >= target) {
    usedHexes.add(normalizedOther);
  }
  const addRecommendation = (recommendation: PairRoleRecommendation): boolean => {
    if (
      recommendation.hex === normalizedFixed
      || recommendation.ratio < target
      || usedHexes.has(recommendation.hex)
    ) {
      return false;
    }
    recommendations.push(recommendation);
    usedHexes.add(recommendation.hex);
    return true;
  };

  if (normalizedOther && currentOtherRatio !== null && currentOtherRatio < target) {
    const adjusted = normalizeHex6(nearestContrastHex(normalizedOther, normalizedFixed, target));
    if (adjusted) {
      addRecommendation({
        source: 'adjusted',
        hex: adjusted,
        ratio: contrastBetween(normalizedFixed, adjusted),
      });
    }
  }

  const paletteLimit = Math.max(0, Math.trunc(maxPaletteCandidates));
  const seenPaletteHexes = new Set<string>();
  const rankedPalette = palette.flatMap((item, index) => {
    const hex = normalizeHex6(item.hex);
    if (!hex || hex === normalizedFixed || seenPaletteHexes.has(hex)) return [];
    seenPaletteHexes.add(hex);

    const ratio = contrastBetween(normalizedFixed, hex);
    if (ratio < target) return [];
    return [{
      source: 'palette' as const,
      hex,
      ratio,
      step: item.step,
      index,
      distance: normalizedOther ? oklabDistance(normalizedOther, hex) : Number.POSITIVE_INFINITY,
      excess: ratio - target,
    }];
  }).sort((left, right) => {
    if (normalizedOther) {
      const distanceDifference = left.distance - right.distance;
      if (Math.abs(distanceDifference) > 1e-12) return distanceDifference;
    } else {
      const excessDifference = left.excess - right.excess;
      if (Math.abs(excessDifference) > 1e-12) return excessDifference;
    }
    return left.index - right.index || left.step - right.step || left.hex.localeCompare(right.hex);
  });

  let paletteAdded = 0;
  for (const { index: _index, distance: _distance, excess: _excess, ...candidate } of rankedPalette) {
    if (paletteAdded >= paletteLimit) break;
    if (addRecommendation(candidate)) paletteAdded++;
  }

  const readableHex = blackRatio >= whiteRatio ? '#000000' : '#ffffff';
  addRecommendation({
    source: 'black-white',
    hex: readableHex,
    ratio: Math.max(blackRatio, whiteRatio),
  });

  return recommendations;
}
