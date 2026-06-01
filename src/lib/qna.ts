// ============================================================================
// qna.ts — esg_qna_questions + esg_qna_answers CRUD API
//
// 기능:
//   ── 조회 (모두 공개, 익명) ──
//   - loadQuestions(opts)            : 질문+답변 목록 (페이지네이션, 카테고리 필터)
//   - countQuestions(opts)           : 페이지네이션용 총 개수
//   - loadQuestionsAdmin(opts)       : 어드민 — 작성자 정보 포함
//
//   ── 질문 변경 (사용자) ──
//   - createQuestion(input)          : 질문 등록 (로그인 사용자, 자기 author_id)
//
//   ── 답변 변경 (어드민) ──
//   - createAnswer(question_id, content) : 답변 등록 (질문 status='answered' 자동, DB 트리거)
//   - updateAnswer(id, content)          : 답변 수정
//   - deleteAnswer(id)                   : 답변 삭제 (질문 status='pending' 자동, DB 트리거)
//
//   ── 질문 상태 변경 (어드민) ──
//   - hideQuestion(id)               : 질문 숨김 (status='hidden')
//   - restoreQuestion(id)            : 숨김 해제 (status='pending' or 'answered')
//   - deleteQuestion(id)             : 질문 완전 삭제 (답변도 CASCADE)
//
//   ── Realtime ──
//   - subscribeQna(callback)         : 질문/답변 모든 변경 구독
//
// RLS:
//   - 질문 SELECT: status != 'hidden' 누구나, hidden은 어드민만
//   - 질문 INSERT: 로그인 사용자, 자기 author_id만
//   - 질문 UPDATE/DELETE: 어드민만
//   - 답변 SELECT: 누구나
//   - 답변 INSERT/UPDATE/DELETE: 어드민만
//
// 익명 처리:
//   - 일반 조회(loadQuestions)는 author_id 그대로 반환 (DB가 차단 못 함)
//   - 프론트에서 표시 시 익명으로 마스킹 — UI 레이어 책임
//   - 어드민은 loadQuestionsAdmin으로 작성자 정보 포함 조회
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgQnaCategory,
  EsgQnaQuestionRow,
  EsgQnaAnswerRow,
  EsgQnaQuestionWithAnswer,
  EsgQnaQuestionWithAuthor,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 조회 — 일반 공개 (익명 표시 책임은 UI 레이어)
// ============================================================================

export interface LoadQuestionsOptions {
  /** 카테고리 필터. 미지정 시 전체 */
  category?: EsgQnaCategory;
  /** 페이지 (1부터) */
  page?: number;
  /** 페이지 크기. 기본 5 (Figma 페이지네이션 기준) */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 5;

/**
 * Q&A 질문 + 답변 결합 조회 (페이지네이션).
 * hidden 제외, 최신순.
 *
 * Supabase 중첩 SELECT 활용:
 *   esg_qna_questions + (esg_qna_answers!question_id=... single)
 * → N+1 회피, 1쿼리로 처리.
 */
export async function loadQuestions(
  opts: LoadQuestionsOptions = {}
): Promise<EsgQnaQuestionWithAnswer[]> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('esg_qna_questions')
    .select('*, answer:esg_qna_answers(*)')
    .neq('status', 'hidden')                  // 안전망 (RLS도 막지만 명시)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.category) {
    query = query.eq('category', opts.category);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Supabase는 중첩 1:1을 배열로 반환 → 단일 객체로 평탄화
  return (data ?? []).map((row: EsgQnaQuestionRow & { answer: EsgQnaAnswerRow[] | EsgQnaAnswerRow | null }) => ({
    ...row,
    answer: Array.isArray(row.answer) ? (row.answer[0] ?? null) : (row.answer ?? null),
  })) as EsgQnaQuestionWithAnswer[];
}

/**
 * 페이지네이션용 총 개수.
 * 카테고리 필터 동일하게 적용.
 */
export async function countQuestions(
  opts: Pick<LoadQuestionsOptions, 'category'> = {}
): Promise<number> {
  let query = supabase
    .from('esg_qna_questions')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'hidden');

  if (opts.category) {
    query = query.eq('category', opts.category);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

// ============================================================================
// 조회 — 어드민 (작성자 정보 포함)
// ============================================================================

export interface LoadQuestionsAdminOptions extends LoadQuestionsOptions {
  /** 상태 필터. 미지정 시 hidden 제외 전체 */
  status?: 'pending' | 'answered' | 'hidden' | 'all';
}

/**
 * 어드민용 Q&A 조회 — 작성자(profiles) JOIN.
 * profiles의 id로 매핑 (auth.users.id == profiles.id).
 */
export async function loadQuestionsAdmin(
  opts: LoadQuestionsAdminOptions = {}
): Promise<EsgQnaQuestionWithAuthor[]> {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('esg_qna_questions')
    .select(`
      *,
      answer:esg_qna_answers(*),
      author:profiles!esg_qna_questions_author_id_fkey(id, name, dept, email)
    `)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (opts.category) query = query.eq('category', opts.category);
  if (opts.status && opts.status !== 'all') query = query.eq('status', opts.status);

  const { data, error } = await query;
  if (error) {
    // FK 관계 hint가 잘못된 경우 fallback: 두 번 쿼리 (질문 + 작성자 별도 로드)
    console.warn('[qna] admin join failed, fallback to manual join:', error);
    return loadQuestionsAdminFallback(opts, from, to);
  }

  return (data ?? []).map((row: EsgQnaQuestionRow & {
    answer: EsgQnaAnswerRow[] | EsgQnaAnswerRow | null;
    author: { id: string; name: string; dept: string | null; email: string } | { id: string; name: string; dept: string | null; email: string }[] | null;
  }) => ({
    ...row,
    answer: Array.isArray(row.answer) ? (row.answer[0] ?? null) : (row.answer ?? null),
    author: Array.isArray(row.author) ? (row.author[0] ?? null) : (row.author ?? null),
  })) as EsgQnaQuestionWithAuthor[];
}

/** 어드민 JOIN 실패 시 fallback (FK 관계 hint 없을 때) */
async function loadQuestionsAdminFallback(
  opts: LoadQuestionsAdminOptions,
  from: number,
  to: number,
): Promise<EsgQnaQuestionWithAuthor[]> {
  // 1) 질문 + 답변
  let q1 = supabase
    .from('esg_qna_questions')
    .select('*, answer:esg_qna_answers(*)')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (opts.category) q1 = q1.eq('category', opts.category);
  if (opts.status && opts.status !== 'all') q1 = q1.eq('status', opts.status);

  const { data: questions, error: qErr } = await q1;
  if (qErr) throw qErr;
  const rows = (questions ?? []) as Array<EsgQnaQuestionRow & { answer: EsgQnaAnswerRow[] | EsgQnaAnswerRow | null }>;

  // 2) 작성자 일괄 로드
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  if (authorIds.length === 0) return [];

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, dept, email')
    .in('id', authorIds);
  if (pErr) throw pErr;

  const authorMap = new Map<string, { id: string; name: string; dept: string | null; email: string }>();
  for (const p of (profiles ?? []) as Array<{ id: string; name: string; dept: string | null; email: string }>) {
    authorMap.set(p.id, p);
  }

  return rows.map((row) => ({
    ...row,
    answer: Array.isArray(row.answer) ? (row.answer[0] ?? null) : (row.answer ?? null),
    author: authorMap.get(row.author_id) ?? null,
  }));
}

// ============================================================================
// 질문 변경 (사용자)
// ============================================================================

export interface CreateQuestionInput {
  category: EsgQnaCategory;
  content: string;
}

/**
 * Q&A 질문 등록.
 * RLS: auth.uid() = author_id 만 INSERT 허용.
 */
export async function createQuestion(input: CreateQuestionInput): Promise<EsgQnaQuestionRow> {
  const { data: { user } } = await _supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const trimmed = input.content.trim();
  if (trimmed.length === 0) throw new Error('문의 내용을 입력해 주세요.');
  if (trimmed.length > 200) throw new Error('문의 내용은 200자 이내로 작성해 주세요.');

  const { data, error } = await supabase
    .from('esg_qna_questions')
    .insert({
      category: input.category,
      content: trimmed,
      author_id: user.id,
      // status는 DB 기본값 'pending'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as EsgQnaQuestionRow;
}

// ============================================================================
// 답변 변경 (어드민)
// ============================================================================

/**
 * 답변 등록.
 * DB 트리거가 질문 status='answered' 자동 처리.
 */
export async function createAnswer(
  question_id: string,
  content: string,
): Promise<EsgQnaAnswerRow> {
  const trimmed = content.trim();
  if (trimmed.length === 0) throw new Error('답변 내용을 입력해 주세요.');
  if (trimmed.length > 500) throw new Error('답변 내용은 500자 이내로 작성해 주세요.');

  const { data: { user } } = await _supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { data, error } = await supabase
    .from('esg_qna_answers')
    .insert({
      question_id,
      content: trimmed,
      admin_id: user.id,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as EsgQnaAnswerRow;
}

/** 답변 수정 (어드민) */
export async function updateAnswer(id: string, content: string): Promise<EsgQnaAnswerRow> {
  const trimmed = content.trim();
  if (trimmed.length === 0) throw new Error('답변 내용을 입력해 주세요.');
  if (trimmed.length > 500) throw new Error('답변 내용은 500자 이내로 작성해 주세요.');

  const { data, error } = await supabase
    .from('esg_qna_answers')
    .update({ content: trimmed })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as EsgQnaAnswerRow;
}

/**
 * 답변 삭제 (어드민).
 * DB 트리거가 질문 status='pending'으로 자동 되돌림.
 */
export async function deleteAnswer(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_qna_answers')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================================================
// 질문 상태 변경 (어드민)
// ============================================================================

/** 질문 숨김 처리 */
export async function hideQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_qna_questions')
    .update({ status: 'hidden' })
    .eq('id', id);

  if (error) throw error;
}

/**
 * 숨김 해제.
 * 답변 유무에 따라 'pending' 또는 'answered'로 복원.
 */
export async function restoreQuestion(id: string): Promise<void> {
  // 답변 존재 여부 확인
  const { data: answer, error: aErr } = await supabase
    .from('esg_qna_answers')
    .select('id')
    .eq('question_id', id)
    .maybeSingle();
  if (aErr) throw aErr;

  const newStatus = answer ? 'answered' : 'pending';
  const { error } = await supabase
    .from('esg_qna_questions')
    .update({ status: newStatus })
    .eq('id', id);

  if (error) throw error;
}

/** 질문 완전 삭제 (답변도 CASCADE) */
export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_qna_questions')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================================================
// Realtime
// ============================================================================

/**
 * Q&A 변경 구독 (질문 + 답변 모두).
 * 어드민이 답변 등록 시 사용자 화면에 즉시 반영.
 * 사용자가 질문 등록 시 어드민 화면에 즉시 반영.
 */
export function subscribeQna(callback: () => void): () => void {
  const channelName = `esg-qna-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'esg_qna_questions' },
      () => callback()
    )
    .on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'esg_qna_answers' },
      () => callback()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
