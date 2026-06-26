// ============================================================================
// AdminPresale — 선구매(선판매) 관리 페이지
//
// 변경 이력:
//   2026-06-26  최초 작성 — 선구매 정책/자격 관리
//
// 블록:
//   (A) 판매 타임라인 — 현재 단계(선판매전/선판매/공개/종료) 배지 + 경계 시각
//   (B) 공개 판매 시작 시각 편집 (KST 입력 → UTC 저장, 범위 검증)
//   (C) 비상 구매 중단 토글 (purchase_enabled)
//   (D) 선구매 자격자 명단 — 물품 기부자 OR 기부금 입금확인자 (검색 / CSV / 사유 배지)
//
// 정책 SSOT 재사용: resolveWindow(bazaarSalePolicy)로 타임라인 판정 → 사용자 화면과 1:1.
// 자격 SSOT: esg_admin_list_presale_eligible RPC(서버 esg_is_presale_eligible와 동일 기준).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import {
  loadAllSettings,
  updateSetting,
  subscribeSettings,
  kstInputToUtcIso,
  utcIsoToKstInput,
} from '@/lib/settings';
import { resolveWindow, type BazaarSaleWindow } from '@/lib/bazaarSalePolicy';
import { loadPresaleEligible, type EsgPresaleEligibleRow } from '@/lib/adminPresale';
import { formatKSTFull } from '@/utils/time';
import type { EsgSettingsValueMap } from '@/types/esg';

const WINDOW_LABEL: Record<BazaarSaleWindow, { text: string; bg: string; color: string }> = {
  loading: { text: '정책 미구성', bg: '#f0f0f0', color: '#666' },
  before: { text: '선판매 전 (구경만)', bg: '#fef3c7', color: '#92400e' },
  presale: { text: '선판매 중 (자격자만)', bg: '#dbeafe', color: '#1e40af' },
  public: { text: '공개 판매 중 (전 직원)', bg: '#dcfce7', color: '#166534' },
  ended: { text: '종료', bg: '#f0f0f0', color: '#666' },
};

export function AdminPresale() {
  const [settings, setSettings] = useState<Partial<EsgSettingsValueMap>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 시간 경계 재평가용 30초 틱
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const reload = async () => {
    try {
      setError(null);
      const data = await loadAllSettings();
      setSettings(data);
    } catch (e) {
      console.error('[AdminPresale] load settings:', e);
      setError(e instanceof Error ? e.message : '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);
  useEffect(() => subscribeSettings(() => void reload()), []);

  // ── 경계값 ────────────────────────────────────────────────────────────────
  const presaleStartUtc = settings.activity_periods?.bazaar?.starts_at_utc ?? null;
  const endUtc = settings.activity_periods?.bazaar?.ends_at_utc ?? null;
  const publicStartUtc = settings.bazaar_public_sale_starts_at ?? null;
  const purchaseEnabled = settings.purchase_enabled !== false;

  const toMs = (s: string | null) => (s ? new Date(s).getTime() : null);
  const window: BazaarSaleWindow = resolveWindow({
    nowMs: Date.now(),
    presaleStartMs: toMs(presaleStartUtc),
    publicStartMs: toMs(publicStartUtc),
    endMs: toMs(endUtc),
  });

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: '#b91c1c' }}>{error}</div>;
  }

  return (
    <div style={{ maxWidth: 1024, margin: '0 auto', padding: '8px 0 64px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>🎫 선구매 관리</h1>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          선판매 구간엔 <b>선구매 자격자</b>(물품 기부자 · 기부금 입금확인자)만 구매할 수 있고, 공개일부터 전 직원이 구매할 수 있습니다.
        </p>
      </header>

      <TimelineBlock window={window} presaleStartUtc={presaleStartUtc} publicStartUtc={publicStartUtc} endUtc={endUtc} />

      <PublicStartBlock
        publicStartUtc={publicStartUtc}
        presaleStartUtc={presaleStartUtc}
        endUtc={endUtc}
        onSaved={reload}
      />

      <EmergencyToggleBlock purchaseEnabled={purchaseEnabled} onSaved={reload} />

      <EligibleListBlock />
    </div>
  );
}

// ── (A) 타임라인 ──────────────────────────────────────────────────────────────
function TimelineBlock({
  window,
  presaleStartUtc,
  publicStartUtc,
  endUtc,
}: {
  window: BazaarSaleWindow;
  presaleStartUtc: string | null;
  publicStartUtc: string | null;
  endUtc: string | null;
}) {
  const w = WINDOW_LABEL[window];
  const Row = ({ label, utc }: { label: string; utc: string | null }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f0f0f0', fontSize: 14 }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{utc ? formatKSTFull(utc) : '—'}</span>
    </div>
  );
  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h2 style={h2}>판매 단계</h2>
        <span style={{ padding: '4px 12px', borderRadius: 999, background: w.bg, color: w.color, fontSize: 13, fontWeight: 600 }}>
          {w.text}
        </span>
      </div>
      <Row label="선판매 시작 (자격자)" utc={presaleStartUtc} />
      <Row label="공개 판매 시작 (전 직원)" utc={publicStartUtc} />
      <Row label="바자회 종료" utc={endUtc} />
    </section>
  );
}

// ── (B) 공개 판매 시작 시각 편집 ──────────────────────────────────────────────
function PublicStartBlock({
  publicStartUtc,
  presaleStartUtc,
  endUtc,
  onSaved,
}: {
  publicStartUtc: string | null;
  presaleStartUtc: string | null;
  endUtc: string | null;
  onSaved: () => void;
}) {
  const [input, setInput] = useState(publicStartUtc ? utcIsoToKstInput(publicStartUtc) : '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setInput(publicStartUtc ? utcIsoToKstInput(publicStartUtc) : '');
  }, [publicStartUtc]);

  const save = async () => {
    setMsg(null);
    if (!input) {
      setMsg('공개 시작 시각을 입력하세요.');
      return;
    }
    const iso = kstInputToUtcIso(input); // KST 입력 → UTC ISO
    // 범위 검증: 선판매 시작 < 공개 시작 < 종료
    const t = new Date(iso).getTime();
    if (presaleStartUtc && t <= new Date(presaleStartUtc).getTime()) {
      setMsg('공개 시작은 선판매 시작 이후여야 합니다.');
      return;
    }
    if (endUtc && t >= new Date(endUtc).getTime()) {
      setMsg('공개 시작은 바자회 종료 이전이어야 합니다.');
      return;
    }
    try {
      setSaving(true);
      await updateSetting('bazaar_public_sale_starts_at', iso as never);
      setMsg('저장되었습니다. (사용자에게 즉시 반영)');
      onSaved();
    } catch (e) {
      console.error('[AdminPresale] save public start:', e);
      setMsg(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={card}>
      <h2 style={h2}>공개 판매 시작 시각 (KST)</h2>
      <p style={{ margin: '0 0 12px', color: '#666', fontSize: 13 }}>
        이 시각부터 전 직원 구매가 열립니다. 이 시각 이전(선판매 구간)엔 자격자만 구매할 수 있습니다.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="datetime-local"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#0f2e20', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {publicStartUtc && (
          <span style={{ color: '#888', fontSize: 13 }}>현재: {formatKSTFull(publicStartUtc)}</span>
        )}
      </div>
      {msg && <p style={{ margin: '10px 0 0', fontSize: 13, color: msg.includes('저장되었') ? '#166534' : '#b91c1c' }}>{msg}</p>}
    </section>
  );
}

// ── (C) 비상 구매 중단 토글 ───────────────────────────────────────────────────
function EmergencyToggleBlock({ purchaseEnabled, onSaved }: { purchaseEnabled: boolean; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !purchaseEnabled;
    const ok = window.confirm(
      next
        ? '구매를 다시 허용합니다. 계속할까요?'
        : '⚠️ 모든 구매를 즉시 중단합니다 (어드민 포함). 계속할까요?'
    );
    if (!ok) return;
    try {
      setSaving(true);
      await updateSetting('purchase_enabled', next as never);
      onSaved();
    } catch (e) {
      console.error('[AdminPresale] toggle purchase_enabled:', e);
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={card}>
      <h2 style={h2}>비상 구매 중단</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, color: '#666', fontSize: 13, maxWidth: 640 }}>
          켜면 자격·기간과 무관하게 <b>전원(어드민 포함) 구매가 즉시 차단</b>됩니다. 장애·재고 사고 등 비상시에만 사용하세요.
        </p>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 600,
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap',
            background: purchaseEnabled ? '#fee2e2' : '#dcfce7',
            color: purchaseEnabled ? '#b91c1c' : '#166534',
          }}
        >
          {purchaseEnabled ? '구매 중단하기' : '구매 재개하기'}
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 13 }}>
        현재 상태:{' '}
        <b style={{ color: purchaseEnabled ? '#166534' : '#b91c1c' }}>
          {purchaseEnabled ? '구매 허용 중' : '구매 중단 중'}
        </b>
      </div>
    </section>
  );
}

// ── (D) 자격자 명단 ───────────────────────────────────────────────────────────
function EligibleListBlock() {
  const [rows, setRows] = useState<EsgPresaleEligibleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const reload = async () => {
    try {
      setErr(null);
      setLoading(true);
      setRows(await loadPresaleEligible());
    } catch (e) {
      console.error('[AdminPresale] load eligible:', e);
      setErr(e instanceof Error ? e.message : '명단을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => void reload(), []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return rows;
    return rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(kw) ||
        r.email?.toLowerCase().includes(kw) ||
        (r.dept ?? '').toLowerCase().includes(kw)
    );
  }, [rows, q]);

  const exportCsv = () => {
    const header = ['이름', '부서', '이메일', '물품기부', '기부금입금'];
    const lines = filtered.map((r) => [
      r.name ?? '',
      r.dept ?? '',
      r.email ?? '',
      r.is_item_donor ? 'O' : '',
      r.is_paid_donor ? 'O' : '',
    ]);
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }); // BOM: 엑셀 한글 깨짐 방지
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `선구매_자격자_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ ...h2, margin: 0 }}>
          선구매 자격자 명단 <span style={{ color: '#888', fontWeight: 400, fontSize: 14 }}>({filtered.length}명)</span>
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·부서·이메일 검색"
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, minWidth: 200 }}
          />
          <button type="button" onClick={exportCsv} style={ghostBtn}>CSV 내보내기</button>
          <button type="button" onClick={reload} style={ghostBtn}>새로고침</button>
        </div>
      </div>

      <p style={{ margin: '0 0 12px', color: '#888', fontSize: 13 }}>
        자격은 <b>물품 기부 접수</b> 또는 <b>기부금 입금확인(paid)</b>에서 자동 산출됩니다. 물품 접수는 ‘물품 접수’,
        기부금 입금확인은 ‘주문/입금확인 · 기부 관리’에서 처리하면 이 명단에 즉시 반영됩니다.
      </p>

      {err && <p style={{ color: '#b91c1c', fontSize: 14 }}>{err}</p>}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>자격자가 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#666', borderBottom: '2px solid #eee' }}>
                <th style={th}>이름</th>
                <th style={th}>부서</th>
                <th style={th}>이메일</th>
                <th style={th}>자격 사유</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.user_id} style={{ borderBottom: '1px solid #f3f3f3' }}>
                  <td style={td}><b>{r.name}</b></td>
                  <td style={td}>{r.dept ?? '—'}</td>
                  <td style={{ ...td, color: '#666' }}>{r.email}</td>
                  <td style={td}>
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      {r.is_item_donor && <Badge bg="#dbeafe" color="#1e40af">물품 기부</Badge>}
                      {r.is_paid_donor && <Badge bg="#dcfce7" color="#166534">기부금 입금</Badge>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Badge({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, background: bg, color, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '20px 24px' };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 17 };
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
const ghostBtn: React.CSSProperties = { padding: '8px 14px', border: '1px solid #ddd', borderRadius: 8, background: '#fff', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' };
