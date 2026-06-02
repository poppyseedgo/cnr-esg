// ============================================================================
// WiseGuide — 슬기로운 사회생활 어워드 모달 본문 (Figma 1041:49)
//
// 구조 (인트로 + 5섹션):
//   ⓪ 인트로 (구분선 없음)         — 24px Medium/Regular 2줄
//   ① 슬기로운 사회생활, 슬사생 상이란? — 18px 본문, 인라인 SemiBold
//   ② 참여 안내                    — 3단계 ①②③
//   ③ 아이디어 항목                — 4개 카드 (bg #f0f5ff)
//       각 카드: 좌측 [아이콘(32) + 제목(20px Medium, w-300)]
//                우측 [check 리스트 (check.svg 24 + 15px Regular line 1.8)]
//   ④ 참여 일정                    — 3행 표 (구분선 없는 plain 섹션, #a7a7a7 행선)
//   ⑤ 마지막 안내                  — 가운데 정렬 (구분선 없음)
//
// 토큰:
//   - 섹션 제목 18px SemiBold line 1.3
//   - 본문 18px Regular line 1.6
//   - 카드 bg #f0f5ff, padding 16, radius 16
//   - 카드 좌측 width 300px (모바일 auto)
//   - check 리스트 항목 15px Regular line 1.8
//   - 섹션 구분선 #d2d7e1 (참여 일정·마지막 안내는 구분선 없음)
//   - 참여 일정 표: 행 py16 gap24, 라벨 190px, 행 구분선 #a7a7a7
//
// 변경 이력:
//   2026-06-01  최초 작성 — Figma 1041:49 정밀 매핑
//   2026-06-02  참여 일정 표 섹션 추가(1048:361), 마지막 안내 구분선 제거 (Figma 재대조)
//   2026-06-02  체크 아이콘 check_small.svg → check.svg, 체크리스트 items-start 정렬 (Figma 1046:84)
// ============================================================================

import './WiseGuide.css';

/** 체크 리스트 항목 (check 24 + 텍스트 15px) */
function CheckItem({ text }: { text: string }) {
  return (
    <li className="wise-check__item">
      <img
        src="/icons/check.svg"                    // ← check_small.svg → check.svg (디자이너 제공 새 아이콘)
        alt=""
        aria-hidden="true"
        width={24}
        height={24}
        className="wise-check__icon"
      />
      <span className="wise-check__text">{text}</span>
    </li>
  );
}

/** 아이디어 카드 (좌측: 아이콘+제목, 우측: 체크 리스트) */
function IdeaCard({
  icon,
  iconAlt,
  title,
  items,
}: {
  icon: string;
  iconAlt: string;
  title: string;
  items: string[];
}) {
  return (
    <div className="wise-card">
      <div className="wise-card__left">
        <img
          src={icon}
          alt={iconAlt}
          width={32}
          height={32}
          className="wise-card__icon"
        />
        <p className="wise-card__title">{title}</p>
      </div>
      <ul className="wise-check">
        {items.map((t, i) => (
          <CheckItem key={i} text={t} />
        ))}
      </ul>
    </div>
  );
}

export function WiseGuide() {
  return (
    <div className="wise-guide">
      {/* ⓪ 인트로 (구분선 없음) */}
      <div className="wise-intro">
        <p className="wise-intro__line wise-intro__line--medium">ESG의 S(Social)</p>
        <p className="wise-intro__line">나로부터 시작하는 사회공헌 아이디어</p>
      </div>

      {/* ① 슬기로운 사회생활, 슬사생 상 이란? */}
      <section className="wise-section">
        <h3 className="wise-section__title">슬기로운 사회생활, 슬사생 상 이란?</h3>
        <div className="wise-section__body">
          <p>
            <strong>사회적 가치를 개인이 일상에서 실천하거나 동참</strong>할 수 있는 <strong>아이디어</strong>를 제안하는 분에게 드리는
          </p>
          <p>
            <strong>29주년 창립기념 신규 시상</strong>입니다. 임직원 여러분의 다양한 아이디어를 사진이나 글로 공유해 주세요.{' '}
            <strong>동료들의 좋아요를 가장 많이 받은 분이 슬·사·생상의 주인공</strong>이 됩니다!
          </p>
        </div>
      </section>

      {/* ② 참여 안내 */}
      <section className="wise-section">
        <h3 className="wise-section__title">참여 안내</h3>
        <div className="wise-section__body">
          <p>① 업로드 — 개인이 실천할 수 있는 사회공헌 아이디어나 경험을 사진이나 글로 올려 주세요.</p>
          <p>② 좋아요 — 다른 동료들의 게시물을 구경하고, "나도 해봐야지!" 싶은 글에 좋아요를 눌러 주세요.</p>
          <p>③ 시상 — 좋아요를 가장 많이 받은 분에게 창립기념식에서 슬·사·생 상을 드립니다!</p>
        </div>
      </section>

      {/* ③ 아이디어 항목 — 4개 카드 */}
      <section className="wise-section">
        <h3 className="wise-section__title">아이디어 항목</h3>
        <div className="wise-cards">
          <IdeaCard
            icon="/icons/diversity_4.svg"
            iconAlt=""
            title="직장 내 배려 · 소통 아이디어"
            items={[
              '신입 직원·부서 이동자에게 먼저 다가가는 온보딩 팁',
              '팀 내 소외되는 사람 없이 소통하는 나만의 방법',
              '육아휴직·유연근무 동료를 자연스럽게 배려하는 방법',
              '감사와 칭찬을 전하는 사내 문화 아이디어',
            ]}
          />
          <IdeaCard
            icon="/icons/volunteer_activism.svg"
            iconAlt=""
            title="나눔 · 기부 실천법"
            items={[
              '"한 달에 커피 한 잔 값으로 할 수 있는 기부" 같은 꿀팁',
              '사회적 기업 제품 구매, 크라우드펀딩 참여 후기',
            ]}
          />
          <IdeaCard
            icon="/icons/psychiatry.svg"
            iconAlt=""
            title="재능기부 · 봉사활동 소개"
            items={[
              '누구나 쉽게 참여할 수 있는 기부·봉사 활동 소개',
              '헌혈, 재능기부, 중고 물품 나눔 등 본인의 경험 공유',
              '사회적 기업 제품 구매, 크라우드펀딩 참여 후기',
            ]}
          />
          <IdeaCard
            icon="/icons/handshake.svg"
            iconAlt=""
            title="지역사회 · 일상 속 동참"
            items={[
              '동네 소상공인 또는 전통시장 이용 경험',
              '이웃(독거 어르신, 한부모 가정 등)을 돕는 작은 실천',
              '교통약자 배려, 공공장소 에티켓 등 시민의식 아이디어',
              '의외로 잘 모르는 사회공헌 프로그램·캠페인 안내',
            ]}
          />
        </div>
      </section>

      {/* ④ 참여 일정 — 표 (구분선 없는 plain 섹션, Figma 1048:361) */}
      <section className="wise-section wise-section--plain">
        <h3 className="wise-section__title">참여 일정</h3>
        <div className="wise-schedule">
          <div className="wise-schedule__row">
            <p className="wise-schedule__label">후보 게시물 업로드 기한</p>
            <p className="wise-schedule__value">6/8(월) ~ 6/22(월)</p>
          </div>
          <div className="wise-schedule__row">
            <p className="wise-schedule__label">좋아요 투표</p>
            <p className="wise-schedule__value">업로드 기간 동안 좋아요 투표 진행</p>
          </div>
          <div className="wise-schedule__row">
            <p className="wise-schedule__label">결과 발표 및 시상</p>
            <p className="wise-schedule__value">6/30(화) 29주년 기념식에서 발표 및 시상(상패 및 선물)</p>
          </div>
        </div>
      </section>

      {/* ⑤ 마지막 안내 */}
      <section className="wise-section wise-section--final">
        <div className="wise-final">
          <p>거창하지 않아도 괜찮아요.</p>
          <p>여러분의 슬기로운 사회생활을 동료들과 나눠 주세요! 🌱</p>
        </div>
      </section>
    </div>
  );
}
