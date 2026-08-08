/* ═══════════════ 데이터 ═══════════════
   반복되는 목록(역할·상품·건물…)만 데이터로 두고 스크립트가 그린다.
   한 번 그리면 끝 — 상태를 갖는 것은 탭 전환과 라운드 흐름 스테퍼뿐. */

const TABS = [
  { id:'intro', label:'게임 소개' },
  { id:'how', label:'게임 하는 방법' },
  { id:'goods', label:'상품과 교역' },
  { id:'buildings', label:'건물' },
  { id:'end', label:'종료와 점수' },
  { id:'play', label:'플레이' },
];

const ROLES = [
  { num:'I', name:'개척자', phase:'개척 단계', action:'공개된 농장 타일 1개를 가져와 토지 칸에 놓습니다.', bonus:'농장 대신 채석장 1개를 가져올 수 있습니다.', notes:[
    '토지 칸은 12곳. 다 차면 더 이상 타일을 받을 수 없습니다.',
    '단계가 끝나면 남은 공개 타일을 버리고 (인원수+1)개를 새로 공개합니다.',
    '점유된 건설막이 있으면 개척자가 아니어도 채석장을 가져올 수 있습니다.',
    '점유된 병원이 있으면 방금 놓은 타일 위에 공급처의 일꾼 1개를 바로 올립니다.',
    '점유된 대규모 농장이 있으면 뒷면 더미에서 농장 1개를 추가로 받습니다.' ] },
  { num:'II', name:'모집관', phase:'모집 단계', action:'인력 시장이 빌 때까지 돌아가며 일꾼을 1개씩 가져갑니다.', bonus:'공급처에서 일꾼 1개를 먼저 가져갑니다.', notes:[
    '모집관의 혜택 일꾼은 인력 시장이 아니라 공급처에서 나옵니다.',
    '이 단계에는 자기 일꾼 전부를 자유롭게 재배치할 수 있습니다.',
    '빈 원형 칸이 있는 한 일꾼은 반드시 배치해야 하고, 남은 일꾼만 개인판 초상화에 보관됩니다.',
    '단계 끝에, 모든 사람의 건물에 남은 빈 칸 수만큼 인력 시장을 채웁니다(최소 인원수만큼).' ] },
  { num:'III', name:'건축가', phase:'건설 단계', action:'비용을 내고 건물 1개를 건설해 건설 부지에 놓습니다.', bonus:'건설 비용을 1주화 깎습니다.', notes:[
    '점유된 채석장 1개마다 1주화 할인. 단 보관판 위쪽 줄일수록 한도가 낮습니다(1·2·3·4개).',
    '고급 건물은 위아래로 이어진 빈 2칸이 필요합니다.',
    '같은 건물을 두 번 짓지는 못하고, 지은 건물을 치울 수도 없습니다.',
    '점유된 학교가 있으면 방금 지은 건물에 공급처의 일꾼 1개를 바로 올립니다.' ] },
  { num:'IV', name:'생산자', phase:'생산 단계', action:'점유된 농장과 생산 건물에 따라 상품을 가져옵니다.', bonus:'방금 생산한 종류 중 1개를 추가로 가져옵니다.', notes:[
    '옥수수는 공장이 필요 없습니다. 점유된 옥수수 농장 1개당 1개.',
    '나머지 넷은 점유된 농장 수와 공장의 일꾼 수 중 적은 쪽만큼 생산됩니다.',
    '점유된 공업소가 있으면 생산한 종류 수에 따라 +0/1/2/3/5주화.',
    '규칙서의 경고 — 가장 위험한 역할입니다. 남의 생산량도 함께 보세요.' ] },
  { num:'V', name:'상인', phase:'거래 단계', action:'상점 타일에 자기 상품 1개를 팔고 주화를 받습니다.', bonus:'판매가에 1주화를 더 받습니다.', notes:[
    '상점은 4칸, 같은 종류는 1개까지(점유된 영업소는 예외).',
    '점유된 소형 상가 +1주화, 대형 상가 +2주화, 둘 다면 +3주화.',
    '모두 기회를 가진 뒤 4칸이 꽉 찼다면 전부 치웁니다. 비어 있으면 그대로 남습니다.',
    '옥수수는 0주화지만, 상점 칸을 막기 위해 팔 수도 있습니다.' ] },
  { num:'VI', name:'선장', phase:'선적 단계', action:'더 실을 수 없을 때까지 돌아가며 수송선에 상품을 싣습니다.', bonus:'이번 단계 첫 선적에 1점 칩을 더 받습니다.', notes:[
    '유일하게 생략할 수 없는 역할입니다. 실을 수 있으면 반드시 싣습니다.',
    '배 1척에는 한 종류만, 다른 배에 이미 실린 종류는 실을 수 없습니다.',
    '한 번에 한 종류씩, 가장 많이 실리는 배를 골라 최대한 실어야 합니다.',
    '상품 1개당 1승점. 점유된 항구는 선적할 때마다 +1점.',
    '점유된 조선소는 단계당 한 번, 한 종류 전부를 가상의 배로 보내 그 수만큼 승점을 받습니다.' ] },
  { num:'VII', name:'탐험가', phase:'행동 없음', action:'아무도 아무 행동을 하지 않습니다.', bonus:'은행에서 1주화를 가져갑니다.', notes:[
    '3인 게임에서는 2개, 4인은 1개를 빼고 사용합니다.',
    '쌓인 주화를 회수하거나, 남에게 좋은 역할을 넘기지 않기 위한 선택지입니다.' ] },
];

/* 역할별 미니 다이어그램 — 규칙의 핵심 동작을 색 타일로 보여주는 장식.
   데이터화하기엔 저마다 구조가 달라, 역할 순서대로 HTML 조각을 둔다. */
const DIAGRAMS = [
  /* I 개척자 */
  '<div class="diagram"><div><div class="lbl">공개된 농장</div><div class="row6">'
  +'<span class="tile" style="background:#d9a520"></span><span class="tile" style="background:#e8dcc2"></span>'
  +'<span class="tile a-coin" style="background:#4e8c46"></span></div></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">내 토지 칸</div><div style="display:grid; grid-template-columns:repeat(4,28px); gap:6px">'
  +'<span class="tile" style="background:#7b5230"></span><span class="tile" style="background:#d9a520"></span>'
  +'<span class="tile slot a-wait"></span><span class="tile slot"></span>'
  +'<span class="tile a-top" style="background:#4e8c46"></span><span class="tile slot"></span>'
  +'<span class="tile slot"></span><span class="tile slot"></span></div></div></div>',
  /* II 모집관 */
  '<div class="diagram"><div><div class="lbl">인력 시장</div>'
  +'<div class="row7" style="padding:10px 12px; border:1px solid var(--line); background:var(--panel); border-radius:2px">'
  +'<span class="wk"></span><span class="wk"></span><span class="wk"></span><span class="wk" style="opacity:.25"></span></div></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">내 타일의 빈 원형 칸</div><div style="display:flex; gap:10px">'
  +'<span class="circ"><span class="wk a-left"></span></span>'
  +'<span class="circ"><span class="wk a-left d35"></span></span>'
  +'<span class="circ a-wait"></span></div></div></div>',
  /* III 건축가 */
  '<div class="diagram"><div><div class="lbl">비용 지불</div><div class="row6" style="align-items:center">'
  +'<span class="coin"></span><span class="coin"></span><span class="coin a-coin"></span></div></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">내 건설 부지</div><div style="display:grid; grid-template-columns:repeat(4,30px); gap:6px">'
  +'<span style="width:30px;height:22px;border-radius:2px;background:#e2d7c2;border:1px solid #c9bda6"></span>'
  +'<span style="width:30px;height:22px;border-radius:2px;background:#e2d7c2;border:1px solid #c9bda6"></span>'
  +'<span style="width:30px;height:22px;border-radius:2px;border:1px dashed #c9bda6"></span>'
  +'<span style="width:30px;height:22px;border-radius:2px;border:1px dashed #c9bda6"></span>'
  +'<span class="a-top" style="width:30px;height:22px;border-radius:2px;background:var(--accent);border:1px solid rgba(0,0,0,.2)"></span>'
  +'<span class="a-wait" style="width:30px;height:22px;border-radius:2px;border:1px dashed #c9bda6"></span>'
  +'<span style="width:30px;height:22px;border-radius:2px;border:1px dashed #c9bda6"></span>'
  +'<span style="width:30px;height:22px;border-radius:2px;border:1px dashed #c9bda6"></span></div></div></div>',
  /* IV 생산자 */
  '<div class="diagram" style="gap:26px"><div><div class="lbl">점유된 농장</div><div class="row6">'
  +'<span class="tile" style="background:#e8dcc2;display:inline-flex;align-items:center;justify-content:center"><span class="wk" style="width:11px;height:11px"></span></span>'
  +'<span class="tile" style="background:#e8dcc2;display:inline-flex;align-items:center;justify-content:center"><span class="wk" style="width:11px;height:11px"></span></span></div></div>'
  +'<span class="arrow">＋</span>'
  +'<div><div class="lbl">점유된 설탕 공장</div>'
  +'<div class="row7" style="padding:8px 10px; border:1px solid #c9bda6; background:var(--panel); border-radius:2px">'
  +'<span class="circ" style="width:22px;height:22px"><span class="wk" style="width:11px;height:11px"></span></span>'
  +'<span class="circ" style="width:22px;height:22px"><span class="wk" style="width:11px;height:11px"></span></span></div></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">설탕 2개</div><div class="row7">'
  +'<span class="goodtok a-pop" style="background:#e8dcc2"></span>'
  +'<span class="goodtok a-pop d3" style="background:#e8dcc2"></span></div></div></div>',
  /* V 상인 */
  '<div class="diagram" style="gap:26px"><div><div class="lbl">내 상품 · 커피 1개</div>'
  +'<span class="goodtok" style="width:24px;height:24px;background:#2f2620;display:block"></span></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">상점 타일 · 종류별 1개씩</div>'
  +'<div class="row7" style="padding:9px 11px; border:1px solid #c9bda6; background:var(--panel); border-radius:2px">'
  +'<span class="tile slot" style="width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center"><span class="goodtok" style="width:15px;height:15px;background:#d9a520"></span></span>'
  +'<span class="tile slot" style="width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center"><span class="goodtok" style="width:15px;height:15px;background:#7b5230"></span></span>'
  +'<span class="tile slot a-wait" style="width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center"><span class="goodtok a-pop" style="width:15px;height:15px;background:#2f2620"></span></span>'
  +'<span class="tile slot" style="width:24px;height:24px"></span></div></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">은행에서 5주화 (판매가 4 ＋ 상인 혜택 1)</div><div class="row6">'
  +'<span class="coin a-coin d2"></span><span class="coin a-coin d35"></span><span class="coin a-coin d5"></span>'
  +'<span class="coin a-coin d65"></span><span class="coin hi a-coin d8"></span></div></div></div>',
  /* VI 선장 */
  '<div class="diagram"><div><div class="lbl">수송선 5칸에 내 설탕 2개를 싣는다</div>'
  +'<div class="row6" style="padding:9px 12px; border:1px solid #c9bda6; background:var(--panel); border-radius:0 0 12px 12px">'
  +'<span class="tile slot" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center"><span class="goodtok" style="width:14px;height:14px;background:#e8dcc2"></span></span>'
  +'<span class="tile slot" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center"><span class="goodtok" style="width:14px;height:14px;background:#e8dcc2"></span></span>'
  +'<span class="tile slot" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center"><span class="goodtok a-left" style="width:14px;height:14px;background:#e8dcc2"></span></span>'
  +'<span class="tile slot" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center"><span class="goodtok a-left d25" style="width:14px;height:14px;background:#e8dcc2"></span></span>'
  +'<span class="tile slot a-wait" style="width:22px;height:22px"></span></div></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">승점 3점 (선적 2 ＋ 선장 혜택 1)</div><div class="row7">'
  +'<span class="vptok a-pop d2"></span><span class="vptok a-pop d4"></span>'
  +'<span class="vptok a-pop d6" style="background:var(--accent)"></span></div></div></div>',
  /* VII 탐험가 */
  '<div class="diagram"><div><div class="lbl">탐험가 타일 · 쌓인 주화</div>'
  +'<div style="position:relative; width:120px; height:44px; border:1px solid #c9bda6; background:var(--panel); border-radius:2px; display:flex; align-items:center; justify-content:center; gap:6px">'
  +'<span class="coin"></span><span class="coin"></span></div></div>'
  +'<span class="arrow">→</span>'
  +'<div><div class="lbl">은행에서 ＋1, 합계 3주화</div><div class="row6">'
  +'<span class="coin a-coin" style="width:22px;height:22px"></span>'
  +'<span class="coin a-coin d2" style="width:22px;height:22px"></span>'
  +'<span class="coin hi a-coin d4" style="width:22px;height:22px"></span></div></div></div>',
];

const FLOW = [
  { n:'01', title:'주지사가 역할 선택', desc:'주지사 타일을 가진 사람이 역할 타일 하나를 골라 자기 앞에 놓습니다. 타일 위에 주화가 쌓여 있었다면 전부 가져갑니다.', note:'이 라운드 동안 다른 사람은 그 역할을 고를 수 없습니다.', seat:0, roles:['생산자 선택','대기','대기','대기'] },
  { n:'02', title:'고른 사람이 먼저 수행', desc:'역할을 고른 사람이 그 행동을 수행하면서 특별 혜택까지 함께 받습니다.', note:'혜택은 오직 고른 사람만. 행동은 하지 않고 넘길 수도 있습니다(선장은 예외).', seat:0, roles:['행동 + 혜택','대기','대기','대기'] },
  { n:'03', title:'시계 방향으로 전원 수행', desc:'왼쪽 사람부터 차례로 같은 행동을 수행합니다. 혜택은 없습니다.', note:'기준은 주지사가 아니라 그 역할을 고른 사람입니다.', seat:2, roles:['완료','완료','행동만','대기'] },
  { n:'04', title:'왼쪽 사람이 다음 역할 선택', desc:'남은 역할 타일 중 하나를 골라 같은 과정을 반복합니다. 모두가 하나씩 고를 때까지 이어집니다.', note:'남은 타일이 줄어들수록 선택은 좁아집니다. 순서 자체가 자원입니다.', seat:1, roles:['완료','상인 선택','대기','대기'] },
  { n:'05', title:'라운드 종료', desc:'아무도 고르지 않은 역할 타일 위에 은행에서 1주화씩 올립니다. 모든 타일을 제자리로, 주지사 타일은 왼쪽 사람에게 넘깁니다.', note:'주화가 쌓인 역할은 다음 라운드에 훨씬 매력적인 선택지가 됩니다.', seat:1, roles:['완료','다음 주지사','완료','완료'] },
];
const SEAT_NAMES = ['가영','나정','도준','민수'];

const GOODS = [
  { name:'옥수수', color:'#d9a520', farm:'옥수수 농장', factory:'필요 없음', price:'0', note:'점유된 농장 1개당 1개. 팔아도 돈은 없지만 즉시 승점이 됩니다.' },
  { name:'과일', color:'#4e8c46', farm:'과일 농장', factory:'소형 · 대형 과일 공장', price:'1', note:'농장이 12개로 가장 흔합니다. 초반 생산의 중심.' },
  { name:'설탕', color:'#e8dcc2', farm:'설탕 농장', factory:'소형 · 대형 설탕 공장', price:'2', note:'농장 11개. 대량 생산과 대량 선적에 강합니다.' },
  { name:'담배', color:'#7b5230', farm:'담배 농장', factory:'담배 공장', price:'3', note:'공장이 대형 하나뿐. 일꾼 3개까지 올릴 수 있습니다.' },
  { name:'커피', color:'#2f2620', farm:'커피 농장', factory:'커피 공장', price:'4', note:'농장 8개로 가장 귀합니다. 적게 만들어 비싸게 팝니다.' },
];

const QUARRY_LIMITS = [
  { row:'1–2번째 줄', desc:'가장 싼 건물들', max:'1' },
  { row:'3–4번째 줄', desc:'중간 가격대', max:'2' },
  { row:'5–6번째 줄', desc:'비싼 건물들', max:'3' },
  { row:'7번째 줄', desc:'고급 건물', max:'4' },
];

const PROD_BUILDINGS = [
  { name:'소형 과일 공장', cost:'1', color:'#4e8c46', desc:'수확한 과일을 관리합니다. 일꾼 칸이 적은 소형 공장.' },
  { name:'대형 과일 공장', cost:'3', color:'#4e8c46', desc:'일꾼을 더 올려 과일을 더 많이 생산합니다.' },
  { name:'소형 설탕 공장', cost:'2', color:'#e8dcc2', desc:'사탕수수에서 설탕을 정제합니다.' },
  { name:'대형 설탕 공장', cost:'4', color:'#e8dcc2', desc:'설탕 대량 생산용. 농장 수가 받쳐 줘야 합니다.' },
  { name:'담배 공장', cost:'5', color:'#7b5230', desc:'담뱃잎을 건조해 담배를 만듭니다.' },
  { name:'커피 공장', cost:'6', color:'#2f2620', desc:'생두를 원두로 로스팅합니다.' },
];

const COMMON_BUILDINGS = [
  { name:'소형 상가', cost:'1', phase:'거래', desc:'상점에 상품을 팔 때 1주화를 더 받습니다.' },
  { name:'대형 상가', cost:'5', phase:'거래', desc:'상점에 상품을 팔 때 2주화를 더 받습니다.' },
  { name:'영업소', cost:'5', phase:'거래', desc:'상점에 이미 놓인 종류와 같은 상품도 팔 수 있습니다.' },
  { name:'소형 창고', cost:'3', phase:'선적', desc:'선적 단계 끝에 아무 1종류를 개수 무관하게 더 보관합니다.' },
  { name:'대형 창고', cost:'6', phase:'선적', desc:'아무 2종류를 개수 무관하게 더 보관합니다.' },
  { name:'항구', cost:'8', phase:'선적', desc:'선적 행동을 할 때마다 1점 칩을 더 받습니다.' },
  { name:'조선소', cost:'9', phase:'선적', desc:'단계당 한 번, 한 종류 전부를 반납하고 그 수만큼 승점을 받습니다.' },
  { name:'대규모 농장', cost:'2', phase:'개척', desc:'뒷면 더미에서 농장 1개를 추가로 가져와 앞면으로 놓습니다.' },
  { name:'건설막', cost:'2', phase:'개척', desc:'공개된 농장 대신 채석장 타일을 가져올 수 있습니다.' },
  { name:'병원', cost:'4', phase:'개척', desc:'농장·채석장을 놓으면 그 타일 위에 공급처의 일꾼 1개를 올립니다.' },
  { name:'학교', cost:'8', phase:'건설', desc:'건물을 지으면 그 건물 위에 공급처의 일꾼 1개를 올립니다.' },
  { name:'공업소', cost:'7', phase:'생산', desc:'생산한 상품 종류 수에 따라 +0/1/2/3/5주화를 받습니다.' },
];

const LUX_BUILDINGS = [
  { name:'소방서', cost:'10', desc:'소형 생산 건물 1개당 +1점, 대형 생산 건물 1개당 +2점.' },
  { name:'주거지', cost:'10', desc:'타일이 놓인 토지 칸이 1~9 / 10 / 11 / 12곳이면 +4 / 5 / 6 / 7점.' },
  { name:'요새', cost:'10', desc:'개인판의 모든 일꾼 3개마다 +1점.' },
  { name:'세관', cost:'10', desc:'자기 승점 칩 4점마다 +1점(건물 승점은 제외).' },
  { name:'시청', cost:'10', desc:'자기 상업 건물 1개마다 +1점(시청 자신도 포함).' },
];

const END_CONDITIONS = [
  { n:'01', title:'일꾼이 모자랄 때', desc:'모집 단계 끝에 인력 시장을 필요한 만큼 채울 수 없는 경우.' },
  { n:'02', title:'건설 부지가 다 찼을 때', desc:'건설 단계 동안 누군가 자기 건설 부지 12칸을 모두 채운 경우.' },
  { n:'03', title:'승점 칩이 떨어졌을 때', desc:'어느 단계든 공급처에 승점 칩이 남아 있지 않은 경우. 이후 점수는 따로 적어 둡니다.' },
];

const SCORING = [
  { title:'승점 칩', desc:'선적한 상품 1개당 1점, 선장 · 항구 · 조선소 보너스까지. 따로 적어 둔 점수도 포함합니다.', tag:'선적에서' },
  { title:'건물의 승점', desc:'타일 오른쪽 위 검은 육각형의 숫자. 점유 여부와 무관하게 전부 더합니다.', tag:'개인판에서' },
  { title:'점유된 고급 건물의 추가 승점', desc:'소방서 · 주거지 · 요새 · 세관 · 시청의 조건 점수. 일꾼이 올라가 있어야만 계산됩니다.', tag:'점유된 경우만' },
];

/* ═══════════════ 렌더 (로드 시 1회) ═══════════════ */
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.getElementById('nav').innerHTML = TABS.map(t=>
  '<button data-tab="'+t.id+'" onclick="go(\''+t.id+'\')">'+esc(t.label)+'</button>').join('');

document.getElementById('roles').innerHTML = ROLES.map((r,i)=>
  '<div class="role-row" id="role-'+i+'">'
  +'<button class="role-head" onclick="roleToggle('+i+')" aria-expanded="false">'
    +'<span class="num">'+r.num+'</span>'
    +'<span><span class="nm">'+esc(r.name)+'</span><span class="ph">'+esc(r.phase)+'</span></span>'
    +'<span class="act">'+esc(r.action)+'</span>'
    +'<span class="bon">＋ '+esc(r.bonus)+'</span>'
    +'<span class="mark">+</span>'
  +'</button>'
  +'<div class="role-body"><div class="inner">'
    +DIAGRAMS[i]
    +'<div class="role-notes">'+r.notes.map(n=>'<div><span>·</span><span>'+esc(n)+'</span></div>').join('')+'</div>'
  +'</div></div></div>').join('');

document.getElementById('goodsRows').innerHTML = GOODS.map(g=>
  '<tr><td><span class="gname"><span class="goodtok" style="width:16px;height:16px;background:'+g.color+'"></span>'+esc(g.name)+'</span></td>'
  +'<td>'+esc(g.farm)+'</td><td>'+esc(g.factory)+'</td>'
  +'<td class="price">'+esc(g.price)+'</td><td class="note">'+esc(g.note)+'</td></tr>').join('');

document.getElementById('quarryRows').innerHTML = QUARRY_LIMITS.map(q=>
  '<div class="row"><span class="r">'+esc(q.row)+'</span><span class="d">'+esc(q.desc)+'</span>'
  +'<span class="m">최대 '+esc(q.max)+'개</span></div>').join('');

document.getElementById('prodGrid').innerHTML = PROD_BUILDINGS.map(b=>
  '<div class="bcell"><div class="head"><span class="chip" style="background:'+b.color+'"></span>'
  +'<span class="nm">'+esc(b.name)+'</span><span class="cost">$'+esc(b.cost)+'</span></div>'
  +'<div class="desc">'+esc(b.desc)+'</div></div>').join('');

document.getElementById('commonGrid').innerHTML = COMMON_BUILDINGS.map(b=>
  '<div class="bcell common"><div><div class="nm">'+esc(b.name)+'</div><div class="ph">'+esc(b.phase)+'</div></div>'
  +'<div class="desc">'+esc(b.desc)+'</div><div class="cost">$'+esc(b.cost)+'</div></div>').join('');

document.getElementById('luxGrid').innerHTML = LUX_BUILDINGS.map(b=>
  '<div class="bcell lux"><div class="head"><span class="nm">'+esc(b.name)+'</span>'
  +'<span class="cost">$'+esc(b.cost)+'</span></div><div class="desc">'+esc(b.desc)+'</div></div>').join('');

document.getElementById('endGrid').innerHTML = END_CONDITIONS.map(e=>
  '<div><div class="n">'+e.n+'</div><div class="t">'+esc(e.title)+'</div><div class="d">'+esc(e.desc)+'</div></div>').join('');

document.getElementById('scoreRows').innerHTML = SCORING.map(s=>
  '<div class="row"><div><h3>'+esc(s.title)+'</h3><div class="d">'+esc(s.desc)+'</div></div>'
  +'<div class="tag">'+esc(s.tag)+'</div></div>').join('');

document.getElementById('flowTabs').innerHTML = FLOW.map((f,i)=>
  '<button data-step="'+i+'" onclick="flowGo('+i+')">'
  +'<div class="fn">'+f.n+'</div><div class="ft">'+esc(f.title)+'</div></button>').join('');

/* ═══════════════ 탭 전환 ═══════════════ */
/* 게임 입장 전환 막 — 문서에서 게임으로 하드 컷되지 않게 잠깐 덮었다 걷는다.
   너무 빨리 걷히면 깜빡임으로 보여서 최소 노출 시간을 지키고,
   게임의 ready 신호가 안 오는 환경(메시지 차단)에서도 타임아웃으로 반드시 걷는다. */
let enterShownAt=0, enterHideT=null, enterFailT=null;
function enterShow(){
  const ov=document.getElementById('playEnter');
  clearTimeout(enterHideT); clearTimeout(enterFailT);
  ov.hidden=false; enterShownAt=Date.now();
  requestAnimationFrame(()=>ov.classList.add('in'));
  enterFailT=setTimeout(enterHide, 3500);   // ready 신호가 영영 안 와도 걷는다
}
function enterHide(){
  const ov=document.getElementById('playEnter');
  if(ov.hidden) return;
  clearTimeout(enterHideT); clearTimeout(enterFailT);
  const wait=Math.max(0, 900-(Date.now()-enterShownAt));   // 최소 0.9초는 보여준다
  enterHideT=setTimeout(()=>{
    ov.classList.remove('in');                             // opacity 트랜지션으로 스르르
    setTimeout(()=>{ ov.hidden=true; }, 520);
  }, wait);
}
function enterCancel(){
  const ov=document.getElementById('playEnter');
  clearTimeout(enterHideT); clearTimeout(enterFailT);
  ov.classList.remove('in'); ov.hidden=true;
}
function go(id){
  document.querySelectorAll('.tab-page').forEach(el=>el.classList.toggle('on', el.id==='tab-'+id));
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on', b.dataset.tab===id));
  // 플레이 탭: 처음 열 때에만 게임을 iframe으로 로드 (미리 로드하면 봇 게임이 뒤에서 돌아간다)
  // 플레이 탭은 화면 전체를 게임에 내준다 (헤더·푸터·안내줄을 감춘다)
  document.body.classList.toggle('playing', id==='play');
  if(id==='play'){
    enterShow();
    const f=document.getElementById('playFrame');
    // ?v= — 브라우저가 예전 게임 파일을 캐시해 두고 그걸 다시 띄우는 걸 막는다 (로컬 파일이라 캐시 이득은 없다)
    if(!f.src) f.src='game.html?v='+Date.now();
    else enterHide();   // 이미 로드된 게임으로 돌아가는 경우 — 잠깐 덮었다 바로 걷는다
    // 게임이 자기 헤더에 "← 소개로"를 그렸다고 알려오지 않으면(=메시지가 막힌 환경) 이쪽 버튼을 띄운다
    setTimeout(()=>document.body.classList.toggle('needs-back', !playReady), 1500);
  } else {
    enterCancel();   // 플레이를 떠나면 입장 막도 즉시 치운다
  }
  window.scrollTo(0,0);
}
let playReady=false;
window.addEventListener('message', function(e){
  if(e.data==='pr1897:ready'){ playReady=true; document.body.classList.remove('needs-back'); enterHide(); }
  else if(e.data==='pr1897:back'){ go('intro'); }
});

/* ═══════════════ 역할 아코디언 ═══════════════ */
function roleToggle(i){
  const row=document.getElementById('role-'+i);
  const open=row.classList.toggle('open');
  row.querySelector('.mark').textContent = open?'−':'+';
  row.querySelector('.role-head').setAttribute('aria-expanded', open);
}

/* ═══════════════ 라운드 흐름 스테퍼 ═══════════════ */
let flowStep=0, flowPlaying=false, flowTimer=null;
function flowRender(){
  const f=FLOW[flowStep];
  document.querySelectorAll('#flowTabs button').forEach((b,i)=>b.classList.toggle('on', i===flowStep));
  document.getElementById('flowBar').style.width=((flowStep+1)/FLOW.length*100).toFixed(1)+'%';
  document.getElementById('flowTitle').textContent=f.title;
  document.getElementById('flowDesc').textContent=f.desc;
  document.getElementById('flowNote').textContent=f.note;
  document.getElementById('flowSeats').innerHTML=SEAT_NAMES.map((nm,i)=>
    '<div class="seat'+(f.seat===i?' on':'')+'"><span class="nm">'+esc(nm)+'</span>'
    +'<span class="rl">'+esc(f.roles[i])+'</span></div>').join('');
  document.getElementById('flowPlay').textContent = flowPlaying?'■ 정지':'▶ 자동 재생';
}
function flowGo(i){ flowStep=i; flowStop(); flowRender(); }
function flowPrev(){ flowStep=(flowStep+FLOW.length-1)%FLOW.length; flowStop(); flowRender(); }
function flowNext(){ flowStep=(flowStep+1)%FLOW.length; flowStop(); flowRender(); }
function flowStop(){ flowPlaying=false; clearInterval(flowTimer); }
function flowToggle(){
  flowPlaying=!flowPlaying;
  clearInterval(flowTimer);
  if(flowPlaying) flowTimer=setInterval(()=>{ flowStep=(flowStep+1)%FLOW.length; flowRender(); },1800);
  flowRender();
}

flowRender();
go('intro');
