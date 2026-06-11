// ============================================================================
// AdminSettings — 이벤트 설정 어드민 페이지
//
// 섹션:
//   1. 비상 토글 (purchase_enabled, bids_enabled, posts_enabled, comments_enabled)
//      → 즉시 적용 (사용자 측 입찰/구매/작성 차단)
//   2. 활동 기간 (activity_periods) — 5개 활동 각각 시작/종료 시각 (KST 입력)
//   3. 계좌 정보 (bank_account_info)
//   4. 모금 목표 (donation_goal)
//
// 모든 저장은 즉시 적용. Realtime으로 다른 사용자에게도 즉시 반영.
// ============================================================================

import { useEffect, useState } from 'react';
import {
  loadAllSettings,
  updateSetting,
  subscribeSettings,
  kstInputToUtcIso,
  utcIsoToKstInput,
} from '@/lib/settings';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import type {
  EsgSettingsValueMap,
  EsgActivityKey,
  EsgActivityPeriod,
} from '@/types/esg';

const ACTIVITY_LABELS: Record<EsgActivityKey, string> = {
  zero_waste: '♻️ 제로 웨이스트',
  wise_life: '🌍 슬기로운 사회 생활',
  bazaar: '🛍 바자회',
  auction: '🔨 경매',
};

export function AdminSettings() {
  const [settings, setSettings] = useState<Partial<EsgSettingsValueMap>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setError(null);
      const data = await loadAllSettings();
      setSettings(data);
    } catch (e) {
      console.error('[AdminSettings] load:', e);
      setError(e instanceof Error ? e.message : '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  useEffect(() => {
    const cleanup = subscribeSettings(() => {
      void reload();
    });
    return cleanup;
  }, []);

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }
  if (error) {
    return (
      <div
        style={{
          padding: 16,
          background: '#fee2e2',
          color: '#991b1b',
          borderRadius: 8,
        }}
      >
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: '0 0 8px' }}>⚙️ 이벤트 설정</h2>

      {/* 1. 비상 토글 */}
      <TogglesSection settings={settings} onChange={reload} />

      {/* 2. 활동 기간 */}
      <ActivityPeriodsSection settings={settings} onChange={reload} />

      {/* 3. 계좌 정보 */}
      <BankAccountSection settings={settings} onChange={reload} />

      {/* 4. 모금 목표 */}
      <DonationGoalSection settings={settings} onChange={reload} />

      {/* 5. 상품 수령 안내 */}
      <DeliveryInfoSection settings={settings} onChange={reload} />
    </div>
  );
}

// ============================================================================
// 1. 비상 토글
// ============================================================================

function TogglesSection({
  settings,
  onChange,
}: {
  settings: Partial<EsgSettingsValueMap>;
  onChange: () => void;
}) {
  const toggles: Array<{
    key: keyof EsgSettingsValueMap;
    label: string;
    description: string;
    icon: string;
  }> = [
    {
      key: 'purchase_enabled',
      label: '바자회 구매',
      description: '체크 해제 시 모든 사용자의 바자회 결제가 즉시 차단됩니다.',
      icon: '🛍',
    },
    {
      key: 'bids_enabled',
      label: '경매 입찰',
      description: '체크 해제 시 모든 사용자의 경매 입찰이 즉시 차단됩니다.',
      icon: '🔨',
    },
    {
      key: 'posts_enabled',
      label: '게시글 작성',
      description: '체크 해제 시 새 게시글 작성이 차단됩니다.',
      icon: '📝',
    },
    {
      key: 'comments_enabled',
      label: '댓글 작성',
      description: '체크 해제 시 새 댓글 작성이 차단됩니다.',
      icon: '💬',
    },
  ];

  return (
    <SectionCard
      title="🚨 비상 토글"
      description="문제 발생 시 즉시 차단 가능. 사용자에게는 한국어 에러 메시지가 표시됩니다."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toggles.map((t) => (
          <ToggleRow
            key={t.key}
            label={`${t.icon} ${t.label}`}
            description={t.description}
            value={(settings[t.key] as boolean | undefined) !== false}
            onChange={async (next) => {
              try {
                await updateSetting(t.key, next as never);
                onChange();
              } catch (e) {
                alert(e instanceof Error ? e.message : '저장 실패');
              }
            }}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: 12,
        background: value ? '#f0fdf4' : '#fef2f2',
        border: '1px solid',
        borderColor: value ? '#bbf7d0' : '#fecaca',
        borderRadius: 8,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
          {label}{' '}
          <span style={{ color: value ? '#16a34a' : '#dc2626', marginLeft: 4 }}>
            {value ? '✅ 활성' : '🚫 차단됨'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>{description}</div>
      </div>
    </label>
  );
}

// ============================================================================
// 2. 활동 기간
// ============================================================================

function ActivityPeriodsSection({
  settings,
  onChange,
}: {
  settings: Partial<EsgSettingsValueMap>;
  onChange: () => void;
}) {
  const periods = settings.activity_periods ?? {};

  return (
    <SectionCard
      title="📅 활동 기간"
      description="각 활동의 시작/종료 시각 (KST 기준). 저장 즉시 반영됩니다."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(Object.keys(ACTIVITY_LABELS) as EsgActivityKey[]).map((key) => (
          <ActivityRow
            key={key}
            activityKey={key}
            label={ACTIVITY_LABELS[key]}
            period={periods[key]}
            onSave={async (newPeriod) => {
              const nextPeriods = { ...periods, [key]: newPeriod };
              try {
                await updateSetting('activity_periods', nextPeriods);
                onChange();
              } catch (e) {
                alert(e instanceof Error ? e.message : '저장 실패');
              }
            }}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function ActivityRow({
  activityKey,
  label,
  period,
  onSave,
}: {
  activityKey: EsgActivityKey;
  label: string;
  period: EsgActivityPeriod | undefined;
  onSave: (next: EsgActivityPeriod) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [startsKst, setStartsKst] = useState('');
  const [endsKst, setEndsKst] = useState('');
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setStartsKst(period ? utcIsoToKstInput(period.starts_at_utc) : '');
    setEndsKst(period ? utcIsoToKstInput(period.ends_at_utc) : '');
    setEditing(true);
  };

  const save = async () => {
    if (!startsKst || !endsKst) {
      alert('시작과 종료 시각을 모두 입력해주세요.');
      return;
    }
    const startsUtc = kstInputToUtcIso(startsKst);
    const endsUtc = kstInputToUtcIso(endsKst);
    if (new Date(endsUtc) <= new Date(startsUtc)) {
      alert('종료 시각은 시작 시각보다 뒤여야 합니다.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        label: period?.label ?? label.replace(/[^\w가-힣 ]/g, '').trim(),
        starts_at_kst: startsKst,
        ends_at_kst: endsKst,
        starts_at_utc: startsUtc,
        ends_at_utc: endsUtc,
        note: period?.note,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        padding: 12,
        background: '#f9fafb',
        borderRadius: 8,
        border: '1px solid #eee',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {!editing && (
          <button
            type="button"
            onClick={beginEdit}
            style={{
              padding: '4px 10px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            ✏️ 수정
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
          {period ? (
            <>
              {fmtKstShort(period.starts_at_utc)} ~ {fmtKstShort(period.ends_at_utc)}
            </>
          ) : (
            <span style={{ color: '#bbb' }}>기간 미설정</span>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DatetimeInput label="시작 (KST)" value={startsKst} onChange={setStartsKst} disabled={saving} />
          <DatetimeInput label="종료 (KST)" value={endsKst} onChange={setEndsKst} disabled={saving} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: saving ? '#ccc' : '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                padding: '8px 12px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {/* activityKey는 미래 확장용 (예: 활동별 특화 옵션) */}
      <span style={{ display: 'none' }}>{activityKey}</span>
    </div>
  );
}

// ============================================================================
// 3. 계좌 정보
// ============================================================================

function BankAccountSection({
  settings,
  onChange,
}: {
  settings: Partial<EsgSettingsValueMap>;
  onChange: () => void;
}) {
  const bank = settings.bank_account_info ?? { bank: '', account: '', holder: '' };
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(bank);
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setForm(bank);
    setEditing(true);
  };

  const save = async () => {
    if (!form.bank || !form.account || !form.holder) {
      alert('은행/계좌/예금주를 모두 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateSetting('bank_account_info', form);
      onChange();
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="💳 계좌 정보"
      description="결제 시 사용자에게 안내되는 입금 계좌입니다."
    >
      {!editing ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div>
              <span style={{ color: '#888', marginRight: 8 }}>은행</span>
              <strong>{bank.bank || '-'}</strong>
            </div>
            <div>
              <span style={{ color: '#888', marginRight: 8 }}>계좌</span>
              <strong style={{ fontFamily: 'monospace' }}>{bank.account || '-'}</strong>
            </div>
            <div>
              <span style={{ color: '#888', marginRight: 8 }}>예금주</span>
              <strong>{bank.holder || '-'}</strong>
            </div>
            {bank.memo && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
                메모: {bank.memo}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={beginEdit}
            style={{
              padding: '6px 12px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ✏️ 수정
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TextInput label="은행" value={form.bank} onChange={(v) => setForm({ ...form, bank: v })} disabled={saving} />
          <TextInput label="계좌번호" value={form.account} onChange={(v) => setForm({ ...form, account: v })} disabled={saving} mono />
          <TextInput label="예금주" value={form.holder} onChange={(v) => setForm({ ...form, holder: v })} disabled={saving} />
          <TextInput
            label="메모 (선택)"
            value={form.memo ?? ''}
            onChange={(v) => setForm({ ...form, memo: v || undefined })}
            disabled={saving}
            placeholder="예: 입금자명에 주문번호 포함"
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: saving ? '#ccc' : '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                padding: '8px 12px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ============================================================================
// 4. 모금 목표
// ============================================================================

function DonationGoalSection({
  settings,
  onChange,
}: {
  settings: Partial<EsgSettingsValueMap>;
  onChange: () => void;
}) {
  const goal = settings.donation_goal ?? 0;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(goal);
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setForm(goal);
    setEditing(true);
  };

  const save = async () => {
    if (form < 0) {
      alert('0 이상이어야 합니다.');
      return;
    }
    setSaving(true);
    try {
      await updateSetting('donation_goal', form);
      onChange();
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="🎯 모금 목표" description="홈 화면 진행률 바에 표시됩니다.">
      {!editing ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{goal.toLocaleString()}원</div>
          <button
            type="button"
            onClick={beginEdit}
            style={{
              padding: '6px 12px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            ✏️ 수정
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NumberInput label="모금 목표 (원)" value={form} onChange={setForm} disabled={saving} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: saving ? '#ccc' : '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                padding: '8px 12px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ============================================================================
// 5. 상품 수령 안내 (markdown)
// ============================================================================

function DeliveryInfoSection({
  settings,
  onChange,
}: {
  settings: Partial<EsgSettingsValueMap>;
  onChange: () => void;
}) {
  const current = settings.delivery_info ?? '';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(current);
  const [saving, setSaving] = useState(false);

  const beginEdit = () => {
    setForm(current);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSetting('delivery_info', form);
      onChange();
      setEditing(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="📦 상품 수령 안내"
      description="바자회/경매 상품 상세 페이지의 '상품수령' 탭에 표시되는 공통 안내 (마크다운)"
    >
      {!editing ? (
        <>
          <div
            style={{
              padding: 14,
              background: '#fafafa',
              borderRadius: 8,
              minHeight: 80,
              marginBottom: 12,
            }}
          >
            {current.trim() ? (
              <MarkdownRenderer content={current} />
            ) : (
              <div style={{ color: '#bbb', fontSize: 13 }}>(등록된 안내가 없습니다)</div>
            )}
          </div>
          <button
            type="button"
            onClick={beginEdit}
            style={{
              padding: '8px 16px',
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ✏️ 편집
          </button>
        </>
      ) : (
        <div>
          <MarkdownEditor
            value={form}
            onChange={setForm}
            uploaderKind="bazaar"
            uploaderOwnerId="delivery-info"
            disabled={saving}
            minHeight={240}
            placeholder="상품 수령 안내를 작성해주세요. 마크다운 지원."
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: saving ? '#ccc' : '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              style={{
                padding: '10px 16px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ============================================================================
// 공통 컴포넌트
// ============================================================================

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{title}</h3>
      {description && (
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#888' }}>{description}</p>
      )}
      {children}
    </section>
  );
}

function DatetimeInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 80, color: '#666' }}>{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '6px 10px',
          border: '1px solid #ddd',
          borderRadius: 4,
          fontSize: 13,
        }}
      />
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 80, color: '#666' }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: '6px 10px',
          border: '1px solid #ddd',
          borderRadius: 4,
          fontSize: 13,
          fontFamily: mono ? 'monospace' : 'inherit',
        }}
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 100, color: '#666' }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        disabled={disabled}
        style={{
          flex: 1,
          padding: '6px 10px',
          border: '1px solid #ddd',
          borderRadius: 4,
          fontSize: 13,
          textAlign: 'right',
        }}
      />
    </label>
  );
}

// 짧은 KST 표시 헬퍼 (어드민 표시용)
function fmtKstShort(utcIso: string): string {
  if (!utcIso) return '-';
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}
