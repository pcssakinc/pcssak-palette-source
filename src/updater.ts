import { useCallback, useEffect, useRef, useState } from 'react';
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface AppUpdateState {
  phase: UpdatePhase;
  version?: string;
  notes?: string;
  percent?: number;
}

const INITIAL_STATE: AppUpdateState = { phase: 'idle' };

export function nextDownloadProgress(
  currentBytes: number,
  totalBytes: number | undefined,
  event: DownloadEvent,
): { downloadedBytes: number; totalBytes?: number; percent?: number } {
  if (event.event === 'Started') {
    return { downloadedBytes: 0, totalBytes: event.data.contentLength };
  }
  if (event.event === 'Progress') {
    const downloadedBytes = currentBytes + event.data.chunkLength;
    const percent = totalBytes && totalBytes > 0
      ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
      : undefined;
    return { downloadedBytes, totalBytes, percent };
  }
  return { downloadedBytes: currentBytes, totalBytes, percent: 100 };
}

/** GitHub 베타 채널에서만 동작합니다. Store 빌드는 운영체제의 업데이트를 사용합니다. */
export function useAppUpdater(enabled: boolean) {
  const [state, setState] = useState<AppUpdateState>(INITIAL_STATE);
  const updateRef = useRef<Update | null>(null);
  const checkedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    // React 개발 모드의 효과 재실행에서도 현재 마운트 상태를 정확히 복원합니다.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const update = updateRef.current;
      updateRef.current = null;
      if (update) void update.close().catch(() => undefined);
    };
  }, []);

  const checkNow = useCallback(async (silentFailure = false) => {
    if (!enabled || updateRef.current) return;
    setState({ phase: 'checking' });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: 12_000 });
      if (!mountedRef.current) {
        if (update) void update.close().catch(() => undefined);
        return;
      }
      if (!update) {
        setState(INITIAL_STATE);
        return;
      }
      updateRef.current = update;
      setState({ phase: 'available', version: update.version, notes: update.body });
    } catch {
      // 시작 시 자동 확인 실패는 조용히 끝내고, 사용자가 누른 재시도 실패는 화면에 남깁니다.
      if (mountedRef.current) setState(silentFailure ? INITIAL_STATE : { phase: 'error' });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || checkedRef.current) return;
    // 실제 확인을 시작할 때만 완료 표시를 남겨 React 개발 모드의 이중 마운트에서도 다시 예약합니다.
    const timer = window.setTimeout(() => {
      checkedRef.current = true;
      void checkNow(true);
    }, 3_500);
    return () => window.clearTimeout(timer);
  }, [checkNow, enabled]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update || state.phase === 'downloading') return;
    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    setState((current) => ({ ...current, phase: 'downloading', percent: undefined }));
    try {
      await update.downloadAndInstall((event) => {
        const progress = nextDownloadProgress(downloadedBytes, totalBytes, event);
        downloadedBytes = progress.downloadedBytes;
        totalBytes = progress.totalBytes;
        if (mountedRef.current) {
          setState((current) => ({ ...current, phase: 'downloading', percent: progress.percent }));
        }
      }, { timeout: 300_000 });
      if (mountedRef.current) {
        setState((current) => ({ ...current, phase: 'ready', percent: 100 }));
      }
    } catch {
      const failedUpdate = updateRef.current;
      updateRef.current = null;
      if (failedUpdate) void failedUpdate.close().catch(() => undefined);
      if (mountedRef.current) {
        setState((current) => ({ ...current, phase: 'error', percent: undefined }));
      }
    }
  }, [state.phase]);

  const restart = useCallback(async () => {
    if (state.phase !== 'ready') return;
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      if (mountedRef.current) {
        setState((current) => ({ ...current, phase: 'error', percent: undefined }));
      }
    }
  }, [state.phase]);

  const retry = useCallback(() => {
    void checkNow(false);
  }, [checkNow]);

  return { state, install, restart, retry };
}
