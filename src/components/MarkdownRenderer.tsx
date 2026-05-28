// ============================================================================
// MarkdownRenderer — 마크다운 텍스트를 안전하게 렌더링
//
// 사용처:
//   - 상품 상세 설명
//   - 상품 수령 안내
//   - Q&A 본문 (옵션)
// ============================================================================

import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  /** 작은 글씨 모드 (Q&A 등) */
  compact?: boolean;
}

export function MarkdownRenderer({ content, compact = false }: MarkdownRendererProps) {
  if (!content?.trim()) {
    return <div style={{ color: '#999', fontSize: 13 }}>(내용 없음)</div>;
  }

  const baseFontSize = compact ? 13 : 14;

  return (
    <div
      style={{
        fontSize: baseFontSize,
        lineHeight: 1.7,
        color: '#222',
        wordBreak: 'break-word',
      }}
    >
      <ReactMarkdown
        // 보안: HTML 허용 안 함 (기본값). 링크는 새 창
        components={{
          h1: ({ children }) => (
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '20px 0 12px' }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: '18px 0 10px' }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 17, fontWeight: 600, margin: '14px 0 8px' }}>{children}</h3>
          ),
          p: ({ children }) => (
            <p style={{ margin: '10px 0', lineHeight: 1.7 }}>{children}</p>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: '10px 0', paddingLeft: 24, lineHeight: 1.7 }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '10px 0', paddingLeft: 24, lineHeight: 1.7 }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ margin: '4px 0' }}>{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#0ea5e9', textDecoration: 'underline' }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ''}
              style={{
                maxWidth: '100%',
                height: 'auto',
                display: 'block',
                margin: '12px 0',
                borderRadius: 8,
                border: '1px solid #eee',
              }}
            />
          ),
          code: ({ children }) => (
            <code
              style={{
                background: '#f5f5f5',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: '0.92em',
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                background: '#1f2937',
                color: '#f9fafb',
                padding: 12,
                borderRadius: 8,
                overflowX: 'auto',
                margin: '10px 0',
              }}
            >
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                borderLeft: '3px solid #ddd',
                margin: '12px 0',
                padding: '4px 14px',
                color: '#555',
              }}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '20px 0' }} />,
          strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
