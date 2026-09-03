import { afterEach, describe, expect, it, vi } from 'vitest';

describe('설치 언어 첫 실행 연동', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@tauri-apps/api/core');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // 첫 콜드 로드는 12개 언어 모듈 변환 시간을 포함하므로 제품의 800ms 읽기 제한과 별도로 여유를 둡니다.
  it('기존 사용자 언어가 있으면 설치 언어를 읽거나 덮어쓰지 않는다', async () => {
    const invoke = vi.fn();
    const setItem = vi.fn();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'ko'),
      setItem,
    });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
    vi.resetModules();

    const { prepareInstallerLocale } = await import('./installer-locale');
    await prepareInstallerLocale();

    expect(invoke).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  }, 15_000);

  it.each([
    'en', 'ko', 'ja', 'zh-Hans', 'zh-Hant', 'fr',
    'de', 'ru', 'es', 'es-419', 'pt-BR', 'tr',
  ])('신규 설치의 허용된 언어 %s를 첫 렌더 전에 저장한다', async (seed) => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem,
    });
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockResolvedValue(seed),
    }));
    vi.resetModules();

    const { prepareInstallerLocale } = await import('./installer-locale');
    const { detectLocale } = await import('./index');
    await prepareInstallerLocale();

    expect(setItem).toHaveBeenCalledWith('pg.locale', seed);
    expect(detectLocale()).toBe(seed);
  });

  it('과거 설치 seed의 pt-419를 pt-BR로 정규화해 저장한다', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem,
    });
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockResolvedValue('pt-419'),
    }));
    vi.resetModules();

    const { prepareInstallerLocale } = await import('./installer-locale');
    const { detectLocale } = await import('./index');
    await prepareInstallerLocale();

    expect(setItem).toHaveBeenCalledWith('pg.locale', 'pt-BR');
    expect(detectLocale()).toBe('pt-BR');
  });

  it('허용 목록 밖의 파일 값은 저장하지 않고 운영체제 언어로 대체한다', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem,
    });
    vi.stubGlobal('navigator', { language: 'ja-JP' });
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn().mockResolvedValue('../../ko'),
    }));
    vi.resetModules();

    const { prepareInstallerLocale } = await import('./installer-locale');
    const { detectLocale } = await import('./index');
    await prepareInstallerLocale();

    expect(setItem).not.toHaveBeenCalled();
    expect(detectLocale()).toBe('ja');
  });

  it('설치 없이 실행한 브라우저에서는 네이티브 파일을 읽지 않는다', async () => {
    const invoke = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
    vi.resetModules();

    const { prepareInstallerLocale } = await import('./installer-locale');
    await prepareInstallerLocale();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('네이티브 읽기가 800ms를 넘으면 운영체제 언어로 시작하고 늦은 결과를 무시한다', async () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    let resolveInvoke: (value: unknown) => void = () => undefined;
    const invokeResult = new Promise((resolve) => {
      resolveInvoke = resolve;
    });
    const invoke = vi.fn(() => invokeResult);
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem,
    });
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    vi.doMock('@tauri-apps/api/core', () => ({ invoke }));
    vi.resetModules();

    const { prepareInstallerLocale } = await import('./installer-locale');
    const { detectLocale } = await import('./index');
    const preparation = prepareInstallerLocale();
    await vi.advanceTimersByTimeAsync(801);
    await preparation;

    expect(setItem).not.toHaveBeenCalled();
    expect(detectLocale()).toBe('fr');
    expect(vi.getTimerCount()).toBe(0);

    resolveInvoke('ko');
    await Promise.resolve();
    expect(setItem).not.toHaveBeenCalled();
    expect(detectLocale()).toBe('fr');
  });

  it('네이티브 읽기 대기 중 생긴 사용자 설정도 설치 언어보다 우선한다', async () => {
    let savedLocale: string | null = null;
    let resolveInvoke: (value: unknown) => void = () => undefined;
    const invokeResult = new Promise((resolve) => {
      resolveInvoke = resolve;
    });
    const setItem = vi.fn();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => savedLocale),
      setItem,
    });
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(() => invokeResult),
    }));
    vi.resetModules();

    const { prepareInstallerLocale } = await import('./installer-locale');
    const preparation = prepareInstallerLocale();
    await Promise.resolve();
    savedLocale = 'de';
    resolveInvoke('ko');
    await preparation;

    expect(setItem).not.toHaveBeenCalled();
  });
});
