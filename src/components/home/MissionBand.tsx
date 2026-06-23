// ============================================================================
// MissionBand.tsx — 메인 2번째 섹션: 미션 밴드 (Figma node 1698:2229)
//
// [변경 이력]
//   2026-06-23  최초 작성 (누락 섹션 구현).
//
// [구성] 3등분 풀블리드 밴드
//   좌: 잎 사진(/home/mission-leaf.jpg, bg #d4ffbd)
//   중: #004228 — "사람과 지구의 건강을 지키는 / 우리의 사명" + C&R RESEARCH 로고
//   우: 물 사진(/home/mission-water.jpg, bg #f7eee2)
//   ※ 사진은 Figma 에셋을 public/home 에 최적화 저장. 로고는 기존 cnr-research.svg(흰색).
// ============================================================================

import './MissionBand.css';

export function MissionBand() {
  return (
    <section className="mission" aria-label="C&R 29주년 ESG 사명">
      <div className="mission__inner">
        <div className="mission__row">
          {/* 좌: 잎 사진 */}
          <div className="mission__col mission__photo mission__leaf" aria-hidden="true" />

          {/* 중: 미션 문구 + 로고 */}
          <div className="mission__col mission__center">
            <p className="mission__text">사람과 지구의 건강을 지키는<br />우리의 사명</p>
            <img className="mission__logo" src="/home/cnr-research.svg" alt="C&amp;R RESEARCH" />
          </div>

          {/* 우: 물 사진 */}
          <div className="mission__col mission__photo mission__water" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

export default MissionBand;
