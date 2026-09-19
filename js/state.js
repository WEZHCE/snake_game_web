/* ============================================================
   贪吃蛇 v8.0 Web —— 全局运行时状态
   对应原版 main() 内的大量 nonlocal 变量，集中到单一状态对象
   ============================================================ */
import { LANG } from "./i18n.js";
import { DEFAULT_COLORS, THEMES, SKINS, SCORE_SCALE } from "./data.js";
import { loadStats } from "./save.js";

/* ---------- 文本 ---------- */
export function T(key, ...args) {
  let text = (LANG[S.lang] && LANG[S.lang][key]) || key;
  for (const a of args) text = text.replace("{}", String(a));
  return text;
}

/* ---------- 状态机常量 ---------- */
export const ST = {
  WELCOME: "welcome",
  MENU: "menu",
  PLAYING: "playing",
  PAUSED: "paused",
  GAME_OVER: "game_over",
  POPUP: "popup",
  VS_PLAYING: "vs_playing",
  VS_PAUSED: "vs_paused",
  VS_OVER: "vs_over",
  DIFFICULTY_SELECT: "difficulty_select",
  LANG_SELECT: "lang_select",
  THEME_SELECT: "theme_select",
  RANK_PANEL: "rank_panel",
  DAILY_PLAYING: "daily_playing",
  DAILY_PAUSED: "daily_paused",
  DAILY_OVER: "daily_over",
};

/* 边缘模式 */
export const EDGE_DEATH = 0, EDGE_SLIDE = 1, EDGE_WRAP = 2;
export const EDGE_MODE_NAMES = { 0: "edge_death", 1: "edge_slide", 2: "edge_wrap" };
export const EDGE_MODE_COLORS = { 0: "RED_BTN", 1: "GREEN_BTN", 2: "BLUE_BTN" };

/* ---------- 存档默认值 ---------- */
export const DEFAULT_STATS = () => ({
  total_score: 0, redeemed_points: 0, games_played: 0,
  endless_high: 0, timed_high: 0, total_time: 0,
  vs_wins: 0, vs_losses: 0,
  unlocked_skins: [0], current_skin: 0,
  effects_enabled: true, score_version: 2,
  unlocked_achievements: [], total_food_eaten: 0,
  themes_used: ["default"], speeds_played: [1],
  xp: 0, level: 1, xp_streak: 0,
  daily_first_win_date: "", rank_rewards_unlocked: [],
  daily_challenges: {},
});

/* ---------- 全局状态 S ---------- */
export const S = {
  lang: "zh",
  theme: "default",
  colors: { ...DEFAULT_COLORS },   // 当前生效配色（applyTheme 时更新）

  state: ST.WELCOME,
  popupType: null,        // shop / skin / music / help / dev / update / stats / achievements / daily_info
  paused: false,
  vsPaused: false,
  flashAlpha: 0,

  edgeMode: EDGE_SLIDE,
  gameMode: "endless",
  speedIndex: 1,
  aiDifficulty: 1,

  effectsEnabled: true,
  skinId: 0,
  unlockedSkins: [0],
  unlockedAchievements: new Set(),

  stats: DEFAULT_STATS(),
  currentScore: 0,
  sessionTime: 0,

  /* 弹窗滚动位置（切语言/重开弹窗时重置） */
  scrolls: { help: 0, dev: 0, update: 0, stats: 0, achievements: 0, rank: 0, skin: 0, musicList: 0 },

  /* 成就 / 升级通知 */
  achToast: null, achToastTimer: 0,
  levelUpToast: null, levelUpToastTimer: 0,

  /* 音乐 */
  musicVolume: 0.5,
  musicPlaying: false,

  /* 商店提示消息 */
  shopMsg: "", shopMsgTimer: 0,

  /* 皮肤购买确认 */
  skinConfirm: false,
  skinConfirmId: null,

  /* 结算：本局是否刷新纪录（在最高分更新前判定） */
  lastRecord: false,
};

/* ---------- 应用主题 ---------- */
export function applyTheme(id) {
  S.theme = id;
  const theme = id === "default" ? DEFAULT_COLORS : THEMES[id];
  S.colors = theme;
}

/* ---------- 分数格式化（1位小数） ---------- */
export function fmtScore(val) {
  return (val / SCORE_SCALE).toFixed(1);
}

/* ---------- 积分商店 ---------- */
export function getRedeemable() {
  return Math.max(0, S.stats.total_score - S.stats.redeemed_points * 2 * SCORE_SCALE);
}

/* ---------- 段位 / XP ---------- */
export function xpForLevel(level) { return 100 + (level - 1) * 60; }

export function xpToLevel(totalXp) {
  let level = 1, remaining = totalXp;
  for (;;) {
    const need = xpForLevel(level);
    if (remaining < need) return [level, remaining, need];
    remaining -= need;
    level += 1;
  }
}

export function getRankTier(level) {
  if (level <= 5) return { name_key: "rank_bronze", color: [205, 127, 50] };
  if (level <= 10) return { name_key: "rank_silver", color: [192, 192, 192] };
  if (level <= 25) return { name_key: "rank_gold", color: [255, 215, 0] };
  if (level <= 35) return { name_key: "rank_platinum", color: [0, 206, 209] };
  if (level <= 45) return { name_key: "rank_diamond", color: [185, 242, 255] };
  return { name_key: "rank_master", color: [255, 69, 0] };
}

/* 段位等级奖励皮肤 */
export function applyRankRewards(level) {
  const rewardMap = { 10: 11, 20: 12, 30: 13, 40: 14, 50: 15 };
  for (const [lvStr, skinId] of Object.entries(rewardMap)) {
    if (level >= Number(lvStr) && !S.unlockedSkins.includes(skinId)) {
      S.unlockedSkins.push(skinId);
      S.stats.unlocked_skins = S.unlockedSkins;
    }
  }
}

/**
 * 发放 XP（含连胜加成），处理升级。
 * 返回 [新等级|null, 实际获得XP, 加成百分比]
 */
export function awardXp(amount) {
  const streak = S.stats.xp_streak || 0;
  let bonusPct = 0;
  if (streak >= 10) { amount = Math.floor(amount * 1.3); bonusPct = 30; }
  else if (streak >= 5) { amount = Math.floor(amount * 1.2); bonusPct = 20; }
  else if (streak >= 3) { amount = Math.floor(amount * 1.1); bonusPct = 10; }
  S.stats.xp = (S.stats.xp || 0) + amount;
  const oldLevel = S.stats.level || 1;
  const [newLevel] = xpToLevel(S.stats.xp);
  let leveledUp = null;
  if (newLevel > oldLevel) {
    S.stats.level = newLevel;
    applyRankRewards(newLevel);
    S.levelUpToast = newLevel;
    S.levelUpToastTimer = 180;
    leveledUp = newLevel;
  }
  return [leveledUp, amount, bonusPct];
}

/* ---------- 皮肤 ---------- */
export function currentSkin() { return SKINS[S.skinId]; }

/** 每日挑战皮肤锁定时使用指定皮肤 */
export function activeSkinId(forced) {
  return forced != null ? forced : S.skinId;
}

/* ---------- 初始化状态（读档） ---------- */
export function initState() {
  S.stats = loadStats(DEFAULT_STATS());
  S.unlockedSkins = S.stats.unlocked_skins || [0];
  S.skinId = S.stats.current_skin || 0;
  S.effectsEnabled = S.stats.effects_enabled !== false;
  S.unlockedAchievements = new Set(S.stats.unlocked_achievements || []);
  if (!S.unlockedSkins.includes(1) && S.stats.total_time >= 180) {
    S.unlockedSkins.push(1);
    S.stats.unlocked_skins = S.unlockedSkins;
  }
  /* 修复：读档后按已达到的等级补发段位皮肤奖励 */
  applyRankRewards(S.stats.level || 1);
}
