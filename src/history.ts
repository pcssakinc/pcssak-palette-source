import type { PresetName } from './engine';
import { PRO_SAVE_LIMIT } from './entitlement';

// 데스크톱 라이브러리는 운영체제 앱 데이터 폴더의 JSON 파일에 저장합니다.
// 결정론적 엔진이므로 시드·프리셋·이름·AA 설정만 보관하고 팔레트는 다시 생성합니다.

export interface HistoryEntry {
  id: string;
  name: string;
  seed: string;
  preset: PresetName;
  enforceAA: boolean;
  createdAt: number;
}

const KEY = 'pg.history';
const MAX = PRO_SAVE_LIMIT;
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const PRESET_NAMES: readonly PresetName[] = ['tailwind', 'radix', 'leonardo'];

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalize(arr: unknown): HistoryEntry[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((value): HistoryEntry | null => {
      if (!value || typeof value !== 'object') return null;
      const entry = value as Partial<HistoryEntry>;
      if (typeof entry.seed !== 'string' || !entry.seed.trim() || !PRESET_NAMES.includes(entry.preset as PresetName)) return null;

      // 이전 백업에 메타데이터가 없으면 안전한 기본값을 채워 불완전한 객체의 UI 유입을 막습니다.
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : newId(),
        name: typeof entry.name === 'string' ? entry.name : '',
        seed: entry.seed.trim(),
        preset: entry.preset as PresetName,
        enforceAA: entry.enforceAA === true,
        createdAt: typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
      };
    })
    .filter((entry): entry is HistoryEntry => entry !== null)
    .slice(0, MAX);
}

// 브라우저 미리보기 저장소이자 이전 데스크톱 버전의 일회성 마이그레이션 원본입니다.
function lsLoad(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}
function lsSave(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* 브라우저 저장소를 사용할 수 없어도 화면 작업은 계속합니다. */
  }
}

async function appDataWrite(list: HistoryEntry[]): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('write_library', { contents: JSON.stringify(list.slice(0, MAX)) });
}

/** 전체 라이브러리를 데스크톱 앱 데이터 또는 브라우저 미리보기 저장소에 기록합니다. */
export async function saveLibrary(list: HistoryEntry[]): Promise<HistoryEntry[]> {
  const capped = list.slice(0, MAX);
  if (isTauri) {
    // 네이티브 권한·수량 검사를 우회하지 않도록 실패 시 localStorage로 대체하지 않습니다.
    await appDataWrite(capped);
    return capped;
  }
  lsSave(capped);
  return capped;
}

/** 데스크톱 앱 데이터를 읽고 이전 localStorage 데이터가 있으면 한 번만 이전합니다. */
export async function loadHistory(): Promise<HistoryEntry[]> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke<string>('read_library');
    let list = normalize(JSON.parse(raw || '[]'));
    if (list.length === 0) {
      const legacy = lsLoad();
      if (legacy.length > 0) {
        list = legacy;
        try {
          await appDataWrite(list);
          localStorage.removeItem(KEY);
        } catch {
          // 현재 권한 한도를 넘는 이전 데이터는 지우지 않고 읽기 전용으로 남깁니다.
          return legacy;
        }
      }
    }
    return list;
  }
  return lsLoad();
}

export async function addHistory(list: HistoryEntry[], entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<HistoryEntry[]> {
  const next = [{ ...entry, id: newId(), createdAt: Date.now() }, ...list].slice(0, MAX);
  return saveLibrary(next);
}

export async function removeHistory(list: HistoryEntry[], id: string): Promise<HistoryEntry[]> {
  return saveLibrary(list.filter((e) => e.id !== id));
}

/** 라이브러리 백업·내보내기용 JSON을 만듭니다. */
export function serializeLibrary(list: HistoryEntry[]): string {
  return JSON.stringify(list, null, 2);
}

/** 가져온 백업을 검사하고 올바른 라이브러리가 아니면 오류를 냅니다. */
export function parseLibrary(text: string): HistoryEntry[] {
  const parsed = normalize(JSON.parse(text));
  if (parsed.length === 0 && text.trim() !== '[]') throw new Error('No palettes found in file');
  // 기존 항목과 식별자가 충돌하지 않도록 새 식별자를 부여합니다.
  return parsed.map((e) => ({ ...e, id: newId() }));
}
