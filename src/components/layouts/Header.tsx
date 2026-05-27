// ============================================================================
// Header — 상단 네비게이션 + 장바구니 카운트 뱃지
//
// 디자인은 Phase 6에서 피그마 기반 교체.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { signInWithMicrosoft } from '@/lib/auth';
import { getCartCount, subscribeMyCart, onCartChanged } from '@/lib/cart';

const navItemStyle: React.CSSProperties = {
  padding: '6px 10px',
  textDecoration: 'none',
  color: '#444',
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 6,
};

const activeNavItemStyle: React.CSSProperties = {
  ...navItemStyle,
  background: '#f0f0f0',
  color: '#000',
  fontWeight: 700,
};

export function Header() {
  const { currentUser, signOut, isAdmin } = useCurrentUser();
  const [cartCount, setCartCount] = useState(0);

  // 장바구니 카운트 로드 + Realtime + window event
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

    // 1) Realtime (다른 탭/세션) — INSERT/UPDATE는 동기화. DELETE는 Supabase 제약으로 안 옴.
    const cleanupRealtime = subscribeMyCart(userId, refresh);

    // 2) window event (같은 탭) — addToCart/clearMyCart/createBazaarOrder가 명시 호출.
    //    Realtime DELETE 누락 보완.
    const cleanupWindowEvent = onCartChanged(refresh);

    return () => {
      cleanupRealtime();
      cleanupWindowEvent();
    };
  }, [currentUser?.id]);

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
        zIndex: 10,
        background: '#fff',
        borderBottom: '1px solid #eee',
        padding: '12px 20px',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* 로고 + 네비 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link
            to="/"
            style={{
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              color: '#000',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🌱 C&R ESG
          </Link>
          <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <NavLink
              to="/posts"
              style={({ isActive }) => (isActive ? activeNavItemStyle : navItemStyle)}
            >
              게시판
            </NavLink>
            <NavLink
              to="/bazaar"
              style={({ isActive }) => (isActive ? activeNavItemStyle : navItemStyle)}
            >
              바자회
            </NavLink>
            <NavLink
              to="/auction"
              style={({ isActive }) => (isActive ? activeNavItemStyle : navItemStyle)}
            >
              경매
            </NavLink>
            <NavLink
              to="/donate"
              style={({ isActive }) => (isActive ? activeNavItemStyle : navItemStyle)}
            >
              💚 기부하기
            </NavLink>
            {currentUser && (
              <NavLink
                to="/mypage"
                style={({ isActive }) => (isActive ? activeNavItemStyle : navItemStyle)}
              >
                마이페이지
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                to="/admin"
                style={({ isActive }) =>
                  isActive
                    ? { ...activeNavItemStyle, color: '#0ea5e9' }
                    : { ...navItemStyle, color: '#0ea5e9' }
                }
              >
                어드민
              </NavLink>
            )}
          </nav>
        </div>

        {/* 사용자 정보 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {currentUser ? (
            <>
              {/* 장바구니 아이콘 + 뱃지 */}
              <Link
                to="/cart"
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  textDecoration: 'none',
                  fontSize: 18,
                  color: '#444',
                }}
                aria-label={`장바구니 ${cartCount}개`}
              >
                🛒
                {cartCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -4,
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 9,
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>

              <span style={{ fontSize: 13, color: '#666' }}>
                <strong style={{ color: '#222' }}>{currentUser.name}</strong>
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
              </span>
              <button
                type="button"
                onClick={() => signOut().catch(console.error)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ddd',
                  background: '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                로그아웃
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              style={{
                padding: '6px 14px',
                background: '#2F2F2F',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              로그인
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
