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
//
// 변경 이력:
//   2026-06-23  [근본 수정] 탭 복귀 시 모달 닫힘 / 어드민→홈 리다이렉트 버그 해결.
//               원인: 탭 복귀 시 supabase가 TOKEN_REFRESHED(또는 SIGNED_IN) 발생 →
//                     applySession이 currentUser를 임시 user(role:'USER')로 다운그레이드 →
//                     수백 ms 동안 isAdmin=false → RequireAdmin/ActivityGate가
//                     어드민 화면 언마운트/리다이렉트.
//               수정: (1) onAuthStateChange에서 "동일 사용자 토큰 갱신/재포커스"는 무시.
//                     (2) applySession은 이미 해석된 동일 사용자를 임시 USER로 덮어쓰지 않음.
//                     → 토큰 갱신은 재인증이 아니므로 사용자 상태를 절대 리셋하지 않는다.
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

  // 이미 "정식 프로필(fetchProfile 성공)"이 적용된 사용자 id.
  // ← 토큰 갱신/탭 복귀 시 동일 사용자를 임시 USER로 덮어쓰지 않기 위한 기준값.
  const resolvedUserIdRef = useRef<string | null>(null); // ← [추가] 근본 수정 기준값

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
      resolvedUserIdRef.current = null; // ← [추가] 비로그인 → 기준값 초기화
      if (mountedRef.current) {
        setCurrentUser(null);
        setLoading(false);
      }
      return;
    }

    // 이미 동일 사용자의 정식 프로필이 적용된 상태인지 판단.
    // ← true면 임시 USER 다운그레이드를 건너뛴다 (isAdmin 깜빡임 원천 차단).
    const alreadyResolvedSameUser =
      resolvedUserIdRef.current === sessionUser.id; // ← [추가] 근본 수정 핵심

    // 1단계: 즉시 임시 user (빠른 렌더 — UI 깜빡임 방지)
    //   단, 이미 정식 프로필이 있는 동일 사용자면 다운그레이드하지 않음.
    if (!alreadyResolvedSameUser) {
      const tempUser = sessionToTemporaryUser(sessionUser); // ← [수정] 조건부로만 생성
      if (mountedRef.current) {
        setCurrentUser(tempUser);
      }
    }

    // 2단계: DB profile 조회 (정확한 role, dept, is_active 검증)
    //   - fetchProfile은 "미허용(도메인/비활성/없음)"이면 null, "네트워크/쿼리 오류"면 throw.
    //   - 모바일 등 불안정 네트워크 대비 최대 3회 재시도.
    //   - 끝까지 실패(throw)하면: 세션 유지(강제 로그아웃 금지) + 로딩 해제 + 안내.
    //     → 일시 오류로 정상 사용자가 튕기던 버그(모바일 접속 불가) 방지.
    let profile: CurrentUser | null = null;
    let fetchFailed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        profile = await fetchProfile(sessionUser.id);
        fetchFailed = false;
        break;
      } catch (e) {
        fetchFailed = true;
        console.error(`[auth] fetchProfile attempt ${attempt + 1} failed:`, e);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
    }
    if (!mountedRef.current) return;

    if (fetchFailed) {
      // 네트워크/쿼리 오류 — 로그아웃하지 않음.
      if (alreadyResolvedSameUser) {
        // ← [추가] 이미 정식 프로필 보유(탭 복귀/토큰 갱신 중 실패) → 기존 상태 그대로 유지, 에러 미표시.
        if (mountedRef.current) setLoading(false);
        return;
      }
      // 최초 진입 등에서 실패 — 임시 user 유지, 로딩만 해제 + 안내.
      setAuthError('네트워크 문제로 사용자 정보를 확인하지 못했습니다. 잠시 후 새로고침 해주세요.');
      setLoading(false);
      return;
    }

    if (!profile) {
      // 도메인 불일치 또는 비활성 사용자 → 강제 로그아웃 (진짜 미허용일 때만)
      resolvedUserIdRef.current = null; // ← [추가] 미허용 확정 → 기준값 초기화
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
      resolvedUserIdRef.current = profile.id; // ← [추가] 정식 프로필 확정 → 기준값 기록
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
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[auth] getSession error:', error);
        }
        await applySession(data.session?.user ?? null);
      } catch (e) {
        // getSession 자체 실패(네트워크 등) — 무한 로딩 방지
        console.error('[auth] getSession threw:', e);
        if (mountedRef.current) setLoading(false);
      }
    })();

    // ────────────────────────────────────────────────────────────
    // 2) 인증 상태 변경 구독 (로그인/로그아웃/토큰 갱신)
    // ────────────────────────────────────────────────────────────
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT 은 동기 처리 (DB 조회 불필요)
      if (event === 'SIGNED_OUT') {
        resolvedUserIdRef.current = null; // ← [추가] 로그아웃 → 기준값 초기화
        if (mountedRef.current) {
          setCurrentUser(null);
          setAuthError(null);
          setLoading(false);
        }
        return;
      }

      const incomingId = session?.user?.id ?? null; // ← [추가] 이번 이벤트의 사용자 id

      // ────────────────────────────────────────────────────────────
      // [근본 수정] 동일 사용자의 "토큰 자동 갱신 / 탭 복귀 재포커스"는 무시.
      //   - supabase-js는 탭 복귀 시 TOKEN_REFRESHED 또는 SIGNED_IN을 재발생시킴.
      //   - 신원/역할은 그대로이므로 currentUser를 절대 건드리지 않는다.
      //   - 이로써 isAdmin이 잠깐 false로 깜빡이며 모달이 닫히거나
      //     어드민이 홈으로 튕기던 버그를 원천 차단한다.
      // ────────────────────────────────────────────────────────────
      if (
        (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && // ← [추가] 갱신/재포커스 이벤트
        incomingId &&                                              // ← [추가] 세션 유효
        incomingId === resolvedUserIdRef.current                  // ← [추가] 이미 해석된 동일 사용자
      ) {
        return; // ← [추가] no-op: 상태 변화 없음 (리렌더/리마운트 방지)
      }

      // 그 외(최초 로그인, 사용자 변경, USER_UPDATED 등)는 정상 처리
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
