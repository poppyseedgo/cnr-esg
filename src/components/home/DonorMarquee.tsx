// ============================================================================
// DonorMarquee — 메인 가로 전광판 (기부자 명단 마퀴)
//
// Figma SSOT: node 1433:295 (가로 전광판)
//   - 밴드: bg #fff, padding 16px 32px (py-16 / px-32)
//   - 최상위 항목 간격 gap 100  (날짜 · 그룹 · 날짜 · 그룹 …)
//   - 타이틀↔명단 gap 80,  칩 간격 gap 40
//   - 날짜 12px Medium #111 / 타이틀 24px Medium #111 / 이름 20px Regular #111
//   - 칩 = [40px 아바타 canvas(내부 32)] gap-4 [이름]
//
// 동작:
//   - 콘텐츠를 2회 복제 → 한 시퀀스 폭 측정(shift = 폭 + 100) → translateX(-shift) 무한 루프(seamless).
//   - 속도 일정(px/s): 명단이 길수록 duration만 늘어남.
//   - 날짜는 KST 오늘 날짜를 실시간 반영(분 단위 갱신 → 자정 롤오버).
//   - 데이터: get_main_money_donors / get_main_item_donors (노출 규칙·아바타 서버 적용).
//   - 아바타: 사진 있으면 원형, 없으면 그린 3색 클로버+이니셜(Avatar 컴포넌트 재사용).
//   - hover 시 일시정지 / prefers-reduced-motion 시 정지.
//
// 변경 이력:
//   2026-06-16  최초 작성 — Figma 1433:295 기준
// ============================================================================

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { loadMainItemDonors, loadMainMoneyDonors, type MainDonor } from '@/lib/donorWall';

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
  to   { transform: translateX(calc(-1 * var(--esg-marquee-shift, 0px))); }
}
.esg-marquee-track:hover { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .esg-marquee-track { animation: none !important; }
}
`;

const dateStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: '#111', lineHeight: 1.5, whiteSpace: 'nowrap', flexShrink: 0,
};
const titleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 500, color: '#111', lineHeight: 1.2, whiteSpace: 'nowrap', flexShrink: 0,
};
const nameStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 400, color: '#111', lineHeight: 1.3, whiteSpace: 'nowrap', flexShrink: 0,
};

export function DonorMarquee() {
  const [money, setMoney] = useState<MainDonor[]>([]);
  const [items, setItems] = useState<MainDonor[]>([]);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(kstDateStr());
  const [shift, setShift] = useState(0);
  const seqRef = useRef<HTMLDivElement>(null);

  // 데이터 로드
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [m, i] = await Promise.all([loadMainMoneyDonors(), loadMainItemDonors()]);
        if (!alive) return;
        setMoney(m);
        setItems(i);
      } catch (e) {
        console.error('[DonorMarquee]', e);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 날짜 실시간 갱신(분 단위 → 자정 롤오버 반영)
  useEffect(() => {
    const id = setInterval(() => setToday(kstDateStr()), 60_000);
    return () => clearInterval(id);
  }, []);

  const blocks: Block[] = [
    { title: '기부금 참여', donors: money },
    { title: '바자회 물품 참여', donors: items },
  ].filter((b) => b.donors.length > 0);

  // 한 시퀀스 폭 측정 → shift = 폭 + GAP (seamless 루프)
  useLayoutEffect(() => {
    const el = seqRef.current;
    if (!el) return;
    const measure = () => setShift((el.offsetWidth || 0) + GAP);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, money, items]);

  if (!ready || blocks.length === 0) return null;

  const duration = shift > 0 ? shift / SPEED : 0;

  const Sequence = ({ rootRef }: { rootRef?: React.Ref<HTMLDivElement> }) => (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: GAP, flexShrink: 0 }}>
      {blocks.map((b, bi) => (
        <Fragment key={bi}>
          <span style={dateStyle}>{today}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: TITLE_GAP, flexShrink: 0 }}>
            <span style={titleStyle}>{b.title}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: CHIP_GAP, flexShrink: 0 }}>
              {b.donors.map((d, di) => (
                <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Avatar name={d.name} avatarUrl={d.avatarUrl} size={32} />
                  </div>
                  <span style={nameStyle}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );

  return (
    <div style={{ background: '#fff', overflow: 'hidden', width: '100%' }} aria-label="기부자 명단 전광판">
      <style>{MARQUEE_CSS}</style>
      <div style={{ padding: '16px 32px' }}>
        <div
          className="esg-marquee-track"
          style={{
            display: 'flex',
            gap: GAP,
            width: 'max-content',
            alignItems: 'center',
            // CSS 변수로 shift 전달 → 키프레임이 참조
            ['--esg-marquee-shift' as string]: `${shift}px`,
            animation: duration > 0 ? `esg-marquee ${duration}s linear infinite` : undefined,
            willChange: 'transform',
          } as React.CSSProperties}
        >
          <Sequence rootRef={seqRef} />
          <Sequence />
        </div>
      </div>
    </div>
  );
}
