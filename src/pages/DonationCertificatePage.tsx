// ============================================================================
// DonationCertificatePage — 기부 인증서 페이지
//
// 사용:
//   - /donate/{donation_id}/certificate
//   - 본인 또는 어드민만 접근 가능 (RLS)
//   - 인쇄 (Ctrl+P) 또는 PDF 다운로드 (window.print 활용)
//
// 디자인: A4 비율 (가로 595px, 세로 842px 기준)
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadCertificate, loadDonation } from '@/lib/donations';
import type {
  EsgDonationCertificateRow,
  EsgDonationRow,
} from '@/types/esg';

export function DonationCertificatePage() {
  const { id } = useParams();
  const [certificate, setCertificate] = useState<EsgDonationCertificateRow | null>(null);
  const [donation, setDonation] = useState<EsgDonationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const [c, d] = await Promise.all([loadCertificate(id), loadDonation(id)]);
        setCertificate(c);
        setDonation(d);
      } catch (e) {
        console.error('[CertificatePage]', e);
        setError(e instanceof Error ? e.message : '인증서를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>불러오는 중…</div>;
  }
  if (error || !certificate || !donation) {
    return (
      <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>
        ⚠️ {error ?? '인증서를 찾을 수 없습니다. 입금 확인 후 발급됩니다.'}
      </div>
    );
  }

  const paidDate = new Date(certificate.paid_at);
  const paidDateKst = new Date(paidDate.getTime() + 9 * 60 * 60 * 1000);
  const paidStr = `${paidDateKst.getUTCFullYear()}년 ${
    paidDateKst.getUTCMonth() + 1
  }월 ${paidDateKst.getUTCDate()}일`;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px' }}>
      {/* 인쇄 시 숨김 - 액션 버튼 */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>📜 기부 인증서</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              padding: '8px 16px',
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            🖨 인쇄 / PDF 저장
          </button>
        </div>
      </div>

      <div className="no-print" style={{ fontSize: 11, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
        💡 "인쇄 / PDF 저장" → 프린터 대신 "PDF로 저장"을 선택하면 PDF 다운로드됩니다.
      </div>

      {/* 인증서 본체 (A4 비율) */}
      <article className="certificate" style={certificateStyle}>
        <div style={borderStyle}>
          <div style={{ textAlign: 'center', padding: '40px 30px' }}>
            {/* 헤더 */}
            <div style={{ fontSize: 12, color: '#888', letterSpacing: 4, marginBottom: 8 }}>
              CERTIFICATE OF DONATION
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#166534', margin: '0 0 8px' }}>
              💚 기부 인증서
            </h1>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 32 }}>
              인증번호: {certificate.certificate_number}
            </div>

            {/* 구분선 */}
            <div style={{ height: 2, background: '#16a34a', width: 60, margin: '0 auto 32px' }} />

            {/* 본문 */}
            <div style={{ fontSize: 14, lineHeight: 2, color: '#333' }}>
              <p style={{ margin: 0 }}>다음 분께서 C&amp;R Research의</p>
              <p style={{ margin: 0 }}>29주년 ESG 이벤트에 따뜻한 마음으로</p>
              <p style={{ margin: 0 }}>기부에 참여해 주셨음을 증명합니다.</p>
            </div>

            <div style={{ margin: '40px 0', padding: '24px', background: '#f0fdf4', borderRadius: 12 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>기부자</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                {certificate.donor_name}
              </div>
              {certificate.donor_dept && (
                <div style={{ fontSize: 13, color: '#666' }}>{certificate.donor_dept}</div>
              )}
            </div>

            <div style={{ margin: '24px 0' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>기부 금액</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#16a34a' }}>
                {certificate.amount.toLocaleString()}원
              </div>
            </div>

            {certificate.message && (
              <div
                style={{
                  margin: '24px 0',
                  padding: 16,
                  background: '#fafafa',
                  borderLeft: '3px solid #16a34a',
                  textAlign: 'left',
                  fontSize: 13,
                  color: '#444',
                  lineHeight: 1.7,
                }}
              >
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>응원 메시지</div>
                {certificate.message}
              </div>
            )}

            {/* 발급 정보 */}
            <div style={{ marginTop: 56, fontSize: 13, color: '#555', lineHeight: 1.8 }}>
              <div>기부 일자: {paidStr}</div>
              <div>발급 일자: {new Date(certificate.issued_at).toLocaleDateString('ko-KR')}</div>
            </div>

            <div style={{ marginTop: 40, fontSize: 13, fontWeight: 700, color: '#222' }}>
              C&amp;R Research
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              Clinical Platform Research Institute
            </div>
          </div>
        </div>
      </article>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .certificate {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
}

const certificateStyle: React.CSSProperties = {
  background: '#fff',
  padding: 20,
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  aspectRatio: '1 / 1.414', // A4 비율
};

const borderStyle: React.CSSProperties = {
  border: '4px double #16a34a',
  borderRadius: 4,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
