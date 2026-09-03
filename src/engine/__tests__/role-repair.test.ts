import { describe, expect, it } from 'vitest';
import { assessRolePalette, createRolePalette, getRoleColor, parseToOklch, repairRolePalette, roleEquals, selectRoleRepairAlternative, setRoleColor, setRoleLocked } from '../index';

describe('role palette repair', () => {
  it('repairs a failing text color to WCAG AA while preserving the background', () => {
    const source = setRoleColor(createRolePalette(), 'text', '#777777');
    const result = repairRolePalette(source);

    expect(assessRolePalette(result.palette).contrast.find((item) => item.foreground === 'text')?.passes).toBe(true);
    expect(getRoleColor(result.palette, 'background').hex).toBe('#ffffff');
    expect(result.changes.some((change) => change.role === 'text' && change.reasons.includes('contrast'))).toBe(true);
  });

  it('never changes a locked role and reports it as locked, not as a failed search', () => {
    let source = createRolePalette();
    source = setRoleColor(source, 'text', '#777777');
    source = setRoleLocked(source, 'text', true);
    const result = repairRolePalette(source);

    expect(getRoleColor(result.palette, 'text')).toEqual({ role: 'text', hex: '#777777', locked: true });
    const blocked = result.unresolved.find((entry) => entry.issue.roles[0] === 'text');
    expect(blocked?.reason).toBe('locked');
    expect(result.counts.skippedLocked).toBeGreaterThanOrEqual(1);
  });

  it('never increases chromatic CVD blockers while maintaining contrast', () => {
    let source = createRolePalette();
    source = setRoleColor(source, 'success', '#16a34a');
    source = setRoleColor(source, 'danger', '#dc2626');
    const before = assessRolePalette(source);
    const result = repairRolePalette(source);

    expect(result.after.issues.filter((issue) => issue.code === 'roleCvdConfusion' && issue.blocking).length)
      .toBeLessThanOrEqual(before.issues.filter((issue) => issue.code === 'roleCvdConfusion' && issue.blocking).length);
    expect(result.after.contrast.every((item) => item.passes)).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const source = setRoleColor(createRolePalette(), 'warning', '#f59e0b');
    expect(repairRolePalette(source)).toEqual(repairRolePalette(source));
  });

  it('ranks at most three unique deterministic alternatives with the engine default first', () => {
    const source = setRoleColor(createRolePalette(), 'success', '#16a34a');
    const first = repairRolePalette(source);
    const second = repairRolePalette(source);
    const change = first.changes.find((item) => item.role === 'success');

    expect(change).toBeTruthy();
    expect(change!.alternatives.length).toBeGreaterThan(1);
    expect(change!.alternatives.length).toBeLessThanOrEqual(3);
    expect(change!.alternatives[0].hex).toBe(change!.after);
    expect(new Set(change!.alternatives.map((item) => item.hex)).size).toBe(change!.alternatives.length);
    expect(first).toEqual(second);
  });

  it('selects a ranked alternative without mutating the source or changing another role', () => {
    const source = setRoleColor(createRolePalette(), 'success', '#16a34a');
    const result = repairRolePalette(source);
    const change = result.changes.find((item) => item.role === 'success')!;
    const alternative = change.alternatives[1];
    const selected = selectRoleRepairAlternative(source, result, 'success', alternative.hex);

    expect(getRoleColor(source, 'success').hex).toBe('#16a34a');
    expect(getRoleColor(selected.palette, 'success').hex).toBe(alternative.hex);
    expect(getRoleColor(selected.palette, 'danger')).toEqual(getRoleColor(result.palette, 'danger'));
    expect(selected.changes.find((item) => item.role === 'success')?.alternatives).toEqual(change.alternatives);
    expect(selected.after.contrast.every((item) => item.passes)).toBe(true);
  });

  it('ignores a color that is not in the ranked alternatives', () => {
    const source = setRoleColor(createRolePalette(), 'success', '#16a34a');
    const result = repairRolePalette(source);
    expect(selectRoleRepairAlternative(source, result, 'success', '#abcdef')).toBe(result);
  });

  it('reports counts that reconcile: fixed + unresolved equals the blocking issues it started with', () => {
    const source = setRoleColor(createRolePalette(), 'text', '#aaaaaa');
    const result = repairRolePalette(source);

    expect(result.counts.blockingBefore).toBe(result.before.issues.filter((issue) => issue.blocking).length);
    expect(result.counts.unresolved).toBe(result.unresolved.length);
    expect(result.counts.fixed + result.counts.unresolved).toBe(result.counts.blockingBefore);
    expect(result.counts.skippedLocked).toBe(0);
  });

  it('attaches the measured evidence behind a contrast change', () => {
    const source = setRoleColor(createRolePalette(), 'text', '#aaaaaa');
    const change = repairRolePalette(source).changes.find((item) => item.role === 'text');

    expect(change?.reasons).toContain('contrast');
    expect(change?.measured.required).toBe(4.5);
    expect(change?.measured.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('attaches the CVD separation a status change gained', () => {
    let source = createRolePalette();
    source = setRoleColor(source, 'success', '#16a34a');
    source = setRoleColor(source, 'danger', '#dc2626');
    const change = repairRolePalette(source).changes.find((item) => item.reasons.includes('cvd'));

    expect(change).toBeTruthy();
    expect(typeof change!.measured.cvdDistBefore).toBe('number');
    // Either the collision is gone (undefined) or the separation grew.
    if (typeof change!.measured.cvdDistAfter === 'number') {
      expect(change!.measured.cvdDistAfter).toBeGreaterThan(change!.measured.cvdDistBefore!);
    }
  });

  it('every unresolved blocker carries one of the four objective reasons', () => {
    const result = repairRolePalette(setRoleLocked(createRolePalette(), 'danger', true));
    const reasons = ['locked', 'hueBandLimit', 'noSafeCandidate', 'needsNonColorCue'];
    for (const entry of result.unresolved) expect(reasons).toContain(entry.reason);
    expect(result.counts.skippedLocked).toBe(result.unresolved.filter((e) => e.reason === 'locked').length);
  });

  it('leaves a locked role byte-identical while allowing another role to resolve a practical collision', () => {
    let source = createRolePalette();
    source = setRoleColor(source, 'success', '#16a34a');
    source = setRoleColor(source, 'danger', '#dc2626');
    source = setRoleLocked(source, 'danger', true);
    const result = repairRolePalette(source);

    expect(getRoleColor(result.palette, 'danger')).toEqual({ role: 'danger', hex: '#dc2626', locked: true });
    expect(result.changes.every((change) => change.role !== 'danger')).toBe(true);
    expect(result.after.issues.filter((issue) => issue.code === 'roleCvdConfusion' && issue.blocking)).toEqual([]);
    expect(result.unresolved.some((entry) => entry.reason === 'locked')).toBe(false);
  });

  it('drives the all-unresolved review path when every movable role is pinned', () => {
    // Locking only the colliding pair is not enough: other roles keep their own independently
    // fixable contrast issues. A fully pinned brand palette is the real "nothing to apply" case.
    let source = createRolePalette();
    source = setRoleColor(source, 'success', '#16a34a');
    source = setRoleColor(source, 'danger', '#dc2626');
    for (const role of ['primary', 'text', 'success', 'warning', 'danger', 'info'] as const) {
      source = setRoleLocked(source, role, true);
    }
    const result = repairRolePalette(source);

    // Nothing to apply, yet the diagnosis must still exist — the review panel renders it.
    expect(result.counts.fixed).toBe(0);
    expect(result.changes).toEqual([]);
    expect(result.unresolved.length).toBeGreaterThan(0);
    expect(result.unresolved.every((entry) => entry.reason === 'locked')).toBe(true);
    expect(roleEquals(result.palette, source)).toBe(true);
  });

  it('a snapshot taken before applying restores the exact palette, locks included', () => {
    let source = createRolePalette();
    source = setRoleColor(source, 'text', '#aaaaaa');
    source = setRoleLocked(source, 'danger', true);

    const snapshot = source; // what App captures before setRolePalette(result.palette)
    const result = repairRolePalette(source);

    expect(roleEquals(result.palette, snapshot)).toBe(false); // something actually changed
    expect(roleEquals(snapshot, source)).toBe(true); // repair never mutated the input in place
    expect(getRoleColor(snapshot, 'text').hex).toBe('#aaaaaa');
    expect(getRoleColor(snapshot, 'danger').locked).toBe(true);
  });

  it('does not blame a lock when an unlocked partner can resolve the collision', () => {
    const locked = repairRolePalette(setRoleLocked(createRolePalette(), 'danger', true));
    const withDanger = locked.unresolved.find(
      (entry) => entry.issue.code === 'roleCvdConfusion' && entry.issue.roles.includes('danger'),
    );
    expect(withDanger?.reason).not.toBe('locked');
    expect(locked.after.issues.filter((issue) => issue.code === 'roleCvdConfusion' && issue.blocking)).toEqual([]);

    // 잠금이 없는 기본 팔레트에서도 잠금을 원인으로 잘못 보고하지 않아야 합니다.
    const free = repairRolePalette(createRolePalette());
    const stillColliding = free.unresolved.find((entry) => entry.issue.code === 'roleCvdConfusion');
    expect(stillColliding?.reason).not.toBe('locked');
    expect(free.counts.skippedLocked).toBe(0);
  });

  it('preserves the meaning of default status roles while repairing them', () => {
    const source = createRolePalette();
    const palette = repairRolePalette(source).palette;
    const hue = (role: 'success' | 'warning' | 'danger' | 'info') => parseToOklch(getRoleColor(palette, role).hex)!.h;
    const movement = (role: 'success' | 'warning' | 'danger' | 'info') =>
      Math.abs(parseToOklch(getRoleColor(source, role).hex)!.l - parseToOklch(getRoleColor(palette, role).hex)!.l);

    expect(hue('success')).toBeGreaterThanOrEqual(95);
    expect(hue('success')).toBeLessThanOrEqual(180);
    expect(hue('warning')).toBeGreaterThanOrEqual(35);
    expect(hue('warning')).toBeLessThanOrEqual(100);
    expect(hue('danger') >= 330 || hue('danger') <= 35).toBe(true);
    expect(hue('info')).toBeGreaterThanOrEqual(200);
    expect(hue('info')).toBeLessThanOrEqual(285);
    expect(movement('success')).toBeLessThanOrEqual(0.16);
    expect(movement('warning')).toBeLessThanOrEqual(0.16);
    expect(movement('danger')).toBeLessThanOrEqual(0.16);
    expect(movement('info')).toBeLessThanOrEqual(0.16);
  });

  it('groups three identical status roles once and repairs them deterministically without inflated counts', () => {
    let source = createRolePalette();
    source = setRoleColor(source, 'success', '#2563eb');
    source = setRoleColor(source, 'warning', '#2563eb');
    source = setRoleColor(source, 'info', '#2563eb');

    const first = repairRolePalette(source);
    const second = repairRolePalette(source);
    const beforeDuplicates = first.before.issues.filter((issue) => issue.confusion?.kind === 'duplicate');
    const unresolvedDuplicates = first.unresolved.filter((entry) => entry.issue.confusion?.kind === 'duplicate');

    expect(first.before.duplicateConfusion).toHaveLength(1);
    expect(beforeDuplicates).toHaveLength(1);
    expect(beforeDuplicates[0].roles).toEqual(['success', 'warning', 'info']);
    expect(first.changes.length).toBeGreaterThan(0);
    expect(first.after.duplicateConfusion).toHaveLength(0);
    expect(unresolvedDuplicates).toHaveLength(0);
    expect(first.counts.unresolved).toBe(first.unresolved.length);
    expect(first.counts).toEqual(second.counts);
    expect(roleEquals(first.palette, second.palette)).toBe(true);
  });
});
