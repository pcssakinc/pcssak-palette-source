import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { APP_NAME, APP_VERSION, EULA_URL, PRIVACY_URL, SUPPORT_EMAIL, VENDOR } from './config/branding';
import type { Locale, MsgKey } from './i18n';

type Translator = (key: MsgKey, vars?: Record<string, string | number>) => string;
type LegalTab = 'about' | 'privacy' | 'eula' | 'licenses';
type DocumentTab = Exclude<LegalTab, 'about'>;

interface LegalModalProps {
  t: Translator;
  locale: Locale;
  onClose: () => void;
  onCopy: (value: string) => Promise<void>;
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const LEGAL_TABS: LegalTab[] = ['about', 'privacy', 'eula', 'licenses'];

export default function LegalModal({ t, locale, onClose, onCopy }: LegalModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  const [tab, setTab] = useState<LegalTab>('about');
  const [version, setVersion] = useState(APP_VERSION);
  const [documentState, setDocumentState] = useState<{
    tab: DocumentTab | null;
    locale: Locale | null;
    loading: boolean;
    text: string | null;
    error: string | null;
  }>({ tab: null, locale: null, loading: false, text: null, error: null });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const selector = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector))
      .filter((element) => element.offsetParent !== null);
    const focusInitial = window.setTimeout(() => (getFocusable()[0] ?? dialog).focus(), 0);
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      window.clearTimeout(focusInitial);
      window.clearTimeout(copiedTimer.current);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    void import('@tauri-apps/api/app')
      .then(({ getVersion }) => getVersion())
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const isCurrentDocument = documentState.tab === tab
      && (tab !== 'eula' || documentState.locale === locale);
    if (tab === 'about' || isCurrentDocument) return;
    if (!isTauri) {
      setDocumentState({ tab, locale, loading: false, text: null, error: t('legal.desktopOnly') });
      return;
    }
    let cancelled = false;
    setDocumentState({ tab, locale, loading: true, text: null, error: null });
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<string>('read_bundled_legal_document', { document: tab, locale }))
      .then((text) => {
        if (!cancelled) setDocumentState({ tab, locale, loading: false, text, error: null });
      })
      .catch(() => {
        if (!cancelled) {
          setDocumentState({
            tab,
            locale,
            loading: false,
            text: null,
            error: t('legal.noticeUnavailable'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentState.locale, documentState.tab, locale, t, tab]);

  function handleTabKey(event: ReactKeyboardEvent<HTMLButtonElement>, current: LegalTab) {
    const index = LEGAL_TABS.indexOf(current);
    let next: LegalTab | null = null;
    if (event.key === 'ArrowRight') next = LEGAL_TABS[(index + 1) % LEGAL_TABS.length];
    if (event.key === 'ArrowLeft') next = LEGAL_TABS[(index - 1 + LEGAL_TABS.length) % LEGAL_TABS.length];
    if (event.key === 'Home') next = LEGAL_TABS[0];
    if (event.key === 'End') next = LEGAL_TABS[LEGAL_TABS.length - 1];
    if (!next) return;
    event.preventDefault();
    setTab(next);
    window.requestAnimationFrame(() => document.getElementById(`pg-legal-tab-${next}`)?.focus());
  }

  async function copy(value: string) {
    await onCopy(value);
    setCopied(value);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1600);
  }

  const rows = [
    [t('legal.version'), version],
    [t('legal.vendor'), VENDOR],
    [t('legal.support'), SUPPORT_EMAIL],
    [t('legal.privacy'), PRIVACY_URL],
    [t('legal.eula'), EULA_URL],
  ] as const;

  return (
    <div className="pg-modal-scrim" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="pg-modal pg-legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pg-legal-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pg-legal-head">
          <div>
            <div id="pg-legal-title" className="pg-modal-title">{t('legal.title')}</div>
            <div className="pg-modal-sub">{APP_NAME} · {version}</div>
          </div>
          <button type="button" className="pg-legal-close" onClick={onClose} aria-label={t('legal.close')} title={t('legal.close')}>
            ×
          </button>
        </div>

        <div className="pg-legal-tabs" role="tablist" aria-label={t('legal.title')}>
          {LEGAL_TABS.map((item) => {
            const labels: Record<LegalTab, MsgKey> = {
              about: 'legal.aboutTab',
              privacy: 'legal.privacy',
              eula: 'legal.eula',
              licenses: 'legal.licensesTab',
            };
            return (
              <button
                id={`pg-legal-tab-${item}`}
                key={item}
                type="button"
                role="tab"
                tabIndex={tab === item ? 0 : -1}
                aria-selected={tab === item}
                aria-controls={`pg-legal-${item}`}
                onClick={() => setTab(item)}
                onKeyDown={(event) => handleTabKey(event, item)}
              >
                {t(labels[item])}
              </button>
            );
          })}
        </div>

        {tab === 'about' ? (
          <div id="pg-legal-about" className="pg-legal-panel" role="tabpanel" aria-labelledby="pg-legal-tab-about">
            <section className="pg-legal-summary">
              <strong>{t('legal.offlineTitle')}</strong>
              <p>{t('legal.offlineBody')}</p>
              <p>{t('legal.accessibilityNotice')}</p>
            </section>
            <dl className="pg-legal-list">
              {rows.map(([label, value]) => (
                <div className="pg-legal-row" key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <button type="button" onClick={() => void copy(value)} title={`${t('legal.copy')}: ${value}`}>
                      <span>{value}</span>
                      <small>{copied === value ? t('legal.copied') : t('legal.copy')}</small>
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <div
            id={`pg-legal-${tab}`}
            className="pg-legal-panel"
            role="tabpanel"
            aria-labelledby={`pg-legal-tab-${tab}`}
          >
            {tab === 'licenses' && <p className="pg-legal-intro">{t('legal.licenseIntro')}</p>}
            {documentState.loading && <div className="pg-legal-state" role="status">{t('legal.loading')}</div>}
            {documentState.error && <div className="pg-legal-state" role="alert">{documentState.error}</div>}
            {documentState.text && <pre className="pg-legal-notices" tabIndex={0}>{documentState.text}</pre>}
          </div>
        )}

        <div className="pg-modal-actions pg-legal-actions">
          <button type="button" className="pg-btn pg-btn--primary" onClick={onClose}>{t('legal.close')}</button>
        </div>
      </div>
    </div>
  );
}
