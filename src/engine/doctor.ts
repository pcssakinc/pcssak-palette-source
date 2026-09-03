// Palette Doctor — reads semantic colors and returns scope-limited CVD simulation signals.
// No taste verdicts ("pretty", "harmonious"). Deterministic and offline.
//
// The engine returns structured findings (code + severity + data); the UI localizes
// each code to a message, so this module stays i18n-agnostic. The Pro "Palette Doctor".

import { scanConfusion, type NamedColor } from './cvd';
import type { Ramp } from './types';

export type DoctorSeverity = 'good' | 'warn' | 'risk';

export interface DoctorFinding {
  code: string; // stable → i18n key 'doctor.<code>'
  severity: DoctorSeverity;
  data?: Record<string, string | number>;
}

// Sort problems first: risk, then warn, then good.
const RANK: Record<DoctorSeverity, number> = { risk: 0, warn: 1, good: 2 };

/**
 * 팔레트 단계에는 임의의 글자·배경 역할을 배정하지 않습니다. 실제 WCAG 대비는 UI의
 * 명시적 두 색 조합과 역할 시스템에서 검사하며, 이 진단은 상태 색 CVD 신호만 반환합니다.
 */
export function buildDoctor(ramp: Ramp, semantic: NamedColor[] = []): DoctorFinding[] {
  const out: DoctorFinding[] = [];
  // 향후 진단 확장 시에도 ramp 색만 보고 WCAG 합격·미달을 만들지 않도록 인자를 명시적으로 유지합니다.
  void ramp;

  // Cross-hue CVD confusion among the semantic (status) colors — the real risk a
  //    single-hue lightness ramp doesn't have (the ramp preserves order under CVD).
  if (semantic.length >= 2) {
    const conf = scanConfusion(semantic);
    const duplicate = conf.filter((pair) => pair.kind === 'duplicate');
    const chromatic = conf.filter((pair) =>
      pair.kind === 'simulation'
      && pair.byType.some((item) => item.type !== 'mono' && item.level !== 'distinct'),
    );
    if (duplicate.length === 0 && chromatic.length === 0) {
      out.push({ code: 'cvdSemanticOk', severity: 'good' });
    } else {
      // 동일 HEX와 색채 CVD 근사 시뮬레이션의 거의 같은 색만 위험으로 올립니다.
      // 흑백 전용 신호는 여기서 집계하지 않고 역할 검사에서 별도 조언으로 제공합니다.
      const chromaticNearCollapse = chromatic.some((pair) =>
        pair.byType.some((item) => item.type !== 'mono' && item.level === 'same'),
      );
      out.push({
        code: 'cvdSemanticRisk',
        severity: duplicate.length > 0 || chromaticNearCollapse ? 'risk' : 'warn',
        data: { n: duplicate.length + chromatic.length },
      });
    }
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}
