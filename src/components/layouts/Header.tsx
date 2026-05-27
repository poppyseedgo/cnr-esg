// ============================================================================
// Header — Figma node 890:236 정확 반영
//
// 사양 (Figma):
//   - 배경: #000 (다크), 텍스트 #FFF
//   - 최대 너비 1400px, py 20px
//   - 좌측: 로고(146x40 SVG) → gap 156px → 메뉴 (gap 8px)
//   - 메뉴 5개 (분리):
//     1. 제로 웨이스트 어워드 + 진행중 배지 (pl16 pr8 py8, rounded 100px)
//     2. 슬기로운 사회생활 어워드 + 진행중 배지 (동일)
//     3. ESG 바자회 (px16 py8, 배지 없음)
//     4. ESG 경매 (동일, 배지 없음)
//     5. 기부하기 (동일)
//   - 진행중 배지: bg #98F7B6, px8 py4, rounded 999px, 11px black
//   - 우측 (gap 16px, width 268px):
//     1. 🛒 local_mall (24px) → /cart
//     2. 🔔 알림 (20px, placeholder)
//     3. Admin 배지: border #BEFF9B, px16 py8, rounded 8px, #BEFF9B 12px Regular
//     4. 아바타 (36px)
//   - 폰트: Pretendard Medium (메뉴) + Instrument Sans (로고 내부)
//   - 메뉴 텍스트 사이즈:
//     - 어워드 2개: 16px
//     - 바자회/경매/기부: 15px
//     - 진행중 배지: 11px
//     - Admin: 12px (letter-spacing 0.24)
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventPhase } from '@/hooks/useEventPhase';
import { signInWithMicrosoft } from '@/lib/auth';
import { getCartCount, subscribeMyCart, onCartChanged } from '@/lib/cart';
import type { EsgActivityStatus } from '@/types/esg';

// ============================================================================
// 디자인 토큰 (Figma 정확 반영)
// ============================================================================

const C = {
  bg: '#000000',
  text: '#FFFFFF',
  badge: '#98F7B6',
  badgeText: '#000000',
  adminBorder: '#BEFF9B',
  adminText: '#BEFF9B',
  hover: '#1F1F1F',
  divider: '#374151',
};

const FONT_PRETENDARD = "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

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

  const zeroWaste = getActivity('zero_waste');
  const wiseLife = getActivity('wise_life');

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
        padding: '20px 0',
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: isMobile ? '0 16px' : '0 24px',
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
              zeroWasteStatus={zeroWaste.status}
              wiseLifeStatus={wiseLife.status}
            />
          )}
        </div>

        {/* 우측: 아이콘 + 아바타 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {currentUser && <CartIcon cartCount={cartCount} />}
          {currentUser && <NotificationIconPlaceholder />}
          {!isMobile && isAdmin && <AdminBadge />}
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
                background: C.badge,
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
          zeroWasteStatus={zeroWaste.status}
          wiseLifeStatus={wiseLife.status}
          isAdmin={isAdmin}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}

// ============================================================================
// 로고 (146x40 SVG 자체로 완성)
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
          width: 146,
          height: 40,
          display: 'block',
        }}
      />
    </Link>
  );
}

// ============================================================================
// 데스크탑 메뉴 (gap 8px)
// ============================================================================

function DesktopMenu({
  zeroWasteStatus,
  wiseLifeStatus,
}: {
  zeroWasteStatus: EsgActivityStatus;
  wiseLifeStatus: EsgActivityStatus;
}) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <AwardMenuItem to="/posts/zero-waste" label="제로 웨이스트 어워드" status={zeroWasteStatus} />
      <AwardMenuItem to="/posts/wise-life" label="슬기로운 사회생활 어워드" status={wiseLifeStatus} />
      <PlainMenuItem to="/bazaar" label="ESG 바자회" />
      <PlainMenuItem to="/auction" label="ESG 경매" />
      <PlainMenuItem to="/donate" label="기부하기" />
    </nav>
  );
}

// 어워드 메뉴: pl16 pr8 py8, rounded 100px, gap 8, text 16px Medium
function AwardMenuItem({
  to,
  label,
  status,
}: {
  to: string;
  label: string;
  status: EsgActivityStatus;
}) {
  // active만 진행중 배지 표시 (Figma 사양)
  const showBadge = status === 'active';

  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '8px 8px 8px 16px',
        borderRadius: 100,
        textDecoration: 'none',
        color: C.text,
        fontSize: 16,
        fontWeight: isActive ? 600 : 400,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        background: isActive ? C.hover : 'transparent',
        transition: 'background 0.15s, font-weight 0.15s',
      })}
    >
      {label}
      {showBadge && (
        <span
          style={{
            background: C.badge,
            color: C.badgeText,
            padding: '4px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.25,
          }}
        >
          진행중
        </span>
      )}
    </NavLink>
  );
}

// 일반 메뉴: px16 py8, text 15px, 배지 없음
function PlainMenuItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        borderRadius: 100,
        textDecoration: 'none',
        color: C.text,
        fontSize: 15,
        fontWeight: isActive ? 600 : 400,
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        background: isActive ? C.hover : 'transparent',
        transition: 'background 0.15s, font-weight 0.15s',
      })}
    >
      {label}
    </NavLink>
  );
}

// ============================================================================
// 우측 아이콘
// ============================================================================

// 🛒 local_mall 아이콘 (24x24) - Material Symbols 스타일
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
            background: C.badge,
            color: C.badgeText,
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

// 🔔 알림 placeholder (20x20)
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

// Admin 배지: border #BEFF9B, px16 py8, rounded 8, text 12 Regular, letter-spacing 0.24
function AdminBadge() {
  return (
    <NavLink
      to="/admin"
      style={({ isActive }) => ({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        borderRadius: 8,
        border: `1px solid ${C.adminBorder}`,
        background: isActive ? C.adminBorder : 'transparent',
        color: isActive ? '#000' : C.adminText,
        fontSize: 12,
        fontWeight: 400,
        letterSpacing: 0.24,
        lineHeight: 1.25,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        fontFamily: FONT_PRETENDARD,
      })}
    >
      Admin
    </NavLink>
  );
}

// 아바타 (36x36, default 그린 원)
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
            : C.badge,
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
  zeroWasteStatus,
  wiseLifeStatus,
  isAdmin,
  onClose,
}: {
  zeroWasteStatus: EsgActivityStatus;
  wiseLifeStatus: EsgActivityStatus;
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
      <MobileAwardItem to="/posts/zero-waste" label="제로 웨이스트 어워드" status={zeroWasteStatus} onClick={onClose} />
      <MobileAwardItem to="/posts/wise-life" label="슬기로운 사회생활 어워드" status={wiseLifeStatus} onClick={onClose} />
      <Link to="/bazaar" onClick={onClose} style={mobileLinkStyle}>ESG 바자회</Link>
      <Link to="/auction" onClick={onClose} style={mobileLinkStyle}>ESG 경매</Link>
      <Link to="/donate" onClick={onClose} style={mobileLinkStyle}>기부하기</Link>
      {isAdmin && (
        <Link
          to="/admin"
          onClick={onClose}
          style={{
            ...mobileLinkStyle,
            color: C.adminText,
            fontWeight: 500,
            borderTop: `1px solid ${C.divider}`,
            marginTop: 8,
            paddingTop: 16,
          }}
        >
          Admin
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

function MobileAwardItem({
  to,
  label,
  status,
  onClick,
}: {
  to: string;
  label: string;
  status: EsgActivityStatus;
  onClick: () => void;
}) {
  const showBadge = status === 'active';
  return (
    <Link to={to} onClick={onClick} style={mobileLinkStyle}>
      {label}
      {showBadge && (
        <span
          style={{
            background: C.badge,
            color: C.badgeText,
            padding: '4px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.25,
          }}
        >
          진행중
        </span>
      )}
    </Link>
  );
}
