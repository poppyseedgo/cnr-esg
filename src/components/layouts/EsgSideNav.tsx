// ============================================================================
// EsgSideNav.tsx — 좌측 세로 사이드바 (기존 Header.tsx 대체)
//
// [변경 이력]
//   2026-06-23  최초 작성. Figma node 1698:1343(좌측 사이드바) 1:1.
//               기존 Header.tsx 의 전 기능을 세로 사이드바 + 모바일 드로어로 이식.
//   2026-06-23  [아이콘 통일] 햄버거 메뉴 아이콘을 업로드된 menu.svg로 교체.
//               · 데스크톱 접기(DehazeIcon) + 모바일 상단바(텍스트 ☰) → 공통 <MenuIcon>
//               · menu.svg의 stroke="white" 하드코딩 → currentColor (3-variant 모두 대응)
//               · vectorEffect="non-scaling-stroke"로 크기와 무관하게 1px 크리스프 렌더
//               · 열림 상태 ✕(텍스트) → 동일 스트로크 스타일 <CloseIcon>
//
// [설계 — 기존 Header 기능 100% 보존]
//   - 3-variant(dark/light/green) URL 자동 분기: getVariantForPath (Header와 동일 규칙)
//   - D-day 뱃지: useEventPhase + getBadge (Header와 동일 로직 이식)
//   - 이벤트 가드: useEventGate (바자회/경매/포스트 비활성 시 openGuide 모달)
//   - 장바구니 카운트: getCartCount + subscribeMyCart + onCartChanged
//   - 알림 미읽음: getUnreadCount + subscribeMyNotifications + onNotificationChanged
//   - 유저메뉴/로그아웃: useCurrentUser(signOut) + Avatar
//   - 로그인: signInWithMicrosoft
//   - 모바일(<1024): 상단바 + 좌측 슬라이드 드로어 (mobileOpen 패턴)
//
// [네비 구조 — Figma 신규]
//   1차(주요):  나무 심는 바자회(/bazaar) · ESG 경매(/auction) · 기부하기(/donate) · 어드민 관리자(/admin·관리자만)
//   2차:        Cart(/cart) · 찜(/mypage/wishlist) · My Account(/mypage) · Notification(/notifications) + 유저 아바타(40px)
//   지난 이벤트: 제로 웨이스트(/posts/zero-waste) · 슬기로운 사회생활(/posts/wise-life)
//   ※ /bazaar=나무 심는 바자회, /auction=ESG 경매 는 라벨 변경(라우트 동일).
//
// [레이아웃 계약]  AppLayout 가 행(row) 레이아웃으로 감싸고 width 346(데스크톱)을 차지.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar } from '@/components/Avatar';
import { useEventPhase } from '@/hooks/useEventPhase';
import { useEventGate } from '@/hooks/useEventGate';
import { signInWithMicrosoft } from '@/lib/auth';
import { useNavCounts } from '@/hooks/useNavCounts'; // ← [2026-06-24] 1·2차 사이드바 공용 카운트(중복 제거)
import type {
  EsgActivityKey,
  EsgActivityStatus,
  EsgActivityPeriod,
} from '@/types/esg';

// ============================================================================
// Variant 정의 (Header.tsx 값 계승 + 사이드바 전용 muted/divider 토큰 추가)
// ============================================================================

type Variant = 'dark' | 'light' | 'green';

interface SideTokens {
  bg: string;
  text: string;        // 1차 네비 텍스트
  muted: string;       // 2차 네비 / 지난 이벤트 항목
  desc: string;        // 안내문
  label: string;       // 지난 이벤트 라벨
  divider: string;     // 구분선
  badgeActive: string;
  badgeActiveText: string;
  badgeNeutral: string;
  badgeNeutralText: string;
  hoverBg: string;     // active 항목 배경
  hoverText: string;
  adminText: string;
  adminBg: string;     // green variant 라임 배경
  cartBadgeBg: string;
  cartBadgeText: string;
  logoSrc: string;
}

const VARIANTS: Record<Variant, SideTokens> = {
  dark: {
    bg: '#000000', text: '#FFFFFF', muted: '#848484', desc: '#929292', label: '#CECECE',
    divider: '#202020', badgeActive: '#98F7B6', badgeActiveText: '#000000',
    badgeNeutral: '#BDBDBD', badgeNeutralText: '#000000', hoverBg: '#6DED73', hoverText: '#000000',
    adminText: '#BEFF9B', adminBg: 'transparent', cartBadgeBg: '#EF4444', cartBadgeText: '#FFFFFF',
    logoSrc: '/logo.svg',
  },
  light: {
    bg: '#FFFFFF', text: '#000000', muted: '#6B7280', desc: '#6B7280', label: '#6B7280',
    divider: '#E5E7EB', badgeActive: '#98F7B6', badgeActiveText: '#000000',
    badgeNeutral: '#BDBDBD', badgeNeutralText: '#000000', hoverBg: '#6DED73', hoverText: '#000000',
    adminText: '#28C75B', adminBg: 'transparent', cartBadgeBg: '#EF4444', cartBadgeText: '#FFFFFF',
    logoSrc: '/logo-light.svg',
  },
  green: {
    bg: '#00422C', text: '#FFFFFF', muted: '#9CA3AF', desc: '#9CA3AF', label: '#CFE9DA',
    divider: '#0A5A3E', badgeActive: '#98F7B6', badgeActiveText: '#000000',
    badgeNeutral: '#BDBDBD', badgeNeutralText: '#000000', hoverBg: '#6DED73', hoverText: '#000000',
    adminText: '#000000', adminBg: '#BEFF9B', cartBadgeBg: '#EF4444', cartBadgeText: '#FFFFFF',
    logoSrc: '/logo.svg',
  },
};

const FONT = "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SIDEBAR_W = 346; // ← Figma 사이드바 폭

function getVariantForPath(pathname: string): Variant {
  if (pathname.startsWith('/admin')) return 'green';
  if (
    pathname.startsWith('/bazaar') || pathname.startsWith('/auction') ||
    pathname.startsWith('/cart') || pathname.startsWith('/checkout') ||
    pathname.startsWith('/orders') || pathname.startsWith('/donate') ||
    pathname.startsWith('/mypage') || pathname.startsWith('/notifications')
  ) return 'light';
  return 'dark';
}

// ============================================================================
// 배지 (Header.tsx 설계안 B 로직 그대로 이식)
// ============================================================================

type ActivityKind = 'award' | 'commerce';
interface BadgeInfo { text: string; bg: string; show: boolean; isActive: boolean; }

function calcDayDiff(targetIso: string | undefined): number | null {
  if (!targetIso) return null;
  const kstOffset = 9 * 60 * 60 * 1000;
  const targetKst = new Date(new Date(targetIso).getTime() + kstOffset);
  const nowKst = new Date(Date.now() + kstOffset);
  const day = 1000 * 60 * 60 * 24;
  return Math.floor(targetKst.getTime() / day) - Math.floor(nowKst.getTime() / day);
}

function getBadge(
  status: EsgActivityStatus,
  period: EsgActivityPeriod | undefined,
  kind: ActivityKind,
  t: SideTokens,
): BadgeInfo {
  if (status === 'closed') {
    return { text: kind === 'award' ? '시상완료' : '종료', bg: t.badgeNeutral, show: true, isActive: false };
  }
  if (status === 'before') {
    const d = calcDayDiff(period?.starts_at_utc);
    if (d === null) return { text: '준비중', bg: t.badgeNeutral, show: true, isActive: false };
    if (d <= 0) return { text: '오늘 시작', bg: t.badgeActive, show: true, isActive: true };
    if (d === 1) return { text: '내일 시작', bg: t.badgeActive, show: true, isActive: true };
    return { text: `D-${d}`, bg: t.badgeNeutral, show: true, isActive: false };
  }
  const dEnd = calcDayDiff(period?.ends_at_utc);
  if (dEnd === null) return { text: '진행중', bg: t.badgeActive, show: true, isActive: true };
  if (dEnd <= 0) return { text: '오늘 마감', bg: t.badgeActive, show: true, isActive: true };
  if (dEnd === 1) return { text: '내일 마감', bg: t.badgeActive, show: true, isActive: true };
  return { text: '진행중', bg: t.badgeActive, show: true, isActive: true };
}

function Badge({ badge, t }: { badge?: BadgeInfo; t: SideTokens }) {
  if (!badge?.show) return null;
  return (
    <span style={{
      background: badge.bg,
      color: badge.isActive ? t.badgeActiveText : t.badgeNeutralText,
      padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 500, lineHeight: 1.25,
    }}>
      {badge.text}
    </span>
  );
}

/** 작은 카운트 배지 (장바구니/알림) */
function CountBadge({ n, t }: { n: number; t: SideTokens }) {
  if (n <= 0) return null;
  return (
    <span style={{
      minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
      background: t.cartBadgeBg, color: t.cartBadgeText, fontSize: 10, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      boxSizing: 'border-box', lineHeight: 1,
    }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

// ============================================================================
// 1차 네비 항목 (이벤트 가드 포함)
// ============================================================================

function PrimaryItem({
  to, label, badge, t, activityKey, onNavigate,
}: {
  to: string; label: string; badge?: BadgeInfo; t: SideTokens;
  activityKey?: EsgActivityKey; onNavigate?: () => void;
}) {
  // hooks 규칙: 조건부 호출 금지 → activityKey 없으면 placeholder 키로 호출 후 결과 무시
  const gate = useEventGate(activityKey ?? 'bazaar');
  const blocked = activityKey ? gate.blocked : false;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (blocked) { e.preventDefault(); gate.openGuide(); }
    onNavigate?.();
  };

  return (
    <NavLink
      to={to}
      onClick={handleClick}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
        textDecoration: 'none', color: t.text,                       // ← [2026-06-23] 활성 초록텍스트 제거(기본색 유지)
        fontSize: 24, fontWeight: isActive ? 700 : 400, lineHeight: 1.25, // ← [2026-06-23] 활성=볼드
        whiteSpace: 'nowrap',
        transition: 'font-weight 0.12s, color 0.12s',               // ← [2026-06-23] 활성 초록 배경 알약 삭제
      })}
    >
      {/* ← [2026-06-23] 캡쳐대로 뱃지를 라벨 '왼쪽'으로 (Figma: D-30 → 라벨) */}
      <Badge badge={badge} t={t} />
      {label}
    </NavLink>
  );
}

function AdminItem({ t, onNavigate }: { t: SideTokens; onNavigate?: () => void }) {
  const filled = t.adminBg !== 'transparent'; // green variant
  return (
    <NavLink
      to="/admin"
      onClick={onNavigate}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', padding: filled ? '8px 16px' : '8px 0',
        borderRadius: filled ? 99 : 0, textDecoration: 'none',
        color: filled ? '#000000' : t.adminText,                     // ← [2026-06-23] 활성 hover색 제거(초록 유지)
        fontSize: 24, fontWeight: isActive ? 700 : 500, lineHeight: 1.25, whiteSpace: 'nowrap', // ← 활성=볼드
        background: filled ? t.adminBg : 'transparent',              // ← [2026-06-23] 활성 초록 배경 삭제
        transition: 'font-weight 0.12s, color 0.12s',
      })}
    >
      어드민 관리자
    </NavLink>
  );
}

/** 2차 네비 / 지난 이벤트 항목 (muted, 우측 카운트/배지/시상예정 텍스트 옵션) */
function MutedItem({
  to, label, t, size = 24, badge, count, award, onNavigate,
}: {
  to: string; label: string; t: SideTokens; size?: number;
  badge?: BadgeInfo; count?: number; award?: string; onNavigate?: () => void; // ← [2026-06-23] award: 시상예정 텍스트
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
        textDecoration: 'none', color: isActive ? t.text : t.muted,
        fontSize: size, fontWeight: 400, lineHeight: 1.25, whiteSpace: 'nowrap',
        transition: 'color 0.15s',
      })}
    >
      {label}
      {typeof count === 'number' && <CountBadge n={count} t={t} />}
      <Badge badge={badge} t={t} />
      {/* ← [2026-06-23] 지난 이벤트 시상예정: 알약 대신 흰 텍스트(Figma 1698:1378) */}
      {award && (
        <span style={{ fontSize: 10, fontWeight: 500, color: '#FFFFFF', lineHeight: 1.25 }}>
          {award}
        </span>
      )}
    </NavLink>
  );
}

// ============================================================================
// 사이드바 본문 (데스크톱 패널 / 모바일 드로어 공용)
// ============================================================================

interface NavBodyProps {
  t: SideTokens;
  isAdmin: boolean;
  currentUser: { id: string; name: string; avatar_url: string | null } | null;
  cartCount: number;
  unread: number;
  wishlistCount: number; // ← [2026-06-24] 찜 개수
  badges: { zeroWaste: BadgeInfo; wiseLife: BadgeInfo; bazaar: BadgeInfo; auction: BadgeInfo };
  onLogin: () => void;
  onSignOut: () => void;
  onNavigate?: () => void; // 모바일: 항목 클릭 시 드로어 닫기
  onCollapse?: () => void; // ← [2026-06-23] 데스크톱: 로고 우측 ☰로 사이드바 접기
}

/** 햄버거 메뉴 아이콘 — 업로드된 menu.svg(32×32, 3선) 1:1 이식.
 *  · stroke=currentColor → 헤더 3-variant(dark/light/green) 색 자동 상속
 *  · vectorEffect="non-scaling-stroke" → size를 줄여도 라인이 1px로 크리스프 유지 */
function MenuIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg">
      <path d="M0 7H32" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d="M0 16H32" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d="M0 25H32" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 닫기(X) 아이콘 — MenuIcon과 동일 스트로크 스타일.
 *  menu.svg가 쓰는 7/25 좌표를 그대로 대각선에 사용해 시각적 일관성 유지. */
function CloseIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg">
      <path d="M7 7L25 25" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d="M25 7L7 25" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function NavBody({
  t, isAdmin, currentUser, cartCount, unread, wishlistCount, badges, onLogin, onSignOut, onNavigate, onCollapse,
}: NavBodyProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 44, fontFamily: FONT }}>
      {/* 로고 (+ 데스크톱 접기 버튼) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Link to="/" onClick={onNavigate} aria-label="C&R ESG 홈" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img src={t.logoSrc} alt="C&R ESG" style={{ width: 160, height: 40, display: 'block' }} />
        </Link>
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label="사이드바 접기"
            style={{ width: 32, height: 32, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MenuIcon color={t.text} size={24} /> {/* ← [2026-06-23] DehazeIcon → menu.svg 통일 */}
          </button>
        )}
      </div>

      {/* 1차 네비 (우측 정렬 — [2026-06-23] 캡쳐대로 복원: items-end + 뱃지 좌측) */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <PrimaryItem to="/bazaar" label="나무 심는 바자회" badge={badges.bazaar} t={t} activityKey="bazaar" onNavigate={onNavigate} />
        <PrimaryItem to="/auction" label="ESG 경매" badge={badges.auction} t={t} activityKey="auction" onNavigate={onNavigate} />
        <PrimaryItem to="/donate" label="기부하기" t={t} onNavigate={onNavigate} />
        {isAdmin && <AdminItem t={t} onNavigate={onNavigate} />}
      </nav>

      <div style={{ borderBottom: `1px solid ${t.divider}` }} />

      {/* 안내문 */}
      <p style={{ margin: 0, color: t.desc, fontSize: 12, lineHeight: 1.4 }}>
        바자회, 경매, 기부금 등 모든 수익금은<br />생명의 숲 도심 속 나무 심기 조성 기부에 사용됩니다.
      </p>

      <div style={{ borderBottom: `1px solid ${t.divider}` }} />

      {/* 2차 네비 + 아바타 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <MutedItem to="/cart" label="Cart" t={t} count={currentUser ? cartCount : undefined} onNavigate={onNavigate} />
          <MutedItem to="/mypage/wishlist" label="찜" t={t} count={currentUser ? wishlistCount : undefined} onNavigate={onNavigate} />{/* ← [2026-06-24] 찜 카운트 */}
          <MutedItem to="/mypage" label="My Account" t={t} onNavigate={onNavigate} />
          <MutedItem to="/notifications" label="Notification" t={t} count={currentUser ? unread : undefined} onNavigate={onNavigate} />
        </div>
        {/* 40px 유저 아바타 (로그인 시) / 로그인 버튼 (비로그인) */}
        {currentUser ? (
          <UserAvatarMenu currentUser={currentUser} isAdmin={isAdmin} onSignOut={onSignOut} onNavigate={onNavigate} />
        ) : (
          <button type="button" onClick={() => { onLogin(); onNavigate?.(); }} style={{
            alignSelf: 'flex-start', padding: '8px 16px', background: t.badgeActive, color: t.badgeActiveText,
            border: 'none', borderRadius: 100, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: FONT,
          }}>
            로그인
          </button>
        )}
      </div>

      <div style={{ borderBottom: `1px solid ${t.divider}` }} />

      {/* 지난 이벤트 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <span style={{ color: t.label, fontSize: 16, lineHeight: 1.25 }}>지난 이벤트</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <MutedItem to="/posts/zero-waste" label="제로 웨이스트" award="6/30 시상예정" t={t} size={20} onNavigate={onNavigate} />
          <MutedItem to="/posts/wise-life" label="슬기로운 사회생활" award="6/30 시상예정" t={t} size={20} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 유저 아바타 + 드롭다운 (마이페이지/어드민/로그아웃)
// ============================================================================

function UserAvatarMenu({
  currentUser, isAdmin, onSignOut, onNavigate,
}: {
  currentUser: { name: string; avatar_url: string | null };
  isAdmin: boolean; onSignOut: () => void; onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-side-avatar]')) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div data-side-avatar style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="사용자 메뉴 열기"
        style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'block', lineHeight: 0 }}>
        <Avatar name={currentUser.name} avatarUrl={currentUser.avatar_url} size={40} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: 48, left: 0, minWidth: 200, background: '#fff',
          border: '1px solid #eee', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          padding: 8, zIndex: 200, fontFamily: FONT,
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{currentUser.name}</span>
            {isAdmin && (
              <span style={{ marginLeft: 6, padding: '1px 6px', background: '#0ea5e9', color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>ADMIN</span>
            )}
          </div>
          <Link to="/mypage" onClick={() => { setOpen(false); onNavigate?.(); }} style={dropdownItem}>마이페이지</Link>
          {isAdmin && <Link to="/admin" onClick={() => { setOpen(false); onNavigate?.(); }} style={{ ...dropdownItem, color: '#0ea5e9', fontWeight: 600 }}>어드민</Link>}
          <button type="button" onClick={() => { setOpen(false); onSignOut(); onNavigate?.(); }}
            style={{ ...dropdownItem, width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT }}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

const dropdownItem: React.CSSProperties = {
  display: 'block', padding: '8px 12px', textDecoration: 'none', color: '#222', fontSize: 13, borderRadius: 4,
};

// ============================================================================
// 메인 — 데스크톱 사이드바 / 모바일 상단바 + 드로어
// ============================================================================

export function EsgSideNav({ collapsed = false, onToggleCollapse }: {
  collapsed?: boolean;            // ← [2026-06-23] 데스크톱 접힘 상태(AppLayout 보유)
  onToggleCollapse?: () => void;  // ← 접기/펼치기 토글
} = {}) {
  const { currentUser, signOut, isAdmin } = useCurrentUser();
  const { getActivity } = useEventPhase();
  const location = useLocation();

  const { cartCount, unread, wishlistCount } = useNavCounts(); // ← [2026-06-24] 공용 훅(찜 카운트 포함)
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const variant = getVariantForPath(location.pathname);
  const t = VARIANTS[variant];

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 라우트 변경 시 모바일 드로어 닫기
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // ← [2026-06-24] 장바구니/알림 카운트는 useNavCounts 훅으로 이전(2차 사이드바와 공유)

  const badges = {
    zeroWaste: getBadge(getActivity('zero_waste').status, getActivity('zero_waste').period, 'award', t),
    wiseLife: getBadge(getActivity('wise_life').status, getActivity('wise_life').period, 'award', t),
    bazaar: getBadge(getActivity('bazaar').status, getActivity('bazaar').period, 'commerce', t),
    auction: getBadge(getActivity('auction').status, getActivity('auction').period, 'commerce', t),
  };

  const handleLogin = () => {
    signInWithMicrosoft().catch((e) => { console.error('login failed:', e); alert('로그인을 시작할 수 없습니다.'); });
  };
  const handleSignOut = () => { signOut().catch(console.error); };

  // ---- 모바일: 상단바 + 좌측 드로어 ----
  if (isMobile) {
    return (
      <>
        <header style={{
          position: 'sticky', top: 0, zIndex: 100, background: t.bg, color: t.text, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
          borderBottom: `1px solid ${t.divider}`,
        }}>
          <Link to="/" aria-label="C&R ESG 홈" style={{ display: 'flex', alignItems: 'center' }}>
            <img src={t.logoSrc} alt="C&R ESG" style={{ width: 132, height: 33, display: 'block' }} />
          </Link>
          <button type="button" onClick={() => setMobileOpen((v) => !v)} aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
            style={{ width: 36, height: 36, background: 'transparent', border: 'none', color: t.text, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {mobileOpen
              ? <CloseIcon color={t.text} size={26} />  /* ← [2026-06-23] 텍스트 ✕ → SVG */
              : <MenuIcon color={t.text} size={26} />}  {/* ← [2026-06-23] 텍스트 ☰ → menu.svg */}
          </button>
        </header>

        {mobileOpen && (
          <>
            <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 110 }} />
            <aside style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: Math.min(SIDEBAR_W, 320),
              background: t.bg, color: t.text, zIndex: 120, padding: 32, boxSizing: 'border-box',
              overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            }}>
              <NavBody t={t} isAdmin={isAdmin} currentUser={currentUser}
                cartCount={cartCount} unread={unread} wishlistCount={wishlistCount} badges={badges}
                onLogin={handleLogin} onSignOut={handleSignOut} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </>
        )}
      </>
    );
  }

  // ---- 데스크톱: 좌측 고정(sticky) 사이드바 ----
  // 접힘(89px): 클로버 로고만 — 클릭 시 펼침
  if (collapsed) {
    return (
      <aside style={{
        width: 89, flexShrink: 0, alignSelf: 'flex-start',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        background: t.bg, color: t.text, fontFamily: FONT, padding: '32px 24px', boxSizing: 'border-box',
        transition: 'width 0.2s, background 0.2s',
      }}>
        <button type="button" onClick={onToggleCollapse} aria-label="사이드바 펼치기"
          style={{ width: 41, height: 40, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'block' }}>
          <img src="/favicon.svg" alt="C&R ESG 펼치기" style={{ width: 41, height: 40, display: 'block', objectFit: 'contain' }} />
        </button>
      </aside>
    );
  }

  // 펼침(346px): 전체 + 로고 우측 ☰(접기)
  return (
    <aside style={{
      width: SIDEBAR_W, flexShrink: 0, alignSelf: 'flex-start',
      position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      background: t.bg, color: t.text, fontFamily: FONT, padding: 32, boxSizing: 'border-box',
      transition: 'width 0.2s, background 0.2s, color 0.2s',
    }}>
      <NavBody t={t} isAdmin={isAdmin} currentUser={currentUser}
        cartCount={cartCount} unread={unread} wishlistCount={wishlistCount} badges={badges}
        onLogin={handleLogin} onSignOut={handleSignOut} onCollapse={onToggleCollapse} />
    </aside>
  );
}

export default EsgSideNav;
