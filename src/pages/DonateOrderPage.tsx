// ============================================================================
// CHANGELOG
//   2026-06-04
//     - [정책변경] 기부 신청 후 본인 취소 기능 제거. 입금기한 초과 시 자동 만료
//         (expired) 처리되므로 사용자가 임의 취소할 수 없도록 함.
//         (어드민 취소는 유지 — cancelDonationAdmin)
// ============================================================================
// ============================================================================
// DonateOrderPage — 기부 입금 안내 / 결제 완료 페이지
//
// 상태별 화면:
//   - pending: 계좌 안내 + 카운트다운 (본인 취소 불가 — 기한 초과 시 자동 만료)
//   - paid: 결제 완료 + 인증서 보기 버튼
//   - expired: 만료 안내 + 다시 기부하기
//   - cancelled: 취소 안내 (어드민 취소 등)
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  loadDonation,
  getDonationTimeLeft,
  subscribeMyDonations,
} from '@/lib/donations';
import { formatTimeLeft, formatKstEndDate } from '@/lib/orders';
import { loadSetting } from '@/lib/settings';
import type { EsgDonationRow } from '@/types/esg';

export function DonateOrderPage() {
  const { id } = useParams();
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();

  const [donation, setDonation] = useState<EsgDonationRow | null>(null);
  const [bankInfo, setBankInfo] = useState<{
    bank: string;
    account: string;
    holder: string;
    memo?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const reload = async () => {
    if (!id) return;
    try {
      setError(null);
      const [d, b] = await Promise.all([loadDonation(id), loadSetting('bank_account_info')]);
      setDonation(d);
      setBankInfo((b ?? null) as typeof bankInfo);
    } catch (e) {
      console.error('[DonateOrderPage] load:', e);
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Realtime - 어드민이 입금 확인 시 자동 갱신
  useEffect(() => {
    if (!currentUser) return;
    const cleanup = subscribeMyDonations(currentUser.id, () => {
      void reload();
    });
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 카운트다운
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }
  if (error || !donation) {
    return (
      <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
        ⚠️ {error ?? '기부 정보를 찾을 수 없습니다.'}
      </div>
    );
  }

  const timeLeftMs = getDonationTimeLeft(donation.expires_at);
  const isExpired = donation.payment_status === 'expired' || timeLeftMs <= 0;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
      <h1 style={{ margin: '0 0 16px' }}>💚 기부 상세</h1>

      {/* 상태 배지 */}
      <StatusBadge status={donation.payment_status} isExpired={isExpired} />

      {/* 기본 정보 */}
      <section style={sectionStyle}>
        <InfoRow label="기부 번호" value={donation.donation_number} />
        <InfoRow label="기부자" value={donation.is_anonymous ? `${donation.user_name_snapshot} (익명 표시)` : donation.user_name_snapshot} />
        <InfoRow label="금액" value={`${donation.amount.toLocaleString()}원`} bold />
        <InfoRow label="입금자명" value={donation.payer_name ?? '-'} />
        {donation.message && <InfoRow label="응원 메시지" value={donation.message} />}
      </section>

      {/* 상태별 UI */}
      {donation.payment_status === 'pending' && !isExpired && bankInfo && (
        <BankAccountGuide bankInfo={bankInfo} donation={donation} timeLeftMs={timeLeftMs} />
      )}

      {donation.payment_status === 'paid' && (
        <PaidSuccess donation={donation} navigate={navigate} />
      )}

      {isExpired && donation.payment_status !== 'paid' && (
        <div
          style={{
            ...sectionStyle,
            background: '#f0f0f0',
            color: '#666',
            textAlign: 'center',
            padding: 24,
          }}
        >
          ⌛ 입금 기한이 초과되어 기부 신청이 자동 취소되었습니다.
          <div style={{ marginTop: 12 }}>
            <Link
              to="/donate"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: '#16a34a',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 13,
              }}
            >
              💚 다시 기부하기
            </Link>
          </div>
        </div>
      )}

      {donation.payment_status === 'cancelled' && (
        <div
          style={{
            ...sectionStyle,
            background: '#f0f0f0',
            color: '#666',
            textAlign: 'center',
            padding: 24,
          }}
        >
          🚫 취소된 기부입니다.
          {donation.cancelled_reason && (
            <div style={{ fontSize: 12, marginTop: 8 }}>사유: {donation.cancelled_reason}</div>
          )}
        </div>
      )}

    </div>
  );
}

// ============================================================================
// 상태 배지
// ============================================================================

function StatusBadge({ status, isExpired }: { status: string; isExpired: boolean }) {
  const effective = isExpired && status === 'pending' ? 'expired' : status;
  const map: Record<string, { label: string; bg: string; color: string; icon: string }> = {
    pending: { label: '입금 대기', bg: '#fef3c7', color: '#92400e', icon: '⏰' },
    paid: { label: '기부 완료', bg: '#dcfce7', color: '#166534', icon: '✅' },
    expired: { label: '만료', bg: '#f0f0f0', color: '#666', icon: '⌛' },
    cancelled: { label: '취소됨', bg: '#fee2e2', color: '#991b1b', icon: '🚫' },
  };
  const m = map[effective] ?? map.pending;
  return (
    <div
      style={{
        padding: '8px 16px',
        background: m.bg,
        color: m.color,
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 700,
        display: 'inline-block',
        marginBottom: 12,
      }}
    >
      {m.icon} {m.label}
    </div>
  );
}

// ============================================================================
// 입금 안내
// ============================================================================

function BankAccountGuide({
  bankInfo,
  donation,
  timeLeftMs,
}: {
  bankInfo: { bank: string; account: string; holder: string; memo?: string };
  donation: EsgDonationRow;
  timeLeftMs: number;
}) {
  return (
    <>
      <section style={sectionStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>🏦 입금 계좌</h3>
        <InfoRow label="은행" value={bankInfo.bank} />
        <InfoRow label="계좌번호" value={bankInfo.account} bold />
        <InfoRow label="예금주" value={bankInfo.holder} />
        <InfoRow label="입금 금액" value={`${donation.amount.toLocaleString()}원`} bold highlight />
        <InfoRow label="입금자명" value={donation.payer_name ?? '-'} highlight />
        {bankInfo.memo && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 8, padding: 8, background: '#f9fafb', borderRadius: 4 }}>
            💡 {bankInfo.memo}
          </div>
        )}
      </section>

      {/* 카운트다운 */}
      <div
        style={{
          padding: 12,
          background: timeLeftMs < 3600 * 1000 ? '#fee2e2' : '#fef3c7',
          color: timeLeftMs < 3600 * 1000 ? '#991b1b' : '#92400e',
          borderRadius: 8,
          fontSize: 13,
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
          {formatKstEndDate(donation.expires_at)}
        </div>
        ⏰ 입금 기한: <strong>{formatTimeLeft(timeLeftMs)}</strong> 남음
        <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
          오늘 23:59까지 미입금 시 자동 취소됩니다.
        </div>
      </div>

      <div
        style={{
          padding: 12,
          background: '#f0f9ff',
          color: '#0c4a6e',
          borderRadius: 8,
          fontSize: 12,
          marginBottom: 16,
          lineHeight: 1.6,
        }}
      >
        💡 입금 확인은 관리자가 영업일 기준 1~2일 내 처리합니다. 확인 즉시 이메일로 인증서가 발송됩니다.
      </div>
    </>
  );
}

// ============================================================================
// 결제 완료
// ============================================================================

function PaidSuccess({
  donation,
  navigate,
}: {
  donation: EsgDonationRow;
  navigate: (path: string) => void;
}) {
  return (
    <section
      style={{
        ...sectionStyle,
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
      <h2 style={{ margin: '0 0 8px', color: '#166534' }}>기부가 확인되었습니다</h2>
      <p style={{ color: '#15803d', margin: '0 0 16px', fontSize: 13 }}>
        {donation.user_name_snapshot}님의 따뜻한 마음에 감사드립니다 💚
      </p>
      <button
        type="button"
        onClick={() => navigate(`/donate/${donation.id}/certificate`)}
        style={{
          padding: '12px 24px',
          background: '#16a34a',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        📜 인증서 보기 / 다운로드
      </button>
    </section>
  );
}

// ============================================================================
// 공통 UI
// ============================================================================

const sectionStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
};

function InfoRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '8px 0',
        borderBottom: '1px solid #f5f5f5',
        fontSize: 13,
      }}
    >
      <span style={{ width: 100, color: '#888', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: highlight ? '#16a34a' : '#222',
          fontWeight: bold ? 700 : 400,
          fontSize: bold ? 15 : 13,
        }}
      >
        {value}
      </span>
    </div>
  );
}
