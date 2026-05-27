// ============================================================================
// Header — Figma node 896:337 정확 반영
//
// 사양 (Figma 신규):
//   - py 12px (사용자 요청)
//   - max-w 1400px, gap(로고↔메뉴) 156px, 메뉴 사이 gap 2px
//   - 모든 메뉴 텍스트 15px Regular
//   - 어드민 메뉴: text #BEFF9B + SemiBold
//   - 진행중 배지: px8 py2, rounded 999, 10px Medium
//
// 동적 배지 규칙:
//   어워드 (zero_waste / wise_life):
//     - before        → "준비중" (회색)
//     - active + D>2일 → "진행중" (라임)
//     - active + D=1   → "내일 마감" (라임)
//     - active + D=0   → "오늘 마감" (라임)
//     - closed         → "시상완료" (회색)
//   상거래 (bazaar / auction):
//     - before        → "준비중" (회색)
//     - active + D>2일 → "D-N" (회색)
//     - active + D=1   → "내일 마감" (라임)
//     - active + D=0   → "오늘 마감" (라임)
//     - closed         → "종료" (회색)
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventPhase } from '@/hooks/useEventPhase';
import { signInWithMicrosoft } from '@/lib/auth';
import { getCartCount, subscribeMyCart, onCartChanged } from '@/lib/cart';
import type { EsgActivityStatus, EsgActivityPeriod } from '@/types/esg';

// ============================================================================
// 디자인 토큰
// ============================================================================

const C = {
  bg: '#000000',
  text: '#FFFFFF',
  badgeActive: '#98F7B6',    // 라임 (진행중/임박)
  badgeNeutral: '#BDBDBD',   // 회색 (D-N, 종료, 준비중)
  badgeText: '#000000',
  adminText: '#BEFF9B',
  hoverBg: 'rgb(109, 237, 115)',
  hoverText: '#000000',
  cartBadge: '#EF4444',      // 빨강 (장바구니 카운트)
  divider: '#374151',
};

const FONT_PRETENDARD = "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ============================================================================
// 배지 규칙
// ============================================================================

type ActivityKind = 'award' | 'commerce';

interface BadgeInfo {
  text: string;
  bg: string;
  color: string;
  show: boolean;
}

/**
 * D-day 계산: 양수면 남은 일수, 0이면 오늘, 음수면 종료
 * KST 기준 자정 차이로 계산 (시각 무관하게 "며칠 남았는가")
 */
function calcDayDiff(endIso: string | undefined): number | null {
  if (!endIso) return null;
  const end = new Date(endIso);
  const now = new Date();
  // KST 자정 기준 (UTC+9)
  const kstOffset = 9 * 60 * 60 * 1000;
  const endKst = new Date(end.getTime() + kstOffset);
  const nowKst = new Date(now.getTime() + kstOffset);
  const endDay = Math.floor(endKst.getTime() / (1000 * 60 * 60 * 24));
  const nowDay = Math.floor(nowKst.getTime() / (1000 * 60 * 60 * 24));
  return endDay - nowDay;
}

function getBadge(
  status: EsgActivityStatus,
  period: EsgActivityPeriod | undefined,
  kind: ActivityKind
): BadgeInfo {
  // 종료
  if (status === 'closed') {
    return {
      text: kind === 'award' ? '시상완료' : '종료',
      bg: C.badgeNeutral,
      color: C.badgeText,
      show: true,
    };
  }
  // 시작 전
  if (status === 'before') {
    return { text: '준비중', bg: C.badgeNeutral, color: C.badgeText, show: true };
  }
  // active - D-day 계산
  const dDay = calcDayDiff(period?.ends_at_utc);
  if (dDay === null) {
    // 기간 정보 없음 → 단순 active 표시
    return kind === 'award'
      ? { text: '진행중', bg: C.badgeActive, color: C.badgeText, show: true }
      : { text: '진행중', bg: C.badgeActive, color: C.badgeText, show: true };
  }
  if (dDay <= 0) {
    return { text: '오늘 마감', bg: C.badgeActive, color: C.badgeText, show: true };
  }
  if (dDay === 1) {
    return { text: '내일 마감', bg: C.badgeActive, color: C.badgeText, show: true };
  }
  // D-2 이상
  if (kind === 'award') {
    return { text: '진행중', bg: C.badgeActive, color: C.badgeText, show: true };
  }
  return { text: `D-${dDay}`, bg: C.badgeNeutral, color: C.badgeText, show: true };
}

// ============================================================================
// 메인
// ============================================================================

export function Header() {
  const { currentUser, signOut, isAdmin } = useCurrentUser();
  const { getActivity } = useEventPhase();
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setCartCount(0);
      return;
    }
    const userId = currentUser.id;
    const refresh = () => {
      getCartCount(userId)
        .then(setCartCount)
        .catch((e) => console.error('[Header] cart count error:', e));
    };
    refresh();
    const cleanupRT = subscribeMyCart(userId, refresh);
    const cleanupEv = onCartChanged(refresh);
    return () => {
      cleanupRT();
      cleanupEv();
    };
  }, [currentUser?.id]);

  // 활동별 배지 계산
  const zeroWaste = getActivity('zero_waste');
  const wiseLife = getActivity('wise_life');
  const bazaar = getActivity('bazaar');
  const auction = getActivity('auction');

  const zeroWasteBadge = getBadge(zeroWaste.status, zeroWaste.period, 'award');
  const wiseLifeBadge = getBadge(wiseLife.status, wiseLife.period, 'award');
  const bazaarBadge = getBadge(bazaar.status, bazaar.period, 'commerce');
  const auctionBadge = getBadge(auction.status, auction.period, 'commerce');

  const handleLogin = () => {
    signInWithMicrosoft().catch((e) => {
      console.error('login failed:', e);
      alert('로그인을 시작할 수 없습니다.');
    });
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: C.bg,
        color: C.text,
        fontFamily: FONT_PRETENDARD,
        padding: '12px 0',
      }}
    >
      <div
        style={{
          maxWidth: 1920,
          width: '100%',
          margin: '0 auto',
          padding: isMobile ? '0 16px' : '0 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        {/* 좌측: 로고 + 메뉴 (gap 156px) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 156 }}>
          <Logo />
          {!isMobile && (
            <DesktopMenu
              zeroWasteBadge={zeroWasteBadge}
              wiseLifeBadge={wiseLifeBadge}
              bazaarBadge={bazaarBadge}
              auctionBadge={auctionBadge}
              isAdmin={isAdmin}
            />
          )}
        </div>

        {/* 우측: 아이콘 + 아바타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {currentUser && <CartIcon cartCount={cartCount} />}
          {currentUser && <NotificationIconPlaceholder />}
          {currentUser ? (
            <UserAvatar
              currentUser={currentUser}
              isAdmin={isAdmin}
              onSignOut={() => signOut().catch(console.error)}
              isMobile={isMobile}
            />
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              style={{
                padding: '8px 16px',
                background: C.badgeActive,
                color: C.badgeText,
                border: 'none',
                borderRadius: 100,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                fontFamily: FONT_PRETENDARD,
                lineHeight: 1.25,
              }}
            >
              로그인
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="메뉴 열기"
              style={{
                width: 32,
                height: 32,
                background: 'transparent',
                border: 'none',
                color: C.text,
                cursor: 'pointer',
                fontSize: 22,
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          )}
        </div>
      </div>

      {isMobile && mobileOpen && (
        <MobileMenu
          zeroWasteBadge={zeroWasteBadge}
          wiseLifeBadge={wiseLifeBadge}
          bazaarBadge={bazaarBadge}
          auctionBadge={auctionBadge}
          isAdmin={isAdmin}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}

// ============================================================================
// 로고 (160x40 SVG, 텍스트 포함 통합)
// ============================================================================

function Logo() {
  return (
    <Link
      to="/"
      style={{
        display: 'flex',
        alignItems: 'center',
        textDecoration: 'none',
        flexShrink: 0,
      }}
      aria-label="C&R ESG 홈"
    >
      <img
        src="/logo.svg"
        alt="C&R ESG"
        style={{
          width: 160,
          height: 40,
          display: 'block',
        }}
      />
    </Link>
  );
}

// ============================================================================
// 데스크탑 메뉴 (gap 2px)
// ============================================================================

interface DesktopMenuProps {
  zeroWasteBadge: BadgeInfo;
  wiseLifeBadge: BadgeInfo;
  bazaarBadge: BadgeInfo;
  auctionBadge: BadgeInfo;
  isAdmin: boolean;
}

function DesktopMenu({
  zeroWasteBadge,
  wiseLifeBadge,
  bazaarBadge,
  auctionBadge,
  isAdmin,
}: DesktopMenuProps) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <NavMenuItem to="/posts/zero-waste" label="제로 웨이스트" badge={zeroWasteBadge} />
      <NavMenuItem to="/posts/wise-life" label="슬기로운 사회생활" badge={wiseLifeBadge} />
      <NavMenuItem to="/bazaar" label="ESG 바자회" badge={bazaarBadge} />
      <NavMenuItem to="/auction" label="ESG 경매" badge={auctionBadge} />
      <NavMenuItem to="/donate" label="기부하기" />
      {isAdmin && <AdminMenuItem />}
    </nav>
  );
}

// 통합 메뉴 아이템 (px16 py8, 15px Regular, 배지는 옵션)
function NavMenuItem({
  to,
  label,
  badge,
}: {
  to: string;
  label: string;
  badge?: BadgeInfo;
}) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 100,
        textDecoration: 'none',
        color: isActive ? C.hoverText : C.text,
        fontSize: 15,
        fontWeight: isActive ? 500 : 400,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        background: isActive ? C.hoverBg : 'transparent',
        transition: 'background 0.15s, color 0.15s, font-weight 0.15s',
      })}
    >
      {label}
      {badge?.show && (
        <span
          style={{
            background: badge.bg,
            color: badge.color,
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 500,
            lineHeight: 1.25,
          }}
        >
          {badge.text}
        </span>
      )}
    </NavLink>
  );
}

// 어드민 메뉴 (color #BEFF9B SemiBold)
function AdminMenuItem() {
  return (
    <NavLink
      to="/admin"
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        borderRadius: 100,
        textDecoration: 'none',
        color: isActive ? C.hoverText : C.adminText,
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        background: isActive ? C.hoverBg : 'transparent',
        transition: 'background 0.15s, color 0.15s',
      })}
    >
      어드민
    </NavLink>
  );
}

// ============================================================================
// 우측 아이콘
// ============================================================================

function CartIcon({ cartCount }: { cartCount: number }) {
  return (
    <Link
      to="/cart"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        color: C.text,
        textDecoration: 'none',
        flexShrink: 0,
      }}
      aria-label={`장바구니 ${cartCount}개`}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm0 10c-2.76 0-5-2.24-5-5h2c0 1.66 1.34 3 3 3s3-1.34 3-3h2c0 2.76-2.24 5-5 5z" />
      </svg>
      {cartCount > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: C.cartBadge,
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            lineHeight: 1,
          }}
        >
          {cartCount > 99 ? '99+' : cartCount}
        </span>
      )}
    </Link>
  );
}

function NotificationIconPlaceholder() {
  return (
    <div
      aria-label="알림 (준비중)"
      title="알림 기능 준비중"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        color: C.text,
        opacity: 0.5,
        cursor: 'not-allowed',
        flexShrink: 0,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
      </svg>
    </div>
  );
}

function UserAvatar({
  currentUser,
  isAdmin,
  onSignOut,
  isMobile,
}: {
  currentUser: { name: string; avatar_url: string | null };
  isAdmin: boolean;
  onSignOut: () => void;
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-user-avatar]')) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const initial = currentUser.name?.[0] ?? '?';

  return (
    <div data-user-avatar style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: currentUser.avatar_url
            ? `url(${currentUser.avatar_url}) center/cover`
            : C.badgeActive,
          color: C.badgeText,
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          overflow: 'hidden',
          fontFamily: FONT_PRETENDARD,
        }}
        aria-label="사용자 메뉴 열기"
      >
        {!currentUser.avatar_url && initial}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 0,
            minWidth: 200,
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            padding: 8,
            zIndex: 200,
            fontFamily: FONT_PRETENDARD,
          }}
        >
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>
              {currentUser.name}
              {isAdmin && (
                <span
                  style={{
                    marginLeft: 6,
                    padding: '1px 6px',
                    background: '#0ea5e9',
                    color: '#fff',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  ADMIN
                </span>
              )}
            </div>
          </div>
          <Link to="/mypage" onClick={() => setOpen(false)} style={dropdownItemStyle}>
            마이페이지
          </Link>
          {isAdmin && isMobile && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              style={{ ...dropdownItemStyle, color: '#0ea5e9', fontWeight: 600 }}
            >
              어드민
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            style={{
              ...dropdownItemStyle,
              width: '100%',
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: FONT_PRETENDARD,
            }}
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  padding: '8px 12px',
  textDecoration: 'none',
  color: '#222',
  fontSize: 13,
  borderRadius: 4,
};

// ============================================================================
// 모바일 메뉴
// ============================================================================

function MobileMenu({
  zeroWasteBadge,
  wiseLifeBadge,
  bazaarBadge,
  auctionBadge,
  isAdmin,
  onClose,
}: {
  zeroWasteBadge: BadgeInfo;
  wiseLifeBadge: BadgeInfo;
  bazaarBadge: BadgeInfo;
  auctionBadge: BadgeInfo;
  isAdmin: boolean;
  onClose: () => void;
}) {
  return (
    <nav
      style={{
        background: C.bg,
        borderTop: `1px solid ${C.divider}`,
        padding: '8px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontFamily: FONT_PRETENDARD,
      }}
    >
      <MobileLink to="/posts/zero-waste" label="제로 웨이스트" badge={zeroWasteBadge} onClick={onClose} />
      <MobileLink to="/posts/wise-life" label="슬기로운 사회생활" badge={wiseLifeBadge} onClick={onClose} />
      <MobileLink to="/bazaar" label="ESG 바자회" badge={bazaarBadge} onClick={onClose} />
      <MobileLink to="/auction" label="ESG 경매" badge={auctionBadge} onClick={onClose} />
      <MobileLink to="/donate" label="기부하기" onClick={onClose} />
      {isAdmin && (
        <Link
          to="/admin"
          onClick={onClose}
          style={{
            ...mobileLinkStyle,
            color: C.adminText,
            fontWeight: 600,
            borderTop: `1px solid ${C.divider}`,
            marginTop: 8,
            paddingTop: 16,
          }}
        >
          어드민
        </Link>
      )}
    </nav>
  );
}

const mobileLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 16px',
  color: C.text,
  textDecoration: 'none',
  fontSize: 15,
  fontWeight: 400,
  borderRadius: 8,
};

function MobileLink({
  to,
  label,
  badge,
  onClick,
}: {
  to: string;
  label: string;
  badge?: BadgeInfo;
  onClick: () => void;
}) {
  return (
    <Link to={to} onClick={onClick} style={mobileLinkStyle}>
      {label}
      {badge?.show && (
        <span
          style={{
            background: badge.bg,
            color: badge.color,
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 500,
            lineHeight: 1.25,
          }}
        >
          {badge.text}
        </span>
      )}
    </Link>
  );
}
