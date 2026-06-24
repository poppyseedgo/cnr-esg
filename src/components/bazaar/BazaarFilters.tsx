// ============================================================================
// BazaarFilters — 바자회 필터 공용 컴포넌트 (Figma 2차 사이드바 filter 영역)
//
// [변경 이력]
//   2026-06-24  [Task 1] 신규. BazaarPage 본문에 인라인이던 필터(검색·품절제외·
//               카테고리/브랜드 칩)를 Figma 디자인(node 1563:252)으로 재구현하여
//               데스크톱 2차 사이드바와 모바일 최상단에서 '동일 컴포넌트'로 재사용.
//
// [설계 — 근본 구조]
//   · 필터 상태의 단일 소스 = URL 검색 파라미터 (cat / brand / q / soldout).
//     → 사이드바(이 컴포넌트)와 본문 그리드(BazaarPage)가 같은 URL을 읽어
//       어느 위치에 렌더되든 동기화. 뒤로가기·링크 공유도 자동 동작.
//   · prop drilling/전역 context 불필요(임시방편 회피). 둘 다 useSearchParams.
//   · 태그 목록은 listTagsWithCount 1회 로드(칩 렌더용). 카운트는 사이드바에
//     비표시(Figma 동일) → 약간의 staleness 무해.
//
// [Figma SSOT] node 1563:252 (file ydfT0xP6nc83VxFd7GyEx4)
//   체크박스 14px / 칩 border-black px16 py4 rounded-999 / 선택=bg-black text-white
//   요약 pill bg-#e0e0e0 px8 py2 / 검색 border-bottom black, placeholder #b8b8b8
// ============================================================================

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useSearchParams, Link } from 'react-router-dom'; // ← [2026-06-24] 타이틀 링크
import { listTagsWithCount } from '@/lib/tags';
import type { EsgTagWithCount } from '@/types/esg';

interface BazaarFiltersProps {
  /** 큰 타이틀("나무 심는 바자회") 표시 여부. 데스크톱 사이드바=true, 모바일=false */
  showTitle?: boolean;
}

export function BazaarFilters({ showTitle = false }: BazaarFiltersProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCat = searchParams.get('cat') ?? '';
  const activeBrand = searchParams.get('brand') ?? '';
  const hideSoldOut = searchParams.get('soldout') === '1';
  const urlQ = searchParams.get('q') ?? '';

  // 태그 목록(칩 렌더용) — 1회 로드
  const [tags, setTags] = useState<EsgTagWithCount[]>([]);
  useEffect(() => {
    listTagsWithCount().then(setTags).catch(() => {/* 실패 시 필터 없이 동작 */});
  }, []);

  // URL 파라미터 단일 갱신 헬퍼(replace=히스토리 오염 방지)
  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('tag'); // legacy ?tag= 정리
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // 검색: 로컬 입력 → 300ms 디바운스 → URL q. 외부 변경(뒤로가기) 시 입력 동기화.
  const [searchInput, setSearchInput] = useState(urlQ);
  useEffect(() => { setSearchInput(urlQ); }, [urlQ]);
  const debounceRef = useRef<number | undefined>(undefined);
  const onSearchChange = (v: string) => {
    setSearchInput(v);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setParam('q', v.trim() || null), 300);
  };

  const toggleCat = (slug: string) => setParam('cat', slug === activeCat ? null : slug);
  const toggleBrand = (slug: string) => setParam('brand', slug === activeBrand ? null : slug);
  // 전체보기 ↔ 품절제외: 동일한 soldout 파라미터의 상호배타 쌍.
  //  · 전체보기 = 품절 포함(soldout 없음) → 기본값이므로 '항상 디폴트 선택'
  //  · 품절제외 = soldout=1
  const showAllScope = () => setParam('soldout', null);   // 전체보기(품절 포함)
  const hideSoldOutScope = () => setParam('soldout', '1'); // 품절제외

  const catTags = tags.filter((t) => t.kind !== 'brand' && t.product_count > 0);
  const brandTags = tags.filter((t) => t.kind === 'brand' && t.product_count > 0);

  // 아코디언 펼침: filter(카테고리)는 기본 펼침 / 브랜드는 기본 닫힘  // ← [2026-06-24]
  const [catOpen, setCatOpen] = useState(true);
  const [brandOpen, setBrandOpen] = useState(false);

  const activeCatName = catTags.find((t) => t.slug === activeCat)?.name;
  const activeBrandName = brandTags.find((t) => t.slug === activeBrand)?.name;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'stretch' }}>
      {/* 타이틀(데스크톱 사이드바만) — 클릭 시 바자회 목록으로 */}
      {showTitle && (
        <Link to="/bazaar" style={{ textDecoration: 'none' }}>
          <h2 style={{ margin: 0, fontWeight: 400, fontSize: 40, lineHeight: 1.2, color: '#111', letterSpacing: '-0.5px' }}>
            나무 심는<br />바자회
          </h2>
        </Link>
      )}

      {/* 전체보기 / 품절제외 체크박스 행 (우측 정렬) — soldout 상호배타 쌍 */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'flex-end', padding: '8px 0' }}>
        <CheckItem label="전체보기" checked={!hideSoldOut} onClick={showAllScope} />
        <CheckItem label="품절제외" checked={hideSoldOut} onClick={hideSoldOutScope} />
      </div>

      {/* filter(카테고리) 아코디언 */}
      {catTags.length > 0 && (
        <AccordionSection
          title="filter"
          open={catOpen}
          onToggle={() => setCatOpen((v) => !v)}
          summary={activeCatName}
        >
          {catTags.map((t) => (
            <Chip key={t.id} label={t.name} selected={t.slug === activeCat} onClick={() => toggleCat(t.slug)} />
          ))}
        </AccordionSection>
      )}

      {/* 브랜드 아코디언 */}
      {brandTags.length > 0 && (
        <AccordionSection
          title="브랜드"
          open={brandOpen}
          onToggle={() => setBrandOpen((v) => !v)}
          summary={activeBrandName}
        >
          {brandTags.map((t) => (
            <Chip key={t.id} label={t.name} selected={t.slug === activeBrand} onClick={() => toggleBrand(t.slug)} />
          ))}
        </AccordionSection>
      )}

      {/* 검색 (border-bottom, placeholder #b8b8b8) */}
      <div style={{ borderBottom: '1px solid #000', display: 'flex', alignItems: 'center', padding: '12px 0' }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="브랜드 또는 제품 이름 검색"
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            fontSize: 16, lineHeight: 1.4, color: '#111', fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}

// ── 체크박스 항목 (14px 박스 + 라벨 16px) ────────────────────────────────────
function CheckItem({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 14, height: 14, flexShrink: 0,
        border: '1px solid #000', background: checked ? '#000' : '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span style={{ fontSize: 16, lineHeight: 1.4, color: '#111', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

// ── 아코디언 섹션 (헤더 +/− · 선택 요약 pill · 펼침 시 칩 리스트) ──────────────
function AccordionSection({
  title, open, onToggle, summary, children,
}: {
  title: string; open: boolean; onToggle: () => void; summary?: string; children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', width: '100%' }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${title} ${open ? '접기' : '펼치기'}`}
          style={{
            width: 20, height: 20, flexShrink: 0, position: 'relative',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          {/* +/− 토글 글리프 (Figma "+" 아이콘 위치 20px) */}
          <span style={{ position: 'absolute', left: 0, top: 9, width: 20, height: 2, background: '#111' }} />
          <span style={{
            position: 'absolute', left: 9, top: 0, width: 2, height: 20, background: '#111',
            transform: open ? 'scaleY(0)' : 'scaleY(1)', transition: 'transform .15s ease',
          }} />
        </button>
        <span
          onClick={onToggle}
          style={{ fontSize: 24, lineHeight: 1.4, color: '#111', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >
          {title}
        </span>
        {summary && (
          <span style={{
            background: '#e0e0e0', color: '#000', fontSize: 12, lineHeight: 1.4,
            padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
          }}>
            {summary}
          </span>
        )}
      </div>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── 필터 칩 (선택=bg-black text-white / 미선택=border-black) ───────────────────
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        border: '1px solid #000', borderRadius: 999, padding: '4px 16px',
        background: selected ? '#000' : '#fff', color: selected ? '#fff' : '#111',
        fontSize: 14, lineHeight: 1.4, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
