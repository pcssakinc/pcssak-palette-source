export interface NativeErrorPayload {
  code: string;
  params: Record<string, string | number>;
}

/** Normalize the shapes Tauri can reject with: object, JSON string, or Error.message. */
export function parseNativeError(error: unknown): NativeErrorPayload | null {
  if (error instanceof Error) return parseNativeError(error.message);
  if (typeof error === 'string') {
    try {
      return parseNativeError(JSON.parse(error));
    } catch {
      return null;
    }
  }
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { code?: unknown; params?: unknown };
  if (typeof candidate.code !== 'string') return null;
  const params: Record<string, string | number> = {};
  if (candidate.params && typeof candidate.params === 'object') {
    for (const [key, value] of Object.entries(candidate.params)) {
      if (typeof value === 'string' || typeof value === 'number') params[key] = value;
    }
  }
  return { code: candidate.code, params };
}
