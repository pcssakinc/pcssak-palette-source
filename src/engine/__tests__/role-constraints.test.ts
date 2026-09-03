import { describe, expect, it } from 'vitest';
import { assessRolePalette, createRolePalette, setRoleColor } from '../index';

describe('role-based constraints', () => {
  it('checks text with AA and visible UI roles with the 3:1 UI threshold', () => {
    const assessment = assessRolePalette(createRolePalette());
    const text = assessment.contrast.find((item) => item.foreground === 'text')!;
    const warning = assessment.contrast.find((item) => item.foreground === 'warning')!;

    expect(text.kind).toBe('text');
    expect(text.minimum).toBe(4.5);
    expect(text.passes).toBe(true);
    expect(warning.kind).toBe('ui');
    expect(warning.minimum).toBe(3);
    expect(warning.passes).toBe(false);
  });

  it('reports contrast risk with measured values and the affected roles', () => {
    const palette = setRoleColor(createRolePalette(), 'text', '#777777');
    const assessment = assessRolePalette(palette);
    const issue = assessment.issues.find((item) => item.code === 'roleContrast' && item.roles[0] === 'text');

    expect(issue).toBeTruthy();
    expect(issue!.roles).toEqual(['text', 'background']);
    expect(issue!.ratio).toBeLessThan(issue!.minimum!);
    expect(issue!.blocking).toBe(true);
  });

  it('includes CVD confusion only among the status roles', () => {
    let palette = createRolePalette();
    palette = setRoleColor(palette, 'success', '#16a34a');
    palette = setRoleColor(palette, 'danger', '#dc2626');
    const assessment = assessRolePalette(palette);
    const issue = assessment.issues.find((item) => item.code === 'roleCvdConfusion');

    expect(issue).toBeTruthy();
    expect(issue!.roles.every((role) => ['success', 'warning', 'danger', 'info'].includes(role))).toBe(true);
    expect(issue!.confusion?.worst.type).toMatch(/protan|deutan|tritan/);
  });

  it('keeps monochrome collisions visible without making a usable palette impossible to approve', () => {
    let palette = createRolePalette();
    palette = setRoleColor(palette, 'warning', '#9a6700');
    palette = setRoleColor(palette, 'success', '#006d3c');
    palette = setRoleColor(palette, 'danger', '#b42318');
    palette = setRoleColor(palette, 'info', '#175cd3');
    const assessment = assessRolePalette(palette);

    expect(assessment.contrast.every((item) => item.passes)).toBe(true);
    expect(assessment.chromaticConfusion).toEqual([]);
    expect(assessment.monochromeConfusion.length).toBeGreaterThan(0);
    expect(assessment.issues.filter((issue) => issue.code === 'roleMonochromeConfusion').every((issue) => !issue.blocking)).toBe(true);
    expect(assessment.ready).toBe(!assessment.issues.some((issue) => issue.blocking));
  });

  it('동일한 상태 색 역할을 하나의 중복 그룹과 하나의 차단 이슈로 보고한다', () => {
    let palette = createRolePalette();
    palette = setRoleColor(palette, 'success', '#2563eb');
    palette = setRoleColor(palette, 'warning', '#2563eb');
    palette = setRoleColor(palette, 'info', '#2563eb');
    const assessment = assessRolePalette(palette);
    const duplicateIssues = assessment.issues.filter(
      (issue) => issue.code === 'roleCvdConfusion' && issue.confusion?.kind === 'duplicate',
    );

    expect(assessment.duplicateConfusion).toHaveLength(1);
    expect(assessment.chromaticConfusion.every((pair) => pair.kind === 'simulation')).toBe(true);
    expect(assessment.monochromeConfusion.every((pair) => pair.kind === 'simulation')).toBe(true);
    expect(assessment.duplicateConfusion[0].members.map((color) => color.role))
      .toEqual(['success', 'warning', 'info']);
    expect(duplicateIssues).toHaveLength(1);
    expect(duplicateIssues[0].roles).toEqual(['success', 'warning', 'info']);
    expect(duplicateIssues[0].severity).toBe('risk');
    expect(duplicateIssues[0].blocking).toBe(true);
  });
});
