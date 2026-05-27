// ============================================================================
// PostFormModal — 게시글 작성/수정 모달
//
// 사용:
//   - 작성: <PostFormModal category="zero_waste" onSaved={...} onClose={...} />
//   - 수정: <PostFormModal category="..." initial={post} onSaved={...} onClose={...} />
//
// 디자인은 Phase 6에서 피그마 기반 교체. 현재는 기능 검증용 UI.
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { createPost, updatePost } from '@/lib/posts';
import type {
  EsgPostCategory,
  EsgPostWithImagesRow,
  CurrentUser,
} from '@/types/esg';

const CATEGORY_LABELS: Record<EsgPostCategory, string> = {
  zero_waste: '제로 웨이스트 어워드',
  wise_life: '슬기로운 사회 생활 어워드',
};

const MAX_IMAGES = 3;
const MAX_TITLE = 100;
const MAX_CONTENT = 5000;

interface PostFormModalProps {
  category: EsgPostCategory;
  initial?: EsgPostWithImagesRow | null;
  currentUser: CurrentUser;
  /** 어드민이 활동 기간 외 작성/수정 중인 경우 안내 표시 */
  isAdminBypass?: boolean;
  onClose: () => void;
  onSaved: (post: EsgPostWithImagesRow) => void;
}

export function PostFormModal({
  category,
  initial,
  currentUser,
  isAdminBypass = false,
  onClose,
  onSaved,
}: PostFormModalProps) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [isAnonymous, setIsAnonymous] = useState(initial?.is_anonymous ?? false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 이미지 미리보기 URL 생성/정리
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, submitting]);

  // 이미지 추가
  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    const remaining = MAX_IMAGES - files.length;
    if (remaining <= 0) {
      setError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
      return;
    }
    const accepted = newFiles.slice(0, remaining);
    setFiles((prev) => [...prev, ...accepted]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // 제출
  const handleSubmit = async () => {
    setError(null);

    if (!title.trim()) {
      setError('제목을 입력하세요.');
      return;
    }
    if (!content.trim()) {
      setError('내용을 입력하세요.');
      return;
    }
    if (title.length > MAX_TITLE) {
      setError(`제목은 ${MAX_TITLE}자 이내여야 합니다.`);
      return;
    }
    if (content.length > MAX_CONTENT) {
      setError(`내용은 ${MAX_CONTENT}자 이내여야 합니다.`);
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && initial) {
        // 수정: 본문만 (이미지 수정은 Phase 2-C)
        const updated = await updatePost(initial.id, {
          title: title.trim(),
          content: content.trim(),
          is_anonymous: isAnonymous,
        });
        onSaved(updated);
      } else {
        // 작성
        const created = await createPost(
          {
            id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            dept: currentUser.dept,
          },
          {
            category,
            title: title.trim(),
            content: content.trim(),
            is_anonymous: isAnonymous,
          },
          files
        );
        onSaved(created);
      }
    } catch (e) {
      console.error('[PostFormModal] submit error:', e);
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 640,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {isEdit ? '게시글 수정' : `${CATEGORY_LABELS[category]} 작성`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: '#888',
            }}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 어드민 우회 안내 */}
          {isAdminBypass && (
            <div
              style={{
                padding: 12,
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 8,
                fontSize: 12,
                color: '#0c4a6e',
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: '#0ea5e9' }}>🔧 ADMIN 모드</strong> · 활동 기간 또는 게시판 토글
              상태와 관계없이 작성 가능합니다. 관리자 권한으로 작성되며, 일반 사용자에게도 즉시 노출됩니다.
            </div>
          )}

          {/* 제목 */}
          <div>
            <label
              style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              제목 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE}
              placeholder="제목을 입력하세요"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: 11, color: '#aaa', marginTop: 4 }}>
              {title.length} / {MAX_TITLE}
            </div>
          </div>

          {/* 내용 */}
          <div>
            <label
              style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              내용 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={MAX_CONTENT}
              placeholder="내용을 입력하세요"
              disabled={submitting}
              rows={8}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontSize: 14,
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: 11, color: '#aaa', marginTop: 4 }}>
              {content.length} / {MAX_CONTENT}
            </div>
          </div>

          {/* 이미지 (작성 시에만, 수정 모드에서는 Phase 2-C까지 미지원) */}
          {!isEdit && (
            <div>
              <label
                style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
              >
                이미지 ({files.length}/{MAX_IMAGES})
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {previews.map((url, i) => (
                  <div
                    key={url}
                    style={{ position: 'relative', width: 96, height: 96 }}
                  >
                    <img
                      src={url}
                      alt={`첨부 ${i + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #eee',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      disabled={submitting}
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        border: 'none',
                        background: '#1a1a1a',
                        color: '#fff',
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-label="이미지 삭제"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {files.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 8,
                      border: '2px dashed #ccc',
                      background: '#fafafa',
                      color: '#888',
                      fontSize: 24,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                    aria-label="이미지 추가"
                  >
                    +
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleAddImages}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
                JPG · PNG · WebP · GIF · 최대 10MB · 최대 {MAX_IMAGES}장
              </div>
            </div>
          )}

          {/* 익명 토글 */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              disabled={submitting}
              style={{ width: 16, height: 16, cursor: 'inherit' }}
            />
            <span>익명으로 작성 (목록·상세에서 작성자 이름이 숨겨집니다)</span>
          </label>

          {/* 에러 */}
          {error && (
            <div
              style={{
                padding: 12,
                background: '#fee2e2',
                color: '#991b1b',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #eee',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '10px 20px',
              border: '1px solid #ddd',
              background: '#fff',
              borderRadius: 8,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: submitting ? '#888' : '#1a1a1a',
              color: '#fff',
              borderRadius: 8,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {submitting ? '저장 중…' : isEdit ? '수정 완료' : '게시'}
          </button>
        </div>
      </div>
    </div>
  );
}
