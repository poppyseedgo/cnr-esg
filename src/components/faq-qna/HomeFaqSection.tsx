// ============================================================================
// HomeFaqSection — 홈 FAQ 섹션
//
// 변경 이력:
//   2026-06-01  최초 작성
//   2026-06-01  CSS 마이그레이션 (faq-qna.css)
// ============================================================================

import { useEffect, useState } from 'react';
import { loadFaqs, subscribeFaq } from '@/lib/faq';
import type { EsgFaqRow } from '@/types/esg';
import { FaqAccordionItem } from './FaqAccordionItem';
import './faq-qna.css';

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
  useEffect(() => {
    const cleanup = subscribeFaq(() => { void reload(); });
    return cleanup;
  }, []);

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      aria-labelledby="home-faq-title"
      className="faqqna-section"
    >
      <header className="faqqna-section__header">
        <h2 id="home-faq-title" className="faqqna-section__title">FAQ</h2>
        <p className="faqqna-section__subtitle">자주하는 질문</p>
      </header>

      <div className="faqqna-section__list">
        {loading && faqs.length === 0 && (
          <div className="faqqna-section__empty">불러오는 중…</div>
        )}
        {!loading && faqs.length === 0 && (
          <div className="faqqna-section__empty">등록된 FAQ가 없습니다.</div>
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
