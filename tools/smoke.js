/* 헤드리스 스모크 테스트 — `node tools/smoke.js`
   game.html의 <script> 로드 순서 그대로 js 파일들을 실행하고 AI 4인 게임을 끝까지 돌린다.
   렌더는 DOM 스텁으로 흡수되므로 화면은 검증하지 못하지만, 파일 분리로 생길 수 있는
   참조 누락·로드 순서 문제와 규칙 엔진의 예외는 전부 여기서 걸린다.
   규칙 로직을 고쳤다면 이걸 돌린 뒤에 반드시 브라우저에서도 한 판 확인할 것. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = process.argv[2] || path.join(__dirname, '..');

/* ── 최소 DOM 스텁 ── */
function makeEl() {
  const el = {
    innerHTML: '', className: '', id: '',
    style: { setProperty(){}, removeProperty(){} },
    children: { length: 0 },
    clientWidth: 1400, scrollTop: 0, scrollHeight: 0,
    firstElementChild: null,
    appendChild(){}, replaceChild(){}, remove(){},
    classList: { toggle(){}, add(){}, remove(){} },
    onclick: null,
  };
  el.firstElementChild = null;
  return el;
}
const els = {};
global.document = {
  getElementById(id){ if(!(id in els)) els[id] = makeEl(); return els[id]; },
  createElement(){ const e = makeEl(); e.firstElementChild = makeEl(); return e; },
  addEventListener(){},
  body: makeEl(),
  lastModified: '01/01/2026 00:00:00',
};
global.window = { addEventListener(){}, self: {}, top: {}, parent: { postMessage(){} } };
global.window.self = global.window; global.window.top = global.window; // EMBEDDED=false
global.innerWidth = 1400; global.innerHeight = 900;
// 브라우저에서는 window.innerWidth === innerWidth 다. 스텁의 window에 없으면 boardMetrics의
// 1단(모바일) 분기를 영영 못 타서, 폭 회귀 테스트가 데스크톱 경로만 검사하게 된다.
global.window.innerWidth = 1400; global.window.innerHeight = 900;
global.localStorage = (() => { const m = {}; return {
  getItem: k => (k in m ? m[k] : null), setItem: (k,v) => { m[k]=String(v); }, removeItem: k => { delete m[k]; },
};})();
global.alert = () => {}; global.confirm = () => true;

/* AI 타이머(1500ms)를 기다리지 않도록 지연을 축소 */
const realSetTimeout = setTimeout;
global.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms || 0, 1) );

/* ── game.html의 <script src> 순서 그대로 로드 ── */
const html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8');
/* vendor(supabase UMD)는 브라우저 전역을 전제하므로 헤드리스에선 건너뛴다 —
   net.js가 supabase 미로드를 감지해 온라인 기능만 조용히 끈다 (로컬 플레이 검증에는 무관) */
const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1])
  .filter(f => !f.startsWith('js/vendor/'));
/* js/ 의 게임 파일(intro.js는 소개 페이지 전용)이 빠짐없이 game.html에 로드되는지 —
   파일을 만들고 script 태그를 잊는 실수를 잡는다 */
const expect = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'intro.js').map(f => 'js/' + f);
const missing = expect.filter(f => !order.includes(f));
if (missing.length) { console.error('game.html에 로드되지 않는 js 파일:', missing.join(', ')); process.exit(1); }
/* 파일별로 따로 실행 — 브라우저가 <script>를 하나씩 실행하는 것과 같은 조건.
   vm.runInThisContext는 스크립트 간 전역 let/const 바인딩을 공유한다. */
for (const f of order) {
  try {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  } catch (e) { console.error('로드 실패 (' + f + '):', e); process.exit(1); }
}

/* ── 보드 폭 회귀 테스트 ──
   1단(모바일) 레이아웃에서 boardMetrics가 "건설 부지·토지 6칸이 컨테이너 안에 다 들어가는"
   타일 폭을 주는지. 예전에는 1000px 이하에서 null을 반환해 축소가 통째로 꺼졌고,
   그래서 모바일에서 오른쪽 칸이 화면 밖으로 잘려나갔다 — 그 사고를 막는 잠금장치다.
   2단(데스크톱) 경로는 값을 바꾸지 않았으므로 "예전과 같은 범위인지"만 확인한다. */
{
  const players = document.getElementById('rd-players');
  const BOARD_PAD = 31, BGRID_GAP = 15, LGRID_GAP = 20;
  const setW = (screenW, contW) => {
    global.innerWidth = screenW; global.window.innerWidth = screenW; players.clientWidth = contW;
  };
  const failed = [];
  // 1단: (화면 폭, #rd-players 폭) — 화면 폭에서 .wrap 좌우 여백만 뺀 값
  for (const [screenW, contW] of [[320,300],[360,340],[390,370],[430,410],[768,748],[1000,980]]) {
    for (const n of [2,3,4,5]) {
      setW(screenW, contW);
      const m = vm.runInThisContext('boardMetrics(' + n + ')');
      if (!m || !m.narrow) { failed.push(screenW + 'px ' + n + '인 → 1단 분기를 타지 않음'); continue; }
      const need = 6 * m.bw + BGRID_GAP + BOARD_PAD, needL = 6 * m.lw + LGRID_GAP + BOARD_PAD;
      if (need > contW + 1) failed.push(screenW + 'px ' + n + '인 → 건설 부지 ' + need + 'px > ' + contW + 'px');
      if (needL > contW + 1) failed.push(screenW + 'px ' + n + '인 → 토지 ' + needL + 'px > ' + contW + 'px');
    }
  }
  // 2단: 기존 동작 유지 확인 (타일 폭이 상·하한 안, 판 폭이 내용보다 넓지 않음)
  for (const [screenW, contW] of [[1200,872],[1512,1108]]) {
    for (const n of [2,3,4,5]) {
      setW(screenW, contW);
      const m = vm.runInThisContext('boardMetrics(' + n + ')');
      if (!m || m.narrow) { failed.push(screenW + 'px ' + n + '인 → 2단 분기를 타지 않음'); continue; }
      if (m.bw < 62 || m.bw > 119) failed.push(screenW + 'px ' + n + '인 → 타일 ' + m.bw + 'px가 상·하한 밖');
      if (m.cbw < 118) failed.push(screenW + 'px ' + n + '인 → 접힌 카드 ' + m.cbw + 'px < 118px');
    }
  }
  setW(1400, 1400);
  if (failed.length) { console.error('보드 폭 회귀:\n  ' + failed.join('\n  ')); process.exit(1); }
  console.log('보드 폭 OK — 1단 6개 폭 · 2단 2개 폭 × 2~5인');
}

/* ── AI 4인 게임 완주 (설정 화면을 거치지 않고 newGame 직접 호출) ── */
try {
  vm.runInThisContext("newGame([{name:'플레이어 1',ai:true},{name:'AI 가영',ai:true},{name:'AI 나정',ai:true},{name:'AI 도준',ai:true}]);");
} catch (e) { console.error('게임 시작 실패:', e); process.exit(1); }

const t0 = Date.now();
(function poll(){
  const g = vm.runInThisContext('G');
  if (g && g.over) {
    console.log('게임 정상 종료 — 라운드', g.round, '· 종료 사유:', g.endReasons.join(','));
    console.log('점수:', g.scores.map(s => s.name + ' ' + s.total + '점').join(' / '));
    console.log('SMOKE OK');
    process.exit(0);
  }
  if (Date.now() - t0 > 60000) { console.error('60초 내 종료 실패 — 라운드', g && g.round, 'pending:', g && g.pending && g.pending.type); process.exit(1); }
  realSetTimeout(poll, 20);
})();
