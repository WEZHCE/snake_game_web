/* ============================================================
   贪吃蛇 v8.0 Web —— 存档系统
   原版使用 snake_save.json + snake_save_backup.json 双文件，
   Web 版对应 localStorage 双 Key，主档损坏自动回退备份档。
   ============================================================ */

const SAVE_KEY = "snake_save_v8";
const SAVE_KEY_BACKUP = "snake_save_backup_v8";

function readKey(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const loaded = JSON.parse(raw);
    /* 旧版本 v1 分数制迁移（原版逻辑） */
    if (loaded.score_version === 1) {
      loaded.total_score = (loaded.total_score || 0) * 10;
      loaded.endless_high = (loaded.endless_high || 0) * 10;
      loaded.timed_high = (loaded.timed_high || 0) * 10;
      loaded.score_version = 2;
    }
    /* 合并默认字段，保证向后兼容 */
    for (const k of Object.keys(defaults)) {
      if (!(k in loaded)) loaded[k] = defaults[k];
    }
    return loaded;
  } catch { return null; }
}

export function loadStats(defaults) {
  for (const key of [SAVE_KEY, SAVE_KEY_BACKUP]) {
    const loaded = readKey(key, defaults);
    if (loaded) return loaded;
  }
  return defaults;
}

export function saveStats(stats) {
  /* 主档 + 备份档同时写入（浏览器 localStorage 可靠性高，双写更稳） */
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(stats)); } catch { /* ignore */ }
  try { localStorage.setItem(SAVE_KEY_BACKUP, JSON.stringify(stats)); } catch { /* ignore */ }
}
