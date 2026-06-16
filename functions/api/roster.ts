// ============================================================================
// C&R ESG 참여자 명단 — 동적 SVG 엔드포인트
// 배치: cnr-esg/functions/api/roster.ts  →  https://esg.cnrres.store/api/roster
// 용도: 그룹웨어 공지 <img src="https://esg.cnrres.store/api/roster"> 로 삽입
//
// 핵심:
//  - 메인페이지와 "동일한" RPC(get_main_item_donors / get_main_money_donors) 호출 → 명단 SSOT
//  - 두 RPC 모두 SECURITY DEFINER + visibility 필터 내장 → 공개 명단만 반환
//  - is_anonymous=true 는 표시 단계에서 "익명" 마스킹(이름/부서 절대 노출 안 함)
//  - Cache-Control: no-store → 공지를 열 때마다 항상 최신
//  - <img> 임베드 SVG 보안모드 대응: 외부 리소스/스크립트 0, 시스템 한글폰트만 사용
//    (avatar_url 은 외부 이미지라 img-SVG에서 차단되므로 seed 기반 이니셜 원으로 대체)
// ============================================================================

// ── 레이아웃 상수 ──────────────────────────────────────────────────────────
const W = 800;
const PAD = 40;
const COLW = 352;          // (W - PAD*2 - GAP) / 2  = (800-80-16)/2 = 352
const GAP = 16;
const CELLH = 56;
const CELLGAP = 12;

// ── 진입점 (Cloudflare Pages Function) ─────────────────────────────────────
export async function onRequestGet(context) {                       // ← GET 요청 처리
  const env = (context && context.env) || {};                       // ← Pages 런타임 환경변수
  // Pages Function 런타임은 대시보드의 모든 env(VITE_ 평문 포함)를 context.env 로 받음
  const SUPABASE_URL =
    env.SUPABASE_URL || env.VITE_SUPABASE_URL ||                     // ← VITE_ 변수도 그대로 읽힘
    "https://jjzcqpbwkkujttwxksvy.supabase.co";                     // ← 최후 기본값
  const SUPABASE_ANON_KEY =
    env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;            // ← 둘 중 존재하는 anon 키 사용

  let items = [];                                                   // ← 물품 기부자
  let monies = [];                                                  // ← 금액 기부자
  let errMsg = "";                                                  // ← 디버그용(공개로는 노출 안 함)

  try {
    if (!SUPABASE_ANON_KEY) throw new Error("ENV_MISSING:ANON_KEY"); // ← SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY 둘 다 없음
    const [a, b] = await Promise.all([                              // ← 메인페이지와 동일 RPC 2개 병렬 호출
      callRpc(SUPABASE_URL, SUPABASE_ANON_KEY, "get_main_item_donors"),
      callRpc(SUPABASE_URL, SUPABASE_ANON_KEY, "get_main_money_donors"),
    ]);
    items = Array.isArray(a) ? a : [];                              // ← 방어적 배열 보정
    monies = Array.isArray(b) ? b : [];
  } catch (e) {
    errMsg = String((e && e.message) ? e.message : e);              // ← 코멘트로만 남김
  }

  const svg = errMsg ? renderError(errMsg) : renderRoster(items, monies); // ← 실패 시 안내 카드

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",              // ← <img> 가 SVG로 렌더
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", // ← 캐시 금지 = 항상 최신
      "Pragma": "no-cache",
      "Access-Control-Allow-Origin": "*",                          // ← (무해) 어디서 불러도 OK
    },
  });
}

// ── Supabase RPC 호출 (anon 키) ────────────────────────────────────────────
async function callRpc(baseUrl, anonKey, fn) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/${fn}`, {        // ← PostgREST RPC 엔드포인트
    method: "POST",
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${anonKey}`,                        // ← anon 키 Bearer
      "Content-Type": "application/json",
    },
    body: "{}",                                                    // ← 인자 없는 함수
  });
  if (!res.ok) throw new Error(`${fn}:${res.status}`);             // ← 권한/네트워크 오류 표면화
  return await res.json();
}

// ── 명단 SVG 렌더 ──────────────────────────────────────────────────────────
function renderRoster(items, monies) {
  const startY = 112;                                              // ← 헤더 아래 시작 y
  const secA = buildSection("물품 기부", items, startY);
  const secB = buildSection("금액 기부", monies, secA.endY + 12);
  const footY = secB.endY + 18;                                    // ← 푸터 y
  const H = footY + 30;                                            // ← 전체 높이(동적)
  const stamp = kstStamp();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <style>
    text{font-family:'Malgun Gothic','Apple SD Gothic Neo','맑은 고딕','Noto Sans KR','Nanum Gothic',sans-serif;}
    .title{font-size:24px;font-weight:800;fill:#00422C;}
    .sub{font-size:13px;fill:#5B6B63;}
    .sec{font-size:16px;font-weight:700;fill:#10241B;}
    .cnt{font-size:13px;font-weight:600;fill:#3E9F5B;}
    .ini{font-size:15px;font-weight:700;fill:#ffffff;}
    .nm{font-size:14px;font-weight:600;fill:#111111;}
    .dp{font-size:11px;fill:#8A8F8C;}
    .empty{font-size:13px;fill:#9AA39E;}
    .foot{font-size:12px;fill:#8A8F8C;}
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="20" fill="#F3F7F4" stroke="#E1EAE5"/>
  <text x="${PAD}" y="52" class="title">함께해주신 분들</text>
  <text x="${PAD}" y="74" class="sub">C&amp;R 29주년 ESG · 모두의 참여로 만들어갑니다</text>
  <line x1="${PAD}" y1="92" x2="${W - PAD}" y2="92" stroke="#DCE7E1" stroke-width="1"/>
${secA.svg}
${secB.svg}
  <text x="${PAD}" y="${footY + 14}" class="foot">마지막 업데이트 ${stamp} KST · 공지를 새로 열 때마다 자동 갱신됩니다</text>
</svg>`;
}

// ── 섹션(물품/금액) 빌드 ────────────────────────────────────────────────────
function buildSection(title, donors, startY) {
  let y = startY;
  let s = "";
  s += `  <rect x="${PAD}" y="${y}" width="6" height="22" rx="3" fill="#6DED73"/>
  <text x="${PAD + 16}" y="${y + 17}" class="sec">${esc(title)} <tspan class="cnt">${donors.length}명</tspan></text>`;
  y += 40;

  if (donors.length === 0) {
    s += `\n  <text x="${PAD}" y="${y + 16}" class="empty">아직 참여자가 없습니다</text>`;
    return { svg: s, endY: y + 36 };
  }

  for (let i = 0; i < donors.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = PAD + col * (COLW + GAP);
    const cy = y + row * (CELLH + CELLGAP);
    s += "\n" + donorCell(donors[i], cx, cy);
  }
  const rows = Math.ceil(donors.length / 2);
  y += rows * (CELLH + CELLGAP);
  return { svg: s, endY: y + 4 };
}

// ── 기부자 셀 1개 ───────────────────────────────────────────────────────────
function donorCell(d, x, yy) {
  const anon = !!(d && d.is_anonymous);                            // ← 익명 플래그
  const name = anon ? "익명" : ((d && d.donor_name) || "익명");    // ← 익명이면 무조건 마스킹
  const dept = anon ? "" : ((d && d.donor_dept) || "");            // ← 익명이면 부서도 숨김
  const initial = (name || "·").slice(0, 1);                       // ← 첫 글자 이니셜
  const fill = anon ? "#C9CFCC" : seedColor((d && d.seed) || name); // ← seed 기반 색(익명=중립회색)
  const r = 18;
  const cyc = yy + CELLH / 2;
  const tx = x + 20 + r * 2 + 12;                                  // ← 텍스트 시작 x
  let g = `  <rect x="${x}" y="${yy}" width="${COLW}" height="${CELLH}" rx="12" fill="#FFFFFF" stroke="#E6EDE9"/>
  <circle cx="${x + 20 + r}" cy="${cyc}" r="${r}" fill="${fill}"/>
  <text x="${x + 20 + r}" y="${cyc + 5}" text-anchor="middle" class="ini">${esc(initial)}</text>
  <text x="${tx}" y="${dept ? cyc - 2 : cyc + 5}" class="nm">${esc(trunc(name, 11))}</text>`;
  if (dept) g += `\n  <text x="${tx}" y="${cyc + 15}" class="dp">${esc(trunc(dept, 14))}</text>`;
  return g;
}

// ── 오류 시 안내 카드(공개 노출은 일반 문구, 원인은 코멘트로만) ──────────────
function renderError(msg) {
  const safe = String(msg).replace(/--+/g, "-");                  // ← XML 코멘트 안전화
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="120" viewBox="0 0 ${W} 120">
  <style>text{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;}</style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="119" rx="20" fill="#F3F7F4" stroke="#E1EAE5"/>
  <text x="${PAD}" y="56" font-size="18" font-weight="700" fill="#00422C">함께해주신 분들</text>
  <text x="${PAD}" y="82" font-size="13" fill="#8A8F8C">명단을 준비하고 있습니다. 잠시 후 다시 확인해 주세요.</text>
  <!-- ${esc(safe)} -->
</svg>`;
}

// ── 유틸 ────────────────────────────────────────────────────────────────────
function kstStamp() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);               // ← UTC→KST
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

function seedColor(seed) {                                         // ← seed(md5) → 안정적 색상(hex)
  const str = String(seed || "");
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return hslToHex(h % 360, 0.55, 0.62);                            // ← hsl() 미지원 렌더러 대비 hex
}

function hslToHex(hDeg, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hDeg / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hDeg < 60) { r = c; g = x; }
  else if (hDeg < 120) { r = x; g = c; }
  else if (hDeg < 180) { g = c; b = x; }
  else if (hDeg < 240) { g = x; b = c; }
  else if (hDeg < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function trunc(s, n) {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 테스트 하니스용 export(런타임엔 영향 없음)
export { renderRoster, renderError };
