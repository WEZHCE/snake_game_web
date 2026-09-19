/* ============================================================
   贪吃蛇 v8.0 Web —— 单人游戏核心逻辑
   1:1 移植自原版 SnakeGame 类，并实现原版未完成的每日挑战玩法
   ============================================================ */
import {
  GRID_SIZE, SCORE_SCALE, TIMED_LIMIT,
  SPEED_PRESETS, SKINS, DAILY_MODIFIERS,
} from "./data.js";
import { S, EDGE_DEATH, EDGE_WRAP, awardXp, activeSkinId } from "./state.js";

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x, y) => `${x},${y}`;

export function randomInt(n) { return Math.floor(Math.random() * n); }

/* 今天的日期串 YYYYMMDD（每日挑战种子） */
export function dailyDateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/* 由日期生成当日挑战（确定性随机，所有玩家同一天规则相同） */
export function generateDailyChallenge(dateStr) {
  const seed = Number(dateStr);
  const modifierId = seed % 8;
  /* 简单的可复现随机数（mulberry32） */
  let a = seed >>> 0;
  const rng = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const skinLockId = modifierId === 5 ? Math.floor(rng() * SKINS.length) : null;
  const mazeWalls = new Set();
  if (modifierId === 2) {
    for (let i = 0; i < 8; i++) {
      const wx = 2 + Math.floor(rng() * (GRID_SIZE - 4));
      const wy = 2 + Math.floor(rng() * (GRID_SIZE - 4));
      mazeWalls.add(key(wx, wy));
    }
  }
  return { date: dateStr, modifier_id: modifierId, skin_lock_id: skinLockId, maze_walls: mazeWalls };
}

/* 每日挑战 XP：基础参与 20 + 得分÷100 + 高倍率加成 */
export function calcDailyXp(score, modifierId) {
  const baseXp = Math.floor(score / SCORE_SCALE / 10);
  const mult = DAILY_MODIFIERS[modifierId].score_mult;
  const bonusXp = Math.floor(baseXp * (mult - 1.0) * 0.5);
  return baseXp + bonusXp + 20;
}

export class SnakeGame {
  /**
   * @param opts {modifier: null | DAILY_MODIFIERS[i], forcedSkinId: null|number}
   */
  constructor(opts = {}) {
    this.modifier = opts.modifier || null;
    this.forcedSkinId = opts.forcedSkinId ?? null;
    this.mazeWallsOpt = opts.mazeWalls ?? null;
    this.isDaily = !!this.modifier;
    this.floatTexts = [];
    this.reset();
  }

  reset() {
    const cx = Math.floor(GRID_SIZE / 2), cy = Math.floor(GRID_SIZE / 2);
    this.snake = [[cx, cy], [cx - 1, cy], [cx - 2, cy]];
    this.direction = [1, 0];
    this.nextDirection = [1, 0];
    this.inputQueue = [];
    this.score = 0;
    this.foodEaten = 0;
    this.gameOver = false;
    this.multiplier = 1;
    this.mode = this.isDaily ? "timed" : S.gameMode;
    this.timeLeft = this.isDaily ? this.modifier.timed_limit : TIMED_LIMIT;
    this.wallSlideCount = 0;
    this.cornersVisited = new Set();
    this.extraLifeUsed = false;
    this.secondFood = null;
    this.moveCount = 0;

    /* 每日规则（迷宫墙体由外部按日期生成后传入） */
    this.mazeWalls = (this.isDaily && this.mazeWallsOpt) ? this.mazeWallsOpt : new Set();
    this.foods = [];          // 四倍食物规则使用
    this.food = this._spawnFood();

    /* 修复：原版食物生成后可能落进迷宫墙的相邻点无所谓，但主食物不能在墙上 */
    if (this.food && this.mazeWalls.has(key(this.food[0], this.food[1]))) {
      this.food = this._spawnFood();
    }
    if (this.isDaily && this.modifier.id === 4) {
      while (this.foods.length < 4) this._spawnQuadFood();
    }
    this.teleportCooldown = 0;
  }

  /* 当前生效的皮肤（每日皮肤锁定时使用指定皮肤） */
  skin() { return SKINS[activeSkinId(this.forcedSkinId)]; }

  fxOn() { return S.effectsEnabled; }

  wrap(pos) {
    let [x, y] = pos;
    if (x < 0) x = GRID_SIZE - 1; else if (x >= GRID_SIZE) x = 0;
    if (y < 0) y = GRID_SIZE - 1; else if (y >= GRID_SIZE) y = 0;
    return [x, y];
  }

  isOutOfBounds(p) {
    return p[0] < 0 || p[0] >= GRID_SIZE || p[1] < 0 || p[1] >= GRID_SIZE;
  }

  _occupied(extra = new Set()) {
    const occ = new Set(this.snake.map(([x, y]) => key(x, y)));
    for (const w of this.mazeWalls) occ.add(w);
    for (const k of extra) occ.add(k);
    if (this.secondFood) occ.add(key(this.secondFood[0], this.secondFood[1]));
    for (const f of this.foods) occ.add(key(f[0], f[1]));
    return occ;
  }

  _spawnFood(exclude = null) {
    const occ = this._occupied();
    if (exclude) occ.add(key(exclude[0], exclude[1]));
    /* 先随机尝试，再全盘扫描（满盘保护，原版 v7.8 修复保留） */
    for (let i = 0; i < 100; i++) {
      const p = [randomInt(GRID_SIZE), randomInt(GRID_SIZE)];
      if (!occ.has(key(p[0], p[1]))) return p;
    }
    for (let x = 0; x < GRID_SIZE; x++)
      for (let y = 0; y < GRID_SIZE; y++)
        if (!occ.has(key(x, y))) return [x, y];
    return null; // 真满盘
  }

  _spawnQuadFood() {
    const p = this._spawnFood();
    if (p) this.foods.push(p);
  }

  /* 当前所有食物坐标 */
  allFoods() {
    if (this.isDaily && this.modifier.id === 4) return this.foods;
    const list = [];
    if (this.food) list.push(this.food);
    if (this.secondFood) list.push(this.secondFood);
    return list;
  }

  /* ---------- 方向输入 ---------- */
  changeDirection(nd) {
    const skin = this.skin();
    if (this.fxOn() && skin.special.type === "reverse_controls") nd = [-nd[0], -nd[1]];
    const [dx, dy] = nd;
    if (this.snake.length > 1) {
      const h = this.snake[0];
      if (h[0] + dx === this.snake[1][0] && h[1] + dy === this.snake[1][1]) return;
    }
    const last = this.inputQueue[this.inputQueue.length - 1];
    if (!last || last[0] !== dx || last[1] !== dy) {
      if (this.inputQueue.length < 4) this.inputQueue.push(nd);
    }
  }

  /* 双头蛇：反转蛇身（原版未实现，v8.0 补全） */
  reverseSnake() {
    if (this.snake.length <= 1) return;
    this.snake.reverse();
    if (this.snake.length >= 2) {
      const [h, h2] = this.snake;
      this.direction = [h[0] - h2[0], h[1] - h2[1]];
      this.nextDirection = this.direction;
      this.inputQueue.length = 0;
    }
  }

  /* DeepSeek-Flash：随机位置全新复活 */
  reviveSnake() {
    if (this.extraLifeUsed) return false;
    let rx = 2 + randomInt(GRID_SIZE - 4), ry = 2 + randomInt(GRID_SIZE - 4);
    const occ = new Set(this.snake.map(([x, y]) => key(x, y)));
    let attempts = 0;
    while (occ.has(key(rx, ry)) && attempts < 50) {
      rx = 2 + randomInt(GRID_SIZE - 4); ry = 2 + randomInt(GRID_SIZE - 4);
      attempts++;
    }
    const d = DIRS[randomInt(4)];
    this.snake = [[rx, ry], [rx - d[0], ry - d[1]], [rx - 2 * d[0], ry - 2 * d[1]]];
    this.direction = d;
    this.nextDirection = d;
    this.inputQueue.length = 0;
    this.gameOver = false;
    this.extraLifeUsed = true;
    this.score = Math.floor(this.score * 0.7);
    return true;
  }

  /* 滑动模式：撞墙时沿墙滑行，优先级 输入方向 > 垂直 > 反向 > 静止 */
  _getSlideDirection(head, currentDir, inputDir) {
    const [hx, hy] = head;
    const blocked = (p) =>
      this.isOutOfBounds(p) ||
      this.snake.slice(1).some(([sx, sy]) => sx === p[0] && sy === p[1]) ||
      this.mazeWalls.has(key(p[0], p[1]));
    if (inputDir && !blocked([hx + inputDir[0], hy + inputDir[1]])) return [inputDir, [hx + inputDir[0], hy + inputDir[1]]];
    const [dx, dy] = currentDir;
    const perpDirs = [[dy, dx], [-dy, -dx]];
    if (inputDir) {
      const idx = perpDirs.findIndex((d) => d[0] === inputDir[0] && d[1] === inputDir[1]);
      if (idx > 0) { perpDirs.splice(idx, 1); perpDirs.unshift(inputDir); }
    }
    for (const [pdx, pdy] of perpDirs) {
      if (!blocked([hx + pdx, hy + pdy])) return [[pdx, pdy], [hx + pdx, hy + pdy]];
    }
    const [rdx, rdy] = [-dx, -dy];
    if (!blocked([hx + rdx, hy + rdy])) return [[rdx, rdy], [hx + rdx, hy + rdy]];
    return [null, null];
  }

  _tryRevive() {
    return !!(this.fxOn() && this.skin().special.type === "extra_life" &&
              !this.extraLifeUsed && this.reviveSnake());
  }

  _addFloatText(cell, textKey, color) {
    this.floatTexts.push({ cell, textKey, color, born: performance.now(), life: 950 });
    if (this.floatTexts.length > 8) this.floatTexts.shift();
  }

  _wrapRandomTeleport() {
    const occ = this._occupied(new Set(this.snake.slice(1).map(([x, y]) => key(x, y))));
    const free = [];
    for (let x = 0; x < GRID_SIZE; x++)
      for (let y = 0; y < GRID_SIZE; y++)
        if (!occ.has(key(x, y))) free.push([x, y]);
    if (!free.length) return false;
    const [nx, ny] = free[randomInt(free.length)];
    /* 从空闲格中挑一个安全的行进方向 */
    let dir = this.direction;
    for (const d of DIRS) {
      const px = nx + d[0], py = ny + d[1];
      if (px >= 0 && px < GRID_SIZE && py >= 0 && py < GRID_SIZE &&
          !this.mazeWalls.has(key(px, py)) &&
          !this.snake.some(([sx, sy]) => sx === px && sy === py)) { dir = d; break; }
    }
    this.snake.unshift([nx, ny]);
    this.direction = dir;
    this.nextDirection = dir;
    this.inputQueue.length = 0;
    const ate = this._eatCheck();
    if (!ate) this.snake.pop();
    return true;
  }

  /* 头部进入 nh 后的进食判定与计分（吃发生在 snake 已 unshift 之后） */
  _eatCheck() {
    const head = this.snake[0];
    const [hx, hy] = head;
    let ate = false, ateMain = false;
    const quad = this.isDaily && this.modifier.id === 4;

    if (quad) {
      const idx = this.foods.findIndex(([fx, fy]) => fx === hx && fy === hy);
      if (idx >= 0) {
        ate = true;
        this.foods.splice(idx, 1);
      }
    } else {
      if (this.food && this.food[0] === hx && this.food[1] === hy) { ate = true; ateMain = true; }
      else if (this.secondFood && this.secondFood[0] === hx && this.secondFood[1] === hy) {
        ate = true; this.secondFood = null;
      }
    }

    /* 重力蛇吸附（特效开启时） */
    if (!ate && this.fxOn() && this.skin().special.type === "food_attract") {
      const ar = this.skin().special.params;
      const foods = this.allFoods();
      for (let i = 0; i < foods.length; i++) {
        const [fx, fy] = foods[i];
        if (Math.abs(fx - hx) <= ar && Math.abs(fy - hy) <= ar) {
          ate = true;
          if (quad) this.foods.splice(i, 1);
          else if (this.food && fx === this.food[0] && fy === this.food[1]) ateMain = true;
          else this.secondFood = null;
          break;
        }
      }
    }

    if (!ate) return false;

    this.foodEaten += 1;
    awardXp(5);
    this.multiplier = 2 ** Math.floor(this.foodEaten / 10);

    let bm = 1.0;
    if (!this.isDaily) bm = SPEED_PRESETS[S.speedIndex].base_mult;
    let sm = 1.0;
    if (this.fxOn() && this.skin().special.type === "score_multiply") sm = this.skin().special.params;
    let cm = 1.0;
    if (this.fxOn() && this.skin().special.type === "reverse_controls") cm = this.skin().special.params;
    const modMult = this.isDaily ? this.modifier.score_mult : 1.0;

    let add = Math.max(SCORE_SCALE, Math.floor(this.multiplier * bm * sm * cm * modMult * SCORE_SCALE));

    /* 每日规则：暴击机制（20% x5 / 10% 落空） */
    if (this.isDaily && this.modifier.id === 7) {
      const roll = Math.random();
      if (roll < 0.2) { add *= 5; this._addFloatText(head, "crit_hit", "GOLD"); }
      else if (roll < 0.3) { add = 0; this._addFloatText(head, "crit_miss", "TEXT_DIM"); }
    }

    this.score += add;

    if (quad) { while (this.foods.length < 4) this._spawnQuadFood(); }
    else {
      if (ateMain) this.food = this._spawnFood();
      if (this.fxOn() && this.skin().special.type === "double_food" && !this.secondFood) {
        this.secondFood = this._spawnFood();
      }
    }
    if (this.fxOn() && this.skin().special.type === "time_add" && this.mode === "timed") {
      const [lo, hi] = this.skin().special.params;
      this.timeLeft += lo + randomInt(hi - lo + 1);
    }
    return true;
  }

  /**
   * 每逻辑步推进一次。返回 true 表示游戏结束。
   * dtSec 为实际经过秒数（用于倒计时）。
   */
  update(dtSec) {
    if (this.gameOver) return true;
    if (this.teleportCooldown > 0) this.teleportCooldown--;

    if (this.mode === "timed") {
      this.timeLeft -= dtSec;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.gameOver = true; return true; }
    }

    /* 取输入方向；修复：出队时再次校验防 180 度掉头（原版队列可致自撞） */
    let inputDir = null;
    while (this.inputQueue.length) {
      const cand = this.inputQueue.shift();
      const h = this.snake[0];
      if (this.snake.length > 1 &&
          h[0] + cand[0] === this.snake[1][0] && h[1] + cand[1] === this.snake[1][1]) continue;
      inputDir = cand;
      this.nextDirection = inputDir;
      break;
    }
    this.direction = this.nextDirection;

    const [hx, hy] = this.snake[0];
    const [dx, dy] = this.direction;
    let nh = [hx + dx, hy + dy];
    let wrapped = false, sliding = false;

    /* ---- 边界检测 ---- */
    if (this.isOutOfBounds(nh)) {
      /* 每日规则：随机传送（撞墙后随机出现） */
      if (this.isDaily && this.modifier.id === 6) {
        if (this._wrapRandomTeleport()) { this.moveCount++; return false; }
        this.gameOver = true; return true;
      }
      /* 每日挑战采用经典撞墙死亡（配 DeepSeek-Flash 可复活一次） */
      if (this.isDaily || S.edgeMode === EDGE_DEATH) {
        if (this._tryRevive()) return false;
        this.gameOver = true; return true;
      }
      if (S.edgeMode === EDGE_WRAP) {
        nh = this.wrap(nh); wrapped = true;
      } else { // EDGE_SLIDE
        const [slideDir, slidePos] = this._getSlideDirection([hx, hy], this.direction, inputDir);
        if (slidePos) {
          this.direction = slideDir; this.nextDirection = slideDir;
          nh = slidePos; sliding = true;
          this.wallSlideCount++;
        } else {
          return false; // 完全被挡，静止一帧
        }
      }
    }

    /* ---- 迷宫墙碰撞（每日规则） ---- */
    if (this.mazeWalls.has(key(nh[0], nh[1]))) {
      this.gameOver = true; return true;
    }

    /* ---- 自身碰撞（穿墙时排除头部前一格的特殊情况） ---- */
    if (!wrapped && !sliding) {
      if (this.snake.some(([sx, sy]) => sx === nh[0] && sy === nh[1])) {
        if (this._tryRevive()) return false;
        this.gameOver = true; return true;
      }
    } else if (wrapped) {
      if (this.snake.slice(1).some(([sx, sy]) => sx === nh[0] && sy === nh[1])) {
        if (this._tryRevive()) return false;
        this.gameOver = true; return true;
      }
    }

    /* ---- 移动 ---- */
    this.snake.unshift(nh);
    const [nx, ny] = nh;
    if ((nx === 0 && ny === 0) || (nx === 0 && ny === GRID_SIZE - 1) ||
        (nx === GRID_SIZE - 1 && ny === 0) || (nx === GRID_SIZE - 1 && ny === GRID_SIZE - 1)) {
      this.cornersVisited.add(key(nx, ny));
    }

    this.moveCount++;
    /* 每日规则：瘦身蛇（每10次移动缩短1节） */
    if (this.isDaily && this.modifier.id === 1 && this.moveCount % 10 === 0 && this.snake.length > 3) {
      this.snake.pop();
    }

    const ate = this._eatCheck();
    if (!ate) this.snake.pop();
    return false;
  }

  /* ---------- 皮肤颜色（彩虹 / 渐变身体） ---------- */
  getSkinColor(si, tn, ms) {
    const skin = this.skin();
    if (skin.rainbow) {
      const h = (ms / 2000 + si / tn) % 1.0;
      const [r, g, b] = hsvToRgb(h, 0.5, 0.85);
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    if (si === 0) return skin.head_color;
    const t = si / Math.max(tn, 1);
    return skin.body_color.map((c) => Math.min(255, Math.floor(c * (1 - t * 0.3))));
  }
}

/* HSV → RGB（彩虹皮肤用） */
export function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
