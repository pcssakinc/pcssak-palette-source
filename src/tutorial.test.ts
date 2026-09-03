import { describe, expect, it } from 'vitest';
import {
  EMPTY_TUTORIAL_COMPLETION,
  normalizeTutorialCompletion,
  TUTORIALS,
  TUTORIAL_VERSION,
} from './tutorial';
import { TUTORIAL_TARGETS, tutorialSelector } from './tutorial-targets';

describe('tutorial definitions', () => {
  it('keeps each guide concise and free of duplicate steps', () => {
    for (const [id, steps] of Object.entries(TUTORIALS)) {
      expect(steps.length, id).toBeGreaterThanOrEqual(3);
      expect(steps.length, id).toBeLessThanOrEqual(7);
      expect(new Set(steps.map((step) => step.target)).size, id).toBe(steps.length);
    }
  });

  it('uses only frozen, unique DOM targets', () => {
    const frozenTargets = Object.values(TUTORIAL_TARGETS);
    expect(frozenTargets).toHaveLength(25);
    expect(new Set(frozenTargets).size).toBe(frozenTargets.length);
    expect(TUTORIAL_TARGETS).toMatchObject({
      verifyModeTabs: 'verify-mode-tabs',
      pairWorkspace: 'pair-workspace',
      roleWorkspace: 'role-workspace',
      roleImport: 'role-import',
    });
    for (const steps of Object.values(TUTORIALS)) {
      for (const step of steps) {
        expect(frozenTargets).toContain(step.target);
        expect(tutorialSelector(step.target)).toBe(`[data-tour="${step.target}"]`);
      }
    }
  });

  it('빠른 안내에서 내보내기 전에 검증·수정 탭을 직접 설명한다', () => {
    const verifyIndex = TUTORIALS.quick.findIndex((step) => step.target === TUTORIAL_TARGETS.verifyTab);
    const exportIndex = TUTORIALS.quick.findIndex((step) => step.target === TUTORIAL_TARGETS.exportCopy);

    expect(verifyIndex).toBeGreaterThanOrEqual(0);
    expect(verifyIndex).toBeLessThan(exportIndex);
    expect(TUTORIALS.quick[verifyIndex]).toMatchObject({ tab: 'verify', titleKey: 'workflow.verify' });
  });

  it('모든 검증 단계를 의도한 하위 작업 공간으로 연결한다', () => {
    const quickVerifySteps = TUTORIALS.quick.filter((step) => step.tab === 'verify');
    const roleVerifySteps = TUTORIALS.roles.filter((step) => step.tab === 'verify');
    const proVerifySteps = TUTORIALS.pro.filter((step) => step.tab === 'verify');

    expect(quickVerifySteps.length).toBeGreaterThan(0);
    expect(quickVerifySteps.every((step) => step.verifyWorkspace === 'pair')).toBe(true);
    expect(roleVerifySteps.length).toBeGreaterThan(0);
    expect(roleVerifySteps.every((step) => step.verifyWorkspace === 'roles')).toBe(true);
    expect(proVerifySteps.length).toBeGreaterThan(0);
    expect(proVerifySteps.every((step) => step.verifyWorkspace === 'roles')).toBe(true);

    for (const steps of Object.values(TUTORIALS)) {
      for (const step of steps) {
        if (step.tab !== 'verify') expect(step.verifyWorkspace).toBeUndefined();
      }
    }
  });
});

describe('tutorial completion migration', () => {
  it('preserves only boolean completion flags from the current version', () => {
    expect(normalizeTutorialCompletion({ version: TUTORIAL_VERSION, quick: true, roles: 1, pro: false })).toEqual({
      version: TUTORIAL_VERSION,
      quick: true,
      roles: false,
      pro: false,
    });
  });

  it('resets missing, malformed, and obsolete completion data', () => {
    expect(TUTORIAL_VERSION).toBe(6);
    expect(normalizeTutorialCompletion(null)).toEqual(EMPTY_TUTORIAL_COMPLETION);
    expect(normalizeTutorialCompletion('complete')).toEqual(EMPTY_TUTORIAL_COMPLETION);
    expect(normalizeTutorialCompletion({ version: 5, quick: true, roles: true, pro: true }))
      .toEqual(EMPTY_TUTORIAL_COMPLETION);
  });
});
