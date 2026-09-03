import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../config/branding';
import { createRolePalette, exportRoleTokens } from '../index';

describe('role token exports', () => {
  it('emits every role and an on-color in CSS', () => {
    const css = exportRoleTokens(createRolePalette(), 'css');
    expect(css).toContain('--color-primary: #3b82f6;');
    expect(css).toContain('--color-background: #ffffff;');
    expect(css).toContain('--color-on-primary: #000000;');
    expect(css).toContain('--color-on-danger: #ffffff;');
  });

  it('supports framework and DTCG handoff formats', () => {
    const palette = createRolePalette();
    expect(exportRoleTokens(palette, 'tailwind')).toContain('@theme');
    expect(exportRoleTokens(palette, 'tailwind-hex')).toContain('semanticColors');
    expect(exportRoleTokens(palette, 'scss')).toContain('$color-success');
    const dtcg = JSON.parse(exportRoleTokens(palette, 'dtcg'));
    expect(dtcg.semantic.$extensions['com.pcssak.palette']).toMatchObject({
      generator: APP_NAME,
      processing: 'local',
    });
    expect(dtcg.semantic.primary.$value).toEqual({
      colorSpace: 'srgb',
      components: [0.231373, 0.509804, 0.964706],
      alpha: 1,
      hex: '#3b82f6',
    });
    expect(dtcg.semantic['on-primary'].$value.hex).toBe('#000000');
  });
});
