// ============================================================================
// Breadcrumb — 상세 페이지 최상단 브레드크럼 (경매/굿즈/바자회 공용)
//   [2026-07-08] 경매 상세의 인라인 브레드크럼을 공용 컴포넌트로 추출.
//   스타일 동일: 16px · 링크 #848484 · 구분자 › #b8b8b8 · 현재 #111(말줄임).
// ============================================================================

import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to: string;
}

export function Breadcrumb({ items, current }: { items: Crumb[]; current: string }) {
  return (
    <nav
      aria-label="breadcrumb"
      style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, lineHeight: 1.4, flexWrap: 'wrap' }}
    >
      {items.map((c) => (
        <Fragment key={c.to}>
          <Link to={c.to} style={{ color: '#848484', textDecoration: 'none' }}>{c.label}</Link>
          <span style={{ color: '#b8b8b8' }}>›</span>
        </Fragment>
      ))}
      <span style={{ color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current}</span>
    </nav>
  );
}
