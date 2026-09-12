/* ---------------- 特效 ---------------- */
function shakeScreen(level = 's') {
  const wrap = document.getElementById('game');
  if (!wrap) return;
  if (fxQuiet()) level = 's';     // AI 回合最多轻微震动，避免连环猛震
  const cls = 'shake-' + level;
  wrap.classList.remove('shake-s', 'shake-m', 'shake-l', 'shake-xl');
  void wrap.offsetWidth;
  wrap.classList.add(cls);
  setTimeout(() => wrap.classList.remove(cls), 1100);
}

/* ============================================================
   Canvas 特效引擎
   —— 粒子 / 拖尾 / 星尘 / 闪电连线 全部走 canvas，避免海量 DOM
   ============================================================ */
const FX = {
  canvas: null, ctx: null,
  w: 0, h: 0, dpr: 1,
  parts: [], dust: [], lines: [],
  raf: 0, last: 0, running: false, t: 0,
  maxParts: 2400,
  level: 'high',
  maxDpr: 2
};

function fxInit() {
  if (FX.ctx) return;
  const c = document.getElementById('fxCanvas');
  if (!c || !c.getContext) return;
  FX.canvas = c;
  FX.ctx = c.getContext('2d', { alpha: true, desynchronized: true });
  fxResize();
  fxSeedDust();
  window.addEventListener('resize', fxResize);
  window.addEventListener('orientationchange', () => setTimeout(fxResize, 250));
  document.addEventListener('visibilitychange', () => { FX.last = performance.now(); fxWake(); });
}

function fxResize() {
  if (!FX.ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, FX.maxDpr);
  FX.dpr = dpr;
  FX.w = window.innerWidth;
  FX.h = window.innerHeight;
  FX.canvas.width = Math.max(1, Math.floor(FX.w * dpr));
  FX.canvas.height = Math.max(1, Math.floor(FX.h * dpr));
  FX.canvas.style.width = FX.w + 'px';
  FX.canvas.style.height = FX.h + 'px';
  FX.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fxSeedDust();
}

function fxSeedDust() {
  const count = 30;
  const colors = ['#f5d97a', '#7fd4a8', '#b17aff', '#4a9eff', '#ffffff'];
  FX.dust = [];
  for (let i = 0; i < count; i++) {
    FX.dust.push({
      x: Math.random() * (FX.w || window.innerWidth),
      y: Math.random() * (FX.h || window.innerHeight),
      r: 0.8 + Math.random() * 2,
      v: 10 + Math.random() * 24,
      a: 0.12 + Math.random() * 0.35,
      c: colors[(Math.random() * colors.length) | 0],
      ph: Math.random() * 6.283
    });
  }
}

/* 性能档位：只调渲染分辨率与粒子容量，不改动任何效果本身 */
function fxSetLevel(level) {
  FX.level = level;
  if (level === 'low') { FX.maxDpr = 1; FX.maxParts = 1400; }
  else if (level === 'mid') { FX.maxDpr = 1.5; FX.maxParts = 1900; }
  else { FX.maxDpr = 2; FX.maxParts = 2400; }
  fxResize();
}

function fxWake() {
  if (document.hidden) return;
  if (FX.running || !FX.ctx) return;
  FX.running = true;
  FX.last = performance.now();
  FX.raf = requestAnimationFrame(fxLoop);
}

function fxLoop(now) {
  const dt = Math.min(0.05, (now - FX.last) / 1000) || 0.016;
  FX.last = now;
  FX.t += dt;
  fxUpdate(dt);
  fxDraw();
  if (document.hidden || (!FX.parts.length && !FX.lines.length && !FX.dust.length)) {
    FX.running = false;
    return;
  }
  FX.raf = requestAnimationFrame(fxLoop);
}

function fxUpdate(dt) {
  const P = FX.parts;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) { P.splice(i, 1); continue; }
    p.px = p.x; p.py = p.y;
    p.vy += p.g * dt;
    const k = Math.exp(-p.damp * dt);
    p.vx *= k; p.vy *= k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  const L = FX.lines;
  for (let i = L.length - 1; i >= 0; i--) {
    const l = L[i];
    if (l.delay > 0) { l.delay -= dt; continue; }
    l.life -= dt;
    if (l.life <= 0) L.splice(i, 1);
  }
  const D = FX.dust;
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    d.y -= d.v * dt;
    if (d.y < -8) { d.y = (FX.h || window.innerHeight) + 8; d.x = Math.random() * FX.w; }
  }
}

function fxDraw() {
  const ctx = FX.ctx;
  if (!ctx) return;
  ctx.clearRect(0, 0, FX.w, FX.h);
  ctx.globalCompositeOperation = 'lighter';

  // 星尘
  for (let i = 0; i < FX.dust.length; i++) {
    const d = FX.dust[i];
    ctx.globalAlpha = d.a * (0.55 + 0.45 * Math.sin(FX.t * 1.6 + d.ph));
    ctx.fillStyle = d.c;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, 6.2832);
    ctx.fill();
  }

  // 粒子
  const P = FX.parts;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const lr = p.life / p.max;
    const a = lr > 0.85 ? 1 : Math.max(0, lr / 0.85);
    const s = p.size * (0.35 + lr * 0.65);
    if (p.streak) {
      ctx.globalAlpha = a * 0.45;
      ctx.strokeStyle = p.c;
      ctx.lineWidth = s * 0.8;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.fillStyle = p.c;
    ctx.globalAlpha = a * 0.3;
    ctx.beginPath(); ctx.arc(p.x, p.y, s * 2, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, 6.2832); ctx.fill();
  }

  // 闪电连线
  const L = FX.lines;
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (l.delay > 0) continue;
    const pr = 1 - l.life / l.max;
    const grow = Math.min(1, pr / 0.7);
    const fade = pr < 0.7 ? 1 : 1 - (pr - 0.7) / 0.3;
    const SEG = 14;
    ctx.globalAlpha = Math.max(0, fade) * 0.28;
    ctx.strokeStyle = '#f5d97a';
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let s = 0; s <= SEG; s++) {
      const tt = (s / SEG) * grow;
      const mt = 1 - tt;
      const px = mt * mt * l.x1 + 2 * mt * tt * l.cx + tt * tt * l.x2;
      const py = mt * mt * l.y1 + 2 * mt * tt * l.cy + tt * tt * l.y2;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------- DOM 特效数量上限（防止堆叠卡顿）---------------- */
function fxCap(sel, max) {
  const list = document.querySelectorAll(sel);
  if (list.length > max) {
    for (let i = 0; i < list.length - max; i++) list[i].remove();
  }
}

/* AI 回合时收敛全屏特效：闪屏会连成一串造成频闪，震动也过强 */
function fxQuiet() {
  return typeof G !== 'undefined' && G && G.players && G.players[G.turn] && G.players[G.turn].ai;
}

// 屏幕闪光
function screenFlash(type = '') {
  if (fxQuiet()) return;          // AI 行动不触发全屏闪光
  fxCap('.screen-flash', 1);
  const el = document.createElement('div');
  el.className = 'screen-flash' + (type ? ' ' + type : '');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// 冲击波环
function shockwave(x, y, layers = 2) {
  if (fxQuiet()) layers = Math.min(layers, 2);
  fxCap('.shockwave', 8);
  for (let i = 0; i < layers; i++) {
    setTimeout(() => {
      const w = document.createElement('div');
      w.className = 'shockwave' + (i === 1 ? ' w2' : i === 2 ? ' w3' : '');
      w.style.left = x + 'px';
      w.style.top = y + 'px';
      document.body.appendChild(w);
      setTimeout(() => w.remove(), 950);
    }, i * 80);
  }
}

// 粒子爆发（Canvas 渲染，含拖尾）
function spawnParticles(x, y, count, color, spread = 180) {
  if (!FX.ctx) fxInit();
  if (!FX.ctx) return;
  const n = Math.max(1, count | 0);
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random() * 0.9);
    const dur = 0.7 + Math.random() * 0.7;
    const sp = dist / dur;
    FX.parts.push({
      x, y, px: x, py: y,
      vx: Math.cos(angle) * sp,
      vy: Math.sin(angle) * sp - 40,
      g: 320, damp: 1.6,
      life: dur, max: dur,
      size: 2.5 + Math.random() * 5,
      c: color,
      streak: true
    });
  }
  if (FX.parts.length > FX.maxParts) {
    FX.parts.splice(0, FX.parts.length - FX.maxParts);
  }
  fxWake();
}

// 大字爆炸
function boomText(x, y, text, type = 'fire', fontSize = 42) {
  fxCap('.boom-text', 8);
  const el = document.createElement('div');
  el.className = 'boom-text ' + type;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.fontSize = fontSize + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

// 得分飘字
function floatScore(x, y, text, cls = '') {
  fxCap('.float-score', 8);
  const el = document.createElement('div');
  el.className = 'float-score ' + cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// 组合名弹出
function comboPop(x, y, text) {
  fxCap('.combo-pop', 6);
  const el = document.createElement('div');
  el.className = 'combo-pop';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// 连击计数器
function showComboCounter(n) {
  fxCap('.combo-counter', 1);
  const el = document.createElement('div');
  el.className = 'combo-counter';
  el.textContent = 'x' + n;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1150);
}

// 闪电连线（Canvas 绘制，连接 combo 涉及的所有格子）
function drawChainLines(centerIdx, involvedIdxList) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  const cells = boardEl.querySelectorAll('.cell');
  const centerEl = cells[centerIdx];
  if (!centerEl) return;
  const cc = centerEl.getBoundingClientRect();
  const cx = cc.left + cc.width / 2;
  const cy = cc.top + cc.height / 2;

  const maxLines = 12;
  involvedIdxList.slice(0, maxLines).forEach((otherIdx, k) => {
    const otherEl = cells[otherIdx];
    if (!otherEl) return;
    const oc = otherEl.getBoundingClientRect();
    const ox = oc.left + oc.width / 2;
    const oy = oc.top + oc.height / 2;
    const mx = (cx + ox) / 2 + (Math.random() - 0.5) * 30;
    const my = (cy + oy) / 2 + (Math.random() - 0.5) * 30;
    const d = 0.55 + k * 0.06;
    FX.lines.push({ x1: cx, y1: cy, cx: mx, cy: my, x2: ox, y2: oy, life: d, max: d, delay: k * 0.06 });
  });
  fxWake();
}

// 背景星尘（Canvas）
function startStardust() {
  fxInit();
  fxWake();
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function boardCenter() {
  const b = document.getElementById('board');
  if (!b) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function bumpEl(el) {
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// 获取连锁涉及的所有格子索引
function getComboInvolvedIndexes(centerIdx, card, comboName) {
  // 简化：返回与中心格同点数或同花色的相邻格子
  const result = [centerIdx];
  if (!G) return result;
  const r0 = rowOf(centerIdx), c0 = colOf(centerIdx);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r0 + dr, nc = c0 + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const ni = idxOf(nr, nc);
      const cell = G.board[ni];
      if (cell && cell.card && (cell.card.v === card.v || cell.card.s === card.s)) {
        result.push(ni);
      }
    }
  }
  // 同花顺需要遍历四条方向
  if (comboName.indexOf('顺') >= 0 || comboName.indexOf('同花') >= 0) {
    const DIRS = [[0,1],[1,0],[1,1],[1,-1]];
    DIRS.forEach(([dr, dc]) => {
      for (let k = 1; k < SIZE; k++) {
        const nr = r0 + dr * k, nc = c0 + dc * k;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) break;
        const ni = idxOf(nr, nc);
        const cell = G.board[ni];
        if (cell && cell.card && (cell.card.s === card.s || Math.abs(cell.card.v - card.v) <= 4)) {
          result.push(ni);
        } else break;
      }
      for (let k = 1; k < SIZE; k++) {
        const nr = r0 - dr * k, nc = c0 - dc * k;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) break;
        const ni = idxOf(nr, nc);
        const cell = G.board[ni];
        if (cell && cell.card && (cell.card.s === card.s || Math.abs(cell.card.v - card.v) <= 4)) {
          result.push(ni);
        } else break;
      }
    });
  }
  return [...new Set(result)].filter(i => i !== centerIdx);
}
