// ============================================================================
// HomeFaqSection — 홈 FAQ 섹션 (Figma 933:102 FAQ 영역)
//
// 구조:
//   - 헤더: 제목 "FAQ" 48px Medium + 부제 "자주하는 질문" 16px Regular, gap 8, py 24
//   - 리스트: FaqAccordionItem 반복, 한 번에 하나만 펼침(부모 state)
//
// 데이터:
//   - loadFaqs() 마운트 시 + Realtime 구독 (어드민 수정 시 즉시 반영)
//   - is_published=true 만 로드 (RLS도 동일하게 차단)
//   - sort_order ASC, created_at DESC
//
// 상태:
//   - faqs: 로드된 데이터 (캐시 없음, 첫 로드는 짧은 깜빡임 허용)
//   - expandedId: 현재 펼친 항목 id (null이면 전부 닫힘)
//
// 변경 이력:
//   2026-06-01  최초 작성
// ============================================================================

import { useEffect, useState } from 'react';
import { loadFaqs, subscribeFaq } from '@/lib/faq';
import type { EsgFaqRow } from '@/types/esg';
import { FaqAccordionItem } from './FaqAccordionItem';

export function HomeFaqSection() {
  const [faqs, setFaqs] = useState<EsgFaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const reload = async () => {
    try {
      const data = await loadFaqs();
      setFaqs(data);
    } catch (e) {
      console.error('[HomeFaqSection] load:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  // Realtime: 어드민 변경 즉시 반영
  useEffect(() => {
    const cleanup = subscribeFaq(() => { void reload(); });
    return cleanup;
  }, []);

  // 한 번에 하나만 펼침: 토글 — 현재 펼친 거 다시 누르면 닫힘, 다른 거 누르면 그쪽으로 이동
  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      aria-labelledby="home-faq-title"
      style={{ display: 'flex', flexDirection: 'column', gap: 40, width: '100%' }}
    >
      {/* 섹션 헤더 */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '24px 0',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <h2
          id="home-faq-title"
          style={{
            margin: 0,
            fontWeight: 500,
            fontSize: 48,
            lineHeight: 1.2,
            color: '#111',
          }}
        >
          FAQ
        </h2>
        <p
          style={{
            margin: 0,
            fontWeight: 400,
            fontSize: 16,
            lineHeight: 1.5,
            color: '#111',
          }}
        >
          자주하는 질문
        </p>
      </header>

      {/* 리스트 */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading && faqs.length === 0 && (
          <div
            style={{
              padding: '24px 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              color: '#96a0b3',
            }}
          >
            불러오는 중…
          </div>
        )}
        {!loading && faqs.length === 0 && (
          <div
            style={{
              padding: '24px 0',
              fontFamily: 'var(--font-sans)',
              fontSize: 16,
              color: '#96a0b3',
            }}
          >
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
    </section>
  );
}
