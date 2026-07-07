// ============================================================================
// GoodsSidebar — 굿즈 페이지 전용 사이드바 콘텐츠 (2차 패널 / 모바일 상단)
//
// [설계] AuctionSidebar 와 동일 패턴(제목 + 필터 칩). 굿즈는 "카테고리" 태그로 필터.
//   · 데스크톱(≥1024): SecondarySidebar 안에서 variant="sidebar" (칩 wrap)
//   · 모바일(<1024):   GoodsPage 상단에서 variant="mobile" (칩 가로 스크롤)
//   · 보조내비(Cart/찜/My Account/Notification)는 SecondarySidebar가 공통 렌더(중복 방지).
//
// [필터 계약] URL ?cat=slug1,slug2 (콤마구분 다중선택) — GoodsPage 가 동일 파라미터를 읽어
//   loadProducts({ section:'goods', tagGroups:[catIds] }) 로 조회(BazaarFilters와 동일 계약).
//
// [데이터] listAllTags('goods') → kind='category' 만. (섹션 스코프, Phase 1에서 시드된 굿즈 카테고리)
//
// [2026-07-07] 신규 — 굿즈 섹션 Phase 2(스토어프론트).
// ============================================================================

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listAllTags } from '@/lib/tags';
import type { EsgTagRow } from '@/types/esg';

interface GoodsSidebarProps {
  variant: 'sidebar' | 'mobile';
}

export function GoodsSidebar({ variant }: GoodsSidebarProps) {
  const isMobile = variant === 'mobile';
  const [cats, setCats] = useState<EsgTagRow[]>([]);

  // ── 필터 = URL ?cat=slug,slug (콤마구분 다중선택) 단일 소스 ──
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = (searchParams.get('cat') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const isSelected = (slug: string) => selected.includes(slug);
  const toggle = (slug: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const cur = (p.get('cat') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
      if (next.length === 0) p.delete('cat'); else p.set('cat', next.join(','));
      return p;
    }, { replace: true });
  };

  // 굿즈 카테고리 태그 로드(섹션 스코프)
  useEffect(() => {
    let alive = true;
    listAllTags('goods')
      .then((rows) => { if (alive) setCats(rows.filter((t) => t.kind === 'category')); })
      .catch(() => {/* 실패는 조용히 — 필터 없이도 목록 동작 */});
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', fontFamily: "'Pretendard', system-ui, sans-serif" }}>
      {/* ── 타이틀 "나무심는 굿즈" (Figma 2233:119, 56px) — 굿즈 리스트 링크 ── */}
      <h1
        style={{
          margin: 0, fontWeight: 400, color: '#111', letterSpacing: '-0.5px',
          fontSize: isMobile ? 'clamp(36px, 11vw, 56px)' : 56, lineHeight: 1.2,
        }}
      >
        <Link to="/goods" style={{ color: 'inherit', textDecoration: 'none' }}>
          나무심는<br />굿즈
        </Link>
      </h1>

      {/* ── 카테고리 칩 (ECO Bag / Sticker / Reusable Bag / Key-ring / Ornaments) ── */}
      {cats.length > 0 && (
        <div
          className={isMobile ? 'chip-scroll-row' : undefined}
          style={isMobile ? undefined : { display: 'flex', flexWrap: 'wrap', gap: 8 }}
        >
          {cats.map((c) => {
            const sel = isSelected(c.slug);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.slug)}
                aria-pressed={sel}
                title={sel ? `${c.name} 필터 해제` : `${c.name} 만 보기`}
                style={{
                  ...chipStyle,
                  cursor: 'pointer',
                  background: sel ? '#000' : '#fff', // 선택=검정 채움(Figma), 미선택=테두리
                  color: sel ? '#fff' : '#111',
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 카테고리 칩 (Figma: border 1px #000, rounded 999, px16 py4, 14px). 클릭=필터 토글.
const chipStyle: React.CSSProperties = {
  border: '1px solid #000', borderRadius: 999, padding: '4px 16px',
  fontSize: 14, lineHeight: 1.4, color: '#111', background: '#fff', whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};
