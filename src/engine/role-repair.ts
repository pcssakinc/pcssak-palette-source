import { MATCH_REVIEW_DISTANCE, oklabDistance } from './cvd';
import { oklchToHex, parseToOklch } from './color';
import {
  assessRolePalette,
  ROLE_CONTRAST_REQUIREMENTS,
  worstChromaticSeparation,
  type RoleConstraintIssue,
  type RolePaletteAssessment,
} from './role-constraints';
import { getRoleColor, normalizeRolePalette, setRoleColor, type ColorRole, type RolePalette } from './roles';
import { contrastBetween } from './wcag';

export type RoleRepairReason = 'contrast' | 'cvd';

/** Why a blocking issue survived the repair. Objective causes only — never taste. */
export type RoleRepairSkipReason =
  | 'locked' // every movable role in the issue is locked
  | 'hueBandLimit' // a fix exists only outside the role's semantic hue band / movement cap
  | 'noSafeCandidate' // candidates were evaluated but none improved the palette
  | 'needsNonColorCue'; // status colors cannot be separated by color alone — pair with icon/label

/** The measured evidence behind one change, so the UI never has to recompute it. */
export interface RoleRepairMeasurement {
  ratio?: number; // contrast reached after the change
  required?: number; // contrast the role must reach
  cvdDistBefore?: number; // worst chromatic separation involving this role, before
  cvdDistAfter?: number; // ...and after (absent = no chromatic collision left)
}

/** A deterministic, objectively safe replacement for one changed role. Array order is rank. */
export interface RoleRepairAlternative {
  hex: string;
  blockingIssues: number;
  movement: number;
  cvdDistance?: number;
}

export interface RoleRepairChange {
  role: ColorRole;
  before: string;
  after: string;
  reasons: RoleRepairReason[];
  measured: RoleRepairMeasurement;
  /** Rank 1 is the engine default; ranks 2 and 3 are the next-best deterministic options. */
  alternatives: RoleRepairAlternative[];
}

export interface RoleRepairUnresolved {
  issue: RoleConstraintIssue;
  reason: RoleRepairSkipReason;
}

export interface RoleRepairCounts {
  blockingBefore: number;
  fixed: number;
  unresolved: number;
  skippedLocked: number;
}

export interface RoleRepairResult {
  before: RolePaletteAssessment;
  after: RolePaletteAssessment;
  palette: RolePalette;
  changes: RoleRepairChange[];
  unresolved: RoleRepairUnresolved[];
  counts: RoleRepairCounts;
}

const LIGHTNESS_BINARY_STEPS = 20;
const HUE_OFFSETS = [0, -35, 35, -70, 70, -110, 110, 180] as const;
const CHROMA_SCALES = [1, 0.6] as const;
const LIGHTNESS_OFFSETS = [0, -0.12, 0.12] as const;
const STATUS_HUE_OFFSETS = [0, -20, 20, -40, 40] as const;
const STATUS_CHROMA_SCALES = [1, 0.85] as const;
const STATUS_LIGHTNESS_OFFSETS = [0, -0.06, 0.06] as const;
const MAX_STATUS_MOVEMENT = 0.16;
const SEMANTIC_HUE_BANDS: Partial<Record<ColorRole, { start: number; end: number }>> = {
  success: { start: 95, end: 180 },
  warning: { start: 35, end: 100 },
  danger: { start: 330, end: 35 },
  info: { start: 200, end: 285 },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function wrapHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function preservesRoleHue(role: ColorRole, hue: number): boolean {
  const band = SEMANTIC_HUE_BANDS[role];
  if (!band) return true;
  return band.start <= band.end ? hue >= band.start && hue <= band.end : hue >= band.start || hue <= band.end;
}

function semanticHueAnchor(role: ColorRole): number | null {
  const band = SEMANTIC_HUE_BANDS[role];
  if (!band) return null;
  const end = band.start <= band.end ? band.end : band.end + 360;
  return wrapHue((band.start + end) / 2);
}

function isStatusRole(role: ColorRole): boolean {
  return role in SEMANTIC_HUE_BANDS;
}

function minimumContrast(role: ColorRole): number | null {
  return ROLE_CONTRAST_REQUIREMENTS.find((requirement) => requirement.foreground === role)?.minimum ?? null;
}

/**
 * Find the nearest OKLCH lightness that passes contrast against any sRGB background.
 * Contrast falls to a minimum near the background luminance, so the two directions from
 * the current color can be searched independently with a bounded binary search.
 */
export function nearestContrastHex(source: string, background: string, minimum: number): string {
  if (contrastBetween(source, background) >= minimum) return source.toLowerCase();
  const oklch = parseToOklch(source);
  if (!oklch) return source;

  const at = (lightness: number) => oklchToHex(lightness, oklch.c, oklch.h);
  const reaches = (lightness: number) => contrastBetween(at(lightness), background) >= minimum;
  const candidates: number[] = [];

  // Lower-lightness boundary: 0 is the passing end, source is the failing end.
  if (reaches(0)) {
    let low = 0;
    let high = oklch.l;
    for (let index = 0; index < LIGHTNESS_BINARY_STEPS; index++) {
      const mid = (low + high) / 2;
      if (reaches(mid)) low = mid;
      else high = mid;
    }
    candidates.push(low);
  }
  // Higher-lightness boundary: source is the failing end, 1 is the passing end.
  if (reaches(1)) {
    let low = oklch.l;
    let high = 1;
    for (let index = 0; index < LIGHTNESS_BINARY_STEPS; index++) {
      const mid = (low + high) / 2;
      if (reaches(mid)) high = mid;
      else low = mid;
    }
    candidates.push(high);
  }

  let best: { hex: string; lightness: number; delta: number } | null = null;
  for (const lightness of candidates) {
    const hex = at(lightness);
    if (contrastBetween(hex, background) < minimum) continue;
    const delta = Math.abs(lightness - oklch.l);
    if (!best || delta < best.delta - 1e-9 || (Math.abs(delta - best.delta) < 1e-9 && lightness < best.lightness)) {
      best = { hex, lightness, delta };
    }
  }
  return best?.hex ?? source.toLowerCase();
}

function blockingCvdCount(assessment: RolePaletteAssessment): number {
  return assessment.issues.filter((issue) => issue.code === 'roleCvdConfusion' && issue.blocking).length;
}

/**
 * 중복 그룹의 개수만 세면 역할 세 개가 같은 색일 때 하나를 바꿔도 그룹 수가 그대로여서
 * 탐색이 멈춥니다. 각 그룹에서 실제로 제거해야 하는 초과 역할 수를 점수화합니다.
 */
function duplicatePenalty(assessment: RolePaletteAssessment): number {
  return assessment.duplicateConfusion.reduce(
    (total, pair) => total + Math.max(0, pair.members.length - 1),
    0,
  );
}

function chromaticPenalty(assessment: RolePaletteAssessment): number {
  return assessment.chromaticConfusion.reduce((total, pair) => {
    const worst = pair.byType
      .filter((item) => item.type !== 'mono' && item.level !== 'distinct')
      .reduce((minimum, item) => Math.min(minimum, item.dist), Infinity);
    return total + (Number.isFinite(worst) ? MATCH_REVIEW_DISTANCE - worst : 0);
  }, 0);
}

function score(assessment: RolePaletteAssessment, movement: number): readonly [number, number, number, number, number] {
  return [
    blockingCvdCount(assessment),
    duplicatePenalty(assessment),
    chromaticPenalty(assessment),
    assessment.issues.filter((issue) => issue.blocking).length,
    movement,
  ];
}

function compareScores(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index++) {
    if (left[index] < right[index] - 1e-9) return -1;
    if (left[index] > right[index] + 1e-9) return 1;
  }
  return 0;
}

function scoreImproves(candidate: readonly number[], current: readonly number[]): boolean {
  return compareScores(candidate, current) < 0;
}

interface CandidatePool {
  /** Deterministic order: Set insertion order follows the fixed offset loops. */
  allowed: string[];
  /** How many candidates the semantic hue band or the status movement cap removed. */
  constrained: number;
}

function candidatePool(role: ColorRole, source: string, background: string, minimum: number): CandidatePool {
  const color = parseToOklch(source);
  if (!color) return { allowed: [], constrained: 0 };
  const candidates = new Set<string>();
  let constrained = 0;
  const statusRole = isStatusRole(role);
  const sourcePreservesRoleHue = preservesRoleHue(role, color.h);
  const semanticAnchor = semanticHueAnchor(role);
  const hueCandidates = (statusRole ? STATUS_HUE_OFFSETS : HUE_OFFSETS)
    .map((hueOffset) => wrapHue(color.h + hueOffset));
  // 이미 역할 의미 범위를 벗어난 입력은 작은 이동만으로 복구할 수 없으므로,
  // 해당 역할 범위의 중심과 주변 후보를 추가합니다.
  if (statusRole && !sourcePreservesRoleHue && semanticAnchor !== null) {
    hueCandidates.push(
      semanticAnchor,
      wrapHue(semanticAnchor - 20),
      wrapHue(semanticAnchor + 20),
    );
  }
  const chromaScales = statusRole ? STATUS_CHROMA_SCALES : CHROMA_SCALES;
  const lightnessOffsets = statusRole ? STATUS_LIGHTNESS_OFFSETS : LIGHTNESS_OFFSETS;
  for (const hue of hueCandidates) {
    for (const chromaScale of chromaScales) {
      for (const lightnessOffset of lightnessOffsets) {
        if (!preservesRoleHue(role, hue)) {
          constrained++;
          continue;
        }
        const generated = oklchToHex(
          clamp01(color.l + lightnessOffset),
          color.c * chromaScale,
          hue,
        );
        const adjusted = nearestContrastHex(generated, background, minimum);
        if (statusRole && sourcePreservesRoleHue && oklabDistance(source, adjusted) > MAX_STATUS_MOVEMENT) {
          constrained++;
          continue;
        }
        candidates.add(adjusted);
      }
    }
  }
  candidates.delete(source.toLowerCase());
  return { allowed: [...candidates], constrained };
}

function candidateHexes(role: ColorRole, source: string, background: string, minimum: number): string[] {
  return candidatePool(role, source, background, minimum).allowed;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Roles an automatic repair is allowed to move — the background is the fixed reference. */
function movableRoles(issue: RoleConstraintIssue): ColorRole[] {
  return issue.roles.filter((role) => role !== 'background');
}

/** Would moving any of these roles improve the palette? Used to test a lock, not to apply it. */
function hasImprovingCandidate(palette: RolePalette, roles: readonly ColorRole[]): boolean {
  const currentScore = score(assessRolePalette(palette), 0);
  const background = getRoleColor(palette, 'background');
  for (const role of roles) {
    const minimum = minimumContrast(role);
    if (minimum === null) continue;
    const current = getRoleColor(palette, role);
    for (const candidate of candidateHexes(role, current.hex, background.hex, minimum)) {
      const next = assessRolePalette(setRoleColor(palette, role, candidate));
      if (scoreImproves(score(next, oklabDistance(current.hex, candidate)), currentScore)) return true;
    }
  }
  return false;
}

/**
 * Explain, objectively, why a blocking issue is still present after the repair passes.
 *
 * A lock is only blamed when unlocking would actually have helped — we test that rather than
 * assume it, so "unlock this color" is never dead-end advice. Otherwise the candidate pool
 * tells us whether the semantic band left us nothing, or nothing improved the palette at all.
 */
function explainUnresolved(issue: RoleConstraintIssue, palette: RolePalette): RoleRepairSkipReason {
  const movable = movableRoles(issue);
  const unlocked = movable.filter((role) => !getRoleColor(palette, role).locked);
  const locked = movable.filter((role) => getRoleColor(palette, role).locked);

  // Nothing was movable at all — unlocking is the only lever the user has.
  if (unlocked.length === 0) return 'locked';
  // Some role was pinned, and freeing it would have opened a fix.
  if (locked.length > 0 && hasImprovingCandidate(palette, locked)) return 'locked';

  const background = getRoleColor(palette, 'background');
  let anyAllowed = false;
  let anyConstrained = false;
  for (const role of unlocked) {
    const minimum = minimumContrast(role);
    if (minimum === null) continue;
    const pool = candidatePool(role, getRoleColor(palette, role).hex, background.hex, minimum);
    if (pool.allowed.length > 0) anyAllowed = true;
    if (pool.constrained > 0) anyConstrained = true;
  }
  if (!anyAllowed) return anyConstrained ? 'hueBandLimit' : 'noSafeCandidate';
  // Candidates existed, yet none improved the palette. When two status colors still collide,
  // color alone cannot carry the meaning — WCAG 2.2 "Use of Color" asks for a second cue.
  if (issue.code === 'roleCvdConfusion' && movable.every(isStatusRole)) return 'needsNonColorCue';
  return 'noSafeCandidate';
}

/** Closest chromatic collision involving a role — the number the change has to move. */
function worstChromaticDistance(assessment: RolePaletteAssessment, role: ColorRole): number | undefined {
  const distances = assessment.chromaticConfusion
    .filter((pair) => pair.a.role === role || pair.b.role === role)
    .map((pair) => worstChromaticSeparation(pair)?.dist)
    .filter((distance): distance is number => typeof distance === 'number');
  return distances.length === 0 ? undefined : round(Math.min(...distances), 3);
}

function measure(
  role: ColorRole,
  afterHex: string,
  backgroundHex: string,
  reasons: ReadonlySet<RoleRepairReason>,
  before: RolePaletteAssessment,
  after: RolePaletteAssessment,
): RoleRepairMeasurement {
  const measured: RoleRepairMeasurement = {};
  if (reasons.has('contrast')) {
    const minimum = minimumContrast(role);
    if (minimum !== null) {
      measured.required = minimum;
      measured.ratio = round(contrastBetween(afterHex, backgroundHex), 2);
    }
  }
  if (reasons.has('cvd')) {
    measured.cvdDistBefore = worstChromaticDistance(before, role);
    measured.cvdDistAfter = worstChromaticDistance(after, role);
  }
  return measured;
}

type AlternativeOverrides = ReadonlyMap<ColorRole, RoleRepairAlternative[]>;

/**
 * Rank up to three choices for a changed status role. The engine-selected color is always rank 1;
 * remaining candidates use the same objective score and a final HEX tie-break. Every candidate
 * must improve the palette it replaces, pass all contrast requirements, and stay in the semantic
 * hue/movement guardrails enforced by candidatePool.
 */
function rankedAlternatives(
  original: RolePalette,
  repaired: RolePalette,
  role: ColorRole,
): RoleRepairAlternative[] {
  if (!isStatusRole(role)) return [];
  const source = getRoleColor(original, role);
  const selected = getRoleColor(repaired, role);
  const minimum = minimumContrast(role);
  if (source.locked || minimum === null || source.hex === selected.hex) return [];

  const background = getRoleColor(repaired, 'background');
  const basePalette = setRoleColor(repaired, role, source.hex);
  const baseScore = score(assessRolePalette(basePalette), 0);
  const candidateHexesForRole = new Set([
    selected.hex,
    ...candidateHexes(role, source.hex, background.hex, minimum),
  ]);

  const ranked = [...candidateHexesForRole].flatMap((hex) => {
    if (hex === source.hex) return [];
    const candidatePalette = setRoleColor(basePalette, role, hex);
    const assessment = assessRolePalette(candidatePalette);
    if (!assessment.contrast.every((item) => item.passes)) return [];
    const movement = oklabDistance(source.hex, hex);
    const candidateScore = score(assessment, movement);
    if (!scoreImproves(candidateScore, baseScore)) return [];
    return [{
      hex,
      blockingIssues: assessment.issues.filter((issue) => issue.blocking).length,
      movement: round(movement, 3),
      cvdDistance: worstChromaticDistance(assessment, role),
      score: candidateScore,
    }];
  });

  const primary = ranked.find((candidate) => candidate.hex === selected.hex);
  if (!primary) return [];
  const rest = ranked
    .filter((candidate) => candidate.hex !== selected.hex)
    .sort((left, right) => compareScores(left.score, right.score) || left.hex.localeCompare(right.hex));

  return [primary, ...rest].slice(0, 3).map(({ score: _score, ...candidate }) => candidate);
}

function buildRepairResult(
  original: RolePalette,
  palette: RolePalette,
  reasons: ReadonlyMap<ColorRole, ReadonlySet<RoleRepairReason>>,
  alternativeOverrides?: AlternativeOverrides,
): RoleRepairResult {
  const before = assessRolePalette(original);
  const after = assessRolePalette(palette);
  const backgroundHex = getRoleColor(palette, 'background').hex;
  const changes = original.colors.flatMap((color) => {
    const next = getRoleColor(palette, color.role);
    const changed = reasons.get(color.role);
    if (!changed || next.hex === color.hex) return [];
    return [
      {
        role: color.role,
        before: color.hex,
        after: next.hex,
        reasons: [...changed],
        measured: measure(color.role, next.hex, backgroundHex, changed, before, after),
        alternatives: alternativeOverrides?.get(color.role) ?? rankedAlternatives(original, palette, color.role),
      },
    ];
  });

  const unresolved = after.issues
    .filter((issue) => issue.blocking)
    .map((issue) => ({ issue, reason: explainUnresolved(issue, palette) }));
  const blockingBefore = before.issues.filter((issue) => issue.blocking).length;

  return {
    before,
    after,
    palette,
    changes,
    unresolved,
    counts: {
      blockingBefore,
      fixed: Math.max(0, blockingBefore - unresolved.length),
      unresolved: unresolved.length,
      skippedLocked: unresolved.filter((entry) => entry.reason === 'locked').length,
    },
  };
}

/**
 * Deterministically repair a role palette in two passes: WCAG contrast first, then
 * chromatic CVD separation. Locked roles and the chosen background are never altered.
 */
export function repairRolePalette(input: RolePalette): RoleRepairResult {
  const original = normalizeRolePalette(input);
  let palette = original;
  const reasons = new Map<ColorRole, Set<RoleRepairReason>>();

  const recordChange = (role: ColorRole, reason: 'contrast' | 'cvd') => {
    const existing = reasons.get(role) ?? new Set<'contrast' | 'cvd'>();
    existing.add(reason);
    reasons.set(role, existing);
  };

  // Pass 1: each foreground role is adjusted only enough to meet its own use-case threshold.
  for (const requirement of ROLE_CONTRAST_REQUIREMENTS) {
    const foreground = getRoleColor(palette, requirement.foreground);
    const background = getRoleColor(palette, requirement.background);
    if (foreground.locked || contrastBetween(foreground.hex, background.hex) >= requirement.minimum) continue;
    const nextHex = nearestContrastHex(foreground.hex, background.hex, requirement.minimum);
    if (nextHex !== foreground.hex) {
      palette = setRoleColor(palette, foreground.role, nextHex);
      recordChange(foreground.role, 'contrast');
    }
  }

  // Pass 2: repair one chromatic CVD collision at a time. A candidate is accepted only
  // when it improves the global blocking score, so fixing one pair cannot silently regress another.
  for (let iteration = 0; iteration < 12; iteration++) {
    const currentAssessment = assessRolePalette(palette);
    const conflict = currentAssessment.issues.find((issue) => issue.code === 'roleCvdConfusion' && issue.blocking);
    if (!conflict) break;

    const currentScore = score(currentAssessment, 0);
    let best: { palette: RolePalette; role: ColorRole; score: readonly number[] } | null = null;
    for (const role of conflict.roles) {
      const current = getRoleColor(palette, role);
      const minimum = minimumContrast(role);
      const background = getRoleColor(palette, 'background');
      if (current.locked || minimum === null) continue;

      for (const candidate of candidateHexes(role, current.hex, background.hex, minimum)) {
        const nextPalette = setRoleColor(palette, role, candidate);
        const nextAssessment = assessRolePalette(nextPalette);
        const movement = oklabDistance(current.hex, candidate);
        const nextScore = score(nextAssessment, movement);
        if (!scoreImproves(nextScore, currentScore)) continue;
        if (!best || scoreImproves(nextScore, best.score)) best = { palette: nextPalette, role, score: nextScore };
      }
    }
    if (!best) break;
    palette = best.palette;
    recordChange(best.role, 'cvd');
  }

  return buildRepairResult(original, palette, reasons);
}

/** Select one of the engine-ranked alternatives without mutating the source or losing evidence. */
export function selectRoleRepairAlternative(
  input: RolePalette,
  result: RoleRepairResult,
  role: ColorRole,
  hex: string,
): RoleRepairResult {
  const original = normalizeRolePalette(input);
  const normalizedHex = hex.toLowerCase();
  const change = result.changes.find((item) => item.role === role);
  if (!change || !change.alternatives.some((candidate) => candidate.hex === normalizedHex)) return result;

  const reasons = new Map<ColorRole, ReadonlySet<RoleRepairReason>>(
    result.changes.map((item) => [item.role, new Set(item.reasons)]),
  );
  const alternatives = new Map<ColorRole, RoleRepairAlternative[]>(
    result.changes.map((item) => [item.role, item.alternatives]),
  );
  const palette = setRoleColor(result.palette, role, normalizedHex);
  return buildRepairResult(original, palette, reasons, alternatives);
}
