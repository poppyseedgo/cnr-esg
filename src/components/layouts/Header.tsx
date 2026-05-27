// ============================================================================
// Header — 상단 네비게이션 (Figma 디자인 기반)
//
// 변경 사항:
//   - 다크 헤더 (배경 #000, 흰 텍스트)
//   - 로고 SVG (4분면 그린 원형 + C&R ESG 텍스트)
//   - 메뉴 뎁스 축소:
//     - 기존: 게시판 → ESG 어워드 게시판 → 카테고리 선택 (4뎁스)
//     - 신규: '제로 웨이스트 어워드' '슬기로운 사회생활 어워드' 직접 노출 (2뎁스)
//   - 각 어워드 메뉴 옆 진행중 배지 (라임 #98F7B6)
//   - ESG 바자회 + 경매 메뉴 옆 D-day 표시
//   - 우측: 🛒 카트 / 🔔 알림(준비중) / 사용자 아바타
//
// 반응형:
//   - 데스크탑: 가로 메뉴 전체
//   - 모바일(<900px): 햄버거 메뉴
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventPhase } from '@/hooks/useEventPhase';
import { signInWithMicrosoft } from '@/lib/auth';
import { getCartCount, subscribeMyCart, onCartChanged } from '@/lib/cart';
import type { EsgActivityStatus } from '@/types/esg';

// 상수
const COLORS = {
  bg: '#000000',
  text: '#FFFFFF',
  textMuted: '#9CA3AF',
  accent: '#98F7B6',
  accentText: '#000000',
  hover: '#1F1F1F',
  divider: '#374151',
};

const FONT_PRETENDARD = "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_INSTRUMENT = "'Instrument Sans', 'Pretendard', sans-serif";

// 헬퍼
function getDDay(endIso: string | undefined): string | null {
  if (!endIso) return null;
  const end = new Date(endIso);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return '종료';
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `D-${days}`;
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
    const check = () => setIsMobile(window.innerWidth < 900);
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
  const bazaarEndIso = (() => {
    const b = bazaar.period?.ends_at_utc;
    const a = auction.period?.ends_at_utc;
    if (b && a) return new Date(b) > new Date(a) ? b : a;
    return b || a;
  })();
  const commerceDDay = getDDay(bazaarEndIso);

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
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT_PRETENDARD,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: isMobile ? '16px 16px' : '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 56 }}>
          <Logo />
          {!isMobile && (
            <MenuItems
              zeroWasteStatus={zeroWaste.status}
              wiseLifeStatus={wiseLife.status}
              commerceDDay={commerceDDay}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16 }}>
          {currentUser && <CartIcon cartCount={cartCount} />}
          {currentUser && <NotificationIconPlaceholder />}

          {!isMobile && isAdmin && (
            <NavLink
              to="/admin"
              style={({ isActive }) => ({
                padding: '6px 12px',
                background: isActive ? COLORS.accent : 'transparent',
                color: isActive ? COLORS.accentText : COLORS.accent,
                border: `1px solid ${COLORS.accent}`,
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              })}
            >
              ADMIN
            </NavLink>
          )}

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
                background: COLORS.accent,
                color: COLORS.accentText,
                border: 'none',
                borderRadius: 100,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: FONT_PRETENDARD,
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
                width: 36,
                height: 36,
                background: 'transparent',
                border: 'none',
                color: COLORS.text,
                cursor: 'pointer',
                fontSize: 24,
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
          commerceDDay={commerceDDay}
          isAdmin={isAdmin}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}

// ============================================================================
// 로고
// ============================================================================

function Logo() {
  return (
    <Link
      to="/"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        textDecoration: 'none',
        color: COLORS.text,
        flexShrink: 0,
      }}
    >
      <img
        src="/logo.svg"
        alt="C&R ESG"
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            fontFamily: FONT_INSTRUMENT,
            fontSize: 13,
            lineHeight: 1.25,
            fontWeight: 400,
            color: COLORS.text,
            whiteSpace: 'nowrap',
          }}
        >
          C&amp;R ESG
        </span>
        <span
          style={{
            fontFamily: FONT_INSTRUMENT,
            fontSize: 8,
            lineHeight: 1.25,
            letterSpacing: 0.16,
            color: COLORS.text,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ textTransform: 'uppercase' }}>C&amp;R RESEARCH</span>
          <span> Since 1997</span>
        </span>
      </div>
    </Link>
  );
}

// ============================================================================
// 데스크탑 메뉴
// ============================================================================

interface MenuItemsProps {
  zeroWasteStatus: EsgActivityStatus;
  wiseLifeStatus: EsgActivityStatus;
  commerceDDay: string | null;
}

function MenuItems({ zeroWasteStatus, wiseLifeStatus, commerceDDay }: MenuItemsProps) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <AwardMenuItem to="/posts/zero-waste" label="제로 웨이스트 어워드" status={zeroWasteStatus} />
      <AwardMenuItem to="/posts/wise-life" label="슬기로운 사회생활 어워드" status={wiseLifeStatus} />
      <CommerceMenuItem dDay={commerceDDay} />
      <SimpleMenuItem to="/donate" label="기부하기" />
    </nav>
  );
}

interface AwardMenuItemProps {
  to: string;
  label: string;
  status: EsgActivityStatus;
}

function AwardMenuItem({ to, label, status }: AwardMenuItemProps) {
  const badgeMap: Record<EsgActivityStatus, { text: string; bg: string; show: boolean }> = {
    active: { text: '진행중', bg: COLORS.accent, show: true },
    before: { text: '준비중', bg: '#FCD34D', show: true },
    closed: { text: '종료', bg: '#6B7280', show: false },
  };
  const badge = badgeMap[status];

  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 8px 8px 16px',
        borderRadius: 100,
        textDecoration: 'none',
        color: COLORS.text,
        fontSize: 16,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        background: isActive ? COLORS.hover : 'transparent',
        transition: 'background 0.15s',
      })}
    >
      {label}
      {badge.show && (
        <span
          style={{
            background: badge.bg,
            color: COLORS.accentText,
            padding: '4px 8px',
            borderRadius: 999,
            fontSize: 11,
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

function CommerceMenuItem({ dDay }: { dDay: string | null }) {
  return (
    <NavLink
      to="/bazaar"
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: 100,
        textDecoration: 'none',
        color: COLORS.text,
        background: isActive ? COLORS.hover : 'transparent',
        transition: 'background 0.15s',
      })}
    >
      <span style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap' }}>ESG 바자회 + 경매</span>
      {dDay && (
        <span style={{ fontSize: 12, fontWeight: 400, color: COLORS.textMuted }}>{dDay}</span>
      )}
    </NavLink>
  );
}

function SimpleMenuItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        padding: '8px 16px',
        borderRadius: 100,
        textDecoration: 'none',
        color: COLORS.text,
        fontSize: 15,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        background: isActive ? COLORS.hover : 'transparent',
        transition: 'background 0.15s',
      })}
    >
      {label}
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
        color: COLORS.text,
        textDecoration: 'none',
      }}
      aria-label={`장바구니 ${cartCount}개`}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3 3H5L5.4 5M7 13H17L21 5H5.4M7 13L5.4 5M7 13L4.7 15.3C4.06 15.94 4.5 17 5.4 17H17M17 17C15.9 17 15 17.9 15 19C15 20.1 15.9 21 17 21C18.1 21 19 20.1 19 19C19 17.9 18.1 17 17 17ZM9 19C9 20.1 8.1 21 7 21C5.9 21 5 20.1 5 19C5 17.9 5.9 17 7 17C8.1 17 9 17.9 9 19Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
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
            background: COLORS.accent,
            color: COLORS.accentText,
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
        color: COLORS.text,
        opacity: 0.5,
        cursor: 'not-allowed',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M10 2C7.79 2 6 3.79 6 6V9.5C6 10.05 5.77 10.58 5.39 10.96L4 12.35C3.61 12.74 3.87 13.5 4.42 13.5H15.58C16.13 13.5 16.39 12.74 16 12.35L14.61 10.96C14.23 10.58 14 10.05 14 9.5V6C14 3.79 12.21 2 10 2ZM10 18C11.1 18 12 17.1 12 16H8C8 17.1 8.9 18 10 18Z"
          fill="currentColor"
        />
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
    <div data-user-avatar style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: currentUser.avatar_url ? `url(${currentUser.avatar_url}) center/cover` : COLORS.accent,
          color: COLORS.accentText,
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
          overflow: 'hidden',
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
            👤 마이페이지
          </Link>
          {isAdmin && isMobile && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              style={{ ...dropdownItemStyle, color: '#0ea5e9', fontWeight: 600 }}
            >
              ⚙ 어드민
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
            🚪 로그아웃
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

interface MobileMenuProps {
  zeroWasteStatus: EsgActivityStatus;
  wiseLifeStatus: EsgActivityStatus;
  commerceDDay: string | null;
  isAdmin: boolean;
  onClose: () => void;
}

function MobileMenu({
  zeroWasteStatus,
  wiseLifeStatus,
  commerceDDay,
  isAdmin,
  onClose,
}: MobileMenuProps) {
  return (
    <nav
      style={{
        background: COLORS.bg,
        borderTop: `1px solid ${COLORS.divider}`,
        padding: '8px 16px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <MobileMenuItem to="/posts/zero-waste" label="제로 웨이스트 어워드" status={zeroWasteStatus} onClick={onClose} />
      <MobileMenuItem to="/posts/wise-life" label="슬기로운 사회생활 어워드" status={wiseLifeStatus} onClick={onClose} />
      <Link
        to="/bazaar"
        onClick={onClose}
        style={mobileLinkStyle}
      >
        ESG 바자회 + 경매
        {commerceDDay && (
          <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 8 }}>{commerceDDay}</span>
        )}
      </Link>
      <Link to="/donate" onClick={onClose} style={mobileLinkStyle}>
        기부하기
      </Link>
      {isAdmin && (
        <Link
          to="/admin"
          onClick={onClose}
          style={{
            ...mobileLinkStyle,
            color: COLORS.accent,
            fontWeight: 700,
            borderTop: `1px solid ${COLORS.divider}`,
            marginTop: 8,
            paddingTop: 16,
          }}
        >
          ⚙ 어드민
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
  color: COLORS.text,
  textDecoration: 'none',
  fontSize: 15,
  fontWeight: 500,
  borderRadius: 8,
};

function MobileMenuItem({
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
  const badgeMap: Record<EsgActivityStatus, { text: string; bg: string; show: boolean }> = {
    active: { text: '진행중', bg: COLORS.accent, show: true },
    before: { text: '준비중', bg: '#FCD34D', show: true },
    closed: { text: '종료', bg: '#6B7280', show: false },
  };
  const badge = badgeMap[status];

  return (
    <Link to={to} onClick={onClick} style={mobileLinkStyle}>
      {label}
      {badge.show && (
        <span
          style={{
            background: badge.bg,
            color: COLORS.accentText,
            padding: '4px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {badge.text}
        </span>
      )}
    </Link>
  );
}
