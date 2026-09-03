// Pure string builders that serialize a ramp into developer-ready formats. §6.
// Every export carries a short header comment; none contain URLs or telemetry.

import { APP_ID, APP_NAME, APP_VERSION, SITE_URL } from '../config/branding';
import { dtcgColorToken, type DtcgColorToken } from './dtcg';
import type { ExportFormat, Ramp } from './types';

function oklchCss(o: [number, number, number]): string {
  return `oklch(${o[0]} ${o[1]} ${o[2]})`;
}

function headerLines(ramp: Ramp): string[] {
  return [
    `${APP_NAME} — generated color ramp`,
    `generator: ${APP_NAME} ${APP_VERSION} · ${SITE_URL}`,
    `family: ${ramp.name} · seed: ${ramp.seedHex} · preset: ${ramp.preset}`,
    `All values are in the sRGB gamut. Nothing left your device.`,
  ];
}

function blockComment(ramp: Ramp): string {
  return headerLines(ramp)
    .map((l) => `/* ${l} */`)
    .join('\n');
}
function lineComment(ramp: Ramp): string {
  return headerLines(ramp)
    .map((l) => `// ${l}`)
    .join('\n');
}

export function exportRamp(ramp: Ramp, format: ExportFormat): string {
  switch (format) {
    case 'tailwind':
      return tailwindV4(ramp);
    case 'tailwind-hex':
      return tailwindV3(ramp);
    case 'css':
      return cssVars(ramp, false);
    case 'css-oklch':
      return cssVars(ramp, true);
    case 'dtcg':
      return dtcg(ramp);
    case 'scss':
      return scss(ramp);
    default:
      return '';
  }
}

function tailwindV4(r: Ramp): string {
  const lines = r.steps.map((s) => `  --color-${r.name}-${s.step}: ${oklchCss(s.oklch)};`);
  return `${blockComment(r)}\n@theme {\n${lines.join('\n')}\n}\n`;
}

function tailwindV3(r: Ramp): string {
  const body = r.steps.map((s) => `          ${s.step}: '${s.hex}',`).join('\n');
  return (
    `${blockComment(r)}\n` +
    `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n        ${r.name}: {\n` +
    `${body}\n        },\n      },\n    },\n  },\n};\n`
  );
}

function cssVars(r: Ramp, useOklch: boolean): string {
  const lines = r.steps.map(
    (s) => `  --${r.name}-${s.step}: ${useOklch ? oklchCss(s.oklch) : s.hex};`,
  );
  return `${blockComment(r)}\n:root {\n${lines.join('\n')}\n}\n`;
}

function dtcg(r: Ramp): string {
  const group: Record<string, unknown> = {
    $extensions: {
      [APP_ID]: {
        generator: APP_NAME,
        version: APP_VERSION,
        url: SITE_URL,
        seed: r.seedHex,
        preset: r.preset,
        processing: 'local',
      },
    },
  };
  for (const s of r.steps) {
    group[String(s.step)] = dtcgColorToken(s.hex) satisfies DtcgColorToken;
  }
  const obj = { [r.name]: group };
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function scss(r: Ramp): string {
  const vars = r.steps.map((s) => `$${r.name}-${s.step}: ${s.hex};`).join('\n');
  const map = r.steps.map((s) => `  "${s.step}": $${r.name}-${s.step},`).join('\n');
  return `${lineComment(r)}\n${vars}\n\n$${r.name}: (\n${map}\n);\n`;
}

/** Apply a user-defined per-step template. Tokens: {name} {step} {hex} {hexnohash} {rgb}
 *  {r} {g} {b} {oklch} {l} {c} {h}. Unknown tokens are left untouched. One line per step. */
export function exportCustom(ramp: Ramp, template: string): string {
  return ramp.steps
    .map((s) => {
      const r = parseInt(s.hex.slice(1, 3), 16);
      const g = parseInt(s.hex.slice(3, 5), 16);
      const b = parseInt(s.hex.slice(5, 7), 16);
      const map: Record<string, string | number> = {
        name: ramp.name,
        step: s.step,
        hex: s.hex,
        hexnohash: s.hex.slice(1),
        r,
        g,
        b,
        rgb: `rgb(${r}, ${g}, ${b})`,
        l: s.oklch[0],
        c: s.oklch[1],
        h: s.oklch[2],
        oklch: `oklch(${s.oklch[0]} ${s.oklch[1]} ${s.oklch[2]})`,
      };
      return template.replace(/\{(\w+)\}/g, (_m, k: string) => (k in map ? String(map[k]) : `{${k}}`));
    })
    .join('\n');
}
