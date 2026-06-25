// ============================================================================
// process-email-outbox — 이메일 outbox 처리 Edge Function
//
// 트리거: pg_cron 1분마다 호출
// 동작:
//   1. esg_email_outbox에서 pending/failed (next_retry_at <= now()) 50건 조회
//   2. 템플릿별 HTML 생성
//   3. Resend API로 발송
//   4. 결과에 따라 status 업데이트:
//      - 성공: 'sent' + sent_at=now()
//      - 실패: retry_count++. 3회 미만이면 'failed' + exponential backoff,
//             3회 도달 시 'dead'
//
// 환경 변수:
//   - SUPABASE_URL          (자동)
//   - SUPABASE_SERVICE_ROLE_KEY (자동) — DB UPDATE용
//   - RESEND_API_KEY        (수동 설정 필요)
//
// 배포:
//   supabase functions deploy process-email-outbox \
//     --project-ref jjzcqpbwkkujttwxksvy --no-verify-jwt
//
//   ⚠️ --no-verify-jwt 필수 (cron이 ANON_KEY로 호출)
//
// ── 변경 이력 ───────────────────────────────────────────────────────────────
//   2026-06-16  [버그 #1] 인증서 링크 깨짐 대응
//     (1) APP_BASE_URL 미설정 시 발송을 중단(메일 보존)하여 'undefined/...' 깨진 링크 방지.
//     (2) donation_paid: template_data에 누락된 donation_number/certificate_number를
//         발송 직전 DB(SSOT)에서 보강(enrichTemplateData) → 메일 공란 해소.
//     ※ 근본 원인(링크)은 APP_BASE_URL 환경변수 미설정. 배포 전 secrets 설정 필수.
//   2026-06-16  [재발송] 'donation_certificate_resend' 템플릿 추가
//     ("기부금 인증서가 도착했습니다") — 관리자 선택 재발송용. enrich 대상에 포함.
//   2026-06-25  [15분 결제정책] 바자회 메일 문구를 정책에 맞게 정정.
//     (1) bazaar_order_created: "오늘 23:59까지" 하드코딩 → "주문 후 15분 이내(아래 입금 기한)".
//         ※ 실제 기한은 paymentGuideBlock 의 입금 기한(formatKst(expires_at))이 SSOT(동적).
//     (2) bazaar_order_expired: "입금 기한 내에" → "입금 기한(주문 후 15분) 내에"로 명확화.
//     ※ 경매(auction_won)·기부(donation_created)의 "오늘 23:59"는 정책 범위 밖(미변경).
//     ※ 입금 리마인더(bazaar_payment_reminder)는 15분 정책상 메일이 도착 전 만료되어 무의미 →
//        바자회는 리마인더 크론에서 제외(크론 SQL은 별도). 템플릿은 경매용으로 존치.
// ============================================================================

// @deno-types="https://deno.land/std@0.224.0/types.d.ts"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

// ============================================================================
// 환경 설정
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

// 이메일 본문의 액션 버튼이 가리킬 도메인.
// 환경변수에서만 받음. 누락 시 명시적 에러 (잘못된 도메인으로 발송 방지).
const APP_BASE_URL = Deno.env.get('APP_BASE_URL');
if (!APP_BASE_URL) {
  console.error('[process-email-outbox] APP_BASE_URL 환경변수 미설정. supabase secrets set APP_BASE_URL=https://your-domain 필요');
}

const FROM_EMAIL = 'C&R ESG <space@cnrres.com>';
const REPLY_TO = 'space@cnrres.com';

const BATCH_SIZE = 50;
const MAX_RETRY = 3;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ============================================================================
// 타입
// ============================================================================

interface OutboxRow {
  id: string;
  idempotency_key: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  template_key: string;
  template_data: Record<string, unknown>;
  status: string;
  retry_count: number;
}

// ============================================================================
// 진입점
// ============================================================================

Deno.serve(async (_req: Request) => {
  try {
    // ← [2026-06-16 버그#1] APP_BASE_URL 미설정 시 메일을 건드리지 않고 즉시 중단.
    //    pending 상태로 보존되어, secrets 설정 후 다음 cron 틱에서 정상 링크로 발송됨.
    if (!APP_BASE_URL) {
      console.error('[process-email-outbox] APP_BASE_URL 미설정 — 발송 중단(메일 보존).');
      return new Response(
        JSON.stringify({ error: 'APP_BASE_URL_NOT_SET', processed: 0 }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 처리할 메일 조회 (pending + failed-with-time-elapsed)
    const { data: rows, error: queryErr } = await supabase
      .from('esg_email_outbox')
      .select('*')
      .in('status', ['pending', 'failed'])
      .lte('next_retry_at', new Date().toISOString())
      .order('next_retry_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (queryErr) throw queryErr;
    const items = (rows ?? []) as OutboxRow[];

    if (items.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'no pending emails' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 순차 발송 (Resend rate limit 보호)
    const results = { sent: 0, failed: 0, dead: 0 };
    for (const item of items) {
      try {
        await sendOne(item);
        results.sent += 1;
      } catch (e) {
        const isDead = await markFailedOrDead(item, e);
        if (isDead) results.dead += 1;
        else results.failed += 1;
      }
    }

    return new Response(
      JSON.stringify({ processed: items.length, ...results }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[process-email-outbox] fatal:', e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// 발송 1건
// ============================================================================

// ← [2026-06-16 버그#1] donation_paid 보강: mark_donation_paid가 template_data에
//    donation_number/certificate_number를 넣지 않아 메일 칸이 공란으로 나오는 문제를
//    발송 직전 DB(SSOT)에서 채워 해결. donation_id(이미 존재)를 키로 조회.
//    다른 템플릿은 그대로 통과. 이미 값이 있으면 덮어쓰지 않음.
async function enrichTemplateData(
  templateKey: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (templateKey !== 'donation_paid' && templateKey !== 'donation_certificate_resend') return data; // ← [2026-06-16] 재발송 포함

  const donationId = data.donation_id;
  if (!donationId || typeof donationId !== 'string') return data;

  const enriched: Record<string, unknown> = { ...data };

  if (!enriched.donation_number) {
    const { data: don } = await supabase
      .from('esg_donations')
      .select('donation_number')
      .eq('id', donationId)
      .maybeSingle();
    if (don?.donation_number) enriched.donation_number = don.donation_number;
  }

  if (!enriched.certificate_number) {
    const { data: cert } = await supabase
      .from('esg_donation_certificates')
      .select('certificate_number')
      .eq('donation_id', donationId)
      .maybeSingle();
    if (cert?.certificate_number) enriched.certificate_number = cert.certificate_number;
  }

  return enriched;
}

async function sendOne(item: OutboxRow): Promise<void> {
  const data = await enrichTemplateData(item.template_key, item.template_data); // ← [2026-06-16 버그#1] DB 보강
  const html = buildEmailHtml(item.template_key, data); // ← [2026-06-16] 보강된 data 사용

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [item.to_email],
      reply_to: REPLY_TO,
      subject: item.subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend ${res.status}: ${errText.slice(0, 500)}`);
  }

  // 성공 → sent
  const { error: upErr } = await supabase
    .from('esg_email_outbox')
    .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
    .eq('id', item.id);
  if (upErr) console.error('[outbox update sent]', upErr);
}

// ============================================================================
// 실패 처리
// ============================================================================

async function markFailedOrDead(item: OutboxRow, err: unknown): Promise<boolean> {
  const errMsg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const nextRetry = item.retry_count + 1;
  const isDead = nextRetry >= MAX_RETRY;

  // exponential backoff: 5min * 2^retry_count (5분, 10분, 20분)
  const backoffMin = 5 * Math.pow(2, item.retry_count);
  const nextRetryAt = new Date(Date.now() + backoffMin * 60 * 1000).toISOString();

  await supabase
    .from('esg_email_outbox')
    .update({
      status: isDead ? 'dead' : 'failed',
      retry_count: nextRetry,
      last_error: errMsg,
      next_retry_at: nextRetryAt,
    })
    .eq('id', item.id);

  return isDead;
}

// ============================================================================
// 템플릿 HTML 생성
// ============================================================================

function buildEmailHtml(templateKey: string, data: Record<string, unknown>): string {
  switch (templateKey) {
    case 'bazaar_order_created':
      return tmplBazaarOrderCreated(data);
    case 'bazaar_order_paid':
      return tmplBazaarOrderPaid(data);
    case 'bazaar_payment_reminder':
      return tmplBazaarPaymentReminder(data);
    case 'bazaar_order_expired':
      return tmplBazaarOrderExpired(data);
    case 'bazaar_order_cancelled':
      return tmplBazaarOrderCancelled(data);
    case 'auction_won':
      return tmplAuctionWon(data);
    case 'auction_cancelled':
      return tmplAuctionCancelled(data);
    case 'post_hidden':
      return tmplPostHidden(data);
    case 'donation_created':
      return tmplDonationCreated(data);
    case 'donation_paid':
      return tmplDonationPaid(data);
    case 'donation_certificate_resend':                 // ← [2026-06-16] 인증서 재발송
      return tmplDonationCertificateResend(data);
    default:
      return wrap(`<p>알 수 없는 템플릿: ${escapeHtml(templateKey)}</p>`);
  }
}

// ============================================================================
// 공통 헬퍼
// ============================================================================

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatKst(utcIso: unknown): string {
  if (!utcIso) return '-';
  const d = new Date(String(utcIso));
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function formatAmount(n: unknown): string {
  return Number(n ?? 0).toLocaleString();
}

// 공통 wrapper - 헤더/푸터
function wrap(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>C&amp;R ESG</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
      <tr><td style="background:#1a1a1a;padding:24px;text-align:center;color:#fff;">
        <div style="font-size:22px;font-weight:700;">🌳 C&amp;R ESG Event</div>
        <div style="font-size:12px;color:#aaa;margin-top:4px;">C&amp;R Research 29주년 ESG 이벤트</div>
      </td></tr>
      <tr><td style="padding:32px 28px;line-height:1.7;font-size:14px;color:#333;">${bodyHtml}</td></tr>
      <tr><td style="background:#f9fafb;padding:20px 28px;font-size:11px;color:#888;text-align:center;border-top:1px solid #eee;">
        <div>이 메일은 C&amp;R ESG 이벤트 알림입니다.</div>
        <div style="margin-top:4px;">문의: space@cnrres.com</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// 액션 버튼
function button(text: string, href: string, color = '#1a1a1a'): string {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;background:${color};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(text)}</a>
  </div>`;
}

// 정보 박스 (계좌, 주문 정보 등)
function infoBox(rows: Array<[string, string]>): string {
  const html = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#888;width:90px;">${escapeHtml(k)}</td><td style="padding:6px 0;color:#222;font-weight:600;">${v}</td></tr>`
    )
    .join('');
  return `<table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:8px;padding:14px 18px;margin:16px 0;">${html}</table>`;
}

// 강조 박스 (안내, 경고)
function alertBox(content: string, color: 'warning' | 'success' | 'danger' | 'info' = 'info'): string {
  const colors = {
    warning: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
    success: { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
    danger: { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' },
    info: { bg: '#f0f9ff', border: '#bae6fd', text: '#0c4a6e' },
  };
  const c = colors[color];
  return `<div style="padding:12px 16px;background:${c.bg};border:1px solid ${c.border};color:${c.text};border-radius:8px;margin:16px 0;font-size:13px;line-height:1.6;">${content}</div>`;
}

// ============================================================================
// 템플릿 8개
// ============================================================================

// 공통 - 입금 안내 박스 (계좌 정보 + 입금자명 + 기한)
function paymentGuideBlock(data: Record<string, unknown>): string {
  const bank = (data.bank_info ?? {}) as Record<string, unknown>;
  return `
${infoBox([
  ['은행', escapeHtml(bank.bank ?? '-')],
  ['계좌번호', escapeHtml(bank.account ?? '-')],
  ['예금주', escapeHtml(bank.holder ?? '-')],
  ['입금자명', escapeHtml(data.payer_name ?? data.user_name ?? '-')],
  ['금액', `${formatAmount(data.total_amount)}원`],
  ['입금 기한', `${formatKst(data.expires_at)} (KST)`],
])}
${bank.memo ? `<p style="font-size:12px;color:#888;margin-top:8px;">${escapeHtml(bank.memo)}</p>` : ''}
`;
}

// 1. 바자회 주문 생성
function tmplBazaarOrderCreated(data: Record<string, unknown>): string {
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">🛍 바자회 주문이 접수되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 주문해 주셔서 감사합니다.</p>
${alertBox('아래 계좌로 <strong>입금자명 일치</strong>하여 송금해 주세요.<br><strong>주문 후 15분 이내</strong>(아래 입금 기한)에 입금이 확인되지 않으면 주문이 자동 취소됩니다.', 'warning')}
${paymentGuideBlock(data)}
${infoBox([['주문번호', escapeHtml(data.order_number)]])}
${button('주문 상세 보기', `${APP_BASE_URL}/orders/${data.order_number}`)}
<p style="font-size:12px;color:#888;">입금 후 자동으로 확인되며, 관리자 확인 후 메일로 알려드립니다.</p>
`);
}

// 2. 바자회 결제 완료
function tmplBazaarOrderPaid(data: Record<string, unknown>): string {
  const isBazaar = data.order_type === 'bazaar';
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">✅ 결제가 확인되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 입금이 정상 확인되었습니다.</p>
${alertBox('💚 C&R ESG 이벤트에 참여해 주셔서 감사합니다.<br>모금된 금액은 사내 ESG 활동에 사용됩니다.', 'success')}
${infoBox([
  ['주문번호', escapeHtml(data.order_number)],
  ['상품 종류', isBazaar ? '🛍 바자회' : '🔨 경매'],
  ['결제 금액', `${formatAmount(data.total_amount)}원`],
  ['입금자명', escapeHtml(data.payer_name ?? '-')],
  ['확인 일시', `${formatKst(data.paid_at)} (KST)`],
])}
${button('주문 상세 보기', `${APP_BASE_URL}/orders/${data.order_number}`)}
`);
}

// 3. 입금 리마인더 — 입금 기한 임박 안내(동적 expires_at). [2026-06-25] 바자회는 15분 정책상 리마인더 무의미 → 크론에서 제외(경매 전용 권장).
function tmplBazaarPaymentReminder(data: Record<string, unknown>): string {
  const isBazaar = data.order_type === 'bazaar';
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">⏰ 입금 안내 (입금 기한 임박)</h2>
<p>${escapeHtml(data.user_name)}님, ${isBazaar ? '바자회' : '경매 낙찰'} 주문의 입금이 아직 확인되지 않았습니다.</p>
${alertBox('<strong>입금 기한(' + formatKst(data.expires_at) + ' KST)까지 미입금 시 주문이 자동 취소됩니다.</strong><br>취소되면 ' + (isBazaar ? '재고가 다른 분에게 돌아가며 다시 구매할 수 있습니다.' : '낙찰 권한이 소멸됩니다.'), 'warning')}
${paymentGuideBlock(data)}
${infoBox([['주문번호', escapeHtml(data.order_number)]])}
${button('지금 입금 안내 다시 보기', `${APP_BASE_URL}/orders/${data.order_number}`, '#dc2626')}
`);
}

// 4. 바자회 만료 (입금 기한 초과)
function tmplBazaarOrderExpired(data: Record<string, unknown>): string {
  const isBazaar = data.order_type === 'bazaar';
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">⌛ 입금 기한 초과로 주문이 취소되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 안타깝게도 입금 기한(주문 후 15분) 내에 입금이 확인되지 않아 주문이 자동 취소되었습니다.</p>
${infoBox([
  ['주문번호', escapeHtml(data.order_number)],
  ['주문 종류', isBazaar ? '🛍 바자회' : '🔨 경매'],
  ['금액', `${formatAmount(data.total_amount)}원`],
])}
${isBazaar
  ? alertBox('💡 바자회 상품은 다시 구매하실 수 있습니다. 재고가 자동 복원되었습니다.', 'info') + button('바자회로 돌아가기', `${APP_BASE_URL}/bazaar`)
  : alertBox('💡 안타깝게도 낙찰 권한이 소멸되었습니다. 다른 경매에도 참여해 보세요.', 'info') + button('경매로 돌아가기', `${APP_BASE_URL}/auction`)
}
`);
}

// 5. 바자회 강제 취소 (어드민)
function tmplBazaarOrderCancelled(data: Record<string, unknown>): string {
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">🚫 주문이 취소되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 관리자에 의해 주문이 취소되었습니다.</p>
${infoBox([
  ['주문번호', escapeHtml(data.order_number)],
  ['금액', `${formatAmount(data.total_amount)}원`],
  ['취소 사유', escapeHtml(data.cancelled_reason ?? '(사유 미기재)')],
])}
${alertBox('자세한 사항은 아래 문의 이메일로 연락 주세요.', 'info')}
`);
}

// 6. 경매 낙찰
function tmplAuctionWon(data: Record<string, unknown>): string {
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">🎉 경매 낙찰을 축하합니다!</h2>
<p>${escapeHtml(data.user_name)}님, 경매에서 최고가로 낙찰되셨습니다.</p>
${alertBox('🏆 낙찰 주문이 자동 생성되었습니다. 아래 계좌로 <strong>오늘 23:59(KST)까지</strong> 입금해 주세요.', 'success')}
${paymentGuideBlock(data)}
${infoBox([['주문번호', escapeHtml(data.order_number)]])}
${button('낙찰 상세 보기', `${APP_BASE_URL}/orders/${data.order_number}`, '#10b981')}
`);
}

// 7. 경매 강제 취소
function tmplAuctionCancelled(data: Record<string, unknown>): string {
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">🚫 경매가 취소되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 참여하신 경매가 관리자에 의해 취소되었습니다.</p>
${infoBox([
  ['경매 상품', escapeHtml(data.product_name)],
])}
${alertBox('💡 입찰하신 금액은 청구되지 않습니다. 다른 경매에도 참여해 보세요.', 'info')}
${button('경매로 돌아가기', `${APP_BASE_URL}/auction`)}
`);
}

// 8. 게시글 숨김
function tmplPostHidden(data: Record<string, unknown>): string {
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">📝 작성하신 게시글이 숨김 처리되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 작성하신 게시글이 관리자에 의해 숨김 처리되었음을 알려드립니다.</p>
${infoBox([
  ['제목', escapeHtml(data.title)],
])}
${alertBox('이의가 있으시면 아래 문의 이메일로 연락 주시면 검토 후 답변드리겠습니다.<br>(공익적 토론을 위한 다양한 의견은 환영합니다.)', 'info')}
`);
}

// 9. 기부 신청 (입금 안내)
function tmplDonationCreated(data: Record<string, unknown>): string {
  const bank = (data.bank_info ?? {}) as Record<string, unknown>;
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">💚 기부 신청이 접수되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 따뜻한 마음을 나눠주셔서 감사합니다.</p>
${alertBox('아래 계좌로 <strong>입금자명 일치</strong>하여 송금해 주세요.<br>오늘 23:59까지 입금이 확인되지 않으면 자동 취소됩니다.', 'warning')}
${infoBox([
  ['은행', escapeHtml(bank.bank ?? '-')],
  ['계좌번호', escapeHtml(bank.account ?? '-')],
  ['예금주', escapeHtml(bank.holder ?? '-')],
  ['입금자명', escapeHtml(data.payer_name ?? data.user_name ?? '-')],
  ['기부 금액', `${formatAmount(data.amount)}원`],
  ['입금 기한', `${formatKst(data.expires_at)} (KST)`],
])}
${infoBox([['기부 번호', escapeHtml(data.donation_number)]])}
${data.message ? `<div style="margin:16px 0;padding:14px;background:#f0fdf4;border-left:3px solid #16a34a;font-size:13px;color:#166534;line-height:1.7;"><strong>응원 메시지</strong><br>${escapeHtml(data.message)}</div>` : ''}
${button('기부 상세 보기', `${APP_BASE_URL}/donate/${data.donation_id}`, '#16a34a')}
<p style="font-size:12px;color:#888;">관리자 확인 후 자동으로 인증서가 발급되며, 이메일로 다시 안내드립니다.</p>
`);
}

// 10. 기부 입금 확인 (인증서 발급)
function tmplDonationPaid(data: Record<string, unknown>): string {
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">🎉 기부가 확인되었습니다</h2>
<p>${escapeHtml(data.user_name)}님, 따뜻한 마음에 진심으로 감사드립니다.</p>
${alertBox('💚 기부 인증서가 발급되었습니다. 아래 버튼을 눌러 확인 및 다운로드하실 수 있습니다.', 'success')}
${infoBox([
  ['기부 번호', escapeHtml(data.donation_number)],
  ['인증서 번호', escapeHtml(data.certificate_number)],
  ['기부 금액', `${formatAmount(data.amount)}원`],
  ['확인 일시', `${formatKst(data.paid_at)} (KST)`],
])}
${button('📜 인증서 보기 / 다운로드', `${APP_BASE_URL}/donate/${data.donation_id}/certificate`, '#16a34a')}
<p style="font-size:13px;color:#444;line-height:1.7;margin-top:24px;">
모금된 금액은 사내 ESG 활동과 공익 기부에 사용됩니다.<br>
보내주신 마음이 더 큰 변화로 이어질 수 있도록 소중히 사용하겠습니다.
</p>
`);
}

// 11. 기부금 인증서 재발송 ("기부금 인증서가 도착했습니다")
//     ← [2026-06-16] 깨진 링크로 잘못 전달받은 분 포함, 관리자가 선택적으로 재발송.
function tmplDonationCertificateResend(data: Record<string, unknown>): string {
  return wrap(`
<h2 style="margin:0 0 12px;font-size:18px;color:#222;">📜 기부금 인증서가 도착했습니다</h2>
<p>${escapeHtml(data.user_name)}님, 기부에 참여해 주셔서 다시 한 번 감사드립니다.</p>
${alertBox('💚 아래 버튼을 눌러 기부 인증서를 확인하고 다운로드하실 수 있습니다.', 'success')}
${infoBox([
  ['기부 번호', escapeHtml(data.donation_number)],
  ['인증서 번호', escapeHtml(data.certificate_number)],
  ['기부 금액', `${formatAmount(data.amount)}원`],
  ['확인 일시', `${formatKst(data.paid_at)} (KST)`],
])}
${button('📜 인증서 보기 / 다운로드', `${APP_BASE_URL}/donate/${data.donation_id}/certificate`, '#16a34a')}
<p style="font-size:12px;color:#888;line-height:1.7;margin-top:16px;">
이전에 받으신 안내 메일의 인증서 링크가 정상적으로 열리지 않았던 경우, 위 버튼을 이용해 주세요.<br>
문의: space@cnrres.com
</p>
`);
}
