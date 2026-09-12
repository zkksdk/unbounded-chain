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
