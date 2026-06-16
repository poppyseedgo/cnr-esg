// ============================================================================
// AnswerModal.tsx — Q&A 어드민 답변 등록 모달 (Figma 997:961, Medium 520px)
//
// 구조 (Figma 1:1):
//   Header: "답변 하기" 24px Medium + X 버튼
//   Body:
//     섹션 1 — 정보 표시 (gap 24)
//       row1 — 문의한 사람: 라벨 80px + (avatar 24 + 이름 14M + 부서 11R)
//       row2 — 카테고리: 라벨 80px + 풀네임 16px Regular
//       row3 — 문의한 내용: 라벨 80px + 본문 16px Regular (여러 줄)
//     섹션 2 — 답변 입력 (gap 20)
//       라벨 "답변 내용 작성" 16px Medium
//       입력 (100자 권장, 500자 하드, 엔터키 허용 → textarea)
//   Footer: 취소(close) + 답변 등록(confirm, 빈 내용이면 disabled)
//
// 어드민 전용:
//   - createAnswer 호출 → DB 트리거가 질문 status='answered' 자동 처리
//   - 등록 성공 → onSuccess (목록 reload + 모달 닫기)
//
// Props:
//   question — 답변 대상 질문 (작성자 정보 포함, 어드민이 본 데이터)
//   onClose / onSuccess
//
// 변경 이력:
//   2026-06-01  최초 작성 (Figma 997:961 1:1)
// ============================================================================

import { useState } from 'react';
import { ModalShell } from '@/components/modal/ModalShell';
import { createAnswer } from '@/lib/qna';
import {
  ESG_QNA_CATEGORY_LABELS,
  type EsgQnaQuestionWithAuthor,
} from '@/types/esg';
import '@/components/home/EventModal.css'; // esg-modal__input 공용 입력 스타일

interface Props {
  question: EsgQnaQuestionWithAuthor;
  onClose: () => void;
  onSuccess?: () => void;
}

const MAX_LENGTH = 100; // Figma 디자인 기준 (placeholder "100글자 이내"). DB CHECK는 500까지 허용하나 UI에서 100자로 제한.

export function AnswerModal({ question, onClose, onSuccess }: Props) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const trimmedLen = content.trim().length;
  const canSubmit = trimmedLen > 0 && trimmedLen <= MAX_LENGTH && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await createAnswer(question.id, content);
      onSuccess?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '답변 등록에 실패했습니다.';
      setErrMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 작성자 정보 (이름 없을 시 fallback)
  const authorName = question.author?.name ?? '(알 수 없음)';
  const authorDept = question.author?.dept ?? '';
  const initial = authorName.charAt(0);

  return (
    <ModalShell
      size="medium"
      onClose={onClose}
      isDirty={!submitting && content.trim().length > 0}
      ariaLabel="답변 하기"
      header={<p className="esg-modal__title esg-modal__title--medium">답변 하기</p>}
      footer={[
        { label: '취소', variant: 'close', onClick: onClose },
        {
          label: submitting ? '등록 중…' : '답변 등록',
          variant: 'confirm',
          onClick: handleSubmit,
          disabled: !canSubmit,
        },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
        {/* ── 섹션 1: 정보 표시 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* row1: 문의한 사람 */}
          <InfoRow label="문의한 사람">
            <AuthorChip name={authorName} dept={authorDept} initial={initial} />
          </InfoRow>

          {/* row2: 카테고리 */}
          <InfoRow label="카테고리">
            <span style={{ ...valueStyle }}>
              {ESG_QNA_CATEGORY_LABELS[question.category]}
            </span>
          </InfoRow>

          {/* row3: 문의한 내용 */}
          <InfoRow label="문의한 내용">
            <span style={{ ...valueStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {question.content}
            </span>
          </InfoRow>
        </div>

        {/* ── 섹션 2: 답변 입력 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 16,
              lineHeight: 1.2,
              color: '#343a3f',
            }}
          >
            답변 내용 작성
          </p>
          <AnswerInput value={content} onChange={setContent} maxLength={MAX_LENGTH} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              minHeight: 18,
            }}
          >
            {errMsg ? (
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#dc2626' }}>
                {errMsg}
              </span>
            ) : (
              <span />
            )}
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                color: trimmedLen > MAX_LENGTH ? '#dc2626' : '#96a0b3',
              }}
            >
              {trimmedLen} / {MAX_LENGTH}
            </span>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================================
// 내부 — 정보 row (라벨 80px width + 값)
// ============================================================================

const labelStyle: React.CSSProperties = {
  width: 80,
  flexShrink: 0,
  fontFamily: 'var(--font-sans)',
  fontWeight: 600,           // SemiBold
  fontSize: 16,
  lineHeight: 1.5,
  color: '#96a0b3',
};

const valueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontWeight: 400,
  fontSize: 16,
  lineHeight: 1.5,
  color: '#111',
  flex: '1 1 auto',
  minWidth: 0,
};

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

// ============================================================================
// 내부 — 작성자 칩 (avatar + 이름 + 부서)
//   Figma 997:1208-1213:
//     avatar 24×24 검정 원형 + 이니셜 12px Medium #e7e7e7
//     이름 14px Medium #111
//     부서 11px Regular rgba(17,17,17,0.35)
// ============================================================================

function AuthorChip({
  name,
  dept,
  initial,
}: {
  name: string;
  dept: string;
  initial: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {/* avatar */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 1000,
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 12,
            lineHeight: 1.3,
            color: '#e7e7e7',
          }}
        >
          {initial}
        </span>
      </div>
      {/* 이름 + 부서 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: 14,
            lineHeight: 1.3,
            color: '#111',
          }}
        >
          {name}
        </span>
        {dept && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 400,
              fontSize: 11,
              lineHeight: 1.3,
              color: 'rgba(17,17,17,0.35)',
            }}
          >
            {dept}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 내부 — 답변 입력 (border-bottom focus 색 변화, textarea 다중행)
//   Figma: placeholder #cfd6e4, 입력 #111, 16px Regular line 1.5
//   엔터키 허용 (textarea)
// ============================================================================

function AnswerInput({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
}) {
  const [focused, setFocused] = useState(false);
  const isActive = focused || value.length > 0;
  const borderColor = isActive ? '#111' : '#d2ddf1';

  return (
    <div
      style={{
        borderBottom: `1px solid ${borderColor}`,
        paddingBottom: 12,
        transition: 'border-color 0.15s',
      }}
    >
      <textarea
        className="esg-modal__input"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="답변 내용을 100글자 이내로 작성하세요 (엔터키 가능)"
        rows={3}
      />
    </div>
  );
}
