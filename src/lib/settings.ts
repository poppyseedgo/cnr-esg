// ============================================================================
// settings.ts — esg_settings 조회/저장 API
//
// 함수:
//   - loadAllSettings()                       : 모든 설정 일괄 조회 → key-value 맵
//   - loadSetting<K>(key)                     : 단일 설정 조회 (타입 안전)
//   - updateSetting<K>(key, value)            : 단일 설정 저장 (어드민만 RLS 통과)
//   - subscribeSettings(callback)             : Realtime
//
// RLS:
//   - SELECT: 누구나 가능
//   - UPDATE/INSERT: 어드민만 (esg_is_admin() 검증)
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgSettingsRow,
  EsgSettingsKey,
  EsgSettingsValueMap,
} from '@/types/esg';

// supabase-js 2.49 타입 추론 한계 우회 (TODO #1)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

/** 모든 설정 일괄 조회 (key-value 맵으로 반환) */
export async function loadAllSettings(): Promise<Partial<EsgSettingsValueMap>> {
  const { data, error } = await supabase.from('esg_settings').select('*');
  if (error) throw error;

  const map: Partial<EsgSettingsValueMap> = {};
  for (const row of (data ?? []) as EsgSettingsRow[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any)[row.key] = row.value;
  }
  return map;
}

/** 단일 설정 조회 (타입 안전) */
export async function loadSetting<K extends EsgSettingsKey>(
  key: K
): Promise<EsgSettingsValueMap[K] | null> {
  const { data, error } = await supabase
    .from('esg_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return (data?.value ?? null) as EsgSettingsValueMap[K] | null;
}

/**
 * 단일 설정 저장 (어드민만 RLS 통과).
 * - 존재하지 않는 key는 INSERT (upsert)
 * - 존재하면 UPDATE
 */
export async function updateSetting<K extends EsgSettingsKey>(
  key: K,
  value: EsgSettingsValueMap[K]
): Promise<void> {
  const { error } = await supabase
    .from('esg_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  if (error) throw error;
}

/** Realtime — 다른 어드민이 설정 변경하면 즉시 반영 */
export function subscribeSettings(callback: () => void): () => void {
  const channelName = `esg-admin-settings-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_settings' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================================
// 시간 변환 헬퍼 (KST 입력 ↔ UTC 저장)
// ============================================================================

/**
 * KST datetime-local 입력값 ("2026-05-26T17:00") → UTC ISO 문자열
 * datetime-local은 timezone 정보가 없으므로 KST로 해석.
 *
 * 예: "2026-05-26T17:00" (KST 의미) → "2026-05-26T08:00:00.000Z" (UTC)
 */
export function kstInputToUtcIso(kstLocal: string): string {
  if (!kstLocal) return '';
  // "2026-05-26T17:00" + "+09:00" → Date → toISOString (UTC)
  const withOffset = kstLocal.length === 16 ? `${kstLocal}:00+09:00` : `${kstLocal}+09:00`;
  return new Date(withOffset).toISOString();
}

/**
 * UTC ISO 문자열 → datetime-local 입력값 (KST)
 * 예: "2026-05-26T08:00:00Z" → "2026-05-26T17:00"
 */
export function utcIsoToKstInput(utc: string): string {
  if (!utc) return '';
  const d = new Date(utc);
  // KST 변환: UTC + 9시간
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  // toISOString → "2026-05-26T17:00:00.000Z" → slice 16자 → "2026-05-26T17:00"
  return kst.toISOString().slice(0, 16);
}
