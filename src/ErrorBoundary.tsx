// 렌더링 오류가 생기면 빈 화면 대신 복구 안내를 표시합니다. 오류는 외부로 보내지 않고
// 개발자 콘솔에만 기록합니다. React 오류 경계는 훅 대안이 없어 클래스형을 사용합니다.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createT, detectLocale } from './i18n';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('PCssak Palette crashed:', error, info.componentStack);
  }

  private handleRetry = (): void => this.setState({ error: null });
  private handleReload = (): void => window.location.reload();

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const t = createT(detectLocale());
    return (
      <div className="pg-crash" role="alert">
        <div className="pg-crash-card">
          <div className="pg-crash-title">{t('crash.title')}</div>
          <div className="pg-crash-msg">{t('crash.body')}</div>
          <pre className="pg-crash-detail">{this.state.error.message}</pre>
          <div className="pg-crash-actions">
            <button type="button" className="pg-btn pg-btn--sm" onClick={this.handleRetry}>
              {t('crash.retry')}
            </button>
            <button type="button" className="pg-btn pg-btn--sm pg-btn--primary" onClick={this.handleReload}>
              {t('crash.reload')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
