// ============================================================================
// AuctionSidebar — 경매 페이지 전용 사이드바 콘텐츠
//
// [Figma SSOT] node 2215:66 (데스크톱 사이드바) / 2225:1171 (모바일 상단 섹션)
//   · 타이틀 "나무심는 경매" (Pretendard 56px)
//   · "경매 물품 기부자" 섹션 — 임직원 기부자 칩(중복 제거, 테두리 라운드 999)
//   · 보조내비 — 나의 입찰 내역 / My Account / Notification (데스크톱 사이드바 전용)
//
// [배치]
//   · 데스크톱(≥1024): SecondarySidebar(2차 패널) 안에서 variant="sidebar" (칩 wrap + 보조내비)
//   · 모바일(<1024):   AuctionPage 상단 섹션에서 variant="mobile" (칩 가로 스크롤, 보조내비 없음)
//     — 바자회의 BazaarFilters(사이드바/모바일 이중 배치)와 동일한 패턴.
//
// [데이터] loadAuctionDonors() — esg_auctions.donor_name_snapshot(경매 기부자 SSOT) 중복 제거.
//   20260706_auction_donor 마이그레이션 적용 후 채워짐(미적용 시 명단 비어도 안전).
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAuctionDonors, type AuctionDonor } from '@/lib/auctions';

interface AuctionSidebarProps {
  /** sidebar=데스크톱 2차 패널(칩 wrap + 보조내비) / mobile=페이지 상단(칩 가로 스크롤) */
  variant: 'sidebar' | 'mobile';
  /** 데스크톱: 메인 사이드바 접힘일 때만 보조내비 노출(펼치면 1차 패널이 내비를 가짐). */
  mainCollapsed?: boolean;
}

// 보조내비 (Figma 2215:134) — 경매 전용 항목
const AUCTION_NAV: Array<{ to: string; label: string }> = [
  { to: '/mypage/bidding', label: '나의 입찰 내역' },
  { to: '/mypage', label: 'My Account' },
  { to: '/notifications', label: 'Notification' },
];

export function AuctionSidebar({ variant, mainCollapsed = false }: AuctionSidebarProps) {
  const isMobile = variant === 'mobile';
  const [donors, setDonors] = useState<AuctionDonor[]>([]);

  useEffect(() => {
    let alive = true;
    loadAuctionDonors()
      .then((d) => { if (alive) setDonors(d); })
      .catch(console.error);
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', fontFamily: "'Pretendard', system-ui, sans-serif" }}>
      {/* ── 타이틀 "나무심는 경매" (Figma 56px) ── */}
      <h1
        style={{
          margin: 0, fontWeight: 400, color: '#111', letterSpacing: '-0.5px',
          fontSize: isMobile ? 'clamp(36px, 11vw, 56px)' : 56, lineHeight: 1.2,
        }}
      >
        나무심는<br />경매
      </h1>

      {/* ── 경매 물품 기부자 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0' }}>
          <PlusMark />
          <span style={{ fontSize: 24, lineHeight: 1.4, color: '#111', whiteSpace: 'nowrap' }}>
            경매 물품 기부자
          </span>
        </div>

        {donors.length > 0 && (
          <div
            className={isMobile ? 'chip-scroll-row' : undefined}
            style={isMobile ? undefined : { display: 'flex', flexWrap: 'wrap', gap: 8 }}
          >
            {donors.map((d) => (
              <span key={d.key} style={donorChipStyle}>
                {d.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── 보조내비 (데스크톱 사이드바 + 메인 접힘일 때만) ── */}
      {!isMobile && mainCollapsed && (
        <nav style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {AUCTION_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              style={{
                padding: '8px 0', fontSize: 24, lineHeight: 1.25, color: '#848484',
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

// 기부자 칩 (Figma: border 1px #000, rounded 999, px16 py4, 14px)
const donorChipStyle: React.CSSProperties = {
  border: '1px solid #000', borderRadius: 999, padding: '4px 16px',
  fontSize: 14, lineHeight: 1.4, color: '#111', background: '#fff', whiteSpace: 'nowrap',
};

// "+" 마커 (Figma 2215:77, 20px). 단순 플러스 — 커스텀 SVG 교체 가능.
function PlusMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M10 3v14M3 10h14" stroke="#111" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
