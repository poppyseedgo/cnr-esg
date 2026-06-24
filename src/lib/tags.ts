// ============================================================================
// tags.ts — 상품 태그 API (워드프레스식 taxonomy)
//
// 함수:
//   - listTagsWithCount()            : 사용자 태그 메뉴용(공개 상품 카운트 포함)
//   - listAllTags()                  : 어드민 자동완성용 전체 태그
//   - upsertTag(name)                : 태그 즉시 등록(있으면 반환, 없으면 생성)
//   - getProductTags(productId)      : 특정 상품의 태그 목록
//   - setProductTags(productId, ids) : 상품 태그 일괄 교체(원자적 RPC)
//
// 설계:
//   - 태그 마스터(esg_tags) + 매핑(esg_product_tags). 워드프레스 terms 구조.
//   - 생성/교체는 RPC(SECURITY DEFINER)로만. 읽기는 RLS 공개.
//   - supabase-js 타입 추론 한계 우회 위해 as any 사용(런타임 동일).
//
// 변경 이력:
//   2026-06-22  최초 작성 — 태그 시스템(기능 ②)
// ============================================================================

import { supabase as _supabase } from './supabase';
import type { EsgTagRow, EsgTagWithCount, TagKind } from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 사용자 태그 메뉴용 — 공개(on_sale/sold_out) 상품 카운트 포함, sort_order 정렬
// ============================================================================
export async function listTagsWithCount(): Promise<EsgTagWithCount[]> {
  const { data, error } = await supabase.rpc('esg_list_tags_with_count');
  if (error) throw error;

  // 카운트 RPC는 kind를 안 주므로 esg_tags(공개 읽기)에서 kind를 병합. // ← [2026-06-23]
  const kindMap = new Map<string, TagKind>();
  const { data: kinds } = await supabase.from('esg_tags').select('id, kind');
  for (const k of (kinds ?? []) as Array<{ id: string; kind: TagKind }>) {
    kindMap.set(k.id, k.kind);
  }

  // product_count 는 bigint → 문자열로 올 수 있어 Number 정규화
  return ((data ?? []) as EsgTagWithCount[]).map((t) => ({
    ...t,
    kind: kindMap.get(t.id) ?? 'category',          // ← [2026-06-23] kind 병합(기본 category)
    product_count: Number(t.product_count) || 0,   // ← bigint 문자열 방어
  }));
}

// ============================================================================
// 어드민 자동완성용 — 전체 태그(이름 오름차순)
// ============================================================================
export async function listAllTags(): Promise<EsgTagRow[]> {
  const { data, error } = await supabase
    .from('esg_tags')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EsgTagRow[];
}

// ============================================================================
// 태그 즉시 등록 — 같은 slug 있으면 그 태그 반환, 없으면 생성
//   (워드프레스 "엔터 → 즉시 생성". 중복 입력해도 안전)
// ============================================================================
export async function upsertTag(name: string, kind: TagKind = 'category'): Promise<EsgTagRow> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('태그 이름을 입력해주세요.');

  // ← [2026-06-23] kind 보존 upsert(신규만 kind 부여, 기존은 보존)
  const { data, error } = await supabase.rpc('esg_upsert_tag_kind', { p_name: trimmed, p_kind: kind });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('NOT_ADMIN')) throw new Error('관리자만 태그를 만들 수 있습니다.');
    if (msg.includes('EMPTY_TAG_NAME')) throw new Error('태그 이름을 입력해주세요.');
    if (msg.includes('INVALID_KIND')) throw new Error('태그 종류가 올바르지 않습니다.');
    throw new Error(msg || '태그 등록 실패');
  }
  return data as EsgTagRow;
}

// ============================================================================
// 태그 종류 변경(관리자) — 기존 태그를 카테고리↔브랜드로 재분류   // ← [2026-06-23]
// ============================================================================
export async function setTagKind(tagId: string, kind: TagKind): Promise<void> {
  const { data, error } = await supabase.rpc('esg_set_tag_kind', { p_tag_id: tagId, p_kind: kind });
  if (error) throw new Error(error.message ?? '태그 종류 변경 실패');
  const res = data as { success: boolean; error?: string };
  if (!res?.success) throw new Error(res?.error ?? '태그 종류 변경 실패');
}

// ============================================================================
// 특정 상품의 태그 목록 (상품 수정폼 초기값)
// ============================================================================
export async function getProductTags(productId: string): Promise<EsgTagRow[]> {
  const { data, error } = await supabase
    .from('esg_product_tags')
    .select('tag_id, esg_tags(*)')   // 매핑 → 태그 조인
    .eq('product_id', productId);
  if (error) throw error;
  // 조인 결과에서 태그 행만 추출(정렬은 sort_order→name)
  const rows = (data ?? []) as Array<{ esg_tags: EsgTagRow | null }>;
  return rows
    .map((r) => r.esg_tags)
    .filter((t): t is EsgTagRow => t != null)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

// ============================================================================
// 상품 태그 일괄 교체 (원자적 RPC) — tagIds 빈 배열이면 전체 해제
// ============================================================================
export async function setProductTags(productId: string, tagIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('esg_set_product_tags', {
    p_product_id: productId,
    p_tag_ids: tagIds,
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('NOT_ADMIN')) throw new Error('관리자만 태그를 변경할 수 있습니다.');
    if (msg.includes('PRODUCT_NOT_FOUND')) throw new Error('상품을 찾을 수 없습니다.');
    throw new Error(msg || '태그 변경 실패');
  }
}

// ============================================================================
// 여러 상품의 태그 일괄 조회 — 리스트 카드 표시용(N+1 방지)   // ← [2026-06-23]
//   반환: Map<product_id, EsgTagRow[]>  (sort_order→name 정렬)
// ============================================================================
export async function loadProductTagsBatch(productIds: string[]): Promise<Map<string, EsgTagRow[]>> {
  const map = new Map<string, EsgTagRow[]>();
  if (productIds.length === 0) return map;

  const { data, error } = await supabase
    .from('esg_product_tags')
    .select('product_id, esg_tags(*)')
    .in('product_id', productIds);
  if (error) {
    console.warn('[loadProductTagsBatch] 태그 조회 실패:', error.message);
    return map;
  }

  for (const r of (data ?? []) as Array<{ product_id: string; esg_tags: EsgTagRow | null }>) {
    if (!r.esg_tags) continue;
    const arr = map.get(r.product_id) ?? [];
    arr.push(r.esg_tags);
    map.set(r.product_id, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  return map;
}

/** 태그 배열을 종류별로 분리 — 표시/편집 공통 유틸. // ← [2026-06-23] */
export function splitTagsByKind(tags: EsgTagRow[]): { categories: EsgTagRow[]; brands: EsgTagRow[] } {
  return {
    categories: tags.filter((t) => t.kind !== 'brand'),
    brands: tags.filter((t) => t.kind === 'brand'),
  };
}
