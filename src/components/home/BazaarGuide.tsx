// ============================================================================
// BazaarGuide — 바자회 모달 본문 (Figma 1035:964 정밀 매핑)
//
// 구조 (5섹션 + 마지막 안내):
//   ① 바자회 물품 참여 기간      — 인라인 Bold (6월 8일, 6월 22일, 씨앗 키트)
//   ② 물품 참여 원칙              — 2단락, 인라인 Bold
//   ③ 공통 불가 물품              — 5개 항목, "불가" 배지 + 텍스트
//   ④ 품목별 기준                 — 2×5 그리드 (10 카테고리 카드, 가능/불가 배지)
//   ⑤ 기부 접수 절차              — 3단계 (숫자 배지 + 텍스트)
//   ⑥ 마지막 안내                 — 가운데 정렬 안내 문구
//
// 토큰:
//   - 섹션 제목 20px Bold, line 1.3
//   - 본문 20px Regular line 1.5
//   - 배지: "가능"(라임 #b4ffa4) / "불가"(검정) / 숫자(검정), 모두 padding 4/12 radius 24
//   - 그리드 카드: bg #fff, padding 16, radius 24, gap 16
//   - 섹션 구분선: border-b 1px #000
//
// 변경 이력:
//   2026-05  초기 placeholder
//   2026-06-01  Figma 1035:964 전면 재작성 — 5섹션 + 신규 배지/그리드 토큰
// ============================================================================

import './BazaarGuide.css';

/** "가능" 배지 (라임 #b4ffa4, 작은 사이즈 12px) */
function OkBadge() {
  return <span className="bazaar-badge bazaar-badge--ok">가능</span>;
}

/** "불가" 배지 (검정, 큰 사이즈 14px — 공통 불가 물품 / 절차 단계용) */
function NgBadgeLg() {
  return <span className="bazaar-badge bazaar-badge--ng bazaar-badge--lg">불가</span>;
}

/** "불가" 배지 (검정, 작은 사이즈 12px — 그리드 카드 내부용) */
function NgBadgeSm() {
  return <span className="bazaar-badge bazaar-badge--ng">불가</span>;
}

/** 숫자 배지 (검정, 14px — 절차 1/2/3) */
function StepBadge({ n }: { n: number }) {
  return <span className="bazaar-badge bazaar-badge--ng bazaar-badge--lg">{n}</span>;
}

/** 그리드 카드 — 품목별 기준 */
function CategoryCard({
  title,
  okText,
  ngText,
}: {
  title: string;
  okText: string;
  ngText: string;
}) {
  return (
    <div className="bazaar-card">
      <p className="bazaar-card__title">{title}</p>
      <div className="bazaar-card__rows">
        <div className="bazaar-card__row">
          <OkBadge />
          <p className="bazaar-card__text">{okText}</p>
        </div>
        <div className="bazaar-card__row">
          <NgBadgeSm />
          <p className="bazaar-card__text">{ngText}</p>
        </div>
      </div>
    </div>
  );
}

export function BazaarGuide() {
  return (
    <div className="bazaar-guide">
      {/* ① 바자회 물품 참여 기간 */}
      <section className="bazaar-section bazaar-section--first">
        <h3 className="bazaar-section__title">바자회 물품 참여 기간</h3>
        <div className="bazaar-section__body">
          <p>
            <strong>6월 8일</strong> 부터 <strong>6월 22일</strong> 까지 바자회 물품을 접수하세요.
          </p>
          <p>
            바자회 물품에 참여하신 모든 분들에게는 <strong>씨앗 키트를 선물로 드립니다.</strong>
          </p>
        </div>
      </section>

      {/* ② 물품 참여 원칙 */}
      <section className="bazaar-section">
        <h3 className="bazaar-section__title">물품 참여 원칙</h3>
        <div className="bazaar-section__body">
          <p>
            <strong>다른 분들이 기분 좋게 사용할 수 있는 상태</strong>의 물품만 기부 받습니다.
          </p>
          <p>물품 접수 후 꼼꼼하게 검수하여 바자회 물품 등록 여부를 안내해 드립니다.</p>
        </div>
      </section>

      {/* ③ 공통 불가 물품 */}
      <section className="bazaar-section">
        <h3 className="bazaar-section__title">공통 불가 물품</h3>
        <ul className="bazaar-list">
          <li><NgBadgeLg /><span className="bazaar-list__text">파손·고장·오염이 심해 재사용이 어려운 모든 물품</span></li>
          <li><NgBadgeLg /><span className="bazaar-list__text">속옷·수영복 등 위생상 재판매가 부적절한 의류</span></li>
          <li><NgBadgeLg /><span className="bazaar-list__text">개봉된 화장품, 개봉된 의약품</span></li>
          <li><NgBadgeLg /><span className="bazaar-list__text">안전 검증할 수 없는 유아용품 (카시트, 유아 침대 등)</span></li>
          <li><NgBadgeLg /><span className="bazaar-list__text">헬멧·안전장비 등 생명안전과 직결되는 스포츠 용품</span></li>
        </ul>
      </section>

      {/* ④ 품목별 기준 — 2×5 그리드 */}
      <section className="bazaar-section">
        <h3 className="bazaar-section__title">품목별 기준</h3>
        <div className="bazaar-grid">
          <CategoryCard
            title="의류"
            okText="세탁 완료, 오염 및 훼손 없는 옷"
            ngText="속옷, 수영복 등 위생상 부적절 의류"
          />
          <CategoryCard
            title="전자기기"
            okText="정상 작동, 충전기 등 부속품 포함 권장"
            ngText="파손·고장·오염이 심한 것"
          />
          <CategoryCard
            title="패션·잡화"
            okText="가방, 지갑, 벨트, 모자, 스카프 등 상태 양호한 것"
            ngText="오염·파손이 심한 것"
          />
          <CategoryCard
            title="생활용품·화장품"
            okText="미개봉 또는 사용감이 적은 물건"
            ngText="개봉된 물건은 모두 불가"
          />
          <CategoryCard
            title="도서"
            okText="낙서·파손 없이 읽을 수 있는 상태"
            ngText="찢김 등 심한 훼손으로 읽기 어려운 것"
          />
          <CategoryCard
            title="유아용품"
            okText="안전 인증 확인 가능한 상태 양호 장난감 등"
            ngText="카시트 등 안전 인증이 필요한 용품"
          />
          <CategoryCard
            title="스포츠·레저"
            okText="헬스용품, 캠핑·등산 장비, 자전거 액세서리 등"
            ngText="헬멧·안전장비 등 안전과 직결되는 용품"
          />
          <CategoryCard
            title="문구·취미"
            okText="미개봉 문구류, 아트·공예 재료, 악기 소품 등"
            ngText="개봉·사용된 소모성 재료 (물감, 잉크 등)"
          />
          <CategoryCard
            title="식물·원예"
            okText="반려식물 분양, 화분, 원예 도구 등 상태 양호한 것"
            ngText="병충해가 있거나 상태가 불량한 식물"
          />
          <CategoryCard
            title="키친·주방"
            okText="조리도구, 식기, 텀블러 등 미사용한 용품"
            ngText="파손·변형된 식기류"
          />
        </div>
      </section>

      {/* ⑤ 기부 접수 절차 */}
      <section className="bazaar-section">
        <h3 className="bazaar-section__title">기부 접수 절차</h3>
        <ol className="bazaar-list bazaar-list--steps">
          <li><StepBadge n={1} /><span className="bazaar-list__text">MS팀에게 물품 전달 → 검수 후 물품 판매 여부 판단</span></li>
          <li><StepBadge n={2} /><span className="bazaar-list__text">판매 확정 → 온라인 마켓 등록 완료</span></li>
          <li><StepBadge n={3} /><span className="bazaar-list__text">물품 기증자에게 인증서 및 씨앗키트 증정</span></li>
        </ol>
      </section>

      {/* ⑥ 마지막 안내 (가운데 정렬) */}
      <section className="bazaar-section bazaar-section--center bazaar-section--last">
        <p className="bazaar-final">
          기부된 물품의 판매 수익금은 29주년 기념 나무 심기 기부 재원으로 사용됩니다.
        </p>
      </section>
    </div>
  );
}
