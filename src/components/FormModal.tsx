// ============================================================================
// FormModal — 폼 등 큰 컨텐츠용 모달
//
// 사양:
//   - 화면 가운데 정렬
//   - max-height: 90vh (화면에 맞게 자동 제한)
//   - 내용이 길면 내부 스크롤
//   - ESC 닫기 + 외부 클릭 닫기 + X 버튼
// ============================================================================

import { useCallback, useEffect } from 'react';
import { useUnsavedGuard, UNSAVED_CONFIRM_MSG } from '@/hooks/useUnsavedGuard';

interface FormModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** 모달 최대 너비 (기본 720px) */
  maxWidth?: number;
  children: React.ReactNode;
  /** 작성 중 여부 — true면 닫기 시 확인 + 새로고침 경고 */
  isDirty?: boolean;
  /** 배경 클릭 닫기 허용. 기본 false(실수 닫힘 방지) */
  closeOnBackdrop?: boolean;
  /** dirty 확인 메시지 */
  confirmMessage?: string;
}

export function FormModal({
  open,
  onClose,
  title,
  maxWidth = 720,
  children,
  isDirty = false,
  closeOnBackdrop = false,
  confirmMessage = UNSAVED_CONFIRM_MSG,
}: FormModalProps) {
  // 작성 중 이탈 방어
  const confirmClose = useUnsavedGuard(open && isDirty, confirmMessage);
  const requestClose = useCallback(() => {
    if (confirmClose()) onClose();
  }, [confirmClose, onClose]);

  // ESC 키로 닫기 (작성 중이면 확인)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, requestClose]);

  // body 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={
        closeOnBackdrop
          ? (e) => {
              if (e.target === e.currentTarget && confirmClose()) onClose();
            }
          : undefined
      }
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* 헤더 (sticky, 닫기 버튼) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #eee',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="닫기"
            style={{
              width: 32,
              height: 32,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 20,
              color: '#666',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* 본문 (스크롤 영역) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
