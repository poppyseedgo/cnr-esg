// ============================================================================
// BazaarGuide.tsx — 바자회·경매 참여 물품 가이드 (모달 본문)
//
// 위치: EVENT_MODAL_CONTENT.bazaar.body 에 주입
// 구조: ① 기본 원칙 ② 물품별 기부 기준(10종 카드 그리드)
//        ③ 공통 불가 기준 ④ 기부 접수 절차 ⑤ 자원순환 ESG 메시지
// 배지: 가능(초록) / 불가(빨강) / 신규(파랑)
//
// 데이터 흐름:
//   1) 마운트 시 BAZAAR_GUIDE_DEFAULTS 로 즉시 렌더 (API 대기 없이 깜빡임 방지)
//   2) loadSetting('bazaar_guide') 로 DB값 조회 → 있으면 교체
//   3) Realtime 구독: 어드민이 수정하면 즉시 반영
//   4) DB값 없거나 에러면 폴백(기본값) 유지 → 화면 안 깨짐
//
// 변경 이력:
//   2026-06-01  최초 작성 (하드코딩)
//   2026-06-01  API 로드 + Realtime + 폴백 구조로 리팩터링 (어드민 편집 지원)
// ============================================================================

import { useEffect, useState } from 'react';
import { loadSetting, subscribeSettings } from '@/lib/settings';
import type { EsgBazaarGuide } from '@/types/esg';
import { BAZAAR_GUIDE_DEFAULTS, splitFooterMessage } from './bazaarGuideDefaults';
import './BazaarGuide.css';

export function BazaarGuide() {
  const [guide, setGuide] = useState<EsgBazaarGuide>(BAZAAR_GUIDE_DEFAULTS);

  // DB값 로드 (실패 시 기본값 유지 → 화면 안 깨짐)
  useEffect(() => {
    let mounted = true;
    const load = () => {
      loadSetting('bazaar_guide')
        .then((data) => {
          if (mounted && data) setGuide(data);
        })
        .catch((err) => {
          // 네트워크/RLS 에러여도 기본값 폴백 유지
          console.error('[BazaarGuide] load failed:', err);
        });
    };
    load();
    // Realtime: 어드민이 수정하면 즉시 재로드
    const unsubscribe = subscribeSettings(load);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const footer = splitFooterMessage(guide.footerMessage);

  return (
    <div className="bazaar-guide">
      {/* ① 기본 원칙 */}
      <section className="bg-section">
        <h3 className="bg-section__label">기본 원칙</h3>
        <div className="bg-principle">
          <p><b>{guide.principle.highlight}</b></p>
          <p>{guide.principle.subtitle}</p>
        </div>
      </section>

      {/* ② 물품별 기부 기준 */}
      <section className="bg-section">
        <h3 className="bg-section__label">물품별 기부 기준</h3>
        <div className="bg-categories">
          {guide.categories.map((cat) => (
            <article key={cat.id} className="bg-card">
              <header className="bg-card__head">
                <h4 className="bg-card__title">{cat.name}</h4>
                {cat.isNew && <span className="bg-badge bg-badge--new">신규</span>}
              </header>
              <div className="bg-card__row">
                <span className="bg-badge bg-badge--ok">가능</span>
                <span className="bg-card__text">{cat.allowed}</span>
              </div>
              <div className="bg-card__row">
                <span className="bg-badge bg-badge--no">불가</span>
                <span className="bg-card__text">{cat.disallowed}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ③ 공통 불가 기준 */}
      <section className="bg-section">
        <h3 className="bg-section__label">공통 불가 기준</h3>
        <ul className="bg-disallowed">
          {guide.commonDisallowed.map((item, i) => (
            <li key={i}>
              <span className="bg-badge bg-badge--no bg-badge--sm">불가</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ④ 기부 접수 절차 */}
      <section className="bg-section">
        <h3 className="bg-section__label">기부 접수 절차</h3>
        <ol className="bg-steps">
          {guide.steps.map((step, i) => (
            <li key={i} className="bg-step">
              <span className="bg-step__num">{i + 1}</span>
              <div className="bg-step__body">
                <p className="bg-step__title">{step.title}</p>
                {step.desc && <p className="bg-step__desc">{step.desc}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ⑤ 자원순환 ESG */}
      <section className="bg-footer-msg">
        <span className="bg-badge bg-badge--esg">자원순환 ESG</span>
        <p>
          {footer.before}
          {footer.highlight && <b>{footer.highlight}</b>}
          {footer.after}
        </p>
      </section>
    </div>
  );
}
