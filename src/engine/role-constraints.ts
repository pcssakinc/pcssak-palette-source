import { scanConfusion, type ConfusionByType, type ConfusionPair } from './cvd';
import { statusColors, type ColorRole, type RolePalette } from './roles';
import { contrastBetween } from './wcag';

export type RoleContrastKind = 'text' | 'ui';
export type RoleIssueSeverity = 'warn' | 'risk';

export interface RoleContrastRequirement {
  foreground: ColorRole;
  background: 'background';
  kind: RoleContrastKind;
  minimum: number;
}

export interface RoleContrastResult extends RoleContrastRequirement {
  ratio: number;
  passes: boolean;
}

export interface RoleConstraintIssue {
  code: 'roleContrast' | 'roleCvdConfusion' | 'roleMonochromeConfusion';
  severity: RoleIssueSeverity;
  /** Blocking issues must be resolved before the palette is ready for production. */
  blocking: boolean;
  roles: ColorRole[];
  ratio?: number;
  minimum?: number;
  confusion?: ConfusionPair;
}

export interface RolePaletteAssessment {
  contrast: RoleContrastResult[];
  confusion: ConfusionPair[];
  duplicateConfusion: ConfusionPair[];
  chromaticConfusion: ConfusionPair[];
  monochromeConfusion: ConfusionPair[];
  issues: RoleConstraintIssue[];
  ready: boolean;
}

// Text has a WCAG AA requirement. The remaining color roles are evaluated as visible
// non-text UI components against the chosen background; their usage as body text needs
// a separate text-on-color pair in a future role model.
export const ROLE_CONTRAST_REQUIREMENTS: readonly RoleContrastRequirement[] = [
  { foreground: 'text', background: 'background', kind: 'text', minimum: 4.5 },
  { foreground: 'primary', background: 'background', kind: 'ui', minimum: 3 },
  { foreground: 'success', background: 'background', kind: 'ui', minimum: 3 },
  { foreground: 'warning', background: 'background', kind: 'ui', minimum: 3 },
  { foreground: 'danger', background: 'background', kind: 'ui', minimum: 3 },
  { foreground: 'info', background: 'background', kind: 'ui', minimum: 3 },
];

function byRole(palette: RolePalette): Map<ColorRole, string> {
  return new Map(palette.colors.map((color) => [color.role, color.hex]));
}

function contrastSeverity(ratio: number, minimum: number): RoleIssueSeverity {
  return ratio < minimum * 0.75 ? 'risk' : 'warn';
}

function hasRisk(pair: ConfusionPair, includeMono: boolean): boolean {
  return pair.byType.some((item) => (includeMono || item.type !== 'mono') && item.level !== 'distinct');
}

/**
 * The chromatic (non-grayscale) deficiency where a pair collapses the most. Undefined when
 * the pair only collapses in grayscale, which color changes alone cannot always resolve.
 */
export function worstChromaticSeparation(pair: ConfusionPair): ConfusionByType | undefined {
  if (pair.kind === 'duplicate') return pair.byType.find((item) => item.type !== 'mono');
  const risky = pair.byType.filter((item) => item.type !== 'mono' && item.level !== 'distinct');
  return risky.length === 0 ? undefined : risky.reduce((worst, item) => (item.dist < worst.dist ? item : worst), risky[0]);
}

function chromaticWorst(pair: ConfusionPair) {
  return worstChromaticSeparation(pair)!;
}

/**
 * Check a role-based palette with objective WCAG and CVD rules. This does not infer
 * whether colors are attractive; it only reports measurable production risks.
 */
export function assessRolePalette(palette: RolePalette): RolePaletteAssessment {
  const colors = byRole(palette);
  const contrast = ROLE_CONTRAST_REQUIREMENTS.map((requirement) => {
    const ratio = contrastBetween(colors.get(requirement.foreground) ?? '#000000', colors.get(requirement.background) ?? '#ffffff');
    return { ...requirement, ratio, passes: ratio >= requirement.minimum };
  });
  const confusion = scanConfusion(statusColors(palette));
  const duplicateConfusion = confusion.filter((pair) => pair.kind === 'duplicate');
  const chromaticConfusion = confusion.filter((pair) =>
    pair.kind === 'simulation' && hasRisk(pair, false),
  );
  const monochromeConfusion = confusion.filter((pair) => {
    if (pair.kind === 'duplicate') return false;
    const mono = pair.byType.find((item) => item.type === 'mono');
    return mono?.level !== undefined && mono.level !== 'distinct';
  });
  const issues: RoleConstraintIssue[] = [];

  for (const item of contrast) {
    if (!item.passes) {
      issues.push({
        code: 'roleContrast',
        severity: contrastSeverity(item.ratio, item.minimum),
        blocking: true,
        roles: [item.foreground, item.background],
        ratio: item.ratio,
        minimum: item.minimum,
      });
    }
  }
  for (const pair of [...duplicateConfusion, ...chromaticConfusion]) {
    const worst = chromaticWorst(pair);
    issues.push({
      code: 'roleCvdConfusion',
      severity: worst.level === 'same' ? 'risk' : 'warn',
      blocking: true,
      roles: pair.members.map((member) => member.role as ColorRole),
      confusion: pair,
    });
  }
  for (const pair of monochromeConfusion) {
    issues.push({
      code: 'roleMonochromeConfusion',
      severity: 'warn',
      blocking: false,
      roles: [pair.a.role as ColorRole, pair.b.role as ColorRole],
      confusion: pair,
    });
  }

  return {
    contrast,
    confusion,
    duplicateConfusion,
    chromaticConfusion,
    monochromeConfusion,
    issues,
    ready: !issues.some((issue) => issue.blocking),
  };
}
