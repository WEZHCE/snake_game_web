/* ============================================================
   贪吃蛇 v8.0 Web —— 音乐系统（Web Audio 程序化芯片音乐）
   原版从本地 music/ 目录加载 mp3；Web 版改为内置 5 首
   程序化生成的芯片音乐，保留完整的播放/暂停/切歌/音量功能。
   ============================================================ */

/* 音符名 → 频率 */
function noteFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

/* ---------- 五首内置曲目（16分音符步进序列） ----------
   melody / bass: [ MIDI音高 | null(休止), 持续步数 ]，循环播放 */
const TRACKS = [
  {
    name: "Star_Chip.mp3", bpm: 120, lead: "square", bass: "triangle",
    melody: [
      [76,2],[79,2],[83,2],[79,2],[76,2],[79,2],[83,4],
      [74,2],[77,2],[81,2],[77,2],[74,2],[77,2],[81,4],
      [72,2],[76,2],[79,2],[76,2],[72,2],[76,2],[79,4],
      [74,2],[78,2],[81,2],[78,2],[86,2],[83,2],[81,2],[78,2],
    ],
    bass: [
      [45,4],[45,4],[52,4],[45,4],[43,4],[43,4],[50,4],[43,4],
      [41,4],[41,4],[48,4],[41,4],[43,4],[43,4],[50,4],[50,4],
    ],
  },
  {
    name: "Neon_Drive.mp3", bpm: 100, lead: "sawtooth", bass: "square",
    melody: [
      [69,4],[72,2],[76,2],[72,2],[69,2],[67,4],[null,4],
      [69,4],[72,2],[77,2],[76,2],[72,2],[69,4],[null,4],
      [65,4],[69,2],[72,2],[69,2],[65,2],[64,4],[null,4],
      [67,4],[71,2],[74,2],[71,2],[67,2],[69,4],[null,4],
    ],
    bass: [
      [33,8],[33,4],[40,4],[33,8],[33,4],[40,4],
      [29,8],[29,4],[36,4],[31,8],[31,4],[38,4],
    ],
  },
  {
    name: "Pixel_Dream.mp3", bpm: 90, lead: "triangle", bass: "sine",
    melody: [
      [77,4],[81,4],[84,4],[81,4],
      [79,4],[83,4],[86,4],[83,4],
      [77,4],[81,4],[84,6],[79,2],
      [76,8],[null,8],
    ],
    bass: [
      [41,8],[48,8],[43,8],[50,8],
      [38,8],[45,8],[41,8],[48,8],
    ],
  },
  {
    name: "Retro_Rush.mp3", bpm: 140, lead: "square", bass: "square",
    melody: [
      [64,1],[67,1],[71,1],[67,1],[64,1],[67,1],[71,1],[74,1],
      [64,1],[67,1],[71,1],[67,1],[76,1],[74,1],[71,1],[67,1],
      [62,1],[65,1],[69,1],[65,1],[62,1],[65,1],[69,1],[72,1],
      [62,1],[65,1],[69,1],[65,1],[74,1],[72,1],[69,1],[65,1],
    ],
    bass: [
      [40,2],[40,2],[40,2],[40,2],[40,2],[40,2],[40,2],[40,2],
      [38,2],[38,2],[38,2],[38,2],[40,2],[40,2],[43,2],[43,2],
    ],
  },
  {
    name: "Zen_Grid.mp3", bpm: 75, lead: "sine", bass: "triangle",
    melody: [
      [74,6],[77,2],[81,4],[79,4],[null,4],
      [74,6],[77,2],[84,4],[81,4],[null,4],
      [72,6],[76,2],[79,4],[77,4],[null,4],
      [74,4],[81,4],[79,8],
    ],
    bass: [
      [38,8],[45,8],[45,8],[43,8],
      [36,8],[43,8],[38,8],[45,8],
    ],
  },
];

class MusicPlayer {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.index = 0;
    this.playing = false;
    this.volume = 0.5;
    this._timer = null;
    this._nextTime = 0;
    this._step = 0;         // 全曲步进（16分音符）
    this._lookahead = 0.25; // 提前调度秒数
    this.total = TRACKS.length;
  }

  names() { return TRACKS.map((t) => t.name); }
  currentName() { return TRACKS[this.index] ? TRACKS[this.index].name : ""; }

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  _note(freq, start, dur, type, gain) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    /* 轻微的音量包络，避免爆音，带有芯片机的清脆感 */
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.012);
    g.gain.setValueAtTime(gain, Math.max(start + 0.012, start + dur - 0.03));
    g.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(start); osc.stop(start + dur + 0.02);
  }

  _scheduleStep(track, step, time) {
    const stepDur = 60 / track.bpm / 4; // 16分音符时长
    /* 找到当前步对应的音符：遍历序列累计步数 */
    const noteAt = (seq) => {
      const len = seq.reduce((s, [, d]) => s + d, 0);
      let pos = step % len;
      for (const [midi, d] of seq) {
        if (pos < d) return midi != null ? [midi, d * stepDur] : null;
        pos -= d;
      }
      return null;
    };
    const m = noteAt(track.melody);
    if (m) this._note(noteFreq(m[0]), time, Math.min(m[1] * 0.9, stepDur * 4), track.lead, 0.16);
    const b = noteAt(track.bass);
    if (b) this._note(noteFreq(b[0]), time, Math.min(b[1] * 0.9, stepDur * 8), track.bass, 0.20);
    /* 每步的轻微节拍点缀（每4步一个弱高频click） */
    if (step % 4 === 0) this._note(2200, time, 0.03, "square", 0.015);
  }

  _tick() {
    if (!this.playing || !this.ctx) return;
    const track = TRACKS[this.index];
    const stepDur = 60 / track.bpm / 4;
    while (this._nextTime < this.ctx.currentTime + this._lookahead) {
      this._scheduleStep(track, this._step, this._nextTime);
      this._step += 1;
      this._nextTime += stepDur;
    }
  }

  play(index = null) {
    this._ensureCtx();
    if (index != null) this.index = Math.max(0, Math.min(index, TRACKS.length - 1));
    if (this.ctx.state === "suspended") this.ctx.resume();
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.08;
    this.playing = true;
    if (!this._timer) this._timer = setInterval(() => this._tick(), 80);
  }

  pause() {
    this.playing = false;
    if (this.ctx) this.ctx.suspend();
  }

  resume() {
    if (this.total === 0) return;
    this._ensureCtx();
    if (this.ctx.state === "suspended") this.ctx.resume();
    this._nextTime = Math.max(this._nextTime, this.ctx.currentTime + 0.08);
    this.playing = true;
  }

  stop() {
    this.playing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }

  next() { this.play((this.index + 1) % TRACKS.length); }
  prev() { this.play((this.index - 1 + TRACKS.length) % TRACKS.length); }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }
}

export const music = new MusicPlayer();
