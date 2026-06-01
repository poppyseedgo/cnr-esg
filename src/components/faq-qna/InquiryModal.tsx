// ============================================================================
// InquiryModal.tsx — Q&A 문의 등록 모달 (Figma 997:800, 997:1145, Medium 520px)
//
// 구조 (Figma 1:1):
//   Header: "문의 하기" 24px Medium + X 버튼 (ModalShell이 자동 처리)
//   Body:
//     섹션 1 — 카테고리 선택
//       라벨 "문의하실 프로그램 카테고리를 선택하세요" 16px Regular #343a3f line 1.6
//       라디오 5개 (일반/제로/슬기로운/바자회/경매) 20×20 black border, 선택시 bg-black
//       각 항목 py 8, gap 12
//     섹션 2 — 문의 내용 작성
//       라벨 "문의 내용 작성" 16px Medium #343a3f line 1.2
//       입력 (40자 권장, 200자 하드)
//       border-bottom 1px: 빈 #d2ddf1 / 작성중(focus) #111
//       placeholder #bdc5d4, 입력값 #111
//   Footer: 취소(close 회색) + 문의 등록(confirm 검정, 빈 내용이면 disabled)
//
// 동작:
//   - 등록 성공 → 토스트 생략(부모가 onSuccess로 리스트 reload + 모달 닫기)
//   - createQuestion이 throw → alert (간단 처리, 향후 토스트 시스템 도입 시 교체)
//   - 미로그인 → 모달 자체는 RequireAuth 안에서 열림이 일반적이지만,
//     안전망으로 createQuestion이 throw하면 메시지 노출
//
// 변경 이력:
//   2026-06-01  최초 작성 (Figma 997:800/1145 1:1)
// ============================================================================

import { useState } from 'react';
import { ModalShell } from '@/components/modal/ModalShell';
import { createQuestion } from '@/lib/qna';
import {
  ESG_QNA_CATEGORY_LABELS,
  type EsgQnaCategory,
} from '@/types/esg';
import '@/components/home/EventModal.css'; // esg-modal__input 등 공용 입력 스타일

interface Props {
  onClose: () => void;
  /** 등록 성공 시 호출 (목록 reload 등). 모달은 자체적으로 닫힘. */
  onSuccess?: () => void;
}

/** Figma 노드 순서대로 라디오 옵션 표시 */
const CATEGORY_OPTIONS: EsgQnaCategory[] = [
  'general',
  'zero_waste',
  'wise_life',
  'bazaar',
  'auction',
];

const MAX_LENGTH = 40; // Figma 디자인 기준 (placeholder "40자 이내"). DB CHECK는 200까지 허용하나 UI에서 40자로 제한.

export function InquiryModal({ onClose, onSuccess }: Props) {
  const [category, setCategory] = useState<EsgQnaCategory>('general');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // 입력이 있고 길이가 허용 범위면 활성화. 작성중인지(focus) 여부는 별도 state.
  const trimmedLen = content.trim().length;
  const canSubmit = trimmedLen > 0 && trimmedLen <= MAX_LENGTH && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await createQuestion({ category, content });
      onSuccess?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '문의 등록에 실패했습니다.';
      setErrMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      size="medium"
      onClose={onClose}
      ariaLabel="문의 하기"
      header={
        <p className="esg-modal__title esg-modal__title--medium">문의 하기</p>
      }
      footer={[
        { label: '취소', variant: 'close', onClick: onClose },
        {
          label: submitting ? '등록 중…' : '문의 등록',
          variant: 'confirm',
          onClick: handleSubmit,
          disabled: !canSubmit,
        },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* ── 섹션 1: 카테고리 ── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 0' }}>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontWeight: 400,
                fontSize: 16,
                lineHeight: 1.6,
                color: '#343a3f',
              }}
            >
              문의하실 프로그램 카테고리를 선택하세요
            </p>
          </div>
          {CATEGORY_OPTIONS.map((opt) => (
            <RadioRow
              key={opt}
              label={ESG_QNA_CATEGORY_LABELS[opt]}
              checked={category === opt}
              onChange={() => setCategory(opt)}
            />
          ))}
        </div>

        {/* ── 섹션 2: 문의 내용 입력 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,            // Medium (Figma)
              fontSize: 16,
              lineHeight: 1.2,
              color: '#343a3f',
            }}
          >
            문의 내용 작성
          </p>
          <InquiryInput
            value={content}
            onChange={setContent}
            maxLength={MAX_LENGTH}
          />
          {/* 글자 수 카운터 (200자 하드 리밋 안내) */}
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
// 내부 — 라디오 row
//   Figma: 20×20 black border circle, 선택 시 내부 bg-black
//   라벨: 16px Regular #343a3f, gap 12, py 8 per item
// ============================================================================

function RadioRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="radio"
      aria-checked={checked}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '8px 0',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        textAlign: 'left',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '1px solid #111',
          background: checked ? '#111' : 'transparent',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      />
      <span
        style={{
          fontFamily: 'inherit',
          fontWeight: 400,
          fontSize: 16,
          lineHeight: 1.6,
          color: '#343a3f',
          flex: '1 1 auto',
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ============================================================================
// 내부 — 입력 컴포넌트 (border-bottom focus 색 변화)
//   빈 상태:  border #d2ddf1, placeholder #bdc5d4
//   작성중:   border #111, text #111
// ============================================================================

function InquiryInput({
  value,
  onChange,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
}) {
  const [focused, setFocused] = useState(false);

  // border 색: focus 또는 값 있으면 진한색
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
        placeholder="문의할 내용을 40자 이내로 작성해 주세요."
        rows={1}
      />
    </div>
  );
}
