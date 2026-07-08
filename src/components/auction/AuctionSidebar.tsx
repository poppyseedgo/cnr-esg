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
//
// [변경 이력]
//   2026-07-08 · '나의 입찰 내역' 우측에 빨간 dot(깜빡임) 추가. 내가 입찰하거나
//              밀려났을 때(=진행 중 경매에 내 입찰 존재) 표시. useMyActiveBids 훅으로
//              판정하고, dot 스타일은 결제대기 dot(#EF4444/7px/cnrPendingBlink)과 통일.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom'; // ← [2026-07-06] 기부자 필터 URL(?donor=)
import { loadAuctionDonors, type AuctionDonor } from '@/lib/auctions';
import { useMyActiveBids } from '@/hooks/useMyActiveBids'; // ← [2026-07-08] '나의 입찰 내역' 빨간 dot 판정

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
  const [donorsOpen, setDonorsOpen] = useState(true); // ← [2026-07-06] 펼침/접힘(기본 펼침) — 아이콘이 상태 반영
  // ← [2026-07-08] 보조내비가 실제로 노출될 때(!isMobile && mainCollapsed)만 조회/구독 → 불필요 부하 0
  const { hasActiveBids } = useMyActiveBids(!isMobile && mainCollapsed);

  // ── [2026-07-06] 기부자 필터 = URL 파라미터(?donor=key1,key2) 단일 소스 ──
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKeys = (searchParams.get('donor') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const isSelected = (key: string) => selectedKeys.includes(key);
  const toggleDonor = (key: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const cur = (p.get('donor') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      if (next.length === 0) p.delete('donor'); else p.set('donor', next.join(','));
      return p;
    }, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    loadAuctionDonors()
      .then((d) => { if (alive) setDonors(d); })
      .catch(console.error);
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', fontFamily: "'Pretendard', system-ui, sans-serif" }}>
      {/* ── 타이틀 "나무심는 경매" (Figma 56px) — 경매 리스트(/auction) 링크 ── */}
      <h1
        style={{
          margin: 0, fontWeight: 400, color: '#111', letterSpacing: '-0.5px',
          fontSize: isMobile ? 'clamp(36px, 11vw, 56px)' : 56, lineHeight: 1.2,
        }}
      >
        <Link to="/auction" style={{ color: 'inherit', textDecoration: 'none' }}>
          나무심는<br />경매
        </Link>
      </h1>

      {/* ── 경매 물품 기부자 (펼침/접힘 토글) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <button
          type="button"
          onClick={() => setDonorsOpen((v) => !v)}
          aria-expanded={donorsOpen}
          style={{
            display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          <ToggleMark open={donorsOpen} />
          <span style={{ fontSize: 24, lineHeight: 1.4, color: '#111', whiteSpace: 'nowrap' }}>
            경매 물품 기부자
          </span>
        </button>

        {donorsOpen && donors.length > 0 && (
          <div
            className={isMobile ? 'chip-scroll-row' : undefined}
            style={isMobile ? undefined : { display: 'flex', flexWrap: 'wrap', gap: 8 }}
          >
            {donors.map((d) => {
              const sel = isSelected(d.key);
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDonor(d.key)}
                  aria-pressed={sel}
                  title={sel ? `${d.name} 필터 해제` : `${d.name}님 기부 물품만 보기`}
                  style={{
                    ...donorChipStyle,
                    cursor: 'pointer',
                    background: sel ? '#000' : '#fff', // 선택=검정 채움(Figma), 미선택=테두리
                    color: sel ? '#fff' : '#111',
                  }}
                >
                  {d.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 보조내비 (데스크톱 사이드바 + 메인 접힘일 때만) ── */}
      {!isMobile && mainCollapsed && (
        <nav style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {AUCTION_NAV.map((item) => {
            const showBidDot = item.to === '/mypage/bidding' && hasActiveBids; // ← [2026-07-08] 내 진행중 입찰 있으면 dot
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, // ← [2026-07-08] dot 배치용 flex(라벨 우측)
                  padding: '8px 0', fontSize: 24, lineHeight: 1.25, color: '#848484',
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                {item.label}
                {/* ← [2026-07-08] 내가 입찰/밀려남(진행중) 빨간 dot — 결제대기 dot 과 동일 스타일 통일 */}
                {showBidDot && (
                  <span
                    aria-label="진행 중인 내 입찰 있음"
                    style={{
                      width: 7, height: 7, borderRadius: '50%', background: '#EF4444',
                      display: 'inline-block', alignSelf: 'flex-start', marginTop: 2,
                      animation: 'cnrPendingBlink 1s ease-in-out infinite',
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

// 기부자 칩 (Figma: border 1px #000, rounded 999, px16 py4, 14px). 클릭=필터 토글.
const donorChipStyle: React.CSSProperties = {
  border: '1px solid #000', borderRadius: 999, padding: '4px 16px',
  fontSize: 14, lineHeight: 1.4, color: '#111', background: '#fff', whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};

// 펼침/접힘 마커 (Figma 2215:77, 20px). 열림=− / 닫힘=+ 로 상태를 반영.
function ToggleMark({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M3 10h14" stroke="#111" strokeWidth="1.6" strokeLinecap="round" />
      {!open && <path d="M10 3v14" stroke="#111" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}
