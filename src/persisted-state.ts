export type StoredDecoder<T> = (value: unknown) => T | undefined;

/** Decode one JSON value and fall back for malformed JSON or semantically invalid data. */
export function decodeStoredJson<T>(raw: string | null, fallback: T, decode: StoredDecoder<T>): T {
  if (raw === null) return fallback;
  try {
    const decoded = decode(JSON.parse(raw));
    return decoded === undefined ? fallback : decoded;
  } catch {
    return fallback;
  }
}

/** Read namespaced UI state without letting unavailable or corrupted storage break startup. */
export function loadStored<T>(key: string, fallback: T, decode: StoredDecoder<T>): T {
  try {
    return decodeStoredJson(localStorage.getItem(`pg.${key}`), fallback, decode);
  } catch {
    return fallback;
  }
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * 역할 시스템의 보고서 포함 설정을 새 키부터 순서대로 복원합니다.
 *
 * 각 인수는 이미 JSON에서 읽은 값이며, 잘못된 형식은 다음 호환 키로 넘깁니다.
 * 논리 OR를 사용하지 않아 최신 설정의 명시적인 false가 과거 true에 덮이지 않습니다.
 */
export function resolveRoleReportPreference(
  current: unknown,
  intermediate: unknown,
  legacy: unknown,
): boolean {
  return optionalBoolean(current)
    ?? optionalBoolean(intermediate)
    ?? optionalBoolean(legacy)
    ?? false;
}
