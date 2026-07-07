// ============================================================================
// HeroAuction.tsx — 경매 오픈 메인 히어로 3분할 카드 (Figma node 2287-1463)
//
// [구성] 좌: 경매 NOW OPEN(라임 #E2FF54, 링크→/auction, 단일 인라인 SVG 아트)
//        중: C&R Goods Coming soon(배경 사진 + 흰 텍스트)
//        우: 펀딩 진행률 — DonationTreeGrid + DonationProgressBar (기존 재사용)
//
// [반응형] HeroBazaar와 동일 기법: 풀블리드 + container-type + min(cqw, Figma px) + 협폭 스택.
// [에셋] /home/auction-arc.svg(자원 순환 나눔) · auction-spark.svg(✳) · goods-coming.jpg
//        (arc/spark는 Figma 추출 SVG를 <image>로 재사용 → 폰트/리플로우 영향 없이 비례 스케일)
// [2026-07-08] 신규 — 경매 오픈 히어로.
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
            <svg
              className="hero-au__art"
              viewBox="0 0 600 680"
              role="img"
              aria-label="경매 NOW OPEN, 나무 심는 경매 지금 입찰하러 가기, 7/8부터 7/10까지"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 자원 — 순환 — 나눔 (곡선 아치) */}
              <image href="/home/auction-arc.svg" x="135" y="8" width="330" height="91.8" />
              {/* ✳ 스파클 (좌/우) */}
              <image href="/home/auction-spark.svg" x="2" y="104" width="140" height="141" />
              <image href="/home/auction-spark.svg" x="458" y="100" width="140" height="141" />
              {/* 경매 (Pretendard Regular 140) */}
              <text x="300" y="222" textAnchor="middle" fill="#000"
                fontFamily="'Pretendard Variable', Pretendard, sans-serif" fontWeight={400} fontSize="140">경매</text>
              {/* NOW OPEN (Instrument Sans 90) */}
              <text x="300" y="388" textAnchor="middle" fill="#000"
                fontFamily="'Instrument Sans', sans-serif" fontWeight={400} fontSize="90">NOW OPEN</text>
              {/* 나무 심는 경매 / 지금 입찰하러 가기 (Instrument Sans 36, line-height 1.3) */}
              <g fill="#000" textAnchor="middle" fontFamily="'Instrument Sans', sans-serif" fontWeight={400} fontSize="36">
                <text x="300" y="480">나무 심는 경매</text>
                <text x="300" y="527">지금 입찰하러 가기</text>
              </g>
              {/* 7/8 — 7/10 (Pretendard 32, gap 21 + 92 line) */}
              <g fill="#000" fontFamily="'Pretendard Variable', Pretendard, sans-serif" fontWeight={400} fontSize="32">
                <text x="230" y="602" textAnchor="end">7/8</text>
                <line x1="251" y1="591" x2="343" y2="591" stroke="#000" strokeWidth="2" />
                <text x="364" y="602" textAnchor="start">7/10</text>
              </g>
            </svg>
          </Link>

          {/* ── 카드 2: C&R Goods Coming soon ── */}
          <div className="hero-au__goods" aria-label="C&R Goods 준비 중">
            <img className="hero-au__goods-bg" src="/home/goods-coming.jpg" alt="" aria-hidden="true" />
            <div className="hero-au__goods-txt">
              <p>C&amp;R Goods</p>
              <p>Coming soon</p>
            </div>
          </div>

          {/* ── 카드 3: 펀딩 진행률 (기존 컴포넌트 재사용) ── */}
          <div className="hero-au__fund">
            <div className="hero-au__fund-grid">
              <DonationTreeGrid current={current} goal={goal} />
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
