/* ============================================================
   局域网联机 · WebRTC P2P
   ------------------------------------------------------------
   架构：房主权威（host-authoritative）
   · 信令：用公开的 ntfy.sh 中转 SDP（只用于握手，不传游戏数据）
   · 游戏数据：WebRTC DataChannel 点对点直连，同一局域网内
     直达，不经过任何服务器
   · 房主跑真正的游戏逻辑，每次状态变化广播快照
   · 客人只负责渲染 + 把操作意图发给房主
   ============================================================ */

var NET = {
  mode: 'off',        // off | host | guest
  room: '',
  myId: '',
  mySeat: 0,
  seats: [null, null, null, null],   // 'human' | null
  peers: [],          // { id, name, seat, pc, dc, dcOpen }
  since: 0,
  es: null,           // 信令 SSE 连接
  sigReady: false,
  seen: {},
  snapVer: 0,
  status: '未联机',
  starting: false,
  log: []
};

const SIG = 'https://ntfy.sh/';
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ---------------- 工具 ---------------- */
function netRnd(n) {
  let s = '';
  const buf = new Uint32Array(n);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  for (let i = 0; i < n; i++) s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return s;
}
function netIsHumanSeat(i) {
  if (NET.mode === 'off') return i === 0;
  return NET.seats[i] === 'human';
}
function netSeatCount() { return NET.seats.filter(s => s === 'human').length; }
function netFreeSeat() {
  for (let i = 1; i < NUM_PLAYERS; i++) if (!NET.seats[i]) return i;
  return -1;
}
function netLog(text) {
  NET.status = text;
  netRenderPanel();
}
function netSetStatusOnly(text) {
  NET.status = text;
  const el = document.getElementById('netStatus');
  if (el) el.textContent = text;
}

/* ---------------- 信令（ntfy.sh） ---------------- */
async function sigPublish(obj) {
  const r = await fetch(SIG + NET.room, { method: 'POST', body: JSON.stringify(obj) });
  if (r.status === 429) throw new Error('信令服务限流，请稍后再试');
  return r;
}
async function sigSendChunked(base, data) {
  const CH = 3000;
  const n = Math.max(1, Math.ceil(data.length / CH));
  for (let i = 0; i < n; i++) {
    await sigPublish(Object.assign({}, base, { p: i, n: n, d: data.slice(i * CH, (i + 1) * CH) }));
  }
}

const sigBuf = {};
function sigCollect(msg) {
  if (!msg.n || msg.n === 1) return msg;
  const key = [msg.k, msg.from, msg.to, msg.sigid].join('|');
  let e = sigBuf[key];
  if (!e) { e = { parts: [], got: 0, head: msg }; sigBuf[key] = e; }
  if (e.parts[msg.p] === undefined) { e.parts[msg.p] = msg.d; e.got++; }
  if (e.got === msg.n) {
    delete sigBuf[key];
    return Object.assign({}, e.head, { d: e.parts.join('') });
  }
  return null;
}

/* 用 SSE 长连接订阅信令：一条连接顶掉成千上万次轮询，避开限流 */
function netSubscribe() {
  netUnsubscribe();
  if (!NET.room) return;
  try {
    NET.es = new EventSource(SIG + NET.room + '/sse?since=' + NET.since);
    NET.es.onopen = () => { NET.sigReady = true; };
    NET.es.onmessage = ev => {
      let j;
      try { j = JSON.parse(ev.data); } catch (e) { return; }
      if (j.event !== 'message' || !j.message) return;
      const mid = j.id || (j.time + ':' + j.message.length);
      if (NET.seen[mid]) return;
      NET.seen[mid] = 1;
      let msg;
      try { msg = JSON.parse(j.message); } catch (e) { return; }
      if (msg.from === NET.myId) return;
      const full = sigCollect(msg);
      if (full) onSignal(full);
    };
    NET.es.onerror = () => {
      if (NET.es && NET.es.readyState === 2) netSetStatusOnly('信令断线，正在重连…');
    };
  } catch (e) {
    netSetStatusOnly('信令连接失败：' + e.message);
  }
}
function netUnsubscribe() {
  if (NET.es) { try { NET.es.close(); } catch (e) {} }
  NET.es = null;
  NET.sigReady = false;
}
function netStartPolling() { netSubscribe(); }
function netStopPolling() { netUnsubscribe(); }

/* ---------------- 房主 ---------------- */
function netHostCreate() {
  NET.mode = 'host';
  NET.room = 'uc2' + netRnd(5);
  NET.myId = 'h-' + netRnd(4);
  NET.mySeat = 0;
  NET.seats = ['human', null, null, null];
  NET.peers = [];
  NET.seen = {};
  NET.since = Math.floor(Date.now() / 1000) - 2;
  netStartPolling();
  netLog('等待玩家加入…');
  netRenderPanel();
}

function netHostSpawnPeer(joinMsg) {
  const gid = joinMsg.from;
  if (NET.peers.some(p => p.id === gid)) return;
  const seat = netFreeSeat();
  if (seat < 0) { sigPublish({ k: 'full', to: gid, from: NET.myId }); return; }

  const pc = new RTCPeerConnection(ICE_CONFIG);
  const peer = { id: gid, name: joinMsg.name || ('玩家' + (seat + 1)), seat: seat, pc: pc, dc: null, dcOpen: false, tries: 0 };
  NET.peers.push(peer);

  pc.onicecandidate = e => { if (e.candidate) peer.ice = (peer.ice || []).concat(e.candidate.candidate); };

  // 连接状态变化：断线先尝试 ICE 重启自愈，失败才把座位交回 AI
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === 'connected') {
      peer.dcOpen = (peer.dc && peer.dc.readyState === 'open');
      peer.tries = 0;
      netLog('🔗 与 ' + peer.name + ' 的直连已就绪');
      netRenderPanel();
    } else if (st === 'failed') {
      peer.tries = (peer.tries || 0) + 1;
      if (peer.tries <= 2) {
        netLog('⚠ 与 ' + peer.name + ' 的连接中断，尝试重连（' + peer.tries + '/2）…');
        netRenderPanel();
        try { pc.restartIce(); } catch (e) {}
      } else {
        peer.dcOpen = false;
        NET.seats[seat] = null;
        netLog('❌ 与 ' + peer.name + ' 断开，座位 ' + (seat + 1) + ' 已交回 AI');
        netHostBroadcastRoster();
        netRenderPanel();
      }
    } else if (st === 'disconnected') {
      netLog('⚠ 与 ' + peer.name + ' 的连接不稳定…');
      netRenderPanel();
    }
  };

  // ICE 重启后会触发协商，需要重新发一次 offer
  pc.onnegotiationneeded = async () => {
    if (peer.tries === 0) return;          // 首次由下面的 createOffer 负责
    try {
      const o = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(o);
      await waitIce(pc);
      await sigSendChunked({ k: 'offer', to: peer.id, from: NET.myId, restart: 1 }, pc.localDescription.sdp);
      netLog('🔄 已向 ' + peer.name + ' 发起重连…');
    } catch (e) { netLog('重连失败：' + e.message); }
  };

  const dc = pc.createDataChannel('uc', { ordered: true });
  peer.dc = dc;
  dc.onopen = () => {
    peer.dcOpen = true;
    NET.seats[seat] = 'human';
    dc.send(JSON.stringify({ k: 'welcome', seat: seat, host: 'host' }));
    netHostBroadcastRoster();
    netLog('✅ ' + peer.name + ' 已加入（座位 ' + (seat + 1) + '）');
    netRenderPanel();
    if (G && G.started) setTimeout(netHostPushSnap, 300);
  };
  dc.onclose = () => {
    peer.dcOpen = false;
    NET.seats[seat] = null;
    netLog('⚠ ' + peer.name + ' 已离开');
    netHostBroadcastRoster();
    netRenderPanel();
  };
  dc.onmessage = ev => hostOnMessage(peer, ev.data);

  pc.createOffer()
    .then(o => pc.setLocalDescription(o))
    .then(() => waitIce(pc))
    .then(() => sigSendChunked({ k: 'offer', to: gid, from: NET.myId }, pc.localDescription.sdp))
    .then(() => netLog('正在与 ' + peer.name + ' 建立直连…'))
    .catch(e => netLog('❌ 建立失败：' + e.message));
}

function waitIce(pc) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => {
      if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', done); res(); }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(res, 2500);
  });
}

function onSignal(msg) {
  if (NET.mode === 'host') {
    if (msg.k === 'join') netHostSpawnPeer(msg);
    else if (msg.k === 'answer') {
      const peer = NET.peers.find(p => p.id === msg.from);
      if (peer && peer.pc) peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.d }).catch(() => {});
    }
  } else if (NET.mode === 'guest') {
    if (msg.to !== NET.myId) return;
    if (msg.k === 'full') { netLog('❌ 房间已满'); netGuestTeardown(); }
    else if (msg.k === 'offer') { NET.hostId = msg.from; netGuestAnswer(msg.d); }
  }
}

/* ---------------- 客人 ---------------- */
function netGuestJoin(code) {
  NET.mode = 'guest';
  NET.room = 'uc2' + code.toUpperCase();
  NET.myId = 'g-' + netRnd(4);
  NET.mySeat = -1;
  NET.seen = {};
  NET.since = Math.floor(Date.now() / 1000) - 2;
  netSubscribe();
  netLog('正在连接房间 ' + code.toUpperCase() + ' …');
  sigPublish({ k: 'join', from: NET.myId, name: P.playerName || '玩家' })
    .catch(e => netLog('❌ ' + e.message));
  netRenderPanel();
}

function netGuestAnswer(offerSdp) {
  // 重连时复用已有的 PeerConnection（DataChannel 已在，不用重建）
  let pc = NET.pc;
  if (!pc || pc.connectionState === 'closed') {
    pc = new RTCPeerConnection(ICE_CONFIG);
    NET.pc = pc;
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') { netLog('🔗 与房主的直连已就绪'); netRenderPanel(); }
      else if (st === 'failed') { netLog('⚠ 与房主断开，正在自动重连…'); netRenderPanel(); }
      else if (st === 'disconnected') { netLog('⚠ 网络不稳定…'); netRenderPanel(); }
    };
    pc.ondatachannel = ev => {
      const dc = ev.channel;
      NET.dc = dc;
      dc.onopen = () => {
        // 信令保持连接：断线重连时还要用它换新的 SDP
        netLog('✅ 已连上房主，等待开始…');
        netRenderPanel();
      };
      dc.onclose = () => { netLog('⚠ 与房主断开'); netRenderPanel(); };
      dc.onmessage = e => guestOnMessage(e.data);
    };
  }

  pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
    .then(() => pc.createAnswer())
    .then(a => pc.setLocalDescription(a))
    .then(() => waitIce(pc))
    .then(() => sigSendChunked({ k: 'answer', to: NET.hostId, from: NET.myId, sigid: NET.myId }, pc.localDescription.sdp))
    .then(() => netLog('已回送应答，等待房主确认…'))
    .catch(e => netLog('❌ 连接失败：' + e.message));
}

function netGuestTeardown() {
  netStopPolling();
  if (NET.pc) { try { NET.pc.close(); } catch (e) {} }
  NET.pc = null; NET.dc = null; NET.mode = 'off';
  NET.seats = [null, null, null, null];
  netRenderPanel();
}

/* ---------------- 数据通道 ---------------- */
function hostOnMessage(peer, data) {
  let m;
  try { m = JSON.parse(data); } catch (e) { netLog('⚠ 收到 ' + peer.name + ' 的乱码消息'); return; }
  if (m.k === 'hello') { peer.name = m.name || peer.name; netHostBroadcastRoster(); return; }
  if (m.k === 'act') { netHostApplyIntent(peer, m); return; }
  if (m.k === 'emoji') { return; }
  netLog('⚠ 收到未知消息 ' + m.k);
}

function netHostApplyIntent(peer, m) {
  if (!G || G.over) { netLog('⚠ ' + peer.name + ' 的操作被丢弃（对局未开始或已结束）'); return; }
  if (G.turn !== peer.seat) {
    // 常见于：客人本地快照还没刷到最新，点了不该他操作的一手
    netLog('⚠ ' + peer.name + '（座位 ' + (peer.seat + 1) + '）的操作被忽略：当前是 ' +
           G.players[G.turn].name + ' 的回合');
    return;
  }
  const p = m.p || {};
  const apBefore = G.ap;
  switch (m.a) {
    case 'play':    doPlay(p.hi, p.bi); break;
    case 'draw':    doDraw(p.n); break;
    case 'capture': doCapture(p.hi, p.bi); break;
    case 'move':    doMove(p.from, p.to); break;
    case 'pass':    doPass(); break;
  }
  if (G.ap === apBefore && m.a !== 'pass') {
    netLog('⚠ ' + peer.name + ' 的操作没生效（AP 未变化），可能是落点非法');
  }
}

function guestOnMessage(data) {
  let m;
  try { m = JSON.parse(data); } catch (e) { return; }
  if (m.k === 'welcome') {
    NET.mySeat = m.seat;
    HUMAN = m.seat;
    netRenderPanel();
    return;
  }
  if (m.k === 'roster') { NET.seats = m.seats; netRenderPanel(); return; }
  if (m.k === 'snap') { netApplySnap(m); return; }
  if (m.k === 'tick') { timeLeft = m.t; updateTimerDisplay(); return; }
  if (m.k === 'bye') { netLog('房主已结束房间'); netGuestTeardown(); backToLobby(); }
}

function netIntent(a, p) {
  if (!G || G.over) return;
  if (G.turn !== HUMAN) return;   // 不是自己的回合，房主会自行校验
  if (NET.dc && NET.dc.readyState === 'open') {
    NET.dc.send(JSON.stringify({ k: 'act', a: a, p: p }));
  }
}

/* ---------------- 状态同步 ---------------- */
function netPackG() {
  return {
    board: G.board,
    deck: G.deck,
    players: G.players.map((p, i) => ({
      name: PLAYER_NAMES[i],   // 只发中性名（按颜色），各端自己把本地座位改成「你」
      ai: !!p.ai, score: p.score, hand: p.hand,
      carryAP: p.carryAP || 0, control: p.control || 0,
      lineBonus: p.lineBonus || 0, total: p.total || 0
    })),
    turn: G.turn, ap: G.ap, bonusAP: G.bonusAP,
    over: G.over, started: G.started, drewThisTurn: G.drewThisTurn
  };
}

function netLogHTML() {
  const el = document.getElementById('log');
  if (!el) return '';
  const kids = el.children;
  const from = Math.max(0, kids.length - 45);
  let html = '';
  for (let i = from; i < kids.length; i++) html += kids[i].outerHTML;
  return html.slice(0, 12000);
}

function netHostPushSnap() {
  if (NET.mode !== 'host' || !G) return;
  const payload = JSON.stringify({
    k: 'snap',
    v: ++NET.snapVer,
    G: netPackG(),
    t: Math.ceil(timeLeft),
    log: netLogHTML(),
    lg: logCount,
    seats: NET.seats
  });
  for (const peer of NET.peers) {
    if (peer.dc && peer.dc.readyState === 'open') {
      try { peer.dc.send(payload); } catch (e) {}
    }
  }
}

let netPushTimer = null;
function netPushSoon() {
  if (NET.mode !== 'host') return;
  if (netPushTimer) return;
  netPushTimer = setTimeout(() => { netPushTimer = null; netHostPushSnap(); }, 70);
}

function netHostTick() {
  if (NET.mode !== 'host' || !G || G.over) return;
  const payload = JSON.stringify({ k: 'tick', t: Math.ceil(timeLeft) });
  for (const peer of NET.peers) {
    if (peer.dc && peer.dc.readyState === 'open') { try { peer.dc.send(payload); } catch (e) {} }
  }
}

function netApplySnap(s) {
  const keep = G ? {
    selectedHand: G.selectedHand, selectedPiece: G.selectedPiece,
    suggestCell: G.suggestCell, suggestHand: G.suggestHand
  } : {};
  G = s.G;
  Object.assign(G, keep);
  locked = false;   // 客人端不做本地锁定，一律由房主仲裁
  // 把本地座位显示成「你」（房主发的都是中性名）
  if (G.players && G.players[NET.mySeat]) G.players[NET.mySeat].name = '你';
  if (typeof s.t === 'number') timeLeft = s.t;
  if (typeof s.seats !== 'undefined') NET.seats = s.seats;
  if (typeof s.lg === 'number') logCount = s.lg;

  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  document.getElementById('diceOverlay').classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');

  const logEl = document.getElementById('log');
  if (logEl && typeof s.log === 'string') logEl.innerHTML = s.log;

  render();
  updateTimerDisplay();
}

/* ---------------- 房主控制 ---------------- */
function netHostStartMatch() {
  if (NET.mode !== 'host') return;
  netHostBroadcastRoster();
  startMatch();
  // 掷骰结束后广播首批快照
  const wait = () => { if (G && G.started) netHostPushSnap(); else setTimeout(wait, 400); };
  setTimeout(wait, 600);
}

function netHostBroadcastRoster() {
  const payload = JSON.stringify({ k: 'roster', seats: NET.seats });
  for (const peer of NET.peers) {
    if (peer.dc && peer.dc.readyState === 'open') { try { peer.dc.send(payload); } catch (e) {} }
  }
}

function netLeave() {
  if (NET.mode === 'host') {
    const bye = JSON.stringify({ k: 'bye' });
    for (const peer of NET.peers) {
      if (peer.dc && peer.dc.readyState === 'open') { try { peer.dc.send(bye); } catch (e) {} }
      try { peer.pc.close(); } catch (e) {}
    }
    NET.peers = [];
  } else if (NET.mode === 'guest') {
    netGuestTeardown();
    backToLobby();
  }
  netStopPolling();
  NET.mode = 'off';
  NET.room = '';
  NET.seats = [null, null, null, null];
  netRenderPanel();
}

/* ---------------- 联机面板 UI ---------------- */
/* 复制房间号（clipboard API 失败时退回 execCommand） */
function netCopyCode() {
  const code = NET.room.slice(3);
  const done = () => showToast('📋 房间号已复制：' + code);
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.cssText = 'position:fixed;top:-1000px;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch (e) { showToast('复制失败，请手动记下：' + code); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(done).catch(fallback);
  } else fallback();
}

function netRenderPanel() {
  const el = document.getElementById('netBody');
  if (!el) return;

  if (NET.mode === 'off') {
    el.innerHTML = `
      <div style="font-size:12.5px;color:#8fa89a;line-height:1.7;margin-bottom:10px">
        同一 Wi-Fi 下直连对战，最多 4 人（空位由 AI 补足）。<br>
        游戏数据走点对点直连，不经过服务器。
      </div>
      <div class="row r3" style="grid-template-columns:1fr 1fr;gap:8px">
        <button id="netCreateBtn">🏠 创建房间</button>
        <button id="netJoinBtn">🔗 加入房间</button>
      </div>
    `;
    document.getElementById('netCreateBtn').addEventListener('click', netHostCreate);
    document.getElementById('netJoinBtn').addEventListener('click', netRenderJoinForm);
    return;
  }

  if (NET.mode === 'host') {
    const n = netSeatCount();
    const peerRows = NET.peers.map(p => {
      let dot, txt;
      if (p.dcOpen && p.pc && p.pc.connectionState === 'connected') { dot = '#7fd4a8'; txt = '已连接'; }
      else if (p.dcOpen) { dot = '#f5d97a'; txt = '延迟中'; }
      else if (p.pc && p.pc.connectionState === 'failed') { dot = '#ff5c5c'; txt = '已断开'; }
      else { dot = '#ffa94d'; txt = '连接中'; }
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">
        <span style="width:8px;height:8px;border-radius:50%;background:${dot};box-shadow:0 0 8px ${dot};flex-shrink:0"></span>
        <span style="color:#d6e8de;flex:1">${p.name}</span>
        <span style="color:#8fa89a;font-size:11px">座位 ${p.seat + 1}</span>
        <span style="color:${dot};font-size:11px;font-weight:700">${txt}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:11px;color:#8fa89a;letter-spacing:2px">房间号</div>
        <div id="netRoomCode" style="font-size:34px;font-weight:900;letter-spacing:8px;color:#f5d97a;
                    text-shadow:0 0 20px rgba(245,217,122,.6);margin:4px 0">${NET.room.slice(3)}</div>
        <button id="netCopyBtn" style="width:auto;margin:0 auto;padding:7px 16px;font-size:12px;letter-spacing:1px">📋 复制房间号</button>
        <div style="font-size:11.5px;color:#8fa89a;margin-top:8px">让好友打开同一网址 → 加入房间 → 输入这个号码</div>
      </div>
      <div style="background:rgba(0,0,0,.25);border-radius:10px;padding:8px 12px;margin-bottom:10px">
        <div style="font-size:11.5px;color:#c9b06a;font-weight:800;margin-bottom:4px">👥 已就座 ${n} / 4</div>
        ${peerRows || '<div style="font-size:12px;color:#8fa89a;padding:4px 0">等待玩家加入…</div>'}
      </div>
      <div id="netStatus" style="font-size:11.5px;color:#8fa89a;margin-bottom:10px">${NET.status}</div>
      <div class="row r3" style="grid-template-columns:2fr 1fr;gap:8px">
        <button id="netStartBtn" style="border-color:rgba(127,212,168,.7);color:#7fd4a8">▶ 开始对局</button>
        <button id="netLeaveBtn">✕ 解散</button>
      </div>
    `;
    document.getElementById('netStartBtn').addEventListener('click', netHostStartMatch);
    document.getElementById('netLeaveBtn').addEventListener('click', netLeave);
    document.getElementById('netCopyBtn').addEventListener('click', netCopyCode);
    return;
  }

  // ---- 客人端 ----
  let dot = '#ffa94d', stateTxt = '连接中…';
  const pcs = NET.pc ? NET.pc.connectionState : 'new';
  if (pcs === 'connected') { dot = '#7fd4a8'; stateTxt = '已直连房主'; }
  else if (pcs === 'failed' || pcs === 'disconnected' || pcs === 'closed') { dot = '#ff5c5c'; stateTxt = '连接已断开'; }
  else if (NET.mySeat >= 0) { dot = '#f5d97a'; stateTxt = '等待房主开始…'; }

  el.innerHTML = `
    <div style="text-align:center;margin-bottom:12px">
      <div style="font-size:11px;color:#8fa89a;letter-spacing:2px">房间</div>
      <div style="font-size:26px;font-weight:900;letter-spacing:6px;color:#f5d97a;margin:4px 0">${NET.room.slice(3)}</div>
      <div style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:#d6e8de">
        <span style="width:8px;height:8px;border-radius:50%;background:${dot};box-shadow:0 0 8px ${dot}"></span>
        ${stateTxt}
      </div>
      ${NET.mySeat >= 0 ? `<div style="font-size:11.5px;color:#8fa89a;margin-top:6px">你的座位：${NET.mySeat + 1} 号</div>` : ''}
    </div>
    <div id="netStatus" style="font-size:11.5px;color:#8fa89a;margin-bottom:10px;text-align:center;min-height:18px">${NET.status}</div>
    <div class="row r3" style="grid-template-columns:1fr 1fr;gap:8px">
      <button id="netRetryBtn">↻ 重新加入</button>
      <button id="netLeaveBtn">✕ 断开</button>
    </div>
  `;
  document.getElementById('netLeaveBtn').addEventListener('click', netLeave);
  document.getElementById('netRetryBtn').addEventListener('click', () => {
    const code = NET.room.slice(3);
    netGuestTeardown();
    netGuestJoin(code);
  });
}

function netRenderJoinForm() {
  const el = document.getElementById('netBody');
  el.innerHTML = `
    <div style="font-size:12.5px;color:#8fa89a;margin-bottom:10px">输入房主的 5 位房间号：</div>
    <input id="netCodeInput" maxlength="5" placeholder="ABC12"
      style="width:100%;box-sizing:border-box;text-align:center;font-size:24px;font-weight:900;
             letter-spacing:8px;padding:12px;border-radius:12px;background:rgba(0,0,0,.35);
             border:2px solid rgba(212,175,55,.5);color:#f5d97a;font-family:inherit;
             text-transform:uppercase;outline:none;margin-bottom:10px">
    <div class="row r3" style="grid-template-columns:1fr 1fr;gap:8px">
      <button id="netJoinGo">连接</button>
      <button id="netJoinCancel">返回</button>
    </div>
  `;
  const inp = document.getElementById('netCodeInput');
  inp.focus();
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') netGuestJoin(inp.value.trim()); });
  document.getElementById('netJoinGo').addEventListener('click', () => {
    const v = inp.value.trim().toUpperCase();
    if (v.length !== 5) { showToast('请输入 5 位房间号'); return; }
    netGuestJoin(v);
  });
  document.getElementById('netJoinCancel').addEventListener('click', () => { NET.mode = 'off'; netRenderPanel(); });
}
