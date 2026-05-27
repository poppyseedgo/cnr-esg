// ============================================================================
// AdminEmails — 이메일 outbox 어드민 페이지
//
// 기능:
//   - 필터: 상태 (전체/대기/발송완료/실패/영구실패) + 템플릿 종류 + 검색
//   - 카드 목록: 상태/수신자/제목/발송 시각/에러
//   - 액션: 재시도 (failed/dead → pending), 삭제, 일괄 재시도
//   - 실시간: subscribeEmails (다른 어드민 작업 시 즉시 반영)
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  loadEmails,
  retryEmail,
  retryAllFailed,
  deleteEmail,
  subscribeEmails,
  type LoadEmailsFilters,
} from '@/lib/adminEmails';
import type {
  EsgEmailOutboxRow,
  EsgEmailStatus,
  EsgEmailTemplateKey,
} from '@/types/esg';

const STATUS_LABELS: Record<EsgEmailStatus, string> = {
  pending: '대기 중',
  sent: '발송 완료',
  failed: '실패 (재시도 대기)',
  dead: '영구 실패',
  skipped: '건너뜀',
};

const STATUS_COLORS: Record<EsgEmailStatus, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  sent: { bg: '#dcfce7', color: '#166534' },
  failed: { bg: '#fee2e2', color: '#dc2626' },
  dead: { bg: '#fecaca', color: '#991b1b' },
  skipped: { bg: '#f0f0f0', color: '#888' },
};

const TEMPLATE_LABELS: Record<EsgEmailTemplateKey, string> = {
  bazaar_order_created: '🛍 바자회 주문 생성',
  bazaar_order_paid: '✅ 결제 확인',
  bazaar_payment_reminder: '⏰ 입금 리마인더 (21시)',
  bazaar_order_expired: '⌛ 입금 기한 초과',
  bazaar_order_cancelled: '🚫 주문 취소',
  auction_won: '🎉 경매 낙찰',
  auction_cancelled: '🚫 경매 취소',
  post_hidden: '🙈 게시글 숨김',
  donation_created: '💚 기부 신청',
  donation_paid: '🎉 기부 확인 (인증서)',
};

export function AdminEmails() {
  const [emails, setEmails] = useState<EsgEmailOutboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0); // realtime 트리거용

  // 필터
  const [statusFilter, setStatusFilter] = useState<EsgEmailStatus | 'all'>('all');
  const [templateFilter, setTemplateFilter] = useState<EsgEmailTemplateKey | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo<LoadEmailsFilters>(
    () => ({
      statuses: statusFilter === 'all' ? undefined : [statusFilter],
      templateKey: templateFilter === 'all' ? undefined : templateFilter,
      search: searchDebounced || undefined,
      sortOrder: 'newest',
    }),
    [statusFilter, templateFilter, searchDebounced]
  );

  const reload = async () => {
    try {
      setError(null);
      const data = await loadEmails(filters);
      setEmails(data);
    } catch (e) {
      console.error('[AdminEmails]', e);
      setError(e instanceof Error ? e.message : '이메일을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, templateFilter, searchDebounced]);

  useEffect(() => {
    const cleanup = subscribeEmails(() => {
      void reload();
      setTick((t) => t + 1);
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const failedCount = emails.filter((e) => e.status === 'failed' || e.status === 'dead').length;
  const totalCount = emails.length;

  const handleRetryAll = async () => {
    if (!confirm('실패한 모든 메일을 재시도하시겠습니까?\n다음 cron 사이클(최대 1분 내)에 다시 발송됩니다.')) {
      return;
    }
    try {
      const n = await retryAllFailed();
      alert(`✅ ${n}건을 재시도 대기로 변경했습니다.`);
      void reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : '일괄 재시도 실패');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>📨 이메일 발송 관리</h2>
        {failedCount > 0 && (
          <button
            type="button"
            onClick={handleRetryAll}
            style={{
              padding: '8px 14px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            🔄 실패 메일 일괄 재시도 ({failedCount}건)
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        모든 발송 이메일의 이력입니다. 실패한 메일은 재시도하거나 삭제할 수 있습니다.
      </p>

      {/* 필터 */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="상태">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EsgEmailStatus | 'all')}
              style={inputStyle}
            >
              <option value="all">전체</option>
              <option value="pending">대기 중</option>
              <option value="sent">발송 완료</option>
              <option value="failed">실패 (재시도 대기)</option>
              <option value="dead">영구 실패</option>
              <option value="skipped">건너뜀</option>
            </select>
          </Field>
          <Field label="템플릿 종류">
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value as EsgEmailTemplateKey | 'all')}
              style={inputStyle}
            >
              <option value="all">전체</option>
              {(Object.keys(TEMPLATE_LABELS) as EsgEmailTemplateKey[]).map((k) => (
                <option key={k} value={k}>
                  {TEMPLATE_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="검색 (수신자/제목)">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="예: hong@cnrres.com"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {!loading && totalCount > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', fontSize: 12 }}>
          <SummaryChip label="결과 수" value={`${totalCount}건`} />
          {failedCount > 0 && (
            <SummaryChip label="실패" value={`${failedCount}건`} color="#991b1b" bg="#fee2e2" />
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : emails.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 48,
            textAlign: 'center',
            border: '1px dashed #ddd',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📭</div>
          <p style={{ margin: 0, color: '#888' }}>조건에 맞는 이메일이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {emails.map((e) => (
            <EmailRow key={e.id} email={e} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개별 메일 카드
// ============================================================================

function EmailRow({ email, onChange }: { email: EsgEmailOutboxRow; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLORS[email.status];

  const handleRetry = async () => {
    if (!confirm(`이 메일을 재시도하시겠습니까?\n수신자: ${email.to_email}`)) return;
    setBusy(true);
    try {
      await retryEmail(email.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '재시도 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`이 메일을 삭제하시겠습니까?\n수신자: ${email.to_email}\n(발송 이력에서 영구 삭제됩니다)`)) return;
    setBusy(true);
    try {
      await deleteEmail(email.id);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  };

  const isProblem = email.status === 'failed' || email.status === 'dead';

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        padding: 14,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        border: '1px solid',
        borderColor: isProblem ? '#fecaca' : '#eee',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '2px 8px',
            background: statusColor.bg,
            color: statusColor.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          {STATUS_LABELS[email.status]}
          {email.retry_count > 0 && ` · ${email.retry_count}회 재시도`}
        </span>
        <span style={{ fontSize: 11, color: '#666' }}>
          {TEMPLATE_LABELS[email.template_key] ?? email.template_key}
        </span>
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>
          {fmtKstShort(email.created_at)}
        </span>
      </div>

      <div style={{ marginTop: 8, fontSize: 13 }}>
        <div>
          <span style={{ color: '#888' }}>수신: </span>
          <strong>{email.to_name ?? '(이름 없음)'}</strong>
          <span style={{ color: '#888' }}> · {email.to_email}</span>
        </div>
        <div style={{ marginTop: 2, color: '#444' }}>{email.subject}</div>
      </div>

      {email.last_error && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: '#fef2f2',
            color: '#991b1b',
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'monospace',
            wordBreak: 'break-all',
          }}
        >
          ⚠️ {email.last_error}
        </div>
      )}

      {email.sent_at && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#16a34a' }}>
          ✅ {fmtKstShort(email.sent_at)} 발송 완료
        </div>
      )}

      {/* 액션 */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={miniBtn('default', busy)}
        >
          {expanded ? '▲ 데이터 숨기기' : '▼ 템플릿 데이터'}
        </button>
        {(email.status === 'failed' || email.status === 'dead') && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={busy}
            style={miniBtn('primary', busy)}
          >
            🔄 재시도
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          style={miniBtn('danger', busy)}
        >
          🗑 삭제
        </button>
        {email.related_order_id && (
          <Link
            to="/admin/orders"
            style={{
              padding: '4px 10px',
              background: '#fff',
              border: '1px solid #ddd',
              color: '#666',
              borderRadius: 4,
              textDecoration: 'none',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            🛒 관련 주문
          </Link>
        )}
      </div>

      {expanded && (
        <pre
          style={{
            marginTop: 10,
            padding: 12,
            background: '#1a1a1a',
            color: '#a7f3d0',
            borderRadius: 6,
            fontSize: 11,
            overflow: 'auto',
            maxHeight: 200,
            fontFamily: 'monospace',
          }}
        >
          {JSON.stringify(email.template_data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ============================================================================
// 공통 UI
// ============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 13,
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function SummaryChip({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: string;
  color?: string;
  bg?: string;
}) {
  return (
    <div
      style={{
        padding: '6px 12px',
        background: bg ?? '#f5f5f5',
        color: color ?? '#444',
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.7 }}>{label}: </span>
      <strong>{value}</strong>
    </div>
  );
}

const miniBtn = (
  variant: 'default' | 'primary' | 'danger',
  disabled: boolean
): React.CSSProperties => {
  const colors = {
    default: { border: '#ddd', color: '#666' },
    primary: { border: '#0ea5e9', color: '#0ea5e9' },
    danger: { border: '#fecaca', color: '#dc2626' },
  };
  return {
    padding: '4px 10px',
    background: '#fff',
    border: `1px solid ${colors[variant].border}`,
    color: colors[variant].color,
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11,
    whiteSpace: 'nowrap',
  };
};

function fmtKstShort(utcIso: string): string {
  if (!utcIso) return '-';
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  const sec = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}
