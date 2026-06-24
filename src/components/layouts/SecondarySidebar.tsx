// ============================================================================
// SecondarySidebar — 두 단계 사이드바의 '2차 패널'(400px, 데스크톱 전용)
//
// [변경 이력]
//   2026-06-24  [Task 1] 신규. 89px 레일(EsgSideNav 접힘) 옆에 열리는 컨텍스트
//               패널. 바자회/경매 라우트에서 AppLayout이 렌더.
//
// [설계]
//   · 타이틀 + <BazaarFilters/> + (조건부)보조내비 로 구성.
//   · 보조내비(Cart/찜/My Account/Notification)는 메인 사이드바가 '접힘'일 때만
//     노출 — 펼치면 메인 사이드바(EsgSideNav)가 동일 내비를 가지므로 중복 제거.
//     (사용자 결정 ③: 둘 다 펼치면 보조내비는 1차 패널에만)
//   · 데스크톱(≥1024)에서만 노출 — index.css .secondary-sidebar 가 <1024 숨김.
//
// [Figma SSOT] node 1563:252 — pt24 pl24 pr40 pb20, gap24 / 보조내비 text 24px #848484
// ============================================================================

import { Link } from 'react-router-dom';
import { BazaarFilters } from '@/components/bazaar/BazaarFilters';
import { useNavCounts } from '@/hooks/useNavCounts'; // ← [2026-06-24] 1차 사이드바와 동일 카운트 공유

interface SecondarySidebarProps {
  /** 메인 사이드바(EsgSideNav) 접힘 여부. 펼침이면 보조내비를 숨긴다. */
  mainCollapsed: boolean;
}

const SECONDARY_NAV: Array<{ to: string; label: string }> = [
  { to: '/cart', label: 'Cart' },
  { to: '/mypage/wishlist', label: '찜' },
  { to: '/mypage', label: 'My Account' },
  { to: '/notifications', label: 'Notification' },
];

export function SecondarySidebar({ mainCollapsed }: SecondarySidebarProps) {
  const { cartCount, unread, wishlistCount } = useNavCounts(); // ← [2026-06-24] 1차 사이드바와 동일 소스

  // 라벨별 카운트 매핑(Cart=장바구니 / 찜=위시리스트 / Notification=미읽음). 나머지는 없음.
  const countFor = (label: string): number | undefined =>
    label === 'Cart' ? cartCount : label === '찜' ? wishlistCount : label === 'Notification' ? unread : undefined;

  return (
    <aside
      className="secondary-sidebar"
      style={{
        width: 400, flexShrink: 0, alignSelf: 'flex-start',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        boxSizing: 'border-box', padding: '24px 40px 20px 24px',
        background: '#fff', borderRight: '1px solid #eee',
        display: 'flex', flexDirection: 'column', gap: 24,
        fontFamily: "'Pretendard', system-ui, sans-serif",
      }}
    >
      {/* 필터(타이틀 포함) */}
      <BazaarFilters showTitle />

      {/* 보조내비 — 메인 사이드바 접힘일 때만(펼치면 1차 패널이 가짐) */}
      {mainCollapsed && (
        <nav style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {SECONDARY_NAV.map((item) => {
            const count = countFor(item.label); // ← [2026-06-24] 1차와 동일 카운트
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 0', fontSize: 24, lineHeight: 1.25, color: '#848484',
                  textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                {item.label}
                {typeof count === 'number' && count > 0 && <CountBadge n={count} />}
              </Link>
            );
          })}
        </nav>
      )}
    </aside>
  );
}

// ── 빨간 카운트 배지 (1차 사이드바 CountBadge와 동일 스타일: #EF4444 / 흰 텍스트) ──
function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span style={{
      minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
      background: '#EF4444', color: '#FFFFFF', fontSize: 10, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box', lineHeight: 1,
    }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}
