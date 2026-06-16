// ============================================================================
// RichEditor — TipTap 기반 WYSIWYG 에디터 (저장 포맷은 마크다운)
//
// 방향 A: 입력은 일반 에디터(굵게/목록/링크/이미지 버튼), 저장/출력은 마크다운.
//   → 기존 MarkdownEditor와 동일한 props 시그니처 = 드롭인 교체.
//   → 기존 데이터 마이그레이션 0, 렌더는 그대로 MarkdownRenderer 사용.
//
// 동기화 설계(루프 방지):
//   - onUpdate에서 getMarkdown() → onChange. 그 값을 lastMd에 기록.
//   - 외부 value가 lastMd와 다를 때만 setContent(value, false) — 정규화 차이로 인한
//     무한 루프를 피하기 위해 getMarkdown() 재직렬화 결과와 비교하지 않음.
//
// 이미지: 기존 ThumbnailUploader(Supabase 업로드)로 URL 받아 이미지 노드 삽입
//         → 마크다운 직렬화 시 ![](url).
//
//   2026-06-16  최초 작성 (상품 설명부터 적용)
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { ThumbnailUploader } from './ImageUploader';
import './RichEditor.css';

type ProductKind = 'bazaar' | 'auction';

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  uploaderKind?: ProductKind;
  uploaderOwnerId?: string;
  minHeight?: number;
  disabled?: boolean;
  placeholder?: string;
}

export function RichEditor({
  value,
  onChange,
  uploaderKind = 'bazaar',
  uploaderOwnerId = 'editor-default',
  minHeight = 240,
  disabled,
  placeholder,
}: RichEditorProps) {
  const lastMd = useRef<string>(value);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? '내용을 입력하세요.' }),
      Markdown.configure({ html: true, linkify: true, transformPastedText: true }),
    ],
    content: value || '',
    editable: !disabled,
    editorProps: {
      attributes: { class: 'rich-editor__pm', style: `min-height:${minHeight}px` },
    },
    onUpdate: ({ editor }) => {
      const md = (editor.storage.markdown as { getMarkdown: () => string }).getMarkdown();
      lastMd.current = md;
      onChange(md);
    },
  });

  // 외부 value 변경(초안 복원/리셋 등) 동기화 — 우리 echo(lastMd)는 무시
  useEffect(() => {
    if (!editor) return;
    if (value === lastMd.current) return;
    lastMd.current = value;
    editor.commands.setContent(value || '', false);
  }, [value, editor]);

  // disabled 동기화
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const handleImageUploaded = (url: string | null) => {
    setTempImageUrl(url);
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
      setTimeout(() => setTempImageUrl(null), 300);
    }
  };

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('링크 URL을 입력하세요', prev ?? 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="rich-editor">
      {/* 툴바 */}
      <div className="rich-editor__toolbar">
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="굵게"><b>B</b></Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="기울임"><i>I</i></Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="취소선"><s>S</s></Btn>
        <span className="rich-editor__divider" />
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="제목2">H2</Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="제목3">H3</Btn>
        <span className="rich-editor__divider" />
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="글머리 목록">• 목록</Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="번호 목록">1. 목록</Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="인용">❝</Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="코드">{'</>'}</Btn>
        <span className="rich-editor__divider" />
        <Btn ed={editor} cmd={setLink} active={editor.isActive('link')} title="링크">🔗</Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().setHorizontalRule().run()} title="구분선">―</Btn>
        <span className="rich-editor__divider" />
        <Btn ed={editor} cmd={(e) => e.chain().focus().undo().run()} disabled={!editor.can().undo()} title="실행 취소">↶</Btn>
        <Btn ed={editor} cmd={(e) => e.chain().focus().redo().run()} disabled={!editor.can().redo()} title="다시 실행">↷</Btn>
      </div>

      {/* 이미지 업로더 */}
      <div className="rich-editor__image">
        <span className="rich-editor__image-label">🖼 이미지 추가</span>
        <ThumbnailUploader
          kind={uploaderKind}
          ownerId={uploaderOwnerId}
          value={tempImageUrl}
          onChange={handleImageUploaded}
          disabled={disabled}
        />
      </div>

      {/* 본문 */}
      <EditorContent editor={editor} className="rich-editor__content" />
    </div>
  );
}

/** 툴바 버튼 — mousedown preventDefault로 에디터 선택 유지 */
function Btn({
  ed,
  cmd,
  active,
  disabled,
  title,
  children,
}: {
  ed: Editor;
  cmd: (e: Editor) => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className={`rich-editor__btn${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => cmd(ed)}
    >
      {children}
    </button>
  );
}
