/* ============================================================
   贪吃蛇 v8.0 Web —— 全部界面绘制（Canvas 1:1 复刻 Pygame 原版）
   菜单 / 游戏画面 / 结算 / 商店 / 皮肤 / 音乐 / 成就 / 段位 /
   每日挑战 / AI难度 / 语言 / 主题 弹窗与通知
   ============================================================ */
import {
  W, H, GRID_SIZE, CELL, GRID_PX, GRID_X, GRID_Y, TOP_BAR,
  THEMES, THEME_IDS, SKINS, ACHIEVEMENTS, SPEED_PRESETS,
  AI_DIFFICULTIES, DAILY_MODIFIERS, SCORE_SCALE,
} from "./data.js";
import {
  S, T, fmtScore, getRedeemable, xpToLevel, getRankTier,
  EDGE_MODE_NAMES, EDGE_MODE_COLORS, EDGE_DEATH,
} from "./state.js";
import { music } from "./audio.js";
import { dailyDateStr, generateDailyChallenge } from "./game.js";

/* ============================================================
   Canvas 基础工具
   ============================================================ */
export let ctx = null;

export function initUi(canvas) {
  ctx = canvas.getContext("2d");
}

/** 画布尺寸/分辨率变化后重设坐标变换（内部逻辑坐标恒为 880×720） */
export function applyCanvasTransform(scale) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

/** 以主题背景色清屏 */
export function clearCanvas(colorKey = "BG_DARK") {
  ctx.fillStyle = C(colorKey);
  ctx.fillRect(0, 0, W, H);
}

const FONT_STACK = `"Microsoft YaHei","微软雅黑","PingFang SC","Noto Sans CJK SC","Helvetica Neue",Arial,sans-serif`;

export function rgb(c, a = 1) {
  if (c.length >= 4 && a === 1) a = c[3] / 255;
  return a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})`
                : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function rrPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fillRR(x, y, w, h, r, color) {
  rrPath(x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRR(x, y, w, h, r, color, lw = 1) {
  rrPath(x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/**
 * 绘制文本。
 * baseline='top'    对应 pygame 左上角 blit（em 盒顶部对齐）
 * baseline='middle' 按墨迹包围盒垂直居中，与 pygame get_rect(center=...) 视觉一致
 *                   （修复：Canvas 默认 em 中线与 CJK 字形中心不一致导致的文字偏移）
 */
export function text(str, size, color, x, y, { align = "left", baseline = "top" } = {}) {
  ctx.font = `${size}px ${FONT_STACK}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  /* 关键：measureText 的墨迹盒是相对当前 textBaseline 计算的，
     必须先固定为 alphabetic，否则会继承上一帧残留的基线导致居中错位 */
  ctx.textBaseline = "alphabetic";
  if (baseline === "middle") {
    const m = ctx.measureText(str);
    const a = m.actualBoundingBoxAscent || 0;
    const d = m.actualBoundingBoxDescent || 0;
    if (a + d > 0) {
      ctx.fillText(str, x, y + (a - d) / 2);
      return;
    }
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
    return;
  }
  ctx.textBaseline = "top";
  ctx.fillText(str, x, y);
}

export function textWidth(str, size) {
  ctx.font = `${size}px ${FONT_STACK}`;
  return ctx.measureText(str).width;
}

function luminance(c) {
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
}

export const C = (key) => rgb(S.colors[key]);
export const col = (key) => S.colors[key];

/* ============================================================
   按钮（复刻原版 Button 类：黑色投影 / 主题色 / 自动对比度）
   ============================================================ */
export function makeButton(o) {
  return {
    x: o.x, y: o.y, w: o.w, h: o.h,
    label: o.label,                       // 字符串 或 () => 字符串
    size: o.size ?? 19,
    bg: o.bg ?? "BTN_BG", hover: o.hover ?? "BTN_HOVER",
    tc: o.tc ?? null, accent: o.accent ?? false,
    radius: o.radius ?? 10,
    toggle: o.toggle ?? false, activeColor: o.activeColor ?? "SPEED_ACTIVE",
    active: o.active ?? false,
    hovered: false,
    hit(mx, my) {
      return mx >= this.x && mx < this.x + this.w && my >= this.y && my < this.y + this.h;
    },
    draw() {
      const bgKey = typeof this.bg === "string" ? this.bg : null;
      const hoverKey = typeof this.hover === "string" ? this.hover : null;
      let color;
      if (this.toggle && this.active) color = S.colors[this.activeColor];
      else if (this.accent) color = this.hovered ? S.colors.ACCENT_HOVER : S.colors.ACCENT;
      else if (this.active && !this.toggle) color = S.colors.SPEED_ACTIVE;
      else color = this.hovered
        ? (hoverKey ? S.colors[hoverKey] : this.hover)
        : (bgKey ? S.colors[bgKey] : this.bg);
      const t = typeof this.label === "function" ? this.label() : this.label;
      fillRR(this.x, this.y + 2, this.w, this.h, this.radius, "rgb(0,0,0)");
      fillRR(this.x, this.y, this.w, this.h, this.radius, rgb(color));
      if (this.active) strokeRR(this.x, this.y, this.w, this.h, this.radius, C("ACCENT"), 2);
      const tc = this.tc ? C(this.tc)
        : (luminance(color) > 0.5 ? C("TEXT_DARK") : C("TEXT_MAIN"));
      /* 优化：文本超宽时自动缩小字号（修复原版英文长文本溢出按钮） */
      let fontSize = this.size;
      const tw = textWidth(t, fontSize);
      if (tw > this.w - 10) fontSize = Math.max(10, Math.floor(fontSize * (this.w - 10) / tw));
      text(t, fontSize, tc, this.x + this.w / 2, this.y + this.h / 2, { align: "center", baseline: "middle" });
    },
  };
}

/* ---------- 滚动条 ---------- */
function drawScrollbar(bx, by, bw, bh, offset, maxScroll, contentH, visibleH, visualW = 8) {
  fillRR(bx, by, bw, bh, 4, C("SCROLL_BAR_BG"));
  if (maxScroll <= 0) return;
  const th = Math.max(20, Math.floor(bh * (visibleH / contentH)));
  const ty = by + Math.floor((offset / maxScroll) * (bh - th));
  const vx = bx + Math.floor((bw - visualW) / 2);
  fillRR(vx, ty, visualW, th, 4, C("SCROLL_BAR"));
}

/* ============================================================
   按钮注册表（坐标与原版一致）
   ============================================================ */
export const B = {};

export function initButtons() {
  const SBW = 95, SBH = 38, SG = 8;
  const speedTotal = 4 * SBW + 3 * SG;
  const sx0 = Math.floor(W / 2 - speedTotal / 2);
  B.speedBtns = SPEED_PRESETS.map((sp, i) => {
    const b = makeButton({
      x: sx0 + i * (SBW + SG), y: 205, w: SBW, h: SBH, radius: 6,
      label: () => sp.name[S.lang] ?? sp.name.en, size: 19,
    });
    b.speedIndex = i;
    b.active = i === S.speedIndex;
    return b;
  });

  B.speedCard = { x: Math.floor((W - 440) / 2), y: 150, w: 440, h: 106 };

  B.mode = makeButton({
    x: W / 2 - 200, y: 285, w: 180, h: 38, radius: 8, size: 19,
    label: () => T("mode_prefix") + (S.gameMode === "timed" ? T("mode_timed") : T("mode_endless")),
    toggle: true, activeColor: "BLUE_BTN", active: true,
  });
  B.edge = makeButton({
    x: W / 2 + 20, y: 285, w: 180, h: 38, radius: 8, size: 19,
    label: () => T(EDGE_MODE_NAMES[S.edgeMode]),
    toggle: true, activeColor: EDGE_MODE_COLORS[S.edgeMode],
    active: S.edgeMode !== EDGE_DEATH,
  });
  B.start = makeButton({
    x: (W - 170) / 2, y: 350, w: 170, h: 50, radius: 12, size: 24,
    label: () => T("start"), accent: true,
  });
  B.vs = makeButton({
    x: (W - 170) / 2, y: 410, w: 170, h: 46, radius: 8, size: 19,
    label: () => T("vs_mode"), toggle: true, activeColor: "ACCENT",
  });

  const btnY = 530;
  B.help = makeButton({ x: W / 2 - 230, y: btnY, w: 100, h: 36, radius: 8, label: () => T("help") });
  B.stats = makeButton({ x: W / 2 - 115, y: btnY, w: 100, h: 36, radius: 8, label: () => T("stats") });
  B.update = makeButton({ x: W / 2, y: btnY, w: 100, h: 36, radius: 8, label: () => T("update") });
  B.dev = makeButton({ x: W / 2 + 115, y: btnY, w: 100, h: 36, radius: 8, label: () => T("dev") });

  B.shop = makeButton({
    x: 15, y: 160, w: 100, h: 42, radius: 8,
    bg: [60, 40, 20], hover: [80, 60, 30], tc: "SHOP_GOLD", label: () => T("shop"),
  });
  B.skin = makeButton({
    x: 15, y: 210, w: 100, h: 42, radius: 8,
    bg: [40, 40, 60], hover: [55, 55, 80], tc: "ACCENT", label: () => T("skin_shop"),
  });
  B.effects = makeButton({
    x: 15, y: 260, w: 100, h: 36, radius: 8, toggle: true, activeColor: "GREEN_BTN",
    label: () => (S.effectsEnabled ? T("effects_on") : T("effects_off")),
  });
  B.effects.active = S.effectsEnabled;

  const mx = W - 160, my = H - 50;
  B.music = makeButton({ x: mx, y: my, w: 90, h: 36, radius: 8, label: () => T("music") });
  B.lang = makeButton({
    x: mx - 5, y: my - 42, w: 100, h: 36, radius: 8, toggle: true, activeColor: "SPEED_ACTIVE",
    label: () => ({ zh: "中文", en: "English", ja: "日本語" }[S.lang]),
  });
  B.lang.active = true;
  B.theme = makeButton({ x: mx - 5, y: my - 84, w: 100, h: 36, radius: 8, toggle: true, activeColor: "PURPLE", label: () => T("theme") });
  B.theme.active = true;
  B.ach = makeButton({ x: mx - 5, y: my - 126, w: 100, h: 36, radius: 8, toggle: true, activeColor: "GOLD", label: () => T("achievements") });
  B.ach.active = true;
  B.rank = makeButton({ x: mx - 5, y: my - 168, w: 100, h: 36, radius: 8, toggle: true, activeColor: "GOLD", label: () => T("rank_title") });
  B.rank.active = true;
  B.daily = makeButton({ x: mx - 5, y: my - 210, w: 100, h: 36, radius: 8, toggle: true, activeColor: "GREEN_BTN", label: () => T("daily_challenge") });
  B.daily.active = true;

  B.pause = makeButton({ x: GRID_X + GRID_PX + 15, y: GRID_Y, w: 70, h: 34, radius: 8, label: () => T("pause") });
  B.end = makeButton({
    x: GRID_X + GRID_PX + 15, y: GRID_Y + 48, w: 70, h: 34, radius: 8,
    bg: "RED_BTN", hover: "RED_BTN_H", label: () => T("end"),
  });
  B.goRestart = makeButton({ x: (W - 170) / 2, y: 340, w: 170, h: 46, radius: 12, size: 24, label: () => T("restart"), accent: true });
  B.goMenu = makeButton({ x: (W - 170) / 2, y: 400, w: 170, h: 46, radius: 12, size: 24, label: () => T("back_menu") });
  B.vsRestart = makeButton({ x: (W - 170) / 2, y: 300, w: 170, h: 46, radius: 12, size: 24, label: () => T("restart"), accent: true });
  B.vsMenu = makeButton({ x: (W - 170) / 2, y: 360, w: 170, h: 46, radius: 12, size: 24, label: () => T("back_menu") });

  /* 音乐弹窗（面板 480x430 位于 (200,145)） */
  B.mpPrev = makeButton({ x: 200 + 80, y: 145 + 130, w: 70, h: 36, radius: 8, label: () => T("prev") });
  B.mpPlay = makeButton({ x: 200 + 175, y: 145 + 130, w: 90, h: 36, radius: 8, accent: true, label: () => (S.musicPlaying ? T("pause_btn") : T("play")) });
  B.mpNext = makeButton({ x: 200 + 290, y: 145 + 130, w: 70, h: 36, radius: 8, label: () => T("next") });

  /* 积分商店（面板 500x420 位于 (190,150)） */
  B.eb = makeButton({ x: 190 + 140, y: 150 + 245, w: 220, h: 46, radius: 12, size: 24, accent: true, label: () => T("exchange_1") });
  const bsx = 190 + Math.floor((500 - (3 * 140 + 2 * 25)) / 2);
  B.e10 = makeButton({ x: bsx, y: 150 + 305, w: 140, h: 32, radius: 8, label: () => T("exchange_10") });
  B.e50 = makeButton({ x: bsx + 165, y: 150 + 305, w: 140, h: 32, radius: 8, label: () => T("exchange_50") });
  B.eall = makeButton({ x: bsx + 330, y: 150 + 305, w: 140, h: 32, radius: 8, label: () => T("exchange_all") });

  /* 皮肤购买确认 */
  B.skinYes = makeButton({ x: 0, y: 0, w: 80, h: 32, radius: 6, bg: "GREEN_BTN", hover: "GREEN_BTN_H", label: () => T("confirm_yes") });
  B.skinNo = makeButton({ x: 0, y: 0, w: 80, h: 32, radius: 6, bg: "RED_BTN", hover: "RED_BTN_H", label: () => T("confirm_no") });

  /* 每日挑战「挑战」按钮（原版缺失，v8.0 新增） */
  B.dailyPlay = makeButton({
    x: 230 + (420 - 130) / 2, y: 190 + 272, w: 130, h: 34, radius: 8,
    bg: "GREEN_BTN", hover: "GREEN_BTN_H", label: () => T("daily_play"),
  });

  /* 菜单全部按钮（用于悬停刷新） */
  B.menuAll = [
    B.start, B.vs, B.mode, B.edge, B.shop, B.skin, B.effects,
    B.lang, B.theme, B.ach, B.rank, B.daily, B.music,
    B.help, B.stats, B.update, B.dev, ...B.speedBtns,
  ];
}

export function updateMenuHover(mp) {
  for (const b of B.menuAll) b.hovered = b.hit(mp[0], mp[1]);
}

/* ============================================================
   游戏画面元素
   ============================================================ */
export function drawGrid() {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? C("GRID_EVEN") : C("GRID_ODD");
      ctx.fillRect(GRID_X + x * CELL, GRID_Y + y * CELL, CELL, CELL);
    }
  }
}

export function drawFoods(foods) {
  for (const [fx, fy] of foods) {
    const cx = GRID_X + fx * CELL + CELL / 2;
    const cy = GRID_Y + fy * CELL + CELL / 2;
    for (let rad = 14; rad > 6; rad -= 2) {
      const alpha = Math.max(0, 40 - rad * 2) / 255;
      ctx.fillStyle = rgb(S.colors.FOOD_MAIN, alpha);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C("FOOD_MAIN");
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C("FOOD_GLOW");
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawSnakeBody(snake, direction, colorAt) {
  const n = snake.length;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = snake[i];
    const color = colorAt(i, n);
    const x = GRID_X + sx * CELL + 2, y = GRID_Y + sy * CELL + 2;
    if (i === 0) {
      fillRR(x, y, CELL - 4, CELL - 4, 7, rgb(color));
      const [dx, dy] = direction;
      const e1 = [GRID_X + sx * CELL + 7, GRID_Y + sy * CELL + 7];
      const e2 = [GRID_X + sx * CELL + CELL - 9, GRID_Y + sy * CELL + 7];
      for (const [ex, ey] of [e1, e2]) {
        ctx.fillStyle = "rgb(255,255,255)";
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgb(20,20,20)";
        ctx.beginPath(); ctx.arc(ex + dx, ey + dy, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      fillRR(x, y, CELL - 4, CELL - 4, 5, rgb(color));
    }
  }
}

function drawGridBorder() {
  strokeRR(GRID_X, GRID_Y, GRID_PX, GRID_PX, 6, C("PANEL_BORDER"), 2);
}

function drawMazeWalls(walls) {
  for (const wk of walls) {
    const [wx, wy] = wk.split(",").map(Number);
    const x = GRID_X + wx * CELL, y = GRID_Y + wy * CELL;
    fillRR(x + 2, y + 2, CELL - 4, CELL - 4, 5, rgb(S.colors.RED_BTN, 0.9));
    strokeRR(x + 2, y + 2, CELL - 4, CELL - 4, 5, C("PANEL_BORDER"), 2);
  }
}

/* 单人 / 每日 共用的游戏画面 */
export function drawGameField(game, daily) {
  drawGrid();
  if (daily && game.mazeWalls.size) drawMazeWalls(game.mazeWalls);
  drawFoods(game.allFoods());
  const ms = performance.now();
  drawSnakeBody(game.snake, game.direction, (i, n) => game.getSkinColor(i, n, ms));
  drawGridBorder();

  /* 暴击/落空 浮动文字 */
  const now = performance.now();
  for (const ft of game.floatTexts) {
    const t = (now - ft.born) / ft.life;
    if (t >= 1) continue;
    const alpha = 1 - t;
    text(T(ft.textKey), 14, rgb(S.colors[ft.color], alpha),
      GRID_X + ft.cell[0] * CELL + CELL / 2,
      GRID_Y + ft.cell[1] * CELL - 6 - t * 18, { align: "center", baseline: "middle" });
  }
  game.floatTexts = game.floatTexts.filter((f) => now - f.born < f.life);
}

export function drawTopBar() {
  ctx.fillStyle = C("PANEL_BG");
  ctx.fillRect(0, 0, W, TOP_BAR);
  ctx.fillStyle = C("BG_LIGHT");
  ctx.fillRect(0, TOP_BAR, W, 2);
}

export function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.706)";
  ctx.fillRect(GRID_X, GRID_Y, GRID_PX, GRID_PX);
  text(T("paused_label"), 54, C("TEXT_MAIN"),
    GRID_X + GRID_PX / 2, GRID_Y + GRID_PX / 2, { align: "center", baseline: "middle" });
}

/* ============================================================
   主菜单
   ============================================================ */
export function drawMenu() {
  /* 背景细线纹理 */
  for (let i = 0; i < W; i += 60) {
    ctx.fillStyle = rgb(S.colors.BG_LIGHT, 4 / 255);
    ctx.fillRect(i, 0, 1, H);
  }
  /* 标题（带投影，居中） */
  text(T("title"), 54, "rgba(0,0,0,0.118)", W / 2 + 2, 57, { align: "center", baseline: "middle" });
  text(T("title"), 54, C("ACCENT"), W / 2, 55, { align: "center", baseline: "middle" });
  text(T("subtitle"), 19, C("TEXT_DIM"), W / 2, 100, { align: "center", baseline: "middle" });

  /* 速度选择卡片 */
  const sc = B.speedCard;
  fillRR(sc.x, sc.y, sc.w, sc.h, 10, C("PANEL_BG"));
  strokeRR(sc.x, sc.y, sc.w, sc.h, 10, C("PANEL_BORDER"), 1);
  text(T("speed"), 19, C("TEXT_DIM"), W / 2, sc.y + 18, { align: "center", baseline: "middle" });
  for (const b of B.speedBtns) b.draw();
  B.mode.draw();
  B.edge.draw();
  B.start.draw();
  B.vs.draw();

  /* 底部数据条 */
  const sr = { x: W / 2 - 200, y: 478, w: 400, h: 42 };
  fillRR(sr.x, sr.y, sr.w, sr.h, 8, C("PANEL_BG"));
  strokeRR(sr.x, sr.y, sr.w, sr.h, 8, C("PANEL_BORDER"), 1);
  const stText = `${T("total_score")}:${Math.floor(S.stats.total_score / SCORE_SCALE)}  ` +
    `${T("max_endless")}:${fmtScore(S.stats.endless_high)}  ` +
    `${T("max_timed")}:${fmtScore(S.stats.timed_high)}  ` +
    `${T("games_played")}:${S.stats.games_played}`;
  text(stText, 12, C("TEXT_MAIN"), W / 2, sr.y + 21, { align: "center", baseline: "middle" });

  B.shop.draw();
  B.skin.draw();
  B.effects.draw();
  B.help.draw();
  B.stats.draw();
  B.update.draw();
  B.dev.draw();
  B.lang.draw();
  B.theme.draw();
  B.ach.draw();
  B.rank.draw();
  B.daily.draw();
  B.music.draw();

  if (music.total > 0) {
    text(`${T("track_label")}${music.index + 1}/${music.total}`, 12, C("TEXT_DARK"), W - 235, H - 40);
  }
  text("v8.0", 12, C("TEXT_DARK"), W - 60, H - 18);
}

/* ============================================================
   单人 / 每日 游戏画面
   ============================================================ */
export function drawPlaying(game, paused, daily = false) {
  drawGameField(game, daily);
  drawTopBar();
  const skinName = game.skin().name[S.lang] ?? game.skin().name.en;
  text(`${T("skin_label")}: ${skinName}`, 12, C("TEXT_DIM"), 18, 18);
  text(`${T("score")}: ${fmtScore(game.score)}`, 24, C("TEXT_MAIN"), 18, 40);
  text(`${T("multiplier")}: ${game.multiplier}x`, 14,
    game.multiplier > 1 ? C("GOLD") : C("TEXT_DIM"), 18, 66);
  const modeText = daily
    ? `${T("daily_modifier")}: ${T(game.modifier.name_key)}`
    : `${T("mode_label")}: ${game.mode === "endless" ? T("mode_endless") : T("mode_timed")}`;
  text(modeText, 14, C("TEXT_DIM"), GRID_X + 5, 16);
  if (game.mode === "timed") {
    const mi = Math.floor(game.timeLeft / 60), se = Math.floor(game.timeLeft % 60);
    const ts = `${T("time_label")}: ${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}`;
    text(ts, 24, game.timeLeft < 30 ? C("RED_BTN") : C("GOLD"), GRID_X + 5, 40);
  }

  /* 实时分数面板 */
  const px = GRID_X + GRID_PX + 15, pw = W - px - 15, py = GRID_Y + 95, ph = 160;
  ctx.fillStyle = rgb(S.colors.SCORE_PANEL);
  ctx.fillRect(px, py, pw, ph);
  text(T("real_time"), 19, C("ACCENT"), px + 6, py + 6);
  const hs = daily
    ? (S.stats.daily_challenges[dailyDateStr()]?.score || 0)
    : (game.mode === "endless" ? S.stats.endless_high : S.stats.timed_high);
  text(`${T("current")}: ${fmtScore(game.score)}`, 14, C("TEXT_MAIN"), px + 6, py + 32);
  text(`${T("high_label")}: ${fmtScore(hs)}`, 14, C("GOLD"), px + 6, py + 52);
  text(`${T("food_label")}: ${game.foodEaten}`, 14, C("TEXT_DIM"), px + 6, py + 72);

  B.pause.draw();
  B.end.draw();
  if (paused) drawPauseOverlay();
}

/* ============================================================
   人机对战画面
   ============================================================ */
export function drawVsPlaying(vsGame, paused) {
  drawGrid();
  drawFoods(vsGame.foods);
  const ms = performance.now();
  if (vsGame.player) {
    drawSnakeBody(vsGame.player, vsGame.playerDirection, (i, n) => {
      const skin = SKINS[S.skinId];
      if (skin.rainbow) {
        const h = (ms / 2000 + i / n) % 1.0;
        const [r, g, b] = hsvToRgb(h, 0.5, 0.85);
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
      }
      if (i === 0) return skin.head_color;
      const t = i / Math.max(n, 1);
      return skin.body_color.map((c) => Math.min(255, Math.floor(c * (1 - t * 0.3))));
    });
  }
  if (vsGame.ai && vsGame.ai.alive) {
    drawSnakeBody(vsGame.ai.snake, vsGame.ai.direction, (i, n) => {
      if (i === 0) return [255, 100, 100];
      const t = i / Math.max(n, 1);
      return [Math.floor(255 * (1 - t * 0.5)), 60, 60];
    });
  }
  drawGridBorder();
  drawTopBar();
  text(T("vs_player"), 24, C("VS_PLAYER"), 18, 12);
  text(`${T("score")}: ${vsGame.playerScore}`, 19, C("TEXT_MAIN"), 18, 45);
  text(T("vs_ai"), 24, C("VS_AI"), W - 180, 12);
  text(`${T("score")}: ${vsGame.ai ? vsGame.ai.score : 0}`, 19, C("TEXT_MAIN"), W - 180, 45);
  text(`${T("vs_food")}: ${vsGame.foods.length}`, 14, C("TEXT_DIM"), W / 2 - 30, 30);
  if (paused) drawPauseOverlay();
}

export function drawVsOver(vsGame) {
  drawVsPlaying(vsGame, false);
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  let rt, rc;
  if (vsGame.result === "win") { rt = T("vs_win"); rc = C("VS_PLAYER"); }
  else if (vsGame.result === "lose") { rt = T("vs_lose"); rc = C("VS_AI"); }
  else { rt = T("vs_draw"); rc = C("TEXT_DIM"); }
  text(rt, 54, rc, W / 2, 70, { align: "center", baseline: "middle" });
  strokeRR(W / 2 - 170, 100, 340, 100, 12, C("PANEL_BORDER"), 1);
  text(`${T("vs_player")}: ${vsGame.playerScore}`, 19, C("VS_PLAYER"), W / 2 - 150, 120);
  text(`${T("vs_ai")}: ${vsGame.ai ? vsGame.ai.score : 0}`, 19, C("VS_AI"), W / 2 - 150, 155);
  B.vsRestart.draw();
  B.vsMenu.draw();
}

/* ============================================================
   单人结算画面
   ============================================================ */
export function drawGameOver(game) {
  drawGameField(game, false);
  if (S.flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${S.flashAlpha / 255})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  text(T("game_over"), 54, "rgba(0,0,0,0.118)", W / 2 + 2, 72, { align: "center", baseline: "middle" });
  text(T("game_over"), 54, C("ACCENT"), W / 2, 70, { align: "center", baseline: "middle" });

  const cw = 380, ch = 120, cx = W / 2 - cw / 2, cy = 95;
  fillRR(cx, cy, cw, ch, 12, C("PANEL_BG"));
  strokeRR(cx, cy, cw, ch, 12, C("PANEL_BORDER"), 2);
  text(T("score_label"), 14, C("TEXT_DIM"), cx + 18, cy + 10);
  text(fmtScore(S.currentScore), 54, C("GOLD"), cx + 18, cy + 70, { baseline: "middle" });
  const ix = cx + cw - 180, iy = cy + 15;
  const modeName = game.mode === "endless" ? "Endless" : "Timed";
  [`${T("mode_label")}: ${modeName}`,
   `${T("multiplier")}: ${game.multiplier}x`,
   `${T("food_label")}: ${game.foodEaten}`].forEach((t, i) => {
    text(t, 14, C("TEXT_DIM"), ix, iy + i * 22);
  });

  const scy = cy + ch + 12;
  fillRR(cx, scy, cw, 72, 10, C("PANEL_BG"));
  strokeRR(cx, scy, cw, 72, 10, C("PANEL_BORDER"), 1);
  const colW = cw / 3;
  [[T("max_endless"), fmtScore(S.stats.endless_high)],
   [T("max_timed"), fmtScore(S.stats.timed_high)],
   [T("total_score"), String(Math.floor(S.stats.total_score / SCORE_SCALE))],
  ].forEach(([l, v], i) => {
    const cc = cx + i * colW + colW / 2;
    text(l, 12, C("TEXT_DIM"), cc, scy + 18, { align: "center", baseline: "middle" });
    text(v, 19, C("TEXT_MAIN"), cc, scy + 48, { align: "center", baseline: "middle" });
  });

  let ny = scy + 85;
  if (S.lastRecord) {
    const pulse = Math.abs(Math.sin(performance.now() / 300));
    const gc = [255, Math.floor(215 * pulse), 0];
    const label = T("new_record");
    const wText = textWidth(label, 32);
    ctx.fillStyle = rgb(gc, 30 / 255);
    ctx.fillRect(W / 2 - wText / 2 - 10, ny - 21, wText + 20, 42);
    text(label, 32, rgb(gc), W / 2, ny, { align: "center", baseline: "middle" });
    ny += 55;
  }
  text(`${T("score_earned")}: +${fmtScore(S.currentScore)}`, 14, C("GREEN_BTN"), W / 2, ny, { align: "center", baseline: "middle" });
  ny += 25;
  const [lvl, prog, need] = xpToLevel(S.stats.xp || 0);
  const tier = getRankTier(lvl);
  text(`${T("rank_level")}: ${lvl}  |  ${T("rank_xp")}: ${prog}/${need}`, 14, rgb(tier.color), W / 2, ny, { align: "center", baseline: "middle" });
  ny += 30;
  B.goRestart.y = ny;
  B.goMenu.y = ny + 55;
  B.goRestart.draw();
  B.goMenu.draw();
}

/* ============================================================
   通用滚动弹窗（帮助 / 开发者 / 更新 / 统计）
   ============================================================ */
const POPUP_SIZES = { help: [560, 420], dev: [580, 400], update: [600, 520], stats: [560, 400] };

export function getPopupGeometry(id) {
  const [w, h] = POPUP_SIZES[id];
  return { x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w, h };
}

export function drawScrollPopup(titleText, lines, id) {
  const { x, y, w, h } = getPopupGeometry(id);
  const offset = S.scrolls[id];
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(titleText, 32, C("ACCENT"), x + w / 2, y + 30, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(x + 30, y + 60, w - 60, 1);

  const lineH = 20;
  const contentH = lines.length * lineH + 20;
  const visibleH = h - 90;
  const maxScroll = Math.max(0, contentH - visibleH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 4, y + 66, w - 8, visibleH);
  ctx.clip();
  const y0 = y + 76 - Math.min(offset, maxScroll);
  lines.forEach((line, i) => {
    const yy = y0 + i * lineH;
    if (yy + lineH < y + 66 || yy > y + 66 + visibleH) return;
    let c;
    if (line.startsWith("═══")) c = C("ACCENT");
    else if (line.startsWith("  v")) c = C("GOLD");
    else if (line.startsWith("  [")) c = C("TEXT_MAIN");
    else c = C("TEXT_DIM");
    text(line, 14, c, x + 32, yy);
  });
  ctx.restore();
  if (maxScroll > 0) drawScrollbar(x + w - 14, y + 66, 8, visibleH, Math.min(offset, maxScroll), maxScroll, contentH, visibleH);
  text(T("scroll_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 16, { align: "center", baseline: "middle" });
  return maxScroll;
}

export function getStatLines() {
  const t = S.stats.total_time;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  let ts;
  if (S.lang === "en") ts = h > 0 ? `${h}h${m}m${s}s` : `${m}m${s}s`;
  else ts = h > 0 ? `${h}时${m}分${s}秒` : `${m}分${s}秒`;
  const avg = Math.floor(Math.floor(S.stats.total_score / Math.max(S.stats.games_played, 1)) / SCORE_SCALE);
  return [
    `[ ${T("stats_title")} ]`, "",
    `  ${T("total_score")}: ${Math.floor(S.stats.total_score / SCORE_SCALE)}`,
    `  ${T("games_played")}: ${S.stats.games_played}`,
    `  ${T("play_time")}: ${ts}`,
    `  ${T("avg_score")}: ${avg}`, "",
    `═══   ${T("mode_title")}   ═══`, "",
    `  ${T("max_endless")}: ${fmtScore(S.stats.endless_high)}`,
    `  ${T("max_timed")}: ${fmtScore(S.stats.timed_high)}`,
  ];
}

/* ============================================================
   积分商店弹窗
   ============================================================ */
export const SHOP_RECT = { x: 190, y: 150, w: 500, h: 420 };

export function drawShopPopup() {
  const { x, y, w, h } = SHOP_RECT;
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("shop_title"), 32, C("SHOP_GOLD"), x + w / 2, y + 28, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(x + 30, y + 58, w - 60, 1);
  text(T("exchange_rate"), 14, C("TEXT_DIM"), x + 40, y + 72);

  const cw = 110, chh = 80, cgap = 10;
  const sx = x + Math.floor((w - (3 * cw + 2 * cgap)) / 2);
  const cy = y + 105;
  const rdm = Math.floor(getRedeemable() / SCORE_SCALE);
  const rded = S.stats.redeemed_points;
  const ts = Math.floor(S.stats.total_score / SCORE_SCALE);
  [[T("redeemable"), String(rdm), C("GREEN_BTN")],
   [T("redeemed"), String(rded), C("RED_BTN")],
   [T("total"), String(ts), C("SHOP_GOLD")],
  ].forEach(([lb, vl, cl], i) => {
    const cx = sx + i * (cw + cgap);
    fillRR(cx, cy, cw, chh, 10, C("PANEL_BG"));
    strokeRR(cx, cy, cw, chh, 10, C("PANEL_BORDER"), 1);
    text(lb, 12, C("TEXT_DIM"), cx + cw / 2, cy + 18, { align: "center", baseline: "middle" });
    text(vl, 32, cl, cx + cw / 2, cy + 50, { align: "center", baseline: "middle" });
  });

  const iy = y + 200;
  text(T("current_redeemable", rdm), 19, C("GOLD"), x + 35, iy);
  const ht = T("history_total", ts);
  text(ht, 19, C("TEXT_DIM"), x + w - 35 - textWidth(ht, 19), iy);

  B.eb.draw(); B.e10.draw(); B.e50.draw(); B.eall.draw();
  if (S.shopMsgTimer > 0) {
    text(S.shopMsg, 14, C("GOLD"), x + w / 2, y + 365, { align: "center", baseline: "middle" });
  }
  text(T("click_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 14, { align: "center", baseline: "middle" });
}

/* ============================================================
   皮肤商店弹窗
   ============================================================ */
export const SKIN_RECT = { x: 200, y: 80, w: 480, h: 560 };
export const SKIN_GEO = { header: 60, footer: 36, itemH: 90, barW: 18, barVisualW: 8 };

export function skinMaxScroll() {
  const total = SKINS.length * SKIN_GEO.itemH;
  const visible = SKIN_RECT.h - SKIN_GEO.header - SKIN_GEO.footer;
  return Math.max(0, total - visible);
}

/* 皮肤商店滚动条滑块几何（供拖拽命中检测共用） */
export function skinScrollbarThumb() {
  const max = skinMaxScroll();
  const by = SKIN_RECT.y + SKIN_GEO.header;
  const bh = SKIN_RECT.h - SKIN_GEO.header - SKIN_GEO.footer;
  const total = SKINS.length * SKIN_GEO.itemH;
  const th = Math.max(24, Math.floor(bh * Math.min(1.0, bh / total)));
  const ty = max > 0 ? by + Math.floor((S.scrolls.skin / max) * (bh - th)) : by;
  return { x: SKIN_RECT.x + SKIN_RECT.w - 20, y: ty, w: SKIN_GEO.barW, h: th, by, bh, th, max };
}

export function drawSkinPopup() {
  const { x, y, w, h } = SKIN_RECT;
  const g = SKIN_GEO;
  const offset = S.scrolls.skin;
  const max = skinMaxScroll();
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("skin_title"), 32, C("ACCENT"), x + w / 2, y + 25, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(x + 20, y + 55, w - 40, 1);

  const contentX = x + 15;
  const contentW = w - 30 - SKIN_GEO.barW - 4;
  const visibleH = h - g.header - g.footer;
  ctx.save();
  ctx.beginPath();
  ctx.rect(contentX, y + g.header, contentW, visibleH);
  ctx.clip();
  const ms = performance.now();
  SKINS.forEach((skin, idx) => {
    const yy = y + g.header + idx * g.itemH - offset;
    if (yy + g.itemH < y + g.header || yy > y + g.header + visibleH) return;
    const cardH = g.itemH - 6;
    const owned = S.unlockedSkins.includes(skin.id);
    const cur = skin.id === S.skinId;
    let bgc, bdc;
    if (cur) { bgc = "rgb(25,50,80)"; bdc = C("GOLD"); }
    else if (owned) { bgc = "rgb(20,30,45)"; bdc = C("GREEN_BTN"); }
    else { bgc = "rgb(15,20,35)"; bdc = C("RED_BTN"); }
    fillRR(contentX, yy, contentW, cardH, 8, bgc);
    strokeRR(contentX, yy, contentW, cardH, 8, bdc, 2);
    const px = contentX + 12, py = yy + 10;
    let c0, c1, c2;
    if (skin.rainbow) {
      c0 = rainbowColor(0, 3, ms); c1 = rainbowColor(1, 3, ms); c2 = rainbowColor(2, 3, ms);
    } else {
      c0 = rgb(skin.head_color);
      c1 = rgb(skin.body_color);
      c2 = rgb(skin.body_color.map((c) => Math.min(255, Math.floor(c * 0.85))));
    }
    fillRR(px, py, 20, 20, 4, c0);
    fillRR(px + 24, py, 20, 20, 4, c1);
    fillRR(px + 48, py, 20, 20, 4, c2);
    text(skin.name[S.lang] ?? skin.name.en, 19, C("TEXT_MAIN"), px, py + 26);
    text(skin.special.desc[S.lang] ?? skin.special.desc.en, 14, C("TEXT_DIM"), px, py + 48);
    let st;
    if (cur) st = [T("equipped"), C("GOLD"), 19];
    else if (owned) st = [T("owned"), C("GREEN_BTN"), 19];
    else if (skin.unlock === "time_3min") st = [T("unlock_time"), C("TEXT_DIM"), 14];
    else if (skin.unlock && skin.unlock.startsWith("level_")) {
      st = [`Lv.${skin.unlock.split("_")[1]}`, C("TEXT_DIM"), 19];
    } else if (skin.price === -1) st = [skin.special.desc[S.lang] ?? skin.special.desc.en, C("TEXT_DIM"), 14];
    else st = [T("price_pts", skin.price), C("SHOP_GOLD"), 19];
    const stText = st[0];
    text(stText, st[2], st[1], contentX + contentW - 12 - textWidth(stText, st[2]), yy + 10);
  });
  ctx.restore();

  /* 滚动条（18px 点击区 + 8px 视觉条） */
  if (max > 0) {
    const { x: bx2, y: ty, w: bw2, h: th } = skinScrollbarThumb();
    const by = y + g.header, bh = visibleH;
    fillRR(SKIN_RECT.x + SKIN_RECT.w - 20, by, bw2, bh, 4, C("SCROLL_BAR_BG"));
    fillRR(bx2 + Math.floor((bw2 - g.barVisualW) / 2), ty, g.barVisualW, th, 4, C("SCROLL_BAR"));
  }

  /* 购买确认弹窗 */
  if (S.skinConfirm && S.skinConfirmId != null) {
    const sk = SKINS[S.skinConfirmId];
    const crw = 300, crh = 140;
    const cpx = Math.floor((W - crw) / 2), cpy = Math.floor((H - crh) / 2);
    fillRR(cpx, cpy, crw, crh, 12, C("BG_MID"));
    strokeRR(cpx, cpy, crw, crh, 12, C("PANEL_BORDER"), 2);
    const nm = sk.name[S.lang] ?? sk.name.en;
    text(T("confirm_buy", nm), 19, C("TEXT_MAIN"), cpx + crw / 2, cpy + 35, { align: "center", baseline: "middle" });
    text(T("cost_pts", sk.price), 14, C("TEXT_DIM"), cpx + crw / 2, cpy + 65, { align: "center", baseline: "middle" });
    B.skinYes.x = cpx + crw / 2 - 90; B.skinYes.y = cpy + 89;
    B.skinNo.x = cpx + crw / 2 + 10; B.skinNo.y = cpy + 89;
    B.skinYes.draw();
    B.skinNo.draw();
  }
  text(T("skin_hint"), 12, C("TEXT_DARK"), x + w / 2, y + h - 12, { align: "center", baseline: "middle" });
}

function rainbowColor(i, n, ms) {
  const h = (ms / 2000 + i / n) % 1.0;
  const [r, g, b] = hsvToRgb(h, 0.5, 0.85);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

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

/* 根据点击位置反算皮肤下标（与绘制几何一致，修复原版错位） */
export function skinIndexAt(my) {
  const rel = my - (SKIN_RECT.y + SKIN_GEO.header) + S.scrolls.skin;
  const idx = Math.floor(rel / SKIN_GEO.itemH);
  return idx >= 0 && idx < SKINS.length ? idx : -1;
}

/* ============================================================
   音乐弹窗
   ============================================================ */
export const MUSIC_RECT = { x: 200, y: 145, w: 480, h: 430 };

export function musicScrollbarThumb() {
  const lx = MUSIC_RECT.x + 30, ly = MUSIC_RECT.y + 265;
  const lw = MUSIC_RECT.w - 80, lh = 120, ih = 22;
  const max = Math.max(0, music.total * ih - lh);
  const th = max > 0 ? Math.max(12, Math.floor(lh * (lh / (music.total * ih)))) : lh;
  const ty = max > 0 ? ly + Math.floor((S.scrolls.musicList / max) * (lh - th)) : ly;
  return { x: lx + lw + 5, y: ty, w: 6, h: th, by: ly, bh: lh, max };
}

export function drawMusicPopup() {
  const { x, y, w, h } = MUSIC_RECT;
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("music_title"), 32, C("ACCENT"), x + w / 2, y + 28, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(x + 30, y + 58, w - 60, 1);

  let cn = music.total > 0 ? music.currentName() : T("no_music");
  if (cn.length > 35) cn = cn.slice(0, 32) + "...";
  text(`${T("current_playing")}: ${cn}`, 19, C("TEXT_MAIN"), x + 30, y + 72);
  text(`${T("status")}: ${S.musicPlaying ? T("playing_status") : T("paused_status")}`, 19,
    S.musicPlaying ? C("GREEN_BTN") : C("TEXT_DIM"), x + 30, y + 98);

  B.mpPrev.draw(); B.mpPlay.draw(); B.mpNext.draw();

  text(T("volume"), 19, C("TEXT_DIM"), x + 30, y + 180);
  const sx = x + 80, sy = y + 200, sw = 320, sh = 10;
  fillRR(sx, sy, sw, sh, 5, C("VOLUME_TRACK"));
  const fw = Math.floor(sw * S.musicVolume);
  if (fw > 0) fillRR(sx, sy, fw, sh, 5, C("VOLUME_FILL"));
  fillRR(sx + fw - 6, sy - 4, 12, 18, 4, C("ACCENT"));
  text(`${Math.floor(S.musicVolume * 100)}%`, 14, C("TEXT_MAIN"), x + 30, y + 218);

  text(T("track_list"), 19, C("TEXT_DIM"), x + 30, y + 245);
  const lx = x + 30, ly = y + 265, lw = w - 80, lh = 120, ih = 22;
  ctx.save();
  ctx.beginPath(); ctx.rect(lx, ly, lw, lh); ctx.clip();
  const names = music.names();
  names.forEach((name, i) => {
    const yy = ly + i * ih - S.scrolls.musicList;
    if (yy + ih < ly || yy > ly + lh) return;
    const dn = name.length <= 28 ? name : name.slice(0, 25) + "...";
    const mk = i === music.index ? "▶ " : "   ";
    text(`${mk}${i + 1}. ${dn}`, 14, i === music.index ? C("GOLD") : C("TEXT_DIM"), lx + 5, yy + 2);
  });
  ctx.restore();
  const { max } = musicScrollbarThumb();
  if (max > 0) {
    const t = musicScrollbarThumb();
    fillRR(t.x, ly, 6, lh, 3, C("SCROLL_BAR_BG"));
    fillRR(t.x, t.y, 6, t.h, 3, C("SCROLL_BAR"));
  }
  text(T("scroll_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 16, { align: "center", baseline: "middle" });
}

/* ============================================================
   成就面板
   ============================================================ */
export const ACH_RECT = { x: 180, y: 140, w: 520, h: 440 };

export function achMaxScroll() {
  const itemTotal = 54;
  const visibleH = ACH_RECT.h - 130;
  return Math.max(0, ACHIEVEMENTS.length * itemTotal - visibleH);
}

export function achScrollbarThumb() {
  const max = achMaxScroll();
  const listY = ACH_RECT.y + 85;
  const bh = ACH_RECT.h - 130;
  const totalH = ACHIEVEMENTS.length * 54;
  const th = max > 0 ? Math.max(15, Math.floor(bh * (bh / totalH))) : bh;
  const ty = max > 0 ? listY + Math.floor((S.scrolls.achievements / max) * (bh - th)) : listY;
  return { x: ACH_RECT.x + ACH_RECT.w - 12, y: ty, w: 6, h: th, by: listY, bh, max };
}

export function drawAchievements() {
  const { x, y, w, h } = ACH_RECT;
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("achievements"), 32, C("GOLD"), x + w / 2, y + 28, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(x + 20, y + 55, w - 40, 1);
  text(`${S.unlockedAchievements.size}/${ACHIEVEMENTS.length}`, 19, C("TEXT_DIM"), x + w / 2, y + 72, { align: "center", baseline: "middle" });

  const listX = x + 20, listY = y + 85, listW = w - 40;
  const itemH = 50, gap = 4;
  const visibleH = h - 130;
  ctx.save();
  ctx.beginPath(); ctx.rect(listX, listY, listW, visibleH); ctx.clip();
  ACHIEVEMENTS.forEach((ach, i) => {
    const by = listY + i * (itemH + gap) - S.scrolls.achievements;
    if (by + itemH < listY || by > listY + visibleH) return;
    const unlocked = S.unlockedAchievements.has(ach.id);
    const isSecret = ach.secret && !unlocked;
    fillRR(listX, by, listW, itemH, 6, unlocked ? C("SPEED_ACTIVE") : C("BG_DARK"));
    strokeRR(listX, by, listW, itemH, 6, unlocked ? C("ACCENT") : C("PANEL_BORDER"), 1);
    const icon = isSecret ? "?" : ach.icon;
    text(icon, 14, unlocked ? C("TEXT_MAIN") : C("TEXT_DIM"), listX + 8, by + (itemH - 14) / 2);
    const nameText = isSecret ? "???" : (ach.name[S.lang] ?? ach.name.en);
    text(nameText, 19, unlocked ? C("TEXT_MAIN") : C("TEXT_DIM"), listX + 45, by + 5);
    const descText = isSecret ? "???" : (ach.desc[S.lang] ?? ach.desc.en);
    text(descText, 14, C("TEXT_DIM"), listX + 45, by + 26);
    if (ach.points > 0 && !isSecret) {
      const pts = `+${ach.points}pts`;
      text(pts, 14, unlocked ? C("GOLD") : C("TEXT_DIM"), listX + listW - 55, by + 16);
    }
  });
  ctx.restore();

  const totalH = ACHIEVEMENTS.length * (itemH + gap);
  if (totalH > visibleH) {
    const t = achScrollbarThumb();
    fillRR(t.x, listY, 6, visibleH, 3, C("SCROLL_BAR_BG"));
    fillRR(t.x, t.y, 6, t.h, 3, C("SCROLL_BAR"));
  }
  text(T("scroll_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 12, { align: "center", baseline: "middle" });
}

/* ============================================================
   段位面板
   ============================================================ */
export const RANK_RECT = { x: 190, y: 160, w: 500, h: 400 };

export function rankMaxScroll() {
  /* 里程碑区域总高 6*28 = 168，可视区自 bar_y+80 至底部-40 */
  const milestonesY = RANK_RECT.y + 90 + 110 + 80;
  const avail = RANK_RECT.y + RANK_RECT.h - 40 - milestonesY;
  return Math.max(0, 6 * 28 - avail);
}

export function drawRankPanel() {
  const { x, y, w, h } = RANK_RECT;
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("rank_title"), 32, C("GOLD"), x + w / 2, y + 28, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(x + 20, y + 55, w - 40, 1);

  const level = S.stats.level || 1;
  const [, progress, need] = xpToLevel(S.stats.xp || 0);
  const tier = getRankTier(level);
  const tierName = T(tier.name_key);

  const iconX = w / 2 - 40, iconY = y + 90;
  fillRR(x + iconX, iconY, 80, 50, 8, rgb(tier.color));
  text(tierName, 19, "rgb(30,30,30)", x + w / 2, iconY + 25, { align: "center", baseline: "middle" });
  text(`Lv.${level}`, 32, C("TEXT_MAIN"), x + w / 2, iconY + 80, { align: "center", baseline: "middle" });

  const barX = x + 40, barY = iconY + 110, barW = w - 80, barH = 20;
  fillRR(barX, barY, barW, barH, 10, C("VOLUME_TRACK"));
  const fillW = Math.floor(barW * progress / Math.max(need, 1));
  if (fillW > 0) fillRR(barX, barY, fillW, barH, 10, rgb(tier.color));
  text(T("rank_progress", progress, need), 14, C("TEXT_DIM"), x + w / 2, barY + 35, { align: "center", baseline: "middle" });

  const streak = S.stats.xp_streak || 0;
  if (streak > 0) {
    text(T("rank_streak", streak), 14, C("GOLD"), x + w / 2, barY + 55, { align: "center", baseline: "middle" });
  }

  /* 段位里程碑（支持滚动，修复原版溢出被截断的问题） */
  const milestones = [
    [5, "rank_bronze"], [10, "rank_silver"], [25, "rank_gold"],
    [35, "rank_platinum"], [45, "rank_diamond"], [999, "rank_master"],
  ];
  const milestonesY = barY + 80;
  const offset = Math.min(S.scrolls.rank, rankMaxScroll());
  milestones.forEach(([lv, nameKey], i) => {
    const by = milestonesY + i * 28 - offset;
    if (by > y + h - 40 || by < milestonesY - 28) return;
    const tierInfo = getRankTier(lv < 999 ? lv : 50);
    const mc = tierInfo.color;
    const reached = level >= lv;
    fillRR(x + 30, by, 20, 20, 4, reached ? rgb(mc) : C("TEXT_DARK"));
    text(`Lv.${lv} ${T(nameKey)}`, 14, reached ? C("TEXT_MAIN") : C("TEXT_DIM"), x + 60, by + 2);
  });
  text(T("scroll_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 12, { align: "center", baseline: "middle" });
}

/* ============================================================
   每日挑战弹窗
   ============================================================ */
export const DAILY_RECT = { x: 230, y: 190, w: 420, h: 340 };

export function drawDailyInfo() {
  const { x, y, w, h } = DAILY_RECT;
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("daily_challenge"), 32, C("GREEN_BTN"), x + w / 2, y + 28, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(x + 20, y + 55, w - 40, 1);

  const dateStr = dailyDateStr();
  const challenge = generateDailyChallenge(dateStr);
  const mod = DAILY_MODIFIERS[challenge.modifier_id];
  text(T("daily_modifier"), 19, C("ACCENT"), x + 30, y + 70);
  text(T(mod.name_key), 24, C("TEXT_MAIN"), x + 30, y + 95);
  text(T(mod.desc_key), 14, C("TEXT_DIM"), x + 30, y + 125);
  const mult = mod.score_mult;
  if (mult > 1.0) text(`Score x${mult}`, 14, C("GOLD"), x + 30, y + 150);

  text(T("daily_rewards"), 19, C("ACCENT"), x + 30, y + 180);
  const rewards = [T("daily_reward_participate"), T("daily_reward_score")];
  if (mult > 1.0) rewards.push(T("daily_reward_modifier"));
  rewards.forEach((item, i) => text(`  - ${item}`, 14, C("TEXT_DIM"), x + 30, y + 205 + i * 20));

  /* 历史最佳（右对齐显示，避免与挑战按钮重叠） */
  const best = S.stats.daily_challenges[dateStr]?.score || 0;
  if (best > 0) {
    const bt = `${T("daily_best")}: ${Math.floor(best / SCORE_SCALE)}`;
    text(bt, 14, C("GOLD"), x + w - 30 - textWidth(bt, 14), y + 70);
  }
  B.dailyPlay.draw();
  text(T("click_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 12, { align: "center", baseline: "middle" });
}

export function drawDailyResult(score, isRecord, xpEarned) {
  const cw = 360, chh = 220;
  const x = Math.floor((W - cw) / 2), y = Math.floor((H - chh) / 2);
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, cw, chh, 16, C("BG_MID"));
  strokeRR(x, y, cw, chh, 16, C("PANEL_BORDER"), 2);
  text(T("daily_result"), 32, C("GREEN_BTN"), x + cw / 2, y + 30, { align: "center", baseline: "middle" });
  text(String(Math.floor(score / SCORE_SCALE)), 54, C("GOLD"), x + cw / 2, y + 80, { align: "center", baseline: "middle" });
  if (isRecord) text(T("new_record"), 19, C("ACCENT"), x + cw / 2, y + 115, { align: "center", baseline: "middle" });
  if (xpEarned > 0) text(T("daily_xp_bonus", xpEarned), 14, C("GOLD"), x + cw / 2, y + 145, { align: "center", baseline: "middle" });
  text(T("click_close"), 12, C("TEXT_DARK"), x + cw / 2, y + chh - 15, { align: "center", baseline: "middle" });
}

/* ============================================================
   AI 难度 / 语言 / 主题 弹窗
   ============================================================ */
export const DIFF_RECT = { x: 240, y: 220, w: 400, h: 280 };

export function difficultyRects() {
  const { x, y, w } = DIFF_RECT;
  const btnW = 160, btnH = 40;
  return AI_DIFFICULTIES.map((_, i) => ({
    x: x + (w - btnW) / 2, y: y + 80 + i * 70, w: btnW, h: btnH,
  }));
}

export function drawDifficultyPopup() {
  const { x, y, w, h } = DIFF_RECT;
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("diff_select"), 32, C("ACCENT"), x + w / 2, y + 30, { align: "center", baseline: "middle" });
  const colors = ["GREEN_BTN", "BLUE_BTN", "RED_BTN"];
  AI_DIFFICULTIES.forEach((diff, i) => {
    const r = difficultyRects()[i];
    fillRR(r.x, r.y, r.w, r.h, 8, C(colors[i]));
    text(diff.name[S.lang] ?? diff.name.en, 19, C("TEXT_MAIN"), r.x + r.w / 2, r.y + r.h / 2, { align: "center", baseline: "middle" });
    text(diff.desc[S.lang] ?? diff.desc.en, 14, C("TEXT_DIM"), x + w / 2, r.y + r.h + 12, { align: "center", baseline: "middle" });
  });
  text(T("click_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 20, { align: "center", baseline: "middle" });
}

export const LANG_RECT_PANEL = { x: 290, y: 240, w: 300, h: 240 };

export function langRects() {
  const { x, y, w } = LANG_RECT_PANEL;
  const btnW = 180, btnH = 38;
  return ["zh", "en", "ja"].map((_, i) => ({
    x: x + (w - btnW) / 2, y: y + 70 + i * 53, w: btnW, h: btnH,
  }));
}

export function drawLangPopup() {
  const { x, y, w, h } = LANG_RECT_PANEL;
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(x, y, w, h, 16, C("BG_MID"));
  strokeRR(x, y, w, h, 16, C("PANEL_BORDER"), 2);
  text(T("lang_select"), 32, C("ACCENT"), x + w / 2, y + 30, { align: "center", baseline: "middle" });
  const names = { zh: "中文", en: "English", ja: "日本語" };
  const colors = ["GREEN_BTN", "BLUE_BTN", "PURPLE"];
  ["zh", "en", "ja"].forEach((lid, i) => {
    const r = langRects()[i];
    const selected = S.lang === lid;
    fillRR(r.x, r.y, r.w, r.h, 8, selected ? C("SPEED_ACTIVE") : C(colors[i]));
    strokeRR(r.x, r.y, r.w, r.h, 8, selected ? C("ACCENT") : C("PANEL_BORDER"), selected ? 2 : 1);
    text(names[lid], 19, C("TEXT_MAIN"), r.x + r.w / 2, r.y + r.h / 2, { align: "center", baseline: "middle" });
  });
  text(T("click_close"), 12, C("TEXT_DARK"), x + w / 2, y + h - 16, { align: "center", baseline: "middle" });
}

export function themePopupRect() {
  const n = THEME_IDS.length;
  const headerH = 65, footerH = 30, itemH = 44, gap = 6;
  const h = headerH + n * (itemH + gap) - gap + footerH + 10;
  const w = 420;
  return { x: Math.floor((W - w) / 2), y: Math.floor((H - h) / 2), w, h, headerH, itemH, gap };
}

export function themeRects() {
  const p = themePopupRect();
  const itemW = 340;
  return THEME_IDS.map((_, i) => ({
    x: p.x + Math.floor((p.w - itemW) / 2),
    y: p.y + p.headerH + i * (p.itemH + p.gap),
    w: itemW, h: p.itemH,
  }));
}

export function drawThemePopup() {
  const p = themePopupRect();
  ctx.fillStyle = rgb(S.colors.OVERLAY);
  ctx.fillRect(0, 0, W, H);
  fillRR(p.x, p.y, p.w, p.h, 16, C("BG_MID"));
  strokeRR(p.x, p.y, p.w, p.h, 16, C("PANEL_BORDER"), 2);
  text(T("theme"), 32, C("ACCENT"), p.x + p.w / 2, p.y + 28, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(p.x + 20, p.y + 55, p.w - 40, 1);

  const swatchKeys = ["ACCENT", "FOOD_MAIN", "GREEN_BTN", "RED_BTN", "BLUE_BTN"];
  THEME_IDS.forEach((tid, i) => {
    const r = themeRects()[i];
    const selected = S.theme === tid;
    fillRR(r.x, r.y, r.w, r.h, 8, selected ? C("SPEED_ACTIVE") : C("BG_DARK"));
    strokeRR(r.x, r.y, r.w, r.h, 8, selected ? C("ACCENT") : C("PANEL_BORDER"), selected ? 2 : 1);
    const pyCen = r.y + r.h / 2;
    swatchKeys.forEach((ck, j) => {
      const c = (tid === "default" ? null : THEMES[tid][ck]) || [128, 128, 128];
      fillRR(r.x + 12 + j * 26, pyCen - 9, 18, 18, 3, rgb(c));
    });
    const theme = THEMES[tid];
    let tname = theme.name[S.lang] ?? theme.name.en;
    const maxW = r.w - 157 - 10;
    if (textWidth(tname, 19) > maxW) {
      while (tname.length > 1 && textWidth(tname + "...", 19) > maxW) tname = tname.slice(0, -1);
      tname += "...";
    }
    text(tname, 19, C("TEXT_MAIN"), r.x + 157, pyCen, { align: "left", baseline: "middle" });
  });
  text(T("click_close"), 12, C("TEXT_DARK"), p.x + p.w / 2, p.y + p.h - 10, { align: "center", baseline: "middle" });
}

/* ============================================================
   启动欢迎界面（展示本地存档的玩家数据）
   ============================================================ */
export function formatDuration(t) {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  if (S.lang === "en") return h > 0 ? `${h}h${m}m${s}s` : `${m}m${s}s`;
  return h > 0 ? `${h}时${m}分${s}秒` : `${m}分${s}秒`;
}

export function drawWelcome() {
  /* 背景纹理（与主菜单一致） */
  for (let i = 0; i < W; i += 60) {
    ctx.fillStyle = rgb(S.colors.BG_LIGHT, 4 / 255);
    ctx.fillRect(i, 0, 1, H);
  }
  /* 标题 */
  text(T("title"), 54, "rgba(0,0,0,0.118)", W / 2 + 2, 94, { align: "center", baseline: "middle" });
  text(T("title"), 54, C("ACCENT"), W / 2, 92, { align: "center", baseline: "middle" });
  text(T("subtitle"), 19, C("TEXT_DIM"), W / 2, 140, { align: "center", baseline: "middle" });
  const msg = S.stats.games_played > 0 ? T("welcome_back") : T("welcome_first");
  text(msg, 24, C("TEXT_MAIN"), W / 2, 180, { align: "center", baseline: "middle" });

  /* 数据面板 */
  const pw = 640, ph = 350;
  const px = Math.floor((W - pw) / 2), py = 212;
  fillRR(px, py, pw, ph, 16, C("BG_MID"));
  strokeRR(px, py, pw, ph, 16, C("PANEL_BORDER"), 2);
  text(T("player_data"), 19, C("ACCENT"), px + pw / 2, py + 28, { align: "center", baseline: "middle" });
  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(px + 30, py + 48, pw - 60, 1);

  /* 段位 / 等级 / XP */
  const [lvl, prog, need] = xpToLevel(S.stats.xp || 0);
  const tier = getRankTier(lvl);
  const streak = S.stats.xp_streak || 0;
  const badgeX = px + 60, badgeY = py + 70;
  fillRR(badgeX, badgeY, 110, 40, 8, rgb(tier.color));
  text(T(tier.name_key), 19, "rgb(30,30,30)", badgeX + 55, badgeY + 20, { align: "center", baseline: "middle" });
  text(`Lv.${lvl}`, 32, C("TEXT_MAIN"), badgeX + 55, badgeY + 66, { align: "center", baseline: "middle" });
  if (streak > 0) {
    text(T("rank_streak", streak), 14, C("GOLD"), badgeX + 55, badgeY + 96, { align: "center", baseline: "middle" });
  }
  const barX = px + pw / 2 - 10, barY = py + 82, barW = pw / 2 - 50, barH = 16;
  fillRR(barX, barY, barW, barH, 8, C("VOLUME_TRACK"));
  const fillW = Math.floor(barW * prog / Math.max(need, 1));
  if (fillW > 0) fillRR(barX, barY, fillW, barH, 8, rgb(tier.color));
  text(T("rank_progress", prog, need), 14, C("TEXT_DIM"), barX + barW / 2, barY + 32, { align: "center", baseline: "middle" });

  ctx.fillStyle = C("PANEL_BORDER");
  ctx.fillRect(px + 30, py + 186, pw - 60, 1);

  /* 统计网格：2 行 × 4 列 */
  const cells = [
    [T("total_score"), String(Math.floor(S.stats.total_score / SCORE_SCALE))],
    [T("games_played"), String(S.stats.games_played)],
    [T("play_time"), formatDuration(S.stats.total_time)],
    [T("achievements"), `${S.unlockedAchievements.size}/${ACHIEVEMENTS.length}`],
    [T("max_endless"), fmtScore(S.stats.endless_high)],
    [T("max_timed"), fmtScore(S.stats.timed_high)],
    [T("vs_record"), `${S.stats.vs_wins || 0} / ${S.stats.vs_losses || 0}`],
    [T("skin_collect"), `${S.unlockedSkins.length}/${SKINS.length}`],
  ];
  const cellW = (pw - 60) / 4, cellH = 62;
  cells.forEach(([lb, vl], i) => {
    const row = Math.floor(i / 4), col = i % 4;
    const cx = px + 30 + col * cellW, cy = py + 200 + row * (cellH + 12);
    fillRR(cx + 4, cy, cellW - 8, cellH, 10, C("PANEL_BG"));
    strokeRR(cx + 4, cy, cellW - 8, cellH, 10, C("PANEL_BORDER"), 1);
    text(lb, 12, C("TEXT_DIM"), cx + cellW / 2, cy + 18, { align: "center", baseline: "middle" });
    text(vl, 19, C("TEXT_MAIN"), cx + cellW / 2, cy + 42, { align: "center", baseline: "middle" });
  });

  /* 底部呼吸提示 */
  const alpha = 0.55 + 0.45 * Math.sin(performance.now() / 400);
  text(T("click_continue"), 16, rgb(S.colors.TEXT_DIM, alpha), W / 2, py + ph - 18, { align: "center", baseline: "middle" });
  text("v8.0", 12, C("TEXT_DARK"), W - 60, H - 18);
}

/* ============================================================
   通知浮层（成就解锁 / 升级）
   ============================================================ */
export function drawToasts() {
  if (S.achToastTimer > 0 && S.achToast) {
    const ach = S.achToast;
    const alpha = Math.min(255, S.achToastTimer * 8) / 255;
    const pw = 380, ph = 70, px = (W - pw) / 2, py = 20;
    ctx.fillStyle = rgb(S.colors.BG_MID, alpha);
    ctx.fillRect(px, py, pw, ph);
    strokeRR(px, py, pw, ph, 8, rgb(S.colors.GOLD, alpha), 2);
    text(ach.icon, 24, rgb(S.colors.TEXT_MAIN, alpha), px + 12, py + 23);
    const nameText = ach.name[S.lang] ?? ach.name.en;
    text(`[ACHIEVEMENT] ${nameText}`, 19, rgb(S.colors.TEXT_MAIN, alpha), px + 45, py + 8);
    text(ach.desc[S.lang] ?? ach.desc.en, 14, rgb(S.colors.TEXT_DIM, alpha), px + 45, py + 28);
    const pts = ach._earnedPoints ?? ach.points ?? 0;
    if (pts > 0) text(`+${pts} pts`, 14, rgb(S.colors.GOLD, alpha), px + 45, py + 46);
  }
  if (S.levelUpToastTimer > 0 && S.levelUpToast) {
    const lvl = S.levelUpToast;
    const alpha = Math.min(255, S.levelUpToastTimer * 8) / 255;
    const pw = 200, ph = 50, px = W - pw - 15, py = 120;
    const tier = getRankTier(lvl);
    ctx.fillStyle = rgb(S.colors.BG_MID, alpha);
    ctx.fillRect(px, py, pw, ph);
    strokeRR(px, py, pw, ph, 8, rgb(S.colors.GOLD, alpha), 2);
    text("LVL", 19, rgb(tier.color, alpha), px + 8, py + 15);
    text(T("rank_level_up", lvl), 14, rgb(S.colors.TEXT_MAIN, alpha), px + 45, py + 8);
    text(T(tier.name_key), 12, rgb(tier.color, alpha), px + 45, py + 28);
  }
}
