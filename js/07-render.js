/* ---------------- 交互 ---------------- */
function onCellClick(i) {
  if (locked || !G || G.over || !G.started || G.players[G.turn].ai) return;
  const cell = G.board[i];
  if (G.selectedHand >= 0) {
    if (!cell) { doPlay(G.selectedHand, i); return; }
    if (cell.owner !== null && cell.owner !== G.turn) { doCapture(G.selectedHand, i); return; }
    G.selectedHand = -1;
    G.suggestCell = -1;
    G.suggestHand = -1;
    render();
    return;
  }
  if (G.selectedPiece >= 0) {
    if (G.selectedPiece === i) { G.selectedPiece = -1; render(); return; }
    const dst = G.board[i];
    if ((!dst || dst.owner === null) && adjacent(G.selectedPiece, i)) { doMove(G.selectedPiece, i); return; }
    if (dst && dst.owner === G.turn) { G.selectedPiece = i; render(); return; }
    G.selectedPiece = -1;
    render();
    return;
  }
  if (cell && cell.owner === G.turn) {
    G.selectedPiece = i;
    G.suggestCell = -1;
    G.suggestHand = -1;
    render();
  }
}

/* ---------------- 渲染游戏 ---------------- */
function render() {
  if (!G) return;
  renderScores();
  renderBoard();
  renderHand();
  updateHint();
  updateTimerDisplay();

  const isHumanTurn = !G.over && G.started && G.turn === HUMAN;

  const apEl = document.getElementById('ap');
  const deckEl = document.getElementById('deckLeft');
  if (apEl) apEl.textContent = G.ap;
  if (deckEl) deckEl.textContent = G.deck.length;

  // 抽牌已改为每回合自动，这里只更新提示条
  const bar = document.getElementById('autoDrawBar');
  if (bar) {
    if (G.deck.length === 0) {
      bar.textContent = '🃏 牌堆已空，用手中的牌继续战斗';
      bar.classList.add('empty');
    } else {
      bar.textContent = '🃏 每回合自动抽 1 张 · 牌堆剩 ' + G.deck.length;
      bar.classList.remove('empty');
    }
  }

  const bp = document.getElementById('btnPass');
  const bh = document.getElementById('btnHint');
  if (bp) bp.disabled = !isHumanTurn;
  if (bh) bh.disabled = !isHumanTurn;

  // 联机：房主在状态变化后广播快照
  if (typeof netPushSoon === 'function') netPushSoon();
}

/* 座位方位：本地玩家永远在下方，其余按顺时针 右→上→左 排开 */
const SEAT_SLOT = ['seatBottom', 'seatRight', 'seatTop', 'seatLeft'];

function renderScores() {
  // 先按方位把四个座位容器清空（只在玩家数变化时重建）
  const slots = {};
  SEAT_SLOT.forEach(s => { slots[s] = document.getElementById(s); });

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const slotName = SEAT_SLOT[(i - HUMAN + NUM_PLAYERS) % NUM_PLAYERS];
    const box = slots[slotName];
    if (!box) continue;

    let pc = box.firstElementChild;
    if (!pc) {
      pc = document.createElement('div');
      pc.className = 'seat-card pcard p' + i;
      pc.innerHTML = `<span class="dot"></span>` +
                     `<span class="seat-name"></span>` +
                     `<span class="score"></span>` +
                     `<span class="carry"></span>`;
      box.appendChild(pc);
    }

    pc.classList.toggle('active', G.turn === i && !G.over && G.started);
    pc.classList.toggle('is-you', i === HUMAN);

    pc.querySelector('.seat-name').textContent = G.players[i].name;
    pc.querySelector('.score').textContent = G.players[i].score;

    const carry = G.players[i].carryAP || 0;
    const cEl = pc.querySelector('.carry');
    if (carry > 0) { cEl.textContent = '+' + carry; cEl.classList.add('show'); }
    else cEl.classList.remove('show');
  }
}

/* 取某个玩家座位上的分数元素（用于加分动画） */
function seatScoreEl(playerIdx) {
  const slot = SEAT_SLOT[(playerIdx - HUMAN + NUM_PLAYERS) % NUM_PLAYERS];
  const box = document.getElementById(slot);
  if (!box || !box.firstElementChild) return null;
  return box.firstElementChild.querySelector('.score');
}
function bumpSeatScore(playerIdx) {
  bumpEl(seatScoreEl(playerIdx));
}

/* 增量渲染用的缓存 */
let boardEls = null;      // 49 个格子的 DOM 节点
let boardSig = null;      // 每格的渲染签名
let handSig = '';

const CELL_MANAGED = [
  'own0', 'own1', 'own2', 'own3',
  'threat-zone', 'threat-p0', 'threat-p1', 'threat-p2', 'threat-p3',
  'can-place', 'can-capture', 'selpiece', 'suggest',
  'hint-lv1', 'hint-lv2', 'hint-lv3', 'hint-lv4'
];

function renderBoard() {
  const el = document.getElementById('board');
  if (!el) return;

  // 首次构建：只建 49 个空壳，之后永不重建
  if (!boardEls || boardEls.length !== CELLS || boardEls[0].parentNode !== el) {
    el.innerHTML = '';
    boardEls = [];
    boardSig = [];
    for (let i = 0; i < CELLS; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.card = '';
      d.dataset.owner = '';
      d.dataset.badge = '';
      d.addEventListener('click', () => onCellClick(i));
      el.appendChild(d);
      boardEls.push(d);
      boardSig.push('');
    }
  }

  const hints = computeHints();
  const threats = computeThreatZones();

  for (let i = 0; i < CELLS; i++) {
    const cell = G.board[i];
    const hint = hints.place[i];
    const threat = threats[i];
    const isSel = G.selectedPiece === i;
    const isCap = !!hints.capture[i];
    const isMov = !!hints.move[i];
    const isSug = G.suggestCell === i;

    const cardKey  = (cell && cell.card) ? (cell.card.v + ':' + cell.card.s) : '';
    const ownerKey = (cell && cell.owner !== null && cell.owner !== undefined) ? String(cell.owner) : '';
    const badgeKey = (hint && hint.sc > 0) ? (hint.lv + '#' + hint.sc) : '';
    const placeKey = hint ? ('P' + (hint.lv || 0)) : '';   // ← 关键：可落子状态也要进签名，否则绿框永远不刷新
    const threatKey = threat === undefined ? '' : ('t' + threat);

    const sig = cardKey + '|' + ownerKey + '|' + badgeKey + '|' + placeKey + '|' + threatKey + '|' +
                (isSel ? 'S' : '') + (isCap ? 'C' : '') + (isMov ? 'M' : '') + (isSug ? 'G' : '');

    const d = boardEls[i];
    if (sig === boardSig[i]) continue;
    boardSig[i] = sig;

    // 只增删我们自己管的类，保留 burst / combo-glow 这类瞬时特效类
    for (let m = 0; m < CELL_MANAGED.length; m++) d.classList.remove(CELL_MANAGED[m]);
    if (ownerKey !== '') d.classList.add('own' + ownerKey);
    if (threatKey && ownerKey === '') d.classList.add('threat-zone', 'threat-p' + threat);
    if (hint) d.classList.add(hint.lv === 0 ? 'can-place' : 'hint-lv' + hint.lv);
    if (isCap) d.classList.add('can-capture');
    if (isMov) d.classList.add('can-place');
    if (isSel) d.classList.add('selpiece');
    if (isSug) d.classList.add('suggest');

    // 卡牌：只在牌面变化时重建 —— 入场动画只在新落的牌上播
    if (d.dataset.card !== cardKey) {
      d.dataset.card = cardKey;
      const old = d.querySelector('.card');
      if (old) old.remove();
      if (cardKey) {
        const cd = document.createElement('div');
        cd.className = 'card' + (isRed(cell.card) ? ' red' : '');
        cd.innerHTML = `<span class="rank">${RANKS[cell.card.v]}</span><span class="suit">${SUITS[cell.card.s]}</span>`;
        d.appendChild(cd);
      }
    }

    // 徽章
    if (d.dataset.badge !== badgeKey) {
      d.dataset.badge = badgeKey;
      const old = d.querySelector('.badge');
      if (old) old.remove();
      if (badgeKey) {
        const b = document.createElement('div');
        b.className = 'badge lv' + hint.lv;
        b.textContent = '+' + hint.sc;
        d.appendChild(b);
      }
    }

    // 棋子
    if (d.dataset.owner !== ownerKey) {
      d.dataset.owner = ownerKey;
      const old = d.querySelector('.piece');
      if (old) old.remove();
      if (ownerKey !== '') {
        const pc = document.createElement('div');
        pc.className = 'piece p' + ownerKey + ' pskin-' +
          ((typeof P !== 'undefined' && P.currentPiece) || 'dot');
        d.appendChild(pc);
      }
    }
  }
}

function renderHand() {
  const el = document.getElementById('hand');
  if (!el) return;
  const me = G.players[HUMAN];
  if (!me) return;

  // 排序前先记住「当前选中的是哪张牌」，排完再找回它的新下标
  // —— 否则插入一张牌后 selectedHand 会指向别的牌
  const prevSel = (G.selectedHand >= 0 && G.selectedHand < me.hand.length) ? me.hand[G.selectedHand] : null;
  const prevSug = (G.suggestHand >= 0 && G.suggestHand < me.hand.length) ? me.hand[G.suggestHand] : null;

  // 手牌始终按 花色 → 点数 排序（同花色连着的牌一眼就能看出顺子/同花）
  me.hand.sort((a, b) => {
    if (a.s !== b.s) return a.s - b.s;
    return a.v - b.v;
  });

  if (prevSel) {
    const ni = me.hand.indexOf(prevSel);
    G.selectedHand = (ni >= 0) ? ni : -1;
  }
  if (prevSug) {
    const ni = me.hand.indexOf(prevSug);
    G.suggestHand = (ni >= 0) ? ni : -1;
  }

  // 只有牌面真的变了才重建 DOM（否则每次渲染所有手牌都会重播入场动画）
  const sig = me.hand.map(c => c.v + ':' + c.s).join(',') + '#sel';
  if (sig !== handSig) {
    handSig = sig;
    el.innerHTML = '';

    me.hand.forEach((card, i) => {
      const d = document.createElement('div');
      d.className = 'hcard' + (isRed(card) ? ' red' : '') + (G.selectedHand === i ? ' sel' : '');
      if (G.suggestHand === i) d.classList.add('hintglow');
      d.innerHTML = `<span class="rank">${RANKS[card.v]}</span><span class="suit">${SUITS[card.s]}</span>`;
      d.addEventListener('click', () => {
        if (locked || G.over || !G.started || G.turn !== HUMAN) return;
        G.selectedHand = (G.selectedHand === i) ? -1 : i;
        G.selectedPiece = -1;
        G.suggestCell = -1;
        G.suggestHand = -1;
        render();
      });
      el.appendChild(d);
    });

    if (me.hand.length === 0) {
      const s = document.createElement('div');
      s.style.cssText = 'color:#5c7068;font-size:13px;padding:0 8px;';
      s.textContent = '（手牌为空，下回合开始会自动抽 1 张）';
      el.appendChild(s);
    }
    return;
  }

  // 牌面没变，只同步高亮状态
  for (let i = 0; i < me.hand.length && i < el.children.length; i++) {
    el.children[i].classList.toggle('sel', G.selectedHand === i);
    el.children[i].classList.toggle('hintglow', G.suggestHand === i);
  }
}

