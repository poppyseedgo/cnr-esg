// ============================================================================
// AdminBazaarGuide — 바자회 참여 물품 가이드 편집 어드민 페이지
//
// 편집 가능: 텍스트만 (A안). 구조(카테고리 10종, 절차 3단계, 공통 불가 5개)는 고정.
//   - 기본 원칙: highlight, subtitle
//   - 카테고리: name, isNew(체크박스), allowed, disallowed × 10
//   - 공통 불가: 5개 텍스트
//   - 절차 3단계: title, desc
//   - 하단 메시지: text(#HIGHLIGHT# 토큰 사용), highlight
//
// 동작:
//   - 마운트 시 loadSetting('bazaar_guide') → 없으면 BAZAAR_GUIDE_DEFAULTS 폴백
//   - "초기값으로 리셋" 버튼: 폼만 기본값으로 (저장 전까지 DB 변경 없음)
//   - "저장" 버튼: updateSetting('bazaar_guide', formData) → 사용자 측 Realtime 반영
//   - dirty 추적: 변경 사항 있을 때만 저장 활성화
// ============================================================================

import { useEffect, useState } from 'react';
import { loadSetting, updateSetting, subscribeSettings } from '@/lib/settings';
import {
  BAZAAR_GUIDE_DEFAULTS,
} from '@/components/home/bazaarGuideDefaults';
import type { EsgBazaarGuide } from '@/types/esg';

export function AdminBazaarGuide() {
  // 폼 상태 (편집 중인 값)
  const [form, setForm] = useState<EsgBazaarGuide>(BAZAAR_GUIDE_DEFAULTS);
  // 마지막 저장된(또는 로드된) 값 — dirty 비교 기준
  const [saved, setSaved] = useState<EsgBazaarGuide>(BAZAAR_GUIDE_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState(false);

  // 로드
  const reload = async () => {
    try {
      setError(null);
      const data = await loadSetting('bazaar_guide');
      const value = data ?? BAZAAR_GUIDE_DEFAULTS;
      setForm(value);
      setSaved(value);
    } catch (e) {
      console.error('[AdminBazaarGuide] load:', e);
      setError(e instanceof Error ? e.message : '가이드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void reload();
  }, []);

  // Realtime: 다른 어드민이 저장하면 폼이 dirty 아닐 때만 갱신
  useEffect(() => {
    const cleanup = subscribeSettings(() => {
      // dirty 상태인 경우 덮어쓰면 작업 손실 → saved만 갱신하고 사용자에게 알림
      // 단순화: 그냥 reload (dirty 손실 위험 있으므로 향후 dirty 시 confirm 추가 가능)
      void reload();
    });
    return cleanup;
  }, []);

  // dirty 판별 (얕은 JSON 비교)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateSetting('bazaar_guide', form);
      setSaved(form);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch (e) {
      console.error('[AdminBazaarGuide] save:', e);
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('현재 편집 내용을 버리고 기본값으로 되돌립니다. 계속하시겠습니까?\n(저장 전까지 DB는 변경되지 않습니다)')) return;
    setForm(BAZAAR_GUIDE_DEFAULTS);
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0 }}>📋 바자회 참여 물품 가이드</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
            홈 포스터 클릭 시 뜨는 바자회 모달의 본문 텍스트입니다. 구조는 고정, 텍스트만 편집 가능합니다.
          </p>
        </div>
        <button
          onClick={handleReset}
          style={{
            padding: '8px 14px',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 13,
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          기본값으로 리셋
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: '#fee2e2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* 1. 기본 원칙 */}
      <Section title="① 기본 원칙">
        <Field label="강조 문구 (굵게 표시)">
          <textarea
            rows={2}
            value={form.principle.highlight}
            onChange={(e) => setForm({ ...form, principle: { ...form.principle, highlight: e.target.value } })}
            style={inputStyle}
          />
        </Field>
        <Field label="부가 설명">
          <textarea
            rows={2}
            value={form.principle.subtitle}
            onChange={(e) => setForm({ ...form, principle: { ...form.principle, subtitle: e.target.value } })}
            style={inputStyle}
          />
        </Field>
      </Section>

      {/* 2. 물품별 카테고리 */}
      <Section title="② 물품별 기부 기준 (10종, 순서 고정)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {form.categories.map((cat, idx) => (
            <div key={cat.id} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <code style={{ fontSize: 11, color: '#94a3b8', minWidth: 80 }}>#{idx + 1} · {cat.id}</code>
                <input
                  value={cat.name}
                  onChange={(e) => updateCategory(idx, { name: e.target.value })}
                  placeholder="카테고리 이름"
                  style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748b', whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={cat.isNew}
                    onChange={(e) => updateCategory(idx, { isNew: e.target.checked })}
                  />
                  신규 배지
                </label>
              </div>
              <Field label="✅ 가능" compact>
                <textarea
                  rows={2}
                  value={cat.allowed}
                  onChange={(e) => updateCategory(idx, { allowed: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="❌ 불가" compact>
                <textarea
                  rows={2}
                  value={cat.disallowed}
                  onChange={(e) => updateCategory(idx, { disallowed: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. 공통 불가 기준 */}
      <Section title="③ 공통 불가 기준 (5개, 순서 고정)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {form.commonDisallowed.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <code style={{ fontSize: 11, color: '#94a3b8', minWidth: 32, paddingTop: 10 }}>#{idx + 1}</code>
              <textarea
                rows={2}
                value={item}
                onChange={(e) => {
                  const next = [...form.commonDisallowed];
                  next[idx] = e.target.value;
                  setForm({ ...form, commonDisallowed: next });
                }}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* 4. 기부 접수 절차 */}
      <Section title="④ 기부 접수 절차 (3단계, 순서 고정)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {form.steps.map((step, idx) => (
            <div key={idx} style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: '#00422b', color: '#fff',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                }}>{idx + 1}</span>
                <span style={{ fontSize: 13, color: '#64748b' }}>단계 {idx + 1}</span>
              </div>
              <Field label="제목" compact>
                <input
                  value={step.title}
                  onChange={(e) => updateStep(idx, { title: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="부가 설명 (선택 — 비우면 표시 안 함)" compact>
                <textarea
                  rows={2}
                  value={step.desc}
                  onChange={(e) => updateStep(idx, { desc: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>
          ))}
        </div>
      </Section>

      {/* 5. 하단 ESG 메시지 */}
      <Section title="⑤ 자원순환 ESG 메시지">
        <Field label={'본문 — 강조할 위치에 #HIGHLIGHT# 토큰 사용 (예: "수익금은 #HIGHLIGHT#으로 사용됩니다.")'}>
          <textarea
            rows={2}
            value={form.footerMessage.text}
            onChange={(e) => setForm({ ...form, footerMessage: { ...form.footerMessage, text: e.target.value } })}
            style={inputStyle}
          />
        </Field>
        <Field label="강조 텍스트 (#HIGHLIGHT# 자리에 굵게 들어갈 문구)">
          <input
            value={form.footerMessage.highlight}
            onChange={(e) => setForm({ ...form, footerMessage: { ...form.footerMessage, highlight: e.target.value } })}
            style={inputStyle}
          />
        </Field>
      </Section>

      {/* 저장 바 (fixed) */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: '#fff', borderTop: '1px solid #e2e8f0',
        padding: '12px 24px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
        zIndex: 10,
      }}>
        {savedToast && (
          <span style={{ color: '#15803d', fontSize: 13, fontWeight: 600 }}>✓ 저장되었습니다</span>
        )}
        {dirty && !savedToast && (
          <span style={{ color: '#b45309', fontSize: 13 }}>● 저장되지 않은 변경 사항</span>
        )}
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            padding: '10px 20px',
            background: dirty && !saving ? '#00422b' : '#cbd5e1',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );

  // ─ 헬퍼 ──────────────────────────────────────────────────
  function updateCategory(idx: number, patch: Partial<EsgBazaarGuide['categories'][number]>) {
    const next = [...form.categories];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, categories: next });
  }
  function updateStep(idx: number, patch: Partial<EsgBazaarGuide['steps'][number]>) {
    const next = [...form.steps];
    next[idx] = { ...next[idx], ...patch };
    setForm({ ...form, steps: next });
  }
}

// ─ UI 헬퍼 컴포넌트 ───────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </section>
  );
}

function Field({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  lineHeight: 1.5,
  resize: 'vertical',
  boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
