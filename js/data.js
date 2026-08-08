/* ═══════════════════════════ 데이터 ═══════════════════════════ */
const GOODS = {
  corn:   { nm:'옥수수', price:0, color:'#d9a520', text:'#4a3b0a' },
  fruit:  { nm:'과일',   price:1, color:'#4e8c46', text:'#fff' },
  sugar:  { nm:'설탕',   price:2, color:'#efe6d0', text:'#6b5d43' },
  tobacco:{ nm:'담배',   price:3, color:'#7b5230', text:'#fff' },
  coffee: { nm:'커피',   price:4, color:'#2f2620', text:'#fff' },
};
const GTYPES = ['corn','fruit','sugar','tobacco','coffee'];

/* zone: 채석장 할인 한도(1~4). size: 건설 부지 칸 수 */
const BUILDINGS = {
  // 생산 건물
  b_fruit_s : { nm:'소형 과일 공장', cost:1, vp:1, slots:1, zone:1, kind:'prod', prod:'fruit',  band:'#4e8c46' },
  b_sugar_s : { nm:'소형 설탕 공장', cost:2, vp:1, slots:1, zone:1, kind:'prod', prod:'sugar',  band:'#efe6d0' },
  b_fruit_l : { nm:'대형 과일 공장', cost:3, vp:2, slots:3, zone:2, kind:'prod', prod:'fruit',  band:'#4e8c46' },
  b_sugar_l : { nm:'대형 설탕 공장', cost:4, vp:2, slots:3, zone:2, kind:'prod', prod:'sugar',  band:'#efe6d0' },
  b_tobacco : { nm:'담배 공장',      cost:5, vp:3, slots:3, zone:3, kind:'prod', prod:'tobacco',band:'#7b5230' },
  b_coffee  : { nm:'커피 공장',      cost:6, vp:3, slots:2, zone:3, kind:'prod', prod:'coffee', band:'#2f2620' },
  // 일반 건물
  b_smkt  : { nm:'소형 상가',   cost:1, vp:1, slots:1, zone:1, kind:'com', fx:'판매 시 +1주화' },
  b_hac   : { nm:'대규모 농장', cost:2, vp:1, slots:1, zone:1, kind:'com', fx:'개척 시 더미에서 농장 +1' },
  b_hut   : { nm:'건설막',      cost:2, vp:1, slots:1, zone:1, kind:'com', fx:'농장 대신 채석장 가능' },
  b_swh   : { nm:'소형 창고',   cost:3, vp:1, slots:1, zone:1, kind:'com', fx:'상품 1종류 추가 저장' },
  b_hosp  : { nm:'병원',        cost:4, vp:2, slots:1, zone:2, kind:'com', fx:'개척 배치 시 일꾼 1개' },
  b_off   : { nm:'영업소',      cost:5, vp:2, slots:1, zone:2, kind:'com', fx:'상점의 중복 종류도 판매' },
  b_lmkt  : { nm:'대형 상가',   cost:5, vp:2, slots:1, zone:2, kind:'com', fx:'판매 시 +2주화' },
  b_lwh   : { nm:'대형 창고',   cost:6, vp:2, slots:1, zone:2, kind:'com', fx:'상품 2종류 추가 저장' },
  b_fact  : { nm:'공업소',      cost:7, vp:3, slots:1, zone:3, kind:'com', fx:'생산 종류 수당 +0/1/2/3/5주화' },
  b_univ  : { nm:'학교',        cost:8, vp:3, slots:1, zone:3, kind:'com', fx:'건설 시 일꾼 1개' },
  b_harb  : { nm:'항구',        cost:8, vp:3, slots:1, zone:3, kind:'com', fx:'선적마다 +1점' },
  b_wharf : { nm:'조선소',      cost:9, vp:3, slots:1, zone:3, kind:'com', fx:'가상의 수송선(단계당 1회)' },
  // 고급 건물 (부지 2칸)
  b_hall  : { nm:'시청',   cost:10, vp:4, slots:1, zone:4, kind:'big', size:2, fx:'상업 건물당 1점' },
  b_cust  : { nm:'세관',   cost:10, vp:4, slots:1, zone:4, kind:'big', size:2, fx:'승점 칩 4점당 1점' },
  b_fort  : { nm:'요새',   cost:10, vp:4, slots:1, zone:4, kind:'big', size:2, fx:'일꾼 3개당 1점' },
  b_fire  : { nm:'소방서', cost:10, vp:4, slots:1, zone:4, kind:'big', size:2, fx:'소형 생산 1점·대형 생산 2점' },
  b_resi  : { nm:'주거지', cost:10, vp:4, slots:1, zone:4, kind:'big', size:2, fx:'토지 칸 수에 따라 4~7점' },
};
const BORDER = ['b_fruit_s','b_sugar_s','b_fruit_l','b_sugar_l','b_tobacco','b_coffee',
  'b_smkt','b_hac','b_hut','b_swh','b_hosp','b_off','b_lmkt','b_lwh','b_fact','b_univ','b_harb','b_wharf',
  'b_hall','b_cust','b_fort','b_fire','b_resi'];

/* desc = 역할 타일 툴팁. 규칙을 모르는 사람이 고르기 전에 읽을 수 있어야 한다. */
const ROLES = {
  settler:    { nm:'개척자', rn:'I',   ph:'개척 단계', desc:'모두 공개된 농장 1개를 가져옵니다.\n선택자만 채석장을 가져올 수 있습니다.' },
  mayor:      { nm:'모집관', rn:'II',  ph:'모집 단계', desc:'인력 시장의 일꾼을 나눠 갖고 각자 배치합니다.\n선택자는 공급처에서 일꾼 1개를 더 받습니다.' },
  builder:    { nm:'건축가', rn:'III', ph:'건설 단계', desc:'모두 건물 1개를 건설합니다.\n선택자는 1주화 할인받습니다.' },
  craftsman:  { nm:'생산자', rn:'IV',  ph:'생산 단계', desc:'모두 농장·공장에 맞춰 상품을 생산합니다.\n선택자는 생산한 상품 1개를 추가로 받습니다.' },
  trader:     { nm:'상인',   rn:'V',   ph:'거래 단계', desc:'모두 상품 1개를 상점에 판매합니다.\n선택자는 +1주화를 더 받습니다.' },
  captain:    { nm:'선장',   rn:'VI',  ph:'선적 단계', desc:'모두 상품을 수송선에 싣고 실은 개수만큼 승점을 얻습니다.\n선택자는 +1점. 실을 수 있으면 선적은 의무입니다.' },
  prospector: { nm:'탐험가', rn:'VII', ph:'행동 없음', desc:'선택자만 공급처에서 1주화를 받습니다.\n다른 플레이어의 행동은 없습니다.' },
  prospector2:{ nm:'탐험가', rn:'VII', ph:'행동 없음', desc:'선택자만 공급처에서 1주화를 받습니다.\n다른 플레이어의 행동은 없습니다.' },
};

/* 플레이어 식별 색 — 이름·보드 테두리·역할 선점 표시·토스트에 공통 사용 */
const PCOLOR = ['#b5533c','#3f6b9e','#6f8c2f','#96588f','#b8860b'];

const PLANT_NM = { corn:'옥수수', fruit:'과일', sugar:'설탕', tobacco:'담배', coffee:'커피', quarry:'채석장' };

/* 이미지 규칙: img/역할_개척자.png · img/건물_소형과일공장.png · img/농장_옥수수.png (없으면 자동 텍스트 폴백) */
function imgTag(cat, nm, cls){
  const f = 'img/' + cat + '_' + nm.replace(/\s/g,'') + '.png';
  return '<img class="'+(cls||'')+'" src="'+f+'" alt="" onerror="this.remove()">';
}
