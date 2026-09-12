/* ============================================================
   大厅渲染
   ============================================================ */
function renderLobby() {
  // 段位
  const rank = getRankInfo();
  const rb = document.getElementById('rankBadge');
  rb.textContent = rank.icon + ' ' + rank.name;
  rb.className = 'rank-badge ' + rank.cls;

  // 等级经验
  const need = expNeeded(P.level);
  const pct = Math.min(100, (P.exp / need) * 100);
  document.getElementById('expFill').style.width = pct + '%';
  document.getElementById('lvText').textContent = P.level;
  document.getElementById('expText').textContent = `${P.exp} / ${need} EXP`;

  // 货币
  document.getElementById('coinText').textContent = P.coins;
  document.getElementById('gemText').textContent = P.gems;
  document.getElementById('streakText').textContent = P.streak;

  // 任务
  renderTasks();

  // 排行榜（本地模拟）
  renderLeaderboard();

  // 统计
  document.getElementById('statTotal').textContent = P.totalGames;
  document.getElementById('statWins').textContent = P.wins;
  document.getElementById('statLosses').textContent = P.losses;
  document.getElementById('statBestStreak').textContent = P.bestStreak;
  const se = document.getElementById('statEarn');       if (se) se.textContent = P.earnedCoins || 0;
  const ss = document.getElementById('statSpend');      if (ss) ss.textContent = P.spentCoins || 0;
  const seg = document.getElementById('statEarnGem');   if (seg) seg.textContent = P.earnedGems || 0;
  const ssg = document.getElementById('statSpendGem');  if (ssg) ssg.textContent = P.spentGems || 0;

  // 外观（头像框 / 棋子皮肤 / 称号）
  applyAppearance();

  // 商店
  renderShop();

  // 成就
  renderAchievements();

  // 联机面板
  if (typeof netRenderPanel === 'function') netRenderPanel();

  // 任务重置检查
  const today = todayStr();
  if (P.lastTaskDate !== today) {
    P.tasks = makeFreshTasks();
    P.lastTaskDate = today;
    P.lastDailyWin = '';
    saveProfile();
    renderTasks();
    renderLobby();
  }
}

function renderTasks() {
  const el = document.getElementById('taskList');
  el.innerHTML = '';
  P.tasks.forEach((t, i) => {
    const done = t.progress >= t.target;
    const claimed = t.claimed;
    const div = document.createElement('div');
    div.className = 'task' + (done ? ' done' : '') + (claimed ? ' claimed' : '');
    const rewardTxt = Object.entries(t.reward).map(([k, v]) => {
      const icon = k === 'coin' ? '💰' : k === 'gem' ? '💎' : '⭐';
      return icon + v;
    }).join(' ');

    div.innerHTML = `
      <div class="task-icon">${t.icon}</div>
      <div class="task-body">
        <div class="task-name">${t.name}</div>
        <div class="task-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, t.progress/t.target*100)}%"></div></div>
          <span>${t.progress}/${t.target}</span>
        </div>
      </div>
      <div class="task-reward">${rewardTxt}</div>
      <button class="task-claim" ${(!done || claimed) ? 'disabled' : ''} data-i="${i}">
        ${claimed ? '已领' : done ? '领取' : '进行中'}
      </button>
    `;
    el.appendChild(div);
  });

  el.querySelectorAll('.task-claim').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = +e.currentTarget.dataset.i;
      claimTask(i);
    });
  });

  const tip = document.getElementById('taskResetTip');
  if (tip) tip.textContent = '（连续登录 ' + (P.loginStreak || 0) + ' 天）';
}

function claimTask(i) {
  const t = P.tasks[i];
  if (!t || t.claimed || t.progress < t.target) return;
  t.claimed = true;
  let msg = '领取成功：';
  econEarn(t.reward.coin || 0, t.reward.gem || 0);
  if (t.reward.coin) msg += '💰+' + t.reward.coin + ' ';
  if (t.reward.gem) msg += '💎+' + t.reward.gem;
  saveProfile();
  renderLobby();
  showToast(msg);
}

function renderLeaderboard() {
  // 简单模拟排行榜，玩家排名根据等级+胜场计算
  const myScore = P.level * 100 + P.wins * 20 + P.bestStreak * 10;
  const aiNames = ['夜风','剑心','孤影','星痕','流云','无咎','踏雪','破晓','归尘','逐光'];
  const list = aiNames.map((name, i) => ({
    name,
    score: 500 + Math.floor((aiNames.length - i) * 180 + Math.random() * 400)
  }));
  list.push({ name: '你', score: myScore, you: true });
  list.sort((a, b) => b.score - a.score);

  const el = document.getElementById('leaderList');
  el.innerHTML = '';
  list.slice(0, 8).forEach((item, i) => {
    const d = document.createElement('div');
    d.className = 'leader-row' + (item.you ? ' you' : '');
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1);
    d.innerHTML = `
      <div class="leader-pos">${medal}</div>
      <div class="leader-name">${item.name}</div>
      <div class="leader-score">${item.score}</div>
    `;
    el.appendChild(d);
  });
}

/* ---------------- 商店（分 Tab） ---------------- */
let curShopTab = 'theme';

function shopPreviewHtml(key, item) {
  if (key === 'theme') {
    return `<div class="shop-icon" style="background:linear-gradient(135deg, ${item.colors.bg1}, ${item.colors.bg2})"></div>`;
  }
  if (key === 'frame') {
    return `<div class="shop-icon frame-demo frame-${item.id}"><span class="frame-demo-inner">🎴</span></div>`;
  }
  if (key === 'piece') {
    return `<div class="shop-icon piece-demo"><span class="piece p1 pskin-${item.id}"></span><span class="piece p0 pskin-${item.id}"></span></div>`;
  }
  if (key === 'title') {
    return `<div class="shop-icon title-demo"><span class="title-chip title-${item.id}">${item.id === 'none' ? '—' : item.name}</span></div>`;
  }
  return '<div class="shop-icon"></div>';
}

function renderShop() {
  const tabsEl = document.getElementById('shopTabs');
  const el = document.getElementById('shopGrid');
  if (!tabsEl || !el) return;

  const bal = document.getElementById('shopBalance');
  if (bal) bal.innerHTML = `<span style="color:#f5d97a">💰${P.coins}</span>　<span style="color:#b17aff">💎${P.gems}</span>`;

  // 分类标签
  tabsEl.innerHTML = '';
  SHOP_TABS.forEach(t => {
    const owned = P[t.ownedKey].length;
    const b = document.createElement('button');
    b.className = 'shop-tab' + (curShopTab === t.key ? ' active' : '');
    b.innerHTML = `${t.icon} ${t.name}<span class="shop-tab-count">${owned}/${t.list().length}</span>`;
    b.addEventListener('click', () => { curShopTab = t.key; renderShop(); });
    tabsEl.appendChild(b);
  });

  // 商品网格
  const tab = shopTab(curShopTab);
  el.innerHTML = '';
  tab.list().forEach(item => {
    const owned = shopOwned(curShopTab, item.id);
    const equipped = shopEquipped(curShopTab, item.id);
    const affordable = item.cur === 'gem' ? P.gems >= item.price : P.coins >= item.price;
    const d = document.createElement('div');
    d.className = 'shop-item' + (owned ? ' owned' : '') + (equipped ? ' equipped-now' : '');
    d.innerHTML = `
      ${shopPreviewHtml(curShopTab, item)}
      <div class="shop-name">${item.name}</div>
      <div class="shop-price" style="${!owned && !affordable ? 'color:#ff7b7b' : ''}">
        ${owned ? '✓ 已拥有' : shopCurrencyName(item.cur) + ' ' + item.price}
      </div>
      <button class="shop-btn ${equipped ? 'equipped' : ''}" ${equipped ? 'disabled' : ''}>
        ${equipped ? '使用中' : owned ? '装备' : '购买'}
      </button>
    `;
    d.querySelector('.shop-btn').addEventListener('click', () => {
      let r;
      if (owned) {
        r = equipItem(curShopTab, item.id);
      } else {
        r = buyItem(curShopTab, item.id);
      }
      showToast(r.msg);
      if (r.ok) {
        applyAppearance();
        if (curShopTab === 'theme') applyTheme(P.currentTheme);
        saveProfile();
        renderLobby();
      }
    });
    el.appendChild(d);
  });
}

/* 把已购外观应用到界面 */
function applyAppearance() {
  const av = document.getElementById('avatar');
  if (av) av.className = 'avatar frame-' + (P.currentFrame || 'none');

  ['dot', 'ring', 'star', 'diamond', 'rune'].forEach(k => document.body.classList.remove('pskin-' + k));
  document.body.classList.add('pskin-' + (P.currentPiece || 'dot'));

  const tc = document.getElementById('titleChip');
  if (tc) {
    const t = TITLES.find(x => x.id === P.currentTitle);
    if (!t || t.id === 'none') {
      tc.style.display = 'none';
    } else {
      tc.style.display = 'inline-block';
      tc.className = 'title-chip title-' + t.id;
      tc.textContent = t.name;
    }
  }
}

function applyTheme(id) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  document.body.style.background = `radial-gradient(ellipse at 50% -10%, ${t.colors.bg1} 0%, ${t.colors.bg2} 60%, #06110c 100%)`;
}

function renderAchievements() {
  const el = document.getElementById('achGrid');
  el.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const unlocked = !!P.achievements[a.id];
    const d = document.createElement('div');
    d.className = 'ach ' + (unlocked ? 'unlocked' : 'locked');
    d.dataset.name = a.name;
    d.title = a.desc + (unlocked ? '（已解锁）' : '（未解锁）');
    d.textContent = a.icon;
    // 点击显示详情弹窗
    d.style.cursor = 'pointer';
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      showAchievementPopup(a, unlocked);
    });
    el.appendChild(d);
  });
}

function showAchievementPopup(ach, unlocked) {
  const overlay = document.getElementById('overlay');
  const result = document.getElementById('result');
  overlay.classList.remove('hidden');
  result.innerHTML = `
    <h2>${ach.icon} ${ach.name}</h2>
    <div class="sub">${ach.desc}</div>
    <div class="reward-grid" style="justify-content:center">
      <div class="reward-item">
        <div class="reward-icon">${unlocked ? '✅' : '🔒'}</div>
        <div class="reward-val ${unlocked ? 'gain' : ''}">${unlocked ? '已解锁' : '未解锁'}</div>
        <div class="reward-label">状态</div>
      </div>
    </div>
    <div class="result-btn-row">
      <button class="result-btn" onclick="document.getElementById('overlay').classList.add('hidden')">关闭</button>
    </div>
  `;
}

function unlockAchievement(id) {
  if (P.achievements[id]) return;
  P.achievements[id] = true;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (a) {
    econEarn(60, 1);
    showToast(`🎖 成就解锁：${a.name}  💰+60 💎+1`);
  }
}

function checkAchievements() {
  if (P.wins >= 1) unlockAchievement('first_win');
  if (P.bestStreak >= 3) unlockAchievement('streak3');
  if (P.bestStreak >= 5) unlockAchievement('streak5');
  if (P.maxCombo >= 10) unlockAchievement('combo10');
  if (P.level >= 5) unlockAchievement('lv5');
  if (P.level >= 10) unlockAchievement('lv10');
  if (P.totalCoinsEarned >= 1000) unlockAchievement('rich');
  if (P.level >= 15) unlockAchievement('champ');
}

/* ============================================================
   提示气泡
   ============================================================ */
function showToast(msg, dur = 2200) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: fixed; top: 30px; left: 50%; transform: translateX(-50%);
    padding: 12px 24px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(245,217,122,.95), rgba(212,175,55,.9));
    color: #1a1a1a; font-weight: 800; font-size: 14px;
    box-shadow: 0 8px 30px rgba(245,217,122,.6);
    z-index: 9999; pointer-events: none;
    animation: toastIn .4s cubic-bezier(.2,1.6,.4,1), toastOut .4s ease-in ${dur-400}ms forwards;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), dur);

  if (!document.getElementById('_toastStyle')) {
    const s = document.createElement('style');
    s.id = '_toastStyle';
    s.textContent = `
      @keyframes toastIn { 0%{transform:translate(-50%,-30px) scale(.7);opacity:0;} 100%{transform:translate(-50%,0) scale(1);opacity:1;} }
      @keyframes toastOut { 0%{opacity:1;transform:translate(-50%,0);} 100%{opacity:0;transform:translate(-50%,-30px);} }
    `;
    document.head.appendChild(s);
  }
}
