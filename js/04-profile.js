/* ============================================================
   玩家档案 & 持久化 & 经济系统
   ============================================================ */
const STORAGE_KEY = 'unbounded_chain_profile_v1';

/* ---------------- 经济配置 ---------------- */

/* 棋盘主题（金币） */
const THEMES = [
  { id: 'default', name: '经典绿', price: 0,    colors: { bg1:'#1e5c39', bg2:'#0b1f15' } },
  { id: 'flame',   name: '烈焰红', price: 200,  colors: { bg1:'#5c1e1e', bg2:'#1f0b0b' } },
  { id: 'royal',   name: '皇室紫', price: 350,  colors: { bg1:'#3d1e5c', bg2:'#130b1f' } },
  { id: 'ice',     name: '寒冰蓝', price: 500,  colors: { bg1:'#1e3a5c', bg2:'#0b1624' } }
];

/* 头像框 */
const FRAMES = [
  { id: 'none',   name: '无边框', cur: 'coin', price: 0 },
  { id: 'bronze', name: '青铜环', cur: 'coin', price: 150 },
  { id: 'silver', name: '白银环', cur: 'coin', price: 320 },
  { id: 'gold',   name: '黄金环', cur: 'coin', price: 680 },
  { id: 'flame',  name: '烈焰环', cur: 'gem',  price: 12 },
  { id: 'void',   name: '虚空环', cur: 'gem',  price: 35 }
];

/* 棋子皮肤 */
const PIECE_SKINS = [
  { id: 'dot',     name: '经典圆点', cur: 'coin', price: 0 },
  { id: 'ring',    name: '光环',     cur: 'coin', price: 260 },
  { id: 'star',    name: '星芒',     cur: 'coin', price: 560 },
  { id: 'diamond', name: '棱晶',     cur: 'gem',  price: 18 },
  { id: 'rune',    name: '符文',     cur: 'gem',  price: 42 }
];

/* 称号（钻石专属，给钻石一个去处） */
const TITLES = [
  { id: 'none',    name: '无称号',   cur: 'coin', price: 0 },
  { id: 'newbie',  name: '初出茅庐', cur: 'coin', price: 120 },
  { id: 'combo',   name: '连锁大师', cur: 'gem',  price: 8 },
  { id: 'streak',  name: '连胜王者', cur: 'gem',  price: 15 },
  { id: 'tycoon',  name: '富甲一方', cur: 'gem',  price: 25 },
  { id: 'legend',  name: '传说牌手', cur: 'gem',  price: 55 }
];

/* 连续登录奖励（7 天一循环，金币） */
const LOGIN_REWARDS = [30, 45, 60, 80, 100, 130, 220];

/* 升级奖励 */
function levelReward(lv) {
  return { coin: 40 + lv * 25, gem: lv % 5 === 0 ? 4 : 1 };
}

/* 商店分区 */
const SHOP_TABS = [
  { key: 'theme',  icon: '🎨', name: '主题',   list: () => THEMES,       ownedKey: 'themes',  curKey: 'currentTheme' },
  { key: 'frame',  icon: '🖼', name: '头像框', list: () => FRAMES,       ownedKey: 'frames',  curKey: 'currentFrame' },
  { key: 'piece',  icon: '⚫', name: '棋子',   list: () => PIECE_SKINS,  ownedKey: 'pieces',  curKey: 'currentPiece' },
  { key: 'title',  icon: '🏷', name: '称号',   list: () => TITLES,       ownedKey: 'titles',  curKey: 'currentTitle' }
];

const ACHIEVEMENTS = [
  { id: 'first_win',  icon: '🎯', name: '首胜',     desc: '赢得第一局' },
  { id: 'streak3',    icon: '🔥', name: '三连胜',   desc: '连胜 3 局' },
  { id: 'streak5',    icon: '💥', name: '五连胜',   desc: '连胜 5 局' },
  { id: 'combo10',    icon: '⛓', name: '连锁大师', desc: '单局达成 10 次连锁' },
  { id: 'lv5',        icon: '⭐', name: '崭露头角', desc: '达到 5 级' },
  { id: 'lv10',       icon: '🌟', name: '声名鹊起', desc: '达到 10 级' },
  { id: 'rich',       icon: '💎', name: '小富即安', desc: '累计获得 1000 金币' },
  { id: 'champ',      icon: '👑', name: '王者之风', desc: '达到大师段位' }
];

const TASK_POOL = [
  { id: 'play3',   icon: '🎮', name: '进行 3 局对局',     target: 3, reward: { coin: 30 },          progress: 0 },
  { id: 'win1',    icon: '🏆', name: '赢得 1 局对局',     target: 1, reward: { coin: 40, gem: 1 },  progress: 0 },
  { id: 'combo5',  icon: '⛓', name: '单局达成 5 次连锁',  target: 5, reward: { coin: 50 },          progress: 0 },
  { id: 'top2',    icon: '🥈', name: '获得前 2 名 1 次',  target: 1, reward: { coin: 35 },          progress: 0 }
];

/* ---------------- 存档 ---------------- */
function defaultProfile() {
  return {
    level: 1,
    exp: 0,
    coins: 200,
    gems: 5,
    wins: 0,
    losses: 0,
    totalGames: 0,
    streak: 0,
    bestStreak: 0,
    totalCoinsEarned: 0,
    maxCombo: 0,

    // 外观
    themes: ['default'],
    currentTheme: 'default',
    frames: ['none'],
    currentFrame: 'none',
    pieces: ['dot'],
    currentPiece: 'dot',
    titles: ['none'],
    currentTitle: 'none',

    // 经济统计
    earnedCoins: 0,
    earnedGems: 0,
    spentCoins: 0,
    spentGems: 0,

    // 登录
    lastLogin: '',
    loginStreak: 0,
    loginClaimed: false,

    achievements: {},
    tasks: makeFreshTasks(),
    lastTaskDate: todayStr(),
    lastDailyWin: ''
  };
}

function loadProfile() {
  let p = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) p = JSON.parse(raw);
  } catch (e) {}
  if (!p) return defaultProfile();

  // 兼容旧存档：逐项补全缺失字段
  const d = defaultProfile();
  for (const k in d) {
    if (p[k] === undefined || p[k] === null) p[k] = d[k];
  }
  if (!p.tasks || !p.tasks.length) p.tasks = makeFreshTasks();
  if (!Array.isArray(p.themes) || !p.themes.length) p.themes = ['default'];
  if (!Array.isArray(p.frames) || !p.frames.length) p.frames = ['none'];
  if (!Array.isArray(p.pieces) || !p.pieces.length) p.pieces = ['dot'];
  if (!Array.isArray(p.titles) || !p.titles.length) p.titles = ['none'];
  return p;
}

function saveProfile() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(P)); } catch (e) {}
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function makeFreshTasks() {
  const pool = TASK_POOL.map(t => Object.assign({}, t, { progress: 0, claimed: false }));
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled;
}

let P = loadProfile();

/* ---------------- 段位 & 等级 ---------------- */
function getRankInfo() {
  const lv = P.level;
  if (lv >= 20) return { name: '王者', cls: 'gold', icon: '👑' };
  if (lv >= 15) return { name: '大师', cls: 'gold', icon: '💎' };
  if (lv >= 10) return { name: '钻石', cls: 'silver', icon: '💠' };
  if (lv >= 6)  return { name: '黄金', cls: 'gold', icon: '🥇' };
  if (lv >= 3)  return { name: '白银', cls: 'silver', icon: '🥈' };
  return { name: '青铜', cls: 'bronze', icon: '🥉' };
}

function expNeeded(lv) { return 100 + (lv - 1) * 50; }

/* 升级时发奖，暂存起来给结算面板展示 */
let pendingLevelRewards = [];
function addExp(amount) {
  P.exp += amount;
  let leveled = 0;
  while (P.exp >= expNeeded(P.level)) {
    P.exp -= expNeeded(P.level);
    P.level++;
    leveled++;
    const rw = levelReward(P.level);
    P.coins += rw.coin;
    P.gems += rw.gem;
    P.earnedCoins += rw.coin;
    P.earnedGems += rw.gem;
    pendingLevelRewards.push({ level: P.level, coin: rw.coin, gem: rw.gem });
  }
  if (leveled > 0) {
    checkAchievements();
    saveProfile();
  }
  return leveled;
}

/* ---------------- 经济核心 ---------------- */
function econEarn(coin, gem) {
  coin = coin || 0; gem = gem || 0;
  P.coins += coin;
  P.gems += gem;
  if (coin > 0) { P.earnedCoins += coin; P.totalCoinsEarned += coin; }
  if (gem > 0) P.earnedGems += gem;
}
function econSpend(coin, gem) {
  coin = coin || 0; gem = gem || 0;
  P.coins -= coin;
  P.gems -= gem;
  if (coin > 0) P.spentCoins += coin;
  if (gem > 0) P.spentGems += gem;
}

/* 商店分区的存取助手 */
function shopTab(key) { return SHOP_TABS.find(t => t.key === key) || SHOP_TABS[0]; }
function shopItem(key, id) { return shopTab(key).list().find(i => i.id === id); }
function shopOwned(key, id) { return P[shopTab(key).ownedKey].indexOf(id) >= 0; }
function shopEquipped(key, id) { return P[shopTab(key).curKey] === id; }
function shopCurrencyName(cur) { return cur === 'gem' ? '💎' : '💰'; }

/* 购买；返回 { ok, msg } */
function buyItem(key, id) {
  const tab = shopTab(key);
  const item = shopItem(key, id);
  if (!item) return { ok: false, msg: '商品不存在' };
  if (shopOwned(key, id)) return { ok: false, msg: '已经拥有' };

  const isGem = item.cur === 'gem';
  const have = isGem ? P.gems : P.coins;
  if (have < item.price) {
    return { ok: false, msg: (isGem ? '💎 钻石' : '💰 金币') + '不足，还差 ' + (item.price - have) };
  }
  econSpend(isGem ? 0 : item.price, isGem ? item.price : 0);
  P[tab.ownedKey].push(id);
  P[tab.curKey] = id;          // 买完自动装备
  saveProfile();
  return { ok: true, msg: '✅ 已购买并装备：' + item.name };
}

function equipItem(key, id) {
  const tab = shopTab(key);
  if (!shopOwned(key, id)) return { ok: false, msg: '尚未拥有' };
  P[tab.curKey] = id;
  saveProfile();
  return { ok: true, msg: '已装备：' + shopItem(key, id).name };
}

/* ---------------- 连续登录 ---------------- */
function checkDailyLogin() {
  const today = todayStr();
  if (P.lastLogin === today) { P.loginClaimed = true; return null; }

  // 判断是否断签：昨天登录过则继续，否则重置
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yStr = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();

  if (P.lastLogin === yStr) P.loginStreak = (P.loginStreak || 0) + 1;
  else P.loginStreak = 1;
  if (P.loginStreak > 7) P.loginStreak = 1;   // 7 天一循环

  P.lastLogin = today;
  P.loginClaimed = true;

  const coin = LOGIN_REWARDS[P.loginStreak - 1];
  econEarn(coin, 0);
  saveProfile();
  return { day: P.loginStreak, coin: coin };
}
