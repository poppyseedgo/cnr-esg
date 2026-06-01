// ============================================================================
// HomeHero — 홈 풀블리드 포스터 그리드 (Figma node 914:1700, 실측 1:1)
//
// 구조: 8개 타일(사진4 + 포스터4) 체커보드, 4열(>=1000px) / 2열(<1000px)
//   Row1: [사진] [브랜드 #00422b] [사진] [바자회+경매 #8ce229]
//   Row2: [슬기로운 #8ce229] [사진] [제로웨이스트 #00422b] [사진]
//
// 레이아웃/스케일/애니메이션은 전부 HomeHero.css (JS 0줄, cqw 비례 스케일).
//
// 일러스트: Figma export SVG (public/home/*.svg) — clover/arrow/zerobag.
//   색이 SVG 내부에 박혀 있어 <img>로 그대로 렌더. 곡선 텍스트만 인라인 SVG(텍스트).
// 사진 타일: CSS background-image(/home/home-01~04.jpg). 없으면 크림(#f7eee2) 폴백.
//
// 포스터 타일 클릭 = 행사안내 모달 오픈 (?modal=bazaar|wise|zero, URL 동기화)
//   - 바자회+경매 → 'bazaar' 참여안내
//   - 슬기로운    → 'wise'   참여안내+투표
//   - 제로웨이스트 → 'zero'  참여안내+투표
//   - 브랜드/사진 타일은 클릭 없음
//
// 변경 이력:
//   2026-05-28  최초 작성
//   2026-05-28  Figma 실측 전면 정정 + 일러스트 SVG 적용
//   2026-05-28  포스터 클릭 → 모달 연결(useSearchParams URL 동기화, EventModal 주입)
// ============================================================================

import { useSearchParams } from 'react-router-dom';
import { EventModal } from './EventModal';
import { isEventModalKey, type EventModalKey } from './eventModalContent';
import './HomeHero.css';

export function HomeHero() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawModal = searchParams.get('modal');
  const activeModal: EventModalKey | null = isEventModalKey(rawModal) ? rawModal : null;

  // 모달 열기: ?modal=<key> 세팅 (뒤로가기 시 닫히도록 history push)
  const openModal = (key: EventModalKey) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('modal', key);
        return next;
      },
      { replace: false },
    );
  };

  // 모달 닫기: modal 파라미터 제거
  const closeModal = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('modal');
        return next;
      },
      { replace: false },
    );
  };

  return (
    <>
    <section className="esg-hero" aria-label="C&R 29주년 ESG 이벤트 주요 활동">
      <div className="esg-hero__inner">
        <div className="esg-hero__grid">

          {/* ── Row 1 ───────────────────────────────────────── */}

          {/* R1C1 — 사진 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-01.jpg')" }}
            />
          </div>

          {/* R1C2 — 브랜드 (#00422b) — 슬로건 위, 로고 아래 (Figma 927) */}
          <div className="esg-hero__tile esg-hero__brand">
            <div className="esg-hero__fg">
              <div className="esg-hero__brand-slogan">
                <div className="esg-hero__brand-ko">사람의 건강을 지원하는 나의 사명</div>
                <div className="esg-hero__brand-ko">지구의 건강을 지키는 우리의 실천</div>
              </div>
              <img className="esg-hero__brand-logo esg-hero__zoom" src="/home/cnr-research.svg" alt="C&amp;R RESEARCH" />
            </div>
          </div>

          {/* R1C3 — 사진 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-02.jpg')" }}
            />
          </div>

          {/* R1C4 — 바자회 + 경매 (#8ce229) → 참여안내 모달 */}
          <div
            className="esg-hero__tile esg-hero__bazaar esg-hero__clickable"
            role="button"
            tabIndex={0}
            aria-label="바자회·경매 참여안내 보기"
            onClick={() => openModal('bazaar')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal('bazaar'); } }}
          >
            <div className="esg-hero__fg">
              {/* 상단 2컬럼 */}
              <div className="esg-hero__bazaar-row">
                <div className="esg-hero__bazaar-col">
                  <div className="esg-hero__bazaar-ttl">2026<br />C&amp;R 창립기념<br />바자회</div>
                  <p className="esg-hero__bazaar-date">6/30 — 7/8</p>
                </div>
                <div className="esg-hero__bazaar-col">
                  <div className="esg-hero__bazaar-ttl">2026<br />C&amp;R 창립기념<br />경매</div>
                  <p className="esg-hero__bazaar-date">7/8 — 7/10</p>
                </div>
              </div>

              {/* 화살표 + Online Charity Market + Bazzar&Auction + 날짜 통합 SVG (Figma export) */}
              <img className="esg-hero__bazaar-emblem" src="/home/charity-arrow.svg" alt="Online Charity Market — 2026 Bazzar & Auction, 6/30—7/10" />
            </div>
          </div>

          {/* ── Row 2 ───────────────────────────────────────── */}

          {/* R2C1 — 슬기로운 사회생활 어워드 (#8ce229) → 참여안내+투표 모달 */}
          <div
            className="esg-hero__tile esg-hero__wise esg-hero__clickable"
            role="button"
            tabIndex={0}
            aria-label="슬기로운 사회생활 어워드 참여안내 보기"
            onClick={() => openModal('wise')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal('wise'); } }}
          >
            <div className="esg-hero__fg">
              <p className="esg-hero__wise-h">슬기로운 사회생활<br />어워드</p>
            </div>
          </div>

          {/* R2C2 — 사진 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-03.jpg')" }}
            />
          </div>

          {/* R2C3 — 제로 웨이스트 어워드 (#00422b) → 참여안내+투표 모달 */}
          <div
            className="esg-hero__tile esg-hero__zero esg-hero__clickable"
            role="button"
            tabIndex={0}
            aria-label="제로 웨이스트 어워드 참여안내 보기"
            onClick={() => openModal('zero')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal('zero'); } }}
          >
            {/* 봉투 SVG (Figma export) — fg 밖 절대배치라 텍스트와 겹침 */}
            <img className="esg-hero__zero-bag esg-hero__zoom" src="/home/zerobag.svg" alt="" aria-hidden="true" />
            <div className="esg-hero__fg">
              {/* 상단 제목 */}
              <div>
                <img className="esg-hero__zero-logo esg-hero__zoom" src="/home/zerowaste-logo.svg" alt="ZERO WASTE" />
                <p className="esg-hero__zero-ko">제로 웨이스트 어워드</p>
              </div>
              {/* 하단 캡션 (봉투는 위에서 절대배치로 중앙 영역 채움) */}
              <div className="esg-hero__zero-caps">
                <div className="esg-hero__zero-cap-grp">
                  <p className="esg-hero__zero-cap1">후보자 추천 및 좋아요 투표</p>
                  <p className="esg-hero__zero-cap1-en">6/8 — 6/22</p>
                </div>
                <p className="esg-hero__zero-cap2">
                  <span className="d">6/30</span>
                  <span className="k">창립기념일 행사에서 시상</span>
                </p>
              </div>
            </div>
          </div>

          {/* R2C4 — 사진 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-04.jpg')" }}
            />
          </div>

        </div>
      </div>
    </section>

    {/* 행사안내 모달 (?modal=bazaar|wise|zero) */}
    {activeModal && <EventModal modalKey={activeModal} onClose={closeModal} />}
    </>
  );
}
