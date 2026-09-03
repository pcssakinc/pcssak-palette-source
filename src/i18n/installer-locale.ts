import {
  readSavedLocale,
  saveLocale,
  setInstallerStartupLocale,
} from './index';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const INSTALLER_LOCALE_TIMEOUT_MS = 800;

/**
 * 신규 설치기가 남긴 언어를 React 첫 렌더 전에 적용합니다.
 * 기존 사용자가 선택한 pg.locale이 있으면 네이티브 파일을 읽지도 않습니다.
 */
export async function prepareInstallerLocale(): Promise<void> {
  if (readSavedLocale() || !isTauriRuntime()) return;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const seedPromise = import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<unknown>('read_installer_locale_seed'));
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), INSTALLER_LOCALE_TIMEOUT_MS);
    });
    const seed = await Promise.race([seedPromise, timeoutPromise]);

    // 제한 시간 뒤 늦게 끝난 invoke는 이 분기까지 다시 들어오지 않으므로 설정을 덮어쓸 수 없습니다.
    // 대기 중 다른 경로에서 사용자 언어가 생긴 경우에도 그 값을 최우선으로 보존합니다.
    if (seed === null || readSavedLocale()) return;
    const locale = setInstallerStartupLocale(seed);
    if (locale) saveLocale(locale);
  } catch {
    // 설치 파일이 없거나 네이티브 호출이 실패하면 기존 운영체제 언어 감지를 사용합니다.
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
