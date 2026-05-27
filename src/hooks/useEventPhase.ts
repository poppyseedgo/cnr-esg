// ============================================================================
// useEventPhase — 이벤트 페이즈 + 활동별 기간 전역 상태
//
// 사용:
//   const { phase, activityPeriods, getActivity, settings, loading } = useEventPhase();
//   const bazaar = getActivity('bazaar');  // { period, status }
//   if (bazaar.status === 'active') { ... }
//
// 설계:
//   - 앱 시작 시 esg_settings 1회 로드
//   - esg_settings 변경 Realtime 구독 (어드민이 페이즈/기간 변경 시 즉시 반영)
//   - phase: 전역 비상 토글 (수동 강제)
//   - activity_periods: 5개 활동 시간 기반 상태 (SSOT)
// ============================================================================

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { loadAllSettings } from '@/lib/api';
import {
  getEventPhase,
  getActivityStatus,
  isReadOnly,
} from '@/utils/time';
import type {
  EsgEventPhase,
  EsgSettingsValueMap,
  EsgActivityKey,
  EsgActivityPeriod,
  EsgActivityPeriods,
  EsgActivityStatus,
} from '@/types/esg';

export interface ActivityInfo {
  period: EsgActivityPeriod | undefined;
  /** archived 페이즈면 강제로 'closed' */
  status: EsgActivityStatus;
}

export interface UseEventPhaseResult {
  phase: EsgEventPhase;
  settings: Partial<EsgSettingsValueMap>;
  activityPeriods: EsgActivityPeriods;
  /** 활동 단위 상태 조회 (archived 페이즈 자동 반영) */
  getActivity: (key: EsgActivityKey) => ActivityInfo;
  loading: boolean;
  error: string | null;
}

export function useEventPhase(): UseEventPhaseResult {
  const [settings, setSettings] = useState<Partial<EsgSettingsValueMap>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    loadAllSettings()
      .then((s) => {
        if (mounted) {
          setSettings(s);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('[useEventPhase] load error:', e);
        if (mounted) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });

    // Realtime 구독 — 어드민이 페이즈/기간 변경 시 즉시 반영
    //
    // 채널 이름을 unique하게 만들어야 하는 이유:
    //   - React StrictMode는 dev에서 useEffect를 2번 실행 (mount → cleanup → mount)
    //   - 같은 채널 이름을 빠르게 두 번 만들면 Supabase가 같은 인스턴스를 재사용
    //     → 이미 subscribed 상태에서 .on() 추가 시 "cannot add callbacks after subscribe()" 에러
    //   - 또한 같은 hook이 여러 컴포넌트에서 호출되면 채널 이름이 충돌함
    //
    // cleanup에서 removeChannel() 사용 이유:
    //   - unsubscribe()만으로는 채널이 클라이언트 캐시에 남아있을 수 있음
    //   - removeChannel은 unsubscribe + 캐시 제거를 모두 수행 (공식 권장 패턴)
    const channelName = `esg-settings-${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase
      .channel(channelName)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'esg_settings' },
        () => {
          loadAllSettings()
            .then((s) => {
              if (mounted) setSettings(s);
            })
            .catch((e) => console.error('[useEventPhase] reload error:', e));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const phase = getEventPhase(settings);
  const activityPeriods: EsgActivityPeriods = settings.activity_periods ?? {};
  const archived = isReadOnly(phase);

  const getActivity = (key: EsgActivityKey): ActivityInfo => {
    const period = activityPeriods[key];
    // archived 페이즈는 모든 활동 강제 closed
    const status: EsgActivityStatus = archived
      ? 'closed'
      : getActivityStatus(period);
    return { period, status };
  };

  return {
    phase,
    settings,
    activityPeriods,
    getActivity,
    loading,
    error,
  };
}
