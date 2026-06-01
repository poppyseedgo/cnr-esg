// ============================================================================
// bazaarGuideDefaults.ts — 바자회 가이드 기본값 (API 실패 시 폴백)
//
// SQL 시드 (supabase/migrations/20260601_001_seed_bazaar_guide.sql) 와
// 동일한 내용. 어드민이 esg_settings.bazaar_guide 를 수정하면 그 값이 우선.
//
// 변경 이력:
//   2026-06-01  최초 작성 (BazaarGuide 하드코딩 → API 로드 전환)
// ============================================================================

import type { EsgBazaarGuide } from '@/types/esg';

export const BAZAAR_GUIDE_DEFAULTS: EsgBazaarGuide = {
  principle: {
    highlight: '"다른 분이 기분 좋게 사용할 수 있는 상태"의 물품만 기부해 주세요.',
    subtitle: '접수 후 물품을 확인하여 게시 여부를 안내드립니다.',
  },
  categories: [
    { id: 'clothing',    name: '의류',            isNew: false, allowed: '세탁 완료, 오염·훼손·변색 없는 것',                 disallowed: '속옷·수영복 등 위생상 재판매 부적절 의류' },
    { id: 'electronics', name: '전자기기',        isNew: false, allowed: '정상 작동, 충전기·케이블 등 부속품 포함 권장',      disallowed: '파손·고장·오염이 심하여 재사용이 어려운 것' },
    { id: 'books',       name: '도서',            isNew: false, allowed: '낙서·파손 없이 읽을 수 있는 상태',                  disallowed: '낙서·찢김·심한 오염으로 읽기 어려운 것' },
    { id: 'household',   name: '생활용품',        isNew: false, allowed: '미개봉 또는 사용감이 적어 재사용 가능한 것',        disallowed: '화장품(개봉 후 변질 우려), 의약품' },
    { id: 'baby',        name: '유아용품',        isNew: false, allowed: '안전 인증 확인 가능하고 상태 양호한 장난감 등',      disallowed: '카시트 등 안전 인증이 필요한 용품' },
    { id: 'sports',      name: '스포츠·레저용품', isNew: true,  allowed: '헬스용품, 캠핑·등산 장비, 자전거 액세서리 등',      disallowed: '헬멧·안전장비 등 안전과 직결되는 용품' },
    { id: 'stationery',  name: '문구·취미용품',   isNew: true,  allowed: '미개봉 문구류, 아트·공예 재료, 악기 소품 등',       disallowed: '개봉·사용된 소모성 재료 (물감, 잉크 등)' },
    { id: 'fashion',     name: '패션 잡화',       isNew: true,  allowed: '가방, 지갑, 벨트, 모자, 스카프 등 상태 양호한 것',  disallowed: '오염·파손이 심한 것' },
    { id: 'plants',      name: '식물·원예용품',   isNew: true,  allowed: '반려식물 분양, 화분, 원예 도구 등 상태 양호한 것',  disallowed: '병충해가 있거나 상태가 불량한 식물' },
    { id: 'kitchen',     name: '키친·주방용품',   isNew: true,  allowed: '조리도구, 식기, 텀블러·보온병 등 미사용한 것',      disallowed: '파손·변형된 식기류' },
  ],
  commonDisallowed: [
    '파손·고장·오염이 심해 재사용이 어려운 모든 물품',
    '속옷·수영복 등 위생상 재판매가 부적절한 의류',
    '개봉 후 변질 우려가 있는 화장품·의약품',
    '안전 인증이 필요한 유아용품 (카시트, 유아 침대 등)',
    '헬멧·안전장비 등 안전과 직결되는 스포츠 용품',
  ],
  steps: [
    { title: '운영팀이 물품을 확인 → 게시 여부 판단', desc: '접수 후 2~3일 내 결과 안내' },
    { title: '게시 확정 → 마켓 페이지 등록 완료',   desc: '' },
    { title: '게시 불가 시 → 개별 안내',             desc: '"상태 기준에 미달하여 게시가 어렵습니다" 안내 후 물품 기부 또는 반환 선택 여부 확인' },
  ],
  footerMessage: {
    text:      '기부된 물품의 판매 수익금은 #HIGHLIGHT#으로 사용됩니다.',
    highlight: '29주년 기념 나무 심기 기부 재원',
  },
};

/**
 * footerMessage.text 에서 `#HIGHLIGHT#` 토큰을 highlight 텍스트로 치환.
 * 토큰 앞/뒤를 분리해 반환 → 컴포넌트에서 <b>로 감쌈.
 */
export function splitFooterMessage(msg: { text: string; highlight: string }): {
  before: string;
  highlight: string;
  after: string;
} {
  const idx = msg.text.indexOf('#HIGHLIGHT#');
  if (idx === -1) {
    // 토큰 없으면 강조 없이 전체 텍스트만
    return { before: msg.text, highlight: '', after: '' };
  }
  return {
    before: msg.text.slice(0, idx),
    highlight: msg.highlight,
    after: msg.text.slice(idx + '#HIGHLIGHT#'.length),
  };
}
