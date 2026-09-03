import source from '../cvd.ts?raw';
import { describe, expect, it } from 'vitest';
import { simulateHex } from '../cvd';

// 2026-09-03에 고정 원자료에서 다시 취득한 숫자입니다. 앱의 MAT에서 기대값을 만들지 않습니다.
// Colour: 907242acd5e514a94b626a9dcf4bfe953aa0b8dc / colour/blindness/datasets/machado2010.py
// Copyright 2013 Colour Developers. BSD-3-Clause 원문은 공개 후보의 licenses/reference/에 보존합니다.
// DaltonLens-Python: 3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d / daltonlens/simulate.py
// 같은 계수의 정수 키 10과 대조했으며 Copyright (c) 2021 DaltonLens의 MIT 원문도 보존합니다.
const TYPES = ['protan', 'deutan', 'tritan'] as const;
const REFERENCE_MATRICES = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
} as const;

// 공식 계수만 입력으로 사용한 별도 계산 결과를 고정한 자료입니다.
// sRGB 선형화 → 행렬 곱 → 선형 범위 제한 → sRGB 인코딩 → floor(255 × 값 + 0.5).
// Palette의 simulateHex를 호출해 기대값을 생성하지 않았고 아래 시험 중 네트워크도 사용하지 않습니다.
// 원자료의 강도 1.0 세 유형만 비교합니다. 회색 화면·거리 휴리스틱·개인 시각의 유효성 시험은 아닙니다.
const FIXTURES = [
  { input: '#000000', protan: '#000000', deutan: '#000000', tritan: '#000000' },
  { input: '#ffffff', protan: '#ffffff', deutan: '#ffffff', tritan: '#ffffff' },
  { input: '#ff0000', protan: '#6d5f00', deutan: '#a39000', tritan: '#ff000f' },
  { input: '#00ff00', protan: '#ffe500', deutan: '#efd63a', tritan: '#00f7d9' },
  { input: '#0000ff', protan: '#0059ff', deutan: '#003dfb', tritan: '#006b96' },
  { input: '#ffff00', protan: '#fff400', deutan: '#fffa31', tritan: '#ffeed9' },
  { input: '#00ffff', protan: '#edf2ff', deutan: '#d0ddff', tritan: '#00fffe' },
  { input: '#ff00ff', protan: '#007fff', deutan: '#689bfa', tritan: '#ff4a97' },
  { input: '#808080', protan: '#808080', deutan: '#808080', tritan: '#808080' },
  { input: '#0a0b0c', protan: '#0b0b0c', deutan: '#0a0b0c', tritan: '#0a0b0b' },
  { input: '#0b0a09', protan: '#0a0a09', deutan: '#0b0a09', tritan: '#0b0a0a' },
] as const;

describe('고정 공식 원표와 독립 색각 변환 기준값', () => {
  // 공개 여부와 관계없이 해당 시험과 같은 소스의 수치 연결을 확인합니다.
  // 소스 파일만 읽으며 개인 파일·키·업데이트 채널에는 접근하지 않습니다.

  for (const type of TYPES) {
    it(type + ' 계수 9개가 고정 공식 원표와 같다', () => {
      const match = source.match(new RegExp('\\b' + type + ':\\s*\\[([\\s\\S]*?)\\]'));
      expect(match).not.toBeNull();
      const numbers = match?.[1].match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      expect(numbers).toEqual(REFERENCE_MATRICES[type]);
    });

    for (const fixture of FIXTURES) {
      it(fixture.input + '의 ' + type + ' 변환이 독립 기준값과 같다', () => {
        expect(simulateHex(fixture.input, type)).toBe(fixture[type]);
      });
    }
  }
});
