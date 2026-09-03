// 적록·청황 색각 이상 유형과 흑백 참고 화면에서 팔레트가 어떻게 달라질 수 있는지 근사합니다.
// 아래 고정 행렬을 선형광 RGB에 적용하며 외부 연결이나 추가 실행 의존성은 없습니다.
// 디자인 검토 보조이며 의료 진단·개인 시각 예측·전체 접근성 인증이 아닙니다.

import { parseToOklch } from './color';

export type CvdType = 'normal' | 'protan' | 'deutan' | 'tritan' | 'mono';

// 수치 원자료: Colour의 Machado 표에서 세 유형의 강도 1.0 행렬을 선택했습니다.
// https://github.com/colour-science/colour/blob/907242acd5e514a94b626a9dcf4bfe953aa0b8dc/colour/blindness/datasets/machado2010.py
// Copyright 2013 Colour Developers. 원자료 BSD-3-Clause 고지를 보존합니다.
// 대조 자료: DaltonLens-Python의 동일 행렬(정수 키 10)이며 MIT 고지를 함께 보존합니다.
// https://github.com/DaltonLens/DaltonLens-Python/blob/3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d/daltonlens/simulate.py
// 2026-09-03 공개 준비에서 두 고정판을 다시 취득해 기존 계수 27개와 모두 일치함을 확인했습니다.
// 최초 취득 경로를 소급해 확정한 것은 아닙니다. 배열 평탄화·숫자 표기만 정리했고 값은 유지합니다.
// 상세 근거와 원문 고지는 공개 후보의 docs/COLOR-PROVENANCE.md 및 licenses/reference/에 둡니다.
const MAT: Record<'protan' | 'deutan' | 'tritan', readonly number[]> = {
  protan: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deutan: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.011820, 0.042940, 0.968881,
  ],
  tritan: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.303900,
  ],
};

function srgbToLinear(u: number): number {
  const x = u / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function linearToByte(x: number): number {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** 입력 색을 해당 유형의 참고용 근사 화면 색으로 변환합니다. 개인 시각을 예측하지 않습니다. */
export function simulateHex(hex: string, type: CvdType): string {
  if (type === 'normal') return hex;
  const [r8, g8, b8] = hexToRgb(hex);
  if (type === 'mono') {
    // 선형광 RGB의 Rec.709 휘도를 회색으로 표시하는 참고 화면이며 특정 색각 상태의 재현이 아닙니다.
    const y = 0.2126 * srgbToLinear(r8) + 0.7152 * srgbToLinear(g8) + 0.0722 * srgbToLinear(b8);
    const g = linearToByte(y);
    return toHex(g, g, g);
  }
  const m = MAT[type];
  const r = srgbToLinear(r8);
  const g = srgbToLinear(g8);
  const b = srgbToLinear(b8);
  return toHex(
    linearToByte(m[0] * r + m[1] * g + m[2] * b),
    linearToByte(m[3] * r + m[4] * g + m[5] * b),
    linearToByte(m[6] * r + m[7] * g + m[8] * b),
  );
}

export type MatchLevel = 'same' | 'risk' | 'distinct';

/**
 * 단위 스케일 OKLab 거리와 정상 시야 대비 축소율을 함께 사용하는 제품 검토 휴리스틱입니다.
 * WCAG 합격 기준이나 의학적 색각 진단 경계가 아니며, 사용자가 추가 검토할 후보를 줄이는
 * 용도로만 사용합니다.
 */
export const MATCH_SAME_DISTANCE = 0.04;
export const MATCH_REVIEW_DISTANCE = 0.08;
export const MATCH_RELATIVE_COLLAPSE_RATIO = 0.25;
/** 기존 호출부 호환용 이름입니다. 새 코드에서는 MATCH_REVIEW_DISTANCE를 사용합니다. */
export const MATCH_RISK_DISTANCE = MATCH_REVIEW_DISTANCE;

/** 두 HEX의 OKLab 거리를 계산하며 무채색과 숫자가 아닌 색상각을 안전하게 처리합니다. */
export function oklabDistance(hexA: string, hexB: string): number {
  const A = parseToOklch(hexA);
  const B = parseToOklch(hexB);
  if (!A || !B) return Infinity;
  const ax = A.c && !Number.isNaN(A.h) ? A.c * Math.cos((A.h * Math.PI) / 180) : 0;
  const ay = A.c && !Number.isNaN(A.h) ? A.c * Math.sin((A.h * Math.PI) / 180) : 0;
  const bx = B.c && !Number.isNaN(B.h) ? B.c * Math.cos((B.h * Math.PI) / 180) : 0;
  const by = B.c && !Number.isNaN(B.h) ? B.c * Math.sin((B.h * Math.PI) / 180) : 0;
  return Math.sqrt((A.l - B.l) ** 2 + (ax - bx) ** 2 + (ay - by) ** 2);
}

/**
 * 두 색의 시뮬레이션 후 거리를 분류합니다. 0.04 미만은 거의 같은 색으로 보고, 0.08 미만의
 * 경계 영역은 정상 시야 거리의 25% 이하로 축소된 경우에만 검토 대상으로 분류합니다.
 */
export function classifyCvdMatch(
  dist: number,
  normalDist: number,
  type: CvdType,
): MatchLevel {
  if (dist < MATCH_SAME_DISTANCE) return 'same';
  if (type === 'normal') return dist < MATCH_REVIEW_DISTANCE ? 'risk' : 'distinct';
  const collapseRatio = normalDist > 0 ? dist / normalDist : Infinity;
  return dist < MATCH_REVIEW_DISTANCE && collapseRatio <= MATCH_RELATIVE_COLLAPSE_RATIO
    ? 'risk'
    : 'distinct';
}

export interface CvdComparison {
  a: string;
  b: string;
  dist: number;
  normalDist: number;
  collapseRatio: number;
  level: MatchLevel;
}

export function compareUnder(
  hexA: string,
  hexB: string,
  type: CvdType,
): CvdComparison {
  const a = simulateHex(hexA, type);
  const b = simulateHex(hexB, type);
  const dist = oklabDistance(a, b);
  const normalDist = oklabDistance(hexA, hexB);
  const collapseRatio = normalDist > 0 ? dist / normalDist : dist === 0 ? 0 : Infinity;
  const level = classifyCvdMatch(dist, normalDist, type);
  return { a, b, dist, normalDist, collapseRatio, level };
}

// 원본과 비교해 차이가 축소되는 근사 화면 유형을 검사합니다.
// 'normal'은 비교 기준이므로 이 목록에서 제외하며 개인의 실제 구분 능력을 판정하지 않습니다.
const SCAN_TYPES: readonly Exclude<CvdType, 'normal'>[] = ['protan', 'deutan', 'tritan', 'mono'];

/** 검사할 이름 또는 용도가 지정된 색입니다. 성공·위험 등은 검사 결과가 아닌 역할 이름입니다. */
export interface NamedColor {
  role: string;
  hex: string;
}

export interface ConfusionByType {
  type: Exclude<CvdType, 'normal'>;
  level: MatchLevel;
  dist: number;
  /** 정상 시야 OKLab 거리에 대한 시뮬레이션 후 거리의 비율입니다. */
  collapseRatio: number;
}

/**
 * 동일 HEX는 역할 수와 무관하게 하나의 duplicate 항목으로 묶습니다. simulation 항목은
 * 서로 다른 두 색이 특정 근사 시뮬레이션에서 가까워진 경우입니다.
 */
export interface ConfusionPair {
  kind: 'duplicate' | 'simulation';
  /** 왼쪽 색을 공유하는 역할 묶음입니다. */
  aMembers: NamedColor[];
  /** 오른쪽 색을 공유하는 역할 묶음이며 duplicate 항목에서는 비어 있습니다. */
  bMembers: NamedColor[];
  /** 양쪽 역할을 합친 기존 호환 필드입니다. */
  members: NamedColor[];
  a: NamedColor;
  b: NamedColor;
  normalDist: number;
  worst: ConfusionByType; // 두 색의 근사 거리가 가장 작은 유형
  byType: ConfusionByType[]; // 상세 화면에 표시할 전체 검사 유형
}

/**
 * 색 쌍을 순서 없이 한 번씩 검사해 하나 이상의 근사 화면에서 검토가 필요한 쌍을 반환합니다.
 * 제품 휴리스틱의 'same'·'risk'만 거리순으로 정렬합니다.
 * compareUnder를 이용한 결정론적 로컬 검사이며 의학적 판정이 아닙니다.
 */
export function scanConfusion(colors: NamedColor[]): ConfusionPair[] {
  const valid = colors
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex.trim()))
    .map((c) => ({ ...c, hex: c.hex.trim().toLowerCase() }));
  const pairs: ConfusionPair[] = [];
  const byHex = new Map<string, NamedColor[]>();

  for (const color of valid) {
    const members = byHex.get(color.hex) ?? [];
    members.push(color);
    byHex.set(color.hex, members);
  }

  const uniqueGroups = [...byHex.entries()].map(([hex, members]) => ({ hex, members }));

  // 같은 HEX를 공유하는 역할은 N×(N-1)/2개 쌍으로 부풀리지 않고 한 그룹으로 보고합니다.
  for (const { members } of uniqueGroups) {
    if (members.length < 2) continue;
    const byType: ConfusionByType[] = SCAN_TYPES.map((type) => ({
      type,
      level: 'same',
      dist: 0,
      collapseRatio: 0,
    }));
    pairs.push({
      kind: 'duplicate',
      aMembers: members,
      bMembers: [],
      members,
      a: members[0],
      b: members[1],
      normalDist: 0,
      worst: byType[0],
      byType,
    });
  }

  // 시뮬레이션 비교도 역할이 아니라 고유 HEX 그룹 단위로 한 번만 수행합니다.
  for (let i = 0; i < uniqueGroups.length; i++) {
    for (let j = i + 1; j < uniqueGroups.length; j++) {
      const left = uniqueGroups[i];
      const right = uniqueGroups[j];
      const normalDist = oklabDistance(left.hex, right.hex);
      const byType: ConfusionByType[] = SCAN_TYPES.map((type) => {
        const r = compareUnder(left.hex, right.hex, type);
        return { type, level: r.level, dist: r.dist, collapseRatio: r.collapseRatio };
      });
      const risky = byType.filter((x) => x.level === 'same' || x.level === 'risk');
      if (risky.length === 0) continue;
      const worst = risky.reduce((m, x) => (x.dist < m.dist ? x : m), risky[0]);
      pairs.push({
        kind: 'simulation',
        aMembers: left.members,
        bMembers: right.members,
        members: [...left.members, ...right.members],
        a: left.members[0],
        b: right.members[0],
        normalDist,
        worst,
        byType,
      });
    }
  }
  pairs.sort((p, q) => {
    if (p.kind !== q.kind) return p.kind === 'duplicate' ? -1 : 1;
    return p.worst.dist - q.worst.dist;
  });
  return pairs;
}
