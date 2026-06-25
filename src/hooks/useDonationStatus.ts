// ============================================================================
// useDonationStatus.ts — 메인 모금 현황 데이터 훅
//
// [변경 이력]
//   2026-06-23  최초 작성.
//   2026-06-25  실시간 신호원 교체(근본 해결).
//               - 폐기: esg_orders / esg_donations 직접 구독.
//                 사유 → 두 테이블 SELECT RLS 는 (소유자 OR 관리자)로 제한.
//                 Supabase Realtime postgres_changes 는 RLS 로 "행 단위" 필터되므로,
//                 남이 결제한 주문 변경 이벤트는 일반 방문자에게 전달되지 않음.
//                 → 공개 홈(/)의 다수 방문자는 새로고침 전까지 위젯이 멈춤(= 신고 증상).
//               - 도입: 누구나 SELECT 가능한 '공개 단일행 미러' esg_donation_live 구독.
//                 그 1행 변경 이벤트는 anon/authenticated 전원에게 전달됨 → 전원 실시간.
//               - 추가: 목표금액(esg_settings.donation_goal) 실시간 반영(SELECT=public).
//
// [설계]  ※ 추측 배제 — 어드민(AdminDashboard)이 쓰는 동일 소스/패턴 재사용.
//   - 현재 달성 금액(current) = loadDonationStats().total_raised
//       (esg_donation_stats view, paid 주문/기부 실시간 합산 — 집계 SSOT 불변)
//   - 목표 금액(goal)          = loadSetting('donation_goal')  (esg_settings 단일 소스)
//   - 실시간(전원):
//       · esg_donation_live(공개 단일행 미러) 변경을 "신호"로 구독 → 뷰(SSOT) 재조회.
//         미러는 esg_orders/esg_donations 변경 시 DB 트리거가 뷰값을 그대로 UPSERT.
//         (값의 출처는 여전히 esg_donation_stats 뷰. 미러는 '전원 수신용 신호'일 뿐)
//       · esg_settings(donation_goal) 변경도 구독 → 목표 변경 즉시 기준선 반영.
//       · 두 테이블 모두 SELECT=public → RLS 필터 없이 전원에게 이벤트 전달.
//       · 미러/publication 미설정이어도 마운트 시 1회 로드는 정상(graceful degradation).
//   ※ 선행: Supabase SQL Editor 에서 donation_live_realtime.sql 1회 실행 필요.
//
// [반환]
//   current / goal / ratio(0~1) / loading / error / reload
//   → DonationTreeGrid·DonationProgressBar 에 current·goal 그대로 주입.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { loadDonationStats } from '@/lib/api';        // ← esg_donation_stats view 조회
import { loadSetting } from '@/lib/settings';          // ← 'donation_goal' 조회
import { subscribeTable, supabase } from '@/lib/supabase'; // ← Realtime 구독/해제

export interface DonationStatus {
  /** 현재 달성 금액(원) */
  current: number;
  /** 목표 금액(원) */
  goal: number;
  /** 달성 비율 0~1 (목표 0이면 0) */
  ratio: number;
  loading: boolean;
  error: string | null;
  /** 수동 재조회 */
  reload: () => void;
}

export function useDonationStatus(): DonationStatus {
  const [current, setCurrent] = useState(0);
  const [goal, setGoal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      // 어드민과 동일: 총 모금액 + 목표 병렬 조회 (집계 SSOT = esg_donation_stats 뷰)
      const [stats, g] = await Promise.all([
        loadDonationStats(),
        loadSetting('donation_goal'),
      ]);
      setCurrent(stats.total_raised ?? 0); // ← 현재 달성 금액
      setGoal(g ?? 0);                     // ← 목표 금액
    } catch (e) {
      console.error('[useDonationStatus]', e);
      setError(e instanceof Error ? e.message : '모금 현황을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();

    // ── [2026-06-25] 실시간 신호: 공개 단일행 미러 esg_donation_live 구독 ──
    //   RLS=public(SELECT true) → 결제자/관리자뿐 아니라 모든 방문자에게 이벤트 전달.
    //   미러 변경 = "모금액 바뀜" 신호 → 뷰(SSOT) 재조회로 정확값 반영.
    //   (esg_donation_live 는 생성 Database 타입에 미포함 → raw 채널로 직접 구독)
    const chLive = supabase
      .channel(`esg-donation-live-${Date.now()}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'esg_donation_live' }, // ← 공개 1행 미러
        () => void reload(), // ← 신호 수신 즉시 재조회
      )
      .subscribe();

    // ── [2026-06-25] 목표금액 실시간: esg_settings(SELECT=public) 중 donation_goal 만 구독 ──
    //   관리자가 목표 변경 시 진행바/그리드 기준선도 즉시 반영(RLS 필터 문제 없음).
    const chGoal = subscribeTable(
      'esg_settings',
      '*',
      () => void reload(),
      'key=eq.donation_goal', // ← donation_goal 키 변경만 수신(노이즈 차단)
    );

    return () => {
      supabase.removeChannel(chLive); // ← 채널 정리
      supabase.removeChannel(chGoal);
    };
  }, [reload]);

  const ratio = goal > 0 ? Math.max(0, Math.min(1, current / goal)) : 0; // ← 0~1 clamp

  return { current, goal, ratio, loading, error, reload };
}

export default useDonationStatus;
