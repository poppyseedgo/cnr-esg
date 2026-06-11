// ============================================================================
// AdminDonations — 어드민 기부 관리 페이지
//
// 기능:
//   - 필터: 상태 / 익명여부 / 검색
//   - 입금 확인 (mark_donation_paid → 인증서 자동 발급 + 이메일)
//   - 강제 취소
//   - 어드민 메모
//   - 인증서 보기 링크
// ============================================================================

import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAllDonations,
  markDonationPaid,
  cancelDonationAdmin,
  updateAdminMemo,
  subscribeDonationsAdmin,
  type LoadAllDonationsFilters,
} from '@/lib/adminDonations';
import type { EsgDonationRow, EsgDonationStatus } from '@/types/esg';

const STATUS_LABELS: Record<EsgDonationStatus, string> = {
  pending: '입금 대기',
  paid: '기부 완료',
  expired: '만료',
  cancelled: '취소',
};

const STATUS_COLORS: Record<EsgDonationStatus, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  paid: { bg: '#dcfce7', color: '#166534' },
  expired: { bg: '#f0f0f0', color: '#666' },
  cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

export function AdminDonations() {
  const [donations, setDonations] = useState<EsgDonationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const [statusFilter, setStatusFilter] = useState<EsgDonationStatus | 'all'>('all');
  const [anonymousFilter, setAnonymousFilter] = useState<'all' | 'anonymous_only' | 'named_only'>(
    'all'
  );
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // 1초 setTick (만료 카운트다운)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo<LoadAllDonationsFilters>(
    () => ({
      statuses: statusFilter === 'all' ? undefined : [statusFilter],
      anonymousFilter,
      search: searchDebounced || undefined,
      sortOrder: 'newest',
    }),
    [statusFilter, anonymousFilter, searchDebounced]
  );

  const reload = async () => {
    try {
      setError(null);
      const data = await loadAllDonations(filters);
      setDonations(data);
    } catch (e) {
      console.error('[AdminDonations]', e);
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, anonymousFilter, searchDebounced]);

  useEffect(() => {
    const cleanup = subscribeDonationsAdmin(() => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // 요약
  const pendingCount = donations.filter((d) => d.payment_status === 'pending').length;
  const paidTotal = donations
    .filter((d) => d.payment_status === 'paid')
    .reduce((s, d) => s + d.amount, 0);
  const pendingTotal = donations
    .filter((d) => d.payment_status === 'pending')
    .reduce((s, d) => s + d.amount, 0);

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>💚 기부 관리</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        자발적 기부 신청 현황 및 입금 확인. 입금 확인 시 인증서가 자동 발급되고 이메일이 발송됩니다.
      </p>

      {/* 필터 */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <Field label="상태">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EsgDonationStatus | 'all')}
              style={inputStyle}
            >
              <option value="all">전체</option>
              <option value="pending">⏰ 입금 대기</option>
              <option value="paid">✅ 기부 완료</option>
              <option value="expired">⌛ 만료</option>
              <option value="cancelled">🚫 취소</option>
            </select>
          </Field>
          <Field label="익명 여부">
            <select
              value={anonymousFilter}
              onChange={(e) =>
                setAnonymousFilter(e.target.value as 'all' | 'anonymous_only' | 'named_only')
              }
              style={inputStyle}
            >
              <option value="all">전체</option>
              <option value="anonymous_only">🕶 익명만</option>
              <option value="named_only">실명만</option>
            </select>
          </Field>
          <Field label="검색 (번호/이름/이메일/입금자명)">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="DON-260530-0001 또는 홍길동"
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {/* 요약 */}
      {!loading && donations.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <SummaryChip label="결과" value={`${donations.length}건`} />
          {pendingCount > 0 && (
            <SummaryChip
              label="⏰ 입금 대기"
              value={`${pendingCount}건 · ${pendingTotal.toLocaleString()}원`}
              color="#92400e"
              bg="#fef3c7"
            />
          )}
          <SummaryChip
            label="✅ 확정 모금액"
            value={`${paidTotal.toLocaleString()}원`}
            color="#166534"
            bg="#dcfce7"
          />
        </div>
      )}

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : donations.length === 0 ? (
        <EmptyBox />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {donations.map((d) => (
            <DonationCard key={d.id} donation={d} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 개별 카드
// ============================================================================

function DonationCard({ donation, onChange }: { donation: EsgDonationRow; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [editingMemo, setEditingMemo] = useState(false);
  const [memo, setMemo] = useState(donation.admin_memo ?? '');
  const [editingPayer, setEditingPayer] = useState(false);
  const [payerName, setPayerName] = useState(donation.payer_name ?? '');
  const statusColor = STATUS_COLORS[donation.payment_status];

  const handlePaid = async () => {
    if (!payerName.trim()) {
      alert('입금자명을 확인 후 처리해 주세요.');
      return;
    }
    if (
      !confirm(
        `[${donation.donation_number}] ${donation.amount.toLocaleString()}원 입금 확인합니다.\n\n` +
          `입금자명: ${payerName}\n\n` +
          `확인 시 인증서가 자동 발급되고 이메일이 발송됩니다. 진행하시겠습니까?`
      )
    )
      return;
    setBusy(true);
    try {
      await markDonationPaid(donation.id, payerName.trim(), memo || undefined);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    const reason = prompt('취소 사유를 입력하세요 (예: 입금 미확인, 중복 신청 등):');
    if (!reason) return;
    setBusy(true);
    try {
      await cancelDonationAdmin(donation.id, reason);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMemo = async () => {
    setBusy(true);
    try {
      await updateAdminMemo(donation.id, memo);
      setEditingMemo(false);
      onChange();
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '3px 10px',
            background: statusColor.bg,
            color: statusColor.color,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {STATUS_LABELS[donation.payment_status]}
        </span>
        <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
          {donation.donation_number}
        </span>
        {donation.is_anonymous && (
          <span
            style={{
              padding: '3px 8px',
              background: '#f0f9ff',
              color: '#0c4a6e',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            🕶 익명 표시
          </span>
        )}
        <span style={{ fontSize: 11, color: '#aaa', marginLeft: 'auto' }}>
          {fmtKstShort(donation.created_at)}
        </span>
      </div>

      {/* 본문 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>
            {donation.amount.toLocaleString()}원
          </div>
          <div style={{ fontSize: 13 }}>
            <strong>{donation.user_name_snapshot}</strong>
            {donation.user_dept_snapshot && (
              <span style={{ color: '#666' }}> · {donation.user_dept_snapshot}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>{donation.user_email}</div>
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>입금자명 (편집 가능)</div>
          {donation.payment_status === 'pending' && editingPayer ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
              />
              <button
                type="button"
                onClick={() => setEditingPayer(false)}
                style={{ ...miniBtn('default', false), padding: '4px 8px' }}
              >
                ✓
              </button>
            </div>
          ) : (
            <div
              onClick={() => donation.payment_status === 'pending' && setEditingPayer(true)}
              style={{
                fontSize: 13,
                fontWeight: 600,
                cursor: donation.payment_status === 'pending' ? 'pointer' : 'default',
                color: donation.payer_name ? '#222' : '#aaa',
              }}
            >
              {donation.payer_name ?? '(미입력 - 클릭하여 편집)'}
            </div>
          )}
        </div>
      </div>

      {/* 메시지 */}
      {donation.message && (
        <div
          style={{
            padding: 10,
            background: '#f9fafb',
            borderLeft: '3px solid #16a34a',
            fontSize: 12,
            color: '#555',
            marginBottom: 8,
            lineHeight: 1.6,
          }}
        >
          💬 {donation.message}
        </div>
      )}

      {/* 어드민 메모 */}
      <div
        style={{
          padding: 10,
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 6,
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <strong style={{ color: '#92400e' }}>📝 어드민 메모</strong>
          {!editingMemo && (
            <button
              type="button"
              onClick={() => setEditingMemo(true)}
              style={{ ...miniBtn('default', false), marginLeft: 'auto' }}
            >
              ✏️ {donation.admin_memo ? '수정' : '추가'}
            </button>
          )}
        </div>
        {editingMemo ? (
          <div>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              style={{ ...inputStyle, fontSize: 12, marginBottom: 4 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={handleSaveMemo} disabled={busy} style={miniBtn('primary', busy)}>
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setMemo(donation.admin_memo ?? '');
                  setEditingMemo(false);
                }}
                style={miniBtn('default', false)}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div style={{ color: donation.admin_memo ? '#222' : '#888' }}>
            {donation.admin_memo ?? '(메모 없음)'}
          </div>
        )}
      </div>

      {/* 액션 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {donation.payment_status === 'pending' && (
          <>
            <button type="button" onClick={handlePaid} disabled={busy} style={actionBtn('success', busy)}>
              ✅ 입금 확인
            </button>
            <button type="button" onClick={handleCancel} disabled={busy} style={actionBtn('danger', busy)}>
              🚫 강제 취소
            </button>
          </>
        )}
        {donation.payment_status === 'paid' && (
          <Link
            to={`/donate/${donation.id}/certificate`}
            target="_blank"
            style={{
              padding: '8px 14px',
              background: '#fff',
              border: '1px solid #16a34a',
              color: '#16a34a',
              borderRadius: 4,
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            📜 인증서 보기
          </Link>
        )}
        {donation.cancelled_reason && (
          <span style={{ fontSize: 11, color: '#888', alignSelf: 'center' }}>
            취소 사유: {donation.cancelled_reason}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// UI 헬퍼
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

const actionBtn = (variant: 'success' | 'danger', disabled: boolean): React.CSSProperties => {
  const c = variant === 'success'
    ? { bg: '#16a34a', color: '#fff' }
    : { bg: '#fff', color: '#dc2626', border: '#fecaca' };
  return {
    padding: '8px 14px',
    background: c.bg,
    color: c.color,
    border: variant === 'danger' ? `1px solid ${c.border}` : 'none',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    fontWeight: 600,
  };
};

const miniBtn = (
  variant: 'default' | 'primary' | 'danger',
  disabled: boolean
): React.CSSProperties => {
  const colors = {
    default: { border: '#ddd', color: '#666' },
    primary: { border: '#111', color: '#111' },
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
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

function EmptyBox() {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 48,
        textAlign: 'center',
        border: '1px dashed #ddd',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>💚</div>
      <p style={{ margin: 0, color: '#888' }}>조건에 맞는 기부 내역이 없습니다.</p>
    </div>
  );
}
