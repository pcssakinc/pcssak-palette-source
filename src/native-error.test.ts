import { describe, expect, it } from 'vitest';
import { parseNativeError } from './native-error';

describe('native error bridge', () => {
  const payload = {
    code: 'imageTooLargeBytes',
    params: { actualMb: '41', maxMb: '40' },
  };

  it('accepts a structured Tauri rejection', () => {
    expect(parseNativeError(payload)).toEqual(payload);
  });

  it('accepts JSON strings and Error.message wrappers', () => {
    expect(parseNativeError(JSON.stringify(payload))).toEqual(payload);
    expect(parseNativeError(new Error(JSON.stringify(payload)))).toEqual(payload);
  });

  it('rejects unknown shapes and strips unsafe param values', () => {
    expect(parseNativeError('plain operating-system error')).toBeNull();
    expect(parseNativeError({ code: 'fileReadFailed', params: { detail: {}, retry: 1 } })).toEqual({
      code: 'fileReadFailed',
      params: { retry: 1 },
    });
  });
});
