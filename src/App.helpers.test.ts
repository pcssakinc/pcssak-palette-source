import { describe, expect, it } from 'vitest';
import {
  buildRamp,
  contrastBetween,
  createRolePalette,
  setRoleColor,
  setRoleLocked,
  simulateHex,
} from './engine';
import {
  buildActualPairVisionPreviews,
  buildFixedRoleContrastRecommendations,
  buildPairContrastCandidates,
  conservativeContrastValue,
  contrastSafeBadgeColors,
  decodeLegacyEnforceAA,
  deriveRoleWorkspaceMeta,
  evaluateActualPair,
  importPairIntoRolePalette,
  normalizeHex6,
  readableTextOn,
} from './app-helpers';

describe('앱 대비 표시 헬퍼', () => {
  it('AA 경계 바로 아래 값을 통과 값으로 올려 표시하지 않는다', () => {
    expect(conservativeContrastValue(4.499_999)).toBe(4.4999);
    expect(conservativeContrastValue(4.5)).toBe(4.5);
  });

  it('색상 견본의 UI 글자는 흰색과 검정 중 실제 대비가 높은 색을 고른다', () => {
    expect(readableTextOn('#ffffff')).toBe('#000000');
    expect(readableTextOn('#000000')).toBe('#ffffff');
    expect(readableTextOn('#777777')).toBe('#000000');
  });

  it('붙여 넣은 6자리 HEX의 공백과 대문자를 일관되게 정규화한다', () => {
    expect(normalizeHex6('  #77AAff  ')).toBe('#77aaff');
    expect(normalizeHex6('#fff')).toBeNull();
    expect(normalizeHex6('')).toBeNull();
  });

  describe('고급 UI 역할 작업 메타', () => {
    it('기본 역할색과 잠금 해제 상태는 시작 전으로 판정한다', () => {
      expect(deriveRoleWorkspaceMeta(undefined, createRolePalette())).toEqual({
        version: 1,
        status: 'not-started',
        source: null,
      });
    });

    it('역할색 변경이나 잠금 하나만 있어도 기존 작업으로 판정한다', () => {
      const changed = setRoleColor(createRolePalette(), 'success', '#15803d');
      const locked = setRoleLocked(createRolePalette(), 'text', true);

      for (const palette of [changed, locked]) {
        expect(deriveRoleWorkspaceMeta(undefined, palette)).toEqual({
          version: 1,
          status: 'legacy-unconfirmed',
          source: 'legacy',
        });
      }
    });

    it('유효한 활성 메타는 기본 역할색에서도 유지하고 손상된 메타는 팔레트에서 다시 판정한다', () => {
      expect(deriveRoleWorkspaceMeta({
        version: 1,
        status: 'active',
        source: 'example',
      }, createRolePalette())).toEqual({
        version: 1,
        status: 'active',
        source: 'example',
      });
      expect(deriveRoleWorkspaceMeta({
        version: 1,
        status: 'active',
        source: null,
      }, createRolePalette())).toEqual({
        version: 1,
        status: 'not-started',
        source: null,
      });
    });

    it('변경된 팔레트는 잘못 저장된 시작 전 메타보다 데이터 보존을 우선한다', () => {
      const changed = setRoleColor(createRolePalette(), 'warning', '#d97706');
      expect(deriveRoleWorkspaceMeta({
        version: 1,
        status: 'not-started',
        source: null,
      }, changed)).toEqual({
        version: 1,
        status: 'legacy-unconfirmed',
        source: 'legacy',
      });
    });

    it('일부 역할만 남은 레거시 배열도 유효한 색이나 잠금이 있으면 기존 작업으로 보존한다', () => {
      expect(deriveRoleWorkspaceMeta(undefined, [
        { role: 'text', hex: '#111827', locked: false },
        { role: 'warning', hex: '#d97706', locked: true },
        { role: 'unknown', hex: '#ffffff', locked: true },
      ])).toEqual({
        version: 1,
        status: 'legacy-unconfirmed',
        source: 'legacy',
      });
    });

    it('손상된 역할 데이터와 메타는 결정론적 기본값의 시작 전 상태로 복구한다', () => {
      expect(deriveRoleWorkspaceMeta({
        version: 2,
        status: 'active',
        source: 'pair',
      }, {
        colors: [
          { role: 'text', hex: '#fff', locked: 'true' },
          { role: 'background', hex: null, locked: true },
        ],
      })).toEqual({
        version: 1,
        status: 'not-started',
        source: null,
      });
    });
  });

  describe('실제 두 색을 역할 팔레트로 가져오기', () => {
    it('text와 background만 정규화해 바꾸고 나머지 다섯 색과 전체 잠금을 보존한다', () => {
      let palette = createRolePalette();
      palette = setRoleColor(palette, 'primary', '#7c3aed');
      palette = setRoleColor(palette, 'success', '#15803d');
      for (const role of ['primary', 'background', 'text', 'success', 'warning', 'danger', 'info'] as const) {
        palette = setRoleLocked(palette, role, true);
      }
      const before = JSON.stringify(palette);
      const imported = importPairIntoRolePalette(palette, '  #112233 ', ' #FfEeDd ');

      expect(imported).not.toBeNull();
      expect(imported!.colors.find((color) => color.role === 'text')?.hex).toBe('#112233');
      expect(imported!.colors.find((color) => color.role === 'background')?.hex).toBe('#ffeedd');
      for (const role of ['primary', 'success', 'warning', 'danger', 'info'] as const) {
        expect(imported!.colors.find((color) => color.role === role)?.hex)
          .toBe(palette.colors.find((color) => color.role === role)?.hex);
      }
      expect(imported!.colors.every((color) => color.locked)).toBe(true);
      expect(JSON.stringify(palette)).toBe(before);
    });

    it('한쪽이라도 유효한 6자리 HEX가 아니면 팔레트를 만들거나 입력을 바꾸지 않는다', () => {
      const palette = createRolePalette();
      const before = JSON.stringify(palette);

      expect(importPairIntoRolePalette(palette, '#fff', '#ffffff')).toBeNull();
      expect(importPairIntoRolePalette(palette, '#000000', '')).toBeNull();
      expect(JSON.stringify(palette)).toBe(before);
    });
  });

  it('실제 글자·배경 검사를 빈 입력, 잘못된 입력, 통과, 미달로 구분한다', () => {
    expect(evaluateActualPair('', '')).toMatchObject({
      state: 'empty',
      ratio: null,
      foregroundInvalid: false,
      backgroundInvalid: false,
    });
    expect(evaluateActualPair('#000000', '   ')).toMatchObject({
      state: 'empty',
      foreground: '#000000',
      background: null,
    });
    expect(evaluateActualPair('#fff', '#ffffff')).toMatchObject({
      state: 'invalid',
      foregroundInvalid: true,
      ratio: null,
    });
    expect(evaluateActualPair('  #000000 ', ' #FFFFFF ')).toMatchObject({
      state: 'pass',
      foreground: '#000000',
      background: '#ffffff',
      ratio: 21,
    });
    const failed = evaluateActualPair('#777777', '#ffffff');
    expect(failed.state).toBe('fail');
    expect(failed.ratio).toBeLessThan(4.5);
  });

  it('실제 글자·배경 조합의 색각 미리보기는 같은 두 색만 사용한다', () => {
    const previews = buildActualPairVisionPreviews('  #765CC1 ', ' #FfFfFf ');

    expect(previews).toHaveLength(5);
    expect(previews?.map((preview) => preview.type)).toEqual([
      'normal',
      'protan',
      'deutan',
      'tritan',
      'mono',
    ]);
    expect(previews?.[0]).toEqual({
      type: 'normal',
      foreground: '#765cc1',
      background: '#ffffff',
    });
    for (const preview of previews ?? []) {
      expect(preview.foreground).toBe(simulateHex('#765cc1', preview.type));
      expect(preview.background).toBe(simulateHex('#ffffff', preview.type));
    }

    const updated = buildActualPairVisionPreviews('#123456', '#abcdef');
    expect(updated).toHaveLength(5);
    for (const preview of updated ?? []) {
      expect(preview.foreground).toBe(simulateHex('#123456', preview.type));
      expect(preview.background).toBe(simulateHex('#abcdef', preview.type));
    }
    expect(updated).not.toEqual(previews);
  });

  it('유효하지 않거나 비어 있는 실제 조합은 색각 미리보기를 만들지 않는다', () => {
    expect(buildActualPairVisionPreviews('#bad', '#ffffff')).toBeNull();
    expect(buildActualPairVisionPreviews('#000000', '')).toBeNull();
  });

  it('견본 추천 배지는 실제 불투명 표면에서도 AA 이상의 대비를 유지한다', () => {
    const step500 = buildRamp('#3b82f6', 'tailwind').steps.find((step) => step.step === 500)!;
    expect(step500.hex).toBe('#4b87e8');

    const badge = contrastSafeBadgeColors(step500.hex);
    expect(badge.ratio).toBeGreaterThanOrEqual(4.5);
    expect(contrastBetween(badge.color, badge.background)).toBe(badge.ratio);
  });

  it('미달한 실제 조합에서 글자만·배경만 바꾸는 두 후보를 원본 변경 없이 만든다', () => {
    const foreground = '  #777777 ';
    const background = ' #FFFFFF ';
    const candidates = buildPairContrastCandidates(foreground, background);

    expect(candidates).not.toBeNull();
    expect(candidates!.foreground).not.toBeNull();
    expect(candidates!.background).not.toBeNull();
    expect(candidates!.foreground!.before).toBe('#777777');
    expect(candidates!.background!.before).toBe('#ffffff');
    expect(candidates!.foreground!.after).not.toBe('#777777');
    expect(candidates!.background!.after).not.toBe('#ffffff');
    expect(candidates!.foreground!.ratio).toBeGreaterThanOrEqual(4.501);
    expect(candidates!.background!.ratio).toBeGreaterThanOrEqual(4.501);
    expect(foreground).toBe('  #777777 ');
    expect(background).toBe(' #FFFFFF ');
  });

  it('선택 목표를 실제로 통과할 수 있는 수동 후보만 반환한다', () => {
    const impossible = buildPairContrastCandidates('#777777', '#777777', 7);
    expect(impossible).toEqual({ foreground: null, background: null });

    const oneSideOnly = buildPairContrastCandidates('#777777', '#aaaaaa', 7);
    expect(oneSideOnly).not.toBeNull();
    expect(oneSideOnly!.foreground?.ratio).toBeGreaterThanOrEqual(7);
    expect(oneSideOnly!.background).toBeNull();
  });

  it('이미 통과하거나 형식이 잘못된 조합에는 수정 후보를 만들지 않는다', () => {
    expect(buildPairContrastCandidates('#000000', '#ffffff')).toBeNull();
    expect(buildPairContrastCandidates('#bad', '#ffffff')).toBeNull();
  });

  describe('고정 팔레트색의 반대 역할 추천', () => {
    const palette = [
      { step: 50, hex: '#f8fafc' },
      { step: 100, hex: '#f8fafc' },
      { step: 500, hex: '#777777' },
      { step: 700, hex: '#444444' },
      { step: 900, hex: '#111111' },
      { step: 950, hex: '잘못된 색' },
    ] as const;

    it('글자색을 고정하면 고정색과 입력은 그대로 두고 반대 역할 후보만 만든다', () => {
      const request = {
        fixedRole: 'foreground',
        fixedHex: '  #777777 ',
        otherHex: ' #777777 ',
        palette: palette.map((item) => ({ ...item })),
        target: 4.5,
      } as const;
      const before = JSON.stringify(request);
      const recommendations = buildFixedRoleContrastRecommendations(request);

      expect(recommendations).not.toBeNull();
      expect(contrastBetween('#777777', '#777777')).toBe(1);
      expect(recommendations!.length).toBeGreaterThan(0);
      expect(recommendations!.every((candidate) => candidate.hex !== '#777777')).toBe(true);
      expect(recommendations!.every((candidate) => candidate.ratio >= 4.5)).toBe(true);
      expect(JSON.stringify(request)).toBe(before);
    });

    it('배경색 고정에서도 3, 4.5, 7 기준을 반올림하지 않은 대비값으로 지킨다', () => {
      for (const target of [3, 4.5, 7] as const) {
        const recommendations = buildFixedRoleContrastRecommendations({
          fixedRole: 'background',
          fixedHex: '#ffffff',
          otherHex: '#eeeeee',
          palette,
          target,
        });

        expect(recommendations).not.toBeNull();
        expect(recommendations!.length).toBeGreaterThan(0);
        expect(recommendations!.every((candidate) => candidate.ratio >= target)).toBe(true);
        expect(recommendations!.every((candidate) => (
          contrastBetween('#ffffff', candidate.hex) === candidate.ratio
        ))).toBe(true);
      }
    });

    it('현재색 최소 변경 후보를 먼저 두고 팔레트 HEX 중복을 제거해 최대 3개만 추가한다', () => {
      const recommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'background',
        fixedHex: '#ffffff',
        otherHex: '#777777',
        palette,
        target: 4.5,
      })!;

      expect(recommendations[0].source).toBe('adjusted');
      expect(recommendations[0].ratio).toBeGreaterThanOrEqual(4.5);
      const paletteCandidates = recommendations.filter((candidate) => candidate.source === 'palette');
      expect(paletteCandidates).toHaveLength(2);
      expect(paletteCandidates.map((candidate) => candidate.step)).toEqual([700, 900]);
      expect(new Set(recommendations.map((candidate) => candidate.hex)).size).toBe(recommendations.length);
    });

    it('현재 반대색이 없으면 목표를 적게 초과하는 팔레트 후보부터 정렬한다', () => {
      const recommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'background',
        fixedHex: '#ffffff',
        otherHex: '',
        palette: [
          { step: 900, hex: '#111111' },
          { step: 700, hex: '#666666' },
          { step: 800, hex: '#444444' },
        ],
        target: 4.5,
      })!;

      expect(recommendations.filter((candidate) => candidate.source === 'palette').map((candidate) => candidate.step))
        .toEqual([700, 800, 900]);
    });

    it('요청한 범위 안에서는 통과하는 팔레트 후보를 3개로 자르지 않고 모두 제공한다', () => {
      const request = {
        fixedRole: 'background' as const,
        fixedHex: '#ffffff',
        otherHex: '',
        palette: [
          { step: 400, hex: '#666666' },
          { step: 500, hex: '#555555' },
          { step: 600, hex: '#444444' },
          { step: 700, hex: '#333333' },
          { step: 800, hex: '#222222' },
          { step: 900, hex: '#111111' },
        ],
        target: 4.5 as const,
        maxPaletteCandidates: 11,
      };
      const first = buildFixedRoleContrastRecommendations(request)!;
      const second = buildFixedRoleContrastRecommendations(request)!;
      const paletteCandidates = first.filter((candidate) => candidate.source === 'palette');

      expect(paletteCandidates).toHaveLength(6);
      expect(paletteCandidates.every((candidate) => candidate.ratio >= 4.5)).toBe(true);
      expect(second).toEqual(first);
    });

    it('검정과 흰색 중 실제 대비가 높은 통과 후보를 제공한다', () => {
      const recommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'foreground',
        fixedHex: '#111111',
        otherHex: '',
        palette: [],
        target: 4.5,
      })!;
      const readable = recommendations.find((candidate) => candidate.source === 'black-white');

      expect(readable).toMatchObject({ hex: '#ffffff' });
      expect(readable!.ratio).toBe(contrastBetween('#111111', '#ffffff'));
    });

    it('이미 적용 중인 통과색은 다시 추천하지 않고 다른 후보 슬롯을 유지한다', () => {
      const recommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'background',
        fixedHex: '#ffffff',
        otherHex: '#444444',
        palette: [
          { step: 700, hex: '#444444' },
          { step: 800, hex: '#555555' },
          { step: 900, hex: '#666666' },
          { step: 950, hex: '#111111' },
        ],
        target: 4.5,
        maxPaletteCandidates: 3,
      })!;

      expect(recommendations.some((candidate) => candidate.hex === '#444444')).toBe(false);
      expect(recommendations.filter((candidate) => candidate.source === 'palette').map((candidate) => candidate.hex))
        .toEqual(['#555555', '#666666', '#111111']);
    });

    it('현재 적용 중인 검정·흰색은 같은 자동 후보로 다시 제시하지 않는다', () => {
      const recommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'background',
        fixedHex: '#ffffff',
        otherHex: '#000000',
        palette: [],
        target: 7,
      });

      expect(recommendations).toEqual([]);
    });

    it('고정색으로 AAA 대비가 불가능하면 유효한 빈 후보를 반환한다', () => {
      const recommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'foreground',
        fixedHex: '#777777',
        otherHex: '#777777',
        palette,
        target: 7,
      });

      expect(Math.max(
        contrastBetween('#777777', '#000000'),
        contrastBetween('#777777', '#ffffff'),
      )).toBeLessThan(7);
      expect(recommendations).toEqual([]);

      const purpleRecommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'foreground',
        fixedHex: '#765cc1',
        otherHex: '#ffffff',
        palette,
        target: 7,
      });
      expect(conservativeContrastValue(contrastBetween('#765cc1', '#ffffff'))).toBe(5.1581);
      expect(contrastBetween('#765cc1', '#ffffff'))
        .toBeGreaterThan(contrastBetween('#765cc1', '#000000'));
      expect(purpleRecommendations).toEqual([]);
    });

    it('잘못된 고정 HEX와 지원하지 않는 기준은 거부하고 다른 잘못된 HEX는 무시한다', () => {
      expect(buildFixedRoleContrastRecommendations({
        fixedRole: 'foreground',
        fixedHex: '#bad',
        otherHex: '#ffffff',
        palette,
        target: 4.5,
      })).toBeNull();
      expect(buildFixedRoleContrastRecommendations({
        fixedRole: 'foreground',
        fixedHex: '#000000',
        otherHex: '#ffffff',
        palette,
        target: 5 as 4.5,
      })).toBeNull();

      const recommendations = buildFixedRoleContrastRecommendations({
        fixedRole: 'background',
        fixedHex: '#ffffff',
        otherHex: '#bad',
        palette: [{ step: 50, hex: '#bad' }, { step: 900, hex: '#111111' }],
        target: 4.5,
      })!;
      expect(recommendations.some((candidate) => candidate.hex === '#111111')).toBe(true);
    });
  });

  it('기존 저장값이 명시적 true일 때만 현재 AA 보정 모드를 복원할 수 있다', () => {
    expect(decodeLegacyEnforceAA(true)).toBe(true);
    expect(decodeLegacyEnforceAA(false)).toBe(false);
    expect(decodeLegacyEnforceAA('true')).toBeUndefined();
    expect(decodeLegacyEnforceAA(null)).toBeUndefined();
  });
});
