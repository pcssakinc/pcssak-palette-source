import { describe, expect, it } from 'vitest';
import { mergeDtcgDocuments } from '../dtcg';

describe('DTCG 문서 병합', () => {
  it('서로 다른 그룹은 원래 이름으로 합친다', () => {
    const merged = JSON.parse(mergeDtcgDocuments('{"brand":{"50":{}}}', '{"semantic":{"primary":{}}}'));
    expect(Object.keys(merged)).toEqual(['brand', 'semantic']);
  });

  it('같은 그룹 이름도 데이터를 잃지 않고 결정론적으로 분리한다', () => {
    const merged = JSON.parse(mergeDtcgDocuments('{"semantic":{"50":{}}}', '{"semantic":{"primary":{}}}'));
    expect(Object.keys(merged)).toEqual(['semantic', 'semantic-2']);
    expect(merged.semantic['50']).toEqual({});
    expect(merged['semantic-2'].primary).toEqual({});
  });
});
