/** Canonical roles for a production color system, independent from a hue ramp. */
export const COLOR_ROLES = ['primary', 'background', 'text', 'success', 'warning', 'danger', 'info'] as const;
export const STATUS_COLOR_ROLES = ['success', 'warning', 'danger', 'info'] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];
export type StatusColorRole = (typeof STATUS_COLOR_ROLES)[number];

export interface RoleColor {
  role: ColorRole;
  hex: string;
  locked: boolean;
}

export interface RolePalette {
  colors: RoleColor[];
}

const ROLE_DEFAULTS: Record<ColorRole, string> = {
  primary: '#3b82f6',
  background: '#ffffff',
  text: '#111827',
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  info: '#2563eb',
};

const HEX6 = /^#[0-9a-f]{6}$/i;
const ROLE_INDEX = Object.fromEntries(COLOR_ROLES.map((role, index) => [role, index])) as Record<ColorRole, number>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isColorRole(value: unknown): value is ColorRole {
  return typeof value === 'string' && (COLOR_ROLES as readonly string[]).includes(value);
}

function normalizedHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  return HEX6.test(hex) ? hex.toLowerCase() : null;
}

function inputColors(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (isRecord(input) && Array.isArray(input.colors)) return input.colors;
  return [];
}

function defaults(): RolePalette {
  return {
    colors: COLOR_ROLES.map((role) => ({ role, hex: ROLE_DEFAULTS[role], locked: false })),
  };
}

function isCanonicalPalette(palette: RolePalette): boolean {
  return Array.isArray(palette.colors)
    && palette.colors.length === COLOR_ROLES.length
    && palette.colors.every((color, index) => (
      color.role === COLOR_ROLES[index]
      && typeof color.hex === 'string'
      && HEX6.test(color.hex)
      && color.hex === color.hex.toLowerCase()
      && typeof color.locked === 'boolean'
    ));
}

/** 엔진 내부의 정상 팔레트는 재검사·재할당하지 않고, 외부 입력만 기존 규칙으로 정규화한다. */
function canonicalPalette(palette: RolePalette): RolePalette {
  return isCanonicalPalette(palette) ? palette : normalizeRolePalette(palette);
}

/** Return a fresh canonical palette with the built-in role defaults. */
export function createRolePalette(): RolePalette {
  return defaults();
}

/**
 * Normalize persisted/imported role data. Unknown, duplicate, and invalid values are ignored;
 * every missing role returns to its deterministic default.
 */
export function normalizeRolePalette(input: unknown): RolePalette {
  const accepted = new Map<ColorRole, RoleColor>();

  for (const value of inputColors(input)) {
    if (!isRecord(value) || !isColorRole(value.role) || accepted.has(value.role)) continue;
    const hex = normalizedHex(value.hex);
    if (!hex) continue;
    accepted.set(value.role, { role: value.role, hex, locked: value.locked === true });
  }

  return {
    colors: COLOR_ROLES.map((role) => accepted.get(role) ?? { role, hex: ROLE_DEFAULTS[role], locked: false }),
  };
}

/** Read one role without exposing the palette's mutable color object. */
export function getRoleColor(palette: RolePalette, role: ColorRole): RoleColor {
  const color = canonicalPalette(palette).colors[ROLE_INDEX[role]];
  return { ...color };
}

/** Set one valid sRGB hex role color and return a fresh canonical palette. */
export function setRoleColor(palette: RolePalette, role: ColorRole, hex: string): RolePalette {
  const nextHex = normalizedHex(hex);
  if (!nextHex) throw new Error('Role colors must use #RRGGBB hex.');

  const normalized = canonicalPalette(palette);
  return {
    colors: normalized.colors.map((color) => (color.role === role ? { ...color, hex: nextHex } : color)),
  };
}

/** Lock or unlock a role so a future automatic repair never changes it. */
export function setRoleLocked(palette: RolePalette, role: ColorRole, locked: boolean): RolePalette {
  const normalized = canonicalPalette(palette);
  return {
    colors: normalized.colors.map((color) => (color.role === role ? { ...color, locked } : color)),
  };
}

/**
 * Value equality over the canonical role array. Every producer normalizes (fixed role order,
 * lowercased hex), so an index-aligned compare is exact — which lets callers derive "has the
 * palette changed?" from values instead of tracking edit events that can fire without a change.
 */
export function roleEquals(a: RolePalette, b: RolePalette): boolean {
  const left = canonicalPalette(a).colors;
  const right = canonicalPalette(b).colors;
  return left.every((color, index) => {
    const other = right[index];
    return color.role === other.role && color.hex === other.hex && color.locked === other.locked;
  });
}

/** Status colors are the cross-hue set used for CVD confusion checks. */
export function statusColors(palette: RolePalette): RoleColor[] {
  return canonicalPalette(palette).colors.filter((color): color is RoleColor & { role: StatusColorRole } =>
    (STATUS_COLOR_ROLES as readonly string[]).includes(color.role),
  );
}
