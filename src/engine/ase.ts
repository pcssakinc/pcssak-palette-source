// ASE 호환 스와치 파일 직렬화기입니다.
// 전체 값을 빅엔디언으로 기록하고 램프 단계마다 색상 항목 블록 하나를 만듭니다.

import type { Ramp } from './types';

export function exportAse(ramp: Ramp): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push((n >> 8) & 0xff, n & 0xff);
  const u32 = (n: number) => out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  const f32 = (n: number) => {
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, n, false); // 빅엔디언
    out.push(buf[0], buf[1], buf[2], buf[3]);
  };
  const ascii = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  };
  const utf16beZ = (s: string) => {
    for (let i = 0; i < s.length; i++) u16(s.charCodeAt(i));
    u16(0); // 널 종결자
  };

  ascii('ASEF'); // 파일 서명
  u16(1);
  u16(0); // 버전 1.0
  u32(ramp.steps.length); // 블록 수

  for (const s of ramp.steps) {
    const name = `${ramp.name}-${s.step}`;
    const r = parseInt(s.hex.slice(1, 3), 16) / 255;
    const g = parseInt(s.hex.slice(3, 5), 16) / 255;
    const b = parseInt(s.hex.slice(5, 7), 16) / 255;
    // 본문 = 이름 길이(2) + 널 포함 UTF-16 이름 + "RGB "(4) + f32 3개(12) + 색상 유형(2)
    const bodyLen = 2 + (name.length + 1) * 2 + 4 + 12 + 2;
    u16(0x0001); // 블록 유형: 색상 항목
    u32(bodyLen); // 이 필드 다음에 오는 블록 바이트 수
    u16(name.length + 1); // 널 종결자를 포함한 UTF-16 단위 길이
    utf16beZ(name);
    ascii('RGB '); // 색상 모델이며 끝 공백이 필요함
    f32(r);
    f32(g);
    f32(b);
    u16(0x0002); // 색상 유형: 0 전역, 1 별색, 2 일반
  }

  return new Uint8Array(out);
}
