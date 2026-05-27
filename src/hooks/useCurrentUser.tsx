// ============================================================================
// 전역 사용자 상태 (Context + Provider + Hook)
//
// 사용법:
//   1. App.tsx 최상위에 <AuthProvider>로 감싸기
//   2. 하위 컴포넌트에서 const { currentUser, ... } = useCurrentUser();
//
// 핵심 로직:
//   - 앱 시작 시 기존 세션 자동 복구 (Supabase localStorage 기반)
//   - onAuthStateChange로 로그인/로그아웃/토큰갱신 자동 반영
//   - 2단계 로딩: session → temp user (즉시 렌더) → profile (정확)
//   - 도메인 불일치/비활성 사용자 → 자동 로그아웃 + 안내 메시지
// ============================================================================

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchProfile,
  sessionToTemporaryUser,
  signInWithMicrosoft as authSignInWithMicrosoft,
  signOut as authSignOut,
} from '@/lib/auth';
import type { CurrentUser } from '@/types/esg';

// ============================================================================
// Context 타입
// ============================================================================

interface AuthContextValue {
  /** 로그인된 사용자. 비로그인 상태에서는 null. */
  currentUser: CurrentUser | null;
  /** 앱 시작 또는 로그인 처리 중 */
  loading: boolean;
  /** 도메인 불일치/비활성 등 검증 실패 시 사용자에게 보여줄 메시지 */
  authError: string | null;
  /** Microsoft 로그인 트리거 */
  signInWithMicrosoft: () => Promise<void>;
  /** 로그아웃 */
  signOut: () => Promise<void>;
  /** 관리자 여부 (role=ADMIN AND is_active) */
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // unmount 후 setState 방지 (메모리 누수 경고 방지)
  const mountedRef = useRef(true);

  /**
   * session.user를 받아서 CurrentUser로 변환 + 상태 갱신.
   * - sessionUser=null 이면 비로그인 상태로 처리
   * - 도메인/active 검증 실패 시 강제 로그아웃 + 에러 메시지
   */
  const applySession = async (
    sessionUser:
      | { id: string; email?: string | null; user_metadata?: Record<string, unknown> }
      | null
  ): Promise<void> => {
    if (!sessionUser?.id) {
      if (mountedRef.current) {
        setCurrentUser(null);
        setLoading(false);
      }
      return;
    }

    // 1단계: 즉시 임시 user (빠른 렌더 — UI 깜빡임 방지)
    const tempUser = sessionToTemporaryUser(sessionUser);
    if (mountedRef.current) {
      setCurrentUser(tempUser);
    }

    // 2단계: DB profile 조회 (정확한 role, dept, is_active 검증)
    const profile = await fetchProfile(sessionUser.id);
    if (!mountedRef.current) return;

    if (!profile) {
      // 도메인 불일치 또는 비활성 사용자 → 강제 로그아웃
      setAuthError(
        '로그인이 허용되지 않은 계정입니다. 회사 이메일(@cnrres.com)로 로그인해주세요. ' +
          '계정이 비활성 상태일 수도 있습니다.'
      );
      try {
        await authSignOut();
      } catch {
        // signOut 실패해도 UI는 비로그인 상태로 유지
      }
      if (mountedRef.current) {
        setCurrentUser(null);
        setLoading(false);
      }
      return;
    }

    if (mountedRef.current) {
      setCurrentUser(profile);
      setAuthError(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    // ────────────────────────────────────────────────────────────
    // 1) 앱 시작 시 기존 세션 확인 (새로고침 후 자동 로그인 유지)
    // ────────────────────────────────────────────────────────────
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[auth] getSession error:', error);
      }
      await applySession(data.session?.user ?? null);
    })();

    // ────────────────────────────────────────────────────────────
    // 2) 인증 상태 변경 구독 (로그인/로그아웃/토큰 갱신)
    // ────────────────────────────────────────────────────────────
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT 은 동기 처리 (DB 조회 불필요)
      if (event === 'SIGNED_OUT') {
        if (mountedRef.current) {
          setCurrentUser(null);
          setAuthError(null);
          setLoading(false);
        }
        return;
      }
      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED 등은 비동기 처리
      applySession(session?.user ?? null);
    });

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    currentUser,
    loading,
    authError,
    isAdmin:
      currentUser?.role === 'ADMIN' && currentUser?.is_active === true,
    signInWithMicrosoft: async () => {
      setAuthError(null);
      await authSignInWithMicrosoft();
    },
    signOut: async () => {
      await authSignOut();
      // onAuthStateChange가 SIGNED_OUT 이벤트로 currentUser=null 처리
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/** 현재 사용자 + 인증 액션. <AuthProvider> 하위에서만 사용 가능. */
export function useCurrentUser(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useCurrentUser must be used within <AuthProvider>');
  }
  return ctx;
}
