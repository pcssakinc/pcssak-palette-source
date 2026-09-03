export interface DtcgColorValue {
  colorSpace: 'srgb';
  components: [number, number, number];
  alpha: 1;
  hex: string;
}

export interface DtcgColorToken {
  $type: 'color';
  $value: DtcgColorValue;
}

const HEX6 = /^#[0-9a-f]{6}$/i;

function srgbComponent(pair: string): number {
  const value = parseInt(pair, 16) / 255;
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** 최신 DTCG 색상 규격과 Figma Variables가 함께 읽을 수 있는 sRGB 토큰을 만든다. */
export function dtcgColorToken(hex: string): DtcgColorToken {
  const normalized = hex.trim().toLowerCase();
  if (!HEX6.test(normalized)) throw new Error('DTCG 색상은 #RRGGBB HEX 형식이어야 합니다.');
  return {
    $type: 'color',
    $value: {
      colorSpace: 'srgb',
      components: [
        srgbComponent(normalized.slice(1, 3)),
        srgbComponent(normalized.slice(3, 5)),
        srgbComponent(normalized.slice(5, 7)),
      ],
      alpha: 1,
      hex: normalized,
    },
  };
}

function isTokenDocument(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 여러 DTCG 문서를 합치되 같은 최상위 그룹 이름이 있으면 어느 쪽도 덮어쓰지 않는다. */
export function mergeDtcgDocuments(...documents: string[]): string {
  const merged: Record<string, unknown> = {};
  for (const document of documents) {
    const parsed: unknown = JSON.parse(document);
    if (!isTokenDocument(parsed)) throw new Error('DTCG 문서의 최상위 값은 객체여야 합니다.');
    for (const [group, value] of Object.entries(parsed)) {
      let availableGroup = group;
      let suffix = 2;
      while (Object.prototype.hasOwnProperty.call(merged, availableGroup)) {
        availableGroup = `${group}-${suffix}`;
        suffix += 1;
      }
      merged[availableGroup] = value;
    }
  }
  return `${JSON.stringify(merged, null, 2)}\n`;
}
