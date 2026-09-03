import { describe, expect, it } from 'vitest';
import { exportPack } from '../pack';
import { buildReport } from '../report';
import { buildRamp } from '../ramp';
import { createRolePalette, setRoleColor, statusColors } from '../roles';

describe('접근성 보고서의 CVD 정책', () => {
  const ramp = buildRamp('#3b82f6', 'tailwind', { name: 'brand' });

  it('새 거리 경계와 정상 시야 대비 축소율을 제품 휴리스틱으로 설명한다', () => {
    const report = buildReport(ramp, [
      { role: 'success', hex: '#16a34a' },
      { role: 'danger', hex: '#dc2626' },
    ]);

    expect(report).toContain('nearly identical below 0.040 OKLab');
    expect(report).toContain('review below 0.080 only when separation falls to 25% or less');
    expect(report).toContain('not WCAG pass/fail thresholds or clinical boundaries');
    expect(report).toContain('Normal Δ');
    expect(report).toContain('Remaining separation');
  });

  it('색각 유형을 개인의 실제 시야로 단정하지 않고 근사 시뮬레이션으로 표시한다', () => {
    const report = buildReport(ramp);

    expect(report).toContain('Protan-type red–green CVD (approximate simulation)');
    expect(report).toContain('Deutan-type red–green CVD (approximate simulation)');
    expect(report).toContain('Tritan-type blue–yellow CVD (approximate simulation)');
    expect(report).toContain('Grayscale reference (not individual perception)');
    expect(report).not.toContain('red-blind');
    expect(report).not.toContain('green-blind');
    expect(report).not.toContain('blue-blind');
  });

  it('동일 HEX 역할을 한 행으로 묶고 다른 색과의 시뮬레이션도 그룹 단위로 표시한다', () => {
    const report = buildReport(ramp, [
      { role: 'success', hex: '#16a34a' },
      { role: 'warning', hex: '#dc2626' },
      { role: 'info', hex: '#dc2626' },
    ]);

    expect(report).toContain('### Identical status-color assignments');
    expect(report).toContain('| warning · info | `#dc2626` | identical assignment |');
    expect(report).toContain('| success ↔ warning · info |');
    expect(report.match(/\| warning · info \| `#dc2626` \| identical assignment \|/g)).toHaveLength(1);
  });

  it('흑백 전용 신호를 색채 CVD 차단 결과와 분리된 자문으로 표시한다', () => {
    const report = buildReport(ramp, [
      { role: 'success', hex: '#006d3c' },
      { role: 'warning', hex: '#9a6700' },
      { role: 'danger', hex: '#b42318' },
      { role: 'info', hex: '#175cd3' },
    ]);

    expect(report).toContain('No different-color pair meets the chromatic simulation review heuristic.');
    expect(report).toContain('### Grayscale advisory');
    expect(report).toContain('Grayscale findings are advisory and separate from chromatic CVD blockers.');
  });

  it('역할 시스템의 동일 색 차단 이슈를 특정 색각 유형으로 오인하지 않는다', () => {
    let palette = createRolePalette();
    palette = setRoleColor(palette, 'success', '#2563eb');
    palette = setRoleColor(palette, 'warning', '#2563eb');
    palette = setRoleColor(palette, 'info', '#2563eb');
    const report = buildReport(ramp, statusColors(palette), palette);

    expect(report).toContain('WCAG pass/fail results appear only for the explicit role foreground/background pairs');
    expect(report).toContain('success / warning / info share the identical color `#2563eb`');
  });

  it('고급 색상·색각 검사를 끄면 조건부 배경 안내만 포함하고 합격 판정을 생략한다', () => {
    const palette = createRolePalette();
    const report = buildReport(ramp, statusColors(palette), palette, false);

    expect(report).toContain('## Background-use guidance');
    expect(report).toContain('| Step | Background | Black text | White text | Recommended text |');
    expect(report).toContain('No foreground/background role-pair result is included');
    expect(report).toContain('makes no WCAG pass/fail claim');
    expect(report).not.toContain('steps 500–950 use white');
    expect(report).toContain('Detailed color-system and color-vision checks were not included');
    expect(report).not.toContain('## Color-vision (CVD) review');
    expect(report).not.toContain('## Status-color confusion (CVD)');
    expect(report).not.toContain('## Color system');
  });

  it('역할 조합이 없으면 팔레트 색 자체에 WCAG 합격·미달을 부여하지 않는다', () => {
    const report = buildReport(ramp);

    expect(report).toContain('No foreground/background role-pair result is included');
    expect(report).toContain('makes no WCAG pass/fail claim');
    expect(report).toContain('No explicit text/background pair was supplied');
    expect(report).not.toContain('assigned text');
  });

  it('사용자가 입력한 실제 두 색만 정규화해 대비값과 등급을 보고서와 내보내기 묶음에 기록한다', () => {
    const explicitPair = { foreground: '  #000000 ', background: ' #FFFFFF ' };
    const report = buildReport(ramp, [], undefined, false, explicitPair);

    expect(report).toContain('## Explicit text/background pair');
    expect(report).toContain('- Text: `#000000`');
    expect(report).toContain('- Background: `#ffffff`');
    expect(report).toContain('- Measured contrast: **21.000:1**');
    expect(report).toContain('- Result: **AAA and AA for normal text**');
    expect(report).toContain('18 pt regular or 14 pt bold');
    expect(report).toContain('approximately 24 px regular or 18.7 px bold');
    expect(report).toContain('reports WCAG results only for the two colors supplied there');
    expect(report).not.toContain('this report makes no WCAG pass/fail claim');

    const files = exportPack(ramp, [], undefined, false, explicitPair);
    const packedReport = files.find((file) => file.name === 'brand-accessibility.md')?.text ?? '';
    const readme = files.find((file) => file.name === 'README.md')?.text ?? '';
    expect(packedReport).toContain('- Measured contrast: **21.000:1**');
    expect(readme).toContain('the entered text/background pair result');
  });

  it('유효하지 않은 명시 조합은 통과·실패 판정을 만들지 않는다', () => {
    const report = buildReport(ramp, [], undefined, false, {
      foreground: '#fff',
      background: '#ffffff',
    });

    expect(report).toContain('No explicit text/background pair was supplied');
    expect(report).toContain('makes no WCAG pass/fail claim');
    expect(report).not.toContain('- Measured contrast:');

    const files = exportPack(ramp, [], undefined, false, {
      foreground: '#fff',
      background: '#ffffff',
    });
    const readme = files.find((file) => file.name === 'README.md')?.text ?? '';
    expect(readme).not.toContain('the entered text/background pair result');
  });

  it('manifest 파일 목록은 내보내는 모든 파일과 manifest 자체를 포함한다', () => {
    const files = exportPack(ramp);
    const manifestFile = files.find((file) => file.name === 'pcssak-manifest.json');
    expect(manifestFile?.text).toBeTruthy();

    const manifest = JSON.parse(manifestFile?.text ?? '{}') as { files?: string[] };
    const manifestFiles = manifest.files ?? [];
    expect(manifestFiles).toEqual(files.map((file) => file.name));
    expect(manifestFiles).toContain('pcssak-manifest.json');
    expect(new Set(manifestFiles).size).toBe(manifestFiles.length);
  });
});
