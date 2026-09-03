import { describe, expect, it } from 'vitest';
import { describeApproximateColor } from '../color-name';

describe('근사 색 이름 분류', () => {
  it('해석할 수 없는 색상은 null을 반환한다', () => {
    expect(describeApproximateColor('#12xyz9')).toBeNull();
    expect(describeApproximateColor('')).toBeNull();
  });

  it('무채색은 밝기와 무채색 채도 정보를 함께 반환한다', () => {
    expect(describeApproximateColor('#808080')).toMatchObject({
      approximate: true,
      family: 'neutral',
      alternativeFamily: null,
      lightness: 'medium',
      saturation: 'neutral',
      confidence: 'high',
    });
  });

  it('0도와 360도 색상각을 같은 계열로 순환 처리한다', () => {
    const zero = describeApproximateColor('oklch(70% 0.2 0)');
    const fullTurn = describeApproximateColor('oklch(70% 0.2 360)');

    expect(zero?.family).toBe(fullTurn?.family);
    expect(zero?.alternativeFamily).toBe(fullTurn?.alternativeFamily);
    expect(zero?.confidence).toBe(fullTurn?.confidence);
    expect(zero?.oklch.h).toBe(0);
    expect(fullTurn?.oklch.h).toBe(0);
  });

  it('대표 갈색과 분홍색을 서로 다른 근사 계열로 분류한다', () => {
    expect(describeApproximateColor('#8b4513')).toMatchObject({
      family: 'brown',
      alternativeFamily: null,
      confidence: 'high',
      approximate: true,
    });
    expect(describeApproximateColor('#ff69b4')).toMatchObject({
      family: 'pink',
      approximate: true,
    });
  });

  it('갈색 경계에 가까운 경우에만 대안 색 계열을 함께 제공한다', () => {
    expect(describeApproximateColor('oklch(58% 0.1 60)')).toMatchObject({
      family: 'brown',
      alternativeFamily: 'orange',
      confidence: 'medium',
    });
  });

  it('두 계열 경계에서는 낮은 신뢰도와 대안 계열을 제공한다', () => {
    const boundary = describeApproximateColor('oklch(70% 0.2 80)');

    expect(boundary?.family).toBe('orange');
    expect(boundary?.alternativeFamily).toBe('yellow');
    expect(boundary?.confidence).toBe('low');
  });

  it('같은 입력에는 항상 완전히 같은 구조를 반환한다', () => {
    const first = describeApproximateColor('#2563eb');
    const second = describeApproximateColor('#2563eb');

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
