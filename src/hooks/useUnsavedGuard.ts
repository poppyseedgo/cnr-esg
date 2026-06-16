// ============================================================================
// useUnsavedGuard — 편집 중 이탈 방어 훅
//
//   - isDirty=true 동안: 브라우저 새로고침/탭 닫기/이탈 시 경고(beforeunload)
//   - 반환된 confirmClose()를 모든 "닫기" 경로(X·ESC·취소·배경·드래그)에서 호출
//       → dirty면 확인창, 아니면 그대로 진행. 닫아도 되는지 boolean 반환.
//
//   2026-06-16  최초 작성 — 모달 작성 내용 유실 방지
// ============================================================================

import { useCallback, useEffect } from 'react';

export const UNSAVED_CONFIRM_MSG =
  '작성 중인 내용이 있어요.\n저장하지 않고 닫으면 입력한 내용이 사라집니다. 닫을까요?';

export function useUnsavedGuard(
  isDirty: boolean,
  message: string = UNSAVED_CONFIRM_MSG
): () => boolean {
  // 브라우저 단위 이탈 경고
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // 크롬: 표준 경고 표시
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 닫기 시도 시 호출 — dirty면 확인, 진행 여부 반환
  return useCallback(() => !isDirty || window.confirm(message), [isDirty, message]);
}
