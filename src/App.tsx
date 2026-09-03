import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  buildRamp,
  buildReport,
  contrastBetween,
  createRolePalette,
  exportAse,
  exportCustom,
  exportPack,
  exportRamp,
  exportRoleTokens,
  mergeDtcgDocuments,
  normalizeRolePalette,
  MATCH_RELATIVE_COLLAPSE_RATIO,
  MATCH_REVIEW_DISTANCE,
  MATCH_SAME_DISTANCE,
  pickSeed,
  PRESETS,
  recommendTextOnBackground,
  refineSwatches,
  repairRolePalette,
  roleEquals,
  sanitizeTokenName,
  selectRoleRepairAlternative,
  setRoleColor,
  setRoleLocked,
  simulateHex,
  statusColors,
  worstChromaticSeparation,
} from './engine';
import type {
  ColorRole,
  CvdType,
  ExplicitTextPair,
  ExportFormat,
  PresetName,
  RawSwatch,
  RoleRepairChange,
  RolePalette,
  RoleRepairResult,
  RoleRepairUnresolved,
  RampStep,
  Swatch,
} from './engine';
import { APP_NAME, APP_VERSION, VENDOR } from './config/branding';
import logoUrl from './assets/pcssak-logo.png';
import { AccessibleColorSwatch, ApproximateColorName } from './AccessibleColor';
import { createT, detectLocale, readyLocales, saveLocale, type Locale, type MsgKey } from './i18n';
import { parseNativeError } from './native-error';
import { loadStored } from './persisted-state';
import { addHistory, loadHistory, parseLibrary, removeHistory, saveLibrary, serializeLibrary, type HistoryEntry } from './history';
import {
  FREE_SAVE_LIMIT,
  initialEntitlement,
  isFreeFormat,
  isPro,
  resolveEntitlement,
  setDevTier,
  type EntitlementStatus,
  type LicenseTier,
  PRO_PURCHASE_AVAILABLE,
  PRO_PRICE,
  PRO_FEATURE_KEYS,
  PRO_UI_AVAILABLE,
} from './entitlement';
import { TUTORIAL_TARGETS } from './tutorial-targets';
import LegalModal from './LegalModal';
import TutorialOverlay from './TutorialOverlay';
import { useAppUpdater } from './updater';
import {
  buildActualPairVisionPreviews,
  buildFixedRoleContrastRecommendations,
  buildPairContrastCandidates,
  conservativeContrastValue,
  contrastSafeBadgeColors,
  decodeLegacyEnforceAA,
  deriveRoleWorkspaceMeta,
  evaluateActualPair,
  importPairIntoRolePalette,
  normalizeHex6,
  readableTextOn,
  resolveRoleReportPreference,
  type PairContrastTarget,
  type PairRole,
  type RoleWorkspaceMetaV1,
} from './app-helpers';
import {
  TUTORIALS,
  TUTORIAL_VERSION,
  normalizeTutorialCompletion,
  type TutorialCompletion,
  type TutorialId,
} from './tutorial';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const PRESET_NAMES: PresetName[] = ['tailwind', 'radix', 'leonardo'];
const FORMATS: { id: ExportFormat; key: MsgKey }[] = [
  { id: 'tailwind', key: 'format.tailwind' },
  { id: 'tailwind-hex', key: 'format.tailwind-hex' },
  { id: 'css', key: 'format.css' },
  { id: 'css-oklch', key: 'format.css-oklch' },
  { id: 'dtcg', key: 'format.dtcg' },
  { id: 'scss', key: 'format.scss' },
  { id: 'custom', key: 'format.custom' },
];
const TEMPLATE_PRESETS: { label: string; tpl: string }[] = [
  { label: 'CSS', tpl: '--{name}-{step}: {hex};' },
  { label: 'SCSS', tpl: '${name}-{step}: {hex};' },
  { label: 'JS', tpl: "  '{name}-{step}': '{hex}'," },
  { label: 'JSON', tpl: '  "{name}-{step}": "{hex}",' },
  { label: 'OKLCH', tpl: '--{name}-{step}: {oklch};' },
  { label: 'rgb()', tpl: '--{name}-{step}: {rgb};' },
];
// Suggested filename + extension per export format (used by the native Save dialog).
const FORMAT_FILE: Record<ExportFormat, { ext: string; file: (n: string) => string }> = {
  tailwind: { ext: 'css', file: (n) => `${n}-theme.css` },
  'tailwind-hex': { ext: 'js', file: (n) => `${n}.tailwind.js` },
  css: { ext: 'css', file: (n) => `${n}.css` },
  'css-oklch': { ext: 'css', file: (n) => `${n}.oklch.css` },
  dtcg: { ext: 'json', file: (n) => `${n}.tokens.json` },
  scss: { ext: 'scss', file: (n) => `_${n}.scss` },
  custom: { ext: 'txt', file: (n) => `${n}.txt` },
};
const EXAMPLES = ['#3b82f6', '#e11d48', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#0f172a'];
const FORMAT_DESTINATIONS: Record<ExportFormat, string> = {
  tailwind: 'Tailwind CSS v4',
  'tailwind-hex': 'Tailwind CSS v3',
  css: 'CSS / Web',
  'css-oklch': 'Modern CSS / OKLCH',
  dtcg: 'Figma Variables / DTCG',
  scss: 'Sass / SCSS',
  custom: 'Custom',
};

function isHex6(s: string): boolean {
  return normalizeHex6(s) !== null;
}

interface HexTextInputProps {
  value: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
  onInvalid: (value: string) => void;
}

/**
 * 외부 색상 선택과 텍스트 편집을 함께 지원하면서 입력 DOM과 커서 위치를 유지합니다.
 * 사용자가 Enter나 포커스 이동으로 확정할 때만 반영해 편집 도중 입력 DOM을 교체하지 않습니다.
 */
function HexTextInput({
  value,
  ariaLabel,
  onCommit,
  onInvalid,
}: HexTextInputProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = isHex6(draft);

  function commitOrRestore() {
    if (valid) {
      onCommit(draft);
      return;
    }
    const rejected = draft;
    setDraft(value);
    onInvalid(rejected);
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commitOrRestore}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(value);
        }
      }}
      spellCheck={false}
      aria-invalid={!valid}
      aria-label={ariaLabel}
    />
  );
}

/** 토스트에는 짧게 유지되는 실행 취소와 같은 보조 동작을 하나만 넣을 수 있습니다. */
type ToastAction = { label: string; run: () => void };
type ToastState = { text: string; action?: ToastAction } | null;
type WorkspaceTab = 'create' | 'verify' | 'deliver';
type VerifyWorkspace = 'pair' | 'roles';
const WORKSPACE_TABS: readonly WorkspaceTab[] = ['create', 'verify', 'deliver'];
const VERIFY_WORKSPACES: readonly VerifyWorkspace[] = ['pair', 'roles'];
type ActiveTutorial = { id: TutorialId; index: number };
type PaletteColorSelection = {
  step: number;
  hex: string;
  paletteFingerprint: string;
};
const ROLE_PREVIEW_VISIONS = [
  ['normal', 'cvd.normal'],
  ['protan', 'cvd.protan'],
  ['deutan', 'cvd.deutan'],
  ['tritan', 'cvd.tritan'],
  ['mono', 'cvd.mono'],
] as const satisfies readonly (readonly [CvdType, MsgKey])[];
const ROLE_PREVIEW_STATUSES = [
  ['success', '✓'],
  ['warning', '!'],
  ['danger', '×'],
  ['info', 'i'],
] as const satisfies readonly (readonly [ColorRole, string])[];
const ROLE_COLOR_GROUPS = [
  {
    id: 'foundation',
    labelKey: 'roleWorkspace.foundationGroup',
    roles: ['primary', 'background', 'text'],
  },
  {
    id: 'status',
    labelKey: 'roleWorkspace.statusGroup',
    roles: ['success', 'warning', 'danger', 'info'],
  },
] as const satisfies readonly {
  id: string;
  labelKey: MsgKey;
  roles: readonly ColorRole[];
}[];

/** 검토 중인 원본과 제안을 함께 보관해 확정 전 실제 역할색이 바뀌지 않게 합니다. */
type RepairFlow =
  | { phase: 'idle' }
  | { phase: 'reviewing'; result: RoleRepairResult; snapshot: RolePalette }
  | { phase: 'applied'; result: RoleRepairResult; snapshot: RolePalette };

type RoleWorkspaceUndo = {
  action: 'import' | 'reset';
  beforePalette: RolePalette;
  beforeMeta: RoleWorkspaceMetaV1;
  afterPalette: RolePalette;
};

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem('pg.' + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const t = useMemo(() => createT(locale), [locale]);
  const ratioFormatter = useMemo(() => {
    const numberLocale = locale;
    try {
      return new Intl.NumberFormat(numberLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    } catch {
      return new Intl.NumberFormat('en', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    }
  }, [locale]);
  const targetRatioFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
    } catch {
      return new Intl.NumberFormat('en', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
    }
  }, [locale]);
  // 경계값을 통과한 것처럼 보이지 않도록 표시값은 넷째 자리에서 보수적으로 내립니다.
  const formatContrastRatio = (ratio: number): string =>
    ratioFormatter.format(conservativeContrastValue(ratio));
  const languages = readyLocales();

  const [seed, setSeed] = useState<string>(() =>
    loadStored('seed', '#3b82f6', (value) => (typeof value === 'string' && isHex6(value) ? value : undefined)),
  );
  const [name, setName] = useState<string>(() =>
    loadStored('name', '', (value) => (typeof value === 'string' ? value : undefined)),
  );
  const [preset, setPreset] = useState<PresetName>(() => {
    return loadStored('preset', 'tailwind', (value) => (
      typeof value === 'string' && PRESET_NAMES.includes(value as PresetName) ? value as PresetName : undefined
    ));
  });
  // 신규 팔레트는 항상 원본을 생성합니다. true는 이전 버전에서 저장한 보정본을
  // 색상 변화 없이 다시 열기 위한 호환 모드에서만 사용합니다.
  const [legacyEnforceAA, setLegacyEnforceAA] = useState<boolean>(() =>
    loadStored('enforceAA', false, decodeLegacyEnforceAA),
  );
  const [format, setFormat] = useState<ExportFormat>(() => {
    return loadStored('format', 'css', (value) => (
      typeof value === 'string'
        && FORMATS.some((format) => format.id === value)
        && (PRO_UI_AVAILABLE || isFreeFormat(value as ExportFormat))
        ? value as ExportFormat
        : undefined
    ));
  });
  const [customTemplate, setCustomTemplate] = useState<string>(() =>
    loadStored('customTemplate', '--{name}-{step}: {hex};', (value) => (typeof value === 'string' ? value : undefined)),
  );
  const [seenIntro, setSeenIntro] = useState<boolean>(() =>
    loadStored('seenIntro', false, (value) => (typeof value === 'boolean' ? value : undefined)),
  );
  const [tutorialCompletion, setTutorialCompletion] = useState<TutorialCompletion>(() =>
    normalizeTutorialCompletion(loadStored<unknown>('tutorialCompletion', null, (value) => value)),
  );
  const [activeTutorial, setActiveTutorial] = useState<ActiveTutorial | null>(null);
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('create');
  // 하위 작업 공간은 탐색 상태일 뿐이며 저장하지 않습니다. 앱을 다시 열면 항상 실제 두 색 검사로 시작합니다.
  const [verifyWorkspace, setVerifyWorkspace] = useState<VerifyWorkspace>('pair');
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [entitlement, setEntitlement] = useState<EntitlementStatus>(() => initialEntitlement());
  const tier = entitlement.tier;
  const pro = PRO_UI_AVAILABLE && isPro(tier);
  const updater = useAppUpdater(entitlement.updateChannel === 'github');
  const updateState = updater.state;
  const showUpdate = ['available', 'downloading', 'ready', 'error'].includes(updateState.phase);
  const updateLabel = updateState.phase === 'downloading'
    ? (updateState.percent === undefined
      ? t('update.downloadingUnknown')
      : t('update.downloading', { percent: updateState.percent }))
    : updateState.phase === 'ready'
      ? t('update.ready')
      : updateState.phase === 'error'
        ? t('update.failed')
        : t('update.available');
  const updateTitle = updateState.phase === 'ready'
    ? t('update.readyTitle')
    : updateState.phase === 'error'
      ? t('update.failedTitle')
      : t('update.availableTitle', { version: updateState.version ?? '' });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  // 실제 용도를 정하기 전에는 임의 예시 조합으로 통과를 주장하지 않습니다.
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const [selectedPaletteColor, setSelectedPaletteColor] = useState<PaletteColorSelection | null>(null);
  const [fixedPairRole, setFixedPairRole] = useState<PairRole | null>(null);
  const [fixedPairSource, setFixedPairSource] = useState<PaletteColorSelection | null>(null);
  const [pairTarget, setPairTarget] = useState<PairContrastTarget>(4.5);
  const [pairRecommendationIndex, setPairRecommendationIndex] = useState(0);
  const [showActualPairCvd, setShowActualPairCvd] = useState(false);
  // 화면 탐색과 보고서 범위를 분리합니다. 새 키를 우선하고 이전 두 키는 읽기 호환만 제공합니다.
  const [includeRoleSystemInReports, setIncludeRoleSystemInReports] = useState<boolean>(() => {
    const currentPreference = loadStored<boolean | undefined>(
      'includeRoleSystemInReportsV1',
      undefined,
      (value) => (typeof value === 'boolean' ? value : undefined),
    );
    const intermediatePreference = loadStored<boolean | undefined>(
      'fullColorSystemChecksV2',
      undefined,
      (value) => (typeof value === 'boolean' ? value : undefined),
    );
    const legacyPreference = loadStored<boolean | undefined>(
      'includeColorVisionChecks',
      undefined,
      (value) => (typeof value === 'boolean' ? value : undefined),
    );
    return resolveRoleReportPreference(
      currentPreference,
      intermediatePreference,
      legacyPreference,
    );
  });
  // 상태 색 사이의 색각이상 혼동 위험을 검사합니다.
  const [rolePalette, setRolePalette] = useState<RolePalette>(() => {
    const legacyStatusColors = loadStored<unknown>('semantic', [], (value) => value);
    return normalizeRolePalette(loadStored<unknown>('rolePalette', legacyStatusColors, (value) => value));
  });
  const [roleWorkspaceMeta, setRoleWorkspaceMeta] = useState<RoleWorkspaceMetaV1>(() =>
    deriveRoleWorkspaceMeta(
      loadStored<unknown>('roleWorkspaceMetaV1', null, (value) => value),
      rolePalette,
    ),
  );
  // 역할 안내는 예시 화면만 일시적으로 보여 주며 저장된 시작 상태나 역할색을 바꾸지 않습니다.
  const previewingRoleTutorial = activeTutorial?.id === 'roles' || activeTutorial?.id === 'pro';
  const roleSystemReadyForExport = roleWorkspaceMeta.status === 'active';
  const includeActiveRoleSystem = includeRoleSystemInReports && roleSystemReadyForExport;
  const [roleWorkspaceAction, setRoleWorkspaceAction] = useState<'reset' | null>(null);
  const [roleWorkspaceUndo, setRoleWorkspaceUndo] = useState<RoleWorkspaceUndo | null>(null);
  // 검토 → 결정론적 후보 선택 → 확정 → 실행 취소 순서입니다.
  // 진행 중인 상태는 원본 스냅숏을 함께 보관해 오래된 확정이나 원본 없는 실행 취소를 막습니다.
  const [repairFlow, setRepairFlow] = useState<RepairFlow>({ phase: 'idle' });
  const [showConfusionDetail, setShowConfusionDetail] = useState(false);
  const [rolePreviewVision, setRolePreviewVision] = useState<CvdType>('normal');
  const effectiveName = name.trim();
  const effectiveEnforceAA = legacyEnforceAA;

  function updateLegacyEnforceAA(enabled: boolean) {
    setLegacyEnforceAA(enabled);
    // 전환 직후 앱이 종료돼도 다음 실행에서 이전 모드가 되살아나지 않도록 즉시 기록합니다.
    save('enforceAA', enabled);
  }

  function updateSeed(nextSeed: string) {
    updateLegacyEnforceAA(false);
    setSeed(nextSeed);
  }

  function updatePreset(nextPreset: PresetName) {
    updateLegacyEnforceAA(false);
    setPreset(nextPreset);
  }

  // 준비 상태 카드를 누르면 관련 영역으로 바로 이동한다.
  const rampRef = useRef<HTMLElement>(null);
  const workspaceStartRef = useRef<HTMLElement>(null);
  const roleSystemRef = useRef<HTMLDivElement>(null);
  const pairContrastRef = useRef<HTMLElement>(null);
  const pairCvdRef = useRef<HTMLElement>(null);
  const statusCheckRef = useRef<HTMLDivElement>(null);
  const upgradeDialogRef = useRef<HTMLDivElement>(null);
  const upgradeReturnFocusRef = useRef<HTMLElement | null>(null);
  const tutorialMenuRef = useRef<HTMLDivElement>(null);
  const tutorialHelpButtonRef = useRef<HTMLButtonElement>(null);
  const tutorialReturnFocusRef = useRef<HTMLElement | null>(null);
  const tutorialVerifyWorkspaceRestoreRef = useRef<VerifyWorkspace | null>(null);
  const roleWorkspaceConfirmTitleRef = useRef<HTMLHeadingElement>(null);
  const roleWorkspaceActionReturnFocusRef = useRef<HTMLElement | null>(null);
  const roleWorkspaceTitleRef = useRef<HTMLHeadingElement>(null);
  // Latest-value refs so the delayed toast-undo closure never reads a stale flow or palette.
  // Written during render, read only inside handlers.
  const flowRef = useRef<RepairFlow>(repairFlow);
  flowRef.current = repairFlow;
  const paletteRef = useRef<RolePalette>(rolePalette);
  paletteRef.current = rolePalette;
  // Some WebView2 builds silently drop smooth scrollIntoView — try smooth, and if
  // nothing moved shortly after, jump instantly so the link always works.
  function scrollTo(el: HTMLElement | null, block: ScrollLogicalPosition = 'start') {
    if (!el) return;
    const before = window.scrollY;
    el.scrollIntoView({ behavior: 'smooth', block });
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - before) < 2) el.scrollIntoView({ block });
    }, 250);
  }
  function focusRoleControl(role: ColorRole) {
    const el = document.getElementById(`pg-role-control-${role}`);
    if (!el) return;
    el.focus({ preventScroll: true });
    scrollTo(el, 'center');
  }
  function activateWorkspace(tab: WorkspaceTab, afterRender?: () => void) {
    if (!ramp && tab !== 'create') return;
    setWorkspaceTab(tab);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (afterRender) {
        afterRender();
        return;
      }
      const workspaceTop = workspaceStartRef.current?.offsetTop;
      if (workspaceTop !== undefined && window.scrollY > workspaceTop + 1) {
        window.scrollTo({ top: workspaceTop });
      }
    }));
  }
  function selectVerifyWorkspace(next: VerifyWorkspace) {
    if (next === 'roles') syncPairIntoRoleWorkspace();
    setVerifyWorkspace(next);
  }
  function activateVerifyWorkspace(next: VerifyWorkspace, afterRender?: () => void) {
    selectVerifyWorkspace(next);
    activateWorkspace('verify', afterRender);
  }
  function handleVerifyWorkspaceKey(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    current: VerifyWorkspace,
  ) {
    const index = VERIFY_WORKSPACES.indexOf(current);
    let next: VerifyWorkspace | null = null;
    if (event.key === 'ArrowRight') next = VERIFY_WORKSPACES[(index + 1) % VERIFY_WORKSPACES.length];
    if (event.key === 'ArrowLeft') {
      next = VERIFY_WORKSPACES[(index - 1 + VERIFY_WORKSPACES.length) % VERIFY_WORKSPACES.length];
    }
    if (event.key === 'Home') next = VERIFY_WORKSPACES[0];
    if (event.key === 'End') next = VERIFY_WORKSPACES[VERIFY_WORKSPACES.length - 1];
    if (!next) return;
    event.preventDefault();
    selectVerifyWorkspace(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`pg-verify-mode-${next}`)?.focus({ preventScroll: true });
    });
  }
  function handleWorkspaceTabKey(event: ReactKeyboardEvent<HTMLButtonElement>, current: WorkspaceTab) {
    const availableTabs: readonly WorkspaceTab[] = ramp ? WORKSPACE_TABS : ['create'];
    const index = availableTabs.indexOf(current);
    let next: WorkspaceTab | null = null;
    if (event.key === 'ArrowRight') next = availableTabs[(index + 1) % availableTabs.length];
    if (event.key === 'ArrowLeft') next = availableTabs[(index - 1 + availableTabs.length) % availableTabs.length];
    if (event.key === 'Home') next = availableTabs[0];
    if (event.key === 'End') next = availableTabs[availableTabs.length - 1];
    if (!next) return;
    event.preventDefault();
    activateWorkspace(next, () => {
      document.getElementById(`pg-workspace-tab-${next}`)?.focus({ preventScroll: true });
      const workspaceTop = workspaceStartRef.current?.offsetTop;
      if (workspaceTop !== undefined && window.scrollY > workspaceTop + 1) {
        window.scrollTo({ top: workspaceTop });
      }
    });
  }

  useEffect(() => save('seed', seed), [seed]);
  useEffect(() => save('name', name), [name]);
  useEffect(() => save('preset', preset), [preset]);
  useEffect(() => save('format', format), [format]);
  useEffect(() => save('customTemplate', customTemplate), [customTemplate]);
  useEffect(() => save('includeRoleSystemInReportsV1', includeRoleSystemInReports), [includeRoleSystemInReports]);
  useEffect(() => save('rolePalette', rolePalette), [rolePalette]);
  useEffect(() => save('roleWorkspaceMetaV1', roleWorkspaceMeta), [roleWorkspaceMeta]);
  useEffect(() => save('tutorialCompletion', tutorialCompletion), [tutorialCompletion]);
  useEffect(() => saveLocale(locale), [locale]);
  // 스크린리더가 브라질 포르투갈어 음성을 정확히 선택하도록 문서 언어 코드를 보정합니다.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!isTauri) return;
    let active = true;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then((version) => {
        if (active) setAppVersion(version);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void loadHistory()
      .then((loaded) => {
        if (!active) return;
        historyRef.current = loaded;
        setHistory(loaded);
      })
      .catch((error) => {
        if (active) showToast(nativeErrorMessage(error, 'error.libraryReadFailed'));
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    void resolveEntitlement()
      .then((status) => {
        if (active) setEntitlement(status);
      })
      .catch(() => {
        // 권한 확인 실패는 Pro로 승격하지 않고 안전하게 Free를 유지합니다.
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!showTutorialMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!tutorialMenuRef.current?.contains(event.target as Node)) setShowTutorialMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTutorialMenu(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showTutorialMenu]);

  function dismissIntro() {
    setSeenIntro(true);
    save('seenIntro', true);
  }

  function activateTutorial(id: TutorialId) {
    const steps = TUTORIALS[id];
    if (steps.length === 0) return;
    // 안내용 화면 이동은 탐색 상태만 바꾸고 역할색·보고서 포함 설정은 건드리지 않습니다.
    tutorialVerifyWorkspaceRestoreRef.current = verifyWorkspace;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tutorialReturnFocusRef.current = activeElement && tutorialMenuRef.current?.contains(activeElement)
      ? tutorialHelpButtonRef.current
      : activeElement;
    dismissIntro();
    setShowTutorialMenu(false);
    setWorkspaceTab(steps[0].tab);
    if (steps[0].verifyWorkspace) setVerifyWorkspace(steps[0].verifyWorkspace);
    setActiveTutorial({ id, index: 0 });
  }

  function openTutorial(id: TutorialId) {
    if (id === 'pro' && !pro) return;
    activateTutorial(id);
  }

  function openLegal() {
    setShowTutorialMenu(false);
    setShowLegal(true);
  }

  function closeLegal() {
    setShowLegal(false);
    window.setTimeout(() => tutorialHelpButtonRef.current?.focus(), 0);
  }

  function moveTutorial(nextIndex: number) {
    if (!activeTutorial) return;
    const steps = TUTORIALS[activeTutorial.id];
    const index = Math.min(Math.max(nextIndex, 0), steps.length - 1);
    setWorkspaceTab(steps[index].tab);
    if (steps[index].verifyWorkspace) setVerifyWorkspace(steps[index].verifyWorkspace);
    setActiveTutorial({ ...activeTutorial, index });
  }

  function closeTutorial() {
    setActiveTutorial(null);
    const restoreVerifyWorkspace = tutorialVerifyWorkspaceRestoreRef.current;
    tutorialVerifyWorkspaceRestoreRef.current = null;
    if (restoreVerifyWorkspace !== null) setVerifyWorkspace(restoreVerifyWorkspace);
    window.setTimeout(() => {
      const trigger = tutorialReturnFocusRef.current;
      (trigger?.isConnected ? trigger : tutorialHelpButtonRef.current)?.focus();
    }, 0);
  }

  function finishTutorial() {
    if (!activeTutorial) return;
    setTutorialCompletion((current) => ({ ...current, version: TUTORIAL_VERSION, [activeTutorial.id]: true }));
    closeTutorial();
  }

  function skipMissingTutorialTarget() {
    if (!activeTutorial) return;
    const steps = TUTORIALS[activeTutorial.id];
    if (activeTutorial.index >= steps.length - 1) closeTutorial();
    else moveTutorial(activeTutorial.index + 1);
  }

  // One toast channel: a later toast cleanly supersedes an undo toast, and the durable panel
  // button stays the reliable path regardless of toast churn.
  function showToast(msg: string, action?: ToastAction, ms = 1400) {
    setToast({ text: msg, action });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }
  function nativeErrorMessage(error: unknown, fallback: MsgKey = 'error.unknown'): string {
    const payload = parseNativeError(error);
    if (!payload) return t(fallback);
    const key = `error.${payload.code}` as MsgKey;
    const localized = t(key, payload.params);
    return localized === key ? t(fallback) : localized;
  }

  function openUpgrade() {
    // 공개 Free 빌드에서는 오래된 이벤트가 남아 있어도 유료 안내를 열지 않습니다.
    if (!PRO_UI_AVAILABLE || pro) return;
    upgradeReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowUpgrade(true);
  }

  function closeUpgrade() {
    setShowUpgrade(false);
    window.setTimeout(() => {
      const trigger = upgradeReturnFocusRef.current;
      if (trigger?.isConnected) trigger.focus();
    }, 0);
  }

  useEffect(() => {
    if (!showUpgrade) return;
    const dialog = upgradeDialogRef.current;
    if (!dialog) return;

    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((el) => el.offsetParent !== null);
    const focusInitial = window.setTimeout(() => (getFocusable()[0] ?? dialog).focus(), 0);
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeUpgrade();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      window.clearTimeout(focusInitial);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [showUpgrade]);

  function purchasePro() {
    if (import.meta.env.DEV && !isTauri) {
      // 브라우저 UI 개발에서만 전환합니다. Tauri의 네이티브 권한은 Rust가 결정합니다.
      setDevTier('lifetime_pro');
      setEntitlement(initialEntitlement());
      closeUpgrade();
      showToast(t('pro.unlocked'), { label: t('tutorial.pro'), run: () => activateTutorial('pro') }, 8000);
      return;
    }
    // TODO(store): Windows StoreContext.RequestPurchaseAsync 또는 macOS StoreKit을 호출하고,
    // 구매 성공 뒤 Store 권한을 다시 확인합니다.
    showToast(t('pro.storeSoon'));
  }
  // 브라우저 개발 화면에서만 Free와 Lifetime Pro를 전환합니다.
  function toggleProDev() {
    const next: LicenseTier = pro ? 'free' : 'lifetime_pro';
    setDevTier(next);
    setEntitlement(initialEntitlement());
    // 권한 전환 뒤 이전 Pro 결과나 실행 취소 상태가 되살아나지 않게 초기화합니다.
    setRepairFlow({ phase: 'idle' });
  }

  function handleUpdate() {
    if (updateState.phase === 'available') void updater.install();
    else if (updateState.phase === 'ready') void updater.restart();
    else if (updateState.phase === 'error') updater.retry();
  }

  async function writeClipboard(text: string): Promise<void> {
    if (isTauri) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
  }

  async function copyLegalValue(value: string): Promise<void> {
    try {
      await writeClipboard(value);
      showToast(t('legal.copied'));
    } catch (error) {
      showToast(t('export.copyFailed'));
      throw error;
    }
  }

  async function ingestImage(path: string) {
    setBusy(true);
    setImgError(null);
    setProfileWarning(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const raw = await invoke<RawSwatch[]>('extract_colors', { path });
      const refined = refineSwatches(raw);
      setSwatches(refined);
      const picked = pickSeed(refined);
      if (picked) updateSeed(picked.hex);
      if (refined.length === 0) setImgError(t('image.noColors'));
      try {
        setProfileWarning(await invoke<string | null>('detect_color_profile', { path }));
      } catch {
        /* profile detection is best-effort */
      }
    } catch (error) {
      setImgError(nativeErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function pickImage() {
    if (!isTauri) {
      setImgError(t('image.webOnly'));
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        multiple: false,
        filters: [{ name: t('image.filterName'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      });
      if (typeof path === 'string') await ingestImage(path);
    } catch (error) {
      setImgError(nativeErrorMessage(error));
    }
  }

  // Native drag-and-drop of an image onto the window. The cancelled flag avoids leaking /
  // double-registering the listener under React StrictMode's mount→unmount→remount.
  useEffect(() => {
    if (!isTauri) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview');
      const fn = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload as { type: string; paths?: string[] };
        if (p.type === 'drop' && p.paths && p.paths.length > 0) void ingestImage(p.paths[0]);
      });
      if (cancelled) fn();
      else unlisten = fn;
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 신규 생성은 원본만 사용합니다. 이전 라이브러리의 enforceAA:true 항목을 연 경우에만
  // 같은 엔진 옵션으로 과거 색과 내보내기 결과를 결정론적으로 재현합니다.
  const result = useMemo(() => {
    try {
      if (!isHex6(seed)) throw new Error('HEX 입력 형식이 아닙니다.');
      return {
        originalRamp: buildRamp(seed, preset, {
          name: effectiveName || undefined,
          enforceAA: false,
        }),
        legacyRamp: effectiveEnforceAA
          ? buildRamp(seed, preset, {
              name: effectiveName || undefined,
              enforceAA: true,
            })
          : null,
        error: null as string | null,
      };
    } catch {
      return {
        originalRamp: null,
        legacyRamp: null,
        error: t('error.invalidColor', { value: seed }),
      };
    }
  }, [effectiveEnforceAA, seed, preset, effectiveName, t]);

  const ramp = effectiveEnforceAA ? result.legacyRamp : result.originalRamp;
  const paletteFingerprint = ramp
    ? ramp.steps.map((step) => `${step.step}:${step.hex}`).join('|')
    : '';
  useEffect(() => {
    if (!ramp && workspaceTab !== 'create') setWorkspaceTab('create');
  }, [ramp, workspaceTab]);
  const code = useMemo(() => {
    if (!ramp || workspaceTab !== 'deliver' || (!pro && !isFreeFormat(format))) return '';
    const rampCode = format === 'custom' ? exportCustom(ramp, customTemplate) : exportRamp(ramp, format);
    if (!pro || format === 'custom' || !includeActiveRoleSystem) return rampCode;

    const roleCode = exportRoleTokens(rolePalette, format);
    if (format === 'dtcg') {
      return mergeDtcgDocuments(rampCode, roleCode);
    }
    return `${rampCode.trimEnd()}\n\n${roleCode}\n`;
  }, [ramp, format, customTemplate, includeActiveRoleSystem, pro, rolePalette, workspaceTab]);
  const exportLocked = PRO_UI_AVAILABLE && !pro && !isFreeFormat(format);

  // 전체 글자색·배경색 대비표는 사용자가 실제로 펼쳤을 때만 계산한다.
  const matrix = useMemo(
    () => (ramp && workspaceTab === 'verify' && verifyWorkspace === 'roles' && showMatrix
      ? ramp.steps.map((fg) => ramp.steps.map((bg) => contrastBetween(fg.hex, bg.hex)))
      : null),
    [ramp, showMatrix, verifyWorkspace, workspaceTab],
  );
  // 색각이상 환경에서 서로 구별하기 어려운 상태 색 조합을 찾는다.
  const semantic = useMemo(() => statusColors(rolePalette), [rolePalette]);
  // 미리 검토는 팔레트를 변경하지 않는다. Free는 문제 수를, Pro는 보정값과 적용 기능을 본다.
  const repairPreview = useMemo(() => repairRolePalette(rolePalette), [rolePalette]);
  const roleAssessment = repairPreview.before;
  const roleBlockers = roleAssessment.issues.filter((issue) => issue.blocking);
  // 보정으로 분리도가 개선되어도 모든 문제가 기준 아래로 내려가지는 않을 수 있습니다.
  // 변경될 색 수와 완전히 해결되는 문제 수를 서로 다른 지표로 유지합니다.
  const safeChangeCount = repairPreview.changes.length;
  const manualReviewCount = repairPreview.counts.unresolved;
  // 저장하지 않고 값에서 계산하므로 상태 불일치가 생기지 않습니다.
  // 편집 이벤트가 아니라 실제 값을 비교해 같은 HEX를 다시 확정한 경우 실행 취소를 유지합니다.
  const undoStale = repairFlow.phase === 'applied' && !roleEquals(rolePalette, repairFlow.result.palette);
  // 대비 문제에서 배경은 기준색이므로 전경 역할만 문제를 소유합니다.
  // 색각이상 혼동 문제는 충돌한 두 상태 역할에 모두 연결합니다.
  function roleIssueBreakdown(role: ColorRole) {
    const issues = roleBlockers.filter((issue) =>
      issue.code === 'roleContrast' ? issue.roles[0] === role : issue.roles.includes(role),
    );
    return {
      n: issues.length,
      contrast: issues.filter((issue) => issue.code === 'roleContrast').length,
      cvd: issues.filter((issue) => issue.code === 'roleCvdConfusion').length,
    };
  }
  const rolePreviewColors = useMemo(
    () =>
      Object.fromEntries(
        rolePalette.colors.map((color) => [color.role, simulateHex(color.hex, rolePreviewVision)]),
      ) as Record<ColorRole, string>,
    [rolePalette, rolePreviewVision],
  );
  const rolePreviewOnPrimary = readableTextOn(rolePreviewColors.primary);
  const rolePreviewTextIssue = roleIssueBreakdown('text');
  const rolePreviewPrimaryIssue = roleIssueBreakdown('primary');
  const duplicateConfusion = roleAssessment.duplicateConfusion;
  const chromaticConfusion = roleAssessment.chromaticConfusion;
  const monochromeConfusion = roleAssessment.monochromeConfusion;
  const statusColorReviewCount = duplicateConfusion.length + chromaticConfusion.length;
  // 준비 상태에서 차단 신호는 동일 HEX와 색채 CVD 검토 항목만 집계합니다.
  // 흑백 명도 유사성은 색상만 바꿔 해결할 문제가 아니므로 별도 정보로 유지합니다.
  const simulationConfusion = [...chromaticConfusion];
  for (const pair of monochromeConfusion) {
    const alreadyIncluded = simulationConfusion.some(
      (candidate) => candidate.a.hex === pair.a.hex && candidate.b.hex === pair.b.hex,
    );
    if (!alreadyIncluded) simulationConfusion.push(pair);
  }
  // 모든 수동 편집은 이 두 경로를 거친다. 열린 검토 결과는 무효화하고,
  // 적용된 결과는 사용자가 안내를 계속 확인할 수 있도록 유지하고 값 비교로 실행 취소 가능 여부를 판단한다.
  function collapseReview() {
    setRepairFlow((flow) => (flow.phase === 'reviewing' ? { phase: 'idle' } : flow));
  }
  function updateRoleColor(role: ColorRole, hex: string) {
    const normalized = normalizeHex6(hex);
    if (!normalized) return;
    setRolePalette((previous) => setRoleColor(previous, role, normalized));
    // 기본 두 색 검사와 고급 역할색 편집이 같은 텍스트·배경 값을 공유합니다.
    if (role === 'text') setCmpA(normalized);
    if (role === 'background') setCmpB(normalized);
    setRoleWorkspaceMeta((current) => ({
      version: 1,
      status: 'active',
      source: current.source ?? 'legacy',
    }));
    setRoleWorkspaceUndo(null);
    collapseReview();
  }
  function updateRoleLock(role: ColorRole, locked: boolean) {
    setRolePalette((previous) => setRoleLocked(previous, role, locked));
    setRoleWorkspaceMeta((current) => ({
      version: 1,
      status: 'active',
      source: current.source ?? 'legacy',
    }));
    setRoleWorkspaceUndo(null);
    collapseReview();
  }

  function startRoleWorkspaceWithExamples(returnFocus?: HTMLElement) {
    if (roleWorkspaceMeta.status === 'legacy-unconfirmed') {
      roleWorkspaceActionReturnFocusRef.current = returnFocus ?? null;
      setRoleWorkspaceAction('reset');
      focusRoleWorkspaceConfirmation();
      return;
    }
    setRoleWorkspaceMeta({ version: 1, status: 'active', source: 'example' });
    setRoleWorkspaceAction(null);
    window.requestAnimationFrame(() => roleSystemRef.current?.focus());
  }

  function continueLegacyRoleWorkspace() {
    setRoleWorkspaceMeta({ version: 1, status: 'active', source: 'legacy' });
    setRoleWorkspaceAction(null);
    window.requestAnimationFrame(() => roleSystemRef.current?.focus());
  }

  function focusRoleWorkspaceConfirmation() {
    window.requestAnimationFrame(() => roleWorkspaceConfirmTitleRef.current?.focus());
  }

  function previewRoleWorkspaceReset(returnFocus: HTMLElement) {
    roleWorkspaceActionReturnFocusRef.current = returnFocus;
    setRoleWorkspaceAction('reset');
    focusRoleWorkspaceConfirmation();
  }

  function cancelRoleWorkspaceAction() {
    setRoleWorkspaceAction(null);
    window.requestAnimationFrame(() => roleWorkspaceActionReturnFocusRef.current?.focus());
  }

  function syncPairIntoRoleWorkspace(): boolean {
    if (!normalizedCmpA || !normalizedCmpB) return false;
    const beforeMeta = roleWorkspaceMeta;
    const nextPalette = importPairIntoRolePalette(rolePalette, normalizedCmpA, normalizedCmpB);
    if (!nextPalette) return false;
    if (!roleEquals(rolePalette, nextPalette)) {
      setRoleWorkspaceUndo({
        action: 'import',
        beforePalette: rolePalette,
        beforeMeta,
        afterPalette: nextPalette,
      });
      setRolePalette(nextPalette);
    }
    setRoleWorkspaceMeta({ version: 1, status: 'active', source: 'pair' });
    setRoleWorkspaceAction(null);
    setRepairFlow({ phase: 'idle' });
    return true;
  }

  function confirmRoleWorkspaceReset() {
    const returningToActiveWorkspace = roleWorkspaceMeta.status === 'active';
    const nextPalette = createRolePalette();
    setRoleWorkspaceUndo({
      action: 'reset',
      beforePalette: rolePalette,
      beforeMeta: roleWorkspaceMeta,
      afterPalette: nextPalette,
    });
    setRolePalette(nextPalette);
    setRoleWorkspaceMeta({ version: 1, status: 'active', source: 'example' });
    setRoleWorkspaceAction(null);
    setRepairFlow({ phase: 'idle' });
    window.requestAnimationFrame(() => {
      if (returningToActiveWorkspace) roleWorkspaceActionReturnFocusRef.current?.focus();
      else roleSystemRef.current?.focus();
    });
  }

  function undoRoleWorkspaceAction() {
    if (!roleWorkspaceUndo || !roleEquals(rolePalette, roleWorkspaceUndo.afterPalette)) return;
    setRolePalette(roleWorkspaceUndo.beforePalette);
    setRoleWorkspaceMeta(roleWorkspaceUndo.beforeMeta);
    setRoleWorkspaceUndo(null);
    setRepairFlow({ phase: 'idle' });
    showToast(t('roleWorkspace.undone'));
    window.requestAnimationFrame(() => roleWorkspaceTitleRef.current?.focus());
  }

  function reviewRoleRepair() {
    if (!pro) {
      openUpgrade();
      return;
    }
    setRepairFlow({ phase: 'reviewing', result: repairPreview, snapshot: rolePalette });
  }
  function cancelRoleReview() {
    setRepairFlow({ phase: 'idle' });
  }
  /** Applies exactly what the review panel rendered: result and snapshot are captured together. */
  function confirmRoleRepair() {
    if (!pro) {
      openUpgrade();
      return;
    }
    if (repairFlow.phase !== 'reviewing') return;
    const { result, snapshot } = repairFlow;
    if (!roleEquals(rolePalette, snapshot)) {
      setRepairFlow({ phase: 'idle' });
      return;
    }
    if (result.changes.length === 0) return;
    setRolePalette(result.palette);
    setRepairFlow({ phase: 'applied', result, snapshot });
    showToast(t('roles.appliedToast', { n: result.changes.length }), { label: t('roles.undoShort'), run: undoRoleRepair }, 6000);
  }
  function chooseRoleRepairAlternative(role: ColorRole, hex: string) {
    setRepairFlow((flow) =>
      flow.phase === 'reviewing'
        ? { ...flow, result: selectRoleRepairAlternative(flow.snapshot, flow.result, role, hex) }
        : flow,
    );
  }
  /** Restores every hex and lock flag. Re-checks staleness so a late toast click is as safe as the
   *  disabled panel button — the palette is never silently overwritten by an old snapshot. */
  function undoRoleRepair() {
    const flow = flowRef.current;
    if (flow.phase !== 'applied') return;
    if (!roleEquals(paletteRef.current, flow.result.palette)) {
      showToast(t('roles.undoStale'));
      return;
    }
    setRolePalette(flow.snapshot);
    setRepairFlow({ phase: 'idle' });
    showToast(t('roles.undone'));
  }
  /** One "before → after" row with the measured evidence that justified it. */
  function renderChangeRow(change: RoleRepairChange, allowAlternatives = false) {
    const evidence: string[] = [];
    if (change.measured.required !== undefined && change.measured.ratio !== undefined) {
      evidence.push(t('roles.measure.contrast', { ratio: change.measured.ratio, required: change.measured.required }));
    }
    if (change.measured.cvdDistBefore !== undefined) {
      evidence.push(
        change.measured.cvdDistAfter === undefined
          ? t('roles.measure.cvdResolved')
          : t('roles.measure.cvd', { before: change.measured.cvdDistBefore, after: change.measured.cvdDistAfter }),
      );
    }
    return (
      <div key={change.role} className="pg-role-row">
        <span className="pg-role-row-head">
          <span className="pg-role-swatch" style={{ background: change.before }} />
          <span className="pg-role-chip-label">{roleLabel(change.role)}</span>
          <code>{change.before}</code>
          <span aria-hidden="true">→</span>
          <span className="pg-role-swatch" style={{ background: change.after }} />
          <code>{change.after}</code>
        </span>
        {evidence.length > 0 && <span className="pg-role-row-why">{evidence.join(' · ')}</span>}
        {allowAlternatives && change.alternatives.length > 1 && (
          <div className="pg-role-alternatives" role="group" aria-label={t('roles.alternatives')}>
            <span className="pg-role-alternatives-label">{t('roles.alternatives')}</span>
            <div className="pg-role-alternative-list">
              {change.alternatives.map((candidate, index) => {
                const selected = candidate.hex === change.after;
                return (
                  <button
                    key={candidate.hex}
                    type="button"
                    className={`pg-role-alternative${selected ? ' pg-role-alternative--selected' : ''}`}
                    aria-pressed={selected}
                    aria-label={t('roles.alternativeOption', { rank: index + 1, hex: candidate.hex })}
                    onClick={() => chooseRoleRepairAlternative(change.role, candidate.hex)}
                  >
                    <span className="pg-role-swatch" style={{ background: candidate.hex }} />
                    <span>{index + 1}</span>
                    <code>{candidate.hex}</code>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  /** Objective reason + a concrete recommendation. Locked blockers get their own group so a pinned
   *  color is never confused with an unfixable one, and nothing is ever auto-unlocked. */
  function renderUnresolved(entries: RoleRepairUnresolved[]) {
    const lockedEntries = entries.filter((entry) => entry.reason === 'locked');
    const others = entries.filter((entry) => entry.reason !== 'locked');
    const row = (entry: RoleRepairUnresolved, index: number) => {
      const { issue, reason } = entry;
      let subject: string;
      if (issue.code === 'roleContrast') {
        subject = t('roles.pairOn', { fg: roleLabel(issue.roles[0]), bg: roleLabel(issue.roles[1]) });
      } else if (issue.confusion?.kind === 'duplicate') {
        subject = issue.confusion.aMembers
          .map((member) => roleLabel(member.role as ColorRole))
          .join(' · ');
      } else if (issue.confusion) {
        subject = t('roles.pairVs', {
          a: issue.confusion.aMembers
            .map((member) => roleLabel(member.role as ColorRole))
            .join(' · '),
          b: issue.confusion.bMembers
            .map((member) => roleLabel(member.role as ColorRole))
            .join(' · '),
        });
      } else {
        subject = issue.roles.map(roleLabel).join(' · ');
      }
      const kind = issue.code === 'roleContrast' ? t('roles.reason.contrast') : t('roles.reason.cvd');
      return (
        <div key={`${reason}-${issue.roles.join('-')}-${index}`} className="pg-role-row">
          <span className="pg-role-row-head">
            <span className="pg-role-chip-label">{subject}</span>
            <span className="pg-role-kind">{kind}</span>
            {reason === 'locked' && <span className="pg-role-lockedtag">🔒 {t('roles.lockedTag')}</span>}
          </span>
          <span className="pg-role-row-why">
            {t('roles.unresolvedLabel')} {t(`roles.unresolved.${reason}` as MsgKey)}
          </span>
          <span className="pg-role-row-fix">
            {t('roles.recommendLabel')} {t(`roles.recommend.${reason}` as MsgKey)}
          </span>
        </div>
      );
    };
    return (
      <>
        {others.length > 0 && (
          <>
            <div className="pg-role-section-title">⚠ {t('roles.sectionUnresolved')}</div>
            <div className="pg-role-rows">{others.map(row)}</div>
          </>
        )}
        {lockedEntries.length > 0 && (
          <>
            <div className="pg-role-section-title">🔒 {t('roles.sectionSkippedLocked')}</div>
            <div className="pg-role-rows pg-role-result__locked">{lockedEntries.map(row)}</div>
          </>
        )}
      </>
    );
  }

  function roleLabel(role: ColorRole): string {
    const key = role === 'primary' || role === 'background' || role === 'text' ? `roles.${role}` : `sem.${role}`;
    return t(key as MsgKey);
  }

  function renderRoleColorCard(color: RolePalette['colors'][number]) {
    const issue = roleIssueBreakdown(color.role);
    return (
      <div
        key={color.role}
        id={`pg-role-control-${color.role}`}
        className={`pg-role-card${issue.n > 0 ? ' pg-role-card--issue' : ''}`}
        tabIndex={-1}
      >
        <div className="pg-role-card-head">
          <span className="pg-sem-role">{roleLabel(color.role)}</span>
          {issue.n > 0 && (
            <span
              className="pg-role-issue"
              title={t('roles.issueBadgeDetail', issue)}
              aria-label={t('roles.issueBadgeDetail', issue)}
            >
              {t('roles.issueBadge', issue)}
            </span>
          )}
        </div>
        <div className="pg-sem-fields">
          <input
            type="color"
            value={color.hex}
            onChange={(event) => updateRoleColor(color.role, event.target.value)}
            aria-label={roleLabel(color.role)}
          />
          <HexTextInput
            value={color.hex}
            ariaLabel={`${roleLabel(color.role)} hex`}
            onCommit={(value) => updateRoleColor(color.role, value)}
            onInvalid={(value) =>
              showToast(t('error.invalidColor', { value }), undefined, 2800)}
          />
        </div>
        <ApproximateColorName hex={color.hex} t={t} />
        <label className="pg-role-lock">
          <input
            type="checkbox"
            checked={color.locked}
            onChange={(event) => updateRoleLock(color.role, event.target.checked)}
          />
          <span>{t('roles.lock')}</span>
        </label>
      </div>
    );
  }

  function semanticRoleNames(colors: readonly { role: string }[]): string {
    return colors.map((color) => t(`sem.${color.role}` as MsgKey)).join(' · ');
  }

  const formatRatio = (ratio: number): string => formatContrastRatio(ratio);
  const textColorLabel = (text: 'black' | 'white'): string =>
    t(text === 'white' ? 'paletteVariant.textWhite' : 'paletteVariant.textBlack');
  const contrastLevelLabel = (ratio: number): string =>
    t(ratio >= 7
      ? 'paletteUsage.levelAaa'
      : ratio >= 4.5
        ? 'paletteUsage.levelAa'
        : ratio >= 3
          ? 'paletteUsage.levelLarge'
          : 'paletteUsage.levelFail');
  const swatchAriaLabel = (step: RampStep): string => {
    const recommendation = recommendTextOnBackground(step.hex);
    return t('paletteUsage.swatchLabel', {
      hex: step.hex,
      step: step.step,
      textColor: textColorLabel(recommendation.text),
      ratio: formatRatio(recommendation.ratio),
      blackRatio: formatRatio(step.contrastBlack),
      whiteRatio: formatRatio(step.contrastWhite),
      level: contrastLevelLabel(recommendation.ratio),
    });
  };
  const swatchRecommendation = (step: RampStep): string => {
    const recommendation = recommendTextOnBackground(step.hex);
    return t('paletteUsage.swatchBadge', {
      textColor: textColorLabel(recommendation.text),
      ratio: formatRatio(recommendation.ratio),
      badgeLevel: recommendation.ratio >= 7 ? 'AAA' : 'AA',
    });
  };
  const actualPairCheck = useMemo(() => evaluateActualPair(cmpA, cmpB), [cmpA, cmpB]);
  const {
    state: actualPairState,
    foreground: normalizedCmpA,
    background: normalizedCmpB,
    foregroundInvalid: cmpAInvalid,
    backgroundInvalid: cmpBInvalid,
    ratio: actualPairRatio,
  } = actualPairCheck;
  const actualPairVisionPreviews = useMemo(
    () => buildActualPairVisionPreviews(cmpA, cmpB),
    [cmpA, cmpB],
  );
  useEffect(() => {
    if (!normalizedCmpA || !normalizedCmpB) setShowActualPairCvd(false);
  }, [normalizedCmpA, normalizedCmpB]);
  const explicitTextPair: ExplicitTextPair | undefined = normalizedCmpA && normalizedCmpB
    ? { foreground: normalizedCmpA, background: normalizedCmpB }
    : undefined;
  const roleWorkspaceUndoStale = roleWorkspaceUndo !== null
    && !roleEquals(rolePalette, roleWorkspaceUndo.afterPalette);
  const actualPairMeetsTarget = actualPairRatio !== null && actualPairRatio >= pairTarget;
  const pairFixCandidates = useMemo(() => {
    if (fixedPairRole || actualPairRatio === null || actualPairRatio >= pairTarget) return null;
    return buildPairContrastCandidates(cmpA, cmpB, pairTarget);
  }, [actualPairRatio, cmpA, cmpB, fixedPairRole, pairTarget]);
  const pairFixOptions = pairFixCandidates
    ? ([
        ['foreground', pairFixCandidates.foreground],
        ['background', pairFixCandidates.background],
      ] as const).flatMap(([target, candidate]) => (
        candidate ? [{ target, candidate }] : []
      ))
    : [];
  const fixedPairRecommendations = useMemo(() => {
    if (!fixedPairRole) return null;
    const fixedHex = fixedPairRole === 'foreground' ? cmpA : cmpB;
    const otherHex = fixedPairRole === 'foreground' ? cmpB : cmpA;
    return buildFixedRoleContrastRecommendations({
      fixedRole: fixedPairRole,
      fixedHex,
      otherHex,
      palette: ramp?.steps.map((step) => ({ step: step.step, hex: step.hex })) ?? [],
      target: pairTarget,
      maxPaletteCandidates: ramp?.steps.length ?? 0,
    });
  }, [cmpA, cmpB, fixedPairRole, pairTarget, ramp]);
  const activeFixedPairRecommendation = fixedPairRecommendations && fixedPairRecommendations.length > 0
    ? fixedPairRecommendations[pairRecommendationIndex % fixedPairRecommendations.length]
    : null;
  const previewPairForeground = activeFixedPairRecommendation && fixedPairRole === 'background'
    ? activeFixedPairRecommendation.hex
    : normalizedCmpA;
  const previewPairBackground = activeFixedPairRecommendation && fixedPairRole === 'foreground'
    ? activeFixedPairRecommendation.hex
    : normalizedCmpB;
  const previewPairRatio = previewPairForeground && previewPairBackground
    ? contrastBetween(previewPairForeground, previewPairBackground)
    : null;
  const previewPairMeetsTarget = previewPairRatio !== null && previewPairRatio >= pairTarget;
  const previewPairStatusKey: MsgKey = pairTarget === 3
    ? (previewPairMeetsTarget ? 'pairContrast.selectedPassLarge' : 'pairContrast.selectedFailLarge')
    : pairTarget === 7
      ? (previewPairMeetsTarget ? 'pairContrast.selectedPassAaa' : 'pairContrast.selectedFailAaa')
      : (previewPairMeetsTarget ? 'pairContrast.selectedPassNormal' : 'pairContrast.selectedFailNormal');
  const fixedPairMaximum = useMemo(() => {
    if (!fixedPairRole) return null;
    const fixedHex = normalizeHex6(fixedPairRole === 'foreground' ? cmpA : cmpB);
    if (!fixedHex) return null;
    const blackRatio = contrastBetween(fixedHex, '#000000');
    const whiteRatio = contrastBetween(fixedHex, '#ffffff');
    return blackRatio >= whiteRatio
      ? { fixedHex, bestHex: '#000000', ratio: blackRatio }
      : { fixedHex, bestHex: '#ffffff', ratio: whiteRatio };
  }, [cmpA, cmpB, fixedPairRole]);
  const actualPairLevel = actualPairState === 'empty' || actualPairState === 'invalid'
    ? actualPairState
    : actualPairMeetsTarget
      ? 'pass'
      : 'fail';
  const displayedPairLevel = activeFixedPairRecommendation
    ? (previewPairMeetsTarget ? 'pass' : 'fail')
    : actualPairLevel;
  const actualPairIssueCount = actualPairState === 'invalid'
    || (actualPairRatio !== null && !actualPairMeetsTarget)
    ? 1
    : 0;
  const pairTargetText = targetRatioFormatter.format(pairTarget);
  const selectedPairStatusKey: MsgKey = pairTarget === 3
    ? (actualPairMeetsTarget ? 'pairContrast.selectedPassLarge' : 'pairContrast.selectedFailLarge')
    : pairTarget === 7
      ? (actualPairMeetsTarget ? 'pairContrast.selectedPassAaa' : 'pairContrast.selectedFailAaa')
      : (actualPairMeetsTarget ? 'pairContrast.selectedPassNormal' : 'pairContrast.selectedFailNormal');
  const actualPairStatusText = actualPairState === 'empty'
    ? t('paletteUsage.actualPairEmpty')
    : actualPairState === 'invalid'
      ? t('pairContrast.invalid')
      : t(selectedPairStatusKey);
  const fixedPairSourceChanged = fixedPairSource !== null
    && fixedPairSource.paletteFingerprint !== paletteFingerprint;
  const activePaletteLabel = effectiveEnforceAA
    ? t('paletteUsage.legacyName')
    : t('paletteUsage.originalName');
  const formatDestination = format === 'custom' ? t('format.custom') : FORMAT_DESTINATIONS[format];
  const pairReadinessCards = ramp
    ? [
        {
          label: t('ready.scale'),
          value: t('ready.steps', { n: ramp.steps.length }),
          hint: t('ready.scaleHint'),
          state: 'neutral',
          action: () => activateWorkspace('create', () => scrollTo(rampRef.current)),
        },
        {
          label: t('ready.accessibility'),
          value: actualPairStatusText,
          hint: t('paletteUsage.checkActualHint'),
          state: actualPairState === 'empty'
            ? 'neutral'
            : actualPairIssueCount > 0
              ? 'attention'
              : 'ready',
          action: () => activateVerifyWorkspace('pair', () => scrollTo(pairContrastRef.current)),
        },
      ]
    : [];
  const roleContrastIssueCount = roleBlockers.filter((issue) => issue.code === 'roleContrast').length;
  const roleReadinessCards = [
    {
      label: t('ready.accessibility'),
      value: roleContrastIssueCount === 0
        ? t('roles.ready')
        : t('roles.issues', { n: roleContrastIssueCount }),
      hint: t('roles.note'),
      state: roleContrastIssueCount === 0 ? 'ready' : 'attention',
      action: () => scrollTo(roleSystemRef.current),
    },
    {
      label: t('statusCvd.duplicateTitle'),
      value: duplicateConfusion.length === 0
        ? t('statusCvd.duplicateNone')
        : t('roles.issues', { n: duplicateConfusion.length }),
      hint: t('statusCvd.duplicateTitle'),
      state: duplicateConfusion.length === 0 ? 'ready' : 'attention',
      action: () => scrollTo(statusCheckRef.current),
    },
    {
      label: t('statusCvd.chromaticTitle'),
      value: chromaticConfusion.length === 0
        ? t('statusCvd.chromaticClear')
        : t('statusCvd.chromaticRisk', { n: chromaticConfusion.length }),
      hint: t('confusion.note', {
        same: MATCH_SAME_DISTANCE.toFixed(3),
        threshold: MATCH_REVIEW_DISTANCE.toFixed(3),
        ratio: Math.round(MATCH_RELATIVE_COLLAPSE_RATIO * 100),
      }),
      state: chromaticConfusion.length === 0 ? 'ready' : 'attention',
      action: () => scrollTo(statusCheckRef.current),
    },
    {
      label: t('statusCvd.monochromeTitle'),
      value: monochromeConfusion.length === 0
        ? t('statusCvd.monochromeClear')
        : t('statusCvd.monochromeRisk', { n: monochromeConfusion.length }),
      hint: t('statusCvd.monochromeTitle'),
      state: monochromeConfusion.length === 0 ? 'ready' : 'neutral',
      action: () => scrollTo(statusCheckRef.current),
    },
  ];
  // 실제 두 색과 고급 UI 시스템 문제 수는 합산하지 않고 현재 하위 작업 공간만 설명합니다.
  const activeRoleIssueCount = roleSystemReadyForExport ? roleBlockers.length : 0;
  const verifyIssueCount = verifyWorkspace === 'pair' ? actualPairIssueCount : activeRoleIssueCount;
  const verifyIssueDescription = verifyWorkspace === 'pair'
    ? (actualPairState === 'invalid'
        ? t('pairContrast.invalid')
        : actualPairIssueCount > 0
          ? t(selectedPairStatusKey)
          : '')
    : (activeRoleIssueCount > 0 ? t('workflow.roleIssues', { n: activeRoleIssueCount }) : '');

  async function copyExport() {
    if (!pro && !isFreeFormat(format)) {
      openUpgrade();
      return;
    }
    try {
      await writeClipboard(code);
      showToast(t('export.copied'));
    } catch {
      showToast(t('export.copyFailed'));
    }
  }

  async function saveExport() {
    if (!ramp) return;
    if (!pro && !isFreeFormat(format)) {
      openUpgrade();
      return;
    }
    if (!isTauri) {
      showToast(t('export.saveDesktopOnly'));
      return;
    }
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const meta = FORMAT_FILE[format];
      const path = await save({
        defaultPath: meta.file(ramp.name),
        filters: [{ name: meta.ext.toUpperCase(), extensions: [meta.ext] }],
      });
      if (typeof path === 'string') {
        await invoke(pro ? 'write_text_file' : 'write_free_css_file', { path, contents: code });
        showToast(t('export.saved'));
      }
    } catch (error) {
      showToast(nativeErrorMessage(error, 'error.fileWriteFailed'));
    }
  }

  async function saveAse() {
    if (!ramp) return;
    if (!pro) {
      openUpgrade();
      return;
    }
    if (!isTauri) {
      showToast(t('export.saveDesktopOnly'));
      return;
    }
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await save({ defaultPath: `${ramp.name}.ase`, filters: [{ name: 'ASE', extensions: ['ase'] }] });
      if (typeof path === 'string') {
        await invoke('write_binary_file', { path, bytes: Array.from(exportAse(ramp)) });
        showToast(t('export.saved'));
      }
    } catch (error) {
      showToast(nativeErrorMessage(error, 'error.fileWriteFailed'));
    }
  }

  async function saveExportPack() {
    if (!ramp) return;
    if (!pro) {
      openUpgrade();
      return;
    }
    if (!isTauri) {
      showToast(t('export.saveDesktopOnly'));
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const dir = await open({ directory: true });
      if (typeof dir !== 'string') return;
      // 기존 Export Pack이나 사용자가 수정한 파일을 건드리지 않도록 네이티브 계층에서
      // 이름이 겹치지 않는 새 폴더를 원자적으로 예약한 뒤 그 위치에만 저장합니다.
      const folder = await invoke<string>('reserve_export_pack_directory', {
        parent: dir,
        folderName: `${ramp.name}-palette`,
      });
      for (const f of exportPack(
        ramp,
        semantic,
        rolePalette,
        includeActiveRoleSystem,
        explicitTextPair,
      )) {
        const path = `${folder}/${f.name}`;
        if (f.bytes) await invoke('write_binary_file', { path, bytes: Array.from(f.bytes) });
        else await invoke('write_text_file', { path, contents: f.text ?? '' });
      }
      showToast(t('export.packSaved'));
    } catch (error) {
      showToast(nativeErrorMessage(error, 'error.fileWriteFailed'));
    }
  }

  async function saveReport() {
    if (!ramp) return;
    if (!pro) {
      openUpgrade();
      return;
    }
    if (!isTauri) {
      showToast(t('export.saveDesktopOnly'));
      return;
    }
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await save({
        defaultPath: `${ramp.name}-accessibility.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (typeof path === 'string') {
        await invoke('write_text_file', {
          path,
          contents: buildReport(
            ramp,
            includeActiveRoleSystem ? semantic : [],
            includeActiveRoleSystem ? rolePalette : undefined,
            includeActiveRoleSystem,
            explicitTextPair,
          ),
        });
        showToast(t('report.saved'));
      }
    } catch (error) {
      showToast(nativeErrorMessage(error, 'error.fileWriteFailed'));
    }
  }

  async function saveToLibrary() {
    if (!ramp) {
      showToast(result.error ?? t('error.invalidColor', { value: seed }));
      return;
    }
    if (!pro && history.length >= FREE_SAVE_LIMIT) {
      if (PRO_UI_AVAILABLE) openUpgrade();
      else showToast(t('library.limitReached', { limit: FREE_SAVE_LIMIT }), undefined, 3200);
      return;
    }
    if (effectiveEnforceAA) {
      showToast(t('paletteUsage.legacySaveBlocked'), undefined, 4200);
      scrollTo(rampRef.current);
      return;
    }
    try {
      const saved = await addHistory(historyRef.current, {
        name: effectiveName,
        seed,
        preset,
        enforceAA: false,
      });
      historyRef.current = saved;
      setHistory(saved);
      showToast(t('library.saved'));
    } catch (error) {
      showToast(nativeErrorMessage(error, 'error.libraryWriteFailed'));
    }
  }
  function loadEntry(e: HistoryEntry) {
    setSeed(e.seed);
    setPreset(e.preset);
    setName(e.name);
    // 기존 보정 항목은 색·내보내기 결과를 그대로 재현하되 신규 생성에는 이어지지 않습니다.
    updateLegacyEnforceAA(e.enforceAA);
    // 라이브러리에는 역할 색이 없으므로 이전 보정 결과와 실행 취소 상태를 함께 초기화합니다.
    setRepairFlow({ phase: 'idle' });
    showToast(t('library.loaded'));
  }
  async function deleteEntry(id: string) {
    const deleted = historyRef.current.find((entry) => entry.id === id);
    if (!deleted) return;
    let next: HistoryEntry[];
    try {
      next = await removeHistory(historyRef.current, id);
      historyRef.current = next;
      setHistory(next);
    } catch (error) {
      showToast(nativeErrorMessage(error, 'error.libraryWriteFailed'));
      return;
    }
    showToast(
      t('library.deleted'),
      {
        label: t('roles.undoShort'),
        run: () => {
          void (async () => {
            const current = historyRef.current;
            if (current.some((entry) => entry.id === deleted.id)) return;
            const restored = [...current, deleted].sort((a, b) => b.createdAt - a.createdAt);
            try {
              const saved = await saveLibrary(restored);
              historyRef.current = saved;
              setHistory(saved);
              showToast(t('library.deleteUndone'));
            } catch (error) {
              showToast(nativeErrorMessage(error, 'error.libraryWriteFailed'));
            }
          })();
        },
      },
      6000,
    );
  }
  async function exportLibrary() {
    if (!isTauri) {
      showToast(t('export.saveDesktopOnly'));
      return;
    }
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await save({ defaultPath: 'pcssak-palettes.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (typeof path === 'string') {
        await invoke('write_library_backup', { path, contents: serializeLibrary(history) });
        showToast(t('library.exported'));
      }
    } catch (error) {
      showToast(nativeErrorMessage(error, 'error.fileWriteFailed'));
    }
  }
  async function importLibrary() {
    if (!isTauri) {
      showToast(t('export.saveDesktopOnly'));
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (typeof path !== 'string') return;
      const text = await invoke<string>('read_library_backup', { path });
      const imported = parseLibrary(text);
      const merged = [...imported, ...historyRef.current];
      const saved = await saveLibrary(pro ? merged : merged.slice(0, FREE_SAVE_LIMIT));
      historyRef.current = saved;
      setHistory(saved);
      showToast(t('library.imported'));
    } catch (error) {
      showToast(parseNativeError(error) ? nativeErrorMessage(error, 'error.fileReadFailed') : t('library.importFailed'));
    }
  }

  // 저장 팔레트 미리보기는 라이브러리가 보이는 생성 탭에서만 계산한다.
  const previews = useMemo(
    () => {
      if (workspaceTab !== 'create') return [];
      return history.map((e) => {
        let colors: string[] = [e.seed];
        try {
          colors = buildRamp(e.seed, e.preset, { name: e.name || undefined, enforceAA: e.enforceAA }).steps
            .filter((s) => [100, 300, 500, 700, 900].includes(s.step))
            .map((s) => s.hex);
        } catch {
          /* keep the seed-color fallback */
        }
        return { e, colors };
      });
    },
    [history, pro, workspaceTab],
  );

  async function copySwatch(hex: string) {
    try {
      await writeClipboard(hex);
      showToast(t('export.copiedHex', { hex }));
    } catch {
      showToast(t('export.copyFailed'));
    }
  }

  function selectPaletteColor(step: RampStep, moveFocusToActions = false) {
    setSelectedPaletteColor({
      step: step.step,
      hex: step.hex,
      paletteFingerprint,
    });
    if (moveFocusToActions) {
      window.requestAnimationFrame(() => {
        document.getElementById('pg-palette-use-foreground')?.focus();
      });
    }
  }

  function useSelectedPaletteColor(role: PairRole) {
    if (!selectedPaletteColor) return;
    if (role === 'foreground') setCmpA(selectedPaletteColor.hex);
    else setCmpB(selectedPaletteColor.hex);
    setFixedPairRole(role);
    setFixedPairSource(selectedPaletteColor);
    setPairRecommendationIndex(0);
    activateVerifyWorkspace('pair', () => {
      scrollTo(pairContrastRef.current);
      document.getElementById('pg-pair-contrast-title')?.focus({ preventScroll: true });
    });
  }

  function unlockFixedPairColor() {
    setFixedPairRole(null);
    setFixedPairSource(null);
    setPairRecommendationIndex(0);
  }

  function swapPairRoles() {
    setCmpA(cmpB);
    setCmpB(cmpA);
    setFixedPairRole((current) => (
      current === 'foreground'
        ? 'background'
        : current === 'background'
          ? 'foreground'
          : null
    ));
    setPairRecommendationIndex(0);
  }

  function applyFixedPairRecommendation(hex: string) {
    if (fixedPairRole === 'foreground') setCmpB(hex);
    else if (fixedPairRole === 'background') setCmpA(hex);
    // 팔레트에서 고른 기준색은 유지해 다음 추천도 같은 조건으로 계속 비교합니다.
    setPairRecommendationIndex(0);
  }

  function showNextPairRecommendation() {
    if (!fixedPairRecommendations || fixedPairRecommendations.length < 2) return;
    setPairRecommendationIndex((current) => (current + 1) % fixedPairRecommendations.length);
  }

  function toggleActualPairCvd() {
    if (!normalizedCmpA || !normalizedCmpB) return;
    if (showActualPairCvd) {
      setShowActualPairCvd(false);
      return;
    }
    setShowActualPairCvd(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(
      () => scrollTo(pairCvdRef.current),
    ));
  }

  const activeTutorialSteps = activeTutorial ? TUTORIALS[activeTutorial.id] : null;
  const activeTutorialStep = activeTutorial && activeTutorialSteps ? activeTutorialSteps[activeTutorial.index] : null;

  return (
    <div className="pg-app">
      <header className="pg-header">
        <div className="pg-header-brandline">
          <h1 className="pg-wordmark">
            <span className="pg-wordmark-brand">{VENDOR}</span>{' '}
            <span className="pg-wordmark-product">{APP_NAME.slice(VENDOR.length).trim()}</span>
          </h1>
          {showUpdate && (
            <button
              type="button"
              className={`pg-update pg-update--${updateState.phase}`}
              onClick={handleUpdate}
              disabled={updateState.phase === 'downloading'}
              title={updateTitle}
              aria-live="polite"
            >
              <span className="pg-update-dot" aria-hidden="true" />
              <span>{updateLabel}</span>
            </button>
          )}
        </div>
        <div className="pg-header-right">
          {PRO_UI_AVAILABLE && import.meta.env.DEV && !isTauri && (
            <button type="button" className="pg-devpro" onClick={toggleProDev} title={t('pro.dev')}>
              {pro ? `${t('pro.badge')} ●` : t('pro.dev')}
            </button>
          )}
          <div className="pg-tutorial-help" ref={tutorialMenuRef}>
            <button
              ref={tutorialHelpButtonRef}
              type="button"
              className="pg-help-button"
              aria-label={t('tutorial.help')}
              title={t('tutorial.help')}
              aria-haspopup="menu"
              aria-expanded={showTutorialMenu}
              onClick={() => setShowTutorialMenu((visible) => !visible)}
            >
              <span className="pg-help-button-icon" aria-hidden="true">?</span>
              <span className="pg-help-button-label">{t('tutorial.menuTitle')}</span>
            </button>
            {showTutorialMenu && (
              <div className="pg-tutorial-menu" role="menu" aria-label={t('tutorial.menuTitle')}>
                <div className="pg-tutorial-menu-title">{t('tutorial.menuTitle')}</div>
                <button type="button" role="menuitem" onClick={() => openTutorial('quick')}>
                  <span>{t('tutorial.quick')}</span>
                  {tutorialCompletion.quick && <span aria-hidden="true">✓</span>}
                </button>
                <button type="button" role="menuitem" onClick={() => openTutorial('roles')}>
                  <span>{t('tutorial.roles')}</span>
                  {tutorialCompletion.roles && <span aria-hidden="true">✓</span>}
                </button>
                {PRO_UI_AVAILABLE && pro && (
                  <button type="button" role="menuitem" onClick={() => openTutorial('pro')}>
                    <span>{t('tutorial.pro')}</span>
                    {tutorialCompletion.pro && <span aria-hidden="true">✓</span>}
                  </button>
                )}
                <div className="pg-tutorial-menu-separator" role="separator" />
                <button type="button" role="menuitem" onClick={openLegal}>
                  <span>{t('legal.menu')}</span>
                  <span aria-hidden="true">ⓘ</span>
                </button>
              </div>
            )}
          </div>
          {languages.length > 1 && (
            <select
              className="pg-lang"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              aria-label={t('a11y.language')}
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <section ref={workspaceStartRef} className="pg-workflow-summary" aria-label={t('workflow.summaryTitle')}>
        <div className="pg-workflow-summary-copy">
          <span className="pg-workflow-summary-title">{t('workflow.summaryTitle')}</span>
          <div className="pg-workflow-metrics">
            {!ramp ? (
              <span role="status">{result.error ?? t('error.invalidColor', { value: seed })}</span>
            ) : (
              <>
                <span>{t('ready.steps', { n: ramp.steps.length })}</span>
                <span>{actualPairStatusText}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className="pg-btn pg-btn--primary pg-workflow-review-button"
          onClick={() => activateVerifyWorkspace('pair')}
          disabled={!ramp}
          title={!ramp ? result.error ?? undefined : undefined}
        >
          {t('workflow.viewReview')}
        </button>
      </section>

      <nav className="pg-workspace-tabs" role="tablist" aria-label={t('workflow.tabList')} data-tour={TUTORIAL_TARGETS.workflowTabs}>
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab}
            id={`pg-workspace-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={workspaceTab === tab}
            aria-controls={`pg-workspace-panel-${tab}`}
            aria-label={tab === 'verify' && verifyIssueCount > 0
              ? `${t('workflow.verify')}: ${verifyIssueDescription}`
              : t(`workflow.${tab}` as MsgKey)}
            tabIndex={!ramp && tab !== 'create' ? -1 : workspaceTab === tab ? 0 : -1}
            className={`pg-workspace-tab${workspaceTab === tab ? ' pg-workspace-tab--active' : ''}`}
            data-tour={tab === 'verify' ? TUTORIAL_TARGETS.verifyTab : undefined}
            disabled={!ramp && tab !== 'create'}
            onClick={() => activateWorkspace(tab)}
            onKeyDown={(event) => handleWorkspaceTabKey(event, tab)}
          >
            {t(`workflow.${tab}` as MsgKey)}
            {tab === 'verify' && verifyIssueCount > 0 && <span className="pg-workspace-tab-count">{verifyIssueCount}</span>}
          </button>
        ))}
      </nav>

      <div
        id="pg-workspace-panel-create"
        className="pg-workspace-panel"
        role="tabpanel"
        aria-labelledby="pg-workspace-tab-create"
        hidden={workspaceTab !== 'create'}
      >
      {!seenIntro && (
        <section className="pg-intro" aria-labelledby="pg-intro-title">
          <div className="pg-intro-head">
            <div className="pg-intro-copy">
              <span id="pg-intro-title" className="pg-intro-title">{t('intro.title')}</span>
              <span className="pg-intro-body">{t('tutorial.welcomeBody')}</span>
            </div>
            <div className="pg-intro-actions">
              <button type="button" className="pg-btn pg-btn--sm pg-btn--primary" onClick={() => openTutorial('quick')}>
                {t('tutorial.start')}
              </button>
              <button type="button" className="pg-btn pg-btn--sm" onClick={dismissIntro}>
                {t('tutorial.skip')}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="pg-imagebar" data-tour={TUTORIAL_TARGETS.imageInput}>
        <button type="button" className="pg-btn" onClick={pickImage}>
          {t('image.open')}
        </button>
        <span className="hint">{isTauri ? t('image.hintTauri') : t('image.hintWeb')}</span>
        {busy && <span className="busy">{t('image.extracting')}</span>}
        {imgError && <span className="err">⚠ {imgError}</span>}
        {swatches.length > 0 && (
          <div className="pg-extracted">
            <span className="lbl">{t('image.extracted')}</span>
            {swatches.slice(0, 6).map((s) => (
              <button
                key={s.hex}
                type="button"
                className="pg-chip"
                style={{ background: s.hex }}
                title={`${s.hex} · ${(s.weight * 100).toFixed(0)}%`}
                onClick={() => updateSeed(s.hex)}
                aria-label={`${s.hex}`}
              />
            ))}
          </div>
        )}
        {swatches.length > 0 && (
          <span style={{ color: profileWarning ? '#f0b429' : 'var(--muted)', fontSize: 12.5, width: '100%' }}>
            {profileWarning ? t('image.profileWarn', { profile: profileWarning }) : t('image.srgbNote')}
          </span>
        )}
      </section>

      <section className="pg-controls">
        <label data-tour={TUTORIAL_TARGETS.seedColor}>
          {t('controls.seedColor')}
          <div className="pg-seed">
            <input
              type="color"
              value={isHex6(seed) ? seed : '#3b82f6'}
              onChange={(e) => updateSeed(e.target.value)}
              aria-label={t('a11y.pickSeed')}
            />
            <input
              type="text"
              value={seed}
              onChange={(e) => updateSeed(e.target.value)}
              spellCheck={false}
              aria-invalid={!isHex6(seed)}
              aria-describedby={!isHex6(seed) ? 'pg-seed-error' : undefined}
              aria-label={t('a11y.seedHex')}
            />
          </div>
          {isHex6(seed) && <ApproximateColorName hex={seed} t={t} />}
        </label>

        <label data-tour={TUTORIAL_TARGETS.paletteName}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{t('controls.name')}</span>
          <input
            type="text"
            value={name}
            placeholder={t('controls.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            spellCheck={false}
          />
          <span style={{ color: 'var(--muted)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
            {t('controls.nameHint', { token: sanitizeTokenName(name) })}
          </span>
        </label>

        <label data-tour={TUTORIAL_TARGETS.preset}>
          {t('controls.preset')}
          <select value={preset} onChange={(e) => updatePreset(e.target.value as PresetName)}>
            {PRESET_NAMES.map((p) => (
              <option key={p} value={p}>
                {PRESETS[p].label}
              </option>
            ))}
          </select>
        </label>

        <div className="pg-examples" role="group" aria-label={t('controls.try')}>
          <span className="lbl">{t('controls.try')}</span>
          {EXAMPLES.map((hex) => (
            <button
              key={hex}
              type="button"
              className="pg-chip"
              style={{ background: hex }}
              title={hex}
              onClick={() => updateSeed(hex)}
              aria-label={hex}
            />
          ))}
        </div>
      </section>

      {result.error && <p id="pg-seed-error" className="pg-error" role="alert">⚠ {result.error}</p>}

      <section
        className="pg-library"
        aria-labelledby="pg-library-title"
        data-tour={TUTORIAL_TARGETS.library}
      >
        <div className="pg-library__head">
          <div className="pg-library__title">
            <button type="button" className="pg-btn pg-btn--sm" onClick={saveToLibrary}>
              {t('library.save')}
            </button>
            <h2 id="pg-library-title">{t('library.title')}</h2>
            <span className="pg-limit">
              {t('library.saveCount', { used: history.length, limit: FREE_SAVE_LIMIT })}
            </span>
          </div>
          <div className="pg-library__actions">
            <button type="button" className="pg-btn pg-btn--sm" onClick={exportLibrary}>
              {t('library.export')}
            </button>
            <button type="button" className="pg-btn pg-btn--sm" onClick={importLibrary}>
              {t('library.import')}
            </button>
          </div>
        </div>
        {previews.length === 0 ? (
          <span className="pg-library__empty">{t('library.empty')}</span>
        ) : (
          <div className="pg-library__items">
            {previews.map(({ e, colors }) => (
              <div key={e.id} className="pg-library__item">
                <button
                  type="button"
                  className="pg-library__load"
                  onClick={() => loadEntry(e)}
                  title={t('library.load')}
                >
                  <span className="pg-library__preview">
                    {colors.map((color, index) => (
                      <span key={index} style={{ background: color }} />
                    ))}
                  </span>
                  <span className="pg-library__name">{e.name || e.seed}</span>
                </button>
                <button
                  type="button"
                  className="pg-btn pg-btn--icon pg-library__delete"
                  onClick={() => deleteEntry(e.id)}
                  aria-label={t('library.delete')}
                  title={t('library.delete')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {ramp && (
        <>
          {effectiveEnforceAA && (
            <section className="pg-legacy-palette" aria-labelledby="pg-legacy-palette-title">
              <div className="pg-legacy-palette__copy">
                <span className="pg-legacy-palette__eyebrow">{t('paletteUsage.legacyEyebrow')}</span>
                <h2 id="pg-legacy-palette-title">{t('paletteUsage.legacyTitle')}</h2>
                <p>{t('paletteUsage.legacyBody')}</p>
              </div>
              <button
                type="button"
                className="pg-btn"
                onClick={() => updateLegacyEnforceAA(false)}
              >
                {t('paletteUsage.useOriginal')}
              </button>
            </section>
          )}
          <section className="pg-ramp" aria-label={t('ready.scale')} ref={rampRef} data-tour={TUTORIAL_TARGETS.ramp}>
            {ramp.steps.map((s) => {
              const badgeColors = contrastSafeBadgeColors(s.hex);
              return (
                <button
                  key={s.step}
                  type="button"
                  className={`pg-swatch${
                    selectedPaletteColor?.step === s.step
                    && selectedPaletteColor.hex === s.hex
                    && selectedPaletteColor.paletteFingerprint === paletteFingerprint
                      ? ' is-selected'
                      : ''
                  }`}
                  style={{ background: s.hex, color: readableTextOn(s.hex) }}
                  title={swatchAriaLabel(s)}
                  onClick={(event) => selectPaletteColor(s, event.detail === 0)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    selectPaletteColor(s, true);
                  }}
                  aria-label={swatchAriaLabel(s)}
                  aria-pressed={
                    selectedPaletteColor?.step === s.step
                    && selectedPaletteColor.hex === s.hex
                    && selectedPaletteColor.paletteFingerprint === paletteFingerprint
                  }
                >
                  <span className="pg-step">{s.step}</span>
                  {selectedPaletteColor?.step === s.step
                    && selectedPaletteColor.hex === s.hex
                    && selectedPaletteColor.paletteFingerprint === paletteFingerprint
                    && <span className="pg-swatch-selected" aria-hidden="true">✓</span>}
                  <span className="pg-swatch-meta">
                    <span
                      className="pg-badge"
                      title={swatchAriaLabel(s)}
                      style={{ color: badgeColors.color, background: badgeColors.background }}
                    >
                      {swatchRecommendation(s)}
                    </span>
                    <span className="pg-hex">{s.hex}</span>
                  </span>
                </button>
              );
            })}
          </section>

          <section className="pg-palette-usage" aria-labelledby="pg-palette-usage-title">
            <div className="pg-palette-usage__copy">
              <span className="pg-palette-usage__eyebrow">{t('paletteUsage.eyebrow')}</span>
              <h2 id="pg-palette-usage-title">{t('paletteUsage.title')}</h2>
              <p>{t('paletteUsage.body')}</p>
              <p className="pg-palette-usage__scope">{t('paletteUsage.scope')}</p>
            </div>
            <div className="pg-palette-selection" aria-live="polite">
              {selectedPaletteColor ? (
                <>
                  <div className="pg-palette-selection__summary">
                    <AccessibleColorSwatch hex={selectedPaletteColor.hex} t={t} />
                    <strong>
                      {t('paletteUsage.selected', {
                        step: selectedPaletteColor.step,
                        hex: selectedPaletteColor.hex,
                      })}
                    </strong>
                  </div>
                  {selectedPaletteColor.paletteFingerprint !== paletteFingerprint && (
                    <p className="pg-palette-selection__notice">{t('paletteUsage.selectionSourceChanged')}</p>
                  )}
                  <div className="pg-palette-selection__actions">
                    <button
                      type="button"
                      className="pg-btn pg-btn--sm"
                      onClick={() => void copySwatch(selectedPaletteColor.hex)}
                    >
                      {t('paletteUsage.copySelected')}
                    </button>
                    <button
                      id="pg-palette-use-foreground"
                      type="button"
                      className="pg-btn pg-btn--sm pg-btn--primary"
                      onClick={() => useSelectedPaletteColor('foreground')}
                    >
                      {t('paletteUsage.useForeground')}
                    </button>
                    <button
                      type="button"
                      className="pg-btn pg-btn--sm pg-btn--primary"
                      onClick={() => useSelectedPaletteColor('background')}
                    >
                      {t('paletteUsage.useBackground')}
                    </button>
                  </div>
                  <small>{t('paletteUsage.selectionScope')}</small>
                </>
              ) : (
                <>
                  <p>{t('paletteUsage.selectPrompt')}</p>
                  <button
                    type="button"
                    className="pg-btn pg-btn--sm"
                    onClick={() => activateVerifyWorkspace('pair', () => scrollTo(pairContrastRef.current))}
                  >
                    {t('paletteUsage.checkActual')}
                  </button>
                </>
              )}
            </div>
          </section>
        </>
      )}
      </div>

      <div
        id="pg-workspace-panel-verify"
        className="pg-workspace-panel"
        role="tabpanel"
        aria-labelledby="pg-workspace-tab-verify"
        hidden={workspaceTab !== 'verify'}
      >
      {ramp && (
        <>
          <nav
            className="pg-verify-mode-tabs"
            role="tablist"
            aria-label={t('roleWorkspace.tabList')}
            data-tour={TUTORIAL_TARGETS.verifyModeTabs}
          >
            {VERIFY_WORKSPACES.map((mode) => {
              const active = verifyWorkspace === mode;
              const count = mode === 'pair' ? actualPairIssueCount : activeRoleIssueCount;
              return (
                <button
                  key={mode}
                  id={`pg-verify-mode-${mode}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`pg-verify-workspace-${mode}`}
                  tabIndex={active ? 0 : -1}
                  className={`pg-verify-mode-tab${active ? ' pg-verify-mode-tab--active' : ''}`}
                  onClick={() => selectVerifyWorkspace(mode)}
                  onKeyDown={(event) => handleVerifyWorkspaceKey(event, mode)}
                >
                  <span>{t(mode === 'pair' ? 'roleWorkspace.pairTab' : 'roleWorkspace.systemTab')}</span>
                  {count > 0 && (
                    <span
                      className="pg-verify-mode-count"
                      aria-label={t(mode === 'pair'
                        ? 'roleWorkspace.pairIssueCount'
                        : 'roleWorkspace.systemIssueCount', { n: count })}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div
            id="pg-verify-workspace-pair"
            className="pg-verify-workspace"
            role="tabpanel"
            aria-labelledby="pg-verify-mode-pair"
            hidden={verifyWorkspace !== 'pair'}
            data-tour={TUTORIAL_TARGETS.pairWorkspace}
          >
          <section className="pg-readiness" aria-labelledby="pg-readiness-title">
            <div className="pg-readiness-head">
              <h2 id="pg-readiness-title" className="pg-readiness-title">{t('ready.title')}</h2>
              <span className="pg-readiness-variant">
                {t('paletteUsage.active', { variant: activePaletteLabel })}
              </span>
            </div>
            <div className="pg-readiness-grid">
              {pairReadinessCards.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  className={`pg-ready-card pg-ready-card--${card.state}`}
                  title={card.hint}
                  onClick={card.action}
                  aria-label={`${card.label}: ${card.value} — ${card.hint}`}
                >
                  <span className="pg-ready-label">
                    {card.label}
                  </span>
                  <span className="pg-ready-value">{card.value}</span>
                </button>
              ))}
            </div>
          </section>

          <section
            ref={pairContrastRef}
            className="pg-pair-contrast"
            aria-labelledby="pg-pair-contrast-title"
            data-tour={TUTORIAL_TARGETS.livePreview}
          >
            <div className="pg-section-head">
              <h2 id="pg-pair-contrast-title" className="pg-section-title" tabIndex={-1}>
                {t('pairContrast.title')}
              </h2>
              <span className="pg-section-note">{t('pairContrast.note')}</span>
            </div>
            <div className="pg-pair-contrast__toolbar">
              <label className="pg-pair-target" htmlFor="pg-pair-target">
                <span>{t('pairContrast.targetLabel')}</span>
                <select
                  id="pg-pair-target"
                  value={pairTarget}
                  onChange={(event) => {
                    setPairTarget(Number(event.target.value) as PairContrastTarget);
                    setPairRecommendationIndex(0);
                  }}
                >
                  <option value={4.5}>{t('pairContrast.targetNormal')}</option>
                  <option value={3}>{t('pairContrast.targetLarge')}</option>
                  <option value={7}>{t('pairContrast.targetAaa')}</option>
                </select>
              </label>
              <div className="pg-pair-contrast__toolbar-actions">
                {fixedPairRole && (
                  <button type="button" className="pg-btn pg-btn--sm" onClick={unlockFixedPairColor}>
                    {t('pairContrast.unlock')}
                  </button>
                )}
                <button
                  type="button"
                  className="pg-btn pg-btn--sm"
                  onClick={swapPairRoles}
                  disabled={!cmpA.trim() && !cmpB.trim()}
                >
                  {t('pairContrast.swapRoles')}
                </button>
              </div>
            </div>
            <div className="pg-pair-contrast__inputs">
              <div className="pg-pair-contrast__field">
                <div className="pg-pair-contrast__field-head">
                  <label htmlFor="pg-pair-foreground">{t('pairContrast.foreground')}</label>
                  {fixedPairRole === 'foreground' && fixedPairSource && (
                    <span className="pg-pair-fixed">
                      {t('pairContrast.fixedFromPalette', { step: fixedPairSource.step })}
                    </span>
                  )}
                </div>
                <div className="pg-match-input">
                  <input
                    type="color"
                    value={normalizedCmpA ?? '#000000'}
                    onChange={(event) => setCmpA(event.target.value)}
                    disabled={fixedPairRole === 'foreground'}
                    aria-label={t('pairContrast.pickerLabel', {
                      field: t('pairContrast.foreground'),
                    })}
                  />
                  <input
                    id="pg-pair-foreground"
                    type="text"
                    value={cmpA}
                    onChange={(event) => setCmpA(event.target.value)}
                    readOnly={fixedPairRole === 'foreground'}
                    placeholder="#000000"
                    spellCheck={false}
                    aria-label={t('pairContrast.hexInputLabel', {
                      field: t('pairContrast.foreground'),
                    })}
                    aria-invalid={cmpAInvalid}
                    aria-describedby={cmpAInvalid ? 'pg-pair-foreground-error' : undefined}
                  />
                </div>
                {normalizedCmpA ? (
                  <ApproximateColorName hex={normalizedCmpA} t={t} />
                ) : cmpAInvalid ? (
                  <span id="pg-pair-foreground-error" className="pg-field-error" role="status">
                    {t('error.invalidColor', { value: cmpA })}
                  </span>
                ) : null}
              </div>
              <div className="pg-pair-contrast__field">
                <div className="pg-pair-contrast__field-head">
                  <label htmlFor="pg-pair-background">{t('pairContrast.background')}</label>
                  {fixedPairRole === 'background' && fixedPairSource && (
                    <span className="pg-pair-fixed">
                      {t('pairContrast.fixedFromPalette', { step: fixedPairSource.step })}
                    </span>
                  )}
                </div>
                <div className="pg-match-input">
                  <input
                    type="color"
                    value={normalizedCmpB ?? '#ffffff'}
                    onChange={(event) => setCmpB(event.target.value)}
                    disabled={fixedPairRole === 'background'}
                    aria-label={t('pairContrast.pickerLabel', {
                      field: t('pairContrast.background'),
                    })}
                  />
                  <input
                    id="pg-pair-background"
                    type="text"
                    value={cmpB}
                    onChange={(event) => setCmpB(event.target.value)}
                    readOnly={fixedPairRole === 'background'}
                    placeholder="#ffffff"
                    spellCheck={false}
                    aria-label={t('pairContrast.hexInputLabel', {
                      field: t('pairContrast.background'),
                    })}
                    aria-invalid={cmpBInvalid}
                    aria-describedby={cmpBInvalid ? 'pg-pair-background-error' : undefined}
                  />
                </div>
                {normalizedCmpB ? (
                  <ApproximateColorName hex={normalizedCmpB} t={t} />
                ) : cmpBInvalid ? (
                  <span id="pg-pair-background-error" className="pg-field-error" role="status">
                    {t('error.invalidColor', { value: cmpB })}
                  </span>
                ) : null}
              </div>
            </div>
            {fixedPairSourceChanged && (
              <p className="pg-pair-source-notice" role="status">{t('pairContrast.sourceChanged')}</p>
            )}

            <div
              className={`pg-pair-contrast__result pg-pair-contrast__result--${displayedPairLevel}`}
              role="status"
              aria-live="polite"
            >
              {previewPairRatio !== null && previewPairForeground && previewPairBackground ? (
                <>
                  <div className="pg-pair-contrast__measurement">
                    {activeFixedPairRecommendation && (
                      <span className="pg-pair-contrast__pending">{t('pairContrast.recommendPending')}</span>
                    )}
                    <strong>{formatRatio(previewPairRatio)}:1</strong>
                    <span>{t(previewPairStatusKey)}</span>
                  </div>
                  <div
                    className={`pg-pair-preview${pairTarget === 3 ? ' pg-pair-preview--large-text' : ''}`}
                    style={{ background: previewPairBackground, color: previewPairForeground }}
                    aria-label={t('pairContrast.sample')}
                  >
                    <div className="pg-pair-preview__head">
                      <span className="pg-pair-preview__eyebrow">
                        {t(activeFixedPairRecommendation
                          ? 'pairContrast.recommendPreviewTitle'
                          : pairTarget === 3
                            ? 'pairContrast.targetLarge'
                            : 'pairContrast.previewTitle')}
                      </span>
                      <span className="pg-pair-preview__ratio">{formatRatio(previewPairRatio)}:1</span>
                    </div>
                    <strong>{t('preview.heading')}</strong>
                    <span>{t('preview.body')}</span>
                    <span className="pg-pair-preview__card">
                      <strong>{t('preview.card')}</strong>
                      <span>{t('pairContrast.previewCardBody')}</span>
                      <span className="pg-pair-preview__field">{t('pairContrast.previewField')}</span>
                    </span>
                    <span className="pg-pair-preview__actions">
                      <span className="pg-pair-preview__action">{t('preview.primary')}</span>
                      <span className="pg-pair-preview__secondary">{t('pairContrast.previewSecondary')}</span>
                    </span>
                  </div>
                </>
              ) : actualPairState === 'empty' ? (
                <span>{t('pairContrast.empty')}</span>
              ) : (
                <span>{t('pairContrast.invalid')}</span>
              )}
            </div>
            {fixedPairRole && fixedPairRecommendations !== null && (
              <div
                id="pg-pair-recommendations"
                className="pg-pair-recommendations"
                aria-labelledby="pg-pair-recommendations-title"
              >
                <div className="pg-pair-fixes__head">
                  <h3 id="pg-pair-recommendations-title" tabIndex={-1}>
                    {t('pairContrast.recommendTitle')}
                  </h3>
                  <p>{t('pairContrast.recommendBody')}</p>
                </div>
                {activeFixedPairRecommendation ? (
                  <article className="pg-pair-recommendation pg-pair-recommendation--active">
                    <div className="pg-pair-recommendation__topline">
                      <span className="pg-pair-recommendation__position">
                        {t('pairContrast.recommendPosition', {
                          current: (pairRecommendationIndex % fixedPairRecommendations.length) + 1,
                          total: fixedPairRecommendations.length,
                        })}
                      </span>
                      <strong>{formatRatio(activeFixedPairRecommendation.ratio)}:1</strong>
                    </div>
                    <div className="pg-pair-recommendation__color">
                      <AccessibleColorSwatch hex={activeFixedPairRecommendation.hex} t={t} />
                      <code>{activeFixedPairRecommendation.hex}</code>
                      <ApproximateColorName hex={activeFixedPairRecommendation.hex} t={t} />
                    </div>
                    <div className="pg-pair-recommendation__reason">
                      <strong>{t('pairContrast.recommendWhy')}</strong>
                      <span>
                        {activeFixedPairRecommendation.source === 'adjusted'
                          ? t('pairContrast.recommendAdjusted')
                          : activeFixedPairRecommendation.source === 'palette'
                            ? t('pairContrast.recommendPalette', {
                                step: activeFixedPairRecommendation.step ?? '',
                              })
                            : t('pairContrast.recommendBlackWhite')}
                      </span>
                    </div>
                    <div className="pg-pair-recommendation__actions">
                      <button
                        type="button"
                        className="pg-btn pg-btn--sm"
                        onClick={showNextPairRecommendation}
                        disabled={fixedPairRecommendations.length < 2}
                      >
                        {t('pairContrast.nextRecommendation')}
                      </button>
                      <button
                        type="button"
                        className="pg-btn pg-btn--sm pg-btn--primary"
                        aria-label={t('pairContrast.useRecommendationLabel', {
                          role: t(fixedPairRole === 'foreground'
                            ? 'pairContrast.background'
                            : 'pairContrast.foreground'),
                          hex: activeFixedPairRecommendation.hex,
                          ratio: formatRatio(activeFixedPairRecommendation.ratio),
                        })}
                        onClick={() => applyFixedPairRecommendation(activeFixedPairRecommendation.hex)}
                      >
                        {t('pairContrast.useRecommendation')}
                      </button>
                    </div>
                  </article>
                ) : (
                  <p className="pg-pair-recommendations__empty">
                    {actualPairMeetsTarget
                      ? t('pairContrast.recommendNoAlternatives')
                      : fixedPairMaximum
                        ? t('pairContrast.recommendNoneDetail', {
                            fixedHex: fixedPairMaximum.fixedHex,
                            bestHex: fixedPairMaximum.bestHex,
                            ratio: formatRatio(fixedPairMaximum.ratio),
                            target: pairTargetText,
                          })
                        : t('pairContrast.recommendNone')}
                  </p>
                )}
              </div>
            )}
            {pairFixCandidates && (
              <div className="pg-pair-fixes" aria-labelledby="pg-pair-fixes-title">
                <div className="pg-pair-fixes__head">
                  <h3 id="pg-pair-fixes-title">{t('pairContrast.fixTitle')}</h3>
                  <p>{t('pairContrast.fixBody')}</p>
                </div>
                {pairFixOptions.length > 0 ? (
                  <div className="pg-pair-fixes__grid">
                    {pairFixOptions.map(({ target, candidate }) => (
                      <article key={target} className="pg-pair-fix">
                        <div className="pg-pair-fix__title">
                          <strong>
                            {t(target === 'foreground'
                              ? 'pairContrast.fixForeground'
                              : 'pairContrast.fixBackground')}
                          </strong>
                          <span>{formatRatio(candidate.ratio)}:1 · {pairTargetText}:1</span>
                        </div>
                        <div className="pg-pair-fix__change">
                          <AccessibleColorSwatch hex={candidate.before} t={t} />
                          <code>{candidate.before}</code>
                          <span aria-hidden="true">→</span>
                          <AccessibleColorSwatch hex={candidate.after} t={t} />
                          <code>{candidate.after}</code>
                        </div>
                        <p>
                          {t(target === 'foreground'
                            ? 'pairContrast.fixForegroundBody'
                            : 'pairContrast.fixBackgroundBody')}
                        </p>
                        <ApproximateColorName hex={candidate.after} t={t} />
                        <button
                          type="button"
                          className="pg-btn pg-btn--sm pg-btn--primary"
                          aria-label={t('pairContrast.applyCandidateLabel', {
                            role: t(target === 'foreground'
                              ? 'pairContrast.foreground'
                              : 'pairContrast.background'),
                            hex: candidate.after,
                            ratio: formatRatio(candidate.ratio),
                          })}
                          onClick={() => {
                            if (target === 'foreground') setCmpA(candidate.after);
                            else setCmpB(candidate.after);
                          }}
                        >
                          {t('pairContrast.applyCandidate')}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="pg-pair-recommendations__empty">{t('pairContrast.fixNone')}</p>
                )}
                <p className="pg-pair-fixes__scope">
                  {t('pairContrast.fixScope', { target: pairTargetText })}
                </p>
              </div>
            )}
            <div className="pg-pair-contrast__footer">
              <span>{t('pairContrast.thresholds')}</span>
              <button
                type="button"
                className="pg-btn pg-btn--sm"
                disabled={!normalizedCmpA || !normalizedCmpB}
                aria-expanded={showActualPairCvd}
                aria-controls="pg-actual-pair-cvd"
                onClick={toggleActualPairCvd}
              >
                {t(showActualPairCvd
                  ? 'pairContrast.closeCvdPreview'
                  : 'pairContrast.openRoleFix')}
              </button>
            </div>
          </section>

          {showActualPairCvd && actualPairVisionPreviews && (
            <section
              id="pg-actual-pair-cvd"
              ref={pairCvdRef}
              className="pg-pair-cvd"
              aria-labelledby="pg-match-title"
              data-tour={TUTORIAL_TARGETS.colorMatcher}
            >
              <div className="pg-section-head">
                <h2 id="pg-match-title" className="pg-section-title">{t('match.title')}</h2>
                <span className="pg-section-note">{t('pairContrast.cvdNote')}</span>
              </div>
              <div className="pg-cvd-context-note pg-cvd-context-note--pair">
                <span>
                  {t('pairContrast.foreground')} <code>{normalizedCmpA}</code>
                  {' · '}
                  {t('pairContrast.background')} <code>{normalizedCmpB}</code>
                </span>
              </div>
              <div className="pg-pair-cvd-grid">
                {actualPairVisionPreviews.map((preview) => {
                  const visionLabel = t(`cvd.${preview.type}` as MsgKey);
                  return (
                    <article key={preview.type} className="pg-pair-cvd-card">
                      <h3>{visionLabel}</h3>
                      <span className="pg-pair-cvd-card__value-kind">
                        {t(preview.type === 'normal' ? 'cvd.originalHexLabel' : 'cvd.previewHexLabel')}
                      </span>
                      <div
                        className="pg-pair-cvd-card__sample"
                        style={{
                          background: preview.background,
                          color: preview.foreground,
                          borderColor: preview.foreground,
                        }}
                        aria-label={`${visionLabel}: ${t('pairContrast.previewTitle')}`}
                      >
                        <strong>{t('preview.heading')}</strong>
                        <span>{t('preview.body')}</span>
                        <span className="pg-pair-cvd-card__surface">{t('preview.card')}</span>
                        <span className="pg-pair-cvd-card__action">{t('preview.primary')}</span>
                      </div>
                      <div className="pg-pair-cvd-card__meta">
                        <span>
                          <AccessibleColorSwatch
                            hex={preview.foreground}
                            t={t}
                            ariaLabelPrefix={t('pairContrast.foreground')}
                          />
                          <span>{t('pairContrast.foreground')}</span>
                          <code>{preview.foreground}</code>
                        </span>
                        <span>
                          <AccessibleColorSwatch
                            hex={preview.background}
                            t={t}
                            ariaLabelPrefix={t('pairContrast.background')}
                          />
                          <span>{t('pairContrast.background')}</span>
                          <code>{preview.background}</code>
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="pg-cvd-context-note pg-cvd-context-note--pair-output" role="note">
                <strong>{t('cvd.transformedHexNotice')}</strong>
                <span>{t('cvd.modelDisclaimer')}</span>
              </div>
              <div className="pg-cvd-noncolor-note">ⓘ {t('statusCvd.nonColorCue')}</div>
            </section>
          )}
          </div>

          <div
            id="pg-verify-workspace-roles"
            className="pg-verify-workspace"
            role="tabpanel"
            aria-labelledby="pg-verify-mode-roles"
            hidden={verifyWorkspace !== 'roles'}
            data-tour={TUTORIAL_TARGETS.roleWorkspace}
          >
          <section className="pg-role-workspace-hero" aria-labelledby="pg-role-workspace-title">
            <div className="pg-role-workspace-hero__copy">
              <div className="pg-role-workspace-titleline">
                <h2 ref={roleWorkspaceTitleRef} id="pg-role-workspace-title" tabIndex={-1}>
                  {t('roleWorkspace.systemTab')}
                </h2>
                <span>{t('roleWorkspace.systemBadge')}</span>
              </div>
              <p><strong>{t('roleWorkspace.earlyAccessTitle')}</strong> · {t('roleWorkspace.earlyAccessBody')}</p>
              <small>{t('roleWorkspace.localAutosave')}</small>
            </div>
            {roleWorkspaceMeta.status === 'active' && (
              <div className="pg-role-workspace-actions">
                <button
                  type="button"
                  className="pg-btn pg-btn--sm"
                  onClick={(event) => previewRoleWorkspaceReset(event.currentTarget)}
                >
                  {t('roleWorkspace.newSystem')}
                </button>
                {roleWorkspaceUndo && (
                  <button
                    type="button"
                    className="pg-btn pg-btn--sm"
                    onClick={undoRoleWorkspaceAction}
                    disabled={roleWorkspaceUndoStale}
                  >
                    ↩ {t('roleWorkspace.undo')}
                  </button>
                )}
              </div>
            )}
          </section>

          {roleWorkspaceMeta.status !== 'active' && !previewingRoleTutorial && (
            <section className="pg-role-workspace-welcome">
              <div>
                <h3>{t(roleWorkspaceMeta.status === 'legacy-unconfirmed'
                  ? 'roleWorkspace.legacyFoundTitle'
                  : 'roleWorkspace.welcomeTitle')}</h3>
                <p>{t(roleWorkspaceMeta.status === 'legacy-unconfirmed'
                  ? 'roleWorkspace.legacyFoundBody'
                  : 'roleWorkspace.welcomeBody')}</p>
              </div>
              <div className="pg-role-workspace-welcome__actions">
                {roleWorkspaceMeta.status === 'legacy-unconfirmed' && (
                  <button
                    type="button"
                    className="pg-btn pg-btn--primary"
                    onClick={continueLegacyRoleWorkspace}
                  >
                    {t('roleWorkspace.continueLegacy')}
                  </button>
                )}
                <button
                  type="button"
                  className={`pg-btn${roleWorkspaceMeta.status === 'not-started' ? ' pg-btn--primary' : ''}`}
                  onClick={(event) => startRoleWorkspaceWithExamples(event.currentTarget)}
                >
                  {t('roleWorkspace.startExample')}
                </button>
              </div>
            </section>
          )}

          {roleWorkspaceAction === 'reset' && (
            <section className="pg-role-workspace-confirm" aria-labelledby="pg-role-reset-title">
              <h3
                ref={roleWorkspaceConfirmTitleRef}
                id="pg-role-reset-title"
                tabIndex={-1}
              >
                {t('roleWorkspace.resetConfirmTitle')}
              </h3>
              <p>{t('roleWorkspace.resetConfirmBody')}</p>
              <div className="pg-role-workspace-confirm__actions">
                <button type="button" className="pg-btn pg-btn--sm" onClick={cancelRoleWorkspaceAction}>
                  {t('roleWorkspace.cancelImport')}
                </button>
                <button type="button" className="pg-btn pg-btn--sm pg-btn--primary" onClick={confirmRoleWorkspaceReset}>
                  {t('roleWorkspace.confirmReset')}
                </button>
              </div>
            </section>
          )}

          {(roleWorkspaceMeta.status === 'active' || previewingRoleTutorial) && (
            <>
          <section className="pg-readiness" aria-labelledby="pg-role-readiness-title">
            <div className="pg-readiness-head">
              <h2 id="pg-role-readiness-title" className="pg-readiness-title">{t('ready.title')}</h2>
              <span className="pg-readiness-variant">{t('roleWorkspace.systemTab')}</span>
            </div>
            <div className="pg-readiness-grid">
              {roleReadinessCards.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  className={`pg-ready-card pg-ready-card--${card.state}`}
                  title={card.hint}
                  onClick={card.action}
                  aria-label={`${card.label}: ${card.value} — ${card.hint}`}
                >
                  <span className="pg-ready-label">{card.label}</span>
                  <span className="pg-ready-value">{card.value}</span>
                </button>
              ))}
            </div>
          </section>
          <details className="pg-role-ramp-reference">
            <summary>{t('roleWorkspace.rampReferenceSummary')}</summary>
            <p>{t('roleWorkspace.rampReferenceScope')}</p>
            <div className="pg-cvd-context-note pg-cvd-context-note--full-system" role="note">
              {t('statusCvd.fullSystemScope')}
            </div>
            <section className="pg-cvd" aria-labelledby="pg-cvd-title" data-tour={TUTORIAL_TARGETS.cvdPreview}>
              <div className="pg-section-head">
                <h2 id="pg-cvd-title" className="pg-section-title">{t('cvd.title')}</h2>
                <span className="pg-section-note">{t('cvd.note')}</span>
              </div>
              <div className="pg-cvd-rows">
                {(
                  [
                    ['normal', 'cvd.normal'],
                    ['protan', 'cvd.protan'],
                    ['deutan', 'cvd.deutan'],
                    ['tritan', 'cvd.tritan'],
                    ['mono', 'cvd.mono'],
                  ] as const
                ).map(([id, key]) => (
                  <div key={id} className="pg-cvd-row">
                    <span className="pg-cvd-label">{t(key)}</span>
                    <div className="pg-cvd-strip">
                      {ramp.steps.map((s) => {
                        const shown = id === 'normal' ? s.hex : simulateHex(s.hex, id);
                        return (
                          <span
                            key={s.step}
                            className="pg-cvd-chip"
                            style={{ background: shown }}
                            title={`${s.step} · ${shown}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </details>
          <section className="pg-confusion">
            <div
              ref={roleSystemRef}
              className="pg-role-system"
              role="region"
              aria-labelledby="pg-role-system-title"
              tabIndex={-1}
              data-tour={TUTORIAL_TARGETS.roleSystem}
            >
              <div className="pg-section-head">
                <h2 id="pg-role-system-title" className="pg-section-title">{t('roles.title')}</h2>
                <span className="pg-section-note">{t('roles.note')}</span>
              </div>
              <div className="pg-role-workspace-main">
                <div className="pg-role-editor-column">
                  <div className="pg-role-groups">
                    {ROLE_COLOR_GROUPS.map((group) => (
                      <section key={group.id} className="pg-role-color-group">
                        <h3>{t(group.labelKey)}</h3>
                        <div className="pg-role-grid">
                          {rolePalette.colors
                            .filter((color) => group.roles.some((role) => role === color.role))
                            .map(renderRoleColorCard)}
                        </div>
                      </section>
                    ))}
                  </div>
                  <div className="pg-role-actions" data-tour={TUTORIAL_TARGETS.roleRepair}>
                    <span className={`pg-role-status${roleAssessment.ready ? ' pg-role-status--ready' : ''}`}>
                      {roleAssessment.ready ? t('roles.ready') : t('roles.issues', { n: roleBlockers.length })}
                    </span>
                    {PRO_UI_AVAILABLE && !roleAssessment.ready && repairFlow.phase !== 'reviewing' && (
                      <button
                        type="button"
                        className="pg-btn pg-btn--sm pg-btn--primary"
                        onClick={pro ? reviewRoleRepair : openUpgrade}
                      >
                        {pro
                          ? t('roles.review')
                          : safeChangeCount > 0
                            ? t('roles.reviewFixes', { n: safeChangeCount })
                            : t('pro.unlock')}
                        {!pro && <span className="pg-prolock">{t('pro.badge')}</span>}
                      </button>
                    )}
                  </div>
                  {PRO_UI_AVAILABLE && !pro && !roleAssessment.ready && (
                    <span className="pg-role-freehint">
                      {t('roles.freeFixable', { fixes: safeChangeCount, manual: manualReviewCount })}
                    </span>
                  )}

                  {/* Pro 자동 보정은 검토 후 확정하도록 하며 Free의 수동 편집과 분리합니다. */}
                  {PRO_UI_AVAILABLE && pro && repairFlow.phase === 'reviewing' && (
                    <div className="pg-role-review">
                      <div className="pg-role-panel-head">
                        <span className="pg-role-panel-title">{t('roles.reviewTitle')}</span>
                        <span className="pg-cvd-note">{t('roles.reviewNote')}</span>
                      </div>
                      {repairFlow.result.changes.length > 0 ? (
                        <>
                          <div className="pg-role-section-title">✎ {t('roles.sectionWillChange')}</div>
                          <div className="pg-role-rows">
                            {repairFlow.result.changes.map((change) => renderChangeRow(change, true))}
                          </div>
                        </>
                      ) : (
                        <div className="pg-role-empty">{t('roles.noAutoFix')}</div>
                      )}
                      {repairFlow.result.unresolved.length > 0 && renderUnresolved(repairFlow.result.unresolved)}
                      <div className="pg-role-panel-actions">
                        <button type="button" className="pg-btn pg-btn--sm" onClick={cancelRoleReview}>
                          {t('roles.cancel')}
                        </button>
                        {repairFlow.result.changes.length > 0 && (
                          <button type="button" className="pg-btn pg-btn--sm pg-btn--primary" onClick={confirmRoleRepair}>
                            {t('roles.applyCount', { n: repairFlow.result.changes.length })}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {PRO_UI_AVAILABLE && pro && repairFlow.phase === 'applied' && (
                    <div className="pg-role-result">
                      <div className="pg-role-panel-head">
                        <span className="pg-role-panel-title">{t('roles.resultTitle')}</span>
                        <span className="pg-cvd-note">
                          {t('roles.resultSummary', {
                            changed: repairFlow.result.changes.length,
                            fixed: repairFlow.result.counts.fixed,
                            manual: repairFlow.result.counts.unresolved,
                          })}
                        </span>
                      </div>
                      {repairFlow.result.changes.length > 0 && (
                        <>
                          <div className="pg-role-section-title">✓ {t('roles.sectionChanged')}</div>
                          <div className="pg-role-rows">
                            {repairFlow.result.changes.map((change) => renderChangeRow(change))}
                          </div>
                        </>
                      )}
                      {repairFlow.result.unresolved.length > 0 && renderUnresolved(repairFlow.result.unresolved)}
                      <div className="pg-role-panel-actions">
                        {undoStale && <span className="pg-role-stale">⚠ {t('roles.editedAfterApply')}</span>}
                        <button type="button" className="pg-btn pg-btn--sm" onClick={undoRoleRepair} disabled={undoStale}>
                          ↩ {t('roles.undo')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="pg-role-preview" role="region" aria-labelledby="pg-role-preview-title" data-tour={TUTORIAL_TARGETS.rolePreview}>
                <div className="pg-role-preview-head">
                  <div className="pg-role-preview-copy">
                    <h3 id="pg-role-preview-title" className="pg-role-preview-title">{t('roles.previewTitle')}</h3>
                    <span className="pg-role-preview-note">{t('roles.previewNote')}</span>
                  </div>
                  <div className="pg-role-preview-modes" role="group" aria-label={t('cvd.title')}>
                    {ROLE_PREVIEW_VISIONS.map(([vision, key]) => (
                      <button
                        key={vision}
                        type="button"
                        className={`pg-role-preview-mode${rolePreviewVision === vision ? ' pg-role-preview-mode--active' : ''}`}
                        aria-pressed={rolePreviewVision === vision}
                        onClick={() => setRolePreviewVision(vision)}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pg-role-preview-stage">
                  <div
                    className="pg-role-preview-canvas"
                    style={{
                      background: rolePreviewColors.background,
                      color: rolePreviewColors.text,
                      borderColor: `${rolePreviewColors.text}30`,
                    }}
                    aria-label={t('roles.previewCanvasLabel')}
                    data-vision={rolePreviewVision}
                  >
                    <div className="pg-role-preview-topline">
                      <span className="pg-role-preview-live">
                        <span aria-hidden="true" style={{ background: rolePreviewColors.success }} />
                        {t('roles.previewLive')}
                      </span>
                      <div className="pg-role-preview-base">
                        {(['background', 'text'] as const).map((role) => {
                          const issue = roleIssueBreakdown(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              className={`pg-role-preview-role${issue.n > 0 ? ' pg-role-preview-role--issue' : ''}`}
                              style={{ color: rolePreviewColors.text, borderColor: `${rolePreviewColors.text}38` }}
                              title={issue.n > 0 ? t('roles.issueBadgeDetail', issue) : roleLabel(role)}
                              aria-controls={`pg-role-control-${role}`}
                              onClick={() => focusRoleControl(role)}
                            >
                              <span className="pg-role-preview-dot" style={{ background: rolePreviewColors[role] }} />
                              <span>{roleLabel(role)}</span>
                              {issue.n > 0 && (
                                <span
                                  className="pg-role-preview-issue"
                                  aria-label={t('roles.issueBadge', issue)}
                                  title={t('roles.issueBadgeDetail', issue)}
                                >
                                  {issue.n}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="pg-role-preview-body">
                      <div className="pg-role-preview-main">
                        <div
                          className={`pg-role-preview-copy-sample${rolePreviewTextIssue.n > 0 ? ' pg-role-preview-copy-sample--issue' : ''}`}
                          title={rolePreviewTextIssue.n > 0 ? t('roles.issueBadgeDetail', rolePreviewTextIssue) : roleLabel('text')}
                        >
                          <h4>{t('roles.previewHeading')}</h4>
                          <p>{t('roles.previewBody')}</p>
                        </div>
                        <div className="pg-role-preview-actions">
                          <button
                            type="button"
                            className={`pg-role-preview-primary${rolePreviewPrimaryIssue.n > 0 ? ' pg-role-preview-primary--issue' : ''}`}
                            style={{ background: rolePreviewColors.primary, color: rolePreviewOnPrimary }}
                            title={rolePreviewPrimaryIssue.n > 0 ? t('roles.issueBadgeDetail', rolePreviewPrimaryIssue) : roleLabel('primary')}
                            aria-controls="pg-role-control-primary"
                            onClick={() => focusRoleControl('primary')}
                          >
                            {t('roles.previewAction')}
                            {rolePreviewPrimaryIssue.n > 0 && (
                              <span
                                className="pg-role-preview-issue"
                                aria-label={t('roles.issueBadge', rolePreviewPrimaryIssue)}
                                title={t('roles.issueBadgeDetail', rolePreviewPrimaryIssue)}
                              >
                                {rolePreviewPrimaryIssue.n}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="pg-role-preview-statuses">
                        {ROLE_PREVIEW_STATUSES.map(([role, symbol]) => {
                          const issue = roleIssueBreakdown(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              className={`pg-role-preview-status${issue.n > 0 ? ' pg-role-preview-status--issue' : ''}`}
                              style={{
                                color: rolePreviewColors.text,
                                borderTopColor: `${rolePreviewColors.text}30`,
                                borderRightColor: `${rolePreviewColors.text}30`,
                                borderBottomColor: `${rolePreviewColors.text}30`,
                                borderLeftColor: rolePreviewColors[role],
                              }}
                              title={issue.n > 0 ? t('roles.issueBadgeDetail', issue) : roleLabel(role)}
                              aria-controls={`pg-role-control-${role}`}
                              onClick={() => focusRoleControl(role)}
                            >
                              <span
                                className="pg-role-preview-status-icon"
                                style={{ color: rolePreviewColors[role], borderColor: rolePreviewColors[role] }}
                                aria-hidden="true"
                              >
                                {symbol}
                              </span>
                              <span className="pg-role-preview-status-label">{roleLabel(role)}</span>
                              {issue.n > 0 && (
                                <span
                                  className="pg-role-preview-issue"
                                  aria-label={t('roles.issueBadge', issue)}
                                  title={t('roles.issueBadgeDetail', issue)}
                                >
                                  {issue.n}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
            <div ref={statusCheckRef} className="pg-section-head" data-tour={TUTORIAL_TARGETS.statusCheck}>
              <h2 id="pg-confusion-title" className="pg-section-title">{t('confusion.title')}</h2>
              <span className="pg-section-note">{t('statusCvd.purpose')}</span>
            </div>
            <div
              className={`pg-status-overview pg-status-overview--${statusColorReviewCount > 0 ? 'review' : 'clear'}`}
              role="status"
            >
              <span className="pg-status-overview__icon" aria-hidden="true">
                {statusColorReviewCount > 0 ? '!' : '✓'}
              </span>
              <span>
                <strong>
                  {t(statusColorReviewCount > 0 ? 'confusion.summary' : 'confusion.allClear', {
                    n: statusColorReviewCount,
                  })}
                </strong>
                <small>{t('statusCvd.overallHint')}</small>
              </span>
            </div>
            <div className="pg-cvd-context-note">{t('statusCvd.independentFromSeed')}</div>
            <div className="pg-status-role-summary" aria-label={t('confusion.title')}>
              {semantic.map((s) => (
                <button
                  key={s.role}
                  type="button"
                  className="pg-status-role-chip"
                  aria-controls={`pg-role-control-${s.role}`}
                  onClick={() => focusRoleControl(s.role)}
                >
                  <AccessibleColorSwatch hex={s.hex} t={t} className="pg-sem-dot" />
                  <span>{t('statusCvd.roleName', { role: t(('sem.' + s.role) as MsgKey) })}</span>
                  <code>{s.hex}</code>
                </button>
              ))}
            </div>

            <div className="pg-cvd-result-grid">
              <section className="pg-cvd-result-block" aria-labelledby="pg-cvd-duplicates-title">
                <h3 id="pg-cvd-duplicates-title">{t('statusCvd.duplicateTitle')}</h3>
                {duplicateConfusion.length === 0 ? (
                  <div className="pg-confusion-ok">✓ {t('statusCvd.duplicateNone')}</div>
                ) : (
                  <ul className="pg-confusion-list">
                    {duplicateConfusion.map((pair) => (
                      <li key={`duplicate-${pair.a.hex}`} className="pg-confusion-item">
                        <AccessibleColorSwatch hex={pair.a.hex} t={t} className="pg-sem-dot" />
                        <span>
                          {t('statusCvd.duplicateSummary', {
                            roles: semanticRoleNames(pair.aMembers),
                            hex: pair.a.hex,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="pg-cvd-result-block" aria-labelledby="pg-cvd-chromatic-title">
                <h3 id="pg-cvd-chromatic-title">{t('statusCvd.chromaticTitle')}</h3>
                {chromaticConfusion.length === 0 ? (
                  duplicateConfusion.length > 0 ? (
                    <div className="pg-confusion-info">
                      ⓘ {t('statusCvd.chromaticClearWithDuplicates')}
                    </div>
                  ) : (
                    <div className="pg-confusion-ok">✓ {t('statusCvd.chromaticClear')}</div>
                  )
                ) : (
                  <>
                    <div className="pg-confusion-summary">
                      ⚠ {t('statusCvd.chromaticRisk', { n: chromaticConfusion.length })}
                    </div>
                    <ul className="pg-confusion-list">
                      {chromaticConfusion.map((pair) => {
                        const worst = worstChromaticSeparation(pair)!;
                        return (
                          <li key={`chromatic-${pair.a.hex}-${pair.b.hex}`} className="pg-confusion-item">
                            <span className="pg-confusion-item__copy">
                              <span className="pg-confusion-roles">
                                <AccessibleColorSwatch hex={pair.a.hex} t={t} className="pg-sem-dot" />
                                {semanticRoleNames(pair.aMembers)}
                                <span className="pg-confusion-x">↔</span>
                                {semanticRoleNames(pair.bMembers)}
                                <AccessibleColorSwatch hex={pair.b.hex} t={t} className="pg-sem-dot" />
                              </span>
                              <small>{t('statusCvd.chromaticPairReason', {
                                vision: t(('cvd.' + worst.type) as MsgKey),
                                level: t(('match.' + worst.level) as MsgKey),
                              })}</small>
                            </span>
                            <span
                              className={`pg-match-badge pg-match-badge--${worst.level}`}
                              title={`OKLab ${worst.dist.toFixed(3)} · ${Math.round(worst.collapseRatio * 100)}%`}
                            >
                              {t(('cvd.' + worst.type) as MsgKey)} · {t(('match.' + worst.level) as MsgKey)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>

              <section className="pg-cvd-result-block pg-cvd-result-block--info" aria-labelledby="pg-cvd-mono-title">
                <h3 id="pg-cvd-mono-title">{t('statusCvd.monochromeTitle')}</h3>
                {monochromeConfusion.length === 0 ? (
                  duplicateConfusion.length > 0 ? (
                    <div className="pg-confusion-info">
                      ⓘ {t('statusCvd.monochromeClearWithDuplicates')}
                    </div>
                  ) : (
                    <div className="pg-confusion-ok">✓ {t('statusCvd.monochromeClear')}</div>
                  )
                ) : (
                  <>
                    <div className="pg-confusion-info">
                      ℹ {t('statusCvd.monochromeRisk', { n: monochromeConfusion.length })}
                    </div>
                    <ul className="pg-confusion-list">
                      {monochromeConfusion.map((pair) => {
                        const mono = pair.byType.find((item) => item.type === 'mono')!;
                        return (
                          <li key={`mono-${pair.a.hex}-${pair.b.hex}`} className="pg-confusion-item">
                            <span className="pg-confusion-item__copy">
                              <span className="pg-confusion-roles">
                                <AccessibleColorSwatch hex={pair.a.hex} t={t} className="pg-sem-dot" />
                                {semanticRoleNames(pair.aMembers)}
                                <span className="pg-confusion-x">↔</span>
                                {semanticRoleNames(pair.bMembers)}
                                <AccessibleColorSwatch hex={pair.b.hex} t={t} className="pg-sem-dot" />
                              </span>
                              <small>{t('statusCvd.monochromePairReason')}</small>
                            </span>
                            <span
                              className={`pg-match-badge pg-match-badge--${mono.level}`}
                              title={`OKLab ${mono.dist.toFixed(3)} · ${Math.round(mono.collapseRatio * 100)}%`}
                            >
                              {t('cvd.mono')} · {t(('match.' + mono.level) as MsgKey)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            </div>

            <div className="pg-cvd-noncolor-note">ⓘ {t('statusCvd.nonColorCue')}</div>

            <details className="pg-status-criteria">
              <summary>{t('statusCvd.criteriaTitle')}</summary>
              <p>
                {t('confusion.note', {
                  same: MATCH_SAME_DISTANCE.toFixed(3),
                  threshold: MATCH_REVIEW_DISTANCE.toFixed(3),
                  ratio: Math.round(MATCH_RELATIVE_COLLAPSE_RATIO * 100),
                })}
              </p>
              <p>{t('cvd.modelDisclaimer')}</p>
            </details>

            {simulationConfusion.length > 0 && (
              <>
                <div className="pg-confusion-detail-toggle">
                  <button
                    type="button"
                    className="pg-btn pg-btn--sm"
                    aria-expanded={showConfusionDetail}
                    onClick={() => setShowConfusionDetail((value) => !value)}
                  >
                    {showConfusionDetail ? t('confusion.hideDetail') : t('confusion.showDetail')}
                  </button>
                </div>
                {showConfusionDetail && (
                  <div className="pg-confusion-detail">
                    {simulationConfusion.map((pair) => (
                      <div key={`detail-${pair.a.hex}-${pair.b.hex}`} className="pg-confusion-detail-pair">
                        <div className="pg-confusion-detail-head">
                          {semanticRoleNames(pair.aMembers)} ↔ {semanticRoleNames(pair.bMembers)}
                        </div>
                        {pair.byType.map((item) => {
                          const a = simulateHex(pair.a.hex, item.type);
                          const b = simulateHex(pair.b.hex, item.type);
                          return (
                            <div key={item.type} className="pg-match-row">
                              <span className="pg-cvd-label">{t(('cvd.' + item.type) as MsgKey)}</span>
                              <AccessibleColorSwatch hex={a} t={t} />
                              <AccessibleColorSwatch hex={b} t={t} />
                              <span
                                className={`pg-match-badge pg-match-badge--${item.level}`}
                                title={`OKLab ${item.dist.toFixed(3)} · ${Math.round(item.collapseRatio * 100)}%`}
                              >
                                {t(('match.' + item.level) as MsgKey)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
          {PRO_UI_AVAILABLE && (
          <section className="pg-matrix-section" data-tour={TUTORIAL_TARGETS.contrastMatrix}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="pg-btn pg-btn--sm"
                onClick={() => {
                  if (!pro) {
                    openUpgrade();
                    return;
                  }
                  setShowMatrix((v) => !v);
                }}
              >
                {showMatrix ? t('matrix.hide') : t('matrix.show')}
                {!pro && <span className="pg-prolock">{t('pro.badge')}</span>}
              </button>
            </div>
            {pro && showMatrix && matrix && (
              <div className="pg-matrix-wrap">
                <div className="pg-matrix-desc">{t('matrix.desc')}</div>
                <div className="pg-matrix-scroll">
                  <table className="pg-matrix">
                    <thead>
                      <tr>
                        <th className="pg-matrix-corner" />
                        {ramp.steps.map((bg) => (
                          <th
                            key={bg.step}
                            style={{ background: bg.hex, color: readableTextOn(bg.hex) }}
                          >
                            {bg.step}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ramp.steps.map((fg, r) => (
                        <tr key={fg.step}>
                          <th style={{ background: fg.hex, color: readableTextOn(fg.hex) }}>
                            {fg.step}
                          </th>
                          {ramp.steps.map((bg, c) => {
                            const ratio = matrix[r][c];
                            const lvl = ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : ratio >= 3 ? 'aal' : 'fail';
                            return (
                              <td
                                key={bg.step}
                                className={`pg-mcell pg-mcell--${lvl}`}
                                style={{ background: bg.hex, color: readableTextOn(bg.hex) }}
                                title={`${t('roles.pairOn', { fg: fg.step, bg: bg.step })}: ${formatContrastRatio(ratio)}:1`}
                                aria-label={`${t('roles.pairOn', { fg: fg.step, bg: bg.step })}: ${formatContrastRatio(ratio)}:1`}
                              >
                                {formatContrastRatio(ratio)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pg-matrix-legend">
                  <span className="pg-mleg pg-mleg--aaa">AAA ≥7</span>
                  <span className="pg-mleg pg-mleg--aa">AA ≥4.5</span>
                  <span className="pg-mleg pg-mleg--aal">AA·L ≥3</span>
                  <span className="pg-mleg pg-mleg--fail">{'✕ <3'}</span>
                </div>
              </div>
            )}
          </section>
          )}
            </>
          )}
          </div>
        </>
      )}
      </div>

      <div
        id="pg-workspace-panel-deliver"
        className="pg-workspace-panel"
        role="tabpanel"
        aria-labelledby="pg-workspace-tab-deliver"
        hidden={workspaceTab !== 'deliver'}
      >
        {ramp && (
          <section className="pg-export" data-tour={TUTORIAL_TARGETS.exportPanel}>
            <div className="pg-export-context">
              <span className="pg-readiness-variant">
                {t('paletteUsage.active', { variant: activePaletteLabel })}
              </span>
              <span>{t('paletteUsage.outputScope')}</span>
            </div>
            {PRO_UI_AVAILABLE && pro && (
              <label className="pg-export-role-scope">
                <input
                  type="checkbox"
                  checked={includeRoleSystemInReports}
                  disabled={!roleSystemReadyForExport}
                  onChange={(event) => setIncludeRoleSystemInReports(event.target.checked)}
                />
                <span>
                  <strong>{t('roleWorkspace.includeInReport')}</strong>
                  <small>{t(roleSystemReadyForExport
                    ? 'roleWorkspace.includeInReportHint'
                    : 'roleWorkspace.includeUnavailable')}</small>
                </span>
              </label>
            )}
            <div className="pg-export-head">
              <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} data-tour={TUTORIAL_TARGETS.exportFormat}>
                {FORMATS.filter((item) => pro || isFreeFormat(item.id)).map((f) => (
                  <option key={f.id} value={f.id}>
                    {t(f.key)}
                  </option>
                ))}
              </select>
              <button type="button" className="pg-btn" onClick={saveExport}>
                {t('export.save')}
              </button>
              <button type="button" className="pg-btn pg-btn--primary" onClick={copyExport} data-tour={TUTORIAL_TARGETS.exportCopy}>
                {t('export.copy')}
              </button>
              {PRO_UI_AVAILABLE && pro && (
                <>
                  <button
                    type="button"
                    className="pg-btn"
                    onClick={saveAse}
                    title={t('pro.feat.ase')}
                  >
                    {t('export.ase')}
                  </button>
                  <button
                    type="button"
                    className="pg-btn"
                    onClick={saveExportPack}
                    title={t('export.packTitle')}
                  >
                    {t('export.pack')}
                  </button>
                  <button
                    type="button"
                    className="pg-btn"
                    onClick={saveReport}
                  >
                    {t('report.save')}
                  </button>
                </>
              )}
            </div>
            {PRO_UI_AVAILABLE && exportLocked ? (
              <div className="pg-export-lock">
                <div className="pg-export-lock-title">
                  {t(('format.' + format) as MsgKey)} · {t('pro.badge')}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: '46ch' }}>{t('pro.exportNote')}</div>
                <button type="button" className="pg-btn pg-btn--primary" onClick={openUpgrade}>
                  {t('pro.unlock')}
                </button>
              </div>
            ) : (
              <>
                {format === 'custom' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{t('custom.presets')}</span>
                      {TEMPLATE_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          className="pg-btn pg-btn--sm"
                          onClick={() => setCustomTemplate(p.tpl)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={customTemplate}
                      onChange={(e) => setCustomTemplate(e.target.value)}
                      spellCheck={false}
                      aria-label={t('a11y.customTemplate')}
                      style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13.5, padding: '7px 9px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--panel-deep)', color: 'var(--text)' }}
                    />
                  </div>
                )}
                <div className="pg-export-guide">
                  <span className="pg-export-target">{t('workflow.deliver')} · {formatDestination}</span>
                  <span>{t(('guide.' + format) as MsgKey)}</span>
                </div>
                <textarea readOnly value={code} spellCheck={false} />
              </>
            )}
          </section>
        )}
      </div>

      <footer className="pg-footer">
        <span className="pg-footer-version" aria-label={`${t('legal.version')} ${appVersion}`}>
          {t('legal.version')} {appVersion}
        </span>
        <img className="pg-footer-logo" src={logoUrl} alt={VENDOR} />
      </footer>

      {PRO_UI_AVAILABLE && showUpgrade && !pro && (
        <div className="pg-modal-scrim" role="presentation" onClick={closeUpgrade}>
          <div
            ref={upgradeDialogRef}
            className="pg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pg-upgrade-title"
            aria-describedby="pg-upgrade-description"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div id="pg-upgrade-title" className="pg-modal-title">{t('pro.title')}</div>
            <div id="pg-upgrade-description" className="pg-modal-sub">{t('pro.subtitle')}</div>
            <ul className="pg-modal-feats">
              {PRO_FEATURE_KEYS.map((k) => (
                <li key={k}>{t(k as MsgKey)}</li>
              ))}
            </ul>
            {PRO_PURCHASE_AVAILABLE && (
              <div className="pg-modal-price">{t('pro.priceLabel', { price: PRO_PRICE })}</div>
            )}
            <div className="pg-modal-actions">
              <button type="button" className="pg-btn pg-btn--sm" onClick={closeUpgrade}>
                {t('pro.later')}
              </button>
              <button
                type="button"
                className="pg-btn pg-btn--primary"
                onClick={purchasePro}
                disabled={!PRO_PURCHASE_AVAILABLE && !(import.meta.env.DEV && !isTauri)}
              >
                {PRO_PURCHASE_AVAILABLE || (import.meta.env.DEV && !isTauri) ? t('pro.unlock') : t('pro.storeSoon')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLegal && (
        <LegalModal t={t} locale={locale} onClose={closeLegal} onCopy={copyLegalValue} />
      )}

      {toast && (
        <div className="pg-toast" role="status" aria-live="polite">
          <span>{toast.text}</span>
          {toast.action && (
            <button type="button" className="pg-toast-action" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}

      {activeTutorial && activeTutorialSteps && activeTutorialStep && (
        <TutorialOverlay
          step={activeTutorialStep}
          index={activeTutorial.index}
          total={activeTutorialSteps.length}
          title={t(activeTutorialStep.titleKey)}
          body={t(activeTutorialStep.bodyKey)}
          progress={t('tutorial.progress', { current: activeTutorial.index + 1, total: activeTutorialSteps.length })}
          labels={{
            back: t('tutorial.back'),
            next: t('tutorial.next'),
            finish: t('tutorial.finish'),
            skip: t('tutorial.skip'),
            close: t('tutorial.close'),
          }}
          onBack={() => moveTutorial(activeTutorial.index - 1)}
          onNext={() => moveTutorial(activeTutorial.index + 1)}
          onFinish={finishTutorial}
          onClose={closeTutorial}
          onMissing={skipMissingTutorialTarget}
        />
      )}

      {PRO_UI_AVAILABLE && entitlement.source === 'internal_pro' && (
        <div className="pg-testbadge" title={t('pro.dev')}>
          {t('pro.dev')}
        </div>
      )}
    </div>
  );
}
