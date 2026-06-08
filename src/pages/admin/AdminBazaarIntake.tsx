// ============================================================================
// AdminBazaarIntake — 바자회 물품 접수/검수/게시 관리 페이지 (관리자 전용)
//
// 흐름: 접수 등록 → 검수 → 게시(상품 페이지 공개) / 게시 중단
//   - 등록/수정: BazaarIntakeForm
//   - 게시/게시중단/삭제: 목록 카드 액션 (DB RPC 호출)
//   - Realtime 구독으로 여러 접수 단말 동시 작업 시에도 목록 자동 갱신
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadIntakeList,
  publishIntake,
  unpublishIntake,
  deleteIntake,
  subscribeIntake,
  categoryLabel,
  type IntakeFilter,
} from '@/lib/bazaarIntake';
import { BazaarIntakeForm } from '@/components/admin/BazaarIntakeForm';
import type { EsgBazaarIntakeRow, EsgBazaarIntakePublishStatus } from '@/types/esg';

const STATUS_META: Record<EsgBazaarIntakePublishStatus, { label: string; bg: string; color: string }> = {
  pending: { label: '검수 대기', bg: '#fef3c7', color: '#92400e' },
  published: { label: '게시 중', bg: '#dcfce7', color: '#166534' },
  unpublished: { label: '게시 중단', bg: '#f0f0f0', color: '#666' },
};

const FILTERS: Array<{ key: IntakeFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검수 대기' },
  { key: 'published', label: '게시 중' },
  { key: 'unpublished', label: '게시 중단' },
];

export function AdminBazaarIntake() {
  const [rows, setRows] = useState<EsgBazaarIntakeRow[]>([]);
  const [filter, setFilter] = useState<IntakeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = async (f: IntakeFilter = filter) => {
    try {
      setError(null);
      setRows(await loadIntakeList(f));
    } catch (e) {
      console.error('[AdminBazaarIntake]', e);
      setError(e instanceof Error ? e.message : '접수 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    const cleanup = subscribeIntake(() => void reload(filter));
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>📦 바자회 물품 접수</h2>
        <button type="button" onClick={() => setCreating(true)} style={primaryBtn}>
          ➕ 물품 접수 등록
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        임직원이 가져온 물품을 받는 즉시 등록하세요. 검수 후 "게시"하면 바자회 상품 페이지에 공개됩니다.
      </p>

      {/* 필터 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: filter === f.key ? '#0ea5e9' : '#ddd',
              background: filter === f.key ? '#0ea5e9' : '#fff',
              color: filter === f.key ? '#fff' : '#555',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 등록 폼 */}
      {creating && (
        <div style={{ ...cardBox, borderColor: '#0ea5e9', borderWidth: 2, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#0ea5e9' }}>➕ 물품 접수 등록</h3>
          <BazaarIntakeForm
            onCancel={() => setCreating(false)}
            onSuccess={() => {
              setCreating(false);
              void reload(filter);
            }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : error ? (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>
      ) : rows.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📦</div>
          <p style={{ margin: '0 0 8px', color: '#888' }}>해당 조건의 접수 물품이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map((r) => (
            <IntakeCard key={r.id} row={r} onChange={() => reload(filter)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개별 접수 카드
// ============================================================================
function IntakeCard({ row, onChange }: { row: EsgBazaarIntakeRow; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[row.publish_status];
  const thumb = row.publish_photo_url || row.intake_photo_url;

  const doPublish = async () => {
    if (!row.publish_photo_url) {
      alert('게시할 물건 사진이 없습니다. 먼저 "수정"에서 게시 사진을 등록하세요.');
      return;
    }
    setBusy(true);
    try {
      await publishIntake(row.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '게시 실패');
    } finally {
      setBusy(false);
    }
  };

  const doUnpublish = async () => {
    if (!confirm('게시를 중단하시겠습니까? 상품 페이지에서 숨겨집니다. (주문 이력은 보존)')) return;
    setBusy(true);
    try {
      await unpublishIntake(row.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '게시 중단 실패');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirm('이 접수 기록을 삭제하시겠습니까?')) return;
    setBusy(true);
    try {
      await deleteIntake(row);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...cardBox, opacity: row.publish_status === 'unpublished' ? 0.7 : 1 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* 썸네일 */}
        <div
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            borderRadius: 8,
            background: thumb ? `url(${thumb}) center / cover` : '#f5f5f5',
            border: '1px solid #eee',
          }}
        />
        {/* 본문 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', background: meta.bg, color: meta.color, borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
              {meta.label}
            </span>
            <span style={{ padding: '2px 8px', background: '#eef2ff', color: '#3730a3', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
              {categoryLabel(row.category)}
            </span>
            {row.product_id && (
              <Link to={`/bazaar/${row.product_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0ea5e9' }}>
                상품 보기 ↗
              </Link>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{row.name}</div>
          <div style={{ fontSize: 12, color: '#666', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <span>기증자: <strong>{row.donor_name_snapshot}</strong>{row.donor_dept_snapshot ? ` · ${row.donor_dept_snapshot}` : ''}{row.donor_id === null ? ' (외부)' : ''}</span>
            <span>
              책정 <strong>{row.listed_price.toLocaleString()}원</strong>
              {row.original_price != null && (
                <span style={{ color: '#aaa', textDecoration: 'line-through', marginLeft: 4 }}>
                  {row.original_price.toLocaleString()}원
                </span>
              )}
            </span>
            <span>수량 <strong>{row.quantity}</strong></span>
          </div>
          {row.note && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>📝 {row.note}</div>}
        </div>

        {/* 액션 */}
        {!editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button type="button" onClick={() => setEditing(true)} disabled={busy} style={miniBtn('#0ea5e9')}>
              ✏️ 수정
            </button>
            {row.publish_status === 'published' ? (
              <button type="button" onClick={doUnpublish} disabled={busy} style={miniBtn('#d97706')}>
                ⏸ 게시 중단
              </button>
            ) : (
              <button type="button" onClick={doPublish} disabled={busy} style={miniBtn('#16a34a')}>
                {row.publish_status === 'unpublished' ? '▶ 다시 게시' : '🚀 게시'}
              </button>
            )}
            {!row.product_id && (
              <button type="button" onClick={doDelete} disabled={busy} style={miniBtn('#dc2626')}>
                🗑 삭제
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed #eee' }}>
          <BazaarIntakeForm
            initial={row}
            onCancel={() => setEditing(false)}
            onSuccess={() => {
              setEditing(false);
              onChange();
            }}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 공통 스타일
// ============================================================================
const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#0ea5e9',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};

const cardBox: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 16,
  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  border: '1px solid #eee',
};

const emptyStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 48,
  textAlign: 'center',
  border: '1px dashed #ddd',
};

const miniBtn = (color: string): React.CSSProperties => ({
  padding: '4px 10px',
  background: '#fff',
  border: `1px solid ${color}`,
  color,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  whiteSpace: 'nowrap',
});
