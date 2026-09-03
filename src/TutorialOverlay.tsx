import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { TutorialStepDefinition } from './tutorial';
import { tutorialSelector } from './tutorial-targets';

interface TutorialOverlayProps {
  step: TutorialStepDefinition;
  index: number;
  total: number;
  title: string;
  body: string;
  progress: string;
  labels: {
    back: string;
    next: string;
    finish: string;
    skip: string;
    close: string;
  };
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  onClose: () => void;
  onMissing: () => void;
}

interface TutorialLayout {
  spotlight: CSSProperties;
  tooltip: CSSProperties;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export default function TutorialOverlay({
  step,
  index,
  total,
  title,
  body,
  progress,
  labels,
  onBack,
  onNext,
  onFinish,
  onClose,
  onMissing,
}: TutorialOverlayProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<TutorialLayout | null>(null);
  const isLast = index === total - 1;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let target: HTMLElement | null = null;

    setLayout(null);

    const update = () => {
      if (!target || cancelled) return;
      const rect = target.getBoundingClientRect();
      const margin = 12;
      const highlightPad = 6;
      const tooltipWidth = Math.min(360, window.innerWidth - margin * 2);
      const tooltipHeight = tooltipRef.current?.offsetHeight ?? 220;
      const centeredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
      const left = clamp(centeredLeft, margin, window.innerWidth - tooltipWidth - margin);
      const below = rect.bottom + 12;
      const above = rect.top - tooltipHeight - 12;
      const top = below + tooltipHeight <= window.innerHeight - margin
        ? below
        : above >= margin
          ? above
          : clamp(window.innerHeight - tooltipHeight - margin, margin, window.innerHeight - tooltipHeight - margin);

      const spotlightLeft = clamp(rect.left - highlightPad, 0, window.innerWidth);
      const spotlightTop = clamp(rect.top - highlightPad, 0, window.innerHeight);

      setLayout({
        spotlight: {
          top: spotlightTop,
          left: spotlightLeft,
          width: Math.max(0, Math.min(window.innerWidth - spotlightLeft, rect.width + highlightPad * 2)),
          height: Math.max(0, Math.min(window.innerHeight - spotlightTop, rect.height + highlightPad * 2)),
        },
        tooltip: { top, left, width: tooltipWidth },
      });
    };

    const locate = (attempt = 0) => {
      target = document.querySelector<HTMLElement>(tutorialSelector(step.target));
      if (!target || target.offsetParent === null) {
        if (attempt < 5) retryTimer = window.setTimeout(() => locate(attempt + 1), 50);
        else onMissing();
        return;
      }
      target.scrollIntoView({ block: 'center' });
      window.requestAnimationFrame(() => window.requestAnimationFrame(update));
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(target);
        if (tooltipRef.current) resizeObserver.observe(tooltipRef.current);
      }
    };

    locate();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target, index]);

  useEffect(() => {
    tooltipRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const focusable = Array.from(
          tooltipRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [],
        ).filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) {
          event.preventDefault();
          tooltipRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (document.activeElement === tooltipRef.current || !tooltipRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        onBack();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (isLast) onFinish();
        else onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, isLast, onBack, onClose, onFinish, onNext]);

  return (
    <div className="pg-tutorial-layer" aria-live="polite">
      <div className="pg-tutorial-blocker" aria-hidden="true" />
      {layout && <div className="pg-tutorial-spotlight" style={layout.spotlight} aria-hidden="true" />}
      <div
        ref={tooltipRef}
        className="pg-tutorial-popover"
        style={layout?.tooltip ?? { top: 12, left: 12, visibility: 'hidden' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pg-tutorial-step-title"
        aria-describedby="pg-tutorial-step-body"
        tabIndex={-1}
      >
        <div className="pg-tutorial-popover-head">
          <span className="pg-tutorial-progress">{progress}</span>
          <button type="button" className="pg-tutorial-icon" onClick={onClose} aria-label={labels.close} title={labels.close}>
            ×
          </button>
        </div>
        <h2 id="pg-tutorial-step-title" className="pg-tutorial-step-title">{title}</h2>
        <p id="pg-tutorial-step-body" className="pg-tutorial-step-body">{body}</p>
        <div className="pg-tutorial-actions">
          <button type="button" className="pg-tutorial-skip" onClick={onClose}>{labels.skip}</button>
          <div className="pg-tutorial-nav">
            <button
              type="button"
              className="pg-tutorial-icon"
              onClick={onBack}
              disabled={index === 0}
              aria-label={labels.back}
              title={labels.back}
            >
              ←
            </button>
            {isLast ? (
              <button type="button" className="pg-btn pg-btn--sm pg-btn--primary" onClick={onFinish}>{labels.finish}</button>
            ) : (
              <button type="button" className="pg-tutorial-icon pg-tutorial-icon--primary" onClick={onNext} aria-label={labels.next} title={labels.next}>
                →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
