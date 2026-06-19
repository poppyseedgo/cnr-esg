// ============================================================================
// DonorMarquee — 메인 가로 전광판 (기부자 명단 마퀴)
//
// Figma SSOT: node 1433:295 (가로 전광판)
//   - 밴드: bg #fff, py 16 / 풀블리드(100vw)
//   - 최상위 항목 간격 gap 100, 타이틀↔명단 gap 80, 칩 간격 gap 40
//   - 날짜 12px Medium #111 / 타이틀 24px Medium #111 / 이름 20px Regular #111
//   - 칩 = [40px 아바타 canvas(내부 32)] gap-4 [이름]
//
// 이음매(seamless) 설계:
//   - 각 사이클 요소(날짜/그룹)에 margin-right: GAP → 복제본이 자체 간격을 포함.
//   - 콘텐츠(사이클)를 짝수 개 복제해 translateX(0 → -50%) 무한 루프.
//     · -50% = 정확히 절반(=halfCount 사이클) → 모든 사이클이 동일하므로 완벽히 타일링.
//     · 폭 측정은 "속도(duration)와 복제 수"에만 사용 → 측정 오차가 있어도 끊기지 않음.
//   - 화면보다 짧으면 halfCount를 늘려 빈 공간 없이 채움.
//   - hover 일시정지 / prefers-reduced-motion 정지.
//
// 풀너비: 부모(max-width 1360 래퍼)를 깨고 100vw로 — HomeHero와 동일 기법
//   margin-inline: calc(50% - 50vw) + 래퍼 상단 padding(24) 상쇄.
//
// 변경 이력:
//   2026-06-16  최초 작성 — Figma 1433:295
//   2026-06-16  [수정] 풀블리드(100vw) + margin 기반 seamless 루프로 재작성(끊김/너비 해결)
//   2026-06-17  [수정] 밴드 세로 패딩 16px → 24px (고지님 요청, Figma py16 대비 상향)
// ============================================================================

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Avatar } from '@/components/Avatar';
import {
  loadMainItemDonors,
  loadMainMoneyDonors,
  subscribeDonorWall,
  type MainDonor,
} from '@/lib/donorWall';

const GAP = 100;       // 최상위 항목 간격 (Figma gap-100)
const TITLE_GAP = 80;  // 타이틀↔명단 (Figma gap-80)
const CHIP_GAP = 40;   // 칩 간격 (Figma gap-40)
const SPEED = 60;      // px/s — 전광판 스크롤 속도

interface Block {
  title: string;
  donors: MainDonor[];
}

/** KST 오늘 날짜 'YYYY/M/D' (앞자리 0 없음 — Figma "2026/6/16") */
function kstDateStr(): string {
  const k = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}/${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

const MARQUEE_CSS = `
@keyframes esg-marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
.esg-marquee-track:hover { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .esg-marquee-track { animation: none !important; }
}
`;

const dateStyle: CSSProperties = {
  fontSize: 12, fontWeight: 500, color: '#111', lineHeight: 1.5, whiteSpace: 'nowrap',
};
const titleStyle: CSSProperties = {
  fontSize: 24, fontWeight: 500, color: '#111', lineHeight: 1.2, whiteSpace: 'nowrap', marginRight: TITLE_GAP,
};
const nameStyle: CSSProperties = {
  fontSize: 20, fontWeight: 400, color: '#111', lineHeight: 1.3, whiteSpace: 'nowrap',
};

/** 한 사이클(날짜+그룹 … 반복)의 React 노드 배열. 각 최상위 요소는 margin-right: GAP 로 자체 간격 보유. */
function buildCycle(blocks: Block[], today: string, keyPrefix: string): ReactNode[] {
  const els: ReactNode[] = [];
  blocks.forEach((b, bi) => {
    // 날짜
    els.push(
      <span
        key={`${keyPrefix}-d${bi}`}
        style={{ display: 'inline-flex', alignItems: 'center', marginRight: GAP, ...dateStyle }}
      >
        {today}
      </span>
    );
    // 타이틀 + 명단
    els.push(
      <span
        key={`${keyPrefix}-g${bi}`}
        style={{ display: 'inline-flex', alignItems: 'center', marginRight: GAP }}
      >
        <span style={titleStyle}>{b.title}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: CHIP_GAP }}>
          {b.donors.map((dn, di) => {
            const label = dn.isAnonymous ? '익명' : dn.name;
            return (
              <span key={di} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 40, height: 40, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Avatar
                    name={label}
                    avatarUrl={dn.isAnonymous ? null : dn.avatarUrl}
                    anonymous={dn.isAnonymous}   // 게시판과 동일: 익명 클로버(이니셜 없음)
                    colorSeed={dn.seed}           // 사람별 색 고정(비식별 시드)
                    size={32}
                  />
                </span>
                <span style={nameStyle}>{label}</span>
              </span>
            );
          })}
        </span>
      </span>
    );
  });
  return els;
}

export function DonorMarquee() {
  const [money, setMoney] = useState<MainDonor[]>([]);
  const [items, setItems] = useState<MainDonor[]>([]);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(kstDateStr());

  const [cycleW, setCycleW] = useState(0);   // 한 사이클 폭(측정)
  const [containerW, setContainerW] = useState(0); // 밴드(=100vw) 폭

  const measureRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);

  // 데이터 조회(재사용). 라이브 갱신 시 언마운트 없이 state만 교체 → 스크롤 유지.
  const reload = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([loadMainMoneyDonors(), loadMainItemDonors()]);
      setMoney(m);
      setItems(i);
    } catch (e) {
      console.error('[DonorMarquee]', e);
    } finally {
      setReady(true);
    }
  }, []);

  // 최초 로드 + 라이브 구독(시그널) + 탭 복귀 시 재조회(안전망)
  useEffect(() => {
    let alive = true;
    reload();

    // 시그널 버스트 합치기(여러 변경이 짧게 몰릴 때 1회만 재조회)
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (alive) reload();
      }, 800);
    };
    const unsubscribe = subscribeDonorWall(debouncedReload);

    // 백그라운드였다가 돌아오면 한 번 맞춰줌(구독 누락 대비)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && alive) reload();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  // 날짜 실시간 갱신(분 단위 → 자정 롤오버 반영)
  useEffect(() => {
    const id = setInterval(() => setToday(kstDateStr()), 60_000);
    return () => clearInterval(id);
  }, []);

  const blocks: Block[] = [
    { title: '기부금 참여', donors: money },
    { title: '바자회 물품 참여', donors: items },
  ].filter((b) => b.donors.length > 0);

  // 한 사이클 폭 + 밴드 폭 측정(폰트 로드/리사이즈 반영). 측정은 속도/복제수 산출용.
  useLayoutEffect(() => {
    const m = measureRef.current;
    const band = bandRef.current;
    if (!m || !band) return;
    const measure = () => {
      setCycleW(m.scrollWidth || 0);
      setContainerW(band.clientWidth || 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(m);
    ro.observe(band);
    // 폰트 로드 후 재측정(텍스트 폭 변동 대비)
    (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [ready, money, items]);

  if (!ready || blocks.length === 0) return null;

  // 절반이 화면을 덮도록 halfCount 산출 → copies = 짝수, -50%가 정확히 절반
  const halfCount =
    cycleW > 0 && containerW > 0 ? Math.max(1, Math.ceil(containerW / cycleW)) : 1;
  const copies = halfCount * 2;
  const duration = cycleW > 0 ? (halfCount * cycleW) / SPEED : 0;

  return (
    <div
      ref={bandRef}
      aria-label="기부자 명단 전광판"
      style={{
        // 풀블리드(100vw): 부모 max-width/padding 상쇄 + 헤더 밀착, Hero 밀착 유지
        width: 'auto',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        marginTop: -24,
        marginBottom: 24,
        background: '#fff',
        overflow: 'hidden',
        padding: '24px 0', // ← 세로 패딩 16px→24px (고지님 요청 2026-06-17)
      }}
    >
      <style>{MARQUEE_CSS}</style>

      {/* 측정용(숨김) — 한 사이클 */}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          top: 0,
          left: 0,
        }}
      >
        {buildCycle(blocks, today, 'measure')}
      </div>

      {/* 실제 트랙 — 사이클을 copies 개 복제, -50% 루프 */}
      <div
        className="esg-marquee-track"
        style={{
          display: 'flex',
          alignItems: 'center',
          width: 'max-content',
          animation: duration > 0 ? `esg-marquee ${duration}s linear infinite` : undefined,
          willChange: 'transform',
        }}
      >
        {Array.from({ length: copies }).map((_, ci) => (
          <Fragment key={ci}>{buildCycle(blocks, today, `c${ci}`)}</Fragment>
        ))}
      </div>
    </div>
  );
}
