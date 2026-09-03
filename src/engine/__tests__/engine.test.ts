import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_VERSION } from '../../config/branding';
import { buildRamp, createRolePalette, exportRamp, exportCustom, exportAse, exportPack, buildReport, buildDoctor, simulateHex, compareUnder, scanConfusion, buildFromSwatches, recommendTextOnBackground, sanitizeTokenName, STEPS } from '../index';
import {
  contrastBetween,
  contrastOklchVs,
  contrastRatio,
  formatContrastRatio,
  relLuminance,
  solveLForContrast,
  solveLForHexContrast,
} from '../wcag';
import { oklchToHex, oklchToRgb, parseToOklch } from '../color';
import type { ExportFormat, PresetName } from '../types';

const PRESETS: PresetName[] = ['tailwind', 'radix', 'leonardo'];
const HEX = /^#[0-9a-f]{6}$/i;

describe('ramp generation', () => {
  it('produces exactly the 50–950 steps', () => {
    const r = buildRamp('#3b82f6', 'tailwind');
    expect(r.steps.map((s) => s.step)).toEqual([...STEPS]);
  });

  it('배경 사용 안내는 원본 색을 바꾸지 않고 검정·흰색 중 실제 대비가 높은 글자색을 고른다', () => {
    const ramp = buildRamp('#3b82f6', 'tailwind');
    const step500 = ramp.steps.find((step) => step.step === 500)!;
    const originalHex = step500.hex;
    const recommendation = recommendTextOnBackground(step500.hex);

    expect(recommendation.text).toBe('black');
    expect(recommendation.ratio).toBe(step500.contrastBlack);
    expect(recommendation.ratio).toBeGreaterThan(step500.contrastWhite);
    expect(step500.hex).toBe(originalHex);
  });

  it('is strictly monotonic in lightness for every preset', () => {
    for (const preset of PRESETS) {
      const r = buildRamp('#3b82f6', preset);
      for (let i = 1; i < r.steps.length; i++) {
        expect(r.steps[i].oklch[0]).toBeLessThan(r.steps[i - 1].oklch[0]);
      }
    }
  });

  it('emits only in-gamut hex colors', () => {
    for (const seed of ['#3b82f6', '#e11d48', '#10b981', '#f59e0b', '#8b5cf6']) {
      for (const preset of PRESETS) {
        for (const s of buildRamp(seed, preset).steps) expect(s.hex).toMatch(HEX);
      }
    }
  });

  it('is deterministic (same input ⇒ identical output)', () => {
    const a = JSON.stringify(buildRamp('#10b981', 'radix', { enforceAA: true }));
    const b = JSON.stringify(buildRamp('#10b981', 'radix', { enforceAA: true }));
    expect(a).toBe(b);
  });

  it('v0.1.3의 현재 AA 보정 선택을 같은 HEX와 CSS로 재현한다', () => {
    const legacy = buildRamp('#3b82f6', 'tailwind', { name: 'brand', enforceAA: true });

    expect(legacy.steps.map((step) => step.hex)).toEqual([
      '#f2f7ff',
      '#e3eeff',
      '#c9deff',
      '#a7c9ff',
      '#6ca4ff',
      '#3a74d5',
      '#386ec9',
      '#2858a6',
      '#1d4380',
      '#15315f',
      '#081c3c',
    ]);
    const css = exportRamp(legacy, 'css');
    expect(css).toContain('--brand-500: #3a74d5;');
    expect(css).toContain('--brand-950: #081c3c;');
    expect(buildRamp('#3b82f6', 'tailwind', { enforceAA: false })
      .steps.find((step) => step.step === 500)?.hex).toBe('#4b87e8');
  });

  it('handles a grayscale seed as a near-neutral ramp without throwing', () => {
    const r = buildRamp('#808080', 'tailwind');
    expect(r.steps.every((s) => s.oklch[1] < 0.05)).toBe(true);
  });

  it('rejects an invalid color', () => {
    expect(() => buildRamp('not-a-color', 'tailwind')).toThrow();
  });

  it('enforceAA never reduces the count of AA-passing steps', () => {
    for (const preset of ['tailwind', 'radix'] as const) {
      const plain = buildRamp('#3b82f6', preset).steps.filter((s) => s.aa).length;
      const forced = buildRamp('#3b82f6', preset, { enforceAA: true }).steps.filter((s) => s.aa).length;
      expect(forced).toBeGreaterThanOrEqual(plain);
    }
  });

  it('enforceAA keeps a 4.501 safety margin in final HEX and exported OKLCH', () => {
    for (const seed of ['#3b82f6', '#e11d48', '#10b981', '#f59e0b', '#8b5cf6', '#808080']) {
      for (const preset of PRESETS) {
        const ramp = buildRamp(seed, preset, { enforceAA: true });
        for (const step of ramp.steps) {
          const text = step.step >= 500 ? '#ffffff' : '#000000';
          expect(contrastBetween(step.hex, text)).toBeGreaterThanOrEqual(4.501);
          expect(contrastOklchVs(
            step.oklch[0],
            step.oklch[1],
            step.oklch[2],
            step.step >= 500 ? 'white' : 'black',
          )).toBeGreaterThanOrEqual(4.501);
          expect(step.aa).toBe(true);
        }
        for (let i = 1; i < ramp.steps.length; i++) {
          expect(ramp.steps[i].oklch[0]).toBeLessThan(ramp.steps[i - 1].oklch[0]);
        }
      }
    }
  });

  it('derives stored contrast values and flags from the final exported HEX', () => {
    const ramp = buildRamp('#3b82f6', 'tailwind');
    for (const step of ramp.steps) {
      const white = contrastBetween(step.hex, '#ffffff');
      const black = contrastBetween(step.hex, '#000000');
      const assigned = step.step >= 500 ? white : black;
      expect(oklchToHex(step.oklch[0], step.oklch[1], step.oklch[2])).toBe(step.hex);
      expect(step.contrastWhite).toBeCloseTo(white, 4);
      expect(step.contrastBlack).toBeCloseTo(black, 4);
      expect(step.bestTextRatio).toBeCloseTo(assigned, 4);
      expect(step.aa).toBe(assigned >= 4.5);
      expect(step.aaLarge).toBe(assigned >= 3);
      expect(step.aaa).toBe(assigned >= 7);
    }
  });

  it('keeps a known AA boundary color passing in both HEX and exported OKLCH', () => {
    const step500 = buildRamp('#4acb11', 'tailwind', { enforceAA: true })
      .steps.find((step) => step.step === 500)!;
    expect(contrastBetween(step500.hex, '#ffffff')).toBeGreaterThanOrEqual(4.501);
    expect(contrastOklchVs(
      step500.oklch[0],
      step500.oklch[1],
      step500.oklch[2],
      'white',
    )).toBeGreaterThanOrEqual(4.501);
  });

  it('leonardo preset roughly honors its target contrast ratios vs white', () => {
    const r = buildRamp('#3b82f6', 'leonardo');
    const s600 = r.steps.find((s) => s.step === 600)!;
    // 600 targets 4.5:1 vs white; allow slack for gamut mapping + monotonicity.
    expect(s600.contrastWhite).toBeGreaterThan(3.8);
  });
});

describe('WCAG math', () => {
  it('uses the current sRGB linearization boundary at 0.04045', () => {
    const boundary = 0.04045;
    const above = 0.0404501;
    expect(relLuminance({ r: boundary, g: boundary, b: boundary })).toBeCloseTo(boundary / 12.92, 12);
    expect(relLuminance({ r: above, g: above, b: above }))
      .toBeCloseTo(((above + 0.055) / 1.055) ** 2.4, 12);
  });

  it('white vs black contrast is 21:1', () => {
    expect(contrastRatio(relLuminance({ r: 1, g: 1, b: 1 }), relLuminance({ r: 0, g: 0, b: 0 }))).toBeCloseTo(21, 1);
  });

  it('matches the known ~4.5:1 of #767676 on white', () => {
    const o = parseToOklch('#767676')!;
    const ratio = contrastRatio(relLuminance(oklchToRgb(o.l, o.c, o.h)), relLuminance({ r: 1, g: 1, b: 1 }));
    expect(ratio).toBeGreaterThan(4.4);
    expect(ratio).toBeLessThan(4.7);
  });

  it('solveLForContrast reaches ~4.5 vs white for a mid tone', () => {
    const l = solveLForContrast(0.05, 260, 'white', 4.5, 0.7);
    expect(contrastOklchVs(l, 0.05, 260, 'white')).toBeGreaterThanOrEqual(4.45);
  });

  it('contrastBetween handles arbitrary hex pairs', () => {
    expect(contrastBetween('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastBetween('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
    expect(contrastBetween('#767676', '#ffffff')).toBeGreaterThan(4.4);
  });

  it('treats #4a72d6 with white normal text as below AA', () => {
    expect(contrastBetween('#4a72d6', '#ffffff')).toBeLessThan(4.5);
  });

  it('미달 대비를 합격 경계값으로 반올림하지 않는다', () => {
    expect(formatContrastRatio(4.499888, 3)).toBe('4.499');
    expect(formatContrastRatio(4.5, 3)).toBe('4.500');
    expect(formatContrastRatio(21, 2)).toBe('21.00');
  });

  it('finds a deterministic final-HEX boundary that actually passes 4.5', () => {
    const first = solveLForHexContrast(0.05, 260, 'white', 4.5, 0.7);
    const second = solveLForHexContrast(0.05, 260, 'white', 4.5, 0.7);
    expect(first).toBe(second);
    expect(contrastBetween(oklchToHex(first, 0.05, 260), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('finds the final-HEX boundary in the black-text direction', () => {
    const solved = solveLForHexContrast(0.05, 260, 'black', 4.5, 0.35);
    expect(contrastBetween(oklchToHex(solved, 0.05, 260), '#000000')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('exporters', () => {
  const formats: ExportFormat[] = ['tailwind', 'tailwind-hex', 'css', 'css-oklch', 'dtcg', 'scss'];

  it('emits every format as a non-trivial string', () => {
    const r = buildRamp('#3b82f6', 'tailwind');
    for (const f of formats) expect(exportRamp(r, f).length).toBeGreaterThan(30);
  });

  it('produces DTCG 2025.10 sRGB color objects', () => {
    const r = buildRamp('#3b82f6', 'tailwind');
    const parsed = JSON.parse(exportRamp(r, 'dtcg'));
    const token = parsed.brand['500'];
    expect(parsed.brand.$extensions['com.pcssak.palette']).toMatchObject({
      generator: APP_NAME,
      processing: 'local',
      seed: '#3b82f6',
    });
    expect(token.$type).toBe('color');
    expect(token.$value).toEqual({
      colorSpace: 'srgb',
      components: token.$value.components,
      alpha: 1,
      hex: r.steps.find((step) => step.step === 500)?.hex,
    });
    expect(token.$value.components).toHaveLength(3);
    expect(token.$value.components.every((value: number) => value >= 0 && value <= 1)).toBe(true);
  });

  it('exportCustom fills tokens per step and leaves unknown tokens', () => {
    const r = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const out = exportCustom(r, '--{name}-{step}: {hex};');
    expect(out.split('\n')).toHaveLength(11);
    expect(out).toContain('--brand-500: #');
    expect(exportCustom(r, '{step}={rgb}')).toMatch(/^50=rgb\(\d+, \d+, \d+\)/);
    expect(exportCustom(r, '{unknown}')).toContain('{unknown}');
  });
});

describe('cvd simulation', () => {
  it('is deterministic, offline, and returns valid hex', () => {
    expect(simulateHex('#3b82f6', 'deutan')).toMatch(HEX);
    expect(simulateHex('#3b82f6', 'protan')).toBe(simulateHex('#3b82f6', 'protan'));
  });
  it('normal is identity; grayscale is neutral (r=g=b)', () => {
    expect(simulateHex('#3b82f6', 'normal')).toBe('#3b82f6');
    const g = simulateHex('#3b82f6', 'mono');
    expect(g.slice(1, 3)).toBe(g.slice(3, 5));
    expect(g.slice(3, 5)).toBe(g.slice(5, 7));
  });
  it('protan/deutan actually alter a pure red', () => {
    expect(simulateHex('#ff0000', 'protan')).not.toBe('#ff0000');
    expect(simulateHex('#ff0000', 'deutan')).not.toBe('#ff0000');
  });
});

describe('cvd two-color match', () => {
  it('red vs green: distinct normally, collapses under deutan', () => {
    const normal = compareUnder('#16a34a', '#dc2626', 'normal');
    const deutan = compareUnder('#16a34a', '#dc2626', 'deutan');
    expect(normal.level).toBe('distinct');
    expect(deutan.dist).toBeLessThan(normal.dist);
  });
  it('identical colors read as "same" under every vision type', () => {
    for (const v of ['normal', 'protan', 'deutan', 'tritan', 'mono'] as const) {
      expect(compareUnder('#3b82f6', '#3b82f6', v).level).toBe('same');
    }
  });
});

describe('semantic confusion scan', () => {
  it('flags green success vs red danger, worst under a red-green deficiency', () => {
    const pairs = scanConfusion([
      { role: 'success', hex: '#16a34a' },
      { role: 'danger', hex: '#dc2626' },
    ]);
    expect(pairs.length).toBe(1);
    expect(['protan', 'deutan']).toContain(pairs[0].worst.type); // red-green collapse
    expect(pairs[0].byType).toHaveLength(4); // protan/deutan/tritan/mono all recorded
  });
  it('leaves a high-contrast light/dark pair unflagged (safe under every deficiency)', () => {
    const pairs = scanConfusion([
      { role: 'ink', hex: '#111111' },
      { role: 'paper', hex: '#eeeeee' },
    ]);
    expect(pairs).toEqual([]);
  });
  it('sorts most-confusable first and ignores invalid hex', () => {
    const pairs = scanConfusion([
      { role: 'a', hex: '#16a34a' },
      { role: 'b', hex: '#dc2626' },
      { role: 'bad', hex: 'not-a-hex' },
    ]);
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].worst.dist).toBeLessThanOrEqual(pairs[i].worst.dist);
    }
    expect(pairs.every((p) => p.a.role !== 'bad' && p.b.role !== 'bad')).toBe(true);
  });
});

describe('palette doctor', () => {
  it('returns objective findings sorted worst-first, all with a severity', () => {
    const ramp = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const findings = buildDoctor(ramp, [
      { role: 'success', hex: '#16a34a' },
      { role: 'danger', hex: '#dc2626' },
    ]);
    expect(findings.length).toBeGreaterThan(0);
    const rank = { risk: 0, warn: 1, good: 2 } as const;
    for (let i = 1; i < findings.length; i++) {
      expect(rank[findings[i - 1].severity]).toBeLessThanOrEqual(rank[findings[i].severity]);
    }
    for (const f of findings) expect(['good', 'warn', 'risk']).toContain(f.severity);
  });
  it('임의 고정 글자색 실패나 자동 보정을 권하지 않고 용도가 정의된 예시 조합만 진단한다', () => {
    const ramp = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const findings = buildDoctor(ramp);

    expect(findings).toEqual([]);
  });
  it('uses warning for conservative CVD separation and risk for a chromatic near-collapse', () => {
    const ramp = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const warning = buildDoctor(ramp, [
      { role: 'success', hex: '#16a34a' },
      { role: 'danger', hex: '#dc2626' },
    ]).find((f) => f.code === 'cvdSemanticRisk');
    expect(warning?.severity).toBe('warn');

    const risk = buildDoctor(ramp, [
      { role: 'success', hex: '#16a34a' },
      { role: 'danger', hex: '#16a34b' },
    ]).find((f) => f.code === 'cvdSemanticRisk');
    expect(risk?.severity).toBe('risk');
  });
});

describe('ase export', () => {
  it('produces a valid ASEF binary with one colour block per step', () => {
    const r = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const bytes = exportAse(r);
    expect(bytes).toBeInstanceOf(Uint8Array);
    // signature "ASEF"
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('ASEF');
    // version 1.0
    expect([bytes[4], bytes[5], bytes[6], bytes[7]]).toEqual([0, 1, 0, 0]);
    // block count (uint32 BE) == number of steps
    const count = (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11];
    expect(count).toBe(r.steps.length);
    // first block is a colour entry (type 0x0001)
    expect([bytes[12], bytes[13]]).toEqual([0, 1]);
    expect(bytes.length).toBeGreaterThan(100);
  });
});

describe('export pack', () => {
  it('bundles every dev format, role tokens, README, and .ase', () => {
    const r = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const files = exportPack(r, [], createRolePalette());
    expect(files).toHaveLength(12);
    const names = files.map((f) => f.name);
    expect(names).toContain('brand-tailwind-v4.css');
    expect(names).toContain('brand-accessibility.md');
    expect(names).toContain('brand-variables-oklch.css');
    expect(names).toContain('brand.tokens.json');
    expect(names).toContain('brand.ase');
    expect(names).toContain('semantic-colors.css');
    expect(names).toContain('semantic-colors.tokens.json');
    expect(names).toContain('README.md');
    expect(names).toContain('pcssak-manifest.json');
    expect(files.find((f) => f.name === 'brand.ase')?.bytes).toBeInstanceOf(Uint8Array);
    expect(files.find((f) => f.name === 'README.md')?.text).toContain('brand');
    expect(files.find((f) => f.name === 'README.md')?.text).toContain('semantic-colors.css');
    expect(files.find((f) => f.name === 'semantic-colors.css')?.text).toContain('--color-primary');
    const manifest = JSON.parse(files.find((f) => f.name === 'pcssak-manifest.json')?.text ?? '{}');
    expect(manifest.generator.name).toBe(APP_NAME);
    expect(manifest.palette).toMatchObject({ name: 'brand', seed: '#3b82f6', preset: 'tailwind' });
    expect(manifest.files).toContain('brand.ase');
    expect(manifest.files).toContain('pcssak-manifest.json');
    expect(new Set(manifest.files)).toEqual(new Set(names));
    for (const f of files.filter((f) => f.text)) expect(f.text!.length).toBeGreaterThan(20);
  });

  it('고급 검사를 끄면 검토하지 않은 역할 토큰과 CVD 보고서를 포함하지 않는다', () => {
    const r = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const files = exportPack(
      r,
      [
        { role: 'success', hex: '#16a34a' },
        { role: 'danger', hex: '#dc2626' },
      ],
      createRolePalette(),
      false,
    );
    const names = files.map((file) => file.name);
    const report = files.find((file) => file.name === 'brand-accessibility.md')?.text ?? '';
    const readme = files.find((file) => file.name === 'README.md')?.text ?? '';

    expect(names).not.toContain('semantic-colors.css');
    expect(names).not.toContain('semantic-colors.tokens.json');
    expect(report).toContain('Detailed color-system and color-vision checks were not included');
    expect(report).not.toContain('## Status-color confusion (CVD)');
    expect(report).not.toContain('## Color system');
    expect(readme).toContain('conditional background-use guidance');
    expect(readme).toContain('has no WCAG pass/fail result');
    expect(readme).not.toContain('defined WCAG foreground/background pairs');
    expect(readme).not.toContain('assigned text colors');
    expect(readme).not.toContain('semantic-colors.css');
  });
});

describe('accessibility report', () => {
  it('renders a Markdown report with WCAG + CVD sections and every step', () => {
    const r = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const md = buildReport(r);
    expect(md).toContain('# brand — accessibility report');
    expect(md).toContain(`${APP_NAME} ${APP_VERSION}`);
    expect(md).toContain('## Background-use guidance');
    expect(md).toContain('| Step | Background | Black text | White text | Recommended text |');
    expect(md).not.toContain('steps 500–950 use white');
    expect(md).toContain('## Color-vision (CVD) review');
    expect(md).toContain('Protan-type red–green CVD (approximate simulation)');
    for (const s of r.steps) expect(md).toContain(s.hex);
  });
  it('임의 사용 조합 판정은 넣지 않고 상태 색이 주어질 때만 혼동 표를 추가한다', () => {
    const r = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });
    const plain = buildReport(r);
    expect(plain).not.toContain('## Usage check');
    expect(plain).not.toContain('## Status-color confusion');
    const withSemantic = buildReport(r, [
      { role: 'success', hex: '#16a34a' },
      { role: 'danger', hex: '#dc2626' },
    ]);
    expect(withSemantic).toContain('## Status-color confusion (CVD)');
    expect(withSemantic).toContain('success ↔ danger');
    expect(withSemantic).toContain('Use of Color');
    expect(withSemantic).toContain('not an accessibility certification or clinical assessment');
    expect(withSemantic).not.toContain('every status color stays distinguishable');
    // pack passes semantic through to the bundled report
    const packed = exportPack(r, [
      { role: 'success', hex: '#16a34a' },
      { role: 'danger', hex: '#dc2626' },
    ], createRolePalette());
    expect(packed.find((f) => f.name === 'brand-accessibility.md')?.text).toContain('## Status-color confusion (CVD)');
    expect(packed.find((f) => f.name === 'brand-accessibility.md')?.text).toContain('## Color system');
  });
});

describe('swatch pipeline', () => {
  it('refines raw swatches and builds a ramp from the dominant color', () => {
    const { seed, ramp } = buildFromSwatches([
      { hex: '#3b82f6', weight: 0.5 },
      { hex: '#3c83f7', weight: 0.2 }, // near-duplicate → merged
      { hex: '#111111', weight: 0.3 },
    ]);
    expect(seed).not.toBeNull();
    expect(ramp?.steps.length).toBe(11);
  });
});

describe('sanitizeTokenName', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(sanitizeTokenName('My Brand')).toBe('my-brand');
  });
  it('strips unsafe chars and collapses/trims hyphens', () => {
    expect(sanitizeTokenName('  Acme!!  Corp __ ')).toBe('acme-corp');
  });
  it('falls back to "brand" for empty or symbol-only input', () => {
    expect(sanitizeTokenName('')).toBe('brand');
    expect(sanitizeTokenName('   ')).toBe('brand');
    expect(sanitizeTokenName('!!!')).toBe('brand');
    expect(sanitizeTokenName(undefined)).toBe('brand');
  });
  it('never starts with a digit', () => {
    expect(sanitizeTokenName('7up')).toBe('c-7up');
  });
});

describe('custom palette name in exports', () => {
  it('uses the sanitized name as the token prefix across all formats', () => {
    const r = buildRamp('#3b82f6', 'tailwind', { name: 'My Brand!' });
    expect(r.name).toBe('my-brand');
    expect(exportRamp(r, 'css')).toContain('--my-brand-500');
    expect(exportRamp(r, 'scss')).toContain('$my-brand-500');
    expect(exportRamp(r, 'tailwind')).toContain('--color-my-brand-500');
    expect(JSON.parse(exportRamp(r, 'dtcg'))['my-brand']).toBeTruthy();
  });
  it('defaults to "brand" when no name is given', () => {
    expect(buildRamp('#3b82f6', 'tailwind').name).toBe('brand');
  });
});
