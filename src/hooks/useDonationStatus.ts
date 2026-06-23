// ============================================================================
// useDonationStatus.ts — 메인 모금 현황 데이터 훅
//
// [변경 이력]
//   2026-06-23  최초 작성.
//
// [설계]  ※ 추측 배제 — 어드민(AdminDashboard)이 쓰는 동일 소스/패턴 재사용.
//   - 현재 달성 금액(current) = loadDonationStats().total_raised
//       (esg_donation_stats view, paid 주문/기부 실시간 합산)
//   - 목표 금액(goal)          = loadSetting('donation_goal')  (esg_settings 단일 소스)
//   - 실시간: esg_orders / esg_donations 변경 구독 → 뷰 재계산값 재로드.
//       · 두 테이블의 Realtime publication 활성화 시 자동 반영(미활성이어도
//         마운트 시 1회 로드는 정상 동작 — graceful degradation).
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
      // 어드민과 동일: 총 모금액 + 목표 병렬 조회
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
    // 결제/기부 변경 → 뷰(esg_donation_stats) 재계산 → 재로드.
    // esg_donation_stats 는 esg_orders + esg_donations 두 소스를 합산하므로 둘 다 구독.
    const chOrders = subscribeTable('esg_orders', '*', () => void reload()); // ← 주문 결제(타입된 헬퍼)
    // esg_donations 는 생성된 Database 타입에 미포함 → raw 채널로 직접 구독(캐스팅 회피)
    const chDonations = supabase
      .channel(`esg-donation-status-donations-${Date.now()}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'esg_donations' },
        () => void reload(), // ← 자발적 기부 결제
      )
      .subscribe();
    return () => {
      supabase.removeChannel(chOrders);     // ← 채널 정리
      supabase.removeChannel(chDonations);
    };
  }, [reload]);

  const ratio = goal > 0 ? Math.max(0, Math.min(1, current / goal)) : 0; // ← 0~1 clamp

  return { current, goal, ratio, loading, error, reload };
}

export default useDonationStatus;
