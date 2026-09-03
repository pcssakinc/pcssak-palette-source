import type { ExportFormat } from './engine';

export type LicenseTier = 'free' | 'lifetime_pro';
export type EntitlementSource = 'public_free' | 'internal_pro' | 'store_pending' | 'browser_development';
export type DistributionChannel = 'development' | 'beta' | 'store' | 'standalone';
export type UpdateChannel = 'github' | 'store' | 'none';

export interface EntitlementStatus {
  tier: LicenseTier;
  source: EntitlementSource;
  distribution: DistributionChannel;
  updateChannel: UpdateChannel;
}

/** Free 사용자가 라이브러리에 보관할 수 있는 팔레트 수입니다. Rust에서도 다시 검사합니다. */
export const FREE_SAVE_LIMIT = 10;

/** Pro 사용자가 라이브러리에 보관할 수 있는 팔레트 수입니다. */
export const PRO_SAVE_LIMIT = 60;

/** CSS 변수 복사는 무료이고 프레임워크·팀 전달 형식은 Pro입니다. */
export const FREE_EXPORT_FORMATS: readonly ExportFormat[] = ['css', 'css-oklch'];
export function isFreeFormat(format: ExportFormat): boolean {
  return FREE_EXPORT_FORMATS.includes(format);
}

/** 얼리 액세스 Founder 영구 라이선스 안내 가격입니다. */
export const PRO_PRICE = '$39.99';

/** Microsoft Store 권한 연동이 완료될 때까지 공개 베타에서는 결제를 열지 않습니다. */
export const PRO_PURCHASE_AVAILABLE = false;

/**
 * 현재 공개판은 Free 전용 화면으로 배포합니다.
 * 유료판을 준비할 때만 빌드 환경에서 명시적으로 켜야 하며, 기본 빌드에는 잠금·가격·구매 UI가 나타나지 않습니다.
 */
export const PRO_UI_AVAILABLE = import.meta.env.VITE_ENABLE_PRO_UI === 'true';

export const PRO_FEATURE_KEYS = [
  'pro.feat.exports',
  'pro.feat.report',
  'pro.feat.autofix',
  'pro.feat.libraryLimit',
  'pro.feat.customTemplate',
  'pro.feat.ase',
] as const;

const DEV_KEY = 'dev-license-tier';

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function browserDevelopmentTier(): LicenseTier {
  if (!PRO_UI_AVAILABLE || !import.meta.env.DEV || isTauriRuntime()) return 'free';
  try {
    return localStorage.getItem(DEV_KEY) === 'lifetime_pro' ? 'lifetime_pro' : 'free';
  } catch {
    return 'free';
  }
}

export function initialEntitlement(): EntitlementStatus {
  return {
    tier: browserDevelopmentTier(),
    source: import.meta.env.DEV && !isTauriRuntime() ? 'browser_development' : 'public_free',
    distribution: import.meta.env.DEV ? 'development' : 'standalone',
    updateChannel: 'none',
  };
}

/**
 * Tauri 앱에서는 Rust만 권한을 결정합니다. 브라우저 개발 화면에서만 로컬 전환을 허용합니다.
 */
export async function resolveEntitlement(): Promise<EntitlementStatus> {
  if (!isTauriRuntime()) return initialEntitlement();
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<EntitlementStatus>('get_entitlement_status');
}

export function isPro(tier: LicenseTier): boolean {
  return tier === 'lifetime_pro';
}

/** 브라우저 기반 UI 개발 전용이며 Tauri 실행 파일의 권한은 바꾸지 못합니다. */
export function setDevTier(tier: LicenseTier): void {
  if (!PRO_UI_AVAILABLE || !import.meta.env.DEV || isTauriRuntime()) return;
  try {
    localStorage.setItem(DEV_KEY, tier);
  } catch {
    /* 저장소 사용 불가 시 Free 상태를 유지합니다. */
  }
}
