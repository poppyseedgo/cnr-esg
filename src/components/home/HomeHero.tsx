// ============================================================================
// HomeHero — 홈 풀블리드 포스터 그리드 (Figma node 914:1700)
//
// 구조: 8개 타일 (사진 4 + 포스터 4) 체커보드 배치, 4열(>=1000px) / 2열(<1000px)
//   Row1: [사진] [브랜드 #00422b] [사진] [바자회+경매 #8ce229 → /bazaar]
//   Row2: [슬기로운 #8ce229 → /posts/wise-life] [사진] [제로웨이스트 #00422b → /posts/zero-waste] [사진]
//
// 레이아웃/스케일/애니메이션은 전부 HomeHero.css 에서 처리 (JS 0줄).
//   - 비율 유지   : aspect-ratio 480/562
//   - 비례 스케일 : container-type + cqw (타일 너비 %로 글자/여백)
//   - 풀블리드    : width:100vw + translateX(-50%) (AppLayout overflow-x:clip 과 짝)
//
// 사진 타일: CSS background-image(/home/*.jpg). 파일 없으면 크림색(#f7eee2) 폴백.
//            → public/home/ 에 사진 4장 배치 시 자동 적용 (home-01 ~ home-04).
// 일러스트 : 인라인 SVG(즉시 렌더). 추후 Figma export 로 교체 가능.
//
// 변경 이력:
//   2026-05-28  최초 작성 (Phase 6 홈 포스터 그리드)
// ============================================================================

import { Link } from 'react-router-dom';
import './HomeHero.css';

export function HomeHero() {
  return (
    <section className="esg-hero" aria-label="C&R 29주년 ESG 이벤트 주요 활동">
      <div className="esg-hero__inner">
        <div className="esg-hero__grid">

          {/* ── Row 1 ───────────────────────────────────────────── */}

          {/* R1C1 — 사진 타일 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-01.jpg')" }}
            />
          </div>

          {/* R1C2 — 브랜드 메시지 (#00422b) */}
          <div className="esg-hero__tile esg-hero__brand">
            <div className="esg-hero__fg">
              <p className="esg-hero__brand-en">C&amp;R RESEARCH</p>
              <div>
                <p className="esg-hero__brand-ko">사람의 건강을 지원하는 나의 사명</p>
                <p className="esg-hero__brand-ko">지구의 건강도 지키는 우리의 실천</p>
              </div>
            </div>
          </div>

          {/* R1C3 — 사진 타일 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-02.jpg')" }}
            />
          </div>

          {/* R1C4 — 바자회 + 경매 (#8ce229) → /bazaar */}
          <Link to="/bazaar" className="esg-hero__tile esg-hero__bazaar">
            <div className="esg-hero__fg">
              {/* 상단: 바자회 / 경매 2컬럼 */}
              <div className="esg-hero__bazaar-row">
                <div className="esg-hero__bazaar-col">
                  <div className="esg-hero__bazaar-ttl">
                    2026<br />창립기념<br />ESG 온라인 바자회
                  </div>
                  <p className="esg-hero__bazaar-date">6/30 — 7/10</p>
                </div>
                <div className="esg-hero__bazaar-col">
                  <div className="esg-hero__bazaar-ttl">
                    2026<br />창립기념<br />ESG 온라인 경매
                  </div>
                  <p className="esg-hero__bazaar-date">6/30 — 7/10</p>
                </div>
              </div>

              {/* 중앙 엠블럼: 곡선 텍스트 + 화살표 (추후 Figma export 교체 가능) */}
              <svg
                className="esg-hero__bazaar-emblem esg-hero__zoom"
                viewBox="0 0 220 96"
                fill="none"
                aria-hidden="true"
              >
                <defs>
                  <path id="esgOcmArc" d="M22 70 A 110 110 0 0 1 198 70" fill="none" />
                </defs>
                <text
                  fontFamily="'Instrument Sans', sans-serif"
                  fontSize="15"
                  letterSpacing="1.5"
                  fill="#0d2e16"
                >
                  <textPath href="#esgOcmArc" startOffset="50%" textAnchor="middle">
                    Online Charity Market
                  </textPath>
                </text>
                <line x1="78" y1="78" x2="142" y2="78" stroke="#0d2e16" strokeWidth="3" />
                <path
                  d="M134 70 L144 78 L134 86"
                  fill="none"
                  stroke="#0d2e16"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* 하단: Bazzar & Auction */}
              <div>
                <p className="esg-hero__bazaar-foot">
                  2026<br />Bazzar &amp; Auction
                </p>
                <p className="esg-hero__bazaar-date" style={{ marginTop: '2cqw' }}>
                  6/30 — 7/10
                </p>
              </div>
            </div>
          </Link>

          {/* ── Row 2 ───────────────────────────────────────────── */}

          {/* R2C1 — 슬기로운 사회생활 어워드 (#8ce229) → /posts/wise-life */}
          <Link to="/posts/wise-life" className="esg-hero__tile esg-hero__wise">
            <div className="esg-hero__fg">
              <p className="esg-hero__award-h">
                슬기로운 사회생활<br />어워드
              </p>
            </div>
          </Link>

          {/* R2C2 — 사진 타일 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-03.jpg')" }}
            />
          </div>

          {/* R2C3 — 제로 웨이스트 어워드 (#00422b) → /posts/zero-waste */}
          <Link to="/posts/zero-waste" className="esg-hero__tile esg-hero__zero">
            <div className="esg-hero__fg">
              {/* 상단 제목 */}
              <div>
                <p className="esg-hero__zero-en">ZERO WASTE</p>
                <p className="esg-hero__award-h" style={{ color: '#fff' }}>
                  제로 웨이스트 어워드
                </p>
              </div>

              {/* 중앙 봉투 일러스트 (추후 Figma export 교체 가능) */}
              <svg
                className="esg-hero__zero-bag esg-hero__zoom"
                viewBox="0 0 120 130"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M40 42 V30 a20 20 0 0 1 40 0 V42"
                  stroke="#fff"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M26 42 H94 L87 122 H33 Z"
                  stroke="#fff"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
                <line x1="30" y1="82" x2="90" y2="82" stroke="#beff9b" strokeWidth="5" />
              </svg>

              {/* 하단 캡션 */}
              <div className="esg-hero__gap8">
                <div className="esg-hero__gap2">
                  <p className="esg-hero__zero-cap1">후보자 추천 및 좋아요 투표</p>
                  <p className="esg-hero__zero-cap1">6/8 — 6/22</p>
                </div>
                <p className="esg-hero__zero-cap2">
                  <b>6/30</b> 창립기념일 행사에서 시상
                </p>
              </div>
            </div>
          </Link>

          {/* R2C4 — 사진 타일 */}
          <div className="esg-hero__tile" aria-hidden="true">
            <div
              className="esg-hero__bg esg-hero__photo esg-hero__zoom"
              style={{ backgroundImage: "url('/home/home-04.jpg')" }}
            />
          </div>

        </div>
      </div>
    </section>
  );
}
