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
global.localStorage = (() => { const m = {}; return {
  getItem: k => (k in m ? m[k] : null), setItem: (k,v) => { m[k]=String(v); }, removeItem: k => { delete m[k]; },
};})();
global.alert = () => {}; global.confirm = () => true;

/* AI 타이머(1500ms)를 기다리지 않도록 지연을 축소 */
const realSetTimeout = setTimeout;
global.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms || 0, 1) );

/* ── game.html의 <script src> 순서 그대로 로드 ── */
const html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8');
const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
if (order.length !== 11) { console.error('script 태그 수가 예상(11)과 다름:', order); process.exit(1); }
/* 파일별로 따로 실행 — 브라우저가 <script>를 하나씩 실행하는 것과 같은 조건.
   vm.runInThisContext는 스크립트 간 전역 let/const 바인딩을 공유한다. */
for (const f of order) {
  try {
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  } catch (e) { console.error('로드 실패 (' + f + '):', e); process.exit(1); }
}

/* ── AI 4인 게임 완주 ── */
try {
  vm.runInThisContext('setupN = 4; setupSeats.forEach(s => s.ai = true); startNewGame();');
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
