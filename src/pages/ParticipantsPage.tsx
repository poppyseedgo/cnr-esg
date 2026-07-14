// ============================================================================
// ParticipantsPage — "참여해 주신 분들" 16:9 전체화면 페이지   // ← [2026-07-14]
//
// 요구:
//   - 참여자 수가 몇 명이든 한 화면(16:9)에 전부 들어가야 한다 → auto-fit.
//   - 이름 사이에 나무 SVG(업로드 원본: 27×32, #00FF51 원 + 검정 줄기).
//   - [2026-07-14] 익명 마스킹 없음 — 익명 기부자도 실명 표기(서버 RPC에서 실명 반환).
//
// 설계(임시방편 없이):
//   1) 캔버스는 1920×1080 고정. 뷰포트에는 transform: scale(contain) 로 맞춘다.
//      → 프로젝터/모니터 해상도가 달라도 항상 정확한 16:9, 레이아웃 재계산 없음.
//   2) 폰트 크기는 "이분 탐색 + 실측(scrollHeight)". 명단 컨테이너의 font-size 를
//      후보값으로 바꿔가며 실제 줄바꿈 결과 높이를 재고, 가용 높이에 들어가는
//      최대값을 찾는다. 이름 길이/줄바꿈은 브라우저가 결정하므로 추정식(글자수×폭)
//      으로는 절대 정확할 수 없다 → 실측이 유일한 정답.
//   3) 명단 내부 치수는 전부 em 기준(나무 크기·간격 포함) → font-size 하나로 동시 축소.
//   4) 폰트 하한(MIN_FS)에서도 넘치면 그때만 화면 내 스크롤 대신 하한 고정 + 경고 없이
//      가독 최소치를 지킨다(=인원 폭증 시에도 깨지지 않음).
// ============================================================================

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadParticipants, subscribeParticipants, type Participant } from '@/lib/participants';
import { downloadSvg, escapeXml } from '@/utils/svgExport'; // ← [2026-07-14] SVG 내보내기
import { downloadCsv, todayStampKst } from '@/utils/csv';    // ← [2026-07-14] 이름 CSV 내보내기

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const MAX_FS = 40; // 폰트 상한(px, 캔버스 좌표계)
const MIN_FS = 11; // 폰트 하한 — 이보다 작아지면 읽을 수 없으므로 고정

/** 업로드된 나무 SVG (원본 비율 27:32 유지, 크기는 em 으로 상속) */
function Tree() {
  return (
    <svg
      viewBox="0 0 27 32"
      aria-hidden="true"
      data-tree="1" /* ← [2026-07-14] SVG 내보내기 좌표 측정 대상 */
      style={{ height: '1.15em', width: 'auto', flex: 'none', display: 'block' }}
    >
      <ellipse cx="13.4035" cy="13.4035" rx="13.4035" ry="13.4035" fill="#00FF51" />
      <rect x="12.2266" y="21.573" width="2.51685" height="10.427" fill="black" />
    </svg>
  );
}

export function ParticipantsPage() {
  const [people, setPeople] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(MAX_FS);
  const [scale, setScale] = useState(1);

  const wallRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);   // 명단이 쓸 수 있는 영역(가용 높이 측정)
  const canvasRef = useRef<HTMLDivElement>(null); // 1920×1080 캔버스(SVG 좌표 원점)

  const load = useCallback(async () => {
    try {
      setError(null);
      setPeople(await loadParticipants());
    } catch (e) {
      setError(e instanceof Error ? e.message : '참여자 명단을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeParticipants(() => void load()); // 신규 참여 실시간 반영
  }, [load]);

  // ── 뷰포트 맞춤 (contain) ───────────────────────────────────────────────
  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
      setScale(s);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // ── auto-fit: 이분 탐색 + 실측 ──────────────────────────────────────────
  useLayoutEffect(() => {
    const wall = wallRef.current;
    const area = areaRef.current;
    if (!wall || !area || people.length === 0) return;

    const avail = area.clientHeight; // 캔버스 좌표계 기준 가용 높이(스케일 무관)
    const fits = (fs: number): boolean => {
      wall.style.fontSize = `${fs}px`;
      return wall.scrollHeight <= avail;
    };

    let lo = MIN_FS;
    let hi = MAX_FS;
    let best = MIN_FS;
    if (fits(MAX_FS)) {
      best = MAX_FS;
    } else {
      // 12회면 0.01px 미만까지 수렴 (범위 29px)
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
    }
    const finalFs = Math.floor(best * 10) / 10;
    wall.style.fontSize = `${finalFs}px`;
    setFontSize(finalFs);
  }, [people]);

  // ── CSV 내보내기 (이름 1열) ─────────────────────────────────────────────
  //   화면에 보이는 순서(최초 참여 순) 그대로, 헤더 1줄 + 이름 1줄씩.
  //   부서/참여유형은 넣지 않는다(요청: "목록 이름만").
  const exportCsv = useCallback(() => {
    if (people.length === 0) return;
    downloadCsv(
      `참여자명단_${people.length}명_${todayStampKst()}.csv`,
      ['이름'],
      people.map((p) => [p.name])
    );
  }, [people]);

  // ── SVG 내보내기 ────────────────────────────────────────────────────────
  //   화면에 이미 auto-fit 된 "실제 레이아웃"을 그대로 좌표로 떠서 SVG 로 굽는다.
  //   (레이아웃을 SVG 안에서 다시 계산하면 브라우저 줄바꿈과 어긋난다 → 실측이 정답)
  //   결과물은 1920×1080 벡터 — 인쇄/현수막/슬라이드에 그대로 쓸 수 있다.
  const exportSvg = useCallback(() => {
    const canvas = canvasRef.current;
    const wall = wallRef.current;
    if (!canvas || !wall || people.length === 0) return;

    const origin = canvas.getBoundingClientRect();
    const s = scale || 1; // 화면 스케일 → 캔버스 좌표로 환산
    const toX = (v: number) => Math.round(((v - origin.left) / s) * 100) / 100;
    const toY = (v: number) => Math.round(((v - origin.top) / s) * 100) / 100;

    const parts: string[] = [];

    // 이름 (baseline 대신 중앙정렬 — 실제 박스 중앙에 맞춤)
    wall.querySelectorAll<HTMLElement>('[data-name]').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const p = people[i];
      const fs = Math.round((parseFloat(getComputedStyle(el).fontSize) / s) * 100) / 100;
      parts.push(
        `<text x="${toX(r.left)}" y="${toY(r.top + r.height / 2)}" font-size="${fs}" font-weight="700" ` +
          `fill="#111111" dominant-baseline="central">${escapeXml(p?.name ?? '')}</text>` // ← [2026-07-14] 익명 구분 없이 동일 색
      );
    });

    // 나무 (원본 27×32 도형을 실제 크기로 스케일)
    wall.querySelectorAll<SVGElement>('[data-tree]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const h = r.height / s;
      const k = Math.round((h / 32) * 1000) / 1000;
      parts.push(
        `<g transform="translate(${toX(r.left)} ${toY(r.top)}) scale(${k})">` +
          `<ellipse cx="13.4035" cy="13.4035" rx="13.4035" ry="13.4035" fill="#00FF51"/>` +
          `<rect x="12.2266" y="21.573" width="2.51685" height="10.427" fill="black"/>` +
          `</g>`
      );
    });

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" ` +
      `viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" font-family="Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif">` +
      `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#ffffff"/>` +
      `<text x="72" y="104" font-size="56" font-weight="800" fill="#111111">참여해 주신 분들</text>` +
      `<text x="420" y="104" font-size="22" fill="#999999">총 ${people.length}명</text>` +
      parts.join('') +
      `<text x="72" y="1035" font-size="18" fill="#bbbbbb">C&amp;R 29주년 창립기념일 ESG</text>` +
      `</svg>`;

    const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    downloadSvg(`참여해주신분들_${people.length}명_${d}.svg`, svg);
  }, [people, scale]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        ref={canvasRef}
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flex: 'none',
          background: '#fff',
          padding: '64px 72px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, flex: 'none' }}>
          <h1 style={{ margin: 0, fontSize: 56, fontWeight: 800, color: '#111', letterSpacing: '-1px' }}>
            참여해 주신 분들
          </h1>
          {!loading && !error && (
            <span style={{ fontSize: 22, color: '#999' }}>총 {people.length}명</span>
          )}
        </div>

        {/* 명단 영역(가용 높이 측정 기준) */}
        <div ref={areaRef} style={{ flex: 1, minHeight: 0, marginTop: 44, position: 'relative' }}>
          {loading ? (
            <p style={{ fontSize: 24, color: '#aaa' }}>불러오는 중…</p>
          ) : error ? (
            <p style={{ fontSize: 24, color: '#dc2626' }}>⚠️ {error}</p>
          ) : people.length === 0 ? (
            <p style={{ fontSize: 24, color: '#aaa' }}>아직 참여자가 없습니다.</p>
          ) : (
            <div
              ref={wallRef}
              style={{
                fontSize, // auto-fit 결과(px) — 내부 치수는 전부 em
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                alignContent: 'flex-start',
                rowGap: '0.9em',
                lineHeight: 1.2,
              }}
            >
              {people.map((p, i) => (
                <span
                  key={p.key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.75em',
                    paddingRight: '0.75em',
                  }}
                >
                  <span
                    data-name="1" /* ← [2026-07-14] SVG 내보내기 좌표 측정 대상 */
                    style={{
                      fontSize: '1em',
                      fontWeight: 700,
                      color: '#111', // ← [2026-07-14] 익명 마스킹/구분 표시 제거 — 전원 동일 표기
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </span>
                  {i < people.length - 1 && <Tree />}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ flex: 'none', marginTop: 16, fontSize: 18, color: '#bbb' }}>
          C&amp;R 29주년 창립기념일 ESG
        </div>
      </div>

      {/* ← [2026-07-14] 툴바 — 화면 우하단 고정. 스케일 밖(캔버스 외부)이라 SVG 결과물엔 포함되지 않음.
           송출 중 방해되지 않도록 평소 반투명, 마우스 올리면 진해짐. */}
      {!loading && !error && people.length > 0 && (
        <div
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            display: 'flex',
            gap: 8,
            opacity: 0.25,
            transition: 'opacity .2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.25'; }}
        >
          <button
            type="button"
            onClick={exportCsv}
            style={{
              padding: '10px 14px', background: '#fff', color: '#333', border: '1px solid #ddd',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ⬇ CSV (이름)
          </button>
          <button
            type="button"
            onClick={exportSvg}
            style={{
              padding: '10px 14px', background: '#111', color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ⬇ SVG 저장
          </button>
          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen();
            }}
            style={{
              padding: '10px 14px', background: '#fff', color: '#333', border: '1px solid #ddd',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ⛶ 전체화면
          </button>
        </div>
      )}
    </div>
  );
}

export default ParticipantsPage;
