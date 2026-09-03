import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseLibrary } from './history';

describe('palette library import', () => {
  afterEach(() => {
    vi.doUnmock('@tauri-apps/api/core');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('fills safe defaults for partial legacy entries', () => {
    const entries = parseLibrary(JSON.stringify([{ seed: ' #3b82f6 ', preset: 'tailwind' }]));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: '',
      seed: '#3b82f6',
      preset: 'tailwind',
      enforceAA: false,
    });
    expect(entries[0].id).toBeTruthy();
    expect(entries[0].createdAt).toEqual(expect.any(Number));
  });

  it('rejects entries that cannot safely recreate a palette', () => {
    expect(() => parseLibrary(JSON.stringify([{ seed: '#3b82f6', preset: 'unknown' }]))).toThrow('No palettes found');
    expect(() => parseLibrary(JSON.stringify([{ name: 'Missing seed', preset: 'tailwind' }]))).toThrow('No palettes found');
  });

  it('reassigns imported ids to avoid collisions with the current library', () => {
    const entries = parseLibrary(JSON.stringify([{ id: 'existing-id', name: 'Brand', seed: '#3b82f6', preset: 'radix', enforceAA: true, createdAt: 1 }]));

    expect(entries[0].id).not.toBe('existing-id');
    expect(entries[0]).toMatchObject({ name: 'Brand', preset: 'radix', enforceAA: true, createdAt: 1 });
  });

  it('데스크톱 네이티브 저장 실패를 브라우저 저장소로 우회하지 않는다', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('localStorage', { setItem, getItem: vi.fn(), removeItem: vi.fn() });
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockRejectedValue(JSON.stringify({ code: 'libraryLimitExceeded', params: { limit: '10' } })),
    }));
    vi.resetModules();

    const { saveLibrary } = await import('./history');
    await expect(saveLibrary([{
      id: 'one',
      name: 'Brand',
      seed: '#3b82f6',
      preset: 'tailwind',
      enforceAA: false,
      createdAt: 1,
    }])).rejects.toBeTruthy();
    expect(setItem).not.toHaveBeenCalled();
  });
});
