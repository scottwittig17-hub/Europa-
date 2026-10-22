// music.js — playlist player (HTMLAudioElement) + floating player panel.
import { CanvasPanel, circleBtn, roundRect, spacedText } from './panels.js';

/**
 * new MusicPlayer({ tracks, volume })   tracks: [{ name, url, placeholder? }]
 * fields: list, i, volume, playing, error, started     events: onChange(cb)
 * methods: setPlaylist(list), addTracks(list), load(i, autoplay), play(), pause(), toggle(), next(), prev(), setShuffle(on), setVolume(v)
 * Ends -> next track (auto-advance through the whole queue, wrapping); one-track playlists loop; unplayable files are skipped (once started).
 * Queue (test #5): a multi-file pick becomes the queue; picking more APPENDS (placeholders are replaced by the first real pick).
 * Shuffle plays a random permutation of the queue (re-drawn each pass), never the same track twice in a row.
 */
export class MusicPlayer {
  constructor({ tracks = [], volume = 0.6 } = {}) {
    this.audio = new Audio(); this.audio.preload = 'auto';
    this.list = tracks.slice(); this.i = 0; this.volume = volume; this.playing = false; this.error = ''; this.started = false; this.shuffle = false; this._order = null; this._skips = 0;
    this.audio.volume = volume; this._cbs = [];
    const a = this.audio;
    a.addEventListener('play', () => { this.playing = true; this._emit(); });
    a.addEventListener('pause', () => { this.playing = false; this._emit(); });
    a.addEventListener('ended', () => this.next());
    a.addEventListener('playing', () => { this._skips = 0; });
    a.addEventListener('error', () => {
      if (!a.getAttribute('src')) return;
      this.error = 'Couldn’t play that file — skipping'; this._emit();
      if (this.list.length > 1 && this.started && ++this._skips < this.list.length) setTimeout(() => this.next(), 1200);   // stop after a full pass of failures
    });
  }
  onChange(cb) { this._cbs.push(cb); }
  _emit() { for (const cb of this._cbs) cb(this); }
  get current() { return this.list[this.i]; }
  setPlaylist(list) { this.list = list.slice(); this.i = 0; this._order = null; this.audio.pause(); this.audio.removeAttribute('src'); this._emit(); }
  /** Append tracks to the queue. If the queue only holds placeholders, they are replaced. Keeps the current track playing. Returns the new length. */
  addTracks(list) {
    if (!list.length) return this.list.length;
    if (this.list.every((t) => t.placeholder)) { const was = this.playing; this.setPlaylist(list); if (was) this.load(0, true); return this.list.length; }
    this.list.push(...list); this._order = null; if (this.audio.getAttribute('src')) this.audio.loop = this.list.length === 1; this._emit(); return this.list.length;
  }
  setShuffle(on) { this.shuffle = !!on; this._order = null; this._emit(); }
  _step(dir) {
    const n = this.list.length; if (n < 2) return this.i;
    if (!this.shuffle) return (this.i + dir + n) % n;
    if (!this._order || this._order.length !== n) { const o = [...Array(n).keys()].filter((k) => k !== this.i); for (let k = o.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [o[k], o[j]] = [o[j], o[k]]; } this._order = [this.i, ...o]; }
    const pos = this._order.indexOf(this.i); return this._order[(pos + dir + n) % n];
  }
  load(i, autoplay) {
    if (!this.list.length) return;
    this.i = (i + this.list.length) % this.list.length; this.error = '';
    this.audio.src = this.list[this.i].url; this.audio.loop = this.list.length === 1;
    if (autoplay) this.play(); else this._emit();
  }
  play() {
    this.started = true;
    if (!this.audio.getAttribute('src')) this.load(this.i, false);
    const p = this.audio.play(); if (p) p.catch((e) => { if (e && e.name === 'AbortError') return; /* superseded by a newer load (fast next/prev) */ console.warn('music play failed', e); this.playing = false; this._emit(); });
  }
  pause() { this.audio.pause(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  next() { this.load(this._step(1), true); }
  /** Previous track; like most players, if more than 3 s in, restart the current one instead. */
  prev() { if (this.audio.currentTime > 3 && this.audio.getAttribute('src')) { this.audio.currentTime = 0; this.play(); return; } this.load(this._step(-1), true); }
  setVolume(v) { this.volume = Math.round(Math.min(1, Math.max(0, v)) * 10) / 10; this.audio.volume = this.volume; this._emit(); }
}

/**
 * createMusicPanel(player, { theme, width, height, pxPerM, anisotropy }) -> CanvasPanel
 * Shows "MUSIC", track n of N, name (ellipsized), placeholder/device tag, status, and
 * Prev · Play/Pause · Next · Shuffle · Vol− [meter] Vol+, and "+ Add" (when setOnAdd() is used). Region ids: prev, playpause, next, shuffle, voldown, volup, add.
 */
export function createMusicPanel(player, {
  theme = {}, width = 0.62, height = 0.4, pxPerM = 1400, anisotropy = 8, superSample = 1,
} = {}) {
  let onAdd = null; const onAddVisible = () => !!onAdd;
  const T = { moon: '#f3ecda', inkSoft: '#c9bda3', accent: '#e9c78f', error: '#f0a58a', fontDisplay: 'serif', fontSans: 'sans-serif', ...theme };
  const panel = new CanvasPanel(width, height, pxPerM, (ctx, p) => {
    const W = ctx.lw, H = ctx.lh, pad = 48, m = player;
    ctx.fillStyle = 'rgba(7,11,20,.74)'; roundRect(ctx, 0, 0, W, H, 44); ctx.fill();
    ctx.strokeStyle = 'rgba(243,236,218,.18)'; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 43); ctx.stroke();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = T.inkSoft; ctx.font = `500 26px ${T.fontSans}`; spacedText(ctx, 'MUSIC', pad, pad + 26, 26 * .2);
    ctx.textAlign = 'right'; ctx.font = `400 26px ${T.fontSans}`;
    ctx.fillText(`Track ${m.list.length ? m.i + 1 : 0} of ${m.list.length}${m.shuffle ? '  · shuffle' : ''}`, W - pad - (onAddVisible() ? 136 : 0), pad + 26);
    const t = m.list[m.i];
    const label = t ? t.name : '—';
    ctx.textAlign = 'left'; ctx.fillStyle = T.moon; ctx.font = `italic 500 64px ${T.fontDisplay}`;
    let name = label; const maxW = W - pad * 2;
    while (ctx.measureText(name).width > maxW && name.length > 3) name = name.slice(0, -2);
    if (name !== label) name = name.trimEnd() + '…';
    ctx.fillText(name, pad, pad + 26 + 84);
    ctx.font = `500 24px ${T.fontSans}`;
    if (t && t.placeholder) { ctx.fillStyle = T.accent; spacedText(ctx, 'PLACEHOLDER TRACK', pad, pad + 26 + 132, 24 * .14); }
    else { ctx.fillStyle = T.inkSoft; ctx.fillText('From your device', pad, pad + 26 + 132); }
    ctx.textAlign = 'right'; ctx.fillStyle = m.error ? T.error : T.inkSoft; ctx.font = `400 24px ${T.fontSans}`;
    ctx.fillText(m.error || (m.playing ? 'Playing' : 'Paused'), W - pad, pad + 26 + 132);
    const cy = H - 128, r = 62, moon = T.moon;
    // transport: prev · play/pause · next · shuffle | vol- [meter] vol+       (region ids: prev, playpause, next, shuffle, voldown, volup, add)
    const xPrev = pad + r * .8, xPlay = xPrev + r * .8 + 26 + r * 1.05, xNext = xPlay + r * 1.05 + 26 + r * .8, xShuf = xNext + r * .8 + 22 + r * .62;
    circleBtn(ctx, p, 'prev', xPrev, cy, r * .8, m.list.length < 1, (c, x, y, rr) => {
      c.fillStyle = moon; c.beginPath(); c.moveTo(x + rr * .35, y - rr * .34); c.lineTo(x - rr * .15, y); c.lineTo(x + rr * .35, y + rr * .34); c.closePath(); c.fill(); c.fillRect(x - rr * .31, y - rr * .34, rr * .13, rr * .68); });
    circleBtn(ctx, p, 'playpause', xPlay, cy, r * 1.05, false, (c, x, y, rr) => {
      c.fillStyle = moon;
      if (m.playing) { c.fillRect(x - rr * .3, y - rr * .36, rr * .2, rr * .72); c.fillRect(x + rr * .1, y - rr * .36, rr * .2, rr * .72); }
      else { c.beginPath(); c.moveTo(x - rr * .22, y - rr * .4); c.lineTo(x + rr * .42, y); c.lineTo(x - rr * .22, y + rr * .4); c.closePath(); c.fill(); }
    });
    circleBtn(ctx, p, 'next', xNext, cy, r * .8, m.list.length < 2, (c, x, y, rr) => {
      c.fillStyle = moon; c.beginPath(); c.moveTo(x - rr * .35, y - rr * .34); c.lineTo(x + rr * .15, y); c.lineTo(x - rr * .35, y + rr * .34); c.closePath(); c.fill(); c.fillRect(x + rr * .18, y - rr * .34, rr * .13, rr * .68);
    });
    circleBtn(ctx, p, 'shuffle', xShuf, cy, r * .62, m.list.length < 3, (c, x, y, rr) => {   // two crossing arrows; lit when on
      c.strokeStyle = m.shuffle ? T.accent : moon; c.lineWidth = rr * .11; c.lineCap = 'round'; c.beginPath();
      c.moveTo(x - rr * .45, y - rr * .25); c.bezierCurveTo(x - rr * .05, y - rr * .25, x + rr * .05, y + rr * .25, x + rr * .4, y + rr * .25);
      c.moveTo(x - rr * .45, y + rr * .25); c.bezierCurveTo(x - rr * .05, y + rr * .25, x + rr * .05, y - rr * .25, x + rr * .4, y - rr * .25); c.stroke();
      c.fillStyle = c.strokeStyle; for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(x + rr * .52, y + sy * rr * .25); c.lineTo(x + rr * .3, y + sy * rr * .25 - rr * .14); c.lineTo(x + rr * .3, y + sy * rr * .25 + rr * .14); c.closePath(); c.fill(); }
      if (m.shuffle) { c.beginPath(); c.arc(x, y + rr * .62, rr * .07, 0, Math.PI * 2); c.fill(); } });
    const xVu = W - pad - r * .55, xVd = xVu - r * .55 * 2 - 130;
    circleBtn(ctx, p, 'voldown', xVd, cy, r * .55, m.volume <= 0, (c, x, y, rr) => { c.strokeStyle = moon; c.lineWidth = rr * .12; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - rr * .38, y); c.lineTo(x + rr * .38, y); c.stroke(); });
    circleBtn(ctx, p, 'volup', xVu, cy, r * .55, m.volume >= 1, (c, x, y, rr) => { c.strokeStyle = moon; c.lineWidth = rr * .12; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - rr * .38, y); c.lineTo(x + rr * .38, y); c.moveTo(x, y - rr * .38); c.lineTo(x, y + rr * .38); c.stroke(); });
    const mx0 = xVd + r * .55 + 14, mx1 = xVu - r * .55 - 14, my = cy;
    ctx.fillStyle = 'rgba(243,236,218,.2)'; roundRect(ctx, mx0, my - 5, mx1 - mx0, 10, 5); ctx.fill();
    ctx.fillStyle = moon; roundRect(ctx, mx0, my - 5, (mx1 - mx0) * m.volume, 10, 5); ctx.fill();
    ctx.fillStyle = T.inkSoft; ctx.font = `400 24px ${T.fontSans}`; ctx.textAlign = 'center'; ctx.fillText(`Vol ${Math.round(m.volume * 100)}%`, (mx0 + mx1) / 2, my + 48);
    // "+ Add" (top right): more files from the device (appends to the queue). In VR this exits to the page picker (see main.js onAdd).
    if (onAddVisible()) { const aw = 118, ah = 46, ax = W - pad - aw, ay = pad - 8, hov = p.hover === 'add';
      ctx.fillStyle = hov ? 'rgba(95,230,236,.28)' : 'rgba(255,255,255,.06)'; roundRect(ctx, ax, ay, aw, ah, ah / 2); ctx.fill();
      ctx.strokeStyle = hov ? 'rgba(216,243,245,.8)' : 'rgba(216,243,245,.3)'; ctx.lineWidth = 3; roundRect(ctx, ax + 1.5, ay + 1.5, aw - 3, ah - 3, ah / 2 - 1.5); ctx.stroke();
      ctx.fillStyle = moon; ctx.font = `600 24px ${T.fontSans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+ Add', ax + aw / 2, ay + ah / 2 + 1); ctx.textBaseline = 'alphabetic';
      p.regions.push({ id: 'add', x: ax, y: ay, w: aw, h: ah }); }
  }, { anisotropy, superSample });
  panel.onPress = (id) => {
    if (id === 'playpause') player.toggle();
    else if (id === 'next') player.next();
    else if (id === 'prev') player.prev();
    else if (id === 'shuffle') player.setShuffle(!player.shuffle);
    else if (id === 'add') onAdd?.();
    else if (id === 'voldown') player.setVolume(player.volume - .1);
    else if (id === 'volup') player.setVolume(player.volume + .1);
  };
  player.onChange(() => { panel.dirty = true; });
  /** setOnAdd(fn): show the '+ Add' button; fn runs on press (inside the input event, so a DOM file picker may open from it on desktop). */
  panel.setOnAdd = (fn) => { onAdd = fn; panel.dirty = true; };
  return panel;
}
