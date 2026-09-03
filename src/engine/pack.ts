// Export Pack — the whole palette as a ready-to-drop folder of files (every dev
// format + a README + the .ase swatch). The Pro "hand it to your team" feature.
// Pure + deterministic; the desktop layer just writes each file to disk.

import { APP_ID, APP_NAME, APP_VERSION, SITE_URL } from '../config/branding';
import { exportRamp } from './exporters';
import { exportAse } from './ase';
import { exportRoleTokens } from './role-export';
import { buildReport, normalizeExplicitTextPair, type ExplicitTextPair } from './report';
import type { NamedColor } from './cvd';
import type { RolePalette } from './roles';
import type { Ramp } from './types';
import { formatContrastRatio, recommendTextOnBackground } from './wcag';

export interface PackFile {
  name: string;
  text?: string; // text file contents
  bytes?: Uint8Array; // binary file contents (.ase)
}

function readme(
  r: Ramp,
  hasRoleTokens: boolean,
  includeAdvancedChecks: boolean,
  hasExplicitTextPair: boolean,
): string {
  const accessibilityContents = [
    'conditional background-use guidance',
    ...(hasExplicitTextPair ? ['the entered text/background pair result'] : []),
    ...(hasRoleTokens ? ['explicit role-pair WCAG results'] : []),
    ...(includeAdvancedChecks ? ['color-vision review'] : []),
  ].join(' + ');
  return [
    `# ${r.name} — ${APP_NAME} export`,
    ``,
    `Seed: ${r.seedHex} · Preset: ${r.preset}`,
    `Generated offline by ${APP_NAME} ${APP_VERSION}. ${SITE_URL}`,
    hasRoleTokens
      ? `Every color is within the sRGB gamut. WCAG pass/fail results apply only to the explicit role foreground/background pairs documented in the accessibility report.`
      : `Every color is within the sRGB gamut. A palette color alone has no WCAG pass/fail result; use the conditional background guidance or test an actual foreground/background pair.`,
    ``,
    `## Files`,
    ...(hasRoleTokens
      ? ['- semantic-colors.css - project role colors and on-color tokens', '- semantic-colors.tokens.json - DTCG tokens for Figma Variables and project role colors']
      : []),
    `- ${r.name}-tailwind-v4.css — Tailwind v4 \`@theme\` (OKLCH)`,
    `- ${r.name}-tailwind-v3.config.js — Tailwind v3 \`theme.extend.colors\` (hex)`,
    `- ${r.name}-variables.css — CSS custom properties (hex)`,
    `- ${r.name}-variables-oklch.css — CSS custom properties (OKLCH)`,
    `- _${r.name}.scss — SCSS variables + map`,
    `- ${r.name}.tokens.json — DTCG 2025.10 color tokens for Figma Variables and token tools`,
    `- ${r.name}.ase — design-app-compatible swatch file`,
    `- ${r.name}-accessibility.md — ${accessibilityContents}`,
    `- pcssak-manifest.json — generator, palette source, and included-file record`,
    ``,
    `## Steps`,
    r.steps.map((s) => {
      const recommendation = recommendTextOnBackground(s.hex);
      return `- ${s.step}: ${s.hex} — if used as a background, ${recommendation.text} text has the higher black/white contrast (${formatContrastRatio(recommendation.ratio)}:1)`;
    }).join('\n'),
    ``,
  ].join('\n');
}

/** 현재 화면에서 선택한 검사 범위와 같은 범위로 전체 내보내기 묶음을 만듭니다. */
export function exportPack(
  r: Ramp,
  semantic: NamedColor[] = [],
  rolePalette?: RolePalette,
  includeAdvancedChecks = true,
  explicitTextPair?: ExplicitTextPair,
): PackFile[] {
  const includedRolePalette = includeAdvancedChecks ? rolePalette : undefined;
  const includedSemantic = includeAdvancedChecks ? semantic : [];
  const files: PackFile[] = [
    { name: `${r.name}-tailwind-v4.css`, text: exportRamp(r, 'tailwind') },
    { name: `${r.name}-tailwind-v3.config.js`, text: exportRamp(r, 'tailwind-hex') },
    { name: `${r.name}-variables.css`, text: exportRamp(r, 'css') },
    { name: `${r.name}-variables-oklch.css`, text: exportRamp(r, 'css-oklch') },
    { name: `_${r.name}.scss`, text: exportRamp(r, 'scss') },
    { name: `${r.name}.tokens.json`, text: exportRamp(r, 'dtcg') },
    { name: `${r.name}.ase`, bytes: exportAse(r) },
    {
      name: `${r.name}-accessibility.md`,
      text: buildReport(
        r,
        includedSemantic,
        includedRolePalette,
        includeAdvancedChecks,
        explicitTextPair,
      ),
    },
    {
      name: 'README.md',
      text: readme(
        r,
        Boolean(includedRolePalette),
        includeAdvancedChecks,
        Boolean(normalizeExplicitTextPair(explicitTextPair)),
      ),
    },
  ];
  if (includedRolePalette) {
    files.push(
      { name: 'semantic-colors.css', text: exportRoleTokens(includedRolePalette, 'css') },
      { name: 'semantic-colors.tokens.json', text: exportRoleTokens(includedRolePalette, 'dtcg') },
    );
  }
  const manifestName = 'pcssak-manifest.json';
  // files는 콘텐츠 해시가 아닌 파일명 목록입니다. 따라서 manifest 자체를 목록에 넣어도
  // manifest 내용이 다시 바뀌는 순환 해시 의존성은 생기지 않습니다.
  const includedFileNames = [...files.map((file) => file.name), manifestName];
  files.push({
    name: manifestName,
    text: `${JSON.stringify({
      $schema: `${SITE_URL}/schemas/export-manifest-v1.json`,
      id: `${APP_ID}.export-manifest.v1`,
      generator: {
        name: APP_NAME,
        version: APP_VERSION,
        url: SITE_URL,
      },
      palette: {
        name: r.name,
        seed: r.seedHex,
        preset: r.preset,
      },
      processing: 'local',
      files: includedFileNames,
    }, null, 2)}\n`,
  });
  return files;
}
