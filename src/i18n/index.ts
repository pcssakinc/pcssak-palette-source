// 의존성 없는 경량 국제화 모듈입니다. 영문을 기준으로 삼고 빠진 번역은 영문으로 대체합니다.

import { en, type Dict, type MsgKey } from './en';
import ko from './locales/ko';
import ja from './locales/ja';
import zhHans from './locales/zh-Hans';
import zhHant from './locales/zh-Hant';
import de from './locales/de';
import ru from './locales/ru';
import fr from './locales/fr';
import es from './locales/es';
import es419 from './locales/es-419';
import pt419 from './locales/pt-419';
import tr from './locales/tr';
import { roleTranslations } from './roles';
import { workflowTranslations } from './workflow';
import { roleWorkspaceTranslations } from './role-workspace';
import { systemTranslations } from './system';
import { tutorialTranslations } from './tutorial';
import { legalTranslations } from './legal';
import { updateTranslations } from './update';
import { accessibilityTranslations } from './accessibility';

export type Locale =
  | 'en' | 'ko' | 'ja' | 'zh-Hans' | 'zh-Hant'
  | 'fr' | 'de' | 'ru' | 'es' | 'es-419' | 'pt-BR' | 'tr';

export interface LocaleMeta {
  code: Locale;
  label: string; // 언어 선택기에 해당 언어의 고유 이름으로 표시합니다.
  tier: 1 | 2 | 3; // 1은 출시, 2는 출시 후, 3은 수요 확인 후 대상입니다.
}

export const LOCALES: LocaleMeta[] = [
  { code: 'en', label: 'English', tier: 1 },
  { code: 'ko', label: '한국어', tier: 1 },
  { code: 'ja', label: '日本語', tier: 1 },
  { code: 'zh-Hans', label: '简体中文', tier: 1 },
  { code: 'zh-Hant', label: '繁體中文', tier: 1 },
  { code: 'fr', label: 'Français', tier: 1 },
  { code: 'de', label: 'Deutsch', tier: 1 },
  { code: 'ru', label: 'Русский', tier: 1 },
  { code: 'es', label: 'Español', tier: 1 },
  { code: 'es-419', label: 'Español (LatAm)', tier: 1 },
  { code: 'pt-BR', label: 'Português (Brasil)', tier: 1 },
  { code: 'tr', label: 'Türkçe', tier: 1 },
];

// 기능별 카탈로그를 합친 언어만 선택기에 표시합니다. 추가 방법은 docs/I18N.md를 따릅니다.
const catalogs: Record<Locale, Partial<Dict>> = {
  en,
  ko: { ...roleTranslations.ko, ...workflowTranslations.ko, ...roleWorkspaceTranslations.ko, ...systemTranslations.ko, ...tutorialTranslations.ko, ...legalTranslations.ko, ...updateTranslations.ko, ...ko, ...accessibilityTranslations.ko },
  ja: { ...roleTranslations.ja, ...workflowTranslations.ja, ...roleWorkspaceTranslations.ja, ...systemTranslations.ja, ...tutorialTranslations.ja, ...legalTranslations.ja, ...updateTranslations.ja, ...ja, ...accessibilityTranslations.ja },
  'zh-Hans': { ...roleTranslations['zh-Hans'], ...workflowTranslations['zh-Hans'], ...roleWorkspaceTranslations['zh-Hans'], ...systemTranslations['zh-Hans'], ...tutorialTranslations['zh-Hans'], ...legalTranslations['zh-Hans'], ...updateTranslations['zh-Hans'], ...zhHans, ...accessibilityTranslations['zh-Hans'] },
  'zh-Hant': { ...roleTranslations['zh-Hant'], ...workflowTranslations['zh-Hant'], ...roleWorkspaceTranslations['zh-Hant'], ...systemTranslations['zh-Hant'], ...tutorialTranslations['zh-Hant'], ...legalTranslations['zh-Hant'], ...updateTranslations['zh-Hant'], ...zhHant, ...accessibilityTranslations['zh-Hant'] },
  fr: { ...roleTranslations.fr, ...workflowTranslations.fr, ...roleWorkspaceTranslations.fr, ...systemTranslations.fr, ...tutorialTranslations.fr, ...legalTranslations.fr, ...updateTranslations.fr, ...fr, ...accessibilityTranslations.fr },
  de: { ...roleTranslations.de, ...workflowTranslations.de, ...roleWorkspaceTranslations.de, ...systemTranslations.de, ...tutorialTranslations.de, ...legalTranslations.de, ...updateTranslations.de, ...de, ...accessibilityTranslations.de },
  ru: { ...roleTranslations.ru, ...workflowTranslations.ru, ...roleWorkspaceTranslations.ru, ...systemTranslations.ru, ...tutorialTranslations.ru, ...legalTranslations.ru, ...updateTranslations.ru, ...ru, ...accessibilityTranslations.ru },
  es: { ...roleTranslations.es, ...workflowTranslations.es, ...roleWorkspaceTranslations.es, ...systemTranslations.es, ...tutorialTranslations.es, ...legalTranslations.es, ...updateTranslations.es, ...es, ...accessibilityTranslations.es },
  'es-419': { ...roleTranslations['es-419'], ...workflowTranslations['es-419'], ...roleWorkspaceTranslations['es-419'], ...systemTranslations['es-419'], ...tutorialTranslations['es-419'], ...legalTranslations['es-419'], ...updateTranslations['es-419'], ...es419, ...accessibilityTranslations['es-419'] },
  // 대형 번역 원본의 기존 키는 유지하되 외부에 노출·저장하는 BCP 47 코드는 pt-BR로 통일합니다.
  'pt-BR': { ...roleTranslations['pt-419'], ...workflowTranslations['pt-419'], ...roleWorkspaceTranslations['pt-419'], ...systemTranslations['pt-419'], ...tutorialTranslations['pt-419'], ...legalTranslations['pt-419'], ...updateTranslations['pt-419'], ...pt419, ...accessibilityTranslations['pt-419'] },
  tr: { ...roleTranslations.tr, ...workflowTranslations.tr, ...roleWorkspaceTranslations.tr, ...systemTranslations.tr, ...tutorialTranslations.tr, ...legalTranslations.tr, ...updateTranslations.tr, ...tr, ...accessibilityTranslations.tr },
};

const STORAGE_KEY = 'pg.locale';
let installerStartupLocale: Locale | null = null;

function isLocale(x: string): x is Locale {
  return Object.prototype.hasOwnProperty.call(catalogs, x);
}

function isReadyLocale(locale: Locale): boolean {
  return locale === 'en' || Object.keys(catalogs[locale]).length > 0;
}

/** 외부에서 읽은 값을 허용된 앱 언어 코드로만 정규화합니다. */
export function parseLocale(value: unknown): Locale | null {
  if (value === 'pt-419') return 'pt-BR';
  return typeof value === 'string' && isLocale(value) && isReadyLocale(value) ? value : null;
}

/** 손상되거나 지원하지 않는 저장값은 기존 설정으로 인정하지 않습니다. */
export function readSavedLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const locale = parseLocale(stored);
    // v0.1.3까지 사용한 비표준 지역 코드는 읽기 호환만 제공하고 즉시 표준 코드로 정리합니다.
    if (stored === 'pt-419' && locale === 'pt-BR') {
      try {
        localStorage.setItem(STORAGE_KEY, locale);
      } catch {
        // 저장이 막혀도 현재 실행에서는 정규화된 언어를 계속 사용합니다.
      }
    }
    return locale;
  } catch {
    return null;
  }
}

/**
 * 설치기가 남긴 언어는 현재 프로세스의 첫 렌더에만 사용하는 보조값입니다.
 * 저장된 사용자 설정보다 우선하지 않으며 허용 목록 밖의 값은 거부합니다.
 */
export function setInstallerStartupLocale(value: unknown): Locale | null {
  installerStartupLocale = parseLocale(value);
  return installerStartupLocale;
}

/**
 * 브라우저 언어 태그를 실제 제공 카탈로그에 연결합니다.
 * 중국어는 문자 체계와 지역을, 스페인어는 스페인과 중남미를 명시적으로 구분합니다.
 */
function resolveBrowserLocale(language: string): Locale {
  const normalized = language.trim().replace(/_/g, '-').toLowerCase();
  const exact = LOCALES.find((locale) => locale.code.toLowerCase() === normalized);
  if (exact && isReadyLocale(exact.code)) return exact.code;

  const parts = normalized.split('-').filter(Boolean);
  const base = parts[0] ?? 'en';

  if (base === 'zh') {
    if (parts.includes('hant')) return 'zh-Hant';
    if (parts.includes('hans')) return 'zh-Hans';
    if (parts.some((part) => part === 'tw' || part === 'hk' || part === 'mo')) return 'zh-Hant';
    return 'zh-Hans';
  }

  if (base === 'pt') return 'pt-BR';

  if (base === 'es') {
    if (parts.length === 1 || parts.slice(1).includes('es')) return 'es';
    return 'es-419';
  }

  const prefixMatch = LOCALES.find((locale) =>
    isReadyLocale(locale.code) && locale.code.split('-')[0].toLowerCase() === base);
  return prefixMatch?.code ?? 'en';
}

/**
 * 지정 언어의 번역기를 만듭니다. 빠진 키는 영문으로, 영문에도 없는 동적 키는 키 자체로
 * 대체해 번역 하나가 빠져도 앱 전체가 중단되지 않게 합니다.
 */
export function createT(locale: Locale) {
  const dict = catalogs[locale] ?? {};
  return (key: MsgKey, vars?: Record<string, string | number>): string => {
    let s: string = (dict[key] as string | undefined) ?? en[key] ?? key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
      }
    }
    return s;
  };
}

/** 저장된 설정 → 운영체제 언어 완전 일치 → 언어 접두사 일치 → 영문 순으로 선택합니다. */
export function detectLocale(): Locale {
  const saved = readSavedLocale();
  if (saved) return saved;
  if (installerStartupLocale) return installerStartupLocale;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return resolveBrowserLocale(nav);
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* 저장소를 사용할 수 없어도 현재 실행 중 선택은 유지합니다. */
  }
}

/** 실제 번역이 있는 언어만 선택기에 노출합니다. */
export function readyLocales(): LocaleMeta[] {
  return LOCALES.filter((l) => isReadyLocale(l.code));
}

export type { MsgKey };
