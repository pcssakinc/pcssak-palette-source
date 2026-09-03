import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { prepareInstallerLocale } from './i18n/installer-locale';
import './index.css';

async function start(): Promise<void> {
  // 설치 언어를 먼저 확정해 다른 언어 화면이 잠깐 보이는 현상을 막습니다.
  await prepareInstallerLocale();

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

void start();
