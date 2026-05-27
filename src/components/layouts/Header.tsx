// ============================================================================
// Header — 3가지 variant 자동 분기
//
// Figma:
//   - dark   (node 896:337) - 홈, 어워드 페이지 (검정 배경)
//   - light  (node 898:400) - 바자회, 경매, 기부 (흰 배경)
//   - green  (node 898:440) - 어드민 페이지 (다크 그린 #00422C)
//
// 자동 분기 규칙 (URL 기반):
//   /             → dark
//   /posts/*      → dark
//   /bazaar/*     → light
//   /auction/*    → light
//   /cart         → light
//   /checkout     → light
//   /orders/*     → light
//   /donate/*     → light
//   /mypage/*     → light (사용자 영역)
//   /admin/*      → green (어드민 영역)
//   default       → dark
//
// 동적 배지 (15개 메뉴 공통):
//   어워드: 진행중 / 내일 마감 / 오늘 마감 / 시상완료 / 준비중
//   상거래: D-N / 내일 마감 / 오늘 마감 / 종료 / 준비중
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventPhase } from '@/hooks/useEventPhase';
import { signInWithMicrosoft } from '@/lib/auth';
import { getCartCount, subscribeMyCart, onCartChanged } from '@/lib/cart';
import type { EsgActivityStatus, EsgActivityPeriod } from '@/types/esg';

// ============================================================================
// Variant 정의
// ============================================================================

type Variant = 'dark' | 'light' | 'green';

interface VariantTokens {
  bg: string;
  text: string;
  textSub: string;          // 비활성 메뉴 또는 muted 텍스트
  badgeActive: string;      // 진행중/임박 배지 배경
  badgeActiveText: string;
  badgeNeutral: string;     // D-N/종료/준비중 배지 배경
  badgeNeutralText: string;
  hoverBg: string;          // active 메뉴 배경
  hoverText: string;        // active 메뉴 텍스트
  adminText: string;        // 어드민 메뉴 텍스트
  adminBg: string;          // 어드민 메뉴 배경 (green variant만 사용)
  adminBgActive: string;    // 어드민 active 시 배경
  adminFontWeight: 600 | 700;
  cartBadgeBg: string;
  cartBadgeText: string;
  iconColor: string;
}

const VARIANTS: Record<Variant, VariantTokens> = {
  // [ DARK ] - 홈, 어워드
  dark: {
    bg: '#000000',
    text: '#FFFFFF',
    textSub: '#9CA3AF',
    badgeActive: '#98F7B6',
    badgeActiveText: '#000000',
    badgeNeutral: '#BDBDBD',
    badgeNeutralText: '#000000',
    hoverBg: '#6DED73',
    hoverText: '#000000',
    adminText: '#BEFF9B',
    adminBg: 'transparent',
    adminBgActive: '#BEFF9B',
    adminFontWeight: 600,
    cartBadgeBg: '#EF4444',
    cartBadgeText: '#FFFFFF',
    iconColor: '#FFFFFF',
  },
  // [ LIGHT ] - 바자회, 경매, 기부
  light: {
    bg: '#FFFFFF',
    text: '#000000',
    textSub: '#6B7280',
    badgeActive: '#98F7B6',
    badgeActiveText: '#000000',
    badgeNeutral: '#BDBDBD',
    badgeNeutralText: '#000000',
    hoverBg: '#6DED73',
    hoverText: '#000000',
    adminText: '#28C75B',
    adminBg: 'transparent',
    adminBgActive: '#28C75B',
    adminFontWeight: 700,
    cartBadgeBg: '#EF4444',
    cartBadgeText: '#FFFFFF',
    iconColor: '#000000',
  },
  // [ GREEN ] - 어드민
  green: {
    bg: '#00422C',
    text: '#FFFFFF',
    textSub: '#9CA3AF',
    badgeActive: '#98F7B6',
    badgeActiveText: '#FFFFFF',     // green variant는 텍스트 흰색
    badgeNeutral: '#BDBDBD',
    badgeNeutralText: '#FFFFFF',
    hoverBg: '#6DED73',
    hoverText: '#000000',
    adminText: '#000000',
    adminBg: '#BEFF9B',             // ⭐ 어드민 메뉴에 라임 배경 (활성 표시)
    adminBgActive: '#BEFF9B',
    adminFontWeight: 700,
    cartBadgeBg: '#EF4444',
    cartBadgeText: '#FFFFFF',
    iconColor: '#FFFFFF',
  },
};

const FONT_PRETENDARD = "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ============================================================================
// URL → variant 자동 매핑
// ============================================================================

function getVariantForPath(pathname: string): Variant {
  if (pathname.startsWith('/admin')) return 'green';
  if (
    pathname.startsWith('/bazaar') ||
    pathname.startsWith('/auction') ||
    pathname.startsWith('/cart') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/donate') ||
    pathname.startsWith('/mypage')
  ) {
    return 'light';
  }
  return 'dark';
}

// ============================================================================
// 배지 규칙
//
// 동작:
//   - before:  시작일까지 D-N (회색) / D-1 → "내일 시작" / D-0 → "오늘 시작" (라임)
//   - active:  종료일까지 D-N
//     · award:    일반 active → "진행중" (라임)
//     · commerce: 일반 active → "D-N" (회색)
//     · 공통:     D-1 → "내일 마감" / D-0 → "오늘 마감" (라임)
//   - closed:  award → "시상완료" / commerce → "종료" (회색)
// ============================================================================

type ActivityKind = 'award' | 'commerce';

interface BadgeInfo {
  text: string;
  bg: string;
  show: boolean;
  isActive: boolean; // active(라임) 인지 neutral(회색) 인지
}

/**
 * KST 자정 기준 일수 차이 (target - now).
 * 양수 = target이 미래, 0 = 오늘, 음수 = 과거
 */
function calcDayDiff(targetIso: string | undefined): number | null {
  if (!targetIso) return null;
  const target = new Date(targetIso);
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const targetKst = new Date(target.getTime() + kstOffset);
  const nowKst = new Date(now.getTime() + kstOffset);
  const targetDay = Math.floor(targetKst.getTime() / (1000 * 60 * 60 * 24));
  const nowDay = Math.floor(nowKst.getTime() / (1000 * 60 * 60 * 24));
  return targetDay - nowDay;
}

function getBadge(
  status: EsgActivityStatus,
  period: EsgActivityPeriod | undefined,
  kind: ActivityKind,
  tokens: VariantTokens
): BadgeInfo {
  // 1) 종료 상태
  if (status === 'closed') {
    return {
      text: kind === 'award' ? '시상완료' : '종료',
      bg: tokens.badgeNeutral,
      show: true,
      isActive: false,
    };
  }

  // 2) 시작 전 - 시작일 기준 D-day
  if (status === 'before') {
    const dStart = calcDayDiff(period?.starts_at_utc);
    if (dStart === null) {
      return { text: '준비중', bg: tokens.badgeNeutral, show: true, isActive: false };
    }
    if (dStart <= 0) {
      // 시작일이 오늘 (곧 시작)
      return { text: '오늘 시작', bg: tokens.badgeActive, show: true, isActive: true };
    }
    if (dStart === 1) {
      return { text: '내일 시작', bg: tokens.badgeActive, show: true, isActive: true };
    }
    // D-2 이상: 회색 카운트
    return { text: `D-${dStart}`, bg: tokens.badgeNeutral, show: true, isActive: false };
  }

  // 3) 진행 중 - 종료일 기준 D-day
  const dEnd = calcDayDiff(period?.ends_at_utc);
  if (dEnd === null) {
    // 기간 정보 없음 → 단순 진행중
    return { text: '진행중', bg: tokens.badgeActive, show: true, isActive: true };
  }
  if (dEnd <= 0) {
    return { text: '오늘 마감', bg: tokens.badgeActive, show: true, isActive: true };
  }
  if (dEnd === 1) {
    return { text: '내일 마감', bg: tokens.badgeActive, show: true, isActive: true };
  }
  // D-2 이상
  if (kind === 'award') {
    return { text: '진행중', bg: tokens.badgeActive, show: true, isActive: true };
  }
  return { text: `D-${dEnd}`, bg: tokens.badgeNeutral, show: true, isActive: false };
}

// ============================================================================
// 메인
// ============================================================================

export function Header() {
  const { currentUser, signOut, isAdmin } = useCurrentUser();
  const { getActivity } = useEventPhase();
  const location = useLocation();
  const [cartCount, setCartCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // URL → variant 자동 선택
  const variant = getVariantForPath(location.pathname);
  const T = VARIANTS[variant];

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

  const zeroWaste = getActivity('zero_waste');
  const wiseLife = getActivity('wise_life');
  const bazaar = getActivity('bazaar');
  const auction = getActivity('auction');

  const zeroWasteBadge = getBadge(zeroWaste.status, zeroWaste.period, 'award', T);
  const wiseLifeBadge = getBadge(wiseLife.status, wiseLife.period, 'award', T);
  const bazaarBadge = getBadge(bazaar.status, bazaar.period, 'commerce', T);
  const auctionBadge = getBadge(auction.status, auction.period, 'commerce', T);

  const handleLogin = () => {
    signInWithMicrosoft().catch((e) => {
      console.error('login failed:', e);
      alert('로그인을 시작할 수 없습니다.');
    });
  };

  // light variant는 검정 로고, dark/green은 흰 로고
  const logoFilter = variant === 'light' ? 'none' : 'none'; // logo.svg는 컬러 SVG라 invert 불필요. 디자인 시 별도 흑백 로고 필요시 확장

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: T.bg,
        color: T.text,
        fontFamily: FONT_PRETENDARD,
        padding: '12px 0',
        transition: 'background 0.2s, color 0.2s',
      }}
    >
      <div
        style={{
          maxWidth: 1920,
          width: '100%',
          margin: '0 auto',
          padding: isMobile ? '0 16px' : '0 40px',
          display: 'grid',
          gridTemplateColumns: isMobile ? 'auto 1fr' : '1fr auto 1fr',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {/* 좌측: 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'start' }}>
          <Logo filter={logoFilter} textColor={T.text} variant={variant} />
        </div>

        {/* 중앙: 메뉴 (데스크탑만) */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'center' }}>
            <DesktopMenu
              tokens={T}
              zeroWasteBadge={zeroWasteBadge}
              wiseLifeBadge={wiseLifeBadge}
              bazaarBadge={bazaarBadge}
              auctionBadge={auctionBadge}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* 우측: 아이콘 + 아바타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifySelf: 'end' }}>
          {currentUser && <CartIcon cartCount={cartCount} tokens={T} />}
          {currentUser && <NotificationIconPlaceholder color={T.iconColor} />}
          {currentUser ? (
            <UserAvatar
              currentUser={currentUser}
              isAdmin={isAdmin}
              onSignOut={() => signOut().catch(console.error)}
              isMobile={isMobile}
              tokens={T}
            />
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              style={{
                padding: '8px 16px',
                background: T.badgeActive,
                color: T.badgeActiveText === '#FFFFFF' ? '#000000' : T.badgeActiveText,
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
                color: T.text,
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
          tokens={T}
          variant={variant}
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
// 로고 (현재는 1개 SVG. light variant에서도 동일 사용)
// ============================================================================

function Logo({ filter, textColor: _t, variant }: { filter: string; textColor: string; variant: Variant }) {
  // variant별 로고: light는 검정 텍스트 로고, dark/green은 흰 텍스트 로고
  const logoSrc = variant === 'light' ? '/logo-light.svg' : '/logo.svg';
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
        src={logoSrc}
        alt="C&R ESG"
        style={{
          width: 160,
          height: 40,
          display: 'block',
          filter,
        }}
      />
    </Link>
  );
}

// ============================================================================
// 데스크탑 메뉴
// ============================================================================

interface DesktopMenuProps {
  tokens: VariantTokens;
  zeroWasteBadge: BadgeInfo;
  wiseLifeBadge: BadgeInfo;
  bazaarBadge: BadgeInfo;
  auctionBadge: BadgeInfo;
  isAdmin: boolean;
}

function DesktopMenu({
  tokens,
  zeroWasteBadge,
  wiseLifeBadge,
  bazaarBadge,
  auctionBadge,
  isAdmin,
}: DesktopMenuProps) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <NavMenuItem to="/posts/zero-waste" label="제로 웨이스트" badge={zeroWasteBadge} tokens={tokens} />
      <NavMenuItem to="/posts/wise-life" label="슬기로운 사회생활" badge={wiseLifeBadge} tokens={tokens} />
      <NavMenuItem to="/bazaar" label="ESG 바자회" badge={bazaarBadge} tokens={tokens} />
      <NavMenuItem to="/auction" label="ESG 경매" badge={auctionBadge} tokens={tokens} />
      <NavMenuItem to="/donate" label="기부하기" tokens={tokens} />
      {isAdmin && <AdminMenuItem tokens={tokens} />}
    </nav>
  );
}

/**
 * 메뉴 배지를 렌더링하는 헬퍼.
 * NavMenuItem과 MobileLink 양쪽에서 재사용.
 */
function renderBadge(badge: BadgeInfo | undefined, tokens: VariantTokens) {
  if (!badge?.show) return null;
  return (
    <span
      style={{
        background: badge.bg,
        color: badge.isActive ? tokens.badgeActiveText : tokens.badgeNeutralText,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 500,
        lineHeight: 1.25,
      }}
    >
      {badge.text}
    </span>
  );
}

/**
 * 배지 유무에 따라 padding 자동 결정:
 *   - 배지 없음:        8px 16px       (대칭)
 *   - 오른쪽 배지만:    8px 12px 8px 16px
 *   - 왼쪽 배지만:      8px 16px 8px 12px
 *   - 양쪽 배지:        8px 12px       (양쪽 좁게)
 */
function getMenuPadding(hasLeft: boolean, hasRight: boolean): string {
  if (hasLeft && hasRight) return '8px 12px';
  if (hasRight) return '8px 12px 8px 16px';
  if (hasLeft) return '8px 16px 8px 12px';
  return '8px 16px';
}

function NavMenuItem({
  to,
  label,
  badge,        // 우측 배지 (기본)
  badgeLeft,    // 좌측 배지 (옵션)
  tokens,
}: {
  to: string;
  label: string;
  badge?: BadgeInfo;
  badgeLeft?: BadgeInfo;
  tokens: VariantTokens;
}) {
  const hasRight = badge?.show ?? false;
  const hasLeft = badgeLeft?.show ?? false;
  const padding = getMenuPadding(hasLeft, hasRight);

  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding,
        borderRadius: 100,
        textDecoration: 'none',
        color: isActive ? tokens.hoverText : tokens.text,
        fontSize: 15,
        fontWeight: isActive ? 500 : 400,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        background: isActive ? tokens.hoverBg : 'transparent',
        transition: 'background 0.15s, color 0.15s, font-weight 0.15s',
      })}
    >
      {renderBadge(badgeLeft, tokens)}
      {label}
      {renderBadge(badge, tokens)}
    </NavLink>
  );
}

function AdminMenuItem({ tokens }: { tokens: VariantTokens }) {
  return (
    <NavLink
      to="/admin"
      style={({ isActive }) => {
        const useFilledStyle = tokens.adminBg !== 'transparent'; // green variant
        const showActiveBg = isActive || useFilledStyle;
        return {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 16px',
          borderRadius: useFilledStyle ? 99 : 100,
          textDecoration: 'none',
          color: showActiveBg && useFilledStyle ? '#000000' : (isActive ? tokens.hoverText : tokens.adminText),
          fontSize: 15,
          fontWeight: tokens.adminFontWeight,
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
          background: useFilledStyle
            ? tokens.adminBg
            : isActive
            ? tokens.hoverBg
            : 'transparent',
          transition: 'background 0.15s, color 0.15s',
        };
      }}
    >
      어드민
    </NavLink>
  );
}

// ============================================================================
// 우측 아이콘
// ============================================================================

function CartIcon({ cartCount, tokens }: { cartCount: number; tokens: VariantTokens }) {
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
        color: tokens.iconColor,
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
            background: tokens.cartBadgeBg,
            color: tokens.cartBadgeText,
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

function NotificationIconPlaceholder({ color }: { color: string }) {
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
        color,
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
  tokens,
}: {
  currentUser: { name: string; avatar_url: string | null };
  isAdmin: boolean;
  onSignOut: () => void;
  isMobile: boolean;
  tokens: VariantTokens;
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
            : tokens.badgeActive,
          color: '#000000',
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
  tokens,
  variant,
  zeroWasteBadge,
  wiseLifeBadge,
  bazaarBadge,
  auctionBadge,
  isAdmin,
  onClose,
}: {
  tokens: VariantTokens;
  variant: Variant;
  zeroWasteBadge: BadgeInfo;
  wiseLifeBadge: BadgeInfo;
  bazaarBadge: BadgeInfo;
  auctionBadge: BadgeInfo;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const divider = variant === 'light' ? '#E5E7EB' : '#374151';
  return (
    <nav
      style={{
        background: tokens.bg,
        borderTop: `1px solid ${divider}`,
        padding: '8px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontFamily: FONT_PRETENDARD,
      }}
    >
      <MobileLink to="/posts/zero-waste" label="제로 웨이스트" badge={zeroWasteBadge} onClick={onClose} tokens={tokens} />
      <MobileLink to="/posts/wise-life" label="슬기로운 사회생활" badge={wiseLifeBadge} onClick={onClose} tokens={tokens} />
      <MobileLink to="/bazaar" label="ESG 바자회" badge={bazaarBadge} onClick={onClose} tokens={tokens} />
      <MobileLink to="/auction" label="ESG 경매" badge={auctionBadge} onClick={onClose} tokens={tokens} />
      <MobileLink to="/donate" label="기부하기" onClick={onClose} tokens={tokens} />
      {isAdmin && (
        <Link
          to="/admin"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 16px',
            color: tokens.adminBg !== 'transparent' ? '#000000' : tokens.adminText,
            background: tokens.adminBg !== 'transparent' ? tokens.adminBg : 'transparent',
            textDecoration: 'none',
            fontSize: 15,
            fontWeight: tokens.adminFontWeight,
            borderRadius: 8,
            borderTop: `1px solid ${divider}`,
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

function MobileLink({
  to,
  label,
  badge,
  badgeLeft,
  onClick,
  tokens,
}: {
  to: string;
  label: string;
  badge?: BadgeInfo;
  badgeLeft?: BadgeInfo;
  onClick: () => void;
  tokens: VariantTokens;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 16px',
        color: tokens.text,
        textDecoration: 'none',
        fontSize: 15,
        fontWeight: 400,
        borderRadius: 8,
      }}
    >
      {renderBadge(badgeLeft, tokens)}
      {label}
      {renderBadge(badge, tokens)}
    </Link>
  );
}
