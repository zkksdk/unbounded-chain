/* ---------------- 组合检测 ---------------- */
/* owner 传了就只统计该玩家的牌；不传则不过滤（兼容旧调用） */
function detectCombos(board, idx, card, owner) {
  const r0 = rowOf(idx), c0 = colOf(idx);
  const combos = [];
  const mine = (cell) => {
    if (!cell || !cell.card) return false;
    if (owner === undefined || owner === null) return true;
    return cell.owner === owner;
  };
  const getCard = (r, c) => {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    const cell = board[idxOf(r, c)];
    return mine(cell) ? cell.card : null;
  };

  const seen = new Set([idx]);
  const stack = [idx];
  while (stack.length) {
    const cur = stack.pop();
    const cr = rowOf(cur), cc = colOf(cur);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = cr + dr, nc = cc + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const ni = idxOf(nr, nc);
        if (seen.has(ni)) continue;
        const cell = board[ni];
        if (mine(cell) && cell.card.v === card.v) {
          seen.add(ni);
          stack.push(ni);
        }
      }
    }
  }
  const n = seen.size;
  if (n === 2) combos.push({ name: '对子', score: 1, ap: 1 });
  else if (n === 3) combos.push({ name: '三条', score: 3, ap: 2 });
  else if (n === 4) combos.push({ name: '四条', score: 8, ap: 4 });
  else if (n >= 5) combos.push({ name: n + '条', score: 8 + (n - 4) * 6, ap: 4 + (n - 4) * 2 });

  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of DIRS) {
    const line = [{ card, off: 0 }];
    for (let k = 1; k < SIZE; k++) {
      const c2 = getCard(r0 + dr * k, c0 + dc * k);
      if (!c2) break;
      line.push({ card: c2, off: k });
    }
    for (let k = 1; k < SIZE; k++) {
      const c2 = getCard(r0 - dr * k, c0 - dc * k);
      if (!c2) break;
      line.push({ card: c2, off: -k });
    }
    line.sort((a, b) => a.off - b.off);
    const ci = line.findIndex(x => x.off === 0);

    let slo = ci, shi = ci;
    while (slo > 0 && line[slo - 1].card.s === card.s) slo--;
    while (shi < line.length - 1 && line[shi + 1].card.s === card.s) shi++;
    const suitLen = shi - slo + 1;

    let rlo = ci, rhi = ci;
    while (rhi < line.length - 1 && line[rhi + 1].card.v === line[rhi].card.v + 1) rhi++;
    while (rlo > 0 && line[rlo - 1].card.v === line[rlo].card.v - 1) rlo--;
    const runLen = rhi - rlo + 1;

    let flo = ci, fhi = ci;
    while (fhi < line.length - 1 &&
           line[fhi + 1].card.s === card.s &&
           line[fhi + 1].card.v === line[fhi].card.v + 1) fhi++;
    while (flo > 0 &&
           line[flo - 1].card.s === card.s &&
           line[flo - 1].card.v === line[flo].card.v - 1) flo--;
    const sfLen = fhi - flo + 1;

    if (sfLen >= 3) {
      combos.push({ name: `同花顺×${sfLen}`, score: 3 * sfLen - 4, ap: Math.min(sfLen - 1, 5) });
    } else {
      if (suitLen >= 3) combos.push({ name: `同花×${suitLen}`, score: suitLen - 1, ap: 1 });
      if (runLen >= 3) combos.push({ name: `顺子×${runLen}`, score: 2 * runLen - 3, ap: Math.min(runLen - 1, 4) });
    }
  }
  return combos;
}

function simulatePlacement(board, idx, card, owner) {
  const b = board.slice();
  b[idx] = { card, owner: (owner === undefined ? -1 : owner) };
  return detectCombos(b, idx, card, owner);
}

function hintLevel(sc) {
  if (sc <= 0) return 0;
  if (sc <= 1) return 1;
  if (sc <= 3) return 2;
  if (sc <= 7) return 3;
  return 4;
}

/* ---------------- 掷骰 ---------------- */
function rollAllDice() {
  const rolls = new Array(NUM_PLAYERS).fill(0);
  let candidates = [...Array(NUM_PLAYERS).keys()];
  while (true) {
    for (const p of candidates) rolls[p] = 1 + Math.floor(Math.random() * 6);
    const maxVal = Math.max(...candidates.map(p => rolls[p]));
    const top = candidates.filter(p => rolls[p] === maxVal);
    if (top.length === 1) return { rolls, winner: top[0] };
    candidates = top;
  }
}

function showDiceRoll() {
  const overlay = document.getElementById('diceOverlay');
  const grid = document.getElementById('diceGrid');
  const status = document.getElementById('diceStatus');
  overlay.classList.remove('hidden');
  status.classList.remove('winner-text');
  grid.innerHTML = '';
  status.textContent = '掷骰中…';

  const result = rollAllDice();
  const faces = [], diceEls = [];

  for (let i = 0; i < NUM_PLAYERS; i++) {
    const die = document.createElement('div');
    die.className = 'die rolling';
    die.innerHTML = `<div class="die-name ${PLAYER_CLASSES[i]}">${G.players[i].name}</div><div class="die-face">?</div>`;
    grid.appendChild(die);
    const face = die.querySelector('.die-face');
    faces.push(face);
    diceEls.push(die);
  }

  const animInterval = setInterval(() => {
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (!faces[i].classList.contains('revealed')) {
        faces[i].textContent = 1 + Math.floor(Math.random() * 6);
      }
    }
  }, 65);

  for (let i = 0; i < NUM_PLAYERS; i++) {
    setTimeout(() => {
      faces[i].textContent = result.rolls[i];
      faces[i].classList.add('revealed');
      diceEls[i].classList.remove('rolling');
      if (i === result.winner) {
        faces[i].classList.add('winner');
        const c = centerOf(faces[i]);
        spawnParticles(c.x, c.y, 30, '#f5d97a', 180);
        spawnParticles(c.x, c.y, 20, PLAYER_COLORS[i], 150);
        shakeScreen('m');
      }
    }, 900 + i * 400);
  }

  setTimeout(() => {
    clearInterval(animInterval);
    for (let i = 0; i < NUM_PLAYERS; i++) {
      faces[i].textContent = result.rolls[i];
      faces[i].classList.add('revealed');
      diceEls[i].classList.remove('rolling');
      if (i === result.winner) faces[i].classList.add('winner');
    }
    status.innerHTML = `<span class="${PLAYER_CLASSES[result.winner]}">${G.players[result.winner].name}</span> 先手！`;
    status.classList.add('winner-text');
    const bp = centerOf(status);
    spawnParticles(bp.x, bp.y, 40, '#f5d97a', 220);
    addLog(`🎲 掷骰：${result.rolls.map((v, i) => `<span class="${PLAYER_CLASSES[i]}">${G.players[i].name}</span>=${v}`).join(' · ')} → <span class="${PLAYER_CLASSES[result.winner]}">${G.players[result.winner].name}</span> 先手`, 'sys');

    setTimeout(() => {
      overlay.classList.add('hidden');
      G.turn = result.winner;
      G.firstPlayer = result.winner;   // 记下先手，用于后手补偿
      G.started = true;
      locked = false;
      startTurn();
      render();
      if (G.players[G.turn].ai) {
        locked = true;
        setTimeout(() => {
          locked = false;
          if (!G.over) aiTurn();
        }, Math.round(aiRnd(AI_PACE.turnStart[0], AI_PACE.turnStart[1])));
      }
    }, 1500);
  }, 900 + NUM_PLAYERS * 400 + 250);
}

/* ---------------- 新游戏 ---------------- */
function newGame() {
  document.getElementById('overlay').classList.add('hidden');
  stopTimer();
  clearTimeout(autoEndTimer);
  locked = true;
  logCount = 0;
  comboChainCount = 0;
  sessionStats = { maxCombo: 0, plays: 0 };

  G = {
    board: new Array(CELLS).fill(null),
    deck: shuffle(makeDeck()),
    players: PLAYER_NAMES.map((name, i) => ({
      name: (i === HUMAN ? '你' : name), hand: [], score: 0,
      ai: !(typeof netIsHumanSeat === 'function' ? netIsHumanSeat(i) : (i === HUMAN)),
      control: 0, lineBonus: 0, total: 0,
      carryAP: 0
    })),
    turn: 0, ap: 0, bonusAP: 0,
    over: false, started: false, drewThisTurn: false,
    passStreak: 0, actedThisTurn: false, movesThisTurn: 0,
    selectedHand: -1, selectedPiece: -1,
    suggestCell: -1, suggestHand: -1
  };

  for (let i = 0; i < 5; i++) {
    for (const p of G.players) p.hand.push(G.deck.pop());
  }

  document.getElementById('log').innerHTML = '';
  document.getElementById('logCount').textContent = '0';
  addLog(`🎴 新对局 · 7×7 · 4 人混战 · 牌堆 52 张`, 'sys');
  addLog(`💫 保留机制：回合结束剩 AP → 保留一半（向上取整，上限 ${CARRY_MAX}）到下回合`, 'sys');
  addLog(`🃏 抽牌：每回合开始自动抽 1 张，不消耗 AP`, 'sys');

  showDiceRoll();
}

/* 每回合开始系统自动抽 1 张（替代原来的手动抽牌） */
function autoDrawForTurn() {
  const p = G.players[G.turn];
  if (!G.deck.length) {
    addLog(`　🃏 牌堆已空，本回合无牌可抽`, 'sys');
    return;
  }
  const card = G.deck.pop();
  p.hand.push(card);
  addLog(`　🃏 自动抽牌 <span class="hl">${cardText(card)}</span>（牌堆剩 ${G.deck.length}）`, 'sys');
  if (G.deck.length === 0) {
    addLog('═══ 牌堆已空，改用手中牌继续战斗 ═══', 'sys');
  }
  if (!p.ai) {
    setTimeout(() => {
      const handEl = document.getElementById('hand');
      if (!handEl) return;
      const c = centerOf(handEl);
      spawnParticles(c.x, c.y - 20, 12, '#7fd4a8', 130);
      floatScore(c.x, c.y - 40, '+1 张', 'ap');
      bumpEl(document.getElementById('deckLeft'));
    }, 260);
  }
}

function startTurn() {
  const p = G.players[G.turn];
  const carry = p.carryAP || 0;
  p.carryAP = 0;
  G.ap = 1 + carry;

  // 先手补偿：本局每人第一个回合，除先手外多给 1 AP
  const firstTurnBonus = !p.turnsPlayed && G.turn !== G.firstPlayer;
  if (firstTurnBonus) G.ap += 1;
  p.turnsPlayed = (p.turnsPlayed || 0) + 1;

  G.bonusAP = 0;
  G.actedThisTurn = false;
  G.drewThisTurn = true;      // 抽牌已改为每回合自动，不再手动抽
  G.movesThisTurn = 0;        // 每回合移动次数清零
  G.selectedHand = -1;
  G.selectedPiece = -1;
  G.suggestCell = -1;
  G.suggestHand = -1;
  comboChainCount = 0;

  addLog(`— <span class="${PLAYER_CLASSES[G.turn]}">${p.name}</span> 的回合 —`, 'turn');
  if (firstTurnBonus) {
    addLog(`　🎁 后手补偿 <span class="hl">+1 AP</span>`, 'sys');
  }
  if (carry > 0) {
    addLog(`　💫 上回合保留 <span class="hl-purple">${carry}</span> AP → 本回合共 <span class="hl">${G.ap}</span> AP`, 'sys');
  }

  // 每回合开始，系统自动抽 1 张
  autoDrawForTurn();

  if (!p.ai) {
    startTimer();
    if (carry > 0) {
      setTimeout(() => {
        const apEl = document.getElementById('ap');
        if (apEl) {
          const c = centerOf(apEl);
          floatScore(c.x, c.y - 20, '+' + carry + ' AP', 'carry');
          spawnParticles(c.x, c.y, 14, '#b17aff', 120);
          bumpEl(apEl);
        }
      }, 200);
    }
  } else {
    updateTimerDisplay();
  }
}

function addLog(text, cls = '') {
  const el = document.getElementById('log');
  if (!el) return;
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerHTML = text;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
  logCount++;
  const lc = document.getElementById('logCount');
  if (lc) lc.textContent = logCount;
}

/* ---------------- 计时器 ---------------- */
let netLastTickSec = -1;
function startTimer() {
  stopTimer();
  timeLeft = TURN_TIME;
  updateTimerDisplay();
  if (NET.mode === 'guest') return;   // 客人端由房主同步时间，本地不跑计时
  timerInterval = setInterval(() => {
    if (!G || G.over) { stopTimer(); return; }
    if (G.players[G.turn].ai) { stopTimer(); return; }
    timeLeft -= 0.1;
    // 只在「整秒」变化时推一次 tick（原来每 100ms 推一次，30 秒 300 条消息太浪费）
    if (NET.mode === 'host') {
      const sec = Math.ceil(timeLeft);
      if (sec !== netLastTickSec) { netLastTickSec = sec; netHostTick(); }
    }
    if (timeLeft <= 0) {
      timeLeft = 0;
      updateTimerDisplay();
      stopTimer();
      if (!G.over && !G.players[G.turn].ai) {
        addLog('⏰ 时间到 —— 自动结束回合', 'sys');
        forceEndTurn();
      }
    } else {
      updateTimerDisplay();
    }
  }, 100);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}
function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el || !G) return;
  if (G.over) { el.textContent = '—'; el.classList.remove('warn'); return; }
  if (G.players[G.turn].ai) { el.textContent = 'AI 思考中'; el.classList.remove('warn'); return; }
  const sec = Math.ceil(timeLeft);
  el.textContent = `⏱ ${sec}s`;
  el.classList.toggle('warn', sec <= 10);
  // 最后5秒播放滴答声
  if (sec <= 5 && sec > 0) playSound('tick');
}

/* ---------------- 行动 ---------------- */
function applyCombos(combos) {
  let rawAp = 0, score = 0;
  for (const c of combos) { rawAp += c.ap; score += c.score; }
  const room = Math.max(0, MAX_BONUS_AP - G.bonusAP);
  const ap = Math.min(rawAp, room);
  G.bonusAP += ap;
  G.ap += ap;
  G.players[G.turn].score += score;
  return { ap, score, capped: rawAp > ap };
}

function doPlay(handIdx, boardIdx) {
  if (typeof NET !== 'undefined' && NET.mode === 'guest') return netIntent('play', { hi: handIdx, bi: boardIdx });
  if ((G.players[G.turn].ai && !aiActing) || locked || G.over) return;
  if (G.ap < 1) { toast('行动点不足'); return; }
  if (G.board[boardIdx]) { toast('该格已有牌'); return; }

  const p = G.players[G.turn];
  const card = p.hand[handIdx];
  if (!card) return;

  G.ap -= 1;
  G.actedThisTurn = true;
  p.hand.splice(handIdx, 1);
  G.board[boardIdx] = { card, owner: G.turn };
  G.selectedHand = -1;
  G.selectedPiece = -1;
  G.suggestCell = -1;
  G.suggestHand = -1;
  sessionStats.plays++;

  const combos = detectCombos(G.board, boardIdx, card, G.turn);
  const gain = applyCombos(combos);

  render();
  const cellEl = document.querySelectorAll('.cell')[boardIdx];
  const color = PLAYER_COLORS[G.turn];
  playSound('place');

  if (cellEl) {
    // 卡牌 3D 翻转
    const cardEl = cellEl.querySelector('.card');
    if (cardEl) cardEl.classList.add('flip-in');

    // 落子冲击波 + 闪光
    const c = centerOf(cellEl);
    shockwave(c.x, c.y, 2);
    spawnParticles(c.x, c.y, combos.length ? 30 : 12, '#ffffff', combos.length ? 200 : 100);
    spawnParticles(c.x, c.y, combos.length ? 20 : 8, color, combos.length ? 180 : 90);

    cellEl.classList.add('burst');
    setTimeout(() => cellEl.classList.remove('burst'), 850);
  }

  if (combos.length > 0) {
    playSound('chain');
    const intensity = Math.min(combos.length, 4);
    const isBig = intensity >= 2;

    // 屏幕闪光
    screenFlash('chain');

    // 屏幕震动（根据强度分级）
    if (intensity >= 3) shakeScreen('xl');
    else if (intensity >= 2) shakeScreen('l');
    else shakeScreen('m');

    const c = cellEl ? centerOf(cellEl) : boardCenter();

    // 大范围粒子
    spawnParticles(c.x, c.y, 50 + intensity * 15, '#f5d97a', 260 + intensity * 60);
    spawnParticles(c.x, c.y, 30 + intensity * 10, '#ffe58a', 220 + intensity * 40);
    spawnParticles(c.x, c.y, 20, color, 200);

    // 冲击波多层
    shockwave(c.x, c.y, 3);

    // 同花色/同点数格子联动发光
    document.querySelectorAll('.cell').forEach((el2, i2) => {
      if (i2 === boardIdx) return;
      const c2 = G.board[i2];
      if (c2 && c2.card && (c2.card.v === card.v || c2.card.s === card.s)) {
        el2.classList.add('combo-glow');
        setTimeout(() => el2.classList.remove('combo-glow'), 1100);
      }
    });

    // 闪电连线
    const involved = getComboInvolvedIndexes(boardIdx, card, combos[0].name);
    if (involved.length) drawChainLines(boardIdx, involved);

    // 组合名弹出
    combos.forEach((combo, i) => {
      setTimeout(() => comboPop(c.x, c.y - 40 - i * 8, combo.name), i * 180);
    });

    // 得分大字
    setTimeout(() => {
      if (gain.score > 0) {
        boomText(c.x - 70, c.y, '+' + gain.score, 'fire', 46);
      }
      if (gain.ap > 0) {
        boomText(c.x + 70, c.y, '+' + gain.ap + 'AP', 'cool', 38);
      }
    }, 220);

    comboChainCount++;
    if (comboChainCount > sessionStats.maxCombo) sessionStats.maxCombo = comboChainCount;
    if (comboChainCount >= 2) {
      showComboCounter(comboChainCount);
      const bp = boardCenter();
      spawnParticles(bp.x, bp.y, 60, '#f5d97a', 400);
      spawnParticles(bp.x, bp.y, 40, '#ffe58a', 340);
      screenFlash('chain');
      shakeScreen('xl');
    }
    if (typeof bumpSeatScore === 'function') bumpSeatScore(G.turn);
    bumpEl(document.getElementById('ap'));
  }

  if (cellEl && !combos.length) {
    const c = centerOf(cellEl);
    spawnParticles(c.x, c.y, 6, '#ffffff', 80);
  }

  let msg = `<span class="${PLAYER_CLASSES[G.turn]}">${p.name}</span> 打出 <span class="hl">${cardText(card)}</span>`;
  if (combos.length) {
    msg += ` → ${combos.map(c => `<span class="hl">${c.name}</span>`).join(' + ')}`;
    msg += ` <span class="hl">(+${gain.score}分 / +${gain.ap}AP)</span>`;
    if (gain.capped) msg += ` <span class="sys">[连锁上限]</span>`;
  }
  addLog(msg);

  if (checkEnd()) return;
  afterAction();
}

/* 抽牌已改为每回合自动（见 autoDrawForTurn），这里只留一个提示占位 */
function doDraw() {
  toast('本局已改为每回合自动抽 1 张，不需要手动抽牌');
}

function doMove(from, to) {
  if (typeof NET !== 'undefined' && NET.mode === 'guest') return netIntent('move', { from: from, to: to });
  if ((G.players[G.turn].ai && !aiActing) || locked || G.over) return;
  if (G.ap < 1) { toast('行动点不足'); return; }
  if ((G.movesThisTurn || 0) >= MOVE_LIMIT) {
    toast(`每回合最多移动 ${MOVE_LIMIT} 次，本回合已经用完了`);
    return;
  }
  const src = G.board[from];
  if (!src || src.owner !== G.turn) return;
  if (G.board[to]) { toast('目标格已被占据'); return; }
  if (!adjacent(from, to)) { toast('只能移到相邻格'); return; }

  G.ap -= 1;
  G.movesThisTurn = (G.movesThisTurn || 0) + 1;
  // 整枚棋子（连同底下的牌）一起搬过去，原格彻底空出
  // —— 不再产生「无主卡牌」和「有主无牌」两种畸形格子
  G.board[to] = src;
  G.board[from] = null;
  G.actedThisTurn = true;
  G.selectedPiece = -1;
  G.suggestCell = -1;
  render();
  const toEl = document.querySelectorAll('.cell')[to];
  if (toEl) {
    const c = centerOf(toEl);
    spawnParticles(c.x, c.y, 10, PLAYER_COLORS[G.turn], 100);
  }
  addLog(`<span class="${PLAYER_CLASSES[G.turn]}">${G.players[G.turn].name}</span> 移动了一枚棋子` +
         ` <span class="sys">（本回合 ${G.movesThisTurn}/${MOVE_LIMIT}）</span>`);
  afterAction();
}

function hasAdjacentOwnPiece(idx, owner) {
  const r = rowOf(idx), c = colOf(idx);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const cell = G.board[idxOf(nr, nc)];
      if (cell && cell.owner === owner) return true;
    }
  }
  return false;
}

function playerHasPiece(owner) {
  for (let i = 0; i < CELLS; i++) {
    const c = G.board[i];
    if (c && c.owner === owner) return true;
  }
  return false;
}

/* 落子规则：场上还没有己方棋子时，任意空格可落（开局占地）；
   之后必须挨着自己的棋子（区域扩张） */
function canPlaceAt(idx, owner, hasOwn) {
  if (G.board[idx]) return false;
  if (hasOwn === undefined) hasOwn = playerHasPiece(owner);
  if (!hasOwn) return true;
  return hasAdjacentOwnPiece(idx, owner);
}

/* ---------------- 吃牌（牌型压制）----------------
   单张 / 对子      → 点数必须大于对方
   三条 / 同花 / 顺子 → 无视点数，强行吃
   同花顺           → 无视点数，且只花 1 AP
   --------------------------------------------- */
function eatTierOf(combos) {
  let tier = 1, label = '';
  const bump = (t, l) => { if (t > tier) { tier = t; label = l; } };
  for (let i = 0; i < combos.length; i++) {
    const n = combos[i].name;
    if (n.indexOf('同花顺') === 0) bump(5, n);
    else if (n.indexOf('条') > 0) bump(4, n);          // 三条 / 四条 / N条
    else if (n.indexOf('同花') === 0 || n.indexOf('顺子') === 0) bump(3, n);
    else if (n.indexOf('对子') === 0) bump(2, n);
  }
  return { tier, label };
}

/* 能否吃？返回 null=不能；否则 { ap, tier, label, ignoreRank, combos } */
function canEat(idx, card, owner) {
  const t = G.board[idx];
  if (!t || !t.card || t.owner === null || t.owner === owner) return null;
  if (!card) return null;
  if (!hasAdjacentOwnPiece(idx, owner)) return null;

  const combos = simulatePlacement(G.board, idx, card, owner);
  const info = eatTierOf(combos);
  const ignoreRank = info.tier >= 3;                    // 三条及以上无视点数
  if (!ignoreRank && card.v <= t.card.v) return null;

  return {
    ap: info.tier >= 5 ? 1 : 2,                         // 同花顺省 1 AP
    tier: info.tier, label: info.label,
    ignoreRank, combos, target: t
  };
}

function doCapture(handIdx, boardIdx) {
  if (typeof NET !== 'undefined' && NET.mode === 'guest') return netIntent('capture', { hi: handIdx, bi: boardIdx });
  if ((G.players[G.turn].ai && !aiActing) || locked || G.over) return;
  const p = G.players[G.turn];
  const card = p.hand[handIdx];
  const target = G.board[boardIdx];
  if (!card) return;
  if (!target || !target.card || target.owner === null || target.owner === G.turn) { toast('这里没有敌方棋子'); return; }
  if (!hasAdjacentOwnPiece(boardIdx, G.turn)) { toast('需要有一枚己方棋子与目标相邻'); return; }

  const eat = canEat(boardIdx, card, G.turn);
  if (!eat) {
    toast(`需要点数大于 ${cardText(target.card)}，或用 三条/同花/顺子 压制`);
    return;
  }
  if (G.ap < eat.ap) { toast(`吃牌需要 ${eat.ap} 行动点`); return; }

  G.ap -= eat.ap;
  G.actedThisTurn = true;
  p.hand.splice(handIdx, 1);
  const taken = target.card;
  const victimName = G.players[target.owner].name;
  const victimCls = PLAYER_CLASSES[target.owner];

  G.board[boardIdx] = { card, owner: G.turn };
  // 被吃的牌洗回牌堆底：既不退出游戏（保证棋盘能填满），也不进吃方手牌（避免滚雪球）
  G.deck.unshift(taken);
  G.selectedHand = -1;
  G.selectedPiece = -1;
  G.suggestCell = -1;
  G.suggestHand = -1;

  const combos = detectCombos(G.board, boardIdx, card, G.turn);
  const gain = applyCombos(combos);

  render();
  const cellEl = document.querySelectorAll('.cell')[boardIdx];
  playSound('capture');
  screenFlash('capture');
  shakeScreen('xl');

  if (cellEl) {
    const cardEl = cellEl.querySelector('.card');
    if (cardEl) cardEl.classList.add('flip-in');

    cellEl.classList.add('burst-big');
    setTimeout(() => cellEl.classList.remove('burst-big'), 1000);
    cellEl.classList.add('burst');
    setTimeout(() => cellEl.classList.remove('burst'), 850);

    const c = centerOf(cellEl);

    // 红色爆炸
    spawnParticles(c.x, c.y, 50, '#ff5c5c', 280);
    spawnParticles(c.x, c.y, 40, '#ff9500', 240);
    spawnParticles(c.x, c.y, 30, '#f5d97a', 220);
    spawnParticles(c.x, c.y, 20, '#ffffff', 180);

    // 多层冲击波
    shockwave(c.x, c.y, 3);

    // 爆炸大字
    boomText(c.x, c.y - 30, eat.ignoreRank ? ('⚔ ' + eat.label + ' 压制') : '⚔ 吃牌', 'blood', 50);
  }

  if (combos.length) {
    playSound('chain');
    const c = cellEl ? centerOf(cellEl) : boardCenter();
    combos.forEach((combo, i) => {
      setTimeout(() => comboPop(c.x, c.y - 50 - i * 8, combo.name), i * 180);
    });
    setTimeout(() => {
      if (gain.score > 0) boomText(c.x - 70, c.y, '+' + gain.score, 'fire', 46);
      if (gain.ap > 0)   boomText(c.x + 70, c.y, '+' + gain.ap + 'AP', 'cool', 38);
    }, 220);

    spawnParticles(c.x, c.y, 60, '#f5d97a', 300);

    comboChainCount++;
    if (comboChainCount > sessionStats.maxCombo) sessionStats.maxCombo = comboChainCount;
    if (comboChainCount >= 2) showComboCounter(comboChainCount);
    shakeScreen(combos.length >= 2 ? 'xl' : 'l');
    if (typeof bumpSeatScore === 'function') bumpSeatScore(G.turn);
    bumpEl(document.getElementById('ap'));
  }

  const tag = eat.ignoreRank
    ? ` <span class="hl-purple">[${eat.label} 压制·无视点数]</span>`
    : '';
  addLog(`<span class="${PLAYER_CLASSES[G.turn]}">${p.name}</span> 用 <span class="hl">${cardText(card)}</span> 吃掉了 <span class="${victimCls}">${victimName}</span> 的 ${cardText(taken)}${tag}`);
  addLog(`　♻️ ${cardText(taken)} 已洗回牌堆底（牌堆 ${G.deck.length}）`, 'sys');
  if (combos.length) {
    addLog(`　↳ ${combos.map(c => `<span class="hl">${c.name}</span>`).join(' + ')} <span class="hl">(+${gain.score}分 / +${gain.ap}AP)</span>`);
  }

  if (checkEnd()) return;
  afterAction();
}

function doPass() {
  if (typeof NET !== 'undefined' && NET.mode === 'guest') return netIntent('pass', {});
  if (locked || G.over) return;
  if (G.players[G.turn].ai) return;
  addLog(`<span class="${PLAYER_CLASSES[G.turn]}">${G.players[G.turn].name}</span> 选择过`, 'sys');
  forceEndTurn();
}

function afterAction() {
  if (G.over) return;
  if (G.players[G.turn].ai) return;
  if (G.ap <= 0) {
    G.selectedHand = -1;
    G.selectedPiece = -1;
    G.suggestCell = -1;
    G.suggestHand = -1;
    render();
    stopTimer();
    clearTimeout(autoEndTimer);
    autoEndTimer = setTimeout(() => {
      if (!G.over && G.ap <= 0 && !G.players[G.turn].ai) endTurn();
    }, 700);
  } else {
    startTimer();
  }
}

function forceEndTurn() {
  clearTimeout(autoEndTimer);
  stopTimer();
  G.selectedHand = -1;
  G.selectedPiece = -1;
  G.suggestCell = -1;
  G.suggestHand = -1;
  endTurn();
}

function endTurn() {
  if (typeof NET !== 'undefined' && NET.mode === 'guest') return;  // 客人端不推进回合
  if (G.over) return;
  if (checkEnd()) return;

  // 连续「过」计数：本回合什么都没做就 +1，做了就清零
  if (G.actedThisTurn) G.passStreak = 0;
  else G.passStreak = (G.passStreak || 0) + 1;

  const curP = G.players[G.turn];
  let kept = 0;
  if (G.ap > 0) {
    // 可规划：固定保留 ceil(剩余 / 2)，累积上限 CARRY_MAX
    kept = Math.min(Math.ceil(G.ap / 2), CARRY_MAX);
    curP.carryAP = Math.min((curP.carryAP || 0) + kept, CARRY_MAX);
    addLog(`💫 <span class="${PLAYER_CLASSES[G.turn]}">${curP.name}</span> 剩 <span class="hl">${G.ap}</span> AP → 保留 <span class="hl-purple">${kept}</span>（累积 ${curP.carryAP}／上限 ${CARRY_MAX}）`, 'sys');
    const apEl = document.getElementById('ap');
    if (apEl) {
      const c = centerOf(apEl);
      floatScore(c.x, c.y, '保留 ' + kept, 'carry');
      spawnParticles(c.x, c.y, 12, '#b17aff', 130);
    }
  }

  stopTimer();
  clearTimeout(autoEndTimer);
  comboChainCount = 0;
  G.turn = (G.turn + 1) % NUM_PLAYERS;
  startTurn();
  render();

  if (G.players[G.turn].ai) {
    locked = true;
    setTimeout(() => {
      locked = false;
      if (!G.over) aiTurn();
    }, Math.round(aiRnd(AI_PACE.turnStart[0], AI_PACE.turnStart[1])));
  }
}

/* ---------------- AI ---------------- */
/* AI 选一步「移动」：逃命优先，其次是把棋子挪到更有发展空间的位置 */
function aiChooseMove(me) {
  if ((G.movesThisTurn || 0) >= MOVE_LIMIT) return null;   // 移动次数用完了
  let best = null;
  for (let from = 0; from < CELLS; from++) {
    const c = G.board[from];
    if (!c || !c.card || c.owner !== me) continue;
    const r0 = rowOf(from), c0 = colOf(from);

    // 这枚棋子被威胁吗？（相邻有敌方更大的牌，且对方贴着自己的子）
    let threatened = false;
    for (let dr = -1; dr <= 1 && !threatened; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r0 + dr, nc = c0 + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const t = G.board[idxOf(nr, nc)];
        if (t && t.card && t.owner !== null && t.owner !== me && t.card.v > c.card.v) {
          if (hasAdjacentOwnPiece(idxOf(nr, nc), t.owner)) { threatened = true; break; }
        }
      }
    }

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r0 + dr, nc = c0 + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const to = idxOf(nr, nc);
        if (G.board[to]) continue;

        // 新位置周围有多少空格（发展空间）
        let free = 0, ownNear = 0;
        const tr = rowOf(to), tc = colOf(to);
        for (let ar = -1; ar <= 1; ar++) {
          for (let ac = -1; ac <= 1; ac++) {
            if (!ar && !ac) continue;
            const ar2 = tr + ar, ac2 = tc + ac;
            if (ar2 < 0 || ar2 >= SIZE || ac2 < 0 || ac2 >= SIZE) continue;
            const nb = G.board[idxOf(ar2, ac2)];
            if (!nb) free++;
            else if (nb.owner === me) ownNear++;
          }
        }

        let score = free * 3 + centerValue(to) * 2;
        if (threatened) score += 30;        // 逃命最优先
        if (!threatened && score < 24) continue;   // 没威胁又不划算就别乱动

        if (!best || score > best.score) best = { score, from: from, to: to };
      }
    }
  }
  return best;
}

function aiChooseAction() {
  const me = G.turn;
  const hand = G.players[me].hand;
  const empty = [];
  for (let i = 0; i < CELLS; i++) if (!G.board[i] && canPlaceAt(i, me)) empty.push(i);

  let best = null;
  for (let hi = 0; hi < hand.length; hi++) {
    for (const bi of empty) {
      const combos = simulatePlacement(G.board, bi, hand[hi], me);
      let sc = 0, ap = 0;
      for (const c of combos) { sc += c.score; ap += c.ap; }
      const total = sc * 10 + ap * 7 + centerValue(bi);
      if (!best || total > best.total) best = { total, hi, bi, sc, ap };
    }
  }

  if (best && best.sc > 0 && G.ap >= 1) return { type: 'play', hi: best.hi, bi: best.bi, sc: best.sc };
  {
    let capBest = null;
    for (let hi = 0; hi < hand.length; hi++) {
      for (let bi = 0; bi < CELLS; bi++) {
        const eat = canEat(bi, hand[hi], me);
        if (!eat || G.ap < eat.ap) continue;
        let sc = 0;
        for (const c of eat.combos) sc += c.score;
        // 吃到大牌 / 无视点数压制 更值钱
        const total = sc * 100 + eat.target.card.v * 3 + (eat.ignoreRank ? 40 : 0) + centerValue(bi);
        if (!capBest || total > capBest.total) capBest = { total, hi, bi };
      }
    }
    if (capBest) return { type: 'capture', hi: capBest.hi, bi: capBest.bi };
  }
  // 有棋子正被威胁 → 先撤（但要留着 AP 发育，所以只在 AP ≥ 2 时才优先撤）
  if (G.ap >= 2) {
    const esc = aiChooseMove(me);
    if (esc && esc.score >= 30) return { type: 'move', from: esc.from, to: esc.to };
  }
  // 牌堆空时强制出最佳牌
  if (G.deck.length === 0 && best && best.sc > 0 && G.ap >= 1) {
    return { type: 'play', hi: best.hi, bi: best.bi, sc: best.sc };
  }
  if (best && empty.length > 0 && G.ap >= 1) return { type: 'play', hi: best.hi, bi: best.bi, sc: best.sc || 0 };

  // 没牌可出、没人可吃 → 看看能不能挪一步（逃命 / 打开局面），挪不动才过
  if (G.ap >= 1) {
    const mv = aiChooseMove(me);
    if (mv) return { type: 'move', from: mv.from, to: mv.to };
  }
  return null;
}

/* ------------------------------------------------------------
   AI 拟人化节奏
   真人不会匀速出牌：普通牌想一下、夺取要想清楚、偶尔长考、
   偶尔秒出。这里给每一步算一个带随机性的"思考时间"。
   ------------------------------------------------------------ */
let aiActing = false;      // AI 自己行动时置真，让行动函数放行
let aiThinking = false;    // 正在"思考"，用于界面提示
let aiMoveCount = 0;       // 本回合 AI 已经挪了几步

const AI_PACE = {
  base:      [380, 720],    // 普通出牌
  draw:      [260, 520],    // 抽牌更果断
  capture:   [700, 1300],   // 夺取要权衡
  combo:     [560, 1000],   // 能连锁时要算
  gap:       [130, 280],    // 两个动作之间的反应间隔
  turnStart: [420, 1150],   // 回合开始的"进入状态"
  longThinkP: 0.12,         // 偶尔长考的概率
  longThinkAdd: [800, 1900],
  snapP: 0.07,              // 偶尔秒出的概率
  snapMul: 0.45
};

function aiRnd(a, b) { return a + Math.random() * (b - a); }

function aiThinkTime(act) {
  let t;
  if (act.type === 'draw') t = aiRnd(AI_PACE.draw[0], AI_PACE.draw[1]);
  else if (act.type === 'capture') t = aiRnd(AI_PACE.capture[0], AI_PACE.capture[1]);
  else if (act.type === 'play' && act.sc > 0) t = aiRnd(AI_PACE.combo[0], AI_PACE.combo[1]);
  else t = aiRnd(AI_PACE.base[0], AI_PACE.base[1]);

  if (Math.random() < AI_PACE.longThinkP) t += aiRnd(AI_PACE.longThinkAdd[0], AI_PACE.longThinkAdd[1]);
  if (Math.random() < AI_PACE.snapP) t *= AI_PACE.snapMul;

  return Math.max(170, Math.round(t));
}

function aiTurn() {
  if (typeof NET !== 'undefined' && NET.mode === 'guest') return;  // AI 只在房主端跑
  if (!G || G.over) return;
  aiMoveCount = 0;
  aiStep(0);
}

function aiStep(n) {
  if (!G || G.over) return;
  if (G.ap <= 0 || n >= 60) { setTimeout(aiFinish, aiRnd(AI_PACE.gap[0], AI_PACE.gap[1])); return; }

  const act = aiChooseAction();
  if (!act) { setTimeout(aiFinish, aiRnd(AI_PACE.gap[0], AI_PACE.gap[1])); return; }

  // 先"想一会儿"，再落子
  const think = aiThinkTime(act);
  aiThinking = true;
  setTimeout(() => {
    aiThinking = false;
    if (!G || G.over) return;

    aiActing = true;
    try {
      if (act.type === 'play') doPlay(act.hi, act.bi);
      else if (act.type === 'capture') doCapture(act.hi, act.bi);
      else if (act.type === 'move') doMove(act.from, act.to);
    } finally {
      aiActing = false;
    }

    if (G.over) return;
    // 动作之后短暂"反应"，再进入下一步
    setTimeout(() => aiStep(n + 1), aiRnd(AI_PACE.gap[0], AI_PACE.gap[1]));
  }, think);
}

function aiFinish() {
  if (!G || G.over) return;
  endTurn();
}

/* ---------------- 结算 ---------------- */
function getLines() {
  const lines = [];
  for (let r = 0; r < SIZE; r++) {
    const line = [];
    for (let c = 0; c < SIZE; c++) line.push(idxOf(r, c));
    lines.push(line);
  }
  for (let c = 0; c < SIZE; c++) {
    const line = [];
    for (let r = 0; r < SIZE; r++) line.push(idxOf(r, c));
    lines.push(line);
  }
  const d1 = [], d2 = [];
  for (let i = 0; i < SIZE; i++) {
    d1.push(idxOf(i, i));
    d2.push(idxOf(i, SIZE - 1 - i));
  }
  lines.push(d1, d2);
  return lines;
}

function checkEnd() {
  if (G.over) return true;
  const boardFull = G.board.every(c => c);
  // 分数无上限：不再因为「达成目标分」而结束对局
  const allNoCards = G.deck.length === 0 && G.players.every(p => p.hand.length === 0);
  // 僵局保护：全员连续两轮一个动作都没做 → 强制结算，避免无限拖
  const stale = (G.passStreak || 0) >= NUM_PLAYERS * 2;
  if (boardFull || allNoCards || stale) {
    finishGame(
      boardFull ? '棋盘已满'
      : allNoCards ? '所有玩家手牌已用尽'
      : '连续 ' + (NUM_PLAYERS * 2) + ' 手无人行动'
    );
    return true;
  }
  return false;
}

function finishGame(reason) {
  G.over = true;
  stopTimer();
  clearTimeout(autoEndTimer);
  addLog(`════ 游戏结束（${reason}）════`, 'sys');
  playSound('win');

  const lines = getLines();
  for (let pi = 0; pi < NUM_PLAYERS; pi++) {
    const p = G.players[pi];
    let control = 0;
    for (let i = 0; i < CELLS; i++) {
      if (G.board[i] && G.board[i].owner === pi) control++;
    }
    let lineBonus = 0;
    for (const line of lines) {
      let mine = 0, theirs = 0;
      for (const i of line) {
        const cell = G.board[i];
        if (!cell || cell.owner === null) continue;
        if (cell.owner === pi) mine++;
        else theirs++;
      }
      if (mine >= 3 && mine > theirs) lineBonus += 3;
    }
    p.control = control;
    p.lineBonus = lineBonus;
    p.total = p.score + control + lineBonus;
  }

  const ranking = G.players.map((p, i) => ({ ...p, idx: i }))
    .sort((a, b) => b.total - a.total);
  const youRank = ranking.findIndex(r => r.idx === HUMAN) + 1;
  const youWin = youRank === 1;

  /* ====== 奖励计算 ====== */
  const rewards = calcRewards(youRank, youWin);

  // 应用到档案
  applyRewards(rewards);

  // 更新任务进度
  updateTasks(youRank, youWin);

  // 更新统计
  P.totalGames++;
  if (youWin) { P.wins++; P.streak++; if (P.streak > P.bestStreak) P.bestStreak = P.streak; }
  else { P.losses++; P.streak = 0; }
  if (sessionStats.maxCombo > P.maxCombo) P.maxCombo = sessionStats.maxCombo;
  saveProfile();
  checkAchievements();
  saveProfile();

  /* ====== 弹出结算 ====== */
  showResult(reason, youRank, youWin, ranking, rewards);
}

function calcRewards(rank, win) {
  // 基础奖励
  const base = {
    1: { coin: 60, exp: 15, gem: 1 },
    2: { coin: 35, exp: 10, gem: 0 },
    3: { coin: 20, exp: 6,  gem: 0 },
    4: { coin: -15, exp: 3, gem: 0 }  // 惩罚
  }[rank];

  const bonuses = [];
  let coin = base.coin;
  let exp = base.exp;
  let gem = base.gem;

  // 连胜加成
  if (win && P.streak > 0) {
    const streakBonus = Math.min(50, P.streak * 10);
    const add = Math.round(coin * streakBonus / 100);
    coin += add;
    bonuses.push({ tag: `${P.streak} 连胜`, text: `+${streakBonus}% 金币`, add: `💰+${add}` });
  }

  // 等级加成
  const lvBonus = Math.min(50, (P.level - 1) * 5);
  if (lvBonus > 0) {
    const add = Math.round(coin * lvBonus / 100);
    coin += add;
    bonuses.push({ tag: 'Lv.' + P.level, text: `+${lvBonus}% 金币`, add: `💰+${add}` });
  }

  // 每日首胜
  const today = todayStr();
  if (win && P.lastDailyWin !== today) {
    coin += 30;
    P.lastDailyWin = today;
    bonuses.push({ tag: '每日首胜', text: '每日首胜奖励', add: '💰+30' });
  }

  // 惩罚保底
  let goldLost = 0;
  if (coin < 0) {
    const before = P.coins;
    const after = Math.max(0, before + coin);
    goldLost = before - after;
    coin = -goldLost;
    bonuses.push({ tag: '保底保护', text: '金币不会为负', add: '🛡' });
  }

  return { coin, exp, gem, bonuses, rank, win };
}

function applyRewards(r) {
  pendingLevelRewards = [];
  if (r.coin >= 0) econEarn(r.coin, r.gem);
  else econSpend(-r.coin, 0);
  addExp(r.exp);

  // 把升级奖励展示到结算面板
  if (pendingLevelRewards.length) {
    let lc = 0, lg = 0;
    pendingLevelRewards.forEach(x => { lc += x.coin; lg += x.gem; });
    r.bonuses.push({
      tag: 'Lv.' + P.level,
      text: '升级奖励 ×' + pendingLevelRewards.length + ' 级',
      add: '💰+' + lc + (lg ? ' 💎+' + lg : '')
    });
  }
}

function updateTasks(rank, win) {
  P.tasks.forEach(t => {
    if (t.claimed) return;
    if (t.id === 'play3') t.progress = Math.min(t.target, t.progress + 1);
    if (t.id === 'win1' && win) t.progress = Math.min(t.target, t.progress + 1);
    if (t.id === 'combo5') t.progress = Math.max(t.progress, Math.min(t.target, sessionStats.maxCombo));
    if (t.id === 'top2' && rank <= 2) t.progress = Math.min(t.target, t.progress + 1);
  });
}

function showResult(reason, youRank, youWin, ranking, r) {
  const titles = {
    1: '🏆 你赢了！',
    2: '🥈 你排第二',
    3: '🥉 你排第三',
    4: '💀 你排第四'
  };

  let rows = '';
  ranking.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '4️⃣';
    rows += `<tr>
      <td>${medal} <span class="${PLAYER_CLASSES[p.idx]}" style="font-weight:800">${p.name}</span></td>
      <td>${p.score} + ${p.control} + ${p.lineBonus}</td>
      <td class="${p.idx === HUMAN ? 'win' : ''}">${p.total}</td>
    </tr>`;
  });

  // 奖励列表
  const rewardGrid = `
    <div class="reward-grid">
      <div class="reward-item">
        <div class="reward-icon">💰</div>
        <div class="reward-val ${r.coin >= 0 ? 'coin' : 'loss'}">${r.coin >= 0 ? '+' : ''}${r.coin}</div>
        <div class="reward-label">金币</div>
      </div>
      <div class="reward-item">
        <div class="reward-icon">⭐</div>
        <div class="reward-val exp">+${r.exp}</div>
        <div class="reward-label">经验</div>
      </div>
      <div class="reward-item">
        <div class="reward-icon">💎</div>
        <div class="reward-val gem">${r.gem > 0 ? '+' : ''}${r.gem}</div>
        <div class="reward-label">钻石</div>
      </div>
    </div>
  `;

  // 额外奖励
  let bonusHtml = '';
  if (r.bonuses && r.bonuses.length) {
    bonusHtml = '<div class="bonus-list">' +
      r.bonuses.map(b => `
        <div class="bonus-item">
          <span class="tag">${b.tag}</span>
          <span style="flex:1">${b.text}</span>
          <span class="plus">${b.add}</span>
        </div>
      `).join('') + '</div>';
  }

  // 连胜状态
  let streakHtml = '';
  if (youWin && P.streak >= 2) {
    streakHtml = `<div style="margin:10px 0;font-size:14px;color:#ff7b5c;font-weight:800;letter-spacing:1px">
      🔥 当前连胜：${P.streak} 局！（最高 ${P.bestStreak}）
    </div>`;
  } else if (!youWin && P.bestStreak >= 3) {
    streakHtml = `<div style="margin:10px 0;font-size:13px;color:#8fa89a">
      最高连胜记录：${P.bestStreak} 局 · 继续努力！
    </div>`;
  }

  const res = document.getElementById('result');
  res.innerHTML = `
    <h2>${titles[youRank]}</h2>
    <div class="sub">${reason} · 总分 = 即时分 + 控制分 + 连线分</div>
    ${rewardGrid}
    ${bonusHtml}
    ${streakHtml}
    <table>
      <tr style="color:#7c9488;font-size:12px">
        <td>玩家</td><td>即时+控制+连线</td><td>总分</td>
      </tr>
      ${rows}
    </table>
    <div class="result-btn-row">
      <button class="result-btn" id="btnAgain">🔄 再来一局</button>
      <button class="result-btn secondary" id="btnBackHome">🏠 返回大厅</button>
    </div>
  `;

  document.getElementById('overlay').classList.remove('hidden');

  // 绑定
  document.getElementById('btnAgain').addEventListener('click', () => {
    document.getElementById('overlay').classList.add('hidden');
    newGame();
  });
  document.getElementById('btnBackHome').addEventListener('click', () => {
    document.getElementById('overlay').classList.add('hidden');
    backToLobby();
  });

  // 胜利特效 - 全屏爆破
  if (youWin) {
    playSound('win');
    screenFlash('win');
    shakeScreen('xl');
    setTimeout(() => {
      const c = boardCenter();
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          spawnParticles(
            c.x + (Math.random() - .5) * 600,
            c.y + (Math.random() - .5) * 500,
            40,
            ['#f5d97a', '#ffe58a', '#7fd4a8', '#ffffff'][i % 4],
            320
          );
          if (i % 2 === 0) shockwave(
            c.x + (Math.random() - .5) * 400,
            c.y + (Math.random() - .5) * 300,
            2
          );
        }, i * 150);
      }
      // 大字
      boomText(window.innerWidth / 2, window.innerHeight / 2, '🏆 胜利', 'fire', 80);
    }, 200);
  }

  // 结算界面同时再给一次大粒子飘字
  setTimeout(() => {
    if (r.coin > 0) {
      const c = { x: window.innerWidth/2, y: window.innerHeight/2 - 100 };
      floatScore(c.x, c.y, '💰 +' + r.coin, '');
    }
  }, 500);
}

/* ---------------- 提示 ---------------- */
function computeHints() {
  const place = {}, capture = {}, move = {};
  if (!G || G.over || G.turn !== HUMAN || locked || !G.started) return { place, capture, move };
  if (G.selectedHand >= 0) {
    const card = G.players[HUMAN].hand[G.selectedHand];
    if (!card) return { place, capture, move };
    if (G.ap >= 1) {
      const hasOwn = playerHasPiece(HUMAN);
      for (let i = 0; i < CELLS; i++) {
        if (!canPlaceAt(i, HUMAN, hasOwn)) continue;
        const combos = simulatePlacement(G.board, i, card, HUMAN);
        let sc = 0, ap = 0;
        for (const c of combos) { sc += c.score; ap += c.ap; }
        place[i] = { sc, ap, n: combos.length, lv: hintLevel(sc) };
      }
    }
    // 吃牌：单张/对子比点数，三条及以上无视点数
    for (let i = 0; i < CELLS; i++) {
      const eat = canEat(i, card, HUMAN);
      if (eat && G.ap >= eat.ap) capture[i] = true;
    }
  } else if (G.selectedPiece >= 0 && G.ap >= 1 && (G.movesThisTurn || 0) < MOVE_LIMIT) {
    for (let i = 0; i < CELLS; i++) {
      if (i === G.selectedPiece) continue;
      if (!G.board[i] && adjacent(G.selectedPiece, i)) move[i] = true;
    }
  }
  return { place, capture, move };
}

/* ---------------- 威胁区计算 ---------------- */
function computeThreatZones() {
  const threats = {};
  if (!G || G.over || !G.started) return threats;
  // 对每个玩家，找出他们可以被夺取的位置
  for (let pid = 0; pid < NUM_PLAYERS; pid++) {
    if (pid === HUMAN && G.turn !== HUMAN) continue; // 只显示当前玩家可夺取的
    if (pid !== HUMAN && !G.players[pid].ai) continue; // 只对AI显示
    
    for (let i = 0; i < CELLS; i++) {
      const t = G.board[i];
      if (!t || !t.card || t.owner === null || t.owner === pid) continue; // 跳过空位、无牌格和自己的棋子
      // 检查是否有相邻的己方棋子
      if (hasAdjacentOwnPiece(i, pid)) {
        // 这个位置可以被pid夺取
        if (!threats[i]) threats[i] = pid; // 记录是谁的威胁区
      }
    }
  }
  return threats;
}

function giveHint() {
  if (locked || !G || G.over || G.turn !== HUMAN || !G.started) return;
  if (G.suggestCell >= 0) {
    G.suggestCell = -1;
    G.suggestHand = -1;
    G.selectedHand = -1;
    render();
    return;
  }
  const hand = G.players[HUMAN].hand;
  if (!hand.length) { toast('手牌为空，点「抽 1/2/3 张」吧'); return; }

  let best = null;
  const hasOwn = playerHasPiece(HUMAN);
  for (let hi = 0; hi < hand.length; hi++) {
    if (G.ap >= 1) {
      for (let bi = 0; bi < CELLS; bi++) {
        if (!canPlaceAt(bi, HUMAN, hasOwn)) continue;
        const combos = simulatePlacement(G.board, bi, hand[hi], HUMAN);
        let sc = 0, ap = 0;
        for (const c of combos) { sc += c.score; ap += c.ap; }
        const total = sc * 100 + ap * 40 + centerValue(bi) * 3;
        if (!best || total > best.total) {
          best = { total, hi, bi, sc, ap, type: 'play', combos };
        }
      }
    }
    {
      for (let bi = 0; bi < CELLS; bi++) {
        const eat = canEat(bi, hand[hi], HUMAN);
        if (!eat || G.ap < eat.ap) continue;
        let sc = 0;
        for (const c of eat.combos) sc += c.score;
        const total = sc * 100 + 60 + eat.target.card.v * 3 + (eat.ignoreRank ? 40 : 0) + centerValue(bi) * 3;
        if (!best || total > best.total) {
          best = { total, hi, bi, sc, type: 'capture', combos: eat.combos };
        }
      }
    }
  }

  if (!best) {
    toast('没什么可做的了，点「⏭ 过」保留 AP 到下回合');
    return;
  }

  G.selectedHand = best.hi;
  G.selectedPiece = -1;
  G.suggestHand = best.hi;
  G.suggestCell = best.bi;
  render();

  const cellEl = document.querySelectorAll('.cell')[best.bi];
  if (cellEl) {
    const c = centerOf(cellEl);
    const lv = hintLevel(best.sc);
    const count = 8 + lv * 8;
    const spread = 100 + lv * 40;
    spawnParticles(c.x, c.y, count, '#f5d97a', spread);
    if (lv >= 3) spawnParticles(c.x, c.y, count, '#ffe58a', spread + 40);
    if (lv >= 4) shakeScreen('s');
  }

  const card = G.players[HUMAN].hand[best.hi];
  let msg = `推荐：打出 ${cardText(card)} 到高亮格`;
  if (best.type === 'capture') msg = `推荐：用 ${cardText(card)} 夺取高亮位置`;
  if (best.combos && best.combos.length) {
    const names = best.combos.map(c => c.name).join(' + ');
    const sc = best.combos.reduce((a, c) => a + c.score, 0);
    const ap = best.combos.reduce((a, c) => a + c.ap, 0);
    msg += `，可形成 ${names}（+${sc}分 / +${ap}AP）`;
  } else {
    msg += '，暂无连锁';
  }
  toast(msg, 3200);
}

function toast(msg, dur = 2400) {
  const g = document.getElementById('guide');
  if (!g) return;
  g.innerHTML = `<span class="num gold">💡</span> ${msg}`;
  clearTimeout(g._t);
  g._t = setTimeout(updateHint, dur);
}

function updateHint() {
  const g = document.getElementById('guide');
  if (!g || !G) return;
  if (G.over) { g.innerHTML = `<span class="num gold">✓</span> 对局结束`; return; }
  if (!G.started) { g.innerHTML = `<span class="num">…</span> 掷骰中…`; return; }
  if (G.players[G.turn].ai) {
    g.innerHTML = `<span class="num ai-pulse">…</span> <span class="${PLAYER_CLASSES[G.turn]}">${G.players[G.turn].name}</span> 正在思考<span class="ai-dots"><i></i><i></i><i></i></span>`;
    return;
  }
  if (G.ap <= 0) {
    g.innerHTML = `<span class="num gold">!</span> 行动点用完啦 —— 回合即将自动结束`;
    return;
  }
  if (G.selectedHand >= 0) {
    g.innerHTML = `<span class="num gold">2</span> 金格按分数分级：<b>越亮分越高</b>，点对应格子落子`;
    return;
  }
  if (G.selectedPiece >= 0) {
    g.innerHTML = `<span class="num gold">2</span> 点击 <b>绿色闪烁</b> 的相邻格子移动棋子`;
    return;
  }
  g.innerHTML = `<span class="num">1</span> 先点击 <b>下方手牌</b> 选中一张牌；每回合已自动抽 1 张，剩 AP 点 <b>⏭ 过</b> 可 <span class="hl-purple">保留一半（最多 ${CARRY_MAX}）</span> 到下回合`;
}

