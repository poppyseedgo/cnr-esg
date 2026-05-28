// ============================================================================
// productQuestions.ts — 상품 Q&A API
//
// 함수:
//   - loadQuestions(productType, productId) : 질문 목록
//   - loadAnswers(questionId)                : 답변 목록
//   - createQuestion(input)                  : 질문 등록
//   - updateQuestion(id, body)               : 본문 수정 (본인)
//   - deleteQuestion(id)                     : 삭제 (본인 또는 어드민)
//   - createAnswer(input)                    : 답변 등록 (어드민)
//   - updateAnswer(id, body)                 : 답변 수정 (어드민)
//   - deleteAnswer(id)                       : 답변 삭제 (어드민)
//   - subscribeQuestions(productType, productId, callback) : Realtime
// ============================================================================

import { supabase as _supabase } from './supabase';
import type {
  EsgProductQuestionRow,
  EsgProductQuestionAnswerRow,
} from '@/types/esg';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ============================================================================
// 질문
// ============================================================================

export async function loadQuestions(
  productType: 'bazaar' | 'auction',
  productId: string,
): Promise<EsgProductQuestionRow[]> {
  const { data, error } = await supabase
    .from('esg_product_questions')
    .select('*')
    .eq('product_type', productType)
    .eq('product_id', productId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as EsgProductQuestionRow[];
}

export interface CreateQuestionInput {
  product_type: 'bazaar' | 'auction';
  product_id: string;
  body: string;
  is_private?: boolean;
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<EsgProductQuestionRow> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('로그인이 필요합니다.');

  // 프로필에서 이름 가져오기 (snapshot)
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', u.user.id)
    .maybeSingle();

  const userName = profile?.name ?? u.user.email?.split('@')[0] ?? 'unknown';
  const userEmail = profile?.email ?? u.user.email ?? '';

  const { data, error } = await supabase
    .from('esg_product_questions')
    .insert({
      product_type: input.product_type,
      product_id: input.product_id,
      user_id: u.user.id,
      user_email: userEmail,
      user_name_snapshot: userName,
      body: input.body,
      is_private: input.is_private ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return data as EsgProductQuestionRow;
}

export async function updateQuestion(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('esg_product_questions')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from('esg_product_questions').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================================
// 답변
// ============================================================================

export async function loadAnswers(
  questionId: string,
): Promise<EsgProductQuestionAnswerRow[]> {
  const { data, error } = await supabase
    .from('esg_product_question_answers')
    .select('*')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as EsgProductQuestionAnswerRow[];
}

export async function createAnswer(input: {
  question_id: string;
  body: string;
}): Promise<EsgProductQuestionAnswerRow> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('로그인이 필요합니다.');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', u.user.id)
    .maybeSingle();

  const adminName = profile?.name ?? 'admin';
  const adminEmail = profile?.email ?? u.user.email ?? '';

  const { data, error } = await supabase
    .from('esg_product_question_answers')
    .insert({
      question_id: input.question_id,
      admin_id: u.user.id,
      admin_email: adminEmail,
      admin_name_snapshot: adminName,
      body: input.body,
    })
    .select()
    .single();

  if (error) throw error;
  return data as EsgProductQuestionAnswerRow;
}

export async function updateAnswer(id: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('esg_product_question_answers')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteAnswer(id: string): Promise<void> {
  const { error } = await supabase
    .from('esg_product_question_answers')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================================
// Realtime
// ============================================================================

export function subscribeQuestions(
  productType: 'bazaar' | 'auction',
  productId: string,
  callback: () => void,
): () => void {
  const ch = `esg-pq-${productId.slice(0, 8)}-${Math.random().toString(36).slice(2, 11)}`;
  const channel = supabase
    .channel(ch)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'esg_product_questions',
        filter: `product_id=eq.${productId}`,
      },
      () => callback(),
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'esg_product_question_answers',
      },
      () => callback(),
    )
    .subscribe();
  // productType filter는 클라이언트에서 다시 reload 시점 적용 (서버는 product_id로 1차 필터)
  void productType;
  return () => {
    supabase.removeChannel(channel);
  };
}
