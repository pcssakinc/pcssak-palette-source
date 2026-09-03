import { describe, expect, it } from 'vitest';
import {
  FREE_EXPORT_FORMATS,
  FREE_SAVE_LIMIT,
  isFreeFormat,
  isPro,
  PRO_PURCHASE_AVAILABLE,
  PRO_UI_AVAILABLE,
  PRO_SAVE_LIMIT,
} from './entitlement';

describe('무료·Pro 권한 경계', () => {
  it('공개 베타에서는 구매를 열지 않는다', () => {
    expect(PRO_PURCHASE_AVAILABLE).toBe(false);
    expect(PRO_UI_AVAILABLE).toBe(false);
  });

  it('무료 저장 한도와 무료 내보내기 형식이 의도한 범위로 고정된다', () => {
    expect(FREE_SAVE_LIMIT).toBe(10);
    expect(PRO_SAVE_LIMIT).toBe(60);
    expect(FREE_EXPORT_FORMATS).toEqual(['css', 'css-oklch']);
    expect(isFreeFormat('css')).toBe(true);
    expect(isFreeFormat('dtcg')).toBe(false);
    expect(isFreeFormat('custom')).toBe(false);
  });

  it('Lifetime Pro만 Pro 권한으로 판단한다', () => {
    expect(isPro('free')).toBe(false);
    expect(isPro('lifetime_pro')).toBe(true);
  });
});
