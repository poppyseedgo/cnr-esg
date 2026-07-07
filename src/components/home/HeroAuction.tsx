// ============================================================================
// HeroAuction.tsx — 경매 오픈 메인 히어로 3분할 카드 (Figma 2287-1463 / 카드1 2290-56)
//
// [구성] 좌: 경매 NOW OPEN(#E2FF54, 링크→/auction)  중: C&R Goods Coming soon(배경사진)
//        우: 펀딩 진행률 — DonationTreeGrid(8열) + DonationProgressBar (기존 재사용)
//
// [정렬] 카드1은 flex-col + justify-between(Figma 2290-56 그대로): deco / NOW OPEN / (부제+날짜)
//        deco(아치+✳+경매)만 단일 SVG로 묶어 요소 정렬 고정, 나머지는 cqw 텍스트.
//        폭은 3개 모두 CSS Grid 1fr = 완전 동일.
// [2026-07-08] 재작성 — 카드 폭 균등 · 카드1 정렬 정밀화 · 펀딩 나무 확대(8열).
// ============================================================================

import { Link } from 'react-router-dom';
import { useDonationStatus } from '@/hooks/useDonationStatus';
import { DonationTreeGrid } from '@/components/donation/DonationTreeGrid';
import { DonationProgressBar } from '@/components/donation/DonationProgressBar';
import './HeroAuction.css';

export function HeroAuction() {
  const { current, goal } = useDonationStatus();

  return (
    <section className="hero-au" aria-label="나무 심는 경매 오픈 안내 및 모금 현황">
      <div className="hero-au__inner">
        <div className="hero-au__box">
          {/* ── 카드 1: 경매 NOW OPEN (카드 전체 = /auction 링크) ── */}
          <Link to="/auction" className="hero-au__auction" aria-label="나무 심는 경매 지금 입찰하러 가기">
            {/* deco: 아치 + ✳스파클(좌/우) + 경매 (Figma 2290-57, 594.5×242.96 비율 고정) */}
            <div className="hero-au__deco">
              <svg viewBox="0 0 594.522 242.96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <image href="/home/auction-arc.svg" x="130.72" y="0" width="330.373" height="91.813" />
                <image href="/home/auction-spark.svg" x="0" y="84.96" width="156.522" height="157.999" />
                <image href="/home/auction-spark.svg" x="438" y="79.96" width="156.522" height="157.999" />
                <text x="316" y="196" textAnchor="middle" fill="#000"
                  fontFamily="'Pretendard Variable', Pretendard, sans-serif" fontWeight={400} fontSize="140">경매</text>
              </svg>
            </div>

            {/* NOW OPEN (Instrument Sans 90 / 1.25) */}
            <p className="hero-au__nowopen">NOW OPEN</p>

            {/* 부제 + 날짜 (gap 20) */}
            <div className="hero-au__cta">
              <p className="hero-au__subtitle">나무 심는 경매<br />지금 입찰하러 가기</p>
              <div className="hero-au__dates">
                <span>7/8</span>
                <span className="hero-au__dline" aria-hidden="true" />
                <span>7/10</span>
              </div>
            </div>
          </Link>

          {/* ── 카드 2: C&R Goods Coming soon (링크 → /goods) ── */}
          <Link to="/goods" className="hero-au__goods" aria-label="C&R Goods 보러가기">
            <img className="hero-au__goods-bg" src="/home/goods-coming.jpg" alt="" aria-hidden="true" />
            <div className="hero-au__goods-txt">
              <p>C&amp;R Goods</p>
              <p>Coming soon</p>
            </div>
          </Link>

          {/* ── 카드 3: 펀딩 진행률 (기존 컴포넌트 재사용, 8열로 확대) ── */}
          <div className="hero-au__fund">
            <div className="hero-au__fund-grid">
              <DonationTreeGrid current={current} goal={goal} cols={8} />
            </div>
            <div className="hero-au__fund-bar">
              <DonationProgressBar current={current} goal={goal} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroAuction;
