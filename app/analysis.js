// analysis.js — real-time music analysis for audio-reactive visuals (Web Audio AnalyserNode).
// Outputs (all smoothed, all decay gracefully to an idle state when audio stops or drops):
//   beat (0..1 envelope, 1 on a detected kick), beats (count), bass (0..1), energy (0..1),
//   centroid (Hz), mood (0 mellow/deep-blue .. 1 bright/energetic/cyan), bpm, speed (creature tempo factor, clamped gentle)
export class AudioAnalysis {
  constructor(audioEl, { fftSize = 2048, minSpeed = 0.75, maxSpeed = 1.3, onBeat = null } = {}) {
    this.el = audioEl; this.fftSize = fftSize; this.minSpeed = minSpeed; this.maxSpeed = maxSpeed; this.onBeat = onBeat;
    this.ctx = null; this.analyser = null; this.freq = null;
    this.beat = 0; this.beats = 0; this.bass = 0; this.energy = 0; this.centroid = 0; this.mood = 0.3; this.bpm = 0; this.speed = 1;
    this._low = 0; this._lowAvg = 0; this._fluxAvg = 0; this.flux = 0; this._lastBeat = -10; this._intervals = []; this._prevLow = 0; this._t = 0; this.active = false; this._sorted = []; this._dt = 0.016;
    this._ease = (cur, target, tau) => cur + (target - cur) * (1 - Math.exp(-this._dt / tau));   // one closure, reused every frame
  }
  /** Call from a user gesture (first play). Safe to call repeatedly. */
  connect() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.el);
      this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = this.fftSize; this.analyser.smoothingTimeConstant = 0.25;
      src.connect(this.analyser); this.analyser.connect(this.ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount); this._prevF = new Uint8Array(this.analyser.frequencyBinCount);
      this.ctx.resume();
    } catch (e) { console.warn('[audio] analysis unavailable, visuals stay in idle breathing mode', e); this.ctx = null; }
  }
  /** Suspend the AudioContext (XR session end: nothing should keep running in the background). connect() resumes it. */
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  _bpmFromIntervals() {
    if (this._intervals.length < 3) return;
    const s = this._sorted; s.length = 0; for (const v of this._intervals) s.push(v); s.sort((a, b) => a - b); this.bpm = 60 / s[s.length >> 1];
  }
  /** dt in seconds. Never throws; with no signal everything eases toward idle. */
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1); this._t += dt;
    const ease = this._ease; this._dt = dt;
    let low = 0, energy = 0, centroid = 0, flux = 0;
    const playing = !!(this.analyser && this.el && !this.el.paused && this.ctx && this.ctx.state === 'running');
    if (playing) {
      this.analyser.getByteFrequencyData(this.freq);
      const binHz = this.ctx.sampleRate / this.fftSize, f = this.freq;
      const lo0 = Math.max(1, Math.round(30 / binHz)), lo1 = Math.max(lo0 + 1, Math.round(150 / binHz));
      for (let i = lo0; i <= lo1; i++) { low += f[i]; flux += Math.max(0, f[i] - this._prevF[i]); } low /= (lo1 - lo0 + 1) * 255; flux /= (lo1 - lo0 + 1) * 255; this._prevF.set(this.freq);
      let num = 0, den = 0; const top = Math.min(f.length, Math.round(11000 / binHz));
      for (let i = 1; i < top; i++) { const m = f[i] / 255; num += m * i * binHz; den += m; energy += m * m; }
      energy = Math.sqrt(energy / top); centroid = den > 0 ? num / den : 0;
    }
    this.active = playing && energy > 0.02;
        const now = this._t;
    // beat = onset in the kick band: positive spectral flux well above its running average (refractory 280 ms)
    if (this.active && flux > this._fluxAvg * 1.8 + 0.035 && low > 0.2 && now - this._lastBeat > 0.28) {
      const iv = now - this._lastBeat;
      if (iv > 0.33 && iv < 1.5) { this._intervals.push(iv); if (this._intervals.length > 8) this._intervals.shift(); this._bpmFromIntervals(); }
      this._lastBeat = now; this.beats++; this.beat = 1; this.onBeat?.(this);
    }
    this._prevLow = low; this._lowAvg = ease(this._lowAvg, low, 1.0); this._fluxAvg = ease(this._fluxAvg, flux, 1.0); this.flux = flux;
    this.beat *= Math.exp(-dt * 4.5);
    this.bass = ease(this.bass, this.active ? low : 0, this.active ? 0.15 : 0.8);
    this.energy = ease(this.energy, this.active ? energy : 0, 0.5);
    if (this.active) this.centroid = ease(this.centroid, centroid, 0.6);
    const moodRaw = this.active ? Math.min(1, Math.max(0, (this.centroid - 500) / 1500)) * 0.65 + Math.min(1, this.energy * 2.2) * 0.35 : 0.3;
    this.mood = ease(this.mood, moodRaw, this.active ? 3 : 6);
    if (now - this._lastBeat > 4) this._intervals.length = 0;
    if (this._intervals.length < 3) this.bpm = ease(this.bpm, 0, 2);   // bpm itself is only recomputed on beats (no per-frame sort/alloc)
    const target = this.bpm > 0 ? Math.min(this.maxSpeed, Math.max(this.minSpeed, this.bpm / 90)) : 1;
    this.speed = ease(this.speed, target, 3);
  }
}
