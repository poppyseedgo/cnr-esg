// ============================================================================
// AdminBazaarIntake — 바자회 물품 접수/검수/게시 관리 페이지 (관리자 전용)
//
// 상태(상호배타적 — 한 행은 정확히 하나):
//   pending 검수대기 · passed 검수완료 · rejected 검수탈락 · published 게시중 · unpublished 게시중단
//   전체 개수 = 5개 상태 개수의 합.
//
// 숫자 정합성(섞임 방지)의 핵심:
//   - 목록 전체를 한 번에 로드(loadIntakeList('all'))해서 rows 한 배열에 담는다.
//   - 필터 탭 카운트도, 화면에 보이는 목록도 "모두 이 rows 한 배열에서" 파생.
//     → 카운트와 표시 목록이 같은 소스라 절대 어긋나지 않음.
//
// 상태 전이:
//   pending → passed/rejected         : setIntakeStatus (일반 UPDATE)
//   passed/rejected → pending          : setIntakeStatus (재검토)
//   passed → published                 : publishIntake (RPC, 상품 생성)
//   published → unpublished            : unpublishIntake (RPC, 상품 hidden)
//   unpublished → published(다시 게시)  : publishIntake (RPC)
//   ※ 검수 상태(pending/passed/rejected)에는 상품이 없음 → UI에서 게시 액션 미노출.
//
// 변경 이력:
//   2026-06-08  인라인→모달, 토스트, 상단 스크롤
//   2026-06-08  [요청] 5단계 상태(검수완료/검수탈락 추가) + 필터별 카운트 배지 + 검수 액션
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  loadIntakeList,
  publishIntake,
  unpublishIntake,
  deleteIntake,
  setIntakeStatus,
  subscribeIntake,
  categoryLabel,
  type IntakeFilter,
  type InspectionStatus,
} from '@/lib/bazaarIntake';
import { BazaarIntakeForm } from '@/components/admin/BazaarIntakeForm';
import { SearchBar } from '@/components/SearchBar'; // ← [2026-06-17] 물품/기증자 검색
import { matchesQuery } from '@/utils/search';
import { ModalShell } from '@/components/modal/ModalShell';
import '@/components/home/EventModal.css'; // ← .esg-modal__* 클래스 보장
import type { EsgBazaarIntakeRow, EsgBazaarIntakePublishStatus } from '@/types/esg';

const STATUS_META: Record<EsgBazaarIntakePublishStatus, { label: string; bg: string; color: string }> = {
  pending: { label: '검수 대기', bg: '#fef3c7', color: '#92400e' },
  passed: { label: '검수 완료', bg: '#dbeafe', color: '#1e40af' },
  rejected: { label: '검수 탈락', bg: '#fee2e2', color: '#991b1b' },
  published: { label: '게시 중', bg: '#dcfce7', color: '#166534' },
  unpublished: { label: '게시 중단', bg: '#f0f0f0', color: '#666' },
};

// 필터 순서 (요청 순서: 전체 → 검수대기 → 검수완료 → 게시중 → 검수탈락 → 게시중단)
const FILTERS: Array<{ key: IntakeFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검수 대기' },
  { key: 'passed', label: '검수 완료' },
  { key: 'published', label: '게시 중' },
  { key: 'rejected', label: '검수 탈락' },
  { key: 'unpublished', label: '게시 중단' },
];

type FormMode = { type: 'create' } | { type: 'edit'; row: EsgBazaarIntakeRow } | null;

export function AdminBazaarIntake() {
  // rows = "전체" 목록 한 배열 (카운트/표시의 단일 소스)
  const [rows, setRows] = useState<EsgBazaarIntakeRow[]>([]);
  const [filter, setFilter] = useState<IntakeFilter>('all');
  const [query, setQuery] = useState(''); // ← [2026-06-17] 물품 이름/기증자 검색어
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formDirty, setFormDirty] = useState(false); // ← [2026-06-16] 물품 폼 작성중 여부(닫기 가드)

  // 토스트
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // 항상 전체 로드 (필터는 클라이언트에서) → 카운트/목록 단일 소스
  const reload = async () => {
    try {
      setError(null);
      setRows(await loadIntakeList('all'));
    } catch (e) {
      console.error('[AdminBazaarIntake]', e);
      setError(e instanceof Error ? e.message : '접수 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  useEffect(() => {
    const cleanup = subscribeIntake(() => void reload());
    return cleanup;
  }, []);

  // 상태별 카운트 — rows(전체) 한 배열에서만 계산 (섞임 없음)
  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, passed: 0, rejected: 0, published: 0, unpublished: 0 };
    for (const r of rows) c[r.publish_status] += 1;
    return c;
  }, [rows]);

  // 표시 목록 — 같은 rows에서 상태 + 검색어(물품 이름/기증자) 필터링
  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === 'all' || r.publish_status === filter) &&
          matchesQuery(query, r.name, r.donor_name_snapshot, r.donor_dept_snapshot)
      ),
    [rows, filter, query]
  );

  const closeForm = () => {
    setFormDirty(false);
    setFormMode(null);
  };

  const handleFormSuccess = (mode: FormMode) => {
    setFormMode(null);
    showToast(mode?.type === 'edit' ? '수정되었습니다.' : '접수 등록이 완료되었습니다.');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 60);
    void reload();
  };

  const notifyAndReload = (msg: string) => {
    showToast(msg);
    void reload();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>📦 바자회 물품 접수</h2>
        <button type="button" onClick={() => setFormMode({ type: 'create' })} style={primaryBtn}>
          ➕ 물품 접수 등록
        </button>
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        임직원이 가져온 물품을 받는 즉시 등록하세요. 검수 → 게시 단계로 관리합니다.
      </p>

      {/* 필터 탭 (카운트 배지) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const n = counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                minHeight: 40,
                borderRadius: 999,
                border: '1px solid',
                borderColor: active ? '#111' : '#ddd',
                background: active ? '#111' : '#fff',
                color: active ? '#fff' : '#555',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {f.label}
              <span
                style={{
                  minWidth: 18,
                  padding: '0 6px',
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: active ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                  color: active ? '#fff' : '#475569',
                }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* 검색 (물품 이름 / 기증자) */}
      <div style={{ marginBottom: 16 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="물품 이름 · 기증자 검색" width={320} />
        {query.trim() && (
          <span style={{ marginLeft: 10, fontSize: 12, color: '#888' }}>{visible.length}건</span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : error ? (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>⚠️ {error}</div>
      ) : visible.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📦</div>
          <p style={{ margin: '0 0 8px', color: '#888' }}>해당 분류의 접수 물품이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((r) => (
            <IntakeCard
              key={r.id}
              row={r}
              onEdit={() => setFormMode({ type: 'edit', row: r })}
              onAction={notifyAndReload}
            />
          ))}
        </div>
      )}

      {/* 등록/수정 모달 (데스크탑 모달 / 모바일 바텀시트) */}
      {formMode &&
        createPortal(
          <ModalShell
            size="big"
            ariaLabel={formMode.type === 'edit' ? '접수 정보 수정' : '물품 접수 등록'}
            onClose={closeForm}
            isDirty={formDirty}
            contentsClassName="esg-modal__contents--form-footer"
            header={
              <div className="esg-modal__title-group">
                <h2 className="esg-modal__title esg-modal__title--big">
                  {formMode.type === 'edit' ? '접수 정보 수정' : '물품 접수 등록'}
                </h2>
              </div>
            }
          >
            <BazaarIntakeForm
              initial={formMode.type === 'edit' ? formMode.row : undefined}
              onCancel={closeForm}
              onSuccess={() => handleFormSuccess(formMode)}
              onDirtyChange={setFormDirty}
            />
          </ModalShell>,
          document.body
        )}

      {/* 토스트 */}
      {toast &&
        createPortal(
          <div style={toastWrap} role="status" aria-live="polite">
            <div style={toastBox}>✅ {toast}</div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
// 개별 접수 카드 — 상태별 액션
// ============================================================================
function IntakeCard({
  row,
  onEdit,
  onAction,
}: {
  row: EsgBazaarIntakeRow;
  onEdit: () => void;
  onAction: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[row.publish_status];
  const thumb = row.publish_photo_url || row.intake_photos[0];
  const faded = row.publish_status === 'rejected' || row.publish_status === 'unpublished';

  // 공통 실행 래퍼 (busy 토글 + 에러 alert)
  const run = async (fn: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      onAction(successMsg);
    } catch (e) {
      alert(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setBusy(false);
    }
  };

  const toStatus = (s: InspectionStatus, msg: string) => run(() => setIntakeStatus(row.id, s), msg);

  const doPublish = () => {
    if (!row.publish_photo_url) {
      alert('게시할 물건 사진이 없습니다. 먼저 "수정"에서 게시 사진을 등록하세요.');
      return;
    }
    void run(() => publishIntake(row.id).then(() => undefined), '상품 페이지에 게시되었습니다.');
  };
  const doUnpublish = () => {
    if (!confirm('게시를 중단하시겠습니까? 상품 페이지에서 숨겨집니다. (주문 이력은 보존)')) return;
    void run(() => unpublishIntake(row.id), '게시를 중단했습니다.');
  };
  const doDelete = () => {
    if (!confirm('이 접수 기록을 삭제하시겠습니까?')) return;
    void run(() => deleteIntake(row), '삭제되었습니다.');
  };

  return (
    <div style={{ ...cardBox, opacity: faded ? 0.7 : 1 }}>
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
              <Link to={`/bazaar/${row.product_id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#111' }}>
                상품 보기 ↗
              </Link>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, overflowWrap: 'anywhere' }}>{row.name}</div>
          <div style={{ fontSize: 12, color: '#666', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <span>기증자: <strong>{row.donor_name_snapshot}</strong>{row.donor_dept_snapshot ? ` · ${row.donor_dept_snapshot}` : ''}</span>
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
          {row.note && (
            <div
              style={{
                fontSize: 12,
                color: '#999',
                marginTop: 4,
                overflowWrap: 'anywhere',  // 공백 없는 URL도 강제 줄바꿈
                wordBreak: 'break-word',
                display: '-webkit-box',
                WebkitLineClamp: 2,        // 목록에선 2줄까지만(전체는 '수정'에서)
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              title={row.note}
            >
              📝 {row.note}
            </div>
          )}
        </div>

        {/* 상태별 액션 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {row.publish_status === 'pending' && (
            <>
              <button type="button" onClick={() => toStatus('passed', '검수 완료로 변경했습니다.')} disabled={busy} style={miniBtn('#16a34a')}>✅ 검수 통과</button>
              <button type="button" onClick={() => toStatus('rejected', '검수 탈락 처리했습니다.')} disabled={busy} style={miniBtn('#dc2626')}>❌ 검수 탈락</button>
            </>
          )}

          {row.publish_status === 'passed' && (
            <>
              <button type="button" onClick={doPublish} disabled={busy} style={miniBtn('#111')}>🚀 게시</button>
              <button type="button" onClick={() => toStatus('rejected', '검수 탈락 처리했습니다.')} disabled={busy} style={miniBtn('#dc2626')}>❌ 검수 탈락</button>
              <button type="button" onClick={() => toStatus('pending', '검수 대기로 되돌렸습니다.')} disabled={busy} style={miniBtn('#6b7280')}>↩︎ 검수 대기</button>
            </>
          )}

          {row.publish_status === 'rejected' && (
            <button type="button" onClick={() => toStatus('pending', '검수 대기로 되돌렸습니다.')} disabled={busy} style={miniBtn('#6b7280')}>↩︎ 검수 대기로</button>
          )}

          {row.publish_status === 'published' && (
            <button type="button" onClick={doUnpublish} disabled={busy} style={miniBtn('#d97706')}>⏸ 게시 중단</button>
          )}

          {row.publish_status === 'unpublished' && (
            <button type="button" onClick={doPublish} disabled={busy} style={miniBtn('#111')}>▶ 다시 게시</button>
          )}

          <button type="button" onClick={onEdit} disabled={busy} style={miniBtn('#6b7280')}>✏️ 수정</button>

          {/* 상품이 없는 검수 단계(pending/passed/rejected)만 삭제 가능 */}
          {!row.product_id && (
            <button type="button" onClick={doDelete} disabled={busy} style={miniBtn('#dc2626')}>🗑 삭제</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 공통 스타일
// ============================================================================
const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  minHeight: 44,
  background: '#111',
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
  padding: '8px 12px',
  minHeight: 38,
  background: '#fff',
  border: `1px solid ${color}`,
  color,
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
});

const toastWrap: React.CSSProperties = {
  position: 'fixed',
  top: 'calc(16px + env(safe-area-inset-top, 0px))',
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  zIndex: 3000,
  pointerEvents: 'none',
  padding: '0 16px',
};

const toastBox: React.CSSProperties = {
  background: '#111827',
  color: '#fff',
  padding: '12px 18px',
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 600,
  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  maxWidth: '90vw',
};
