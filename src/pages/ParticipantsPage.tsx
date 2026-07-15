// ============================================================================
// ParticipantsPage — "참여해 주신 분들" 명단 페이지            // ← [2026-07-15 재설계]
//
// Figma SSOT: node 2508:3697 (file ydfT0xP6nc83VxFd7GyEx4)
//   · 캔버스 1920 폭 고정. 명단이 많아지면 "세로로" 길어진다(가로 고정).
//   · 명단 영역: 좌우 여백 63px → 폭 1795px. 17개 세로 컬럼.
//   · 컬럼 폭 83px, 컬럼 간격 24px  (17*83 + 16*24 = 1795)
//   · 컬럼 내부: [이름 셀 39px] / [나무 32x38] 가 세로로 "번갈아" 쌓임.
//     세로 스텝 ≈ 54.5px (이름행 높이 39 + 나무행 높이 38 을 겹치듯 촘촘히).
//   · 짝수/홀수 컬럼이 서로 엇갈림(홀 컬럼은 이름부터, 짝 컬럼은 나무부터).
//   · 이름: Pretendard Bold 30px, #111, 가운데 정렬. 나무: 원(#00FF51)+줄기.
//
// 채우기 순서(중요):
//   이름은 "컬럼을 세로로 다 채운 뒤 다음 컬럼"으로 넘어가는 열 우선(column-major).
//   각 컬럼은 이름/나무가 교차하되, 나무는 장식이라 이름 개수만 데이터로 흐른다.
//   → 컬럼당 이름 슬롯 수를 구하고, 이름을 열 우선으로 분배한다.
//
// 세로 확장 방식:
//   화면을 축소(scale)하지 않는다. 1920 폭을 뷰포트에 맞춰 축소만 하고
//   (가로 스크롤 방지), 세로는 내용만큼 늘어나 자연 스크롤된다.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadSvg, escapeXml } from '@/utils/svgExport';
import { downloadCsv, todayStampKst } from '@/utils/csv';

// ── [2026-07-15] 하드코딩 명단 ──────────────────────────────────────────────
//   한글 이름 통일이 필요해 DB(esg_participant_names) 대신 고정 배열을 쓴다.
//   명단을 갱신하려면 아래 PARTICIPANT_NAMES 배열만 수정하면 된다(순서 = 표시 순서).
//   원본 순서·중복(동명이인 가능) 그대로 유지한다.
interface Participant { name: string }

const PARTICIPANT_NAMES: string[] = [
  '윤문태',
  '윤병인',
  '안병진',
  '황진희',
  '현미숙',
  '조숙정',
  '김기남',
  '고현정',
  '송보람',
  '박찬희',
  '송지나',
  '임지원',
  '임지영',
  '김성연',
  '안나영',
  '김수빈',
  '임소희',
  '서예지',
  '허담',
  '민은영',
  '장소연',
  '김동혁',
  '이호진',
  '김한나',
  '조현자',
  '박설희',
  '한다운',
  '박소윤',
  '정나희',
  '박대우',
  '한송이',
  '정명애',
  '한혜진',
  '김수웅',
  '전인서',
  '김선영',
  '임진숙',
  '오은숙',
  '이라영',
  '이은형',
  '양영주',
  '문창호',
  '최주연',
  '최동은',
  '민희원',
  '조아라',
  '김진경',
  '김아현',
  '조윤진',
  '강예림',
  '변은미',
  '김현지',
  '방수진',
  '권미연',
  '안정수',
  '강수진',
  '이진',
  '김덕현',
  '배혜인',
  '최은별',
  '이채은',
  '최두리',
  '이상기',
  '이은주',
  '임혜민',
  '이정현',
  '양고운',
  '정민경',
  '최은심',
  '정유진',
  '안영환',
  '김채윤',
  '서현지',
  '유하나',
  '장지윤',
  '김나윤',
  '이혜진',
  '이정현',
  '임은수',
  '이주영',
  '전재은',
  '박병관',
  '박경석',
  '최윤정',
  '김나영',
  '박나현',
  '허수진',
  '김현경',
  '최혜림',
  '백수지',
  '문규선',
  '황유나',
  '이나영',
  '박재민',
  '김상숙',
  '박경희',
  '하헌철',
  '김선재',
  '장은혜',
  '강소영',
  '백도형',
  '장정임',
  '구명연',
  '박수경',
  '이정석',
  '김윤호',
  '안수민',
  '서혜림',
  '천현지',
  '전시온',
  '김은지',
  '모예린',
  '이승미',
  '권순호',
  '김나영',
  '오주은',
  '마보경',
  '황선익',
  '김연지',
  '김효원',
  '배수호',
  '민병문',
  '박소은',
  '이시현',
  '차예인',
  '장나영',
  '이경채',
  '김현선',
  '이주은',
  '김진학',
  '정유진',
  '이은혜',
  '곽수현',
  '주혜경',
  '박은석',
  '강소정',
  '김빛아름',
  '유민정',
  '유슬기',
  '손모아',
  '남기은',
  '김한나',
  '최희주',
  '이민지',
  '장건희',
  '박희려',
  '송주현',
  '김효인',
  '이화진',
  '이혜련',
  '이현아',
  '오은임',
  '김경언'
];

const PARTICIPANTS: Participant[] = PARTICIPANT_NAMES.map((name) => ({ name }));

// ── Figma 실측 상수 (1920 캔버스 좌표계) ────────────────────────────────────
const CANVAS_W = 1920;
const PAD_X = 63;               // 좌우 여백
const PAD_TOP = 187;            // 상단(제목 아래) 명단 시작 y
const PAD_BOTTOM = 63;          // 하단 여백
const COL_W = 83;               // 컬럼 폭
const COL_GAP = 24;             // 컬럼 간격
const COLS = 17;                // 컬럼 수 (고정)
const STEP = 54.5;              // 이름/나무 셀 세로 스텝
const NAME_H = 39;              // 이름 셀 높이
const TREE_H = 38;              // 나무 높이
const TREE_W = 32;              // 나무 폭
const NAME_FS = 30;            // 이름 폰트 px
const GRID_W = COLS * COL_W + (COLS - 1) * COL_GAP; // 1795

/** 업로드/피그마 나무 (원본 27:32 비율, 셀 32x38 안에 배치) */
function Tree() {
  return (
    <svg viewBox="0 0 27 32" aria-hidden="true" style={{ width: 27, height: 32, display: 'block' }}>
      <ellipse cx="13.4035" cy="13.4035" rx="13.4035" ry="13.4035" fill="#00FF51" />
      <rect x="12.2266" y="21.573" width="2.51685" height="10.427" fill="black" />
    </svg>
  );
}

/**
 * 이름 배열 → 컬럼별 이름 슬롯 배치(열 우선).
 * 각 컬럼은 rowsPerCol 개의 이름 슬롯을 가진다. 이름을 컬럼0부터 세로로 채운다.
 */
function layout(names: Participant[], rowsPerCol: number): Participant[][] {
  // ← [2026-07-15] 행 우선(row-major): 맨 윗줄을 왼→오로 먼저 채운 뒤 다음 줄로.
  //   지정 7명이 첫 "가로 줄" 왼쪽부터 나오게 하려는 요구. (이전엔 열 우선이라 첫
  //   컬럼이 앞줄이었음.) 이름 i 는 row = floor(i/COLS), col = i%COLS 에 놓인다.
  const colsNeeded = Math.max(COLS, Math.ceil(names.length / Math.max(1, rowsPerCol)));
  const cols: Participant[][] = Array.from({ length: colsNeeded }, () => []);
  names.forEach((p, i) => {
    const c = i % COLS; // 가로 위치(컬럼) = 순번 mod 컬럼수
    cols[c].push(p);
  });
  return cols;
}

export function ParticipantsPage() {
  // [2026-07-15] 하드코딩 명단 — 로딩/에러/구독 없음
  const people = PARTICIPANTS;
  const [scale, setScale] = useState(1);

  const canvasRef = useRef<HTMLDivElement>(null);

  // 뷰포트 폭에 맞춰 가로만 축소(1920 초과 방지). 세로는 내용대로 확장.
  useEffect(() => {
    const fit = () => setScale(Math.min(1, window.innerWidth / CANVAS_W));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // ── 컬럼 배치 계산 ────────────────────────────────────────────────────────
  // 기본 세로 한 화면(1080)에 들어가는 이름 슬롯 수를 기준값으로 삼되,
  // 명단이 17컬럼을 넘치면 컬럼을 추가하지 않고 각 컬럼의 이름 수를 늘려
  // "세로로 길어지게" 한다(가로 17컬럼 고정).
  const { columns, canvasH } = useMemo(() => {
    const n = people.length;
    // 17컬럼에 균등 분배했을 때 컬럼당 이름 수
    const rowsPerCol = Math.max(1, Math.ceil(n / COLS));
    const cols = layout(people, rowsPerCol);
    // 컬럼 내부 세로 길이: 이름 rowsPerCol개 + 그 사이/끝 나무들이 STEP 간격으로 교차.
    // 한 컬럼의 항목 수 = 이름 + 나무 ≈ rowsPerCol*2. 마지막 나무는 생략 가능.
    const itemsPerCol = rowsPerCol * 2; // 이름/나무 교차
    const gridH = (itemsPerCol - 1) * STEP + Math.max(NAME_H, TREE_H);
    const h = PAD_TOP + gridH + PAD_BOTTOM;
    return { columns: cols, canvasH: Math.max(1080, Math.round(h)) };
  }, [people]);

  // ── SVG 내보내기 (현재 배치를 그대로 벡터화) ──────────────────────────────
  const exportSvg = useCallback(() => {
    if (people.length === 0) return;
    const parts: string[] = [];
    const rowsPerCol = Math.max(1, Math.ceil(people.length / COLS));

    columns.forEach((colNames, ci) => {
      const colX = PAD_X + ci * (COL_W + COL_GAP);
      const startWithName = ci % 2 === 0; // 홀(0-based 짝) 컬럼은 이름부터
      let slot = 0; // 셀 인덱스(이름/나무 교차)
      colNames.forEach((p) => {
        // 이 이름 앞에 나무가 오는 교차 규칙에 맞춰 slot 전진
        if (!startWithName && slot % 2 === 0) slot++; // 나무 자리 건너뜀
        if (startWithName && slot % 2 === 1) slot++;
        const y = PAD_TOP + slot * STEP;
        // 이름(셀 중앙)
        parts.push(
          `<text x="${colX + COL_W / 2}" y="${y + NAME_H / 2}" font-size="${NAME_FS}" font-weight="700" ` +
            `fill="#111111" text-anchor="middle" dominant-baseline="central">${escapeXml(p.name)}</text>`
        );
        slot += 2; // 다음 이름은 나무 한 칸 건너
      });
      // 나무 장식: 이름 슬롯 사이사이(간단히 rowsPerCol 만큼)
      for (let t = 0; t < rowsPerCol; t++) {
        const treeSlot = startWithName ? t * 2 + 1 : t * 2;
        const y = PAD_TOP + treeSlot * STEP;
        const tx = colX + COL_W / 2 - 13.5;
        parts.push(
          `<g transform="translate(${tx} ${y}) scale(1.1875)">` +
            `<ellipse cx="13.4035" cy="13.4035" rx="13.4035" ry="13.4035" fill="#00FF51"/>` +
            `<rect x="12.2266" y="21.573" width="2.51685" height="10.427" fill="black"/></g>`
        );
      }
    });

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${canvasH}" ` +
      `viewBox="0 0 ${CANVAS_W} ${canvasH}" font-family="Pretendard, 'Apple SD Gothic Neo', sans-serif">` +
      `<rect width="${CANVAS_W}" height="${canvasH}" fill="#ffffff"/>` +
      `<text x="${CANVAS_W / 2}" y="70" font-size="56" font-weight="800" fill="#111111" text-anchor="middle">참여해 주신 분들</text>` +
      `<text x="${CANVAS_W / 2 + 250}" y="70" font-size="22" fill="#999999">총 ${people.length}명</text>` +
      parts.join('') +
      `</svg>`;
    const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    downloadSvg(`참여해주신분들_${people.length}명_${d}.svg`, svg);
  }, [people, columns, canvasH]);

  const exportCsv = useCallback(() => {
    if (people.length === 0) return;
    downloadCsv(`참여자명단_${people.length}명_${todayStampKst()}.csv`, ['이름'], people.map((p) => [p.name]));
  }, [people]);

  const rowsPerCol = Math.max(1, Math.ceil(people.length / COLS));

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* 1920 폭 고정 캔버스: 가로만 축소, 세로는 내용대로. 상단 정렬(길어지면 스크롤) */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          ref={canvasRef}
          style={{
            width: CANVAS_W,
            minHeight: 1080,
            height: canvasH,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            flex: 'none',
            background: '#fff',
            position: 'relative',
          }}
        >
          {/* 제목 */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 40, textAlign: 'center' }}>
            <span style={{ fontSize: 56, fontWeight: 800, color: '#111', letterSpacing: '-1px' }}>참여해 주신 분들</span>
            <span style={{ fontSize: 22, color: '#999', marginLeft: 16, verticalAlign: 'middle' }}>총 {people.length}명</span>
          </div>

          {/* 명단 그리드 */}
          <div style={{ position: 'absolute', left: PAD_X, top: PAD_TOP, width: GRID_W }}>
            {people.length === 0 ? (
              <p style={{ fontSize: 24, color: '#aaa' }}>아직 참여자가 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', gap: COL_GAP, alignItems: 'flex-start' }}>
                {columns.map((colNames, ci) => {
                  const startWithName = ci % 2 === 0;
                  // 이 컬럼의 셀 시퀀스를 [이름|나무] 교차로 생성
                  const cells: { type: 'name' | 'tree'; p?: Participant }[] = [];
                  let ni = 0;
                  const total = rowsPerCol * 2;
                  for (let s = 0; s < total; s++) {
                    const isNameSlot = startWithName ? s % 2 === 0 : s % 2 === 1;
                    if (isNameSlot && ni < colNames.length) {
                      cells.push({ type: 'name', p: colNames[ni++] });
                    } else {
                      cells.push({ type: 'tree' });
                    }
                  }
                  return (
                    <div key={ci} style={{ width: COL_W, position: 'relative', height: (total - 1) * STEP + NAME_H }}>
                      {cells.map((cell, si) => {
                        const y = si * STEP;
                        if (cell.type === 'name' && cell.p) {
                          return (
                            <div
                              key={si}
                              style={{
                                position: 'absolute', top: y, left: 0, width: COL_W, height: NAME_H,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <span
                                data-name="1"
                                style={{ fontSize: NAME_FS, fontWeight: 700, color: '#111', lineHeight: 1.3, whiteSpace: 'nowrap' }}
                              >
                                {cell.p.name}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={si}
                            style={{
                              position: 'absolute', top: y + (STEP - TREE_H) / 2, left: (COL_W - TREE_W) / 2,
                              width: TREE_W, height: TREE_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <Tree />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 툴바 — 우하단 고정(뷰포트 기준). SVG/CSV 결과물엔 미포함 */}
      {people.length > 0 && (
        <div
          style={{ position: 'fixed', right: 20, bottom: 20, display: 'flex', gap: 8, opacity: 0.25, transition: 'opacity .2s', zIndex: 10 }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.25'; }}
        >
          <button type="button" onClick={exportCsv} style={{ padding: '10px 14px', background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>⬇ CSV (이름)</button>
          <button type="button" onClick={exportSvg} style={{ padding: '10px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>⬇ SVG 저장</button>
          <button type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen(); }} style={{ padding: '10px 14px', background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>⛶ 전체화면</button>
        </div>
      )}
    </div>
  );
}

export default ParticipantsPage;
