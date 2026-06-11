// ============================================================================
// CHANGELOG
//   2026-06-11
//     - [기능추가] 커버 썸네일 크롭 기준점(focal point) 지정. 첫 번째 "대표" 사진이
//         목록 카드 커버로 쓰이며, 대표 사진에만 "위치 조정"(ImageFocusEditor)으로
//         focus_x/focus_y(0~100%)를 드래그/프리셋 설정. 나머지 사진은 조정 불필요.
//         제출 시 create/update에 이미지별 focus 동반(커버 값만 카드에 사용).
//   2026-06-04 (c)
//     - [근본수정] createPortal로 document.body 직속 렌더 — 조상 transform
//         (.route-fade)에 fixed가 갇혀 dim/z-index가 깨지던 문제 차단.
//     - [디자인] 백드롭 frosted blur(3px, -webkit 포함) 추가.
//   2026-06-04 (b)
//     - [기능추가] 편집 모드 이미지 수정 지원 (기존 Phase 2-C 보류 해제)
//         · 기존 이미지 유지/삭제 + 새 이미지 추가 (합계 최대 3장)
//         · 제출 시 updatePost에 imagesOp 전달 → esg_post_images 재구성
//         · 사진 필수(zero_waste)는 편집에서도 최소 1장 강제
//   2026-06-04
//     - [추가] 카테고리별 사진 정책 반영 (POST_IMAGE_POLICY 참조)
//         · zero_waste → 사진 필수: 라벨 '*', 미첨부 시 등록 차단
//         · wise_life  → 사진 선택: 라벨 '(선택)', '글만 등록 가능' 안내
// ============================================================================

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
import { createPortal } from 'react-dom'; // ← [추가] body 직속 렌더(조상 transform 영향 차단)
import { createPost, updatePost, POST_IMAGE_POLICY } from '@/lib/posts';  // ← [수정] 카테고리 이미지 정책(SSOT) import
import { ImageFocusEditor } from '@/components/ImageFocusEditor'; // ← [추가] 썸네일 크롭 기준점 에디터
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
  const imageRequired = POST_IMAGE_POLICY[category].imageRequired;  // ← [추가] 이 카테고리가 사진 필수인지 (zero_waste=true)
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [isAnonymous, setIsAnonymous] = useState(initial?.is_anonymous ?? false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  // 신규 파일별 썸네일 크롭 기준점(0~100). files 인덱스와 1:1 정렬. ← [추가]
  const [fileFocus, setFileFocus] = useState<Array<{ x: number; y: number }>>([]);
  // 편집 모드: 기존 이미지(유지/삭제 대상). sort_order 순 정렬. focus_x/focus_y 포함.  ← [추가]
  const [existingImages, setExistingImages] = useState(
    () => (initial?.images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  );
  // 위치 조정 에디터 대상 (기존/신규 + 인덱스) ← [추가]
  const [editing, setEditing] = useState<{ kind: 'existing' | 'new'; index: number } | null>(null);
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
    const remaining = MAX_IMAGES - existingImages.length - files.length; // ← [수정] 기존 이미지 포함 잔여 계산
    if (remaining <= 0) {
      setError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
      return;
    }
    const accepted = newFiles.slice(0, remaining);
    setFiles((prev) => [...prev, ...accepted]);
    setFileFocus((prev) => [...prev, ...accepted.map(() => ({ x: 50, y: 50 }))]); // ← [추가] 기본 중앙
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setFileFocus((prev) => prev.filter((_, i) => i !== idx)); // ← [추가] focus도 같이 제거
  };

  // 기존 이미지 제거 (편집 모드)  ← [추가]
  const handleRemoveExisting = (idx: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // 위치 조정 저장 — 대상(기존/신규)별 focus 갱신 ← [추가]
  const handleFocusSave = (focusX: number, focusY: number) => {
    if (!editing) return;
    if (editing.kind === 'new') {
      setFileFocus((prev) => prev.map((f, i) => (i === editing.index ? { x: focusX, y: focusY } : f)));
    } else {
      setExistingImages((prev) =>
        prev.map((im, i) => (i === editing.index ? { ...im, focus_x: focusX, focus_y: focusY } : im))
      );
    }
    setEditing(null);
  };

  const totalImages = existingImages.length + files.length; // ← [추가] 기존+신규 합계

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
    // 사진 필수 카테고리(zero_waste) 검증 — 작성/수정 공통 (기존+신규 합계 기준)
    if (imageRequired && totalImages === 0) {                          // ← [수정] 편집 모드도 적용
      setError('사진을 최소 1장 이상 첨부해야 합니다.');                  // ← [수정]
      return;                                                          // ← [추가]
    }                                                                  // ← [추가]

    setSubmitting(true);
    try {
      if (isEdit && initial) {
        // 수정: 본문 + 이미지 (유지할 기존 이미지[focus 포함] + 새 파일[focus 포함])
        const updated = await updatePost(
          initial.id,
          {
            title: title.trim(),
            content: content.trim(),
            is_anonymous: isAnonymous,
          },
          {
            keep: existingImages.map((im) => ({ url: im.url, focusX: im.focus_x, focusY: im.focus_y })), // ← [수정] focus 동반
            newImages: files.map((f, i) => ({ file: f, focusX: fileFocus[i]?.x ?? 50, focusY: fileFocus[i]?.y ?? 50 })), // ← [수정]
            uploaderId: currentUser.id,
          }
        );
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
          files.map((f, i) => ({ file: f, focusX: fileFocus[i]?.x ?? 50, focusY: fileFocus[i]?.y ?? 50 })) // ← [수정] focus 동반
        );
        onSaved(created);
      }
    } catch (e) {
      console.error('[PostFormModal] submit error:', e);
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="anim-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(3px)', // ← [추가] frosted dim (홈 모달과 톤 통일)
        WebkitBackdropFilter: 'blur(3px)', // ← [추가] Safari/iPad 대응
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
        className="anim-modal"
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

          {/* 이미지 (작성/수정 공통) — 편집 모드도 지원 */}
          <div>
            <label
              style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}
            >
              사진{' '}
              {imageRequired ? (
                <span style={{ color: '#ef4444' }}>*</span>
              ) : (
                <span style={{ color: '#aaa', fontWeight: 400 }}>(선택)</span>
              )}{' '}
              ({totalImages}/{MAX_IMAGES})
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* 기존 이미지 (편집 모드) — 첫 번째=대표(커버)만 위치 조정 */}
              {existingImages.map((im, i) => {
                const isCover = i === 0; // 기존 이미지가 있으면 첫 번째가 커버
                return (
                  <div key={im.id} style={{ position: 'relative', width: 96, height: 96 }}>
                    <img
                      src={im.url}
                      alt={`기존 이미지 ${i + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: isCover ? `${im.focus_x}% ${im.focus_y}%` : '50% 50%', // ← 커버만 focus 반영
                        borderRadius: 8,
                        border: '1px solid #eee',
                      }}
                    />
                    {isCover && <span style={coverBadgeStyle}>대표</span>}{/* ← [추가] 커버 표시 */}
                    {isCover && (
                      <button
                        type="button"
                        onClick={() => setEditing({ kind: 'existing', index: i })} // ← 커버 위치 조정
                        disabled={submitting}
                        style={focusBtnStyle}
                      >
                        위치 조정
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveExisting(i)}
                      disabled={submitting}
                      style={removeBtnStyle}
                      aria-label="기존 이미지 삭제"
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {/* 새로 추가한 파일 미리보기 — 기존이 없을 때 첫 신규가 커버 */}
              {previews.map((url, i) => {
                const isCover = existingImages.length === 0 && i === 0; // 기존 없으면 첫 신규가 커버
                return (
                  <div key={url} style={{ position: 'relative', width: 96, height: 96 }}>
                    <img
                      src={url}
                      alt={`첨부 ${i + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: isCover ? `${fileFocus[i]?.x ?? 50}% ${fileFocus[i]?.y ?? 50}%` : '50% 50%', // ← 커버만 focus
                        borderRadius: 8,
                        border: '1px solid #eee',
                      }}
                    />
                    {isCover && <span style={coverBadgeStyle}>대표</span>}{/* ← [추가] 커버 표시 */}
                    {isCover && (
                      <button
                        type="button"
                        onClick={() => setEditing({ kind: 'new', index: i })} // ← 커버 위치 조정
                        disabled={submitting}
                        style={focusBtnStyle}
                      >
                        위치 조정
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(i)}
                      disabled={submitting}
                      style={removeBtnStyle}
                      aria-label="이미지 삭제"
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {totalImages < MAX_IMAGES && ( // ← [수정] 기존+신규 합계 기준
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
              {imageRequired
                ? '사진을 최소 1장 이상 등록해야 합니다 · '
                : '글만 등록해도 됩니다 · '}
              JPG · PNG · WebP · GIF · 최대 10MB · 최대 {MAX_IMAGES}장
            </div>
            {totalImages > 0 && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                ⓘ 첫 번째 <b>대표</b> 사진이 목록 카드 커버로 쓰입니다. “위치 조정”으로 커버에 보일 부분을 맞춰주세요.
              </div>
            )}{/* ← [추가] 커버 위치 조정 안내 */}
          </div>

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

      {/* 썸네일 위치 조정 에디터 — 자기 자신을 body로 포털(zIndex 1100) ← [추가] */}
      {editing && (
        <ImageFocusEditor
          src={editing.kind === 'new' ? previews[editing.index] : existingImages[editing.index]?.url}
          initialX={editing.kind === 'new' ? (fileFocus[editing.index]?.x ?? 50) : (existingImages[editing.index]?.focus_x ?? 50)}
          initialY={editing.kind === 'new' ? (fileFocus[editing.index]?.y ?? 50) : (existingImages[editing.index]?.focus_y ?? 50)}
          onCancel={() => setEditing(null)}
          onSave={handleFocusSave}
        />
      )}
    </div>,
    document.body
  );
}

// 미리보기 위 "위치 조정" 버튼 (하단 바) ← [추가]
const focusBtnStyle: React.CSSProperties = {
  position: 'absolute',
  left: 4,
  right: 4,
  bottom: 4,
  padding: '3px 0',
  borderRadius: 6,
  border: 'none',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: 11,
  cursor: 'pointer',
  textAlign: 'center',
};

// 대표(커버) 배지 — 목록 카드 커버로 쓰이는 첫 이미지 표시 ← [추가]
const coverBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  left: 4,
  padding: '1px 6px',
  borderRadius: 6,
  background: '#111',
  color: '#fff',
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1.6,
  pointerEvents: 'none',
};

// 미리보기 삭제(×) 버튼 ← [추가]
const removeBtnStyle: React.CSSProperties = {
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
};
