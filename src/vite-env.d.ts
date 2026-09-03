/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UI 표시용 배포 채널입니다. 라이선스 권한은 반드시 Rust가 결정합니다. */
  readonly VITE_DISTRIBUTION_CHANNEL?: 'development' | 'beta' | 'store';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
