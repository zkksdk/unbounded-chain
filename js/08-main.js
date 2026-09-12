/* ---------------- 视图切换 ---------------- */
function startMatch() {
  const netMode = (typeof NET !== 'undefined') ? NET.mode : 'off';
  if (netMode === 'guest') {
    // 客人端不跑本地逻辑，等房主同步
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');
    applyTheme(P.currentTheme);
    return;
  }
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  applyTheme(P.currentTheme);
  newGame();
}

function backToLobby() {
  stopTimer();
  clearTimeout(autoEndTimer);
  document.getElementById('game').classList.add('hidden');
  document.getElementById('lobby').classList.remove('hidden');
  document.getElementById('overlay').classList.add('hidden');
  applyTheme(P.currentTheme);
  renderLobby();
  if (typeof netRenderPanel === 'function') netRenderPanel();
}

/* ---------------- 事件绑定 ---------------- */
document.getElementById('startBtn').addEventListener('click', () => {
  const netMode = (typeof NET !== 'undefined') ? NET.mode : 'off';
  if (netMode === 'guest') { showToast('请等待房主开始对局'); return; }
  if (netMode === 'host') { netHostStartMatch(); return; }
  startMatch();
});
document.getElementById('btnBackLobby').addEventListener('click', () => {
  if (G && !G.over && confirm('返回大厅将放弃当前对局，确定吗？')) backToLobby();
  else if (G && G.over) backToLobby();
});
document.getElementById('logHeader').addEventListener('click', () => {
  document.getElementById('logPanel').classList.toggle('collapsed');
});
document.getElementById('btnHint').addEventListener('click', giveHint);
document.getElementById('btnPass').addEventListener('click', doPass);
document.getElementById('btnNew').addEventListener('click', () => {
  if (confirm('确定重新开始本局？')) newGame();
});

document.addEventListener('keydown', e => {
  if (!G) return;
  if (e.key === 'Escape') {
    G.selectedHand = -1;
    G.selectedPiece = -1;
    G.suggestCell = -1;
    G.suggestHand = -1;
    render();
  }
  if (e.key === 'h' || e.key === 'H') giveHint();
  if (e.key === 'p' || e.key === 'P') doPass();
  if (e.key === ' ' && !G.over && G.started && G.turn === HUMAN && !locked) {
    e.preventDefault();
    doPass();
  }
});

/* ---------------- 启动 ---------------- */

/* 控制台署名 */
(function signature() {
  const ts = 'font-size:13px;font-weight:700;line-height:1.7;';
  const gold = 'font-size:22px;font-weight:900;color:#f5d97a;text-shadow:0 0 12px rgba(245,217,122,.6);';
  console.log('%c无界连锁 · Unbounded Chain', gold);
  console.log('%cCopyright (c) 2026 zkksdk · All rights reserved.', ts + 'color:#7fd4a8');
  console.log('%c原始仓库  https://github.com/zkksdk/unbounded-chain', ts + 'color:#8fa89a');
  console.log('%c在线试玩  https://zkksdk.github.io/unbounded-chain/', ts + 'color:#8fa89a');
  console.warn('⚠ 本项目由 zkksdk 开发。如果你是"从别处"拿到这份代码的，它多半是被搬运的。\n' +
               '  商用 / 二次发布请联系作者授权。');
  window.__UC_ORIGIN = 'zkksdk/unbounded-chain@2026';
  document.documentElement.setAttribute('data-origin', 'zkksdk/unbounded-chain/2026');
})();

applyTheme(P.currentTheme);
renderLobby();
startStardust();

/* 每日登录奖励 */
(function dailyLogin() {
  const r = checkDailyLogin();
  if (!r) return;
  renderLobby();
  setTimeout(() => {
    showToast(`📅 连续登录第 ${r.day} 天　💰+${r.coin}`, 3200);
  }, 700);
})();

/*​‌‌‌‌​‌​​‌‌​‌​‌‌​‌‌​‌​‌‌​‌‌‌​​‌‌​‌‌​​‌​​​‌‌​‌​‌‌*/
