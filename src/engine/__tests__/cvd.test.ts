import { describe, expect, it } from 'vitest';
import {
  MATCH_RELATIVE_COLLAPSE_RATIO,
  MATCH_REVIEW_DISTANCE,
  MATCH_SAME_DISTANCE,
  classifyCvdMatch,
  compareUnder,
  scanConfusion,
} from '../cvd';

describe('CVD 제품 검토 휴리스틱', () => {
  it('거리 경계와 정상 시야 대비 축소율을 함께 적용한다', () => {
    expect(classifyCvdMatch(MATCH_SAME_DISTANCE - 0.0001, 0.4, 'deutan')).toBe('same');
    expect(classifyCvdMatch(MATCH_SAME_DISTANCE, 0.16, 'deutan')).toBe('risk');
    expect(classifyCvdMatch(MATCH_REVIEW_DISTANCE - 0.0001, 0.4, 'deutan')).toBe('risk');
    expect(classifyCvdMatch(MATCH_REVIEW_DISTANCE, 0.4, 'deutan')).toBe('distinct');
    expect(classifyCvdMatch(0.06, 0.2, 'deutan')).toBe('distinct');
    expect(0.06 / 0.2).toBeGreaterThan(MATCH_RELATIVE_COLLAPSE_RATIO);
  });

  it('실제 화면의 초록·빨강 조합은 원본보다 크게 축소된 듀탄 계열 근사 결과만 검토한다', () => {
    const normal = compareUnder('#16a34a', '#dc2626', 'normal');
    const deutan = compareUnder('#16a34a', '#dc2626', 'deutan');

    expect(normal.level).toBe('distinct');
    expect(deutan.level).toBe('risk');
    expect(deutan.dist).toBeLessThan(MATCH_REVIEW_DISTANCE);
    expect(deutan.collapseRatio).toBeLessThanOrEqual(MATCH_RELATIVE_COLLAPSE_RATIO);
  });

  it('동일 HEX를 역할별 쌍으로 부풀리지 않고 하나의 명시적 그룹으로 묶는다', () => {
    const result = scanConfusion([
      { role: 'warning', hex: '#2563EB' },
      { role: 'info', hex: ' #2563eb ' },
      { role: 'selection', hex: '#2563eb' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('duplicate');
    expect(result[0].aMembers.map((color) => color.role)).toEqual(['warning', 'info', 'selection']);
    expect(result[0].bMembers).toEqual([]);
    expect(result[0].members.map((color) => color.role)).toEqual(['warning', 'info', 'selection']);
    expect(result[0].members.every((color) => color.hex === '#2563eb')).toBe(true);
  });

  it('같은 색 역할은 다른 색과도 고유 HEX 그룹 단위로 한 번만 비교한다', () => {
    const result = scanConfusion([
      { role: 'success', hex: '#16a34a' },
      { role: 'warning', hex: '#dc2626' },
      { role: 'info', hex: '#dc2626' },
    ]);
    const duplicates = result.filter((pair) => pair.kind === 'duplicate');
    const simulations = result.filter((pair) => pair.kind === 'simulation');

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].members.map((color) => color.role)).toEqual(['warning', 'info']);
    expect(simulations).toHaveLength(1);
    expect(simulations[0].aMembers.map((color) => color.role)).toEqual(['success']);
    expect(simulations[0].bMembers.map((color) => color.role)).toEqual(['warning', 'info']);
    expect(simulations[0].members.map((color) => color.role)).toEqual(['success', 'warning', 'info']);
  });
});
