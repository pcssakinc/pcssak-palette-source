import { describe, expect, it } from 'vitest';
import {
  COLOR_ROLES,
  createRolePalette,
  getRoleColor,
  normalizeRolePalette,
  roleEquals,
  setRoleColor,
  setRoleLocked,
  statusColors,
} from '../index';

describe('roleEquals', () => {
  it('compares by value: identical role/hex/locked triples are equal', () => {
    expect(roleEquals(createRolePalette(), createRolePalette())).toBe(true);
  });

  it('ignores hex letter case, because every producer normalizes', () => {
    const upper = setRoleColor(createRolePalette(), 'primary', '#3B82F6');
    expect(roleEquals(upper, createRolePalette())).toBe(true);
  });

  it('detects a changed color', () => {
    expect(roleEquals(setRoleColor(createRolePalette(), 'text', '#777777'), createRolePalette())).toBe(false);
  });

  it('detects a changed lock flag even when every color matches', () => {
    expect(roleEquals(setRoleLocked(createRolePalette(), 'danger', true), createRolePalette())).toBe(false);
  });

  it('is order-insensitive on input because it normalizes to the canonical role order', () => {
    const base = createRolePalette();
    const shuffled = { colors: [...base.colors].reverse() };
    expect(roleEquals(shuffled, base)).toBe(true);
  });
});

describe('role-based color system', () => {
  it('creates every canonical role in a stable order', () => {
    const palette = createRolePalette();
    expect(palette.colors.map((color) => color.role)).toEqual([...COLOR_ROLES]);
    expect(palette.colors.every((color) => /^#[0-9a-f]{6}$/.test(color.hex))).toBe(true);
    expect(palette.colors.every((color) => color.locked === false)).toBe(true);
  });

  it('normalizes partial persisted data and restores missing or invalid roles', () => {
    const palette = normalizeRolePalette({
      colors: [
        { role: 'primary', hex: ' #ABCDEF ', locked: true },
        { role: 'danger', hex: 'invalid', locked: true },
        { role: 'unknown', hex: '#000000', locked: true },
        { role: 'primary', hex: '#000000', locked: false },
      ],
    });

    expect(getRoleColor(palette, 'primary')).toEqual({ role: 'primary', hex: '#abcdef', locked: true });
    expect(getRoleColor(palette, 'danger')).toEqual({ role: 'danger', hex: '#dc2626', locked: false });
    expect(palette.colors.map((color) => color.role)).toEqual([...COLOR_ROLES]);
  });

  it('supports array backups as well as object backups', () => {
    const palette = normalizeRolePalette([{ role: 'text', hex: '#FFFFFF', locked: false }]);
    expect(getRoleColor(palette, 'text').hex).toBe('#ffffff');
  });

  it('updates colors and locks immutably', () => {
    const before = createRolePalette();
    const colored = setRoleColor(before, 'primary', '#112233');
    const locked = setRoleLocked(colored, 'primary', true);

    expect(getRoleColor(before, 'primary')).toEqual({ role: 'primary', hex: '#3b82f6', locked: false });
    expect(getRoleColor(colored, 'primary')).toEqual({ role: 'primary', hex: '#112233', locked: false });
    expect(getRoleColor(locked, 'primary')).toEqual({ role: 'primary', hex: '#112233', locked: true });
    expect(() => setRoleColor(before, 'primary', 'blue')).toThrow('Role colors must use #RRGGBB hex.');
  });

  it('selects only the four status colors for CVD comparisons', () => {
    const statuses = statusColors(createRolePalette());
    expect(statuses.map((color) => color.role)).toEqual(['success', 'warning', 'danger', 'info']);
  });
});
