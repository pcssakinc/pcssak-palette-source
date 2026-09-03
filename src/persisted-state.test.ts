import { describe, expect, it } from 'vitest';
import { decodeStoredJson, resolveRoleReportPreference } from './persisted-state';

describe('persisted UI state', () => {
  const stringValue = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const booleanValue = (value: unknown) => (typeof value === 'boolean' ? value : undefined);

  it('keeps valid false and empty-string values', () => {
    expect(decodeStoredJson('false', true, booleanValue)).toBe(false);
    expect(decodeStoredJson('""', 'fallback', stringValue)).toBe('');
  });

  it('falls back for malformed JSON and valid JSON with the wrong type', () => {
    expect(decodeStoredJson('{broken', '#3b82f6', stringValue)).toBe('#3b82f6');
    expect(decodeStoredJson('123', '#3b82f6', stringValue)).toBe('#3b82f6');
    expect(decodeStoredJson('"false"', false, booleanValue)).toBe(false);
  });

  it('lets each setting reject values outside its own domain', () => {
    const hexValue = (value: unknown) => (
      typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined
    );
    expect(decodeStoredJson('"#8b5cf6"', '#3b82f6', hexValue)).toBe('#8b5cf6');
    expect(decodeStoredJson('"blue"', '#3b82f6', hexValue)).toBe('#3b82f6');
  });
});

describe('역할 시스템 보고서 포함 설정 마이그레이션', () => {
  it('새 키가 있으면 중간·공개 이전 키보다 우선하고 명시적인 false도 보존한다', () => {
    expect(resolveRoleReportPreference(true, false, false)).toBe(true);
    expect(resolveRoleReportPreference(false, true, true)).toBe(false);
  });

  it('새 키가 유효하지 않으면 중간 키, 그다음 공개 이전 키를 사용한다', () => {
    expect(resolveRoleReportPreference(undefined, true, false)).toBe(true);
    expect(resolveRoleReportPreference('true', false, true)).toBe(false);
    expect(resolveRoleReportPreference(null, 'false', true)).toBe(true);
  });

  it('어느 키에도 유효한 불리언이 없으면 안전한 기본값 false를 사용한다', () => {
    expect(resolveRoleReportPreference(undefined, null, 'true')).toBe(false);
    expect(resolveRoleReportPreference({}, [], 1)).toBe(false);
  });
});
