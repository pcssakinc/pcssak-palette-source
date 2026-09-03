import { useState } from 'react';
import { describeApproximateColor } from './engine';
import type { ApproximateColorDescriptor } from './engine';
import type { MsgKey } from './i18n';

type Translate = (key: MsgKey, vars?: Record<string, string | number>) => string;

export interface LocalizedColorDescription {
  short: string;
  detail: string;
  accessible: string;
}

function descriptorKey(prefix: string, value: string): MsgKey {
  return `${prefix}.${value}` as MsgKey;
}

/**
 * 엔진의 결정론적 분류 결과를 현재 언어의 근사 색 이름으로 바꿉니다.
 * 화면 어디에서도 이를 정확한 고유 색 이름으로 표현하지 않습니다.
 */
export function localizeColorDescription(
  hex: string,
  t: Translate,
  descriptor: ApproximateColorDescriptor | null = describeApproximateColor(hex),
): LocalizedColorDescription | null {
  if (!descriptor) return null;

  const family = t(descriptorKey('colorName.family', descriptor.family));
  const lightness = t(descriptorKey('colorName.lightness', descriptor.lightness));
  const saturation = t(descriptorKey('colorName.saturation', descriptor.saturation));
  const confidence = t(descriptorKey('colorName.confidence', descriptor.confidence));
  const short = t('colorName.visibleFormat', { lightness, saturation, family });
  const boundary = descriptor.alternativeFamily
    ? t('colorName.boundaryFormat', {
        primary: family,
        alternative: t(descriptorKey('colorName.family', descriptor.alternativeFamily)),
      })
    : '';
  const detail = boundary ? `${short} · ${boundary}` : short;

  return {
    short,
    detail,
    accessible: t('colorName.tooltipFormat', {
      hex: hex.toLowerCase(),
      name: detail,
      confidence,
    }),
  };
}

interface ApproximateColorNameProps {
  hex: string;
  t: Translate;
  className?: string;
}

/** 색상 입력 바로 아래에 색 이름이 근사값임을 항상 보이게 표시합니다. */
export function ApproximateColorName({ hex, t, className = '' }: ApproximateColorNameProps) {
  const description = localizeColorDescription(hex, t);
  if (!description) return null;

  return (
    <span className={`pg-color-name ${className}`.trim()} title={description.accessible}>
      <span className="pg-color-name__prefix">{t('colorName.approximateLabel')}</span>
      <span>{description.short}</span>
    </span>
  );
}

interface AccessibleColorSwatchProps {
  hex: string;
  t: Translate;
  className?: string;
  ariaLabelPrefix?: string;
}

/**
 * 마우스, 키보드, 터치 사용자에게 같은 설명을 제공하는 색상 견본입니다.
 * Escape를 누르면 포인터가 견본 위에 남아 있어도 툴팁을 닫을 수 있습니다.
 */
export function AccessibleColorSwatch({
  hex,
  t,
  className = 'pg-match-sw',
  ariaLabelPrefix,
}: AccessibleColorSwatchProps) {
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const description = localizeColorDescription(hex, t);
  const colorLabel = description?.accessible ?? hex;
  const label = ariaLabelPrefix ? `${ariaLabelPrefix}: ${colorLabel}` : colorLabel;

  return (
    <span
      className={`${className} pg-color-swatch-a11y`.trim()}
      style={{ background: hex }}
      role="img"
      tabIndex={0}
      aria-label={label}
      data-tooltip-dismissed={tooltipDismissed ? 'true' : undefined}
      onFocus={() => setTooltipDismissed(false)}
      onMouseLeave={() => setTooltipDismissed(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setTooltipDismissed(true);
        }
      }}
    >
      <span className="pg-color-swatch-a11y__tooltip" aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
