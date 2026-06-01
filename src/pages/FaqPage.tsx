// ============================================================================
// FaqPage — /faq 단독 페이지 (Figma 1003:306)
//
// 구조:
//   - 헤더 영역 (Figma 933:206 외부 컨테이너 pt 32 pb 200, 내부 1200):
//     · 제목 "FAQ" 48px Medium + 부제 "자주하는 질문" 16px Regular, gap 8, py 24
//   - 리스트: FaqAccordionItem 반복, 한 번에 하나만 펼침
//
// 데이터:
//   - loadFaqs() — is_published=true 만 (어드민도 동일, 미게시는 어드민 페이지에서)
//   - Realtime 구독
//
// 홈 섹션과의 차이:
//   - 페이지 헤더 padding/font 일치 (홈 섹션과 동일 토큰), 차이 없음
//   - 별도 페이지라 컨테이너만 다름 (AppLayout 1360 안에서 1200)
//
// 변경 이력:
//   2026-06-01  최초 작성 (단계 8)
// ============================================================================

import { useEffect, useState } from 'react';
import { loadFaqs, subscribeFaq } from '@/lib/faq';
import type { EsgFaqRow } from '@/types/esg';
import { FaqAccordionItem } from '@/components/faq-qna/FaqAccordionItem';

export function FaqPage() {
  const [faqs, setFaqs] = useState<EsgFaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = async () => {
    try {
      const data = await loadFaqs();
      setFaqs(data);
    } catch (e) {
      console.error('[FaqPage] load:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    const cleanup = subscribeFaq(() => { void reload(); });
    return cleanup;
  }, []);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 176 }}>
      <div style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 40 }}>
        {/* 헤더 */}
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '24px 0',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <h1
            style={{ margin: 0, fontWeight: 500, fontSize: 48, lineHeight: 1.2, color: '#111' }}
          >
            FAQ
          </h1>
          <p style={{ margin: 0, fontWeight: 400, fontSize: 16, lineHeight: 1.5, color: '#111' }}>
            자주하는 질문
          </p>
        </header>

        {/* 리스트 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading && faqs.length === 0 && (
            <div style={{ padding: '24px 0', fontFamily: 'var(--font-sans)', fontSize: 16, color: '#96a0b3' }}>
              불러오는 중…
            </div>
          )}
          {!loading && faqs.length === 0 && (
            <div style={{ padding: '24px 0', fontFamily: 'var(--font-sans)', fontSize: 16, color: '#96a0b3' }}>
              등록된 FAQ가 없습니다.
            </div>
          )}
          {faqs.map((faq) => (
            <FaqAccordionItem
              key={faq.id}
              faq={faq}
              isExpanded={expandedId === faq.id}
              onToggle={() => handleToggle(faq.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
