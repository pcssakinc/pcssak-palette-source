import type { MsgKey } from './i18n';
import { TUTORIAL_TARGETS, type TutorialTarget } from './tutorial-targets';

export const TUTORIAL_VERSION = 6;

export type TutorialId = 'quick' | 'roles' | 'pro';
export type TutorialWorkspaceTab = 'create' | 'verify' | 'deliver';
export type TutorialVerifyWorkspace = 'pair' | 'roles';

export interface TutorialStepDefinition {
  target: TutorialTarget;
  tab: TutorialWorkspaceTab;
  verifyWorkspace?: TutorialVerifyWorkspace;
  titleKey: MsgKey;
  bodyKey: MsgKey;
}

export interface TutorialCompletion {
  version: number;
  quick: boolean;
  roles: boolean;
  pro: boolean;
}

export const EMPTY_TUTORIAL_COMPLETION: TutorialCompletion = {
  version: TUTORIAL_VERSION,
  quick: false,
  roles: false,
  pro: false,
};

export const TUTORIALS: Record<TutorialId, readonly TutorialStepDefinition[]> = {
  quick: [
    { target: TUTORIAL_TARGETS.imageInput, tab: 'create', titleKey: 'image.open', bodyKey: 'tutorial.quick.image' },
    { target: TUTORIAL_TARGETS.seedColor, tab: 'create', titleKey: 'controls.seedColor', bodyKey: 'tutorial.quick.seed' },
    { target: TUTORIAL_TARGETS.paletteName, tab: 'create', titleKey: 'controls.name', bodyKey: 'tutorial.quick.name' },
    { target: TUTORIAL_TARGETS.ramp, tab: 'create', titleKey: 'ready.scale', bodyKey: 'tutorial.quick.ramp' },
    {
      target: TUTORIAL_TARGETS.verifyTab,
      tab: 'verify',
      verifyWorkspace: 'pair',
      titleKey: 'workflow.verify',
      bodyKey: 'tutorial.quick.verify',
    },
    { target: TUTORIAL_TARGETS.exportCopy, tab: 'deliver', titleKey: 'export.copy', bodyKey: 'tutorial.quick.export' },
  ],
  roles: [
    {
      target: TUTORIAL_TARGETS.roleSystem,
      tab: 'verify',
      verifyWorkspace: 'roles',
      titleKey: 'roles.title',
      bodyKey: 'tutorial.roles.system',
    },
    {
      target: TUTORIAL_TARGETS.rolePreview,
      tab: 'verify',
      verifyWorkspace: 'roles',
      titleKey: 'roles.previewTitle',
      bodyKey: 'tutorial.roles.preview',
    },
    {
      target: TUTORIAL_TARGETS.statusCheck,
      tab: 'verify',
      verifyWorkspace: 'roles',
      titleKey: 'confusion.title',
      bodyKey: 'tutorial.roles.status',
    },
    {
      target: TUTORIAL_TARGETS.colorMatcher,
      tab: 'verify',
      verifyWorkspace: 'roles',
      titleKey: 'match.title',
      bodyKey: 'tutorial.roles.matcher',
    },
    {
      target: TUTORIAL_TARGETS.roleRepair,
      tab: 'verify',
      verifyWorkspace: 'roles',
      titleKey: 'roles.review',
      bodyKey: 'tutorial.roles.repair',
    },
  ],
  pro: [
    {
      target: TUTORIAL_TARGETS.roleRepair,
      tab: 'verify',
      verifyWorkspace: 'roles',
      titleKey: 'roles.review',
      bodyKey: 'tutorial.pro.repair',
    },
    {
      target: TUTORIAL_TARGETS.contrastMatrix,
      tab: 'verify',
      verifyWorkspace: 'roles',
      titleKey: 'matrix.show',
      bodyKey: 'tutorial.pro.matrix',
    },
    { target: TUTORIAL_TARGETS.exportPanel, tab: 'deliver', titleKey: 'workflow.deliver', bodyKey: 'tutorial.pro.export' },
  ],
};

export function normalizeTutorialCompletion(value: unknown): TutorialCompletion {
  if (!value || typeof value !== 'object') return { ...EMPTY_TUTORIAL_COMPLETION };
  const candidate = value as Partial<TutorialCompletion>;
  if (candidate.version !== TUTORIAL_VERSION) return { ...EMPTY_TUTORIAL_COMPLETION };
  return {
    version: TUTORIAL_VERSION,
    quick: candidate.quick === true,
    roles: candidate.roles === true,
    pro: candidate.pro === true,
  };
}
