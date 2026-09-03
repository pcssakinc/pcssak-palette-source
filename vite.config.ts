import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri는 고정 개발 포트와 화면 지우기 비활성화를 요구합니다.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // 빌드와 개발 서버는 Rust·WiX 도구 체인의 비 ASCII 경로 문제를 피하려고 ASCII 접합점을
  // 사용할 수 있습니다. 실제 경로로 해석하면 잘못된 "../../" 자산 이름이 생길 수 있습니다.
  resolve: { preserveSymlinks: true },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // 검증기가 Rolldown 출력을 정규식으로 다시 해석하지 않도록 공식 import 그래프를 남깁니다.
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // 각 경계의 의존성을 함께 묶어 정적 import 순환과 실행 순서 변화를 줄입니다.
          includeDependenciesRecursively: true,
          groups: [
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: 'color-vendor',
              test: /[\\/]node_modules[\\/]culori[\\/]/,
              priority: 30,
            },
            {
              name: 'tauri-vendor',
              test: /[\\/]node_modules[\\/]@tauri-apps[\\/]/,
              priority: 20,
            },
            {
              // 신규 문구가 기존 다국어 청크의 500KB 경계를 다시 밀어내지 않도록
              // 0.1.7 추가 카탈로그를 독립된 정적 청크로 유지합니다.
              name: 'i18n-v017',
              test: /[\\/]src[\\/]i18n[\\/]v017\.ts$/,
              priority: 15,
            },
            {
              name: 'i18n',
              test: /[\\/]src[\\/]i18n[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
