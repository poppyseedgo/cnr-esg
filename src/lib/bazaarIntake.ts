// ============================================================================
// bazaarIntake.ts — 바자회 물품 접수대장 API (관리자 전용)
//
// 흐름:
//   1. 임직원이 물품을 가져오면 접수대(1층 인포데스크)에서 즉시 등록 → createIntake()
//   2. 검수 후 게시 결정 → publishIntake() (공개 상품 esg_products 생성/재반영)
//   3. 게시 중단 필요 시 → unpublishIntake() (상품 hidden)
//
// 설계 메모:
//   - 접수대장(esg_bazaar_intake)은 관리자 전용(RLS). 기증자·원가·접수사진은 비공개.
//   - 게시 시점에만 공개 카탈로그(esg_products)로 "내보내기". 동기화 로직은 DB RPC가 SSOT.
//   - 다른 lib와 동일하게 supabase-js 타입 추론 한계 우회 위해 as any 사용(런타임 동일).
//
// 변경 이력:
//   2026-06-08  최초 작성 — 접수/검수/게시 워크플로 + 기증자(임직원) 검색
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgBazaarIntakeRow,
  EsgBazaarIntakeInsert,
  EsgBazaarIntakePublishStatus,
  BazaarCategory,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 카테고리 SSOT — 바자회 모달 '품목별 기준' 10종 (BazaarGuide.tsx와 동일 라벨)
//   ※ 라벨/순서를 바꾸면 여기만 수정. DB는 code(영문)로 저장.
// ============================================================================
export const BAZAAR_CATEGORIES: ReadonlyArray<{ code: BazaarCategory; label: string }> = [
  { code: 'clothing', label: '의류' },
  { code: 'electronics', label: '전자기기' },
  { code: 'fashion', label: '패션·잡화' },
  { code: 'household', label: '생활용품·화장품' },
  { code: 'book', label: '도서' },
  { code: 'baby', label: '유아용품' },
  { code: 'sports', label: '스포츠·레저' },
  { code: 'stationery', label: '문구·취미' },
  { code: 'plant', label: '식물·원예' },
  { code: 'kitchen', label: '키친·주방' },
];

/** 카테고리 code → 한글 라벨 (없으면 code 그대로) */
export function categoryLabel(code: string | null | undefined): string {
  if (!code) return '-';
  return BAZAAR_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

// ============================================================================
// 기증자(임직원) 검색 — SPACE 참석자 검색과 동일 패턴
//   esg_profile_public view(이름/부서/아바타) 에서 이름 부분일치 검색.
//   활성 사용자만, 최대 limit명.
// ============================================================================
export interface DonorProfile {
  id: string;
  name: string;
  dept: string | null;
  avatar_url: string | null;
}

export async function searchDonorProfiles(
  query: string,
  limit = 8
): Promise<DonorProfile[]> {
  const q = query.trim();
  if (q.length === 0) return [];

  const { data, error } = await supabase
    .from('esg_profile_public')
    .select('id, name, dept, avatar_url')
    .eq('is_active', true)
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DonorProfile[];
}

// ============================================================================
// 접수 목록 조회 (관리자 — RLS 통과)
//   filter: 'all' | 'pending' | 'published' | 'unpublished'
// ============================================================================
export type IntakeFilter = 'all' | EsgBazaarIntakePublishStatus;

export async function loadIntakeList(filter: IntakeFilter = 'all'): Promise<EsgBazaarIntakeRow[]> {
  let query = supabase
    .from('esg_bazaar_intake')
    .select('*')
    .order('created_at', { ascending: false });

  if (filter !== 'all') query = query.eq('publish_status', filter);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EsgBazaarIntakeRow[];
}

// ============================================================================
// 접수 등록
// ============================================================================
export interface CreateIntakeInput {
  name: string;
  category: BazaarCategory;
  donor_id: string | null;          // 임직원이면 profiles.id, 외부/미선택이면 null
  donor_name_snapshot: string;      // 검색 시점 이름(필수)
  donor_dept_snapshot: string | null;
  original_price: number | null;    // 원래 가격(선택)
  listed_price: number;             // 책정 가격
  quantity: number;                 // 수량
  intake_photos: string[];          // 물건 사진(접수/검수 기록) — 최대 5장 // ← [수정 2026-06-08]
  publish_photo_url: string | null; // 게시할 물건 사진(상품 썸네일)
  note: string | null;
  created_by: string | null;        // 접수 등록 관리자 id
}

export async function createIntake(input: CreateIntakeInput): Promise<EsgBazaarIntakeRow> {
  // 가벼운 클라이언트 검증 (DB CHECK가 최종 방어선)
  if (!input.name.trim()) throw new Error('물건 이름을 입력해주세요.');
  if (!input.donor_name_snapshot.trim()) throw new Error('기증자를 선택(또는 입력)해주세요.');
  if (input.listed_price < 0) throw new Error('책정 가격은 0 이상이어야 합니다.');
  if (input.quantity < 1) throw new Error('수량은 1개 이상이어야 합니다.');
  if (input.original_price != null && input.original_price < 0) {
    throw new Error('원래 가격은 0 이상이어야 합니다.');
  }

  const payload: EsgBazaarIntakeInsert = {
    name: input.name.trim(),
    category: input.category,
    donor_id: input.donor_id,
    donor_name_snapshot: input.donor_name_snapshot.trim(),
    donor_dept_snapshot: input.donor_dept_snapshot,
    original_price: input.original_price,
    listed_price: input.listed_price,
    quantity: input.quantity,
    intake_photos: input.intake_photos ?? [],
    publish_photo_url: input.publish_photo_url,
    note: input.note,
    created_by: input.created_by,
  };

  const { data, error } = await supabase
    .from('esg_bazaar_intake')
    .insert([payload])
    .select('*')
    .single();
  if (error) throw error;
  return data as EsgBazaarIntakeRow;
}

// ============================================================================
// 접수 수정
//   ※ 게시(published)된 항목의 카탈로그 필드(이름/가격/수량/게시사진)를 바꾼 뒤
//     "게시 정보 반영(재게시)"을 눌러야 상품에 반영된다. (publishIntake 재호출)
// ============================================================================
export type UpdateIntakePatch = Partial<
  Pick<
    EsgBazaarIntakeRow,
    | 'name'
    | 'category'
    | 'donor_id'
    | 'donor_name_snapshot'
    | 'donor_dept_snapshot'
    | 'original_price'
    | 'listed_price'
    | 'quantity'
    | 'intake_photos'
    | 'publish_photo_url'
    | 'note'
  >
>;

export async function updateIntake(id: string, patch: UpdateIntakePatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  if (patch.listed_price != null && patch.listed_price < 0) {
    throw new Error('책정 가격은 0 이상이어야 합니다.');
  }
  if (patch.quantity != null && patch.quantity < 1) {
    throw new Error('수량은 1개 이상이어야 합니다.');
  }

  const { error } = await supabase
    .from('esg_bazaar_intake')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================================
// 접수 삭제
//   게시된 항목(연결 상품 존재)은 삭제 대신 "게시 중단" 권장 → 가드.
// ============================================================================
export async function deleteIntake(row: EsgBazaarIntakeRow): Promise<void> {
  if (row.product_id) {
    throw new Error('게시된 항목입니다. 먼저 "게시 중단"을 한 뒤 삭제하세요. (주문 이력 보존을 위해 상품은 자동 삭제하지 않습니다)');
  }
  const { error } = await supabase.from('esg_bazaar_intake').delete().eq('id', row.id);
  if (error) throw error;
}

// ============================================================================
// 검수 상태 전이 (pending ↔ passed ↔ rejected) — 일반 UPDATE
//   ※ 이 함수는 "상품이 없는" 검수 단계 상태만 다룬다.
//     게시/게시중단(published/unpublished)은 상품 동기화가 필요하므로
//     반드시 publishIntake()/unpublishIntake() RPC를 사용한다. (오펀 상품 방지)
//   ※ 호출부(UI)에서 published/unpublished 행에는 이 함수를 노출하지 않는다.
// ============================================================================
export type InspectionStatus = 'pending' | 'passed' | 'rejected';

export async function setIntakeStatus(id: string, status: InspectionStatus): Promise<void> {
  const { error } = await supabase
    .from('esg_bazaar_intake')
    .update({ publish_status: status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================================
// 게시 / 게시 중단 (DB RPC — 상품 동기화 SSOT)
// ============================================================================

/** 게시(공개 상품 생성/재반영). 성공 시 product_id 반환. */
export async function publishIntake(intakeId: string): Promise<string> {
  const { data, error } = await supabase.rpc('esg_publish_intake', { p_intake_id: intakeId });
  if (error) throw new Error(error.message ?? '게시 실패');

  const res = data as { success: boolean; product_id?: string; error?: string; reserved_stock?: number };
  if (!res?.success) {
    if (res?.error === 'NOT_ADMIN') throw new Error('관리자만 게시할 수 있습니다.');
    if (res?.error === 'INTAKE_NOT_FOUND') throw new Error('접수 항목을 찾을 수 없습니다.');
    if (res?.error === 'STOCK_BELOW_RESERVED') {
      throw new Error(
        `진행 중인 주문 ${res.reserved_stock ?? ''}개가 있어 수량을 그보다 줄일 수 없습니다. 수량을 늘리거나 주문 처리 후 다시 시도하세요.`
      );
    }
    throw new Error(res?.error ?? '게시 실패');
  }
  return res.product_id as string;
}

/** 게시 중단(상품 hidden, 접수기록 보존). */
export async function unpublishIntake(intakeId: string): Promise<void> {
  const { data, error } = await supabase.rpc('esg_unpublish_intake', { p_intake_id: intakeId });
  if (error) throw new Error(error.message ?? '게시 중단 실패');

  const res = data as { success: boolean; error?: string };
  if (!res?.success) {
    if (res?.error === 'NOT_ADMIN') throw new Error('관리자만 변경할 수 있습니다.');
    throw new Error(res?.error ?? '게시 중단 실패');
  }
}

// ============================================================================
// Realtime 구독 (관리자 목록 실시간 갱신)
// ============================================================================
export function subscribeIntake(callback: () => void): () => void {
  const channelName = `esg-intake-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'esg_bazaar_intake' },
      () => callback()
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
