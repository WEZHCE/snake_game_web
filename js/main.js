/* ============================================================
   贪吃蛇 v8.0 Web —— 主控：状态机 / 输入 / 主循环 / 结算
   ============================================================ */
import {
  W, H, SCORE_SCALE, SPEED_PRESETS, SKINS, ACHIEVEMENTS,
  DAILY_MODIFIERS, THEME_IDS,
} from "./data.js";
import {
  S, T, ST, applyTheme, getRedeemable, awardXp,
  initState, EDGE_DEATH, EDGE_MODE_COLORS,
} from "./state.js";
import { saveStats } from "./save.js";
import { music } from "./audio.js";
import { LANG } from "./i18n.js";
import {
  SnakeGame, dailyDateStr, generateDailyChallenge, calcDailyXp,
} from "./game.js";
import { VSGame } from "./vs.js";
import {
  initUi, initButtons, updateMenuHover, B, applyCanvasTransform, clearCanvas,
  drawWelcome,
  drawMenu, drawPlaying, drawVsPlaying, drawVsOver, drawGameOver,
  drawShopPopup, drawSkinPopup, drawMusicPopup, drawAchievements,
  drawScrollPopup, getStatLines, getPopupGeometry,
  drawRankPanel, drawDailyInfo, drawDailyResult,
  drawDifficultyPopup, drawLangPopup, drawThemePopup, drawToasts,
  SKIN_RECT, skinScrollbarThumb, skinIndexAt, skinMaxScroll,
  MUSIC_RECT, musicScrollbarThumb,
  ACH_RECT, achScrollbarThumb, achMaxScroll,
  DIFF_RECT, difficultyRects, LANG_RECT_PANEL, langRects, themeRects, themePopupRect,
  rankMaxScroll, DAILY_RECT,
} from "./ui.js";

/* ---------- 实例 ---------- */
let game = new SnakeGame();
let dailyGame = null, dailyMod = null;
let vsGame = null;
let dailyResultData = null;

/* ---------- 计时 ---------- */
let moveTimer = 0, vsMoveTimer = 0, dailyMoveTimer = 0;
let lastTs = 0;
const mouse = [0, 0];

/* ---------- 滚动条拖拽状态 ---------- */
let drag = null; // {apply(v), max, barY, barH, thumbH, clickOffset}

/* ---------- 音乐启动守卫（浏览器需用户手势后才能出声） ---------- */
let musicStarted = false;
function ensureMusic() {
  if (musicStarted) return;
  musicStarted = true;
  music.setVolume(S.musicVolume);
  music.play(0);
  S.musicPlaying = true;
}

/* ============================================================
   成就系统
   ============================================================ */
function unlockAchievement(id) {
  if (S.unlockedAchievements.has(id)) return false;
  S.unlockedAchievements.add(id);
  S.stats.unlocked_achievements = [...S.unlockedAchievements];
  const ach = ACHIEVEMENTS.find((a) => a.id === id);
  if (ach) {
    if (ach.points > 0) {
      S.stats.total_score += ach.points * SCORE_SCALE;
      ach._earnedPoints = ach.points;
    }
    S.achToast = ach;
    S.achToastTimer = 180;
  }
  saveStats(S.stats);
  return true;
}

function checkAchievements(c) {
  for (const ach of ACHIEVEMENTS) {
    if (S.unlockedAchievements.has(ach.id)) continue;
    const cond = ach.cond;
    let ok = false;
    switch (cond.type) {
      case "games_played": ok = (c.games_played || 0) >= cond.value; break;
      case "game_score": ok = (c.game_score || 0) >= cond.value; break;
      case "snake_length": ok = (c.snake_length || 0) >= cond.value; break;
      case "total_food": ok = (c.total_food || 0) >= cond.value; break;
      case "total_time": ok = (c.total_time || 0) >= cond.value; break;
      case "vs_wins": ok = (c.vs_wins || 0) >= cond.value; break;
      case "vs_hell_win": ok = !!c.vs_hell_win; break;
      case "speeds_played": ok = (c.speeds_played ? c.speeds_played.size : 0) >= cond.value; break;
      case "themes_used": ok = (c.themes_used ? c.themes_used.size : 0) >= cond.value; break;
      case "fast_death": ok = (c.game_duration ?? 999) <= cond.value; break;
      case "wall_slides": ok = (c.wall_slides || 0) >= cond.value; break;
      case "corners_visited": ok = (c.corners_visited ? c.corners_visited.size : 0) >= cond.value; break;
      case "skin_game_complete": ok = c.skin_id === cond.value && !!c.game_completed; break;
    }
    if (ok) unlockAchievement(ach.id);
  }
}

/* ============================================================
   单人结算（修复：自然死亡与手动结束走同一套结算）
   ============================================================ */
function settleSingleGame() {
  S.currentScore = game.score;
  /* 修复：原版在最高分更新之后才比较，导致每局都显示"新纪录" */
  const prevHigh = game.mode === "endless" ? S.stats.endless_high : S.stats.timed_high;
  S.lastRecord = S.currentScore > prevHigh && S.currentScore > 0;
  S.stats.total_score += S.currentScore;
  S.stats.games_played += 1;
  S.stats.total_time += Math.floor(S.sessionTime);
  if (game.mode === "endless") {
    if (S.currentScore > S.stats.endless_high) S.stats.endless_high = S.currentScore;
  } else if (S.currentScore > S.stats.timed_high) {
    S.stats.timed_high = S.currentScore;
  }
  const speeds = new Set(S.stats.speeds_played); speeds.add(S.speedIndex);
  S.stats.speeds_played = [...speeds];
  const themes = new Set(S.stats.themes_used); themes.add(S.theme);
  S.stats.themes_used = [...themes];
  S.stats.total_food_eaten = (S.stats.total_food_eaten || 0) + game.foodEaten;
  saveStats(S.stats);
  checkAchievements({
    games_played: S.stats.games_played,
    game_score: S.currentScore,
    snake_length: game.snake.length,
    total_food: S.stats.total_food_eaten,
    total_time: S.stats.total_time,
    vs_wins: S.stats.vs_wins || 0,
    speeds_played: speeds,
    themes_used: themes,
    game_duration: S.sessionTime,
    wall_slides: game.wallSlideCount,
    corners_visited: game.cornersVisited,
    skin_id: S.skinId,
    game_completed: true, /* 修复：原版恒为 false，导致熵减蛇成就无法解锁 */
  });
  awardXp(50 + game.foodEaten * 5);
  S.stats.xp_streak = (S.stats.xp_streak || 0) + 1;
  saveStats(S.stats);
  S.flashAlpha = 200;
}

function startSingleGame() {
  game.reset();
  game.mode = S.gameMode;
  S.state = ST.PLAYING;
  S.paused = false;
  S.sessionTime = 0;
  moveTimer = 0;
}

/* ============================================================
   每日挑战
   ============================================================ */
function startDaily() {
  const challenge = generateDailyChallenge(dailyDateStr());
  dailyMod = DAILY_MODIFIERS[challenge.modifier_id];
  dailyGame = new SnakeGame({
    modifier: dailyMod,
    forcedSkinId: challenge.skin_lock_id,
    mazeWalls: challenge.maze_walls,
  });
  S.state = ST.DAILY_PLAYING;
  S.paused = false;
  S.sessionTime = 0;
  dailyMoveTimer = 0;
}

function finishDaily() {
  const dateStr = dailyDateStr();
  const prevBest = S.stats.daily_challenges[dateStr]?.score || 0;
  const isRecord = dailyGame.score > prevBest && dailyGame.score > 0;
  if (isRecord) S.stats.daily_challenges[dateStr] = { score: dailyGame.score };
  S.stats.total_score += dailyGame.score;
  S.stats.games_played += 1;
  S.stats.total_time += Math.floor(S.sessionTime);
  const themes = new Set(S.stats.themes_used); themes.add(S.theme);
  S.stats.themes_used = [...themes];
  S.stats.total_food_eaten = (S.stats.total_food_eaten || 0) + dailyGame.foodEaten;
  saveStats(S.stats);
  checkAchievements({
    games_played: S.stats.games_played,
    game_score: dailyGame.score,
    snake_length: dailyGame.snake.length,
    total_food: S.stats.total_food_eaten,
    total_time: S.stats.total_time,
    vs_wins: S.stats.vs_wins || 0,
    speeds_played: new Set(S.stats.speeds_played),
    themes_used: themes,
    game_duration: S.sessionTime,
    wall_slides: dailyGame.wallSlideCount,
    corners_visited: dailyGame.cornersVisited,
    skin_id: dailyGame.forcedSkinId ?? S.skinId,
    game_completed: true,
  });
  const xpEarned = calcDailyXp(dailyGame.score, dailyMod.id);
  awardXp(xpEarned);
  S.stats.xp_streak = (S.stats.xp_streak || 0) + 1;
  saveStats(S.stats);
  dailyResultData = { score: dailyGame.score, isRecord, xpEarned };
  S.state = ST.DAILY_OVER;
}

/* ============================================================
   人机对战
   ============================================================ */
function startVs(difficulty) {
  vsGame = new VSGame(difficulty);
  S.aiDifficulty = difficulty;
  S.sessionTime = 0; /* 修复：开局重置计时时长 */
  vsMoveTimer = 0;
  S.vsPaused = false;
  S.state = ST.VS_PLAYING;
}

function finishVs() {
  S.currentScore = vsGame.playerScore * SCORE_SCALE;
  S.stats.total_score += S.currentScore;
  S.stats.games_played += 1;
  S.stats.total_time += Math.floor(S.sessionTime);
  S.stats.vs_wins = (S.stats.vs_wins || 0) + (vsGame.result === "win" ? 1 : 0);
  S.stats.vs_losses = (S.stats.vs_losses || 0) + (vsGame.result === "lose" ? 1 : 0);
  const themes = new Set(S.stats.themes_used); themes.add(S.theme);
  S.stats.themes_used = [...themes];
  saveStats(S.stats);
  checkAchievements({
    games_played: S.stats.games_played,
    game_score: S.currentScore,
    snake_length: vsGame.player ? vsGame.player.length : 0,
    total_food: S.stats.total_food_eaten || 0,
    total_time: S.stats.total_time,
    vs_wins: S.stats.vs_wins,
    vs_hell_win: vsGame.result === "win" && vsGame.aiDifficulty === 2,
    themes_used: themes,
  });
  if (vsGame.result === "win") {
    awardXp(vsGame.aiDifficulty === 2 ? 80 : 40);
    S.stats.xp_streak = (S.stats.xp_streak || 0) + 1;
  } else {
    S.stats.xp_streak = 0; /* 修复：失败/平局应重置连胜 */
  }
  saveStats(S.stats);
  S.state = ST.VS_OVER;
}

/* ============================================================
   积分商店
   ============================================================ */
function shopMessage(msg, frames) {
  S.shopMsg = msg;
  S.shopMsgTimer = frames;
}

function exchange(costRaw, points) {
  const r = getRedeemable();
  if (r >= costRaw) {
    S.stats.redeemed_points += points;
    saveStats(S.stats);
    shopMessage(T("exchange_success", costRaw / SCORE_SCALE, points), 180);
  } else {
    shopMessage(T("exchange_fail", costRaw / SCORE_SCALE), 120);
  }
}

/* ============================================================
   弹窗滚动几何
   ============================================================ */
function popupScrollGeom(id, lineCount) {
  const { x, y, w, h } = getPopupGeometry(id);
  const visibleH = h - 90;
  const contentH = lineCount * 20 + 20;
  const max = Math.max(0, contentH - visibleH);
  const th = Math.max(20, Math.floor(visibleH * (visibleH / contentH)));
  return { barX: x + w - 14, barY: y + 66, barH: visibleH, th, max };
}

function startDrag(geom, my, apply) {
  drag = {
    apply,
    max: geom.max,
    barY: geom.barY,
    barH: geom.barH,
    thumbH: geom.th,
    clickOffset: my - geom.thumbY,
  };
}

function moveDrag(my) {
  if (!drag) return;
  const target = Math.max(0, Math.min(my - drag.barY - drag.clickOffset, drag.barH - drag.thumbH));
  if (drag.barH - drag.thumbH > 0 && drag.max > 0) {
    drag.apply(Math.floor(target * drag.max / (drag.barH - drag.thumbH)));
  }
}

/* ============================================================
   输入处理
   ============================================================ */
function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left) * W / rect.width,
    (e.clientY - rect.top) * H / rect.height,
  ];
}

function closePopup() {
  S.state = ST.MENU;
  S.popupType = null;
}

function inRect(mx, my, r) {
  return mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h;
}

function onPointerDown(e) {
  ensureMusic();
  const [mx, my] = canvasPos(e);
  mouse[0] = mx; mouse[1] = my;

  switch (S.state) {
    case ST.WELCOME:
      /* 点击任意位置进入主菜单 */
      S.state = ST.MENU;
      break;
    case ST.MENU: handleMenuClick(mx, my); break;
    case ST.DIFFICULTY_SELECT: {
      const rects = difficultyRects();
      let clicked = false;
      rects.forEach((r, i) => {
        if (inRect(mx, my, r)) { startVs(i); clicked = true; }
      });
      if (!clicked && !inRect(mx, my, DIFF_RECT)) S.state = ST.MENU;
      break;
    }
    case ST.LANG_SELECT: {
      const ids = ["zh", "en", "ja"];
      let clicked = false;
      langRects().forEach((r, i) => {
        if (inRect(mx, my, r)) { S.lang = ids[i]; clicked = true; }
      });
      if (clicked || !inRect(mx, my, LANG_RECT_PANEL)) S.state = ST.MENU;
      break;
    }
    case ST.THEME_SELECT: {
      let clicked = false;
      themeRects().forEach((r, i) => {
        if (inRect(mx, my, r)) { applyTheme(THEME_IDS[i]); clicked = true; }
      });
      if (clicked || !inRect(mx, my, themePopupRect())) S.state = ST.MENU;
      break;
    }
    case ST.RANK_PANEL: {
      if (!inRect(mx, my, { x: 190, y: 160, w: 500, h: 400 })) S.state = ST.MENU;
      break;
    }
    case ST.POPUP: handlePopupClick(mx, my); break;
    case ST.PLAYING: case ST.PAUSED:
      if (B.pause.hit(mx, my)) { S.paused = !S.paused; S.state = S.paused ? ST.PAUSED : ST.PLAYING; }
      else if (B.end.hit(mx, my)) {
        settleSingleGame();
        S.state = ST.GAME_OVER;
        S.paused = false;
      }
      break;
    case ST.GAME_OVER:
      if (B.goRestart.hit(mx, my)) startSingleGame();
      else if (B.goMenu.hit(mx, my)) S.state = ST.MENU;
      break;
    case ST.VS_OVER:
      if (B.vsRestart.hit(mx, my)) startVs(S.aiDifficulty);
      else if (B.vsMenu.hit(mx, my)) S.state = ST.MENU;
      break;
    case ST.VS_PLAYING: case ST.VS_PAUSED: break;
    case ST.DAILY_PLAYING: case ST.DAILY_PAUSED:
      if (B.pause.hit(mx, my)) {
        S.paused = !S.paused;
        S.state = S.paused ? ST.DAILY_PAUSED : ST.DAILY_PLAYING;
      } else if (B.end.hit(mx, my)) {
        finishDaily();
      }
      break;
    case ST.DAILY_OVER: S.state = ST.MENU; break;
  }
}

function handleMenuClick(mx, my) {
  for (const b of B.speedBtns) {
    if (b.hit(mx, my)) {
      S.speedIndex = b.speedIndex;
      B.speedBtns.forEach((x) => { x.active = false; });
      b.active = true;
      return;
    }
  }
  if (B.start.hit(mx, my)) { startSingleGame(); return; }
  if (B.vs.hit(mx, my)) { S.state = ST.DIFFICULTY_SELECT; return; }
  if (B.mode.hit(mx, my)) {
    S.gameMode = S.gameMode === "endless" ? "timed" : "endless";
    B.mode.activeColor = S.gameMode === "timed" ? "RED_BTN" : "BLUE_BTN";
    return;
  }
  if (B.edge.hit(mx, my)) {
    S.edgeMode = (S.edgeMode + 1) % 3;
    B.edge.active = S.edgeMode !== EDGE_DEATH;
    B.edge.activeColor = EDGE_MODE_COLORS[S.edgeMode];
    return;
  }
  if (B.shop.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "shop"; S.shopMsg = ""; S.shopMsgTimer = 0; return; }
  if (B.skin.hit(mx, my)) {
    S.state = ST.POPUP; S.popupType = "skin";
    S.scrolls.skin = 0; S.skinConfirm = false; S.skinConfirmId = null;
    return;
  }
  if (B.effects.hit(mx, my)) {
    S.effectsEnabled = !S.effectsEnabled;
    B.effects.active = S.effectsEnabled;
    S.stats.effects_enabled = S.effectsEnabled;
    saveStats(S.stats);
    return;
  }
  if (B.lang.hit(mx, my)) { S.state = ST.LANG_SELECT; return; }
  if (B.theme.hit(mx, my)) { S.state = ST.THEME_SELECT; return; }
  if (B.music.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "music"; S.scrolls.musicList = 0; return; }
  if (B.help.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "help"; S.scrolls.help = 0; return; }
  if (B.stats.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "stats"; S.scrolls.stats = 0; return; }
  if (B.update.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "update"; S.scrolls.update = 0; return; }
  if (B.dev.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "dev"; S.scrolls.dev = 0; return; }
  if (B.ach.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "achievements"; S.scrolls.achievements = 0; return; }
  if (B.rank.hit(mx, my)) { S.state = ST.RANK_PANEL; S.scrolls.rank = 0; return; }
  if (B.daily.hit(mx, my)) { S.state = ST.POPUP; S.popupType = "daily_info"; return; }
}

function handlePopupClick(mx, my) {
  const type = S.popupType;

  if (type === "shop") {
    if (!inRect(mx, my, { x: 190, y: 150, w: 500, h: 420 })) { closePopup(); return; }
    if (B.eall.hit(mx, my)) {
      const r = getRedeemable();
      if (r >= 2 * SCORE_SCALE) {
        const g = Math.floor(r / (2 * SCORE_SCALE));
        S.stats.redeemed_points += g;
        saveStats(S.stats);
        shopMessage(T("exchange_success", g * 2, g), 180);
      } else shopMessage(T("exchange_fail", 2), 120);
    } else if (B.e50.hit(mx, my)) exchange(100 * SCORE_SCALE, 50);
    else if (B.e10.hit(mx, my)) exchange(20 * SCORE_SCALE, 10);
    else if (B.eb.hit(mx, my)) exchange(2 * SCORE_SCALE, 1);
    return;
  }

  if (type === "skin") {
    /* 购买确认弹窗优先 */
    if (S.skinConfirm && S.skinConfirmId != null) {
      if (B.skinYes.hit(mx, my)) {
        const sk = SKINS[S.skinConfirmId];
        const r = getRedeemable();
        if (r >= sk.price * SCORE_SCALE) {
          S.stats.redeemed_points += sk.price;
          if (!S.unlockedSkins.includes(sk.id)) S.unlockedSkins.push(sk.id);
          S.stats.unlocked_skins = S.unlockedSkins;
          saveStats(S.stats);
        }
        S.skinConfirm = false; S.skinConfirmId = null;
        return;
      }
      if (B.skinNo.hit(mx, my)) { S.skinConfirm = false; S.skinConfirmId = null; return; }
    }
    if (!inRect(mx, my, SKIN_RECT)) { closePopup(); return; }
    /* 滚动条拖拽 */
    const thumb = skinScrollbarThumb();
    if (skinMaxScroll() > 0 && inRect(mx, my, thumb)) {
      startDrag({ barY: thumb.by, barH: thumb.bh, th: thumb.th, max: thumb.max, thumbY: thumb.y },
        my, (v) => { S.scrolls.skin = v; });
      return;
    }
    /* 条目点击（修复：与绘制几何一致，原版判定高度错误） */
    const idx = skinIndexAt(my);
    if (idx >= 0) {
      const sk = SKINS[idx];
      if (S.unlockedSkins.includes(sk.id)) {
        S.skinId = sk.id;
        S.stats.current_skin = S.skinId;
        saveStats(S.stats);
      } else if (sk.price >= 0 && getRedeemable() >= sk.price * SCORE_SCALE) {
        S.skinConfirm = true;
        S.skinConfirmId = sk.id;
      }
    }
    return;
  }

  if (type === "music") {
    if (!inRect(mx, my, MUSIC_RECT)) { closePopup(); return; }
    if (B.mpPrev.hit(mx, my)) { music.prev(); S.musicPlaying = true; return; }
    if (B.mpPlay.hit(mx, my)) {
      if (S.musicPlaying) { music.pause(); S.musicPlaying = false; }
      else { music.resume(); S.musicPlaying = true; }
      return;
    }
    if (B.mpNext.hit(mx, my)) { music.next(); S.musicPlaying = true; return; }
    /* 音量条 */
    const sx = MUSIC_RECT.x + 80, sy = MUSIC_RECT.y + 200, sw = 320;
    if (inRect(mx, my, { x: sx + Math.floor(sw * S.musicVolume) - 6, y: sy - 4, w: 12, h: 18 }) ||
        inRect(mx, my, { x: sx, y: sy, w: sw, h: 10 })) {
      drag = {
        apply: (v) => { S.musicVolume = v; music.setVolume(v); },
        volume: true, sw, sx,
      };
      const rel = Math.max(0, Math.min(mx - sx, sw));
      S.musicVolume = rel / sw;
      music.setVolume(S.musicVolume);
      return;
    }
    /* 曲目列表点击 */
    const ly = MUSIC_RECT.y + 265, ih = 22;
    if (my >= ly && my < ly + 120 && mx >= MUSIC_RECT.x + 30 && mx < MUSIC_RECT.x + MUSIC_RECT.w - 50) {
      const idx = Math.floor((my - ly + S.scrolls.musicList) / ih);
      if (idx >= 0 && idx < music.total) { music.play(idx); S.musicPlaying = true; }
    }
    return;
  }

  if (type === "achievements") {
    const thumb = achScrollbarThumb();
    if (achMaxScroll() > 0 && inRect(mx, my, thumb)) {
      startDrag({ barY: thumb.by, barH: thumb.bh, th: thumb.th, max: thumb.max, thumbY: thumb.y },
        my, (v) => { S.scrolls.achievements = v; });
      return;
    }
    if (!inRect(mx, my, ACH_RECT)) closePopup();
    return;
  }

  if (type === "daily_info") {
    if (B.dailyPlay.hit(mx, my)) { startDaily(); return; }
    if (!inRect(mx, my, DAILY_RECT)) closePopup();
    return;
  }

  /* 帮助 / 开发者 / 更新 / 统计 */
  const lines = popupLines(type);
  if (!lines) { closePopup(); return; }
  const geom = popupScrollGeom(type, lines.length);
  if (geom.max > 0 && mx >= geom.barX && mx <= geom.barX + 8 &&
      my >= geom.barY + Math.floor((Math.min(S.scrolls[type], geom.max) / geom.max) * (geom.barH - geom.th)) &&
      my <= geom.barY + Math.floor((Math.min(S.scrolls[type], geom.max) / geom.max) * (geom.barH - geom.th)) + geom.th) {
    startDrag({ ...geom, thumbY: geom.barY + Math.floor((Math.min(S.scrolls[type], geom.max) / geom.max) * (geom.barH - geom.th)) }, my,
      (v) => { S.scrolls[type] = v; });
    return;
  }
  const r = getPopupGeometry(type);
  if (!inRect(mx, my, r)) closePopup();
}

function popupLines(type) {
  if (type === "help") return LANG[S.lang].help_content;
  if (type === "dev") return LANG[S.lang].dev_content;
  if (type === "update") return LANG[S.lang].update_content;
  if (type === "stats") return getStatLines();
  return null;
}

/* ---------- 指针移动 ---------- */
function onPointerMove(e) {
  const [mx, my] = canvasPos(e);
  mouse[0] = mx; mouse[1] = my;
  if (drag) {
    if (drag.volume) {
      const rel = Math.max(0, Math.min(mx - drag.sx, drag.sw));
      drag.apply(rel / drag.sw);
    } else {
      moveDrag(my);
    }
    return;
  }
}

function onPointerUp() {
  drag = null;
}

/* ---------- 滚轮 ---------- */
function onWheel(e) {
  if (S.state !== ST.POPUP && S.state !== ST.RANK_PANEL) return;
  const d = e.deltaY > 0 ? 1 : -1;
  const step = 40;
  const clamp = (v, max) => Math.max(0, Math.min(v, max));
  if (S.state === ST.RANK_PANEL) {
    S.scrolls.rank = clamp(S.scrolls.rank + d * step, rankMaxScroll());
    e.preventDefault();
    return;
  }
  switch (S.popupType) {
    case "skin": S.scrolls.skin = clamp(S.scrolls.skin + d * step, skinMaxScroll()); break;
    case "achievements": S.scrolls.achievements = clamp(S.scrolls.achievements + d * step, achMaxScroll()); break;
    case "music": {
      const max = musicScrollbarThumb().max;
      S.scrolls.musicList = clamp(S.scrolls.musicList + d * step, max);
      break;
    }
    case "help": case "dev": case "update": case "stats": {
      const geom = popupScrollGeom(S.popupType, popupLines(S.popupType).length);
      S.scrolls[S.popupType] = clamp(S.scrolls[S.popupType] + d * 30, geom.max);
      break;
    }
    default: return;
  }
  e.preventDefault();
}

/* ---------- 键盘 ---------- */
function onKeyDown(e) {
  ensureMusic();
  const key = e.key;

  /* 欢迎界面：任意键进入主菜单 */
  if (S.state === ST.WELCOME) {
    S.state = ST.MENU;
    e.preventDefault();
    return;
  }

  const dirKeys = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };

  if (S.state === ST.MENU) {
    if (key === "+" || key === "=") { S.musicVolume = Math.min(1, S.musicVolume + 0.1); music.setVolume(S.musicVolume); }
    else if (key === "-") { S.musicVolume = Math.max(0, S.musicVolume - 0.1); music.setVolume(S.musicVolume); }
    return;
  }

  if (S.state === ST.PLAYING || S.state === ST.PAUSED) {
    if (key === "Escape") { S.state = ST.MENU; S.paused = false; }
    else if (key === " ") {
      /* 双头蛇皮肤：空格反转方向（原版未实现的补全）；P 键暂停 */
      const skin = SKINS[S.skinId];
      if (S.effectsEnabled && skin.special.type === "reverse_direction") {
        game.reverseSnake();
      } else {
        S.paused = !S.paused;
        S.state = S.paused ? ST.PAUSED : ST.PLAYING;
      }
    } else if (key === "p" || key === "P") {
      S.paused = !S.paused;
      S.state = S.paused ? ST.PAUSED : ST.PLAYING;
    } else if (!S.paused && dirKeys[key]) {
      game.changeDirection(dirKeys[key]);
    } else return;
    e.preventDefault();
    return;
  }

  if (S.state === ST.DAILY_PLAYING || S.state === ST.DAILY_PAUSED) {
    if (key === "Escape") { S.state = ST.MENU; S.paused = false; }
    else if (key === " " || key === "p" || key === "P") {
      S.paused = !S.paused;
      S.state = S.paused ? ST.DAILY_PAUSED : ST.DAILY_PLAYING;
    } else if (!S.paused && dirKeys[key]) {
      dailyGame.changeDirection(dirKeys[key]);
    } else return;
    e.preventDefault();
    return;
  }

  if (S.state === ST.VS_PLAYING || S.state === ST.VS_PAUSED) {
    if (key === "Escape") S.state = ST.MENU;
    else if (key === " ") {
      S.vsPaused = !S.vsPaused;
      S.state = S.vsPaused ? ST.VS_PAUSED : ST.VS_PLAYING;
    } else if (!S.vsPaused && dirKeys[key]) {
      const nd = dirKeys[key];
      const cur = vsGame.playerDirection;
      /* 防止 180 度掉头 */
      if (cur[0] + nd[0] !== 0 || cur[1] + nd[1] !== 0) vsGame.playerDirection = nd;
    } else return;
    e.preventDefault();
    return;
  }
}

/* ============================================================
   主循环
   ============================================================ */
function update(dt, dtSec) {
  const frameScale = dt / (1000 / 60);

  if (S.flashAlpha > 0) {
    S.flashAlpha = Math.max(0, S.flashAlpha - 15 * frameScale);
  }
  if (S.achToastTimer > 0) S.achToastTimer -= frameScale;
  if (S.levelUpToastTimer > 0) S.levelUpToastTimer -= frameScale;
  if (S.shopMsgTimer > 0) S.shopMsgTimer -= frameScale;

  /* 烈艳红解锁检查 */
  if (!S.unlockedSkins.includes(1) && S.stats.total_time >= 180) {
    S.unlockedSkins.push(1);
    S.stats.unlocked_skins = S.unlockedSkins;
    saveStats(S.stats);
  }

  /* 单人逻辑 */
  if (S.state === ST.PLAYING && !S.paused) {
    let speedMult = 1.0;
    const skin = SKINS[S.skinId];
    if (S.effectsEnabled && skin.special.type === "speed_boost") speedMult = skin.special.params;
    moveTimer += dt * speedMult;
    const interval = 1000 / SPEED_PRESETS[S.speedIndex].fps;
    if (moveTimer >= interval) {
      moveTimer -= interval;
      const over = game.update(dtSec * (interval / 16.67));
      S.sessionTime += interval / 1000;
      if (over) {
        settleSingleGame();
        S.state = ST.GAME_OVER;
      }
    }
  }

  /* 每日挑战逻辑 */
  if (S.state === ST.DAILY_PLAYING && !S.paused) {
    dailyMoveTimer += dt;
    const interval = 1000 / dailyMod.speed_fps;
    if (dailyMoveTimer >= interval) {
      dailyMoveTimer -= interval;
      const over = dailyGame.update(dtSec * (interval / 16.67));
      S.sessionTime += interval / 1000;
      if (over) finishDaily();
    }
  }

  /* 人机对战逻辑 */
  if (S.state === ST.VS_PLAYING && !S.vsPaused) {
    let speedMult = 1.0;
    const skin = SKINS[S.skinId];
    if (S.effectsEnabled && skin.special.type === "speed_boost") speedMult = skin.special.params;
    vsMoveTimer += dt;
    const interval = 1000 / Math.max(1, Math.round(8 * speedMult));
    if (vsMoveTimer >= interval) {
      vsMoveTimer -= interval;
      S.sessionTime += interval / 1000;
      vsGame.update();
      if (vsGame.vsGameOver) finishVs();
    }
  }

  /* 按钮悬停 */
  switch (S.state) {
    case ST.MENU: updateMenuHover(mouse); break;
    case ST.PLAYING: case ST.PAUSED:
    case ST.DAILY_PLAYING: case ST.DAILY_PAUSED:
      B.pause.hovered = B.pause.hit(...mouse);
      B.end.hovered = B.end.hit(...mouse);
      break;
    case ST.GAME_OVER:
      B.goRestart.hovered = B.goRestart.hit(...mouse);
      B.goMenu.hovered = B.goMenu.hit(...mouse);
      break;
    case ST.VS_OVER:
      B.vsRestart.hovered = B.vsRestart.hit(...mouse);
      B.vsMenu.hovered = B.vsMenu.hit(...mouse);
      break;
    case ST.POPUP:
      if (S.popupType === "shop") {
        [B.eb, B.e10, B.e50, B.eall].forEach((b) => { b.hovered = b.hit(...mouse); });
      } else if (S.popupType === "music") {
        [B.mpPrev, B.mpPlay, B.mpNext].forEach((b) => { b.hovered = b.hit(...mouse); });
      } else if (S.popupType === "skin" && S.skinConfirm) {
        B.skinYes.hovered = B.skinYes.hit(...mouse);
        B.skinNo.hovered = B.skinNo.hit(...mouse);
      } else if (S.popupType === "daily_info") {
        B.dailyPlay.hovered = B.dailyPlay.hit(...mouse);
      }
      break;
  }
}

function render() {
  clearCanvas("BG_DARK");

  switch (S.state) {
    case ST.WELCOME: drawWelcome(); break;
    case ST.MENU: drawMenu(); break;
    case ST.DIFFICULTY_SELECT: drawMenu(); drawDifficultyPopup(); break;
    case ST.LANG_SELECT: drawMenu(); drawLangPopup(); break;
    case ST.THEME_SELECT: drawMenu(); drawThemePopup(); break;
    case ST.VS_PLAYING: case ST.VS_PAUSED: drawVsPlaying(vsGame, S.vsPaused); break;
    case ST.VS_OVER: drawVsOver(vsGame); break;
    case ST.PLAYING: case ST.PAUSED: drawPlaying(game, S.paused); break;
    case ST.GAME_OVER: drawGameOver(game); break;
    case ST.RANK_PANEL: drawMenu(); drawRankPanel(); break;
    case ST.DAILY_PLAYING: case ST.DAILY_PAUSED:
      drawPlaying(dailyGame, S.paused, true);
      break;
    case ST.DAILY_OVER:
      drawPlaying(dailyGame, false, true);
      drawDailyResult(dailyResultData.score, dailyResultData.isRecord, dailyResultData.xpEarned);
      break;
    case ST.POPUP: {
      drawMenu();
      switch (S.popupType) {
        case "shop": drawShopPopup(); break;
        case "skin": drawSkinPopup(); break;
        case "music": drawMusicPopup(); break;
        case "help": drawScrollPopup(T("help_title"), LANG[S.lang].help_content, "help"); break;
        case "dev": drawScrollPopup(T("dev_title"), LANG[S.lang].dev_content, "dev"); break;
        case "update": drawScrollPopup(T("update_title"), LANG[S.lang].update_content, "update"); break;
        case "stats": drawScrollPopup(T("stats_title"), getStatLines(), "stats"); break;
        case "achievements": drawAchievements(); break;
        case "daily_info": drawDailyInfo(); break;
      }
      break;
    }
  }
  drawToasts();
}

function loop(ts) {
  const dt = Math.min(50, ts - lastTs || 16.67);
  lastTs = ts;
  const dtSec = dt / 1000;
  update(dt, dtSec);
  render();
  requestAnimationFrame(loop);
}

/* ============================================================
   启动
   ============================================================ */
const canvas = document.getElementById("game");
initUi(canvas);
initButtons();
initState();
B.effects.active = S.effectsEnabled;
B.speedBtns.forEach((b, i) => { b.active = i === S.speedIndex; });

function resize() {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1)) * (rect.width / W);
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  applyCanvasTransform(scale);
}
window.addEventListener("resize", resize);
/* 优化：监听画布容器尺寸变化（窗口缩放 / 设备像素比变化 / 旋转屏幕），
   确保任意尺寸下画面都按 880×720 逻辑坐标等比清晰渲染 */
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(resize).observe(canvas);
}
resize();

canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("keydown", onKeyDown);

requestAnimationFrame(loop);
