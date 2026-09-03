import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from './en';
import {
  createT,
  detectLocale,
  LOCALES,
  parseLocale,
  readSavedLocale,
  readyLocales,
  type Locale,
} from './index';
import { roleTranslations } from './roles';
import { workflowTranslations } from './workflow';
import { roleWorkspaceTranslations } from './role-workspace';
import { systemTranslations } from './system';
import { tutorialTranslations } from './tutorial';
import { legalTranslations } from './legal';
import { updateTranslations } from './update';
import { accessibilityTranslations } from './accessibility';
import koCatalog from './locales/ko';
import jaCatalog from './locales/ja';
import zhHansCatalog from './locales/zh-Hans';
import zhHantCatalog from './locales/zh-Hant';
import frCatalog from './locales/fr';
import deCatalog from './locales/de';
import ruCatalog from './locales/ru';
import es419Catalog from './locales/es-419';
import ptBRCatalog from './locales/pt-BR';
import trCatalog from './locales/tr';
import type { Dict, MsgKey } from './en';

describe('translator', () => {
  it('fills placeholders from the active locale', () => {
    const t = createT('ko');
    expect(t('roles.issues', { n: 3 })).toContain('3');
  });

  it('falls back to English when a locale has not translated a key', () => {
    const t = createT('tr');
    expect(t('format.scss')).toBe(en['format.scss']);
  });

  it('degrades to the key instead of throwing when no source string exists', () => {
    const t = createT('en');
    const unknown = 'doctor.somethingNewFromTheEngine' as MsgKey;
    // Runtime-built keys (doctor.<code>, sem.<role>) must never crash the app.
    expect(() => t(unknown)).not.toThrow();
    expect(t(unknown)).toBe(unknown);
    expect(() => t(unknown, { n: 1 })).not.toThrow();
  });

  it('배경 사용 안내가 모든 언어에서 조건과 실제 대비 값을 빠짐없이 표시한다', () => {
    for (const locale of LOCALES) {
      const rendered = createT(locale.code)('paletteUsage.swatchLabel', {
        step: 500,
        hex: '#4b87e8',
        textColor: 'black',
        ratio: '5.929',
        blackRatio: '5.929',
        whiteRatio: '3.542',
        level: 'AA',
      });
      expect(rendered, locale.code).toContain('500');
      expect(rendered, locale.code).toContain('#4b87e8');
      expect(rendered, locale.code).toContain('5.929');
      expect(rendered, locale.code).toContain('3.542');
      expect(rendered, locale.code).toContain('AA');
      expect(rendered, locale.code).not.toMatch(
        /\{(?:step|hex|textColor|ratio|blackRatio|whiteRatio|level)\}/,
      );
      const badge = createT(locale.code)('paletteUsage.swatchBadge', {
        textColor: 'black',
        ratio: '5.929',
        badgeLevel: 'AA',
      });
      expect(badge, locale.code).toContain('5.929');
      expect(badge, locale.code).toContain('AA');
      expect(badge, locale.code).not.toMatch(/\{(?:textColor|ratio|badgeLevel)\}/);
    }
  });

  it('팔레트 선택·고정·추천 흐름의 동적 값이 모든 언어에서 빠짐없이 치환된다', () => {
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      const rendered = [
        t('paletteUsage.selected', { step: 500, hex: '#4b87e8' }),
        t('pairContrast.fixedFromPalette', { step: 500 }),
        t('pairContrast.selectedPass', { target: '4.5' }),
        t('pairContrast.selectedFail', { target: '7' }),
        t('pairContrast.recommendPalette', { step: 700 }),
        t('pairContrast.useRecommendationLabel', {
          role: 'foreground',
          hex: '#112233',
          ratio: '4.501',
        }),
        t('pairContrast.applyCandidateLabel', {
          role: 'background',
          hex: '#445566',
          ratio: '7.001',
        }),
        t('pairContrast.recommendNoneDetail', {
          fixedHex: '#765cc1',
          bestHex: '#ffffff',
          ratio: '5.1581',
          target: '7',
        }),
      ].join(' ');

      expect(rendered, locale.code).toContain('500');
      expect(rendered, locale.code).toContain('#4b87e8');
      expect(rendered, locale.code).toContain('4.5');
      expect(rendered, locale.code).toContain('7');
      expect(rendered, locale.code).toContain('700');
      expect(rendered, locale.code).toContain('foreground');
      expect(rendered, locale.code).toContain('#112233');
      expect(rendered, locale.code).toContain('4.501');
      expect(rendered, locale.code).toContain('background');
      expect(rendered, locale.code).toContain('#445566');
      expect(rendered, locale.code).toContain('7.001');
      expect(rendered, locale.code).toContain('#765cc1');
      expect(rendered, locale.code).toContain('#ffffff');
      expect(rendered, locale.code).toContain('5.1581');
      expect(rendered, locale.code).not.toMatch(
        /\{(?:step|hex|target|role|ratio|fixedHex|bestHex)\}/,
      );
      expect(t('pairContrast.recommendNone'), locale.code).not.toBe('pairContrast.recommendNone');
      expect(t('pairContrast.fixNone'), locale.code).not.toBe('pairContrast.fixNone');
      expect(t('paletteUsage.selectionSourceChanged'), locale.code)
        .not.toBe('paletteUsage.selectionSourceChanged');
      expect(t('pairContrast.targetNormal'), locale.code).toContain('AA');
      expect(t('pairContrast.targetNormal'), locale.code).toContain('AAA');
      expect(t('pairContrast.targetNormal'), locale.code).toMatch(/4[.,]5:1/);
    }
  });

  it('추천 제목이 보색·미적 조화를 뜻하는 표현이나 전역 최단색 단정을 사용하지 않는다', () => {
    const forbiddenRecommendationTerms = /complementari|gegenfarb|搭配|correspondent/i;
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      expect(t('pairContrast.recommendTitle'), locale.code)
        .not.toMatch(forbiddenRecommendationTerms);
    }
    expect(en['pairContrast.recommendAdjusted']).not.toMatch(/\bclosest\b/i);
    expect(createT('zh-Hant')('pairContrast.targetLarge')).not.toContain('大字文字');
  });

  it('한국어 반복 추천 흐름은 후보 색이 아니라 추천 색으로 안내한다', () => {
    const t = createT('ko');

    expect(t('pairContrast.recommendBody')).toContain('다른 추천 색');
    expect(t('pairContrast.nextRecommendation')).toBe('다른 추천 색');
    expect(t('pairContrast.useRecommendation')).toBe('이 색상 선택');
    expect([
      t('pairContrast.recommendBody'),
      t('pairContrast.nextRecommendation'),
      t('pairContrast.useRecommendation'),
    ].join(' ')).not.toContain('후보 색');
  });

  it('대비 기준 요약이 큰 글자와 일반 글자의 AA·AAA 기준을 모두 명시한다', () => {
    for (const locale of LOCALES) {
      const thresholds = createT(locale.code)('pairContrast.thresholds');
      const aaOnlyCount = thresholds.replaceAll('AAA', '').match(/AA/g)?.length ?? 0;
      const aaaCount = thresholds.match(/AAA/g)?.length ?? 0;
      const normalTargetCount = thresholds.match(/4[.,]5:1/g)?.length ?? 0;

      expect(thresholds, locale.code).toContain('3:1');
      expect(normalTargetCount, locale.code).toBe(2);
      expect(thresholds, locale.code).toContain('7:1');
      expect(aaOnlyCount, locale.code).toBe(2);
      expect(aaaCount, locale.code).toBe(2);
    }

    const traditionalChinese = createT('zh-Hant')('pairContrast.thresholds');
    expect(traditionalChinese).toContain('大型文字 AA');
    expect(traditionalChinese).not.toContain('大字文字');
  });

  it('추천 후보 토글과 목표별 대비 판정 문구를 모든 언어에서 완전하게 제공한다', () => {
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const key of [
        'pairContrast.showRecommendations',
        'pairContrast.hideRecommendations',
        'pairContrast.recommendNoAlternatives',
        'pairContrast.selectedPassLarge',
        'pairContrast.selectedFailLarge',
        'pairContrast.selectedPassNormal',
        'pairContrast.selectedFailNormal',
        'pairContrast.selectedPassAaa',
        'pairContrast.selectedFailAaa',
      ] as const) {
        expect(t(key), `${locale.code}/${key}`).not.toBe(key);
      }

      expect(t('pairContrast.selectedPassLarge'), locale.code).toContain('3:1');
      expect(t('pairContrast.selectedFailLarge'), locale.code).toContain('3:1');
      expect(t('pairContrast.selectedPassNormal'), locale.code).toMatch(/4[.,]5:1/);
      expect(t('pairContrast.selectedFailNormal'), locale.code).toMatch(/4[.,]5:1/);
      expect(t('pairContrast.selectedPassAaa'), locale.code).toContain('7:1');
      expect(t('pairContrast.selectedFailAaa'), locale.code).toContain('7:1');
    }
  });

  it('실제 두 색 미리보기와 별도 전체 UI 색상 시스템의 범위를 모든 언어에서 구분한다', () => {
    const scopedKeys = [
      'pairContrast.openRoleFix',
      'pairContrast.closeCvdPreview',
      'pairContrast.cvdNote',
      'match.title',
      'statusCvd.optionalToggle',
      'statusCvd.optionalHint',
      'statusCvd.fullSystemScope',
      'cvd.title',
      'roles.title',
      'roles.note',
    ] as const;

    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const key of scopedKeys) {
        expect(t(key), `${locale.code}/${key}`).not.toBe(key);
      }
      expect(t('pairContrast.openRoleFix'), locale.code)
        .not.toBe(t('pairContrast.closeCvdPreview'));
      expect(t('match.title'), locale.code).not.toBe(t('cvd.title'));
      expect(t('pairContrast.cvdNote'), locale.code)
        .not.toBe(t('statusCvd.fullSystemScope'));
      expect(t('roles.title'), locale.code).not.toBe(t('match.title'));
    }

    for (const [code, catalog] of Object.entries(accessibilityTranslations)) {
      const defined = new Set(Object.keys(catalog));
      for (const key of scopedKeys) {
        expect(defined.has(key), `${code} is missing the scoped copy ${key}`).toBe(true);
      }
    }
  });

  it('동일 HEX가 있을 때 쓰는 범위 제한 진단 문구를 일반 통과 문구와 분리한다', () => {
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      const duplicate = t('statusCvd.duplicateSummary', {
        roles: 'warning · info',
        hex: '#2563eb',
      });
      const chromaticScoped = t('statusCvd.chromaticClearWithDuplicates');
      const monochromeScoped = t('statusCvd.monochromeClearWithDuplicates');

      expect(duplicate, locale.code).toContain('warning · info');
      expect(duplicate, locale.code).toContain('#2563eb');
      expect(duplicate, locale.code).not.toMatch(/\{(?:roles|hex)\}/);
      expect(chromaticScoped, locale.code).not.toBe(t('statusCvd.chromaticClear'));
      expect(monochromeScoped, locale.code).not.toBe(t('statusCvd.monochromeClear'));
    }
  });

  it('실제 색상 조합의 색상 선택기와 HEX 입력을 모든 언어에서 서로 다른 이름으로 읽는다', () => {
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const fieldKey of ['pairContrast.foreground', 'pairContrast.background'] as const) {
        const field = t(fieldKey);
        const picker = t('pairContrast.pickerLabel', { field });
        const hexInput = t('pairContrast.hexInputLabel', { field });

        expect(picker, `${locale.code}/${fieldKey}/picker`).toContain(field);
        expect(hexInput, `${locale.code}/${fieldKey}/hex`).toContain(field);
        expect(picker, `${locale.code}/${fieldKey}`).not.toBe(hexInput);
        expect(picker).not.toContain('{field}');
        expect(hexInput).not.toContain('{field}');
      }
    }
  });

  it('보정 후보 설명이 모든 언어에서 명도만 바뀐다고 단정하지 않는다', () => {
    const forbiddenLightnessOnlyClaims = [
      /only the (?:text|background) lightness/i,
      /(?:글자|배경) 명도만/,
      /(?:文字|背景)の明度だけ/,
      /只把(?:文字|背景)明度/,
      /只將(?:文字|背景)明度/,
      /seulement la clarté/,
      /nur die (?:Text|Hintergrund)helligkeit/i,
      /только светлоту/i,
      /solo la luminosidad/i,
      /apenas a luminosidade/i,
      /yalnızca .* açıklığını/i,
    ];

    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const key of [
        'pairContrast.fixForegroundBody',
        'pairContrast.fixBackgroundBody',
      ] as const) {
        const text = t(key);
        if (locale.code !== 'en') {
          expect(text, `${locale.code}/${key}`).not.toBe(en[key]);
        }
        for (const pattern of forbiddenLightnessOnlyClaims) {
          expect(text, `${locale.code}/${key}/${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });
});

describe('browser locale detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['zh-TW', 'zh-Hant'],
    ['zh-HK', 'zh-Hant'],
    ['zh-MO', 'zh-Hant'],
    ['zh-Hant-TW', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'],
    ['zh-SG', 'zh-Hans'],
    ['zh-Hans', 'zh-Hans'],
    ['zh', 'zh-Hans'],
    ['pt-BR', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['es-MX', 'es-419'],
    ['es-AR', 'es-419'],
    ['es-419', 'es-419'],
    ['es-ES', 'es'],
    ['es', 'es'],
  ] as const)('maps browser language %s to %s', (language, expected) => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('navigator', { language });

    expect(detectLocale()).toBe(expected);
  });

  it('keeps the saved locale ahead of browser-language detection', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en' });
    vi.stubGlobal('navigator', { language: 'zh-TW' });

    expect(detectLocale()).toBe('en');
  });

  it('기존 pt-419 저장값을 첫 렌더 전에 pt-BR로 정규화한다', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: () => 'pt-419',
      setItem,
    });
    vi.stubGlobal('navigator', { language: 'en-US' });

    expect(readSavedLocale()).toBe('pt-BR');
    expect(detectLocale()).toBe('pt-BR');
    expect(setItem).toHaveBeenCalledWith('pg.locale', 'pt-BR');
    expect(parseLocale('pt-419')).toBe('pt-BR');
  });

  it('기존 언어 코드 재저장에 실패해도 현재 실행은 포르투갈어를 유지한다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'pt-419',
      setItem: () => {
        throw new Error('저장소 쓰기 차단');
      },
    });

    expect(readSavedLocale()).toBe('pt-BR');
    expect(createT('pt-BR')('header.tagline')).not.toBe(en['header.tagline']);
  });
});

/** Every roles.* string the color-system UI renders. English fallback here is a bug, not a feature. */
const ROLE_KEYS: MsgKey[] = [
  'roles.title',
  'roles.note',
  'roles.previewTitle',
  'roles.previewNote',
  'roles.previewCanvasLabel',
  'roles.previewHeading',
  'roles.previewBody',
  'roles.previewAction',
  'roles.previewLive',
  'roles.primary',
  'roles.background',
  'roles.text',
  'roles.lock',
  'roles.ready',
  'roles.issues',
  'roles.issueBadge',
  'roles.issueBadgeDetail',
  'roles.freeSummary',
  'roles.freeFixable',
  'roles.reviewFixes',
  'roles.review',
  'roles.reviewTitle',
  'roles.reviewNote',
  'roles.alternatives',
  'roles.alternativeOption',
  'roles.applyCount',
  'roles.noAutoFix',
  'roles.cancel',
  'roles.resultTitle',
  'roles.resultSummary',
  'roles.sectionWillChange',
  'roles.sectionChanged',
  'roles.sectionUnresolved',
  'roles.sectionSkippedLocked',
  'roles.lockedTag',
  'roles.undo',
  'roles.undoShort',
  'roles.appliedToast',
  'roles.undone',
  'roles.undoStale',
  'roles.editedAfterApply',
  'roles.unresolvedLabel',
  'roles.recommendLabel',
  'roles.reason.contrast',
  'roles.reason.cvd',
  'roles.measure.contrast',
  'roles.measure.cvd',
  'roles.measure.cvdResolved',
  'roles.pairOn',
  'roles.pairVs',
  'roles.unresolved.locked',
  'roles.unresolved.hueBandLimit',
  'roles.unresolved.noSafeCandidate',
  'roles.unresolved.needsNonColorCue',
  'roles.recommend.locked',
  'roles.recommend.hueBandLimit',
  'roles.recommend.noSafeCandidate',
  'roles.recommend.needsNonColorCue',
];

const WORKFLOW_KEYS: MsgKey[] = [
  'workflow.summaryTitle',
  'workflow.roles',
  'workflow.roleIssues',
  'workflow.safeChanges',
  'workflow.manualReview',
  'workflow.viewReview',
  'workflow.tabList',
  'workflow.create',
  'workflow.verify',
  'workflow.deliver',
];

// 새 작업 공간 키는 수동 목록이 아니라 기준 카탈로그의 접두사에서 모아 추가 누락도 자동으로 잡습니다.
const ROLE_WORKSPACE_KEYS = (Object.keys(en) as MsgKey[])
  .filter((key) => key.startsWith('roleWorkspace.'));

const SYSTEM_KEYS: MsgKey[] = [
  'error.imageTooLargeBytes',
  'error.imageTooLargeDimensions',
  'error.imageUnreadable',
  'error.imageDecodeFailed',
  'error.imageFileReadFailed',
  'error.fileReadFailed',
  'error.fileWriteFailed',
  'error.libraryUnavailable',
  'error.libraryReadFailed',
  'error.libraryWriteFailed',
  'error.libraryInvalid',
  'error.libraryLimitExceeded',
  'error.proRequired',
  'error.imageProfileUnreadable',
  'error.invalidColor',
  'error.unknown',
  'image.filterName',
  'export.packTitle',
  'a11y.customTemplate',
];

const UPDATE_KEYS: MsgKey[] = [
  'update.available',
  'update.availableTitle',
  'update.downloading',
  'update.downloadingUnknown',
  'update.ready',
  'update.readyTitle',
  'update.failed',
  'update.failedTitle',
];

const DIAGNOSTIC_KEYS: MsgKey[] = [
  'doctor.note',
  'doctor.aaAllPass',
  'doctor.aaFails',
  'doctor.autofixHint',
  'doctor.lightBodyOk',
  'doctor.lightBodyLow',
  'doctor.darkBodyOk',
  'doctor.darkBodyLow',
  'doctor.lightBtnOk',
  'doctor.lightBtnLow',
  'doctor.darkBtnOk',
  'doctor.darkBtnLow',
  'doctor.cvdSemanticOk',
  'doctor.cvdSemanticRisk',
  'confusion.note',
  'confusion.allClear',
  'confusion.summary',
];

const TUTORIAL_KEYS: MsgKey[] = [
  'tutorial.help',
  'tutorial.menuTitle',
  'tutorial.quick',
  'tutorial.roles',
  'tutorial.pro',
  'tutorial.start',
  'tutorial.skip',
  'tutorial.back',
  'tutorial.next',
  'tutorial.finish',
  'tutorial.close',
  'tutorial.progress',
  'tutorial.welcomeBody',
  'tutorial.quick.image',
  'tutorial.quick.seed',
  'tutorial.quick.name',
  'tutorial.quick.ramp',
  'tutorial.quick.verify',
  'tutorial.quick.export',
  'tutorial.roles.system',
  'tutorial.roles.preview',
  'tutorial.roles.status',
  'tutorial.roles.matcher',
  'tutorial.roles.repair',
  'tutorial.pro.autofix',
  'tutorial.pro.doctor',
  'tutorial.pro.repair',
  'tutorial.pro.matrix',
  'tutorial.pro.export',
];

const LEGAL_KEYS: MsgKey[] = [
  'legal.menu',
  'legal.title',
  'legal.aboutTab',
  'legal.licensesTab',
  'legal.version',
  'legal.vendor',
  'legal.support',
  'legal.privacy',
  'legal.eula',
  'legal.offlineTitle',
  'legal.offlineBody',
  'legal.accessibilityNotice',
  'legal.copy',
  'legal.copied',
  'legal.close',
  'legal.loading',
  'legal.noticeUnavailable',
  'legal.desktopOnly',
  'legal.licenseIntro',
];

const ACCESSIBILITY_KEYS = (Object.keys(en) as MsgKey[]).filter(
  (key) => key.startsWith('colorName.')
    || key.startsWith('paletteVariant.')
    || key.startsWith('statusCvd.')
    || key.startsWith('paletteUsage.')
    || key.startsWith('pairContrast.'),
);

const ACCESSIBILITY_DIAGNOSTIC_KEYS: MsgKey[] = [
  'doctor.cvdSemanticOk',
  'doctor.cvdSemanticRisk',
  'confusion.note',
  'confusion.allClear',
  'confusion.summary',
];

// 색각 미리보기 문구는 기본 언어 파일에 있으므로 영어 대체가 조용히 섞이지 않게 직접 정의를 검사합니다.
const COLOR_VISION_GUIDANCE_KEYS: MsgKey[] = [
  'intro.step2',
  ...(Object.keys(en) as MsgKey[]).filter((key) => key.startsWith('cvd.')),
  'match.note',
];

const BASE_LOCALE_CATALOGS: Record<Exclude<Locale, 'en'>, Partial<Dict>> = {
  ko: koCatalog,
  ja: jaCatalog,
  'zh-Hans': zhHansCatalog,
  'zh-Hant': zhHantCatalog,
  fr: frCatalog,
  de: deCatalog,
  ru: ruCatalog,
  es: es419Catalog,
  'es-419': es419Catalog,
  'pt-BR': ptBRCatalog,
  tr: trCatalog,
};

/** 번역 원본의 레거시 내부 키를 공개 Locale 코드로 변환합니다. */
function publicLocaleForTranslationSource(code: string): Locale {
  return (code === 'pt-419' ? 'pt-BR' : code) as Locale;
}

describe('locale catalogs', () => {
  it('every registered locale resolves every role-system key', () => {
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const key of ROLE_KEYS) expect(t(key), `${locale.code}/${key}`).not.toBe(key);
    }
  });

  // Comparing rendered strings would false-positive on words that are genuinely identical across
  // languages (German "Text"). Presence in the locale's own catalog is the real invariant.
  it('every non-English locale defines every role-system key rather than falling back', () => {
    for (const [code, catalog] of Object.entries(roleTranslations)) {
      const defined = new Set(Object.keys(catalog));
      for (const key of ROLE_KEYS) {
        expect(defined.has(key), `${code} is missing ${key} and would fall back to English`).toBe(true);
      }
    }
  });

  it('every non-English locale defines every workflow key with matching placeholders', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [code, catalog] of Object.entries(workflowTranslations)) {
      const t = createT(publicLocaleForTranslationSource(code));
      const defined = new Set(Object.keys(catalog));
      for (const key of WORKFLOW_KEYS) {
        expect(defined.has(key), `${code} is missing ${key}`).toBe(true);
        expect(placeholders(t(key)), `${code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('모든 비영어 언어가 고급 UI 색상 시스템 키를 직접 번역하고 자리표시자를 보존한다', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    expect(ROLE_WORKSPACE_KEYS.length).toBeGreaterThan(0);
    expect(Object.keys(roleWorkspaceTranslations)).toHaveLength(LOCALES.length - 1);

    for (const [code, catalog] of Object.entries(roleWorkspaceTranslations)) {
      const t = createT(publicLocaleForTranslationSource(code));
      const defined = new Set(Object.keys(catalog));
      for (const key of ROLE_WORKSPACE_KEYS) {
        expect(defined.has(key), `${code} is missing ${key} and would fall back to English`).toBe(true);
        expect(placeholders(t(key)), `${code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('역할 색 가져오기와 문제 수 문구가 12개 언어에서 동적 값을 모두 치환한다', () => {
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      const rendered = [
        t('roleWorkspace.importTextChange', { from: '#112233', to: '#445566' }),
        t('roleWorkspace.importBackgroundChange', { from: '#abcdef', to: '#fedcba' }),
        t('roleWorkspace.pairIssueCount', { n: 2 }),
        t('roleWorkspace.systemIssueCount', { n: 3 }),
      ].join(' ');

      expect(rendered, locale.code).toContain('#112233');
      expect(rendered, locale.code).toContain('#445566');
      expect(rendered, locale.code).toContain('#abcdef');
      expect(rendered, locale.code).toContain('#fedcba');
      expect(rendered, locale.code).toContain('2');
      expect(rendered, locale.code).toContain('3');
      expect(rendered, locale.code).not.toMatch(/\{(?:from|to|n)\}/);
    }
  });

  it('every non-English locale defines every native-error key with matching placeholders', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [code, catalog] of Object.entries(systemTranslations)) {
      const t = createT(publicLocaleForTranslationSource(code));
      const defined = new Set(Object.keys(catalog));
      for (const key of SYSTEM_KEYS) {
        expect(defined.has(key), `${code} is missing ${key}`).toBe(true);
        expect(placeholders(t(key)), `${code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('keeps every placeholder intact after translation', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const key of ROLE_KEYS) {
        expect(placeholders(t(key)), `${locale.code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('keeps diagnostic placeholders intact in every locale', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const key of DIAGNOSTIC_KEYS) {
        expect(placeholders(t(key)), `${locale.code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('every non-English locale defines every tutorial key with matching placeholders', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [code, catalog] of Object.entries(tutorialTranslations)) {
      const t = createT(publicLocaleForTranslationSource(code));
      const defined = new Set(Object.keys(catalog));
      for (const key of TUTORIAL_KEYS) {
        expect(defined.has(key), `${code} is missing ${key}`).toBe(true);
        expect(placeholders(t(key)), `${code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('every non-English locale defines every legal-information key', () => {
    for (const [code, catalog] of Object.entries(legalTranslations)) {
      const defined = new Set(Object.keys(catalog));
      for (const key of LEGAL_KEYS) {
        expect(defined.has(key), `${code} is missing ${key}`).toBe(true);
      }
    }
  });

  it('every non-English locale defines every updater key with matching placeholders', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [code, catalog] of Object.entries(updateTranslations)) {
      const t = createT(publicLocaleForTranslationSource(code));
      const defined = new Set(Object.keys(catalog));
      for (const key of UPDATE_KEYS) {
        expect(defined.has(key), `${code} is missing ${key}`).toBe(true);
        expect(placeholders(t(key)), `${code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('keeps the complete approximate-color taxonomy in the source catalog', () => {
    expect(ACCESSIBILITY_KEYS.filter((key) => key.startsWith('colorName.family.'))).toHaveLength(14);
    expect(ACCESSIBILITY_KEYS.filter((key) => key.startsWith('colorName.lightness.'))).toHaveLength(5);
    expect(ACCESSIBILITY_KEYS.filter((key) => key.startsWith('colorName.saturation.'))).toHaveLength(4);
    expect(ACCESSIBILITY_KEYS.filter((key) => key.startsWith('colorName.confidence.'))).toHaveLength(3);
  });

  it('every non-English locale defines every accessibility key with matching placeholders', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const required = [...ACCESSIBILITY_KEYS, ...ACCESSIBILITY_DIAGNOSTIC_KEYS];
    expect(Object.keys(accessibilityTranslations)).toHaveLength(LOCALES.length - 1);

    for (const [code, catalog] of Object.entries(accessibilityTranslations)) {
      const t = createT(publicLocaleForTranslationSource(code));
      const defined = new Set(Object.keys(catalog));
      for (const key of required) {
        expect(defined.has(key), `${code} is missing ${key}`).toBe(true);
        expect(placeholders(t(key)), `${code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('모든 비영어 언어가 색각 근사 안내 키를 직접 번역하고 영어 대체를 사용하지 않는다', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    expect(COLOR_VISION_GUIDANCE_KEYS.length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(BASE_LOCALE_CATALOGS)).toHaveLength(LOCALES.length - 1);

    for (const [code, catalog] of Object.entries(BASE_LOCALE_CATALOGS)) {
      const defined = new Set(Object.keys(catalog));
      for (const key of COLOR_VISION_GUIDANCE_KEYS) {
        expect(defined.has(key), `${code} is missing ${key} and would fall back to English`).toBe(true);
        expect(placeholders(catalog[key] ?? ''), `${code}/${key}`).toBe(placeholders(en[key]));
      }
    }
  });

  it('색각 미리보기를 개인의 정확한 시야나 의료 진단으로 오해시키는 기존 명칭을 노출하지 않는다', () => {
    const legacyClinicalLabels =
      /(?:protanopia|deuteranopia|tritanopia|protanopie|deutéranopie|deuteranopie|tritanopie|протанопия|дейтеранопия|тританопия|protanopía|deuteranopía|tritanopía|protanopi|döteranopi|tritanopi|색맹|色盲)/i;

    for (const locale of LOCALES) {
      const t = createT(locale.code);
      for (const key of ['cvd.protan', 'cvd.deutan', 'cvd.tritan'] as const) {
        expect(t(key), `${locale.code}/${key}`).not.toMatch(legacyClinicalLabels);
      }
      expect(t('cvd.normal'), locale.code).not.toMatch(/^(?:Normal|일반|通常|正常|Обычное зрение)$/i);
      expect(t('cvd.note'), locale.code).not.toBe('cvd.note');
      expect(t('cvd.transformedHexNotice'), locale.code).not.toBe('cvd.transformedHexNotice');
      expect(t('cvd.modelDisclaimer'), locale.code).not.toBe('cvd.modelDisclaimer');
    }

    expect(createT('ko')('cvd.tritan')).toBe('청황색각 이상');
    expect(en['cvd.modelDisclaimer']).toMatch(/approximate/i);
    expect(en['cvd.modelDisclaimer']).toMatch(/not an exact prediction/i);
    expect(en['cvd.modelDisclaimer']).toMatch(/medical diagnosis/i);
    expect(en['cvd.modelDisclaimer']).toMatch(/accessibility certification/i);
  });

  it('exposes only locales that actually carry translations', () => {
    expect(readyLocales().map((l) => l.code)).toContain('en');
    expect(readyLocales().length).toBeGreaterThan(1);
  });
});
