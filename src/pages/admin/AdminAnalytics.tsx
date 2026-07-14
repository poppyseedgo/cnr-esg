// ============================================================================
// AdminAnalytics — 방문/이벤트 통계 (기간 지정)                 // ← [2026-07-14]
//
// 무엇을 보여주나:
//   · 방문   : 총 페이지뷰 / 순 방문자 / 로그인·비로그인 / 세션 / 일자별 / 경로별
//   · 이벤트 : 기간 내 주문(유형×상태) / 입찰 / 기부 / 물품접수 / 게시글 / 댓글
//
// 기간:
//   기본값은 설정(activity_periods.bazaar)의 바자회 기간을 그대로 사용한다.
//   날짜 입력은 KST 기준(YYYY-MM-DD), 서버에는 UTC ISO 로 [from, to) 반환.
//   (to = 종료일 다음날 00:00 KST → 종료일 하루가 온전히 포함)
//
// 주의:
//   방문 로그는 이 기능 배포 시점부터 쌓인다. 배포 이전 기간은 GA4 를 봐야 한다.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadVisitStats, loadEventStats, type VisitStats, type EventStats } from '@/lib/adminAnalytics';
import { useEventPhase } from '@/hooks/useEventPhase';
import { downloadCsv, todayStampKst } from '@/utils/csv';
import { PAYMENT_STATUS_LABELS } from '@/lib/orders';
import type { EsgPaymentStatus } from '@/types/esg';

const won = (n: number) => n.toLocaleString('ko-KR');

/** KST 날짜(YYYY-MM-DD) → UTC ISO. dayOffset=1 이면 다음날 00:00 KST */
function kstDateToUtcIso(d: string, dayOffset = 0): string {
  const [y, m, day] = d.split('-').map(Number);
  // KST 00:00 = UTC 전날 15:00 → Date.UTC 로 만들고 9시간 뺀다
  const ms = Date.UTC(y, m - 1, day + dayOffset, 0, 0, 0) - 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

/** UTC ISO → KST 날짜(YYYY-MM-DD) */
function utcIsoToKstDate(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}`;
}

const todayKst = (): string => {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}`;
};

const TYPE_LABEL: Record<string, string> = { bazaar: '바자회', auction: '경매', goods: '굿즈' };

export function AdminAnalytics() {
  const { activityPeriods } = useEventPhase();
  const bazaar = activityPeriods?.bazaar;

  const [from, setFrom] = useState<string>(todayKst());
  const [to, setTo] = useState<string>(todayKst());
  const [initialized, setInitialized] = useState(false);

  const [visits, setVisits] = useState<VisitStats | null>(null);
  const [events, setEvents] = useState<EventStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 설정이 로드되면 기본 기간 = 바자회 기간
  useEffect(() => {
    if (initialized || !bazaar) return;
    setFrom(utcIsoToKstDate(bazaar.starts_at_utc));
    setTo(utcIsoToKstDate(bazaar.ends_at_utc));
    setInitialized(true);
  }, [bazaar, initialized]);

  const range = useMemo(
    () => ({ fromIso: kstDateToUtcIso(from), toIso: kstDateToUtcIso(to, 1) }), // [from 00:00, to+1 00:00)
    [from, to]
  );

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [v, e] = await Promise.all([
        loadVisitStats(range.fromIso, range.toIso),
        loadEventStats(range.fromIso, range.toIso),
      ]);
      setVisits(v);
      setEvents(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : '통계를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [range.fromIso, range.toIso]);

  useEffect(() => {
    if (!initialized && bazaar) return; // 기본 기간 세팅 대기
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, range.fromIso, range.toIso]);

  const applyBazaarPeriod = () => {
    if (!bazaar) return;
    setFrom(utcIsoToKstDate(bazaar.starts_at_utc));
    setTo(utcIsoToKstDate(bazaar.ends_at_utc));
  };
  const applyRecent = (days: number) => {
    const end = todayKst();
    const start = utcIsoToKstDate(new Date(Date.now() - (days - 1) * 86400000).toISOString());
    setFrom(start);
    setTo(end);
  };

  // ── CSV ────────────────────────────────────────────────────────────────
  const exportDailyCsv = () => {
    if (!visits) return;
    downloadCsv(
      `방문통계_일자별_${from}_${to}_${todayStampKst()}.csv`,
      ['날짜(KST)', '페이지뷰', '순 방문자'],
      visits.by_day.map((r) => [r.d, r.page_views, r.visitors])
    );
  };
  const exportPathCsv = () => {
    if (!visits) return;
    downloadCsv(
      `방문통계_경로별_${from}_${to}_${todayStampKst()}.csv`,
      ['경로', '페이지뷰', '순 방문자'],
      visits.by_path.map((r) => [r.path, r.page_views, r.visitors])
    );
  };
  const exportEventCsv = () => {
    if (!events) return;
    const rows: (string | number)[][] = events.orders.map((r) => [
      '주문',
      `${TYPE_LABEL[r.order_type] ?? r.order_type} · ${PAYMENT_STATUS_LABELS[r.payment_status as EsgPaymentStatus] ?? r.payment_status}`,
      r.cnt,
      r.amount,
    ]);
    rows.push(['주문', '합계(전 유형·전 상태)', events.orders_total, events.orders.reduce((s, r) => s + r.amount, 0)]);
    rows.push(['경매', '입찰', events.bids, '']);
    rows.push(['경매', '입찰 참여자(순)', events.bidders, '']);
    rows.push(['기부', '기부 신청', events.donations, '']);
    rows.push(['기부', '기부 입금완료', events.donations_paid, events.donations_paid_amount]);
    rows.push(['바자회', '물품 접수(건)', events.intake_items, '']);
    rows.push(['바자회', '물품 접수(수량)', events.intake_qty, '']);
    rows.push(['커뮤니티', '게시글', events.posts, '']);
    rows.push(['커뮤니티', '댓글', events.comments, '']);
    downloadCsv(
      `이벤트통계_${from}_${to}_${todayStampKst()}.csv`,
      ['구분', '항목', '건수', '금액'],
      rows
    );
  };

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 10px', fontSize: 13, color: '#111', borderBottom: '1px solid #f3f4f6' };
  const btn: React.CSSProperties = { padding: '8px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#333', whiteSpace: 'nowrap' };
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 };

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>📈 방문 / 이벤트 통계</h2>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
        기간을 지정해 방문자·페이지뷰와 실제 발생한 이벤트(주문·입찰·기부 등)를 확인합니다.
        방문 로그는 이 기능 배포 시점부터 수집됩니다(그 이전은 GA4 참고).
      </p>

      {/* 기간 */}
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666', fontWeight: 600 }}>
          시작 (KST)
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#666', fontWeight: 600 }}>
          종료 (KST · 포함)
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
        </label>
        <button type="button" onClick={applyBazaarPeriod} disabled={!bazaar} style={btn}>바자회 기간</button>
        <button type="button" onClick={() => applyRecent(7)} style={btn}>최근 7일</button>
        <button type="button" onClick={() => applyRecent(30)} style={btn}>최근 30일</button>
        <button type="button" onClick={() => void run()} style={{ ...btn, background: '#111', color: '#fff', borderColor: '#111' }}>
          {loading ? '조회 중…' : '조회'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 14, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>⚠️ {error}</div>
      )}

      {/* 방문 KPI */}
      {visits && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>👣 방문</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button type="button" onClick={exportDailyCsv} style={btn}>⬇ CSV (일자별)</button>
              <button type="button" onClick={exportPathCsv} style={btn}>⬇ CSV (경로별)</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Kpi label="순 방문자" value={`${won(visits.unique_visitors)}명`} big />
            <Kpi label="페이지뷰" value={`${won(visits.page_views)}회`} big />
            <Kpi label="로그인 방문자" value={`${won(visits.logged_in_visitors)}명`} />
            <Kpi label="비로그인 세션" value={`${won(visits.anon_visitors)}개`} />
            <Kpi label="세션" value={`${won(visits.sessions)}개`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>일자별</div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>날짜</th><th style={{ ...th, textAlign: 'right' }}>PV</th><th style={{ ...th, textAlign: 'right' }}>방문자</th></tr></thead>
                  <tbody>
                    {visits.by_day.length === 0 ? (
                      <tr><td style={{ ...td, color: '#999' }} colSpan={3}>데이터 없음</td></tr>
                    ) : visits.by_day.map((r) => (
                      <tr key={r.d}>
                        <td style={td}>{r.d}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{won(r.page_views)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{won(r.visitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>경로별 (상위 100)</div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>경로</th><th style={{ ...th, textAlign: 'right' }}>PV</th><th style={{ ...th, textAlign: 'right' }}>방문자</th></tr></thead>
                  <tbody>
                    {visits.by_path.length === 0 ? (
                      <tr><td style={{ ...td, color: '#999' }} colSpan={3}>데이터 없음</td></tr>
                    ) : visits.by_path.map((r) => (
                      <tr key={r.path}>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{r.path}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{won(r.page_views)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{won(r.visitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 이벤트 */}
      {events && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>⚡ 이벤트 발생 수</h3>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>· 기간 내 생성 기준</span>
            <div style={{ marginLeft: 'auto' }}>
              <button type="button" onClick={exportEventCsv} style={btn}>⬇ CSV (이벤트)</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            <Kpi label="주문" value={`${won(events.orders_total)}건`} big />
            <Kpi label="입찰" value={`${won(events.bids)}회`} big />
            <Kpi label="입찰 참여자" value={`${won(events.bidders)}명`} />
            <Kpi label="기부(입금완료)" value={`${won(events.donations_paid)}건`} />
            <Kpi label="물품 접수" value={`${won(events.intake_items)}건`} />
            <Kpi label="게시글 / 댓글" value={`${won(events.posts)} / ${won(events.comments)}`} />
          </div>

          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 6 }}>주문 — 유형 × 상태</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>유형</th>
                <th style={th}>상태</th>
                <th style={{ ...th, textAlign: 'right' }}>건수</th>
                <th style={{ ...th, textAlign: 'right' }}>금액</th>
              </tr>
            </thead>
            <tbody>
              {events.orders.length === 0 ? (
                <tr><td style={{ ...td, color: '#999' }} colSpan={4}>데이터 없음</td></tr>
              ) : events.orders.map((r) => (
                <tr key={`${r.order_type}-${r.payment_status}`}>
                  <td style={td}>{TYPE_LABEL[r.order_type] ?? r.order_type}</td>
                  <td style={td}>{PAYMENT_STATUS_LABELS[r.payment_status as EsgPaymentStatus] ?? r.payment_status}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{won(r.cnt)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{won(r.amount)}원</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ margin: '12px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>
            · 순 방문자는 로그인 사용자 ID(있으면) 또는 브라우저별 비식별 ID 기준입니다. 같은 사람이 로그인 전·후로 각각 잡힐 수 있어 실제보다 크게 나올 수 있습니다(상한값).
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 17, fontWeight: 700, color: '#111' }}>{value}</div>
    </div>
  );
}
