// Accessibility report — one Markdown file documenting the palette's WCAG contrast
// and color-vision (CVD) behavior. The Pro "hand it to your client/team as evidence"
// deliverable. Pure + deterministic; the desktop layer just writes the string.

import { APP_NAME, APP_VERSION, SITE_URL } from '../config/branding';
import {
  MATCH_RELATIVE_COLLAPSE_RATIO,
  MATCH_REVIEW_DISTANCE,
  MATCH_SAME_DISTANCE,
  simulateHex,
  oklabDistance,
  scanConfusion,
  type ConfusionByType,
  type ConfusionPair,
  type CvdType,
  type NamedColor,
} from './cvd';
import { assessRolePalette } from './role-constraints';
import type { RolePalette } from './roles';
import type { Ramp } from './types';
import { contrastBetween, formatContrastRatio, recommendTextOnBackground } from './wcag';

export interface ExplicitTextPair {
  foreground: string;
  background: string;
}

/** 보고서가 유효하지 않은 입력에 대해 대비 통과·실패를 단정하지 않도록 검증합니다. */
export function normalizeExplicitTextPair(pair?: ExplicitTextPair): ExplicitTextPair | undefined {
  if (!pair) return undefined;
  const foreground = pair.foreground.trim().toLowerCase();
  const background = pair.background.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(foreground) || !/^#[0-9a-f]{6}$/.test(background)) return undefined;
  return { foreground, background };
}

const CVD_LABELS: { type: CvdType; label: string }[] = [
  { type: 'protan', label: 'Protan-type red–green CVD (approximate simulation)' },
  { type: 'deutan', label: 'Deutan-type red–green CVD (approximate simulation)' },
  { type: 'tritan', label: 'Tritan-type blue–yellow CVD (approximate simulation)' },
  { type: 'mono', label: 'Grayscale reference (not individual perception)' },
];

/** Smallest adjacent-step separation under a vision type — how well the ramp's
 *  own steps stay tellable apart for that viewer. */
function rampSeparation(r: Ramp, type: CvdType): { min: number; pair: string } {
  let min = Infinity;
  let pair = '';
  for (let i = 1; i < r.steps.length; i++) {
    const d = oklabDistance(simulateHex(r.steps[i - 1].hex, type), simulateHex(r.steps[i].hex, type));
    if (d < min) {
      min = d;
      pair = `${r.steps[i - 1].step}–${r.steps[i].step}`;
    }
  }
  return { min, pair };
}

const CVD_SHORT: Record<string, string> = {
  protan: 'protan-type red–green CVD simulation',
  deutan: 'deutan-type red–green CVD simulation',
  tritan: 'tritan-type blue–yellow CVD simulation',
  mono: 'grayscale reference',
};

function roleGroup(colors: NamedColor[]): string {
  return colors.map((color) => color.role).join(' · ');
}

function worstChromatic(pair: ConfusionPair): ConfusionByType | undefined {
  const candidates = pair.byType.filter((item) => item.type !== 'mono' && item.level !== 'distinct');
  return candidates.length === 0
    ? undefined
    : candidates.reduce((worst, item) => (item.dist < worst.dist ? item : worst), candidates[0]);
}

function monochromeSignal(pair: ConfusionPair): ConfusionByType | undefined {
  return pair.byType.find((item) => item.type === 'mono' && item.level !== 'distinct');
}

export function buildReport(
  r: Ramp,
  semantic: NamedColor[] = [],
  rolePalette?: RolePalette,
  includeColorVisionChecks = true,
  explicitTextPair?: ExplicitTextPair,
): string {
  const lines: string[] = [];
  const normalizedExplicitTextPair = normalizeExplicitTextPair(explicitTextPair);
  lines.push(`# ${r.name} — accessibility report`);
  lines.push('');
  lines.push(`Generated offline by ${APP_NAME} ${APP_VERSION} (${SITE_URL}). Seed \`${r.seedHex}\` · preset \`${r.preset}\`.`);
  lines.push('');
  const contrastClaims = [
    ...(includeColorVisionChecks && rolePalette
      ? ['WCAG pass/fail results appear only for the explicit role foreground/background pairs in the Color system section.']
      : []),
    ...(normalizedExplicitTextPair
      ? ['The Explicit text/background pair section reports WCAG results only for the two colors supplied there.']
      : []),
  ];
  const contrastScope = contrastClaims.length > 0
    ? contrastClaims.join(' ')
    : 'No foreground/background role-pair result is included, and no explicit text/background pair was supplied, so this report makes no WCAG pass/fail claim.';
  lines.push(includeColorVisionChecks
    ? `> A palette color alone cannot pass or fail WCAG contrast. The first table gives conditional black/white text guidance only when that color is used as a background. ${contrastScope} CVD results use an approximate Machado 2009 simulation with conservative OKLab-distance heuristics. This report supports design review; it is not an accessibility certification or clinical assessment.`
    : `> A palette color alone cannot pass or fail WCAG contrast. The first table gives conditional black/white text guidance only when that color is used as a background. ${contrastScope} Detailed color-system and color-vision checks were not included. This report supports design review; it is not an accessibility certification.`);
  lines.push('');

  lines.push('## Background-use guidance');
  lines.push('');
  lines.push('These measurements do not change the generated colors. “Recommended text” means only the higher-contrast choice between pure black and pure white when the palette color is used as a background.');
  lines.push('');
  lines.push('| Step | Background | Black text | White text | Recommended text | Recommended ratio |');
  lines.push('|------|------------|------------|------------|------------------|-------------------|');
  for (const s of r.steps) {
    const recommendation = recommendTextOnBackground(s.hex);
    lines.push(`| ${s.step} | \`${s.hex}\` | ${formatContrastRatio(s.contrastBlack)}:1 | ${formatContrastRatio(s.contrastWhite)}:1 | ${recommendation.text} | ${formatContrastRatio(recommendation.ratio)}:1 |`);
  }
  lines.push('');

  lines.push('## Explicit text/background pair');
  lines.push('');
  if (normalizedExplicitTextPair) {
    const ratio = contrastBetween(normalizedExplicitTextPair.foreground, normalizedExplicitTextPair.background);
    const level = ratio >= 7
      ? 'AAA and AA for normal text'
      : ratio >= 4.5
        ? 'AA for normal text'
        : ratio >= 3
          ? 'AA for large text only'
          : 'below AA for normal and large text';
    lines.push(`- Text: \`${normalizedExplicitTextPair.foreground}\``);
    lines.push(`- Background: \`${normalizedExplicitTextPair.background}\``);
    lines.push(`- Measured contrast: **${formatContrastRatio(ratio)}:1**`);
    lines.push(`- Result: **${level}**`);
    lines.push('');
    lines.push('Large text means at least 18 pt regular or 14 pt bold (approximately 24 px regular or 18.7 px bold).');
  } else {
    lines.push('No explicit text/background pair was supplied, so this section makes no WCAG pass/fail claim.');
  }
  lines.push('');

  if (includeColorVisionChecks) {
    lines.push('## Color-vision (CVD) review');
    lines.push('');
    lines.push(
      'How the 11-step ramp holds up for viewers with color-vision deficiencies (Machado 2009 simulation, approximate):',
    );
    lines.push('');
    for (const { type, label } of CVD_LABELS) {
      const sep = rampSeparation(r, type);
      const verdict = sep.min >= 0.03
        ? `minimum adjacent OKLab distance is ${formatContrastRatio(sep.min)} (steps ${sep.pair})`
        : `steps ${sep.pair} fall below this report's 0.030 adjacent-distance review threshold (${formatContrastRatio(sep.min)})`;
      lines.push(`- **${label}:** ${verdict}.`);
    }
    lines.push('');
    lines.push(
      '_Because this is a lightness ramp, its steps stay largely distinguishable under color blindness (lightness is preserved). The real CVD risk is between **different** colors used together (e.g. success-green vs danger-red) — check those with the two-color comparison._',
    );
    lines.push('');
  }

  if (includeColorVisionChecks && semantic.length >= 2) {
    lines.push('## Status-color confusion (CVD)');
    lines.push('');
    lines.push(
      `Product review heuristics after simulation: nearly identical below ${MATCH_SAME_DISTANCE.toFixed(3)} OKLab; review below ${MATCH_REVIEW_DISTANCE.toFixed(3)} only when separation falls to ${Math.round(MATCH_RELATIVE_COLLAPSE_RATIO * 100)}% or less of the normal-view distance. These are not WCAG pass/fail thresholds or clinical boundaries.`,
    );
    lines.push('');
    lines.push(`Status colors reviewed: ${semantic.map((s) => `${s.role} \`${s.hex}\``).join(' · ')}.`);
    lines.push('');
    const conf = scanConfusion(semantic);
    const duplicate = conf.filter((pair) => pair.kind === 'duplicate');
    const chromatic = conf
      .filter((pair) => pair.kind === 'simulation')
      .map((pair) => ({ pair, worst: worstChromatic(pair) }))
      .filter((item): item is { pair: ConfusionPair; worst: ConfusionByType } => Boolean(item.worst));
    const monochrome = conf
      .filter((pair) => pair.kind === 'simulation')
      .map((pair) => ({ pair, signal: monochromeSignal(pair) }))
      .filter((item): item is { pair: ConfusionPair; signal: ConfusionByType } => Boolean(item.signal));

    if (conf.length === 0) {
      lines.push('No pair meets this report’s conservative confusion threshold in the simulated vision types.');
    } else {
      lines.push('### Identical status-color assignments');
      lines.push('');
      if (duplicate.length === 0) {
        lines.push('No status roles share the same HEX value.');
      } else {
        lines.push('| Roles sharing one color | Color | Verdict |');
        lines.push('|-------------------------|-------|---------|');
        for (const pair of duplicate) {
          lines.push(`| ${roleGroup(pair.members)} | \`${pair.a.hex}\` | identical assignment |`);
        }
      }
      lines.push('');

      lines.push('### Chromatic CVD simulation review');
      lines.push('');
      if (chromatic.length === 0) {
        lines.push('No different-color pair meets the chromatic simulation review heuristic.');
      } else {
        lines.push('| Pair | Worst under | Verdict | Normal Δ | Simulated Δ | Remaining separation |');
        lines.push('|------|-------------|---------|----------|-------------|----------------------|');
        for (const { pair, worst } of chromatic) {
          const verdict = worst.level === 'same' ? 'nearly identical' : 'review';
          const remaining = Number.isFinite(worst.collapseRatio)
            ? `${(worst.collapseRatio * 100).toFixed(1)}%`
            : 'n/a';
          lines.push(
            `| ${roleGroup(pair.aMembers)} ↔ ${roleGroup(pair.bMembers)} | ${CVD_SHORT[worst.type] ?? worst.type} | ${verdict} | ${formatContrastRatio(pair.normalDist)} | ${formatContrastRatio(worst.dist)} | ${remaining} |`,
          );
        }
      }
      lines.push('');

      lines.push('### Grayscale advisory');
      lines.push('');
      if (monochrome.length === 0) {
        lines.push('No additional different-color pair meets the grayscale advisory heuristic.');
      } else {
        lines.push('| Pair | Verdict | Normal Δ | Grayscale Δ | Remaining separation |');
        lines.push('|------|---------|----------|-------------|----------------------|');
        for (const { pair, signal } of monochrome) {
          const remaining = Number.isFinite(signal.collapseRatio)
            ? `${(signal.collapseRatio * 100).toFixed(1)}%`
            : 'n/a';
          lines.push(
            `| ${roleGroup(pair.aMembers)} ↔ ${roleGroup(pair.bMembers)} | advisory | ${formatContrastRatio(pair.normalDist)} | ${formatContrastRatio(signal.dist)} | ${remaining} |`,
          );
        }
      }
      lines.push('');
      lines.push(
        '_Grayscale findings are advisory and separate from chromatic CVD blockers. Use icons, labels, or patterns so meaning never relies on color alone (WCAG 2.2 "Use of Color")._',
      );
      lines.push('');
      if (duplicate.length === 0 && chromatic.length === 0 && monochrome.length === 0) {
        lines.push(
          'No grouped status-color finding remains after separating identical assignments, chromatic simulations, and grayscale advice.',
        );
      }
    }
    lines.push('');
  }

  if (includeColorVisionChecks && rolePalette) {
    const assessment = assessRolePalette(rolePalette);
    lines.push('## Color system');
    lines.push('');
    lines.push('| Role | Color | Locked |');
    lines.push('|------|-------|--------|');
    for (const color of rolePalette.colors) {
      lines.push(`| ${color.role} | \`${color.hex}\` | ${color.locked ? 'yes' : 'no'} |`);
    }
    lines.push('');
    const blocking = assessment.issues.filter((issue) => issue.blocking);
    if (blocking.length === 0) {
      lines.push('No blocking issue was found by the configured WCAG and CVD-simulation checks for the selected roles.');
    } else {
      lines.push(`**${blocking.length} role-system issue(s) remain:**`);
      for (const issue of blocking) {
        if (issue.code === 'roleContrast') {
          lines.push(`- ${issue.roles.join(' / ')} contrast is ${formatContrastRatio(issue.ratio!, 2)}:1 (requires ${issue.minimum}:1).`);
        } else if (issue.confusion?.kind === 'duplicate') {
          lines.push(`- ${issue.roles.join(' / ')} share the identical color \`${issue.confusion.a.hex}\`; assign distinct colors and retain a non-color cue.`);
        } else {
          const worst = worstChromatic(issue.confusion!);
          lines.push(`- ${issue.roles.join(' / ')} may be confused under ${CVD_SHORT[worst?.type ?? ''] ?? worst?.type ?? 'color-vision simulation'}.`);
        }
      }
    }
    if (assessment.monochromeConfusion.length > 0) {
      lines.push('');
      lines.push(`Advisory: ${assessment.monochromeConfusion.length} pair(s) also converge in grayscale; use labels, icons, or patterns with color.`);
    }
    lines.push('');
  }

  lines.push('## Notes');
  if (includeColorVisionChecks) {
    lines.push(
      '- Don’t rely on color alone to convey meaning — pair semantic colors (success / danger) with icons, labels, or patterns (WCAG 2.2 "Use of Color").',
    );
    lines.push(
      `- CVD simulation uses product review heuristics (${MATCH_SAME_DISTANCE.toFixed(3)} nearly identical; below ${MATCH_REVIEW_DISTANCE.toFixed(3)} with at most ${Math.round(MATCH_RELATIVE_COLLAPSE_RATIO * 100)}% separation remaining), not WCAG pass/fail or clinical criteria.`,
    );
  }
  lines.push('- Background-use guidance is conditional: it does not claim that a palette color is accessible for every purpose or against every foreground/background color.');
  lines.push('- Validate the actual foreground, background, text size, weight, and UI role before release.');
  lines.push('');
  return lines.join('\n');
}
