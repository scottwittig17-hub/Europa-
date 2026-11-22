/* Ridge Base b6 — synthesized grind + rumble for rig E-7 (WebAudio only, no sound files, so no licence questions).
 *   drone   two detuned low sawtooths (~36/54 Hz) through a 160 Hz low-pass: the engine
 *   rumble  brown noise through a 110 Hz low-pass: tracks on ice
 *   grind   white noise through a slowly sweeping band-pass (650-1100 Hz), amplitude-wobbled at ~6.5 Hz: the cutter teeth
 *   clanks  every ~1.4-2.6 s a short metallic knock (resonant band-pass noise + a 150 Hz thump)
 * Everything feeds one bus -> soft compressor -> THREE.PositionalAudio on the rig (Web Audio panner: direction + distance),
 * and an extra distance gain on top so it is silent far away, swells as the rig approaches and peaks under the glass floor. */
import * as THREE from 'three';

export function createRigSound({ camera, anchor, onState }) {
  let listener = null, pos = null, ctx = null, bus = null, distGain = null, started = false, muted = false;
  try { muted = localStorage.getItem('ridge-base-b6-rigsound') === 'muted'; } catch (e) { /* ignore */ }
  const LEVEL = 0.55;                       // overall loudness at the closest pass (comfortable, not harsh)
  function noiseBuffer(c, brown) {
    const len = c.sampleRate * 4, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  function start() {
    if (started) { if (ctx && ctx.state !== 'running') ctx.resume(); return; }
    started = true;
    listener = new THREE.AudioListener(); camera.add(listener); ctx = listener.context;
    bus = ctx.createGain(); bus.gain.value = 1;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.3;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600;   // take the edge off
    distGain = ctx.createGain(); distGain.gain.value = 0;
    bus.connect(comp); comp.connect(tone); tone.connect(distGain);
    // drone
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 160; const dg = ctx.createGain(); dg.gain.value = 0.32;
    for (const f of [36, 36.6, 54.2]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dlp); o.start(); }
    dlp.connect(dg); dg.connect(bus);
    // rumble
    const rs = ctx.createBufferSource(); rs.buffer = noiseBuffer(ctx, true); rs.loop = true;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 110; const rg = ctx.createGain(); rg.gain.value = 0.9;
    rs.connect(rlp); rlp.connect(rg); rg.connect(bus); rs.start();
    // grind
    const white = noiseBuffer(ctx, false);
    const gs = ctx.createBufferSource(); gs.buffer = white; gs.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 1.6;
    const sweep = ctx.createOscillator(); sweep.frequency.value = 0.23; const sweepAmt = ctx.createGain(); sweepAmt.gain.value = 230; sweep.connect(sweepAmt); sweepAmt.connect(bp.frequency); sweep.start();
    const gg = ctx.createGain(); gg.gain.value = 0.16;
    const wob = ctx.createOscillator(); wob.frequency.value = 6.5; const wobAmt = ctx.createGain(); wobAmt.gain.value = 0.07; wob.connect(wobAmt); wobAmt.connect(gg.gain); wob.start();
    gs.connect(bp); bp.connect(gg); gg.connect(bus); gs.start();
    // clanks (scheduled a little ahead)
    let nextClank = ctx.currentTime + 1;
    const clankBp = ctx.createBiquadFilter(); clankBp.type = 'bandpass'; clankBp.frequency.value = 520; clankBp.Q.value = 9; clankBp.connect(bus);
    setInterval(() => {
      while (nextClank < ctx.currentTime + 0.5) {
        const t = nextClank, n = ctx.createBufferSource(); n.buffer = white; const ng = ctx.createGain();
        ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.5, t + 0.005); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        n.connect(ng); ng.connect(clankBp); n.start(t, Math.random() * 3, 0.4);
        const th = ctx.createOscillator(); th.frequency.setValueAtTime(150, t); th.frequency.exponentialRampToValueAtTime(70, t + 0.25);
        const tg = ctx.createGain(); tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.35, t + 0.01); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        th.connect(tg); tg.connect(bus); th.start(t); th.stop(t + 0.35);
        nextClank += 1.4 + Math.random() * 1.2;
      }
    }, 200);
    // positional output on the rig
    pos = new THREE.PositionalAudio(listener);
    pos.setRefDistance(22); pos.setRolloffFactor(1.0); pos.setDistanceModel('inverse'); pos.setMaxDistance(1000);
    pos.setNodeSource(distGain); pos.setVolume(muted ? 0 : 1);
    anchor.add(pos);
    if (ctx.state !== 'running') ctx.resume();
    onState && onState();
  }
  // our extra distance shaping (on top of the panner's own falloff): 1 within 30 m, fading to 0 by 170 m
  const shape = d => { const k = THREE.MathUtils.clamp((170 - d) / 140, 0, 1); return k * k * (3 - 2 * k); };
  const _a = new THREE.Vector3(), _c = new THREE.Vector3();
  let last = { d: 0, shaped: 0, panner: 0, total: 0 };
  function update(fade = 1) {
    if (!started) return;
    anchor.getWorldPosition(_a); camera.getWorldPosition(_c);
    const d = _a.distanceTo(_c), g = LEVEL * shape(d) * fade;
    distGain.gain.setTargetAtTime(g, ctx.currentTime, 0.25);
    const pan = 22 / (22 + Math.max(0, d - 22));           // what the 'inverse' panner adds (ref 22 m, rolloff 1)
    last = { d: +d.toFixed(1), shaped: +g.toFixed(3), panner: +Math.min(1, pan).toFixed(3), total: +(g * Math.min(1, pan) * (muted ? 0 : 1)).toFixed(3) };
  }
  function toggleMute() { muted = !muted; try { localStorage.setItem('ridge-base-b6-rigsound', muted ? 'muted' : 'on'); } catch (e) { /* ignore */ }
    if (pos) pos.setVolume(muted ? 0 : 1); onState && onState(); }
  return { start, update, toggleMute, get muted() { return muted; }, get started() { return started; },
    debug: () => ({ ...last, state: ctx ? ctx.state : 'not started', muted }) };
}
