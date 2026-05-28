// ============================================================================
// MarkdownEditor — 마크다운 textarea + 미리보기 + 이미지 업로드 삽입
//
// 사양:
//   - 좌: textarea (편집)
//   - 우: 미리보기 (옵션, 토글 가능)
//   - 상단 툴바: 이미지 업로드 → ![](url) 삽입
//   - 작은 화면: 위/아래 배치
//
// 호출 측:
//   <MarkdownEditor
//     value={description}
//     onChange={setDescription}
//     uploaderKind="bazaar"
//     uploaderOwnerId={productId}
//   />
// ============================================================================

import { useRef, useState } from 'react';
import { ThumbnailUploader } from './ImageUploader';
import { MarkdownRenderer } from './MarkdownRenderer';

type ProductKind = 'bazaar' | 'auction';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** 이미지 업로더 kind */
  uploaderKind?: ProductKind;
  /** 이미지 업로더 ownerId */
  uploaderOwnerId?: string;
  /** 입력 영역 최소 높이 (기본 240) */
  minHeight?: number;
  disabled?: boolean;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  uploaderKind = 'bazaar',
  uploaderOwnerId = 'editor-default',
  minHeight = 240,
  disabled,
  placeholder,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 이미지 업로드 완료 → 본문 끝에 ![](url) 삽입
  const handleImageUploaded = (url: string | null) => {
    setTempImageUrl(url);
    if (url) {
      const insertion = `\n\n![](${url})\n`;
      const ta = textareaRef.current;
      if (ta) {
        const cursor = ta.selectionStart;
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);
        const newValue = before + insertion + after;
        onChange(newValue);
        // 커서를 삽입 뒤로 이동
        requestAnimationFrame(() => {
          if (ta) {
            const newPos = cursor + insertion.length;
            ta.focus();
            ta.setSelectionRange(newPos, newPos);
          }
        });
      } else {
        onChange(value + insertion);
      }
      // 다음 업로드 위해 초기화
      setTimeout(() => setTempImageUrl(null), 300);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 툴바 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '6px 8px',
          background: '#fafafa',
          border: '1px solid #eee',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>📝 마크다운</span>
        <span style={{ fontSize: 11, color: '#999' }}>
          **굵게** *기울임* # 제목 - 목록 [텍스트](url)
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          disabled={disabled}
          style={toolbarBtn}
        >
          {showPreview ? '미리보기 끄기' : '미리보기 켜기'}
        </button>
      </div>

      {/* 이미지 업로더 */}
      <div
        style={{
          padding: '8px 10px',
          background: '#fff',
          border: '1px dashed #ddd',
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 11, color: '#666', marginBottom: 6, fontWeight: 600 }}>
          🖼 이미지 추가 (업로드하면 본문에 `![](url)` 자동 삽입)
        </div>
        <ThumbnailUploader
          kind={uploaderKind}
          ownerId={uploaderOwnerId}
          value={tempImageUrl}
          onChange={handleImageUploaded}
          disabled={disabled}
        />
      </div>

      {/* 에디터 영역 (편집 + 미리보기) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr',
          gap: 8,
        }}
        className="md-editor-grid"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder ?? '내용을 입력하세요. 마크다운 지원.'}
          style={{
            minHeight,
            padding: 12,
            border: '1px solid #ddd',
            borderRadius: 6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        {showPreview && (
          <div
            style={{
              minHeight,
              padding: 12,
              border: '1px solid #eee',
              borderRadius: 6,
              background: '#fafafa',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          >
            <MarkdownRenderer content={value} />
          </div>
        )}
      </div>

      {/* 모바일 - 미리보기 토글 가능, grid가 작은 화면에서 1열 */}
      <style>{`
        @media (max-width: 720px) {
          .md-editor-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 11,
  color: '#444',
};
