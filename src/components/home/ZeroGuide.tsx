// ============================================================================
// ZeroGuide — 제로 웨이스터 어워드 모달 본문 (Figma 1042:34)
//
// 구조 (인트로 + 4섹션):
//   ⓪ 인트로 (구분선 없음)         — 24px Medium/Regular 2줄
//   ① 인용 + 제로 웨이스터 상 정의   — 인용 박스(가운데 정렬 20px Medium) + 본문 18px
//   ② 참여 방법                    — 18px Bold 제목 + ①②③
//   ③ 참여 예시                    — 2×4 그리드 (8개 단순 카드, bg #fff height 170)
//   ④ 마지막 안내                  — 가운데 정렬 16px Medium 2줄
//
// 토큰:
//   - 인용 박스: py-32, 가운데 정렬, 20px Medium, max-width 720
//   - 카드: bg #fff, padding 16, radius 24, height 170, 텍스트 20px Medium 가운데
//   - 섹션 구분선 #d2d7e1 (전부 동일)
//
// 변경 이력:
//   2026-06-01  최초 작성 — Figma 1042:34 정밀 매핑
// ============================================================================

import './ZeroGuide.css';

/** 참여 예시 카드 (단순 텍스트 카드) */
function ExampleCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="zero-card">
      <p className="zero-card__text">{children}</p>
    </div>
  );
}

export function ZeroGuide() {
  return (
    <div className="zero-guide">
      {/* ⓪ 인트로 (구분선 없음) */}
      <div className="zero-intro">
        <p className="zero-intro__line zero-intro__line--medium">ESG의 E(Environmental)</p>
        <p className="zero-intro__line">나의 일상에 깃든 환경보호습관을 자랑해주세요!</p>
      </div>

      {/* ① 인용 + 정의 (한 섹션 안에 두 블록, gap 40) */}
      <section className="zero-section zero-section--first">
        {/* 인용 박스 (가운데 정렬, py-32) */}
        <div className="zero-quote">
          <p>"일회용 컵 대신 텀블러를 사용하고 있어요"</p>
          <p>"비닐봉투 대신 장바구니를 사용합니다. 제 장바구니 이쁘죠?"</p>
        </div>
        {/* 정의 */}
        <div className="zero-section__group">
          <h3 className="zero-section__title">제로 웨이스터 상 이란?</h3>
          <p className="zero-section__body">
            텀블러, 개인 용기, 장바구니, 에코백 사용 등 평소 실천하고 계신 제로웨이스트 습관을
            사진 한 장과 짧은 글로 올려 주세요. 동료들의 좋아요를 가장 많이 받은 분이 제로웨이스터상의 주인공이 됩니다!
          </p>
        </div>
      </section>

      {/* ② 참여 방법 */}
      <section className="zero-section">
        <h3 className="zero-section__title zero-section__title--bold">참여 방법</h3>
        <div className="zero-section__body-multi">
          <p>① 업로드 — 나의 제로웨이스트 일상을 사진(1장 이상)과 함께 짧은 소개글로 올려 주세요.</p>
          <p>② 좋아요 — 다른 동료들의 게시물을 구경하고, 인상 깊은 실천에 좋아요를 눌러 주세요.</p>
          <p>③ 시상 — 좋아요를 가장 많이 받은 분에게 제로웨이스터상을 창립기념식에서 드립니다!</p>
        </div>
      </section>

      {/* ③ 참여 예시 — 2×4 그리드 (8개 카드) */}
      <section className="zero-section">
        <h3 className="zero-section__title zero-section__title--bold">참여 예시</h3>
        <div className="zero-grid">
          <ExampleCard>매일 함께하는 나의 텀블러 인증샷</ExampleCard>
          <ExampleCard>장바구니·에코백으로 장 본 일상</ExampleCard>
          <ExampleCard>나만의 에코템 자랑샷</ExampleCard>
          <ExampleCard>개인컵 인증샷</ExampleCard>
          <ExampleCard>
            개인 수저·빨대를 챙기는 습관 등<br />
            나만의 일회용품 줄이기 방법
          </ExampleCard>
          <ExampleCard>올바른 분리수거·재활용 모습</ExampleCard>
          <ExampleCard>
            양면 인쇄, 전자 문서 활용 등<br />
            종이 줄이기 실천 인증샷
          </ExampleCard>
          <ExampleCard>
            배달 음식 주문 시<br />
            개인 용기를 사용한 모습
          </ExampleCard>
        </div>
      </section>

      {/* ④ 마지막 안내 */}
      <section className="zero-section zero-section--final">
        <div className="zero-final">
          <p>"나는 이걸 꾸준히 하고 있어요"</p>
          <p>일상 속 작은 실천이면 충분합니다.</p>
        </div>
      </section>
    </div>
  );
}
