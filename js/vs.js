/* ============================================================
   贪吃蛇 v8.0 Web —— 人机对战（BFS AI，三级难度）
   1:1 移植自原版 VSGame / AISnake / ai_get_direction
   ============================================================ */
import { GRID_SIZE } from "./data.js";
import { S, EDGE_DEATH, EDGE_WRAP } from "./state.js";

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const k = (x, y) => `${x},${y}`;

/* ---------- BFS 寻路：返回第一步方向 ---------- */
export function bfsFindPath(start, target, obstacles) {
  const samePos = start[0] === target[0] && start[1] === target[1];
  if (samePos || !target) return null;
  const queue = [[start, []]];
  const visited = new Set([k(start[0], start[1])]);
  const obs = new Set(obstacles);
  while (queue.length) {
    const [current, path] = queue.shift();
    if (current[0] === target[0] && current[1] === target[1]) {
      if (path.length) return [path[0][0] - start[0], path[0][1] - start[1]];
      return null;
    }
    for (const [dx, dy] of DIRS) {
      const nx = current[0] + dx, ny = current[1] + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE &&
          !obs.has(k(nx, ny)) && !visited.has(k(nx, ny))) {
        visited.add(k(nx, ny));
        queue.push([[nx, ny], [...path, [nx, ny]]]);
      }
    }
  }
  return null;
}

export function findClosestFood(head, foods) {
  if (!foods.length) return null;
  let minDist = Infinity, closest = null;
  for (const f of foods) {
    const dist = Math.abs(f[0] - head[0]) + Math.abs(f[1] - head[1]);
    if (dist < minDist) { minDist = dist; closest = f; }
  }
  return closest;
}

export function findRandomSafeDir(head, obstacles) {
  const dirs = [...DIRS];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  for (const [dx, dy] of dirs) {
    const nx = head[0] + dx, ny = head[1] + dy;
    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE &&
        !obstacles.has(k(nx, ny))) return [dx, dy];
  }
  return [1, 0];
}

/* 洪水填充找空间最大的方向（至多统计 20 格） */
export function findSafestDir(head, obstacles) {
  let bestDir = [1, 0], bestSpace = -1;
  for (const [dx, dy] of DIRS) {
    const nx = head[0] + dx, ny = head[1] + dy;
    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE ||
        obstacles.has(k(nx, ny))) continue;
    let space = 0;
    const q = [[nx, ny]];
    const vis = new Set([k(nx, ny)]);
    while (q.length && space < 20) {
      const [cx, cy] = q.shift();
      space++;
      for (const [ddx, ddy] of DIRS) {
        const mx = cx + ddx, my = cy + ddy;
        if (mx >= 0 && mx < GRID_SIZE && my >= 0 && my < GRID_SIZE &&
            !obstacles.has(k(mx, my)) && !vis.has(k(mx, my))) {
          vis.add(k(mx, my));
          q.push([mx, my]);
        }
      }
    }
    if (space > bestSpace) { bestSpace = space; bestDir = [dx, dy]; }
  }
  return bestDir;
}

export function aiGetDirection(head, body, foods, player, difficulty) {
  const obstacles = new Set(body.map(([x, y]) => k(x, y)));
  if (player) for (const [x, y] of player) obstacles.add(k(x, y));
  if (difficulty === 0) {
    if (Math.random() < 0.3) {
      const target = findClosestFood(head, foods);
      if (target) {
        const d = bfsFindPath(head, target, obstacles);
        if (d) return d;
      }
    }
    return findRandomSafeDir(head, obstacles);
  } else if (difficulty === 1) {
    const target = findClosestFood(head, foods);
    if (target) {
      const d = bfsFindPath(head, target, obstacles);
      if (d) return d;
    }
    return findSafestDir(head, obstacles);
  } else {
    const target = findClosestFood(head, foods);
    if (target) {
      const d = bfsFindPath(head, target, obstacles);
      if (d && Math.random() < 0.8) return d;
    }
    if (player) {
      const d = bfsFindPath(head, player[0], obstacles);
      if (d) return d;
    }
    return findSafestDir(head, obstacles);
  }
}

/* ---------- AI 蛇实体 ---------- */
export class AISnake {
  constructor() { this.reset(); }
  reset() {
    this.snake = [
      [GRID_SIZE - 3, GRID_SIZE - 3],
      [GRID_SIZE - 4, GRID_SIZE - 3],
      [GRID_SIZE - 5, GRID_SIZE - 3],
    ];
    this.direction = [-1, 0];
    this.score = 0;
    this.foodEaten = 0;
    this.alive = true;
  }
  getHead() { return this.snake[0]; }
}

/* ---------- 对战管理器 ---------- */
export class VSGame {
  constructor(aiDifficulty = 1) {
    this.ai = new AISnake();
    this.aiDifficulty = aiDifficulty;
    this.reset();
  }

  reset() {
    this.player = this._createPlayerSnake();
    this.ai.reset();
    this.foods = [];
    this.vsGameOver = false;
    this.result = null;   // "win" | "lose" | "draw"
    this.playerScore = 0;
    this.playerDirection = [1, 0];
    for (let i = 0; i < 3; i++) this._spawnFood();
  }

  _createPlayerSnake() {
    return [[2, GRID_SIZE - 3], [1, GRID_SIZE - 3], [0, GRID_SIZE - 3]];
  }

  _wrapPosition([x, y]) {
    if (x < 0) x = GRID_SIZE - 1; else if (x >= GRID_SIZE) x = 0;
    if (y < 0) y = GRID_SIZE - 1; else if (y >= GRID_SIZE) y = 0;
    return [x, y];
  }

  _getAllObstacles(excludeSnake = null) {
    const obs = new Set();
    if (this.player) {
      this.player.forEach(([x, y], i) => {
        if (!(excludeSnake === this.player && i === 0)) obs.add(k(x, y));
      });
    }
    if (this.ai && this.ai.alive) {
      this.ai.snake.forEach(([x, y], i) => {
        if (!(excludeSnake === this.ai && i === 0)) obs.add(k(x, y));
      });
    }
    return obs;
  }

  _spawnFood() {
    const obs = this._getAllObstacles();
    for (const [fx, fy] of this.foods) obs.add(k(fx, fy));
    for (let i = 0; i < 100; i++) {
      const p = [Math.floor(Math.random() * GRID_SIZE), Math.floor(Math.random() * GRID_SIZE)];
      if (!obs.has(k(p[0], p[1]))) { this.foods.push(p); return; }
    }
  }

  _isOutOfBounds([x, y]) {
    return x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE;
  }

  /* 玩家蛇滑动：优先垂直方向，其次反方向，最后静止 */
  _getSlideDirectionPlayer(head, currentDir) {
    const [hx, hy] = head;
    const [dx, dy] = currentDir;
    const bodySet = new Set(this.player.slice(1).map(([x, y]) => k(x, y)));
    const ok = ([x, y]) => !this._isOutOfBounds([x, y]) && !bodySet.has(k(x, y));
    const perp = [[dy, dx], [-dy, -dx]];
    for (const p of perp) {
      const np = [hx + p[0], hy + p[1]];
      if (ok(np)) return [p, np];
    }
    const rp = [hx - dx, hy - dy];
    if (ok(rp)) return [[-dx, -dy], rp];
    return [null, null];
  }

  _moveVsSnake(snakeObj, head, direction, isPlayer) {
    const [dx, dy] = direction;
    let nh = [head[0] + dx, head[1] + dy];
    /* ---- 边界检测 ---- */
    if (this._isOutOfBounds(nh)) {
      if (S.edgeMode === EDGE_DEATH) return false;
      if (S.edgeMode === EDGE_WRAP) {
        nh = this._wrapPosition(nh);
      } else {
        if (isPlayer) {
          const [slideDir, slidePos] = this._getSlideDirectionPlayer(head, direction);
          if (slidePos) {
            this.playerDirection = slideDir;
            nh = slidePos;
          } else return false; // 静止一帧
        } else {
          nh = this._wrapPosition(nh); // AI 蛇在滑动模式下穿墙
        }
      }
    }
    /* ---- 碰撞检测（排除自身头部）---- */
    const obs = this._getAllObstacles(isPlayer ? this.player : this.ai);
    if (obs.has(k(nh[0], nh[1]))) return false;

    /* ---- 移动 ---- */
    snakeObj.unshift(nh);
    let ate = false;
    for (let i = 0; i < this.foods.length; i++) {
      if (nh[0] === this.foods[i][0] && nh[1] === this.foods[i][1]) {
        this.foods.splice(i, 1);
        ate = true;
        break;
      }
    }
    if (!ate) snakeObj.pop();
    return ate ? 2 : 1; // 2=吃到食物, 1=普通移动
  }

  update() {
    if (this.vsGameOver) return;
    /* ---- 玩家 ---- */
    if (this.player) {
      const moved = this._moveVsSnake(this.player, this.player[0], this.playerDirection, true);
      if (moved === 2) this.playerScore += 1;
      else if (moved === 0) this.player = null;
    }
    /* ---- AI ---- */
    if (this.ai && this.ai.alive) {
      const head = this.ai.getHead();
      const dir = aiGetDirection(
        head, this.ai.snake, this.foods,
        this.player || null, this.aiDifficulty
      );
      if (dir) this.ai.direction = dir;
      const moved = this._moveVsSnake(this.ai.snake, head, this.ai.direction, false);
      if (moved === 2) this.ai.score += 1;
      else if (moved === 0) this.ai.alive = false;
    }
    /* ---- 补充食物 ---- */
    while (this.foods.length < 3) this._spawnFood();
    this._checkResult();
  }

  _checkResult() {
    const pa = this.player !== null;
    const aa = this.ai !== null && this.ai.alive;
    if (!pa && !aa) this.result = "draw";
    else if (!pa) this.result = "lose";
    else if (!aa) this.result = "win";
    if (this.result !== null) this.vsGameOver = true;
  }
}
