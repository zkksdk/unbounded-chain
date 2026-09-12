/* ============================================================
   无界连锁 · Unbounded Chain
   大厅 + 奖励系统版
   ============================================================ */

/* ============================================================
   游戏核心
   ============================================================ */
const SIZE = 7;
const CELLS = SIZE * SIZE;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED_SUITS = [1, 2];
const TARGET_SCORE = Infinity;   // 分数不封顶：不再因为达标而结束对局
const MAX_BONUS_AP = 10;
const CARRY_MAX = 5;             // 回合结束最多保留多少 AP 到下回合
const TURN_TIME = 30;

const PLAYER_NAMES = ['蓝方', '红方', '橙方', '紫方'];   // 本地玩家会被改成「你」
const PLAYER_CLASSES = ['p0', 'p1', 'p2', 'p3'];
const PLAYER_COLORS = ['#4a9eff', '#ff5c5c', '#ffa94d', '#b17aff'];
const NUM_PLAYERS = 4;
let HUMAN = 0;   // 本地玩家座位（联机时会被改成自己的座位）

let G = null;
let locked = true;
let timerInterval = null;
let timeLeft = TURN_TIME;
let autoEndTimer = null;
let logCount = 0;
let comboChainCount = 0;
let sessionStats = { maxCombo: 0, plays: 0 };

/* ---------------- 工具 ---------------- */
function makeDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let v = 1; v <= 13; v++) d.push({ s, v });
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const isRed = c => RED_SUITS.includes(c.s);
const cardText = c => RANKS[c.v] + SUITS[c.s];
const idxOf = (r, c) => r * SIZE + c;
const rowOf = i => Math.floor(i / SIZE);
const colOf = i => i % SIZE;
function adjacent(a, b) {
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  return (dr <= 1 && dc <= 1) && (dr + dc > 0);
}
function centerValue(i) {
  const c = (SIZE - 1) / 2;
  return (SIZE - 1) - (Math.abs(rowOf(i) - c) + Math.abs(colOf(i) - c));
}

