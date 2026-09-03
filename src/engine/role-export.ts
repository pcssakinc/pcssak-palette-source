import { APP_ID, APP_NAME, APP_VERSION, SITE_URL } from '../config/branding';
import { contrastBetween } from './wcag';
import { dtcgColorToken } from './dtcg';
import { normalizeRolePalette, type ColorRole, type RolePalette } from './roles';
import type { ExportFormat } from './types';

export type RoleExportFormat = Exclude<ExportFormat, 'custom'>;

interface TokenEntry {
  name: string;
  value: string;
}

const blockHeader = `/* ${APP_NAME} ${APP_VERSION} · ${SITE_URL} */`;
const lineHeader = `// ${APP_NAME} ${APP_VERSION} · ${SITE_URL}`;

function readableOn(hex: string): string {
  return contrastBetween('#ffffff', hex) >= contrastBetween('#000000', hex) ? '#ffffff' : '#000000';
}

function jsName(name: string): string {
  return name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function tokens(palette: RolePalette): TokenEntry[] {
  const colors = normalizeRolePalette(palette).colors;
  const entries: TokenEntry[] = colors.map((color) => ({ name: color.role, value: color.hex }));
  for (const color of colors) {
    if (color.role === 'background' || color.role === 'text') continue;
    entries.push({ name: `on-${color.role}`, value: readableOn(color.hex) });
  }
  return entries;
}

/** Export the role system alongside the hue ramp for project-ready handoff. */
export function exportRoleTokens(palette: RolePalette, format: RoleExportFormat): string {
  const entries = tokens(palette);
  switch (format) {
    case 'tailwind':
      return `${blockHeader}\n@theme {\n${entries.map((entry) => `  --color-${entry.name}: ${entry.value};`).join('\n')}\n}`;
    case 'tailwind-hex':
      return `${lineHeader}\nexport const semanticColors = {\n${entries.map((entry) => `  ${jsName(entry.name)}: '${entry.value}',`).join('\n')}\n};`;
    case 'css':
    case 'css-oklch':
      return `${blockHeader}\n:root {\n${entries.map((entry) => `  --color-${entry.name}: ${entry.value};`).join('\n')}\n}`;
    case 'scss':
      return `${lineHeader}\n${entries.map((entry) => `$color-${entry.name}: ${entry.value};`).join('\n')}`;
    case 'dtcg':
      return JSON.stringify(
        {
          semantic: {
            $extensions: {
              [APP_ID]: {
                generator: APP_NAME,
                version: APP_VERSION,
                url: SITE_URL,
                processing: 'local',
              },
            },
            ...Object.fromEntries(entries.map((entry) => [entry.name, dtcgColorToken(entry.value)])),
          },
        },
        null,
        2,
      );
  }
}

/** The role color names used by exports and accessibility reports. */
export const EXPORTED_ROLE_NAMES: readonly ColorRole[] = ['primary', 'background', 'text', 'success', 'warning', 'danger', 'info'];
