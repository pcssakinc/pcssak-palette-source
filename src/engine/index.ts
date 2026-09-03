// Public surface of the color engine.

export { STEPS, type Step } from './steps';
export { PRESETS, type PresetConfig } from './presets';
export { buildRamp } from './ramp';
export { sanitizeTokenName } from './name';
export { refineSwatches, pickSeed, type RawSwatch } from './extract';
export { exportRamp, exportCustom } from './exporters';
export { mergeDtcgDocuments } from './dtcg';
export { exportAse } from './ase';
export { exportPack, type PackFile } from './pack';
export { buildReport, type ExplicitTextPair } from './report';
export { buildDoctor, type DoctorFinding, type DoctorSeverity } from './doctor';
export {
  COLOR_ROLES,
  STATUS_COLOR_ROLES,
  createRolePalette,
  normalizeRolePalette,
  roleEquals,
  getRoleColor,
  setRoleColor,
  setRoleLocked,
  statusColors,
  type ColorRole,
  type StatusColorRole,
  type RoleColor,
  type RolePalette,
} from './roles';
export {
  ROLE_CONTRAST_REQUIREMENTS,
  assessRolePalette,
  worstChromaticSeparation,
  type RoleContrastKind,
  type RoleContrastRequirement,
  type RoleContrastResult,
  type RoleIssueSeverity,
  type RoleConstraintIssue,
  type RolePaletteAssessment,
} from './role-constraints';
export {
  nearestContrastHex,
  repairRolePalette,
  selectRoleRepairAlternative,
  type RoleRepairAlternative,
  type RoleRepairChange,
  type RoleRepairCounts,
  type RoleRepairMeasurement,
  type RoleRepairReason,
  type RoleRepairResult,
  type RoleRepairSkipReason,
  type RoleRepairUnresolved,
} from './role-repair';
export {
  EXPORTED_ROLE_NAMES,
  exportRoleTokens,
  type RoleExportFormat,
} from './role-export';
export {
  simulateHex,
  compareUnder,
  oklabDistance,
  scanConfusion,
  classifyCvdMatch,
  MATCH_SAME_DISTANCE,
  MATCH_REVIEW_DISTANCE,
  MATCH_RELATIVE_COLLAPSE_RATIO,
  MATCH_RISK_DISTANCE,
  type CvdType,
  type CvdComparison,
  type MatchLevel,
  type NamedColor,
  type ConfusionPair,
  type ConfusionByType,
} from './cvd';
export {
  relLuminance,
  contrastRatio,
  contrastVs,
  contrastOklchVs,
  contrastBetween,
  formatContrastRatio,
  recommendTextOnBackground,
  type BackgroundTextRecommendation,
} from './wcag';
export { parseToOklch, oklchToHex } from './color';
export {
  describeApproximateColor,
  type ApproximateColorDescriptor,
  type ApproximateColorFamily,
  type ApproximateLightness,
  type ApproximateSaturation,
  type ApproximateColorConfidence,
} from './color-name';
export type {
  PresetName,
  Swatch,
  RampStep,
  Ramp,
  BuildOptions,
  ExportFormat,
  TextOn,
} from './types';

import { buildRamp } from './ramp';
import { pickSeed, refineSwatches, type RawSwatch } from './extract';
import type { BuildOptions, PresetName, Ramp, Swatch } from './types';

/** Build a ramp directly from a seed color string (hex or any CSS color). */
export function buildPalette(seed: string, preset: PresetName = 'tailwind', opts?: BuildOptions): Ramp {
  return buildRamp(seed, preset, opts);
}

/** From raw extracted swatches: refine → pick seed → build a ramp. */
export function buildFromSwatches(
  raw: RawSwatch[],
  preset: PresetName = 'tailwind',
  opts?: BuildOptions,
): { swatches: Swatch[]; seed: Swatch | null; ramp: Ramp | null } {
  const swatches = refineSwatches(raw);
  const seed = pickSeed(swatches);
  return { swatches, seed, ramp: seed ? buildRamp(seed.hex, preset, opts) : null };
}
