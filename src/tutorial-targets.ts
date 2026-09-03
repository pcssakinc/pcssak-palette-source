/**
 * 기능 동결 이후의 사용 안내와 출시 검증에서 공유하는 안정적인 UI 기준점입니다.
 *
 * 이 값은 호환성 계약입니다. 이름을 바꿀 때는 사용 안내, 검증 목록,
 * FEATURE-FREEZE.md를 같은 변경에서 함께 갱신해야 합니다.
 */
export const TUTORIAL_TARGETS = {
  workflowTabs: 'workflow-tabs',
  verifyTab: 'verify-tab',
  verifyModeTabs: 'verify-mode-tabs',
  pairWorkspace: 'pair-workspace',
  roleWorkspace: 'role-workspace',
  roleImport: 'role-import',
  imageInput: 'image-input',
  seedColor: 'seed-color',
  paletteName: 'palette-name',
  preset: 'preset',
  wcagAutofix: 'wcag-autofix',
  library: 'library',
  ramp: 'ramp',
  doctor: 'palette-doctor',
  livePreview: 'live-preview',
  cvdPreview: 'cvd-preview',
  roleSystem: 'role-system',
  roleRepair: 'role-repair',
  rolePreview: 'role-preview',
  statusCheck: 'status-check',
  colorMatcher: 'color-matcher',
  contrastMatrix: 'contrast-matrix',
  exportPanel: 'export-panel',
  exportFormat: 'export-format',
  exportCopy: 'export-copy',
} as const;

export type TutorialTarget = (typeof TUTORIAL_TARGETS)[keyof typeof TUTORIAL_TARGETS];

export function tutorialSelector(target: TutorialTarget): string {
  return `[data-tour="${target}"]`;
}
