# Color data provenance / 색상 데이터 출처

Reviewed / 확인일: 2026-09-03. This record does not announce a release or certify all source rights.
이 문서는 공개 준비의 근거 기록이며 출시·권리 전수 확인·기능 활성화의 완료 고지가 아닙니다.

## Colour matrices / 색각 행렬

The 27 coefficients in `src/engine/cvd.ts` were re-obtained from the pinned Colour table below:
`Protanomaly`, `Deuteranomaly`, and `Tritanomaly`, each at severity `1.0`.
They exactly match the previous Palette numbers and the pinned DaltonLens table's key `10`.
This establishes the reviewed source of this acquisition, not the historical origin of the first implementation.

`src/engine/cvd.ts`의 계수 27개는 아래 고정 Colour 자료의 세 유형·강도 1.0에서 다시 취득했습니다.
기존 Palette 값 및 DaltonLens의 정수 키 10과 모두 일치합니다. 행 단위 배열을 평탄화하고
숫자 표기를 정리했을 뿐 값은 바꾸지 않았습니다. 최초 구현의 취득 경로를 소급해 꾸미지 않습니다.

- [Colour source / 원자료](https://raw.githubusercontent.com/colour-science/colour/907242acd5e514a94b626a9dcf4bfe953aa0b8dc/colour/blindness/datasets/machado2010.py) — BSD-3-Clause; Copyright 2013 Colour Developers.
- [Colour original license / 원문](../licenses/reference/colour-BSD-3-Clause.txt).
- [DaltonLens cross-check / 대조 자료](https://raw.githubusercontent.com/DaltonLens/DaltonLens-Python/3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d/daltonlens/simulate.py) — MIT; Copyright (c) 2021 DaltonLens.
- [DaltonLens original license / 원문](../licenses/reference/daltonlens-MIT.txt).

The upstreams identify the Machado model; Colour's file and symbol use “2010”.
The original research author's web page could not be retrieved in this review.
No claim is made that this project originated the model or that an upstream endorses Palette.

원자료는 Machado 모델을 명시하며 Colour의 파일명·심볼에는 2010이 사용됩니다.
이번 검토에서 원연구자 웹페이지는 연결 실패로 읽지 못했습니다.
모델을 자체 발명했거나 원저작자가 Palette를 보증한다고 주장하지 않습니다.

## Transfer and reference fixtures / 변환과 독립 기준값

Reference values were computed separately from the pinned Colour numbers, without calling Palette's
`simulateHex`: decode sRGB, multiply the linear RGB column by the 3×3 matrix, clamp to [0,1],
encode sRGB, then quantize with `floor(255 × value + 0.5)`.
Palette uses nearest-byte rounding; [DaltonLens conversion](https://github.com/DaltonLens/DaltonLens-Python/blob/3cba5e6a7c8f0e8199c8f83f1afb58eb6dab7a3d/daltonlens/convert.py)
casts to an integer and can differ by one byte. The fixtures are not a claim of byte-identical output to that package.

고정 Colour 수치에서 별도로 계산한 11개 입력색 × 세 유형 = 33개 기준 HEX를
`src/engine/__tests__/cvd-reference.test.ts`에 고정합니다. 검정·흰색·원색·보색·회색과
8비트 sRGB 감마 분기 사이의 채널값 10·11을 포함합니다. 계수 27개도 원표와 비교합니다.
기준값 계산에는 Palette의 변환 함수·행렬을 사용하지 않았습니다. 반올림 정책은 위 식으로 명시하며,
DaltonLens의 정수 절삭과 동일하다고 하지 않습니다. 이는 수치 회귀시험이지 개인 시각의 실측이 아닙니다.

Source text SHA-256 / 다시 취득한 원문 SHA-256:

| File / 파일 | SHA-256 |
| --- | --- |
| Colour matrix table | `f5084dde646568b35fd4b8d63e870a6e764cfae01f9d424f7ac12a0e8492a20f` |
| Colour license | `cd9efcd4b6ac5218189d90ffc25f9766f8411e62c5526c452145e1cc8b19baf7` |
| DaltonLens simulation | `3c68a13dc92fb03a6205e249e5c85ffe18aecbbc783602151a911d08fc1ef4fe` |
| DaltonLens license | `aaef9255b6f8684950d56c1db08906f1f16d8dfc3d7c43197f6ef7789a843cc2` |

## Ramp parameters / 팔레트 단계 매개변수

`steps.ts` contains four 11-entry parameter tables: lightness, chroma multiplier, hue offset,
and target contrast ratio. They currently control Palette's output. The exact original source,
derivation and acquisition trail of these 44 parameters remain unverified.

`steps.ts`의 네 표·44개 값은 현재 출력 호환성을 위한 제품 매개변수로 유지합니다.
원표·도출식·최초 취득 경로는 미확인입니다. “모두 그대로 이식” 또는 “전부 독자 창작”이라는
단정 대신 아래 제한된 대조 결과와 사용 목적을 기록합니다. 수치를 바꿔 출처 문제를 감추지 않습니다.

- [Tailwind pinned palette](https://github.com/tailwindlabs/tailwindcss/blob/f723e834ad032aa0f42405f95f684be3cfcac8ef/packages/tailwindcss/theme.css)
  ([MIT](https://github.com/tailwindlabs/tailwindcss/blob/f723e834ad032aa0f42405f95f684be3cfcac8ef/LICENSE)):
  all 23 complete 11-step colour families were compared; none has the exact Palette lightness array.
  공식 23개 색상군의 명도 배열 전체와 비교해 완전 일치는 없었습니다. 파생 관계가 전혀 없다는 증거는 아닙니다.
- [Radix pinned scales](https://github.com/radix-ui/colors/blob/dbdb85470547c7d34b9001f48fddb08ded335979/src/light.ts)
  ([MIT](https://github.com/radix-ui/colors/blob/dbdb85470547c7d34b9001f48fddb08ded335979/LICENSE)):
  published scales use 12 steps with HEX/P3 values, not Palette's four universal 11-step tables.
  12단계 공식 자료와 구조가 다릅니다. 모든 변환·과거 버전·생성기의 유사성 감사는 하지 않았습니다.
- [Leonardo pinned ratio API](https://github.com/adobe/leonardo/blob/eb6481da40df27654ac8efa42038007f6fad2431/packages/contrast-colors/README.md)
  ([Apache-2.0](https://github.com/adobe/leonardo/blob/eb6481da40df27654ac8efa42038007f6fad2431/LICENSE)):
  target ratios are caller-supplied parameters. Palette's `LEONARDO_RATIOS` is not documented there as an official fixed table.
  목표 대비를 입력받는 방식은 참고할 수 있지만 현재 11개 값을 공식 Leonardo 기본값으로 소개하지 않습니다.

## Limits / 한계

Simulation, grey previews and colour-distance thresholds are design-review aids, not diagnosis,
treatment, exact personal-vision predictions or whole-product accessibility certification.
색각·흑백 참고 화면과 색 거리 임계값은 디자인 검토 보조이며 의료 진단·치료·개인 시각의
정확한 예측·제품 전체 접근성 인증이 아닙니다. 코드·시험·고지의 전체 검증은 별도로 기록합니다.
