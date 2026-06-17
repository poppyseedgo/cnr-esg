// ============================================================================
// DonatePage — 기부하기 페이지
//
// 흐름:
//   1. 모금 현황 표시 (선택사항 - DB stats)
//   2. 금액 선택 (빠른 버튼 4개 + 직접 입력)
//   3. 입금자명 입력 (실제 통장 입금자명 - 매칭용)
//   4. 응원 메시지 (선택, 300자)
//   5. 익명 옵션 (어드민은 본명 확인 가능)
//   6. 제출 → /donate/{id} 이동
// ============================================================================
// [변경 이력]
// 2026-06-17 : 퀵금액 버튼 동작 변경 (선택형 → 누적형)
//   - onClick: setAmount(v) → 이전 금액에 v를 더함 (여러 번 클릭 누적)
//   - 선택 하이라이트(amount===v) 제거 → 누적형에선 버그성 표시이므로 삭제
//   - 라벨에 "+" 접두사 추가 (누적 의미 명확화)
//   - "초기화" 버튼 추가 (잘못 누적 시 0으로 리셋, 직접입력 외 되돌림 경로 보완)
// ============================================================================

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { createDonation } from '@/lib/donations';
import { signInWithMicrosoft } from '@/lib/auth';

const QUICK_AMOUNTS = [10000, 30000, 50000, 100000];
const MAX_MESSAGE = 300;
const MIN_AMOUNT = 10000;

export function DonatePage() {
  const { currentUser } = useCurrentUser();
  const navigate = useNavigate();

  const [amount, setAmount] = useState<number | ''>('');
  const [payerName, setPayerName] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = useMemo(() => {
    if (typeof amount !== 'number' || amount < MIN_AMOUNT) return false;
    if (!payerName.trim()) return false;
    if (message.length > MAX_MESSAGE) return false;
    return true;
  }, [amount, payerName, message]);

  const handleSubmit = async () => {
    if (!currentUser) {
      signInWithMicrosoft().catch(console.error);
      return;
    }
    if (!isValid || typeof amount !== 'number') return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await createDonation(amount, {
        payerName: payerName.trim(),
        message: message.trim() || undefined,
        isAnonymous,
      });
      if (result.donation_id) {
        navigate(`/donate/${result.donation_id}`);
      }
    } catch (e) {
      console.error('[DonatePage] create error:', e);
      setError(e instanceof Error ? e.message : '기부 신청에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
      <h1 style={{ margin: '0 0 8px' }}>💚 자발적 기부</h1>
      <p style={{ color: '#666', margin: '0 0 24px' }}>
        모금된 금액은 사내 ESG 활동에 사용되며, 입금 확인 후 자동으로 인증서가 발급됩니다.
      </p>

      {/* 안내 박스 */}
      <div
        style={{
          padding: 16,
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 8,
          marginBottom: 24,
          fontSize: 13,
          color: '#166534',
          lineHeight: 1.7,
        }}
      >
        <strong>안내</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
          <li>최소 기부 금액: 10,000원</li>
          <li>입금 기한: 오늘 23:59 (KST)</li>
          <li>입금자명을 정확히 입력해 주세요 (매칭용)</li>
          <li>관리자 확인 후 이메일로 인증서가 발송됩니다</li>
        </ul>
      </div>

      {/* 금액 */}
      <section style={sectionStyle}>
        <Label>💰 기부 금액</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
          {QUICK_AMOUNTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAmount((prev) => (typeof prev === 'number' ? prev : 0) + v)} // ← 선택→누적: 누를 때마다 v원 더하기(빈값이면 0부터)
              style={{
                padding: '10px 8px',
                background: '#fff',          // ← 누적형이라 선택 하이라이트(amount===v) 제거
                color: '#16a34a',            // ← 더하기 버튼 강조용 그린 텍스트(고정)
                border: '1px solid #bbf7d0', // ← 고정 테두리(선택 분기 삭제)
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,            // ← 가독성 위해 600→700
              }}
            >
              +{(v / 10000).toLocaleString()}만   {/* ← 누적 의미 명확화: "+" 접두사 추가 */}
            </button>
          ))}
        </div>
        {/* ← 누적 금액 초기화 버튼: amount가 양수일 때만 노출 (잘못 누른 경우 0으로 리셋) */}
        {typeof amount === 'number' && amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setAmount('')} // ← 누적값 초기화(빈값으로 리셋)
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                fontSize: 12,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              초기화
            </button>
          </div>
        )}
        <input
          type="number"
          value={amount === '' ? '' : amount}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') setAmount('');
            else setAmount(Number(v.replace(/[^\d]/g, '')));
          }}
          placeholder="직접 입력 (최소 10,000원)"
          style={inputStyle}
          min={MIN_AMOUNT}
          step={1000}
        />
        {typeof amount === 'number' && amount > 0 && amount < MIN_AMOUNT && (
          <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>
            최소 {MIN_AMOUNT.toLocaleString()}원 이상 입력해 주세요.
          </div>
        )}
        {typeof amount === 'number' && amount >= MIN_AMOUNT && (
          <div style={{ color: '#16a34a', fontSize: 13, marginTop: 4, fontWeight: 600 }}>
            기부 금액: {amount.toLocaleString()}원
          </div>
        )}
      </section>

      {/* 입금자명 */}
      <section style={sectionStyle}>
        <Label>🏦 입금자명 (실제 통장 입금자명) *</Label>
        <input
          type="text"
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          placeholder="예: 홍길동"
          maxLength={20}
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
          입금하실 통장의 예금주명과 동일하게 입력해 주세요. 매칭에 사용됩니다.
        </div>
      </section>

      {/* 응원 메시지 */}
      <section style={sectionStyle}>
        <Label>
          💬 응원 메시지 (선택)
          <span style={{ fontSize: 11, color: '#888', fontWeight: 400, marginLeft: 8 }}>
            {message.length}/{MAX_MESSAGE}
          </span>
        </Label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
          placeholder="응원 메시지나 기부 동기를 자유롭게 적어주세요."
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </section>

      {/* 익명 옵션 */}
      <section style={sectionStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 14 }}>🕶 익명으로 기부합니다</span>
        </label>
        <div style={{ fontSize: 11, color: '#888', marginTop: 4, marginLeft: 24, lineHeight: 1.5 }}>
          (체크 시 공개되는 기부 명단에서 이름이 가려집니다. 관리자는 본명을 확인할 수 있습니다.)
        </div>
      </section>

      {/* 에러 */}
      {error && (
        <div
          style={{
            padding: 12,
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* 제출 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!isValid || submitting}
        style={{
          width: '100%',
          padding: '14px 24px',
          background: isValid && !submitting ? '#16a34a' : '#ccc',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 700,
          cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
          marginTop: 8,
        }}
      >
        {submitting ? '신청 중…' : !currentUser ? '로그인 후 기부하기' : '💚 기부 신청하기'}
      </button>

      <p style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 12 }}>
        신청 후 표시되는 계좌로 오늘 23:59까지 입금해 주세요.
      </p>
    </div>
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #ddd',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginBottom: 8 }}>{children}</div>;
}
