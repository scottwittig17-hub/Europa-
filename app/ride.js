// ride.js — hands-off submarine ride: closed tunnel loop of chambers, a cockpit fixed to the user, and a ride
// controller that moves the WORLD past the user (never the camera / reference space).
//
// Comfort model (see README): constant cruise speed (0.15-0.35 m/s presets), 12 s smootherstep ease-in/out and eased speed changes, yaw-only heading (no pitch/roll),
// heading pre-smoothed along the path so yaw rate is continuous and < 2 deg/s, no cockpit bob, no user control of motion.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PALETTE, createJellies, createMarineSnow, createLightShafts, createLoopPlane } from './scene.js';

const NOISE = /* glsl */`
float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }`;

/* Platform-split grade. HMD (Quest lenses crush blacks) = CONFIG.HMD_*, desktop = CONFIG.DESKTOP_*. Every graded material shares ONE set of
   uniform objects (GRADE_U), so setGradeMode() switches the whole world in O(1) with no recompiles. main.js calls it on XR sessionstart/sessionend
   (and checks renderer.xr.isPresenting each frame as a guard). ?grade=hmd forces the HMD grade on desktop; ?hmd=0 restores the old ungraded look. */
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const HMD_OFF = QS.get('hmd') === '0';
export const FORCE_HMD_GRADE = QS.get('grade') === 'hmd';
/* Lighting mode: 'headlights' (sub spotlights + low ambient) or 'glow' (the previous all-emissive look). ?lights=1|0 overrides CONFIG.LIGHTING_MODE. */
const LQ = QS.get('lights');
export const LIGHT = { mode: LQ === '0' || LQ === 'off' || LQ === 'glow' ? 'glow' : LQ === '1' || LQ === 'on' ? 'headlights' : (CONFIG.LIGHTING_MODE === 'glow' ? 'glow' : 'headlights') };
const plat = (v, hmd) => (v && typeof v === 'object') ? (hmd ? v.hmd : v.desktop) : v;
const gradeValues = (hmd) => {
  const hl = LIGHT.mode === 'headlights';
  const g = HMD_OFF ? { expo: 1, lift: 0, contrast: 1, vein: 0, wall: 0 }
    : hmd ? { expo: Math.pow(2, CONFIG.HMD_BRIGHTNESS), lift: CONFIG.HMD_SHADOW_LIFT, contrast: CONFIG.HMD_CONTRAST, vein: CONFIG.HMD_VEIN_GLOW, wall: CONFIG.HMD_WALL_GLOW }
    : { expo: Math.pow(2, CONFIG.DESKTOP_BRIGHTNESS), lift: CONFIG.DESKTOP_SHADOW_LIFT, contrast: CONFIG.DESKTOP_CONTRAST, vein: CONFIG.DESKTOP_VEIN_GLOW, wall: CONFIG.DESKTOP_WALL_GLOW };
  Object.assign(g, { lights: hl ? 'headlights' : 'glow', amb: 1, hl: 0, fill: 0, beam: 0, backdrop: 1, fogTeal: HMD_OFF ? 0 : CONFIG.FOG_TEAL, fogLift: HMD_OFF ? 1 : CONFIG.FOG_LIFT });
  if (hl) Object.assign(g, { amb: plat(CONFIG.AMBIENT_IN_HEADLIGHTS, hmd), hl: plat(CONFIG.HEADLIGHT_INTENSITY, hmd), fill: plat(CONFIG.HEADLIGHT_FILL, hmd), beam: plat(CONFIG.BEAM_OPACITY, hmd), backdrop: CONFIG.BACKDROP_IN_HEADLIGHTS,
    fogTeal: HMD_OFF ? 0 : CONFIG.FOG_TEAL_IN_HEADLIGHTS, fogLift: HMD_OFF ? 1 : CONFIG.FOG_LIFT_IN_HEADLIGHTS, ...(HMD_OFF ? {} : { wall: plat(CONFIG.WALL_GLOW_IN_HEADLIGHTS, hmd), lift: plat(CONFIG.SHADOW_LIFT_IN_HEADLIGHTS, hmd), vein: plat(CONFIG.VEIN_GLOW_IN_HEADLIGHTS, hmd) ?? g.vein }) });
  return g;
};
export const GRADE = { mode: 'desktop', ...gradeValues(FORCE_HMD_GRADE), fog: HMD_OFF ? 0.038 : CONFIG.FOG_DENSITY };
export const WALL_TEAL = new THREE.Color(0.030, 0.105, 0.115);   // WALL_GLOW = 1 emissive (display units, before grade)
export const fogColor = (out = new THREE.Color()) => out.copy(PALETTE.abyss).multiplyScalar(GRADE.fogLift).lerp(FOG_TEAL_COL, GRADE.fogTeal);   // lit teal water, never black
const FOG_TEAL_COL = new THREE.Color(0.07, 0.20, 0.22);
const BACKDROP_WALL = new THREE.Color(0.065, 0.2, 0.32);
const BACKDROP_U = { value: 1 };
export const BACKDROP_ANIM_U = { value: CONFIG.BACKDROP_ANIM ?? 1 }, BACKDROP_ENERGY_U = { value: 0 };   // backdrop life; energy = analysis.energy x CALM x BACKDROP_AUDIO (main.js)
export const ICE_TEX = { value: null }, ICE_TEX_ON = { value: 0 };   // frosty ice detail (tex/walls.jpg), set by main.js when it loads
export const SKY_PART_U = { value: 0 };   // test #7: 0..1 while the big manta is right above the skylight (set in updateInstances)
export const ROCK_TEX = { value: null }, ROCK_TEX_ON = { value: 0 }; // tex/rock.jpg (darker rock, faint blue veins) for the rock props / vent chimneys   // painting gain (BACKDROP_IN_HEADLIGHTS in headlights mode)
export const GRADE_U = { uExpo: { value: 1 }, uLift: { value: 0 }, uContrast: { value: 1 }, uVeinGlow: { value: 0 }, uWallGlow: { value: new THREE.Color() }, uBackdropWall: { value: new THREE.Color() }, uKnee: { value: CONFIG.EMISSIVE_KNEE } };
/* Sub headlights: shared uniforms (one object per uniform, referenced by every lit material). Lamp poses are in WORLD space and are
   refreshed each frame from the cockpit's matrixWorld (updateHeadlights): the lamps are bolted to the sub, so they glide with the ride. */
const HL_LOCAL = { pos: [new THREE.Vector3(-0.9, 0.55, -1.55), new THREE.Vector3(0.9, 0.55, -1.55)], dir: [new THREE.Vector3(), new THREE.Vector3()] };
{ const toe = CONFIG.HEADLIGHT_TOE_OUT * Math.PI / 180, tilt = CONFIG.HEADLIGHT_TILT_DOWN * Math.PI / 180;
  HL_LOCAL.dir[0].set(-Math.sin(toe) * Math.cos(tilt), -Math.sin(tilt), -Math.cos(toe) * Math.cos(tilt)).normalize();
  HL_LOCAL.dir[1].set(Math.sin(toe) * Math.cos(tilt), -Math.sin(tilt), -Math.cos(toe) * Math.cos(tilt)).normalize(); }
export const LIGHT_U = {
  uHLPos: { value: [HL_LOCAL.pos[0].clone().setY(1.75), HL_LOCAL.pos[1].clone().setY(1.75)] }, uHLDir: { value: [HL_LOCAL.dir[0].clone(), HL_LOCAL.dir[1].clone()] },
  uHLCone: { value: new THREE.Vector4() },   // x cos(outer), y cos(inner), z 1/range, w 1/k^2 (falloff 1/(1+d^2/k^2))
  uHLInt: { value: 0 }, uHLFill: { value: 0 }, uHLBeam: { value: 0 }, uAmb: { value: 1 }, uHLCol: { value: new THREE.Color(...CONFIG.HEADLIGHT_COLOR) },
  uFogCol: { value: new THREE.Color() },    // shared fog colour (darker water in headlights mode)
};
{ const a = CONFIG.HEADLIGHT_ANGLE * Math.PI / 180; LIGHT_U.uHLCone.value.set(Math.cos(a), Math.cos(a * (CONFIG.HEADLIGHT_INNER ?? 0.6)), 1 / CONFIG.HEADLIGHT_RANGE, 1 / (15 * 15)); }
const _hlM = new THREE.Matrix4();
/** Lamp positions/directions from the cockpit's world matrix (eye-level cockpit group). Allocation-free; call once per frame. */
export function updateHeadlights(cockpitMatrixWorld) {
  for (let i = 0; i < 2; i++) { LIGHT_U.uHLPos.value[i].copy(HL_LOCAL.pos[i]).applyMatrix4(cockpitMatrixWorld); LIGHT_U.uHLDir.value[i].copy(HL_LOCAL.dir[i]).transformDirection(cockpitMatrixWorld); }
}
let lastHmd = false;
/** hmd: true while an XR session presents. Returns the applied grade. */
export function setGradeMode(hmd) {
  lastHmd = !!hmd; hmd = !!hmd || FORCE_HMD_GRADE; const g = gradeValues(hmd); Object.assign(GRADE, g, { mode: hmd ? 'hmd' : 'desktop' });
  GRADE_U.uExpo.value = g.expo; GRADE_U.uLift.value = g.lift; GRADE_U.uContrast.value = g.contrast; GRADE_U.uVeinGlow.value = g.vein;
  GRADE_U.uWallGlow.value.copy(WALL_TEAL).multiplyScalar(g.wall); GRADE_U.uBackdropWall.value.copy(BACKDROP_WALL).multiplyScalar(g.expo / 2 * (g.lights === 'headlights' ? 0.5 : 1));
  BACKDROP_U.value = g.backdrop; LIGHT_U.uHLInt.value = g.hl; LIGHT_U.uHLFill.value = g.fill; LIGHT_U.uHLBeam.value = g.beam; LIGHT_U.uAmb.value = g.amb; fogColor(LIGHT_U.uFogCol.value);
  return GRADE;
}
/** 'headlights' | 'glow' (or true/false). Uniform-only switch: no shader recompiles. Returns the applied grade. */
export function setLightingMode(m) { LIGHT.mode = (m === true || m === 'headlights') ? 'headlights' : 'glow'; return setGradeMode(lastHmd); }
setGradeMode(false);
const gradeUniforms = () => GRADE_U;   // shared objects (not copies): one switch updates every material
const GRADE_GLSL = /* glsl */`
uniform float uExpo, uLift, uContrast, uVeinGlow, uKnee; uniform vec3 uWallGlow;
vec3 hmdGrade(vec3 c){ c *= uExpo; c = c / (1.0 + 0.6 * max(c - 0.55, 0.0));          // +N stops, soft shoulder so lit areas don't clip
  c = max((c - 0.10) * uContrast + 0.10, 0.0); return c + uLift * (1.0 - c); }       // contrast about a dark mid-grey, lifted floor
// hue-preserving soft clip of the FINAL colour (base + emissive veins/lava): the brightest channel rolls off above uKnee and never reaches 1.0,
// so saturated cyan veins stay cyan instead of clipping to white.
vec3 softClip(vec3 c){ float m = max(max(c.r, c.g), c.b); if (m <= uKnee) return c; float k = 1.0 - uKnee;
  float mm = uKnee + k * (1.0 - exp(-(m - uKnee) / k)); return c * (mm / m); }
float veinMask(vec3 t){ float cy = min(t.g, t.b) - t.r; return smoothstep(0.04, 0.20, cy) * smoothstep(0.12, 0.45, max(t.g, t.b)); }   // cyan & saturated`;
/* Analytic sub headlights (no shadow maps, no three.js lights): cone attenuation x distance falloff x N.L for two lamps + a faint wide near fill,
   and a cheap in-water beam haze. Split for the Quest budget:
   - per VERTEX (smooth over a triangle): lamp->surface vectors (affine, so interpolation is exact), distance falloff + range window, near fill,
     and the beam haze (in-scatter along the view ray: cone factor at a point ~7 m down the ray, falloff integral k*atan(D/k)).
   - per PIXEL: normalize the two lamp vectors, cone smoothstep, N.L with the interpolated displaced-geometry normal (so relief catches the light).
   uHLInt == 0 (glow mode) skips everything on a uniform branch. Nothing here is time-varying: no flicker. All HL uniforms are explicitly highp
   (GLSL ES needs identical precision for a uniform used in both stages). */
const HL_UNIFORMS = /* glsl */`uniform highp vec3 uHLPos[2]; uniform highp vec3 uHLDir[2]; uniform highp vec4 uHLCone; uniform highp float uHLInt, uHLFill, uHLBeam, uAmb; uniform highp vec3 uHLCol;
float hlFall(float r){ float x = min(r * uHLCone.z, 1.0); float w = 1.0 - x * x * x * x; return w * w / (1.0 + r * r * uHLCone.w); }`;
const HL_VS = /* glsl */`${HL_UNIFORMS}
varying vec3 vHLd0, vHLd1, vHLk; varying float vHLBeam;   // lamp->surface vectors; (falloff lamp 0, falloff lamp 1, near fill); beam haze
void hlVertex(vec3 wp, vec3 n, float twoSided){
  vHLd0 = wp - uHLPos[0]; vHLd1 = wp - uHLPos[1]; vHLk = vec3(0.0); vHLBeam = 0.0;
  if (uHLInt <= 0.0) return;
  vHLk.x = hlFall(length(vHLd0)); vHLk.y = hlFall(length(vHLd1));
  vec3 d0 = wp - 0.5 * (uHLPos[0] + uHLPos[1]); float r0 = max(length(d0), 0.05); vec3 l0 = d0 / r0, fwd = normalize(uHLDir[0] + uHLDir[1]);
  float nd = dot(n, -l0); nd = mix(max(nd, 0.0), abs(nd), twoSided);
  vHLk.z = uHLFill * (0.3 + 0.7 * nd) * smoothstep(-0.35, 0.5, dot(l0, fwd)) / (1.0 + r0 * r0 * 0.012);
  if (uHLBeam > 0.0) { vec3 vd = wp - cameraPosition; float D = max(length(vd), 0.05); vec3 rd = vd / D;   // test #5: 3 taps (3, 7, 13 m) -> a visible shaft
    float cm = mix(uHLCone.x, uHLCone.y, 0.5), acc = 0.0;
    for (int k = 0; k < 3; k++) { float tk = k == 0 ? 3.0 : (k == 1 ? 7.0 : 13.0); if (tk > D) break; vec3 q = cameraPosition + rd * tk;
      float c = smoothstep(uHLCone.x, cm, dot(normalize(q - uHLPos[0]), uHLDir[0])) + smoothstep(uHLCone.x, cm, dot(normalize(q - uHLPos[1]), uHLDir[1]));
      acc += c * (k == 0 ? 0.42 : (k == 1 ? 0.36 : 0.22)) / (1.0 + tk * tk * uHLCone.w * 0.5); }
    vHLBeam = uHLBeam * acc * min(1.0, D / 4.0); }
}`;
const HL_FS = /* glsl */`${HL_UNIFORMS}
varying vec3 vHLd0, vHLd1, vHLk; varying float vHLBeam;
vec3 headlight(vec3 n, float twoSided){
  if (uHLInt <= 0.0) return vec3(0.0);
  vec3 l0 = normalize(vHLd0), l1 = normalize(vHLd1);
  float c0 = smoothstep(uHLCone.x, uHLCone.y, dot(l0, uHLDir[0])), c1 = smoothstep(uHLCone.x, uHLCone.y, dot(l1, uHLDir[1]));
  float n0 = dot(n, -l0), n1 = dot(n, -l1); n0 = mix(max(n0, 0.0), abs(n0), twoSided); n1 = mix(max(n1, 0.0), abs(n1), twoSided);
  return uHLCol * (uHLInt * (c0 * n0 * vHLk.x + c1 * n1 * vHLk.y) + vHLk.z);
}
vec3 hlBeam(){ return uHLCol * vHLBeam; }`;
/* Full per-pixel variant for the small-area materials (translucent ice: wrap + glint; backdrop paintings: a light touch). */
const HL_GLSL = /* glsl */`${HL_UNIFORMS}
float hlSpot(highp vec3 wp, vec3 n, float twoSided){
  float acc = 0.0;
  for (int i = 0; i < 2; i++) {
    highp vec3 d = wp - uHLPos[i]; highp float dist = max(length(d), 0.05); vec3 l = vec3(d / dist);
    float ndl = dot(n, -l); ndl = mix(max(ndl, 0.0), abs(ndl), twoSided);
    acc += smoothstep(uHLCone.x, uHLCone.y, dot(l, uHLDir[i])) * ndl * hlFall(float(dist));
  }
  return acc;
}`;

/* JS value noise (for geometry displacement; deterministic) */
const h3 = (x, y, z) => { let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
function vnoise3(x, y, z) { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz); const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), fx), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), fx), fy),
           L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), fx), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), fx), fy), fz); }
const fbm3 = (x, y, z) => vnoise3(x, y, z) * 0.55 + vnoise3(x * 2.03, y * 2.03, z * 2.03) * 0.28 + vnoise3(x * 4.1, y * 4.1, z * 4.1) * 0.17;
export const MIN_CLEARANCE = 5.9;   // nothing (walls, props, backdrops, jellies, loops) closer to the cockpit eye than this

/* ------------------------------------------------------------------ path ------------------------------------------------------------------ */
// A gently wandering closed loop (~150 m) at the user's eye height. Tunnel centre = path.
export function createPath({ radius = 24, wobble = 2.5, rise = 1.4, points = 12, samples = 3000 } = {}) {
  const ctrl = [];
  for (let i = 0; i < points; i++) {
    const a = i / points * Math.PI * 2;
    const r = radius + wobble * Math.sin(a * 2 + 0.7) + wobble * 0.5 * Math.sin(a * 3 + 2.1);
    ctrl.push(new THREE.Vector3(Math.sin(a) * r, rise * Math.sin(a * 2 + 1.3), -Math.cos(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  const L = curve.getLength();
  // lookup tables (precomputed once; per-frame reads are allocation-free)
  const N = samples, P = new Float32Array(N * 3), Y = new Float64Array(N);
  const v = new THREE.Vector3(), t = new THREE.Vector3();
  for (let i = 0; i < N; i++) { curve.getPointAt(i / N, v); P.set([v.x, v.y, v.z], i * 3); curve.getTangentAt(i / N, t); Y[i] = Math.atan2(-t.x, -t.z); }
  for (let i = 1; i < N; i++) { let d = Y[i] - Y[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; Y[i] = Y[i - 1] + d; }   // unwrap
  const lapTurn = (() => { let d = Y[0] - Y[N - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Y[N - 1] + d - Y[0]; })();   // total heading change per lap (±2π)
  // smooth heading along the path (circular box filter ~8 m, 3 passes ≈ gaussian) so yaw rate is continuous through spline knots
  const win = Math.max(1, Math.round(8 / (L / N))); let Ys = Float64Array.from(Y);
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float64Array(N);
    for (let i = 0; i < N; i++) { let acc = 0; for (let k = -win; k <= win; k++) { let j = i + k, off = 0; if (j < 0) { j += N; off = -lapTurn; } else if (j >= N) { j -= N; off = lapTurn; } acc += Ys[j] + off; } out[i] = acc / (2 * win + 1); }
    Ys = out;
  }
  const yawOf = (s) => { s = ((s % L) + L) % L; const f = s / L * N, i = Math.floor(f), k = f - i, j = (i + 1) % N; const yj = Ys[j] + (j === 0 ? lapTurn : 0); return Ys[i] + (yj - Ys[i]) * k; };
  const pointOf = (s, out) => { s = ((s % L) + L) % L; const f = s / L * N, i = Math.floor(f), k = f - i, j = (i + 1) % N;
    return out.set(P[i * 3] + (P[j * 3] - P[i * 3]) * k, P[i * 3 + 1] + (P[j * 3 + 1] - P[i * 3 + 1]) * k, P[i * 3 + 2] + (P[j * 3 + 2] - P[i * 3 + 2]) * k); };
  return { curve, L, pointOf, yawOf, lapTurn };
}

/* chambers: wide spots along the loop (fraction of lap) */
export const CHAMBERS = [0.12, 0.45, 0.76];
export function tunnelRadius(s, L) {
  let r = 12;
  for (const c of CHAMBERS) { let d = Math.abs(s - c * L); d = Math.min(d, L - d); r += 6.5 * Math.exp(-(d * d) / (2 * 9 * 9)); }
  return r;   // 12 m corridors, ~18.5 m chambers
}
const FLOOR = -6.9;   // lakebed depth below the path (eye) level (was -5.5; keeps the bumpy bed >= 5.9 m from the eye)
export const chamberWeight = (s, L) => { let w = 0; for (const c of CHAMBERS) { let d = Math.abs(s - c * L); d = Math.min(d, L - d); w = Math.max(w, Math.exp(-(d * d) / (2 * 9 * 9))); } return w; };

/* ------------------------------------------------------------------ tunnel ------------------------------------------------------------------ */
export const MAX_RIPPLES = 4;
export function createTunnel(path, { step = 0.65, radial = 56, ringsPerChunk = 24 } = {}) {
  const { L } = path; const rings = Math.round(L / step); const group = new THREE.Group();
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, -100));
  const uniforms = {
    uTime: { value: 0 }, uBeat: { value: 0 }, uBass: { value: 0 }, uMood: { value: 0.3 }, uBreath: { value: 0 },
    uRipples: { value: ripples }, uBeatFlash: { value: CONFIG.BEAT_FLASH }, uCalm: { value: CONFIG.CALM },
    uRippleGain: { value: CONFIG.RIPPLES ? CONFIG.RIPPLE_INTENSITY : 0 }, uRippleSpeed: { value: 1.1 }, uRippleLife: { value: CONFIG.RIPPLE_LIFE }, uRippleWidth: { value: 1.6 },
    uCausticSpeed: { value: CONFIG.CAUSTIC_SPEED }, uDeep: { value: PALETTE.deep }, uCyan: { value: PALETTE.cyan }, uAbyss: { value: PALETTE.abyss }, uAmber: { value: PALETTE.amber },
    uVent: { value: new THREE.Vector3(0, -100, 0) }, uWallTex: { value: null }, uUseWallTex: { value: 0 }, uFog: { value: GRADE.fog }, uWallGain: { value: 0.8 }, uVeinTex: { value: null }, uUseVeinTex: { value: 0 },
    ...gradeUniforms(), ...LIGHT_U,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide,
    vertexShader: /* glsl */`
      attribute float aUp; varying vec3 vLocal; varying float vUp; varying vec2 vUv; varying float vDist; varying float vShade; varying vec3 vN;
      ${HL_VS}
      void main(){ vLocal = position; vUp = aUp; vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vec3 toEye = cameraPosition - wp.xyz; vDist = length(toEye);
        vec3 n = normalize(mat3(modelMatrix) * normal); vN = n; hlVertex(wp.xyz, n, 0.0);   // inward rock normal (displaced geometry); headlight terms
        vShade = 0.42 + 0.48 * max(dot(n, toEye / vDist), 0.0) + 0.22 * max(n.y, 0.0);    // sub headlamp + soft light from the ice above -> relief reads
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`precision mediump float;
      uniform highp float uTime; uniform highp vec4 uRipples[${MAX_RIPPLES}]; uniform highp vec3 uVent;
      uniform float uBeat, uBass, uMood, uBreath, uBeatFlash, uCalm, uRippleGain, uRippleSpeed, uRippleLife, uRippleWidth, uCausticSpeed, uUseWallTex, uFog, uWallGain, uUseVeinTex;
      uniform vec3 uDeep, uCyan, uAbyss, uAmber, uFogCol; uniform sampler2D uWallTex, uVeinTex;
      varying highp vec3 vLocal; varying float vUp; varying vec2 vUv; varying float vDist; varying float vShade; varying vec3 vN;
      ${NOISE}
      ${GRADE_GLSL}
      ${HL_FS}
      void main(){
        vec3 wall = vec3(0.025, 0.11, 0.19), bed = vec3(0.02, 0.085, 0.11), ice = vec3(0.08, 0.22, 0.31);
        vec3 base = mix(wall, bed, smoothstep(-0.35, -0.7, vUp));
        base = mix(base, ice, smoothstep(0.55, 0.9, vUp));
        float tv = 0.0;
        vec3 tt = vec3(0.35); if (uUseWallTex > 0.5) { tt = texture2D(uWallTex, vUv).rgb; base *= 0.6 + uWallGain * tt; tv = veinMask(tt); }
        if (uUseVeinTex > 0.5) tv = max(tv, texture2D(uVeinTex, vUv).r);   // thickened + blurred vein mask (tex/tunnel-veins.png): survives HMD res / foveation   // tex/tunnel.jpg (colour, cyan veins) sets gain 1.25; grey walls.jpg 0.8
        vec3 hl = headlight(normalize(vN), 0.0);                            // sub spotlights on the displaced rock (0 in glow mode)
        base = hmdGrade(base * vShade * uAmb + (base * 0.5 + tt * 0.11) * hl) + uWallGlow * (0.75 + 0.25 * vShade);   // + unlit dim-teal rock glow (WALL_GLOW)
        vec3 p = vLocal * 0.15; p.xz += sin(p.zx * 2.1) * 0.18;
        float ridge = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
        float vein = pow(ridge, 34.0) + 0.06 * pow(ridge, 6.0);
        float wallMask = smoothstep(-0.8, -0.45, vUp) * (1.0 - smoothstep(0.6, 0.95, vUp) * 0.6);
        vec3 veinCol = mix(uDeep, uCyan, uMood);
        float glow = 0.32 + 0.18 * uBreath + (uBeatFlash * uBeat + 0.35 * uBass) * uCalm;
        vec3 col = base + veinCol * vein * glow * wallMask * (1.0 + 0.4 * uVeinGlow) * mix(0.45, 1.0, clamp(uAmb * 4.0, 0.0, 1.0));   // procedural veins fainter in headlights mode
        if (uRippleGain > 0.0) for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          float age = float(uTime - uRipples[i].w);
          if (age < 0.0 || age > uRippleLife) continue;
          float x = (length(vLocal - uRipples[i].xyz) - age * uRippleSpeed) / uRippleWidth;
          float life = smoothstep(0.0, 1.5, age) * (1.0 - smoothstep(uRippleLife * 0.4, uRippleLife, age));
          col += veinCol * exp(-x * x) * life * uRippleGain * uCalm * (0.35 + 0.65 * vein) * wallMask;
        }
        float causMask = smoothstep(-0.55, -0.8, vUp) * 0.6 + smoothstep(0.6, 0.9, vUp) * 0.8;
        if (causMask > 0.001) {
          highp vec2 c = vLocal.xz * 0.35; highp float ct = mod(uTime * uCausticSpeed, 6283.1853);   // highp: on Quest (Adreno) mediump = fp16, and fp16 sin() of these large phases breaks
          highp float ca = sin(c.x * 1.7 + ct * 0.31 + sin(c.y * 1.3 + ct * 0.21)) * sin(c.y * 1.9 - ct * 0.27 + sin(c.x * 1.1 - ct * 0.17));
          ca = 0.5 * ca + 0.5 * sin(c.y * 1.6 - ct * 0.29 + sin(c.x * 1.4 - ct * 0.19)) * sin(c.x * 1.8 + ct * 0.25 + sin(c.y * 1.2 + ct * 0.15));
          col += mix(uDeep, uCyan, 0.5 + 0.3 * uMood) * pow(abs(ca), 6.0) * causMask * (0.10 + 0.05 * uBreath) * mix(0.3, 1.0, clamp(uAmb * 4.0, 0.0, 1.0));   // dimmer in headlights mode (deep black)
        }
        col += mix(uCyan, vec3(0.55, 1.0, 1.0), 0.25) * tv * uVeinGlow * (0.30 + 0.25 * glow) * (0.75 + 0.25 * wallMask) * mix(0.55, 1.0, clamp(uAmb * 4.0, 0.0, 1.0));   // emissive painted veins (unshaded, unfogged-ish: they glow)
        float dv = length(vLocal - uVent);
        col += uAmber * (exp(-dv * dv / 30.0) * 0.55 + exp(-dv * dv / 400.0) * 0.12) * (0.85 + 0.15 * uBreath);   // warm vent glow on nearby rock
        col = mix(col, uFogCol, (1.0 - exp(-vDist * uFog)) * (1.0 - 0.5 * tv));   // depth fog toward (lifted) abyssal blue; veins punch through a little
        col += hlBeam();                                                       // in-water beam haze in front of the rock
        gl_FragColor = vec4(softClip(col), 1.0);
      }`,
  });
  // geometry: rings perpendicular to the HORIZONTAL tangent (no Frenet twist), lumpy radius, flattened lakebed; chunked for frustum culling
  const pos = [], up = [], uv = [], chunks = [];
  const c = new THREE.Vector3(), c2 = new THREE.Vector3(), side = new THREE.Vector3();
  const ringPts = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings * L; path.pointOf(s, c); const yaw = path.yawOf(s);
    side.set(Math.cos(yaw), 0, -Math.sin(yaw));    // horizontal right-vector of the heading
    const R = tunnelRadius(s, L); const ring = [];
    const reps = Math.max(1, Math.round(2 * Math.PI * R / 7));
    for (let k = 0; k <= radial; k++) {
      const th = k / radial * Math.PI * 2;          // 0 = straight down (floor seam hidden under the lakebed)
      const sn = Math.sin(th), cs = -Math.cos(th);   // sn: sideways, cs: vertical (-1 floor .. 1 ceiling)
      const lump = 1 + 0.10 * Math.sin(3 * th + s * 0.21) * Math.cos(2 * th - s * 0.13) + 0.05 * Math.sin(7 * th + s * 0.5);
      // irregular rock: chunky outcrops (thresholded fbm) + fine roughness, displaced INWARD along the ring radius in 3D noise space
      const nx = c.x + side.x * sn * R, ny = c.y + cs * R, nz = c.z + side.z * sn * R;
      const big = fbm3(nx * 0.11, ny * 0.11, nz * 0.11), fine = vnoise3(nx * 0.55, ny * 0.55, nz * 0.55);
      const cw = chamberWeight(s, L), backdropSide = sn < -0.2 ? 1 : 0;   // keep the backdrop side of the VENTS chamber clear so its painting is not hidden
      // test #10: the jelly + pillars paintings are gone, so their side keeps its full rocky relief (only the lava-vent backdrop side stays smooth)
      const cwV = (() => { let d = Math.abs(s - CHAMBERS[1] * L); d = Math.min(d, L - d); return Math.exp(-(d * d) / (2 * 9 * 9)); })();
      const amp = 3.2 * (1 - 0.55 * cw - 0.35 * cwV * backdropSide);
      const out = Math.max(0, big - 0.42) / 0.58;   // 0..1, sparse lumps
      let rr = R * lump - amp * Math.pow(out, 0.8) * 1.6 - 0.55 * (fine - 0.5) * 2;
      rr = Math.max(rr, 7.0);                        // hard clearance guard (eye on the path)
      let x = sn * rr, y = cs * rr;
      if (y < FLOOR) y = FLOOR - (y - FLOOR) * -0.08;
      if (y < FLOOR - 1.5) y = FLOOR - 1.5;
      if (y < FLOOR + 0.4 && cs < -0.3) y = Math.min(y + 0.6 * out, FLOOR + 0.6);   // low boulders on the lakebed
      ring.push([c.x + side.x * x, c.y + y, c.z + side.z * x, cs, s / 7, k / radial * reps]);
    }
    ringPts.push(ring);
  }
  // smooth vertex normals over the whole ring grid (no seams between chunks), oriented toward the path (inside of the tunnel)
  const ringN = ringPts.map(() => []), a = new THREE.Vector3(), b = new THREE.Vector3(), nn = new THREE.Vector3(), cc = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) {
    const ip = ringPts[Math.min(rings, i + 1)], im = ringPts[Math.max(0, i - 1)], R0 = ringPts[i]; path.pointOf(i / rings * L, cc);
    for (let k = 0; k <= radial; k++) {
      const kp = (k + 1) % radial, km = (k - 1 + radial) % radial;
      a.set(ip[k][0] - im[k][0], ip[k][1] - im[k][1], ip[k][2] - im[k][2]); b.set(R0[kp][0] - R0[km][0], R0[kp][1] - R0[km][1], R0[kp][2] - R0[km][2]);
      nn.crossVectors(a, b).normalize(); if (nn.dot(cc.clone().sub(new THREE.Vector3(R0[k][0], R0[k][1], R0[k][2]))) < 0) nn.negate();
      ringN[i].push([nn.x, nn.y, nn.z]);
    }
  }
  for (let r0 = 0; r0 < rings; r0 += ringsPerChunk) {
    const r1 = Math.min(rings, r0 + ringsPerChunk), P = [], U = [], V = [], I = [], Nn = [];
    for (let i = r0; i <= r1; i++) ringPts[i].forEach((q, k) => { P.push(q[0], q[1], q[2]); U.push(q[3]); V.push(q[4], q[5]); Nn.push(...ringN[i][k]); });
    const w = radial + 1;
    for (let i = 0; i < r1 - r0; i++) for (let k = 0; k < radial; k++) { const a = i * w + k, b = a + w; I.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aUp', new THREE.Float32BufferAttribute(U, 1)); g.setAttribute('uv', new THREE.Float32BufferAttribute(V, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    g.setIndex(I); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.renderOrder = -10; group.add(m); chunks.push(m);
  }
  let next = 0;
  return { group, uniforms, chunks, ringPts,
    ripple(p, time) { ripples[next].set(p.x, p.y, p.z, time); next = (next + 1) % MAX_RIPPLES; } };
}

/* ------------------------------------------------------------------ cockpit ------------------------------------------------------------------ */
// Seated cockpit around the user (eye at y=eyeY, looking -Z). Rigidly attached to the user's reference space: it never moves.
// Styled after the Oct 2026 concept: dark gunmetal shell, big oval (superellipse) front window with a raised frame,
// textured instrument console (cyan screens, sonar in the middle: tex/cockpit-dash.jpg) and a small round skylight overhead.
export const COCKPIT_PALETTE = { top: [0.11, 0.135, 0.155], bot: [0.035, 0.045, 0.055], frame: [0.16, 0.19, 0.21], frameBot: [0.07, 0.085, 0.10], trim: [0.3, 0.85, 0.9] };
export function createCockpit({ eyeY = 1.2 } = {}) {
  const g = new THREE.Group(); g.name = 'cockpit'; const CP = COCKPIT_PALETTE;
  const shellMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const shade = (geo, top = CP.top, bot = CP.bot, y0 = 0, y1 = 2.1) => {
    geo.computeBoundingBox(); const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0))); for (let k = 0; k < 3; k++) col[i * 3 + k] = Math.pow(bot[k] + (top[k] - bot[k]) * t, 2.2); }   // values are display (sRGB) -> linear
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
  };
  const W = 1.15, FZ = -1.2, BZ = 0.9, H = 2.15;
  // oval front window: superellipse |x/a|^n + |y/b|^n = 1 (n=4.5 reads as a rounded oval yet still frames the music panel)
  const winA = 1.05, winB = 0.56, winCY = eyeY + 0.13, winN = 4.5;
  const oval = (sc, n = 96) => { const pts = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push(new THREE.Vector2(Math.sign(c) * Math.pow(Math.abs(c), 2 / winN) * winA * sc, winCY + Math.sign(s) * Math.pow(Math.abs(s), 2 / winN) * winB * sc)); } return pts; };
  const winPts = oval(1), framePts = oval(1.075);
  const front = new THREE.Shape(); front.moveTo(-W, 0); front.lineTo(W, 0); front.lineTo(W, H); front.lineTo(-W, H); front.lineTo(-W, 0);
  front.holes.push(new THREE.Path(framePts.slice().reverse()));
  const fg = shade(new THREE.ShapeGeometry(front, 8)); fg.translate(0, 0, FZ); g.add(new THREE.Mesh(fg, shellMat));
  // raised window frame ring (lighter metal), slightly proud of the wall
  const rg = new THREE.BufferGeometry(), rp = [], ri = [], nW = winPts.length;   // explicit strip (earcut fails on a thin ring)
  for (let i = 0; i < nW; i++) { rp.push(winPts[i].x, winPts[i].y, FZ + 0.012, framePts[i].x, framePts[i].y, FZ + 0.012); const j = (i + 1) % nW; ri.push(2 * i, 2 * i + 1, 2 * j, 2 * j, 2 * i + 1, 2 * j + 1); }
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); shade(rg, CP.frame, CP.frameBot, winCY - winB, winCY + winB); g.add(new THREE.Mesh(rg, shellMat));
  // side walls with portholes (z along the wall)
  const portZ = -0.25, portY = eyeY + 0.12, portR = 0.24, portholes = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape(); sh.moveTo(FZ, 0); sh.lineTo(BZ, 0); sh.lineTo(BZ, H); sh.lineTo(FZ, H); sh.lineTo(FZ, 0);
    const ph = new THREE.Path(); ph.absarc(portZ, portY, portR, 0, Math.PI * 2, true); sh.holes.push(ph);
    const sg = new THREE.ShapeGeometry(sh, 16);
    const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i); p.setXYZ(i, sx * W, p.getY(i), u); }   // shape (z, y) -> wall at x = ±W
    shade(sg); sg.computeBoundingSphere();
    g.add(new THREE.Mesh(sg, shellMat)); portholes.push(new THREE.Vector3(sx * W, portY, portZ));
  }
  // ceiling with a small round skylight (shape in x,z), floor, back wall
  const skyZ = -0.35, skyR = CONFIG.SKYLIGHT_R ?? 0.52;   // test #8: 2x the test-#7 hole (0.26) so the whole 9 m manta fits in it overhead
  const cs = new THREE.Shape(); cs.moveTo(-W, FZ); cs.lineTo(W, FZ); cs.lineTo(W, BZ); cs.lineTo(-W, BZ); cs.lineTo(-W, FZ);
  const sk = new THREE.Path(); sk.absarc(0, skyZ, skyR, 0, Math.PI * 2, true); cs.holes.push(sk);
  const ceil = new THREE.ShapeGeometry(cs, 24); { const p = ceil.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i), H, p.getY(i)); }
  shade(ceil, [0.075, 0.095, 0.11], [0.075, 0.095, 0.11]); ceil.computeBoundingSphere(); g.add(new THREE.Mesh(ceil, shellMat));
  const skyRing = new THREE.RingGeometry(skyR, skyR + 0.06 * Math.max(1, skyR / 0.26) ** 0.6, 64, 1); skyRing.rotateX(Math.PI / 2); skyRing.translate(0, H - 0.01, skyZ);
  shade(skyRing, CP.frame, CP.frame); g.add(new THREE.Mesh(skyRing, shellMat));
  // skylight content: a self-lit "ice window" disc sitting just above the hole (headset test #4: the bare hole read black in the HMD).
  // Unlit, unfogged, view-dependent (rays hit virtual layers above the glass -> real parallax in each eye), never frustum culled, no world dependency.
  /* Headset test #6 (Oct 18 evening): the old disc read as a flat, static, saturated cyan plate. Causes: (1) the base "ice" colour alone was
     (0.35, 0.85, 1.0) and the soft clip at 0.8 squashed base + caustics into one flat cyan level, so the caustics had almost no contrast left;
     (2) the caustic cells were ~2 m wide on the sheet (only one blurry blob fits in the 0.26 m hole) and moved at ~0.06 m/s, so the only visible
     change was a 15 % global breathing. uTime DOES update every frame (cockpit.update in main.js); the grade never touches this material.
     Now: deep-black base, light only where it filters down (dim glow straight up, darker rim), three depth layers with parallax:
       near  0.35 m : rippling underside of the ice (refraction warp of everything behind it) + a few drifting snow motes
       mid   2.2 m  : sharp animated caustic web (iterative water-caustic), drifting slowly
       far   7 m    : soft wide caustic glow + slowly sweeping light shafts from an off-centre bright glowSpot, and a dark shape (a floe / big
                      creature shadow) gliding across now and then.
     Peak display values ~0.7 on the thin caustic cores, mean ~0.12, black rim: fits the deep-black ride. All time terms are periodic in t mod 3600 s. */
  const skyU = { uTime: { value: 0 }, uCyan: { value: PALETTE.cyan }, uC: { value: new THREE.Vector3(0, H + 0.02, skyZ) }, uR: { value: skyR },
    uSkyGain: { value: CONFIG.SKYLIGHT_GAIN ?? 1 }, uIce: ICE_TEX, uUseIce: ICE_TEX_ON, uSkyClear: { value: CONFIG.SKYLIGHT_CLEAR ?? 0.6 }, uSkyPart: SKY_PART_U };
  /* test #7: treated like the side windows. A real moving ice/water surface (tex/walls.jpg frost, already in memory for the ice columns) drifting at
     the same speeds as the chamber-backdrop layers (drift ~0.02 m/s, shimmer ~0.5 rad/s, caustic phase 0.16 rad/s), and SEE-THROUGH: premultiplied
     blending (rgb = the ice's own glow, alpha = how much of the world above it hides; SKYLIGHT_CLEAR ~0.6 of the world shows through the clear ice),
     drawn after the world (transparent pass, cockpit renderOrder 5), so the big manta gliding over the sub reads BEYOND the ice layers. */
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    vertexShader: 'varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: /* glsl */`precision highp float; uniform float uTime, uR, uSkyGain, uUseIce, uSkyClear, uSkyPart; uniform vec3 uCyan, uC; uniform sampler2D uIce; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      float caustic(vec2 p, float t){   // iterative water caustic (thin bright web), 3 iterations
        p = mod(p, 6.28318) - 250.0; vec2 i = p; float c = 1.0; const float inten = 0.005;   // tileable; offset keeps p away from 0 (no 1/0)
        for (int n = 0; n < 3; n++){ float tt = t * (1.0 - (3.5 / float(n + 1))); i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
          c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))); }
        c /= 3.0; c = 1.17 - pow(c, 1.4); return min(pow(abs(c), 8.0), 4.0); }
      void main(){ vec3 d = normalize(vW - cameraPosition); float up = max(d.y, 0.08); vec2 q = d.xz / up;   // q: tangent-plane direction
        float t = mod(uTime, 3600.0);
        // near layer: rippling ice underside -> refraction warp (moves visibly, ~4 s ripples)
        vec2 pn = vW.xz + q * 0.35;
        vec2 warp = vec2(n2(pn * 5.0 + vec2(t * 0.11, 0.0)), n2(pn * 5.0 + vec2(3.1, -t * 0.095))) - 0.5;   // ~0.5 rad/s ripple, like the backdrop shimmer
        // mid layer: sharp caustic web on the ice 2.2 m up, drifting ~0.1 m/s
        vec2 pm = vW.xz + q * 2.2 + warp * 0.18 + vec2(t * 0.022, t * 0.014);   // ~0.026 m/s drift (backdrop far/mid layers)
        float cm = caustic(pm * 5.5, t * 0.16);   // caustic phase 0.16 rad/s = backdrop caustic ripple
        // far layer: wide soft caustic glow + shafts, 7 m up (more parallax shift than the mid layer)
        vec2 pf = vW.xz + q * 7.0 + warp * 0.5;
        float cf = caustic(pf * 1.1 + vec2(t * 0.008, 0.0), t * 0.12);
        vec2 sp = q - vec2(0.42, -0.22); float sa = atan(sp.y, sp.x), sr = length(sp);   // bright glowSpot slightly off-centre: shafts radiate from it
        float shafts = pow(0.5 + 0.5 * sin(sa * 9.0 + 2.0 * sin(sa * 4.0 + t * 0.11) + t * 0.05), 4.0) * (0.35 + 0.65 * n2(vec2(sa * 3.0, t * 0.2)));
        float glowSpot = exp(-sr * sr * 1.2);
        // a dark shape gliding across the far layer (period ~70 s, crosses in ~25 s), soft-edged; it shades what is behind it
        float ph = mod(t, 110.0); vec2 sc = vec2(-8.0 + ph * 0.15, 1.6 * sin(t * 0.021) - 0.4);
        vec2 so = (pf - sc) * vec2(1.0, 2.2); float shade = 1.0 - 0.45 * smoothstep(1.4, 0.7, length(so) + 0.25 * sin(so.x * 3.0 + t * 0.4));
        // composition (display values, deep-black base)
        float sky = smoothstep(0.25, 1.0, up);                                              // brighter straight up, darker at grazing angles
        float rr = length(vW.xz - uC.xz) / uR; float rim = smoothstep(1.02, 0.45, rr);       // dark rim inside the frame (thickness of the ice)
        vec3 deep = vec3(0.006, 0.018, 0.030);
        vec3 glow = vec3(0.035, 0.13, 0.165) * (0.3 + 0.9 * cf) * (0.45 + 0.55 * glowSpot) * sky;
        vec3 caus = mix(vec3(0.16, 0.46, 0.52), vec3(0.75, 0.95, 0.95), smoothstep(0.35, 0.9, cm)) * cm * 2.4 * (0.35 + 0.65 * sky);
        vec3 rays = vec3(0.05, 0.17, 0.20) * shafts * glowSpot * smoothstep(0.08, 0.4, sr) * 2.0 * sky;
        float mq = 0.0; { vec2 g = pn * 9.0 + vec2(t * 0.035 * 9.0 * 0.12, t * 0.035 * 9.0 * 0.07); vec2 ci = floor(g), cf2 = fract(g); float hh = h21(ci);   // drifting motes (near layer)
          vec2 cp = vec2(fract(hh * 13.7), fract(hh * 71.3)) * 0.6 + 0.2; mq = step(0.8, hh) * smoothstep(0.12, 0.0, length(cf2 - cp)) * (0.5 + 0.5 * sin(t * 0.9 + hh * 30.0)); }
        // the ice surface itself: frost texture on the underside (near) + a second, larger, slower sample deeper in the ice (parallax), both drifting
        float fr = 0.5, fr2 = 0.5; if (uUseIce > 0.5) { fr = texture2D(uIce, pn * 0.55 + vec2(t * 0.020, t * 0.013) + warp * 0.035).r; fr2 = texture2D(uIce, pm * 0.22 - vec2(t * 0.011, t * 0.017)).r; }
        float frost = smoothstep(0.25, 0.85, fr * 0.65 + fr2 * 0.35);
        vec3 c = deep * 0.6 + (glow + caus + rays) * shade * (0.75 + 0.5 * frost) + vec3(0.06, 0.14, 0.17) * frost * frost * (0.35 + 0.65 * sky) + vec3(0.25, 0.4, 0.42) * mq * 0.5;
        c *= rim * uSkyGain * (1.0 - 0.6 * uSkyPart);   // while the big manta is overhead the ice's own glow steps back so its outline reads (SKYLIGHT_PART)
        // coverage: frosty ice hides more of what is above; clear patches let the world (and the passing manta) through. Rim = solid dark ice.
        float a = clamp(1.0 - uSkyClear + 0.35 * frost + 0.35 * min(cm, 1.0), 0.15, 0.92); a *= 1.0 - 0.45 * uSkyPart; a = mix(0.97, a, rim);
        float m = max(max(c.r, c.g), c.b); if (m > 0.7) c *= (0.7 + 0.3 * (1.0 - exp(-(m - 0.7) / 0.3))) / m;   // soft clip (cores only)
        gl_FragColor = vec4(c, a); }` });
  const skyDisc = new THREE.Mesh(new THREE.CircleGeometry(skyR + 0.01, 48), skyMat); skyDisc.rotation.x = Math.PI / 2; skyDisc.position.set(0, H + 0.02, skyZ);
  skyDisc.frustumCulled = false; skyDisc.name = 'skylight'; g.add(skyDisc);
  const floor = shade(new THREE.PlaneGeometry(2 * W, BZ - FZ), [0.025, 0.032, 0.04], [0.025, 0.032, 0.04]); floor.rotateX(-Math.PI / 2); floor.translate(0, 0, (FZ + BZ) / 2); g.add(new THREE.Mesh(floor, shellMat));
  const back = shade(new THREE.PlaneGeometry(2 * W, H)); back.translate(0, H / 2, BZ); g.add(new THREE.Mesh(back, shellMat));
  // dashboard: sloped console below the window line
  const winY0 = winCY - winB, winY1 = winCY + winB;
  const dz0 = FZ + 0.02, dz1 = -0.58, dy0 = eyeY - 0.32, dy1 = eyeY - 0.78;
  const dash = new THREE.BufferGeometry();
  dash.setAttribute('position', new THREE.Float32BufferAttribute([-W, dy0, dz0, W, dy0, dz0, W, dy1, dz1, -W, dy1, dz1, -W, 0, dz1, W, 0, dz1], 3));
  dash.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 5, 3, 5, 4]); shade(dash, [0.09, 0.11, 0.125], [0.03, 0.04, 0.05]);
  g.add(new THREE.Mesh(dash, shellMat));
  const slope = new THREE.Vector3(0, dy1 - dy0, dz1 - dz0).normalize();
  const dashPt = (x, f) => new THREE.Vector3(x, dy0 + (dy1 - dy0) * f + 0.004, dz0 + (dz1 - dz0) * f);
  const tilt = Math.atan2(-(dy1 - dy0), dz1 - dz0);
  // instrument face: textured plane on the console (right of the music panel / i button), filled in by setDashTexture()
  const slopeLen = Math.hypot(dy1 - dy0, dz1 - dz0);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x1b2a30 });   // dim placeholder until the texture arrives
  const dashFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dashMat);
  const dashW = 1.15, dashH = Math.min(slopeLen * 0.62, dashW * 269 / 1024);
  dashFace.scale.set(dashW, dashH, 1); dashFace.position.copy(dashPt(0.32, 0.42)).addScaledVector(new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)), 0.002); dashFace.rotation.x = -Math.PI / 2 + tilt; g.add(dashFace);
  // trim lines (window, skylight, portholes), subtle cyan
  const trim = new THREE.LineBasicMaterial({ color: new THREE.Color(...CP.trim), transparent: true, opacity: 0.3 });
  g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(winPts.map((p) => new THREE.Vector3(p.x, p.y, FZ + 0.016))), trim));
  { const pts = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * skyR, H - 0.015, skyZ + Math.sin(a) * skyR)); } g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), trim)); }
  for (const sx of [-1, 1]) {
    const pts = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; pts.push(new THREE.Vector3(sx * (W - 0.004), portY + Math.sin(a) * portR, portZ + Math.cos(a) * portR)); }
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), trim));
  }
  // one small amber lamp (slow breathing)
  const lampMat = new THREE.MeshBasicMaterial({ color: PALETTE.amber, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), lampMat); lamp.position.copy(dashPt(1.02, 0.55)); lamp.rotation.x = -Math.PI / 2 + tilt; g.add(lamp);
  g.traverse((o) => { o.renderOrder = 5; });   // drawn after the world, before panels
  return {
    group: g, skyDisc, skyMat, window: { x0: -winA, x1: winA, y0: winY0, y1: winY1, z: FZ, shape: 'superellipse', n: winN }, skylight: { x: 0, z: skyZ, r: skyR, y: H }, portholes, dashPt, slope, dashFace,
    /** tex/cockpit-dash.jpg: instrument console cropped from the concept art (sRGB, mipmapped). */
    setDashTexture(t) { if (!t.isCompressedTexture) t.colorSpace = THREE.SRGBColorSpace; dashMat.map = t; dashMat.color.setRGB(0.85, 0.85, 0.85); dashMat.needsUpdate = true;
      if (t.image) { const h = Math.min(slopeLen * 0.62, dashW * t.image.height / t.image.width); dashFace.scale.set(h * t.image.width / t.image.height, h, 1); } },
    update(t) { lampMat.opacity = 0.35 + 0.15 * Math.sin(t * 0.4); skyU.uTime.value = t; },
  };
}

/* ------------------------------------------------------------------ comfort vignette (head-locked, off by default) ------------------------------------------------------------------ */
export function createVignette(camera) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAmt: { value: 0 }, uCol: { value: PALETTE.abyss } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'precision mediump float; uniform float uAmt; uniform vec3 uCol; varying vec2 vP; void main(){ float r = length(vP) / 0.32; gl_FragColor = vec4(uCol, smoothstep(0.55, 1.0, r) * uAmt); }',
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), mat); m.position.z = -0.3; m.renderOrder = 50; m.visible = false; m.frustumCulled = false;
  camera.add(m);
  return { mesh: m, set(on, amt) { m.visible = on && amt > 0.01; mat.uniforms.uAmt.value = amt; } };
}

/* ------------------------------------------------------------------ ride controller ------------------------------------------------------------------ */
const smootherstep = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * x * (x * (x * 6 - 15) + 10); };
export function createRide(path, rideWorld, { eyeY = 1.2, cruise = CONFIG.RIDE_SPEED, easeS = CONFIG.RIDE_EASE_S, startS = 0 } = {}) {
  rideWorld.matrixAutoUpdate = false;
  const st = { s: startS, speed: 0, yaw: path.yawOf(startS), pos: new THREE.Vector3(), running: false, phase: 'stopped', t0: 0, v0: 0 };
  const m = new THREE.Matrix4(), tr = new THREE.Matrix4();
  function apply() {
    path.pointOf(st.s, st.pos); st.yaw = path.yawOf(st.s);
    // world = inverse(subPose): rotate by -yaw about the user, after translating the path point to the eye
    m.makeRotationY(-st.yaw); tr.makeTranslation(-st.pos.x, -(st.pos.y - eyeY), -st.pos.z); m.multiply(tr);
    rideWorld.matrix.copy(m); rideWorld.matrixWorldNeedsUpdate = true;
  }
  apply();
  return {
    state: st, easeS,
    get cruise() { return cruise; },
    start(now) { st.phase = 'in'; st.t0 = now; st.v0 = st.speed; st.running = true; },
    /** Change cruise speed. Never jumps: if moving, the speed eases from its current value to v over easeS (smootherstep). */
    setCruise(v, now) { cruise = v; if (st.running && st.phase !== 'out') { st.phase = 'in'; st.t0 = now; st.v0 = st.speed; } },
    stop(now) { if (!st.running) return; st.phase = 'out'; st.t0 = now; st.v0 = st.speed; },
    /** now in seconds, dt in seconds. Speed follows a smootherstep ramp; never the music. */
    update(now, dt) {
      if (st.phase === 'in') { const k = smootherstep((now - st.t0) / easeS); st.speed = st.v0 + (cruise - st.v0) * k; if (k >= 1) st.phase = 'cruise'; }
      else if (st.phase === 'out') { const k = smootherstep((now - st.t0) / easeS); st.speed = st.v0 * (1 - k); if (k >= 1) { st.phase = 'stopped'; st.running = false; st.speed = 0; } }
      else if (st.phase === 'cruise') st.speed = cruise;
      st.s = (st.s + st.speed * dt) % path.L;
      apply();
    },
    /** Analytic comfort check over a full lap at cruise speed: max yaw rate, yaw accel, lateral accel, vertical speed, and ramp accel. */
    analyzeLap(dt = 0.05) {
      let maxYawRate = 0, maxYawAcc = 0, maxLat = 0, maxVert = 0, prevRate = null; const n = Math.ceil(path.L / (cruise * dt)); const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const s = i * cruise * dt, y0 = path.yawOf(s), y1 = path.yawOf(s + cruise * dt);
        let dy = y1 - y0; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;   // wrap at the lap seam
        const rate = dy / dt; maxYawRate = Math.max(maxYawRate, Math.abs(rate)); maxLat = Math.max(maxLat, Math.abs(rate * cruise));
        if (prevRate !== null) maxYawAcc = Math.max(maxYawAcc, Math.abs(rate - prevRate) / dt); prevRate = rate;
        path.pointOf(s, p0); path.pointOf(s + cruise * dt, p1); maxVert = Math.max(maxVert, Math.abs(p1.y - p0.y) / dt);
      }
      return { lapSeconds: path.L / cruise, lengthM: path.L, maxYawRateDeg: maxYawRate * 180 / Math.PI, maxYawAccDeg: maxYawAcc * 180 / Math.PI,
        maxLateralAcc: maxLat, maxVerticalSpeed: maxVert, maxRampAcc: cruise * 1.875 / easeS, pitchRollDeg: 0, cruise };
    },
  };
}

/* ------------------------------------------------------------------ ride world content ------------------------------------------------------------------ */
// Everything lives in tunnel coordinates inside `rideWorld`. Placement keeps every object >= MIN_CLEARANCE (5.9 m) from the path (the cockpit).
export function buildRideWorld(path, rideWorld, { eyeY = 1.2 } = {}) {
  const { L } = path, tmp = new THREE.Vector3(), side = new THREE.Vector3();
  const frameAt = (s, lateral, up, out) => { path.pointOf(s, out); const yaw = path.yawOf(s); side.set(Math.cos(yaw), 0, -Math.sin(yaw)); return out.addScaledVector(side, lateral).setY(out.y + up); };
  const tunnel = createTunnel(path); rideWorld.add(tunnel.group);
  // jellies: in the chambers, high and to the side (lateral ×1.15, +0.4 m: keeps bells + tentacles >= 5.9 m from the cockpit) so bells AND tentacles stay clear of the window
  const jSpots = [[0.09, 9.5, 5.5], [0.15, -10, 4.5], [0.12, -9, 8.5], [0.42, -10.5, 4.0], [0.47, 9.5, 6.0], [0.45, 2, 10.5], [0.73, 10, 5.0], [0.79, -9.5, 4.5]];   // all in chambers (R~18 m), high and to the side
  const anchors = jSpots.map(([f, lat, up]) => ({ pos: frameAt(f * L, lat * 1.15, up + 0.4, new THREE.Vector3()), r: 1.2 + Math.random() * 0.8 }));
  { const P = new THREE.Vector3(), q = new THREE.Vector3(), away = new THREE.Vector3();   // worst-case guard (size 1.0): push an anchor outward until bell + tentacles clear MIN_CLEARANCE
    for (const a of anchors) for (let it = 0; it < 20; it++) { let best = 1e9, bp = null; q.copy(a.pos); q.y -= 1.8;
      for (let s = 0; s < L; s += 1) { path.pointOf(s, P); const d = P.distanceTo(q); if (d < best) { best = d; bp = P.clone(); } }
      if (best - (a.r + 2.2 + 0.6) >= MIN_CLEARANCE + 0.1) break; away.subVectors(a.pos, bp).setY(0).normalize(); a.pos.addScaledVector(away, 0.4); a.pos.y += 0.15; } }
  const jellies = createJellies({ anchors }); rideWorld.add(jellies.group);
  // marine snow: 700 points recycled around the sub (uCenter follows the sub in the shader — zero CPU per frame)
  const snow = createMarineSnow({ count: CONFIG.SNOW_COUNT, box: 22, light: LIGHT_U }); rideWorld.add(snow.mesh);
  // light shafts in two chambers, kept >= 10 m to the side, slimmer bases
  const shafts = [];
  for (const [f, sideSign] of [[CHAMBERS[0], 1], [CHAMBERS[2], -1]]) {
    const sh = createLightShafts({ count: 3 }); const base = frameAt(f * L, 0, 0, new THREE.Vector3());
    sh.group.position.set(base.x, base.y + 15, base.z); sh.group.rotation.y = path.yawOf(f * L);
    sh.group.children.forEach((m, i) => { m.position.set(sideSign * (10.5 + i * 1.6), 0, (i - 1) * 7); m.scale.set(0.6, 1, 0.6); m.geometry.translate(0, 26 / 2, 0); m.geometry.scale(1, 20 / 26, 1); m.geometry.translate(0, -20 / 2, 0); });
    rideWorld.add(sh.group); shafts.push(sh);
  }
  // amber vent in the middle chamber, low on the side wall
  const ventPos = frameAt(CHAMBERS[1] * L + 3, -13, -4.5, new THREE.Vector3()); tunnel.uniforms.uVent.value.copy(ventPos);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g2 = c.getContext('2d');
  const grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,190,110,1)'); grd.addColorStop(0.25, 'rgba(255,150,70,.45)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
  g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128); const vt = new THREE.CanvasTexture(c); vt.colorSpace = THREE.SRGBColorSpace;
  const vent = new THREE.Sprite(new THREE.SpriteMaterial({ map: vt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  vent.position.copy(ventPos); vent.scale.setScalar(4); rideWorld.add(vent);
  /* Amber vents (test #5: "the star"): 14 chimneys in the vents chamber (was 5) on both sides, the left row standing in front of the vents painting,
     plus 3 lone vents along the corridors. [s, lateral, height, base radius]. Every one gets a glowing crater mouth; most get a plume plane. */
  const VENTS = []; { let x = 11; const r = () => (x = (x * 16807) % 2147483647) / 2147483647; const sc = CHAMBERS[1] * L + 3;
    for (let k = 0; k < 14; k++) { const side = (k % 3 === 2) ? 1 : -1; VENTS.push([sc + (k - 6.5) * 2.9 + (r() - 0.5) * 1.6, side * (9.6 + r() * 4.8), 1.6 + r() * 2.6, 1.0 + r() * 0.9]); }
    for (const [f, lat] of [[0.29, 9.2], [0.58, -9.0], [0.95, 9.4]]) VENTS.push([f * L, lat, 1.3 + r() * 0.8, 0.9]); }
  /* test #6: 7 of the 17 chimneys stood partly or wholly BEHIND the tunnel rock (corridors are 12 m in radius, outcrops push the wall in by up to
     ~3 m, and the vents sat 9-14 m to the side, 7.3 m down), so only the top of their plume poked out of the wall: plumes floating with no chimney.
     fitVents() moves each vent (inward, then along the path if needed) until its whole stack + mouth are inside the tunnel's real cross-section
     (the displaced ring vertices, 7 rings = +-4.5 m along the path) with a 0.5 m margin, and stands its base on the actual bed under it
     (v[4] = base height; the bed is bumpy). The comfort clearance (>= 5.9 m) is re-verified by clearance(). */
  if ((CONFIG.VENT_ROCK ?? 1) > 0) fitVents();
  function fitVents() {
    const rp = tunnel.ringPts, nR = rp.length - 1, c0 = new THREE.Vector3(), sd = new THREE.Vector3();
    const sect = (s) => { const i = ((Math.round(s / L * nR) % nR) + nR) % nR, ss = i / nR * L; path.pointOf(ss, c0); const yaw = path.yawOf(ss); sd.set(Math.cos(yaw), 0, -Math.sin(yaw));
      return rp[i].map((q) => [(q[0] - c0.x) * sd.x + (q[2] - c0.z) * sd.z, q[1] - c0.y]); };
    const inside = (poly, x, y) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if ((ya > y) !== (yb > y) && x < (xb - xa) * (y - ya) / (yb - ya) + xa) c = !c; } return c; };
    const bedY = (poly, x) => { let best = -Infinity; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if ((xa > x) !== (xb > x)) { const y = ya + (yb - ya) * (x - xa) / (xb - xa); if (y < 0 && y > best) best = y; } } return best; };
    const fits = (s, lat, h, rb) => {
      const polys = [-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map((d) => sect(s + d)), sg = Math.sign(lat) || 1;
      const y0 = Math.max(...[-0.6, 0, 0.6].map((d) => bedY(polys[3], lat + d * rb))); if (!isFinite(y0)) return null;
      if (y0 > FLOOR + 0.7 || y0 < FLOOR - 1.4) return null;   // on a wall boulder / in a hole: not a bed
      const base = y0 - 0.4;
      for (const poly of polys.slice(1, 6)) for (let u = 0.15; u < 0.97; u += 0.08) if (!inside(poly, lat * u, (base + h + 0.4) * u)) return null;   // line of sight from the sub to the mouth
      for (const poly of polys) for (const f of [0.35, 0.7, 1.0]) { const y = Math.max(y0 + 0.3, base + h * f + (f === 1 ? 0.4 : 0)), r = rb * (0.36 + 0.64 * Math.pow(1 - f, 1.5)) + 0.3;
        if (!inside(poly, lat + sg * r, y) || !inside(poly, lat - sg * r, y)) return null; }
      return base; };
    const placed = [];   // keep chimneys apart (no two stacks merging): centre distance >= 1.4 (rb_i + rb_j) + 0.6
    const apart = (s, lat, rb) => placed.every(([ps, pl, pr]) => Math.hypot(ps - s, pl - lat) >= 1.4 * (rb + pr) + 0.6);
    const fitsApart = (s, lat, h, rb) => (apart(s, lat, rb) ? fits(s, lat, h, rb) : null);
    for (const v of VENTS) {
      const [s0, lat0, h, rb] = v; let done = false;
      const DS = [0, 1.5, -1.5, 3, -3, 4.5, -4.5, 6, -6, 7.5, -7.5, 9, -9, 10.5, -10.5, 12, -12];
      for (const [la, hh] of [[lat0, h], [-lat0, h], [lat0, h * 0.8], [-lat0, h * 0.8]]) {   // own side first, then the other side, then a shorter stack
        const sg = Math.sign(la);
        for (const ds of DS) { for (let lat = la; Math.abs(lat) >= 7.4; lat -= sg * 0.3) { const b = fitsApart(s0 + ds, lat, hh, rb); if (b !== null) { v[0] = s0 + ds; v[1] = lat; v[2] = hh; v[4] = b; done = true; break; } } if (done) break; }
        if (done) break; }
      v[5] = done ? 1 : 0;   // 0 = could not fit (kept as before)
      placed.push([v[0], v[1], rb]);
    }
  }
  const ventBase = (v) => v[4] ?? FLOOR - 0.4;
  const ventTop = (v, out = new THREE.Vector3()) => frameAt(v[0], v[1], ventBase(v) + v[2], out);
  // loop-video spots: one per chamber, 13 m to the side, facing the path; spots 4-5 sit in front of the chamber backdrops (backdrops are on the inside of the loop's turn, so they read through the front window)
  // test #5: 03 plume moved to the vents chamber (it was in the cathedral), 02 light ribbon to the cathedral
  const loopSpots = [[CHAMBERS[0] + 0.03, 13, 1.5], [CHAMBERS[2] + 0.02, 13, 1.0], [CHAMBERS[1] - 0.035, 12.5, 2.0], [CHAMBERS[0] + 0.005, -9, 3.5], [CHAMBERS[2] - 0.015, -8.5, 5.0]].map(([f, lat, up]) => ({ s: f * L, pos: frameAt(f * L, lat, up, new THREE.Vector3()), look: frameAt(f * L, 0, up, new THREE.Vector3()) }));   // 04 jelly portrait in front of the jelly-hall painting, 05 ice ray above the ice pillars
  const loopPlanes = [];
  function addLoop(i, tex, setAspectFrom) {
    const spot = loopSpots[i]; if (!spot || i === 2) return null;   // 03 plume: no free-floating plane any more, only the chimney-mounted instances (addLoopInstances)
    const plane = createLoopPlane(tex, { pos: spot.pos.toArray(), size: 5 });
    const m4 = new THREE.Matrix4().lookAt(spot.look, spot.pos, new THREE.Vector3(0, 1, 0)); plane.quaternion.setFromRotationMatrix(m4);
    plane.userData.spot = spot; rideWorld.add(plane); loopPlanes.push(plane); return plane;
  }
  // chamber backdrops, split into 3 depth layers so they have parallax instead of reading as a flat picture:
  //   far  : the whole painting on a gently CURVED plane (concave toward the sub), ~20 m from the approach viewpoint
  //   mid  : only the painting's lit features (veins, vents, ice: luminance mask), ~0.9 of that distance
  //   fore : dark rock silhouettes cut from the painting's dark outer edges (luminance + edge mask), ~0.8 of that distance
  // Each layer is placed on the ray from the approach viewpoint (14 m before the chamber) and scaled by its distance ratio,
  // so from that viewpoint they register exactly as the painting; as the sub glides past, the layers slide against each other.
  const backdropSpots = [[CHAMBERS[0] + 0.01, -14.5, 1.0], [CHAMBERS[1] + 0.01, -14.5, -0.5], [CHAMBERS[2] - 0.01, -14.5, 1.0]].map(([f, lat, up]) => ({ s: f * L, pos: frameAt(f * L, lat, up, new THREE.Vector3()), look: frameAt(f * L - 14, 0, up, new THREE.Vector3()) }));
  const backdrops = [], backdropLayers = [];
  // Backdrop life (test #5, BACKDROP_ANIM): each layer drifts very slowly in its own plane (fore > mid > far: real parallax between them, ~0.3-0.6 m
  // over ~2 min), so the painting never reads as a still picture in a box. All uniform-driven, no extra draws.
  const BD_VS = `uniform highp float uTime; uniform mediump float uAnim, uDrift, uPhase;   // mediump: must match the fragment stage (GLSL ES)
    varying vec2 vUv; varying float vDist; varying vec3 vWorld;
    void main(){ vUv = uv; vec3 p = position; float t = mod(uTime, 6283.0);
      p.x += uAnim * uDrift * sin(t * 0.047 + uPhase); p.y += uAnim * uDrift * 0.45 * sin(t * 0.033 + uPhase * 1.7);
      vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz; vDist = length(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
  const LAYERS = [
    { name: 'far', ratio: 1.0, bend: 0.045, seg: 24, alpha: 'e.x * e.y * smoothstep(0.03, 0.12, lum) * (1.0 - fore)', light: 1.0, order: -6, drift: 0.12, motes: 0 },
    { name: 'mid', ratio: 0.9, bend: 0.0, seg: 1, alpha: 'e.x * e.y * smoothstep(0.16, 0.34, lum)', light: 1.08, order: -5, drift: 0.32, motes: 0 },
    { name: 'fore', ratio: 0.8, bend: 0.0, seg: 1, alpha: 'fore * (1.0 - smoothstep(0.8, 0.97, max(e2.x, e2.y * 1.15)))', light: 0.55, order: -4, drift: 0.55, motes: 1 },
  ];
  function addBackdrop(i, tex, width = 21) {
    const spot = backdropSpots[i]; if (!spot) return null;
    tex.anisotropy = Math.max(tex.anisotropy, 8); if (!tex.isCompressedTexture) { tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; } tex.needsUpdate = true;   // KTX2 brings its own mips
    const aspect = tex.image ? tex.image.width / tex.image.height : 2;
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(spot.look, spot.pos, new THREE.Vector3(0, 1, 0)));
    for (const Ly of LAYERS) {
      const mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: tex }, uAbyss: LIGHT_U.uFogCol, uFog: { value: GRADE.fog }, uGain: { value: 1.15 * Ly.light * ((CONFIG.BACKDROP_GAIN || [])[i] ?? 1) }, uCyan: { value: PALETTE.cyan }, uWall: GRADE_U.uBackdropWall, uBDMode: BACKDROP_U,
          uTime: tunnel.uniforms.uTime, uAnim: BACKDROP_ANIM_U, uEnergy: BACKDROP_ENERGY_U, uDrift: { value: Ly.drift }, uPhase: { value: i * 2.1 + Ly.ratio * 5.0 },
          uDark: { value: (CONFIG.BACKDROP_DARK || [])[i] ?? 0 }, uVig: { value: (CONFIG.BACKDROP_VIGNETTE || [])[i] ?? 0 }, ...gradeUniforms(), ...LIGHT_U },
        transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: BD_VS,
        fragmentShader: `precision mediump float; uniform sampler2D uMap; uniform vec3 uAbyss, uCyan, uWall; uniform float uFog, uGain, uBDMode, uAnim, uEnergy, uPhase, uDark, uVig; uniform highp float uTime; varying vec2 vUv; varying float vDist; varying highp vec3 vWorld;
          ${GRADE_GLSL}
          ${HL_GLSL}
          void main(){ vec2 e = smoothstep(vec2(0.0), vec2(0.22, 0.2), vUv) * smoothstep(vec2(1.0), vec2(0.78, 0.6), vUv); vec2 rq = (vUv - 0.5) * 2.0; float rad = 1.0 - smoothstep(0.55, 0.98, length(rq * vec2(0.92, 1.0)));   /* edge + elliptical feather: no rectangle */
            highp float at = mod(uTime, 6283.0);
            float lum0 = dot(pow(texture2D(uMap, vUv, 3.0).rgb, vec3(0.4545)), vec3(0.3, 0.5, 0.2));                 // blurred (mip) luminance for clean silhouettes
            float litM = smoothstep(0.42, 0.7, lum0);                                                                 // lit areas of the painting (same fetch: no extra texture read)
            vec2 sh = uAnim * litM * 0.0012 * vec2(sin(vUv.y * 46.0 + at * 0.55 + uPhase), cos(vUv.x * 38.0 - at * 0.47));   // gentle water shimmer, only where lit
            vec3 t = pow(texture2D(uMap, vUv + sh).rgb, vec3(0.4545));   // back to the painting's display values (raw output, like the walls)
            /* test #7 (Scott): non-vent caverns go into deep shadow. The smooth water/haze fill (what read as a lit photo) is crushed to ~1/3 (≈1/9 light
               after the squaring below); only fine bright detail (rims, veins, jellies, pillar edges: luma above its own blurred mip) and the very brightest
               spots keep their light, so the interior is only partly visible and the depth reads from the cyan rims. Same texture fetches as before. */
            float tlum = dot(t, vec3(0.3, 0.5, 0.2));
            float keep = clamp(smoothstep(0.03, 0.14, tlum - lum0) + smoothstep(0.62, 0.9, tlum), 0.0, 1.0);
            t *= mix(1.0, 0.38 + 0.62 * keep, uDark);
            if (uAnim > 0.0) {
              highp vec2 cq = vUv * vec2(9.0, 5.0); highp float ct = at * 0.16;
              float ca = sin(cq.x * 1.7 + ct + sin(cq.y * 1.3 - ct * 0.7)) * sin(cq.y * 1.9 - ct * 0.8 + sin(cq.x * 1.1 + ct * 0.5));
              float caus = pow(abs(ca), 5.0);                                                                     // slow caustic ripple over lit rock
              float bright = smoothstep(0.35, 0.75, max(max(t.r, t.g), t.b));                                     // veins, jellies, vent fire, ice glow
              float breath = 0.5 + 0.5 * sin(at * 0.42 + vUv.x * 2.6 + uPhase);                                   // slow, travelling across the painting
              t *= 1.0 + uAnim * (0.22 * caus * litM + bright * (0.10 * breath + uEnergy));
            }
            vec2 e2 = abs(vUv - 0.5) * 2.0; float edge = smoothstep(0.45, 0.8, max(e2.x, e2.y * 1.15));   // outer band of the painting
            float fore = edge * (1.0 - smoothstep(0.16, 0.26, lum0));                              // dark rock at the painting's edges
            float hlb = uHLInt > 0.0 ? hlSpot(vWorld, -normalize(vWorld - cameraPosition), 1.0) * uHLInt * 0.35 : 0.0;   // light touch of the beams on the distant painting
            vec3 c = hmdGrade(t * t * uGain * 0.9 * (uBDMode + hlb * uHLCol)) + uCyan * veinMask(t * t) * uVeinGlow * 0.22 * min(1.0, uBDMode * uGain);   // painted veins scale with the painting gain (the hi-res pillars art is cyan all over)
            c = max(c, (uWall * (0.7 + 0.6 * t.b) + uWallGlow) * (1.0 - 0.85 * uDark));   // dark painted rock never goes darker than the graded tunnel rock around it (dark caverns: mostly off)
            // test #7: radial vignette INTO BLACK (colour), well inside the alpha feather, so no backdrop reads as a lit rectangle / photo plane
            float vr = length(rq * vec2(0.86, 1.0)); float vig = 1.0 - smoothstep(mix(0.55, 0.28, uVig), mix(0.98, 0.9, uVig), vr);
            vig = max(vig, keep * uDark);   // fine bright rims/veins survive the vignette (they never outline a rectangle); the smooth fill does not
            c = mix(c, uAbyss * (1.0 - 0.7 * uDark), 0.55 * (1.0 - exp(-vDist * uFog)));   // dark caverns: the fog veil is darker too (no grey wash over the plane)
            c *= vig;
            float lum = dot(t * t * uGain, vec3(0.3, 0.5, 0.2));
            float alpha = (${Ly.alpha}) * rad * mix(1.0, vig, uVig);   // colour AND coverage fade out: the painting dissolves into the dark tunnel behind it
            ${Ly.motes ? `if (uAnim > 0.0) {   // marine-snow motes drifting slowly up/sideways in front of the chamber (procedural: one cell lookup per pixel)
              vec2 mq = vec2(vUv.x * 46.0, vUv.y * 26.0 - at * 0.035) + vec2(sin(at * 0.05 + vUv.y * 3.0) * 0.6, 0.0);
              vec2 ci = floor(mq), cf = fract(mq); float h = fract(sin(dot(ci, vec2(127.1, 311.7))) * 43758.5453);
              vec2 cp = vec2(fract(h * 13.7), fract(h * 71.3)) * 0.7 + 0.15; float dm = length(cf - cp);
              float mote = step(0.72, h) * smoothstep(0.09, 0.0, dm) * (0.6 + 0.4 * sin(at * 0.7 + h * 40.0)) * e.x * e.y * rad * uAnim;
              c = mix(c, vec3(0.62, 0.8, 0.85) * (0.35 + 0.65 * uBDMode) * (1.0 - 0.55 * uDark) * vig, mote); alpha = max(alpha, mote * 0.8 * vig); }` : ''}
            gl_FragColor = vec4(softClip(c), alpha); }` });
      const d = spot.pos.clone().sub(spot.look), w = width * Ly.ratio, h = w / aspect;
      const geo = new THREE.PlaneGeometry(w, h, Ly.seg, 1);
      if (Ly.bend) { const p = geo.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k) / (w / 2); p.setZ(k, Ly.bend * w * x * x); } geo.computeBoundingSphere(); }   // edges curl toward the sub
      const m = new THREE.Mesh(geo, mat); m.position.copy(spot.look).addScaledVector(d, Ly.ratio); m.quaternion.copy(q);
      m.renderOrder = Ly.order; m.userData.spot = spot; m.userData.layer = Ly.name; rideWorld.add(m); backdropLayers.push(m);
      if (Ly.name === 'far') backdrops[i] = m;
    }
    return backdrops[i];
  }
  // 3D props (2 draw calls for the whole loop): rock stalagmites/stalactites + amber vent cones share one merged mesh; ice columns another.
  const props = buildProps();
  function buildProps() {
    const rockGeos = [], iceGeos = [], v = new THREE.Vector3(), rnd = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
    const place = (geo, s, lat, y, glow = 0) => { const p = frameAt(s, lat, 0, new THREE.Vector3()); geo.translate(p.x, p.y + y, p.z);
      const g = new Float32Array(geo.attributes.position.count).fill(glow); if (glow) { const pp = geo.attributes.position; for (let k = 0; k < pp.count; k++) g[k] = glow * Math.pow(Math.min(1, Math.max(0, (pp.getY(k) - p.y - y) / 1)), 1); }
      geo.setAttribute('aGlow', new THREE.BufferAttribute(g, 1));
      if (!geo.attributes.aVent) geo.setAttribute('aVent', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));   // x: basalt (vents area), y: lava-crack weight
      if (!geo.attributes.aLoc) geo.setAttribute('aLoc', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));     // vent-local position (crack noise; small numbers)
      return geo; };
    const lumpy = (geo, amt, f = 1.3) => { const p = geo.attributes.position; for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); const n = vnoise3(v.x * f + 3, v.y * f, v.z * f) - 0.5; const r = Math.hypot(v.x, v.z); if (r > 1e-3) { const sc = 1 + amt * n * 2; p.setX(k, v.x * sc); p.setZ(k, v.z * sc); } } return geo; };
    const cone = (rb, h, up = 1) => { const g = lumpy(new THREE.CylinderGeometry(rb * 0.12, rb, h, 9, 4, true), 0.28); g.translate(0, h / 2, 0); if (up < 0) g.scale(1, -1, 1); return g; };
    const strip = (g) => { const n = g.toNonIndexed(); for (const k of Object.keys(n.attributes)) if (!['position', 'uv', 'aGlow', 'aVent', 'aLoc'].includes(k)) n.deleteAttribute(k); return n; };
    const floorY = FLOOR;
    // jelly hall (chamber 0) + pillars (2): rock stalagmites from the bed and stalactites from the roof, well to the sides
    for (const [ci, n] of [[0, 7], [2, 5], [1, 3]]) for (let k = 0; k < n; k++) {
      const s = (CHAMBERS[ci] * L + (rnd() - 0.5) * 22), side = rnd() < 0.5 ? -1 : 1, lat = side * (9 + rnd() * 5.5), R = tunnelRadius(s, L);
      if (rnd() < 0.65) { const h = 2.5 + rnd() * 4; rockGeos.push(strip(place(cone(0.8 + rnd() * 1.1, h), s, lat, floorY - 0.6))); }
      else { const h = 2 + rnd() * 3.5; rockGeos.push(strip(place(cone(0.7 + rnd() * 0.9, h, -1), s, lat, Math.min(R * 0.8, 12)))); }
      if (ci === 1) { const av = rockGeos[rockGeos.length - 1].attributes.aVent; for (let j = 0; j < av.count; j++) av.setX(j, CONFIG.VENT_ROCK ?? 1); }   // test #6: vents-chamber cones are basalt too, not blue
    }
    // amber vents: squat chimneys on the lakebed glowing at the mouth (VENTS list above; test #5: 17 instead of 5)
    /* test #6: they read as light-blue ice cones. Now hydrothermal rock chimneys: a lathe profile (flared foot, tapering stack, raised lip, an inner
       crater wall going down into the throat), displaced with 3D value noise (lumpy, faceted basalt), standing on a wide low rocky mound. Shaded as
       dark basalt from tex/rock.jpg (desaturated) with amber lava cracks that strengthen toward the mouth (aVent.y) and a glowing throat (aGlow).
       The mouth centre is exactly ventTop(v), where the plume plane's base is pinned. */
    const VR = CONFIG.VENT_ROCK ?? 1, SEG = 12;
    const ventRock = (rb, h, seed) => {
      const prof = [], crack = [], glow = [];
      const push = (r, y, c, g) => { prof.push(new THREE.Vector2(Math.max(0.02, r), y)); crack.push(c); glow.push(g); };
      // mound (wide, low, sunk into the bed)
      push(rb * 2.9, -0.55, 0, 0); push(rb * 2.55, -0.05, 0, 0); push(rb * 2.0, 0.28, 0, 0); push(rb * 1.45, 0.5, 0.05, 0); push(rb * 1.1, 0.62, 0.1, 0);
      // stack: tapering, slightly bulging
      for (let k = 1; k <= 8; k++) { const f = k / 8, y = 0.62 + (h - 0.62) * f; push(rb * (0.36 + 0.64 * Math.pow(1 - f, 1.5)) * (1 + 0.07 * Math.sin(f * 7 + seed)), y, Math.pow(Math.max(0, (f - 0.35) / 0.65), 1.4), Math.pow(f, 9)); }
      // lip + throat
      push(rb * 0.46, h + 0.07, 1, 0.55); push(rb * 0.31, h + 0.11, 1, 0.9); push(rb * 0.22, h - 0.06, 1, 1); push(rb * 0.15, h - 0.7, 1, 1);
      const g = new THREE.LatheGeometry(prof, SEG); const P = g.attributes.position, n = P.count, per = prof.length;
      const aG = new Float32Array(n), aV = new Float32Array(n * 2), aL = new Float32Array(n * 3);
      for (let j = 0; j < n; j++) { const pi = j % per; v.fromBufferAttribute(P, j);
        const r = Math.hypot(v.x, v.z), noise = (vnoise3(v.x * 0.9 + seed, v.y * 0.9, v.z * 0.9) - 0.5) * 2, fine = (vnoise3(v.x * 3.1, v.y * 3.1 + seed, v.z * 3.1) - 0.5) * 2;
        const amt = pi < 5 ? 0.3 : pi < per - 4 ? 0.2 : 0.08;   // lumpier mound, rough stack, cleaner lip so the mouth stays round under the plume
        if (r > 1e-3) { const sc = 1 + amt * noise + 0.06 * fine; P.setX(j, v.x * sc); P.setZ(j, v.z * sc); }
        if (pi < 5) P.setY(j, v.y + 0.18 * noise * (pi < 1 ? 0 : 1));
        aG[j] = glow[pi]; aV[j * 2] = VR; aV[j * 2 + 1] = crack[pi] * VR; aL[j * 3] = P.getX(j) + seed * 3.7; aL[j * 3 + 1] = P.getY(j); aL[j * 3 + 2] = P.getZ(j); }
      g.setAttribute('aGlow', new THREE.BufferAttribute(aG, 1)); g.setAttribute('aVent', new THREE.BufferAttribute(aV, 2)); g.setAttribute('aLoc', new THREE.BufferAttribute(aL, 3));
      return g; };
    VENTS.forEach((vv, k) => {
      const [sv, lat, h, rb] = vv;
      const g = ventRock(rb, h, k * 1.37 + 0.5), p = frameAt(sv, lat, 0, new THREE.Vector3()); g.translate(p.x, p.y + ventBase(vv), p.z);   // base on the bed (fitVents), mouth at ventTop(v)
      rockGeos.push(strip(g));
    });
    // ice columns (chamber 2): tall translucent, slightly twisted, floor-to-roof
    for (let k = 0; k < 7; k++) {
      const s = CHAMBERS[2] * L + (k - 3) * 3.6 + (rnd() - 0.5) * 1.5, lat = (k % 2 ? 1 : -1) * (9.5 + rnd() * 5), R = tunnelRadius(s, L);
      const h = (FLOOR * -1) + Math.min(R * 0.85, 13), r = 0.5 + rnd() * 0.7;
      const g = new THREE.CylinderGeometry(r * 0.8, r * 1.25, h, 10, 8, true); lumpy(g, 0.18, 0.9); g.translate(0, h / 2, 0);
      { const p = g.attributes.position; for (let j = 0; j < p.count; j++) { const y = p.getY(j), a = y * 0.09, x = p.getX(j), z = p.getZ(j); p.setX(j, x * Math.cos(a) - z * Math.sin(a)); p.setZ(j, x * Math.sin(a) + z * Math.cos(a)); } }
      g.computeVertexNormals(); const n = g.toNonIndexed(); n.deleteAttribute('uv'); const pf = frameAt(s, lat, 0, new THREE.Vector3()); n.translate(pf.x, pf.y + FLOOR - 0.5, pf.z); iceGeos.push(n);
    }
    // cathedral (chamber 2) extra ice: stalagmite-like spires rising from the floor and stalactite-like icicles hanging from the roof, both sides,
    // staggered in depth so they slide past each other (parallax). Every vertex is pushed/shrunk until it is >= MIN_CLEARANCE + 0.25 m from the path.
    const pathPts = []; { const q = new THREE.Vector3(); for (let ss = CHAMBERS[2] * L - 40; ss <= CHAMBERS[2] * L + 40; ss += 0.5) pathPts.push(path.pointOf(ss, q).clone()); }
    const minPathDist = (geo) => { const pp = geo.attributes.position; let m = 1e9; for (let j = 0; j < pp.count; j++) { const x = pp.getX(j), y = pp.getY(j), z = pp.getZ(j); for (const P of pathPts) { const d = (P.x - x) ** 2 + (P.y - y) ** 2 + (P.z - z) ** 2; if (d < m) m = d; } } return Math.sqrt(m); };
    const spire = (r, h, down) => { const g = new THREE.CylinderGeometry(r * 0.06, r, h, 9, 6, true); lumpy(g, 0.22, 1.1); g.translate(0, h / 2, 0);
      { const pp = g.attributes.position; for (let j = 0; j < pp.count; j++) { const y = pp.getY(j), a = y * 0.15, x = pp.getX(j), z = pp.getZ(j); pp.setX(j, x * Math.cos(a) - z * Math.sin(a) + 0.04 * y * y / h); pp.setZ(j, x * Math.sin(a) + z * Math.cos(a)); } }
      if (down) g.scale(1, -1, 1); g.computeVertexNormals(); const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; };
    for (let k = 0; k < 18; k++) {
      const down = k % 2 === 1, s = CHAMBERS[2] * L + (k - 8.5) * 2.6 + (rnd() - 0.5) * 1.6, side = (k >> 1) % 2 ? 1 : -1, R = tunnelRadius(s, L);
      let lat = side * (7.5 + rnd() * 6), h = down ? 3 + rnd() * 4 : 2.5 + rnd() * 4.5, r = down ? 0.35 + rnd() * 0.45 : 0.45 + rnd() * 0.6;
      for (let tries = 0; tries < 30; tries++) {
        const g = spire(r, h, down), pf = frameAt(s, lat, 0, new THREE.Vector3());
        g.translate(pf.x, pf.y + (down ? Math.min(R * 0.85, 13) : FLOOR - 0.4), pf.z);
        if (minPathDist(g) >= MIN_CLEARANCE + 0.25) { iceGeos.push(g); break; }
        h *= 0.9; lat += side * 0.4;
      }
    }
    const merge = (geos) => { const total = geos.reduce((a, g) => a + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
      for (const name of Object.keys(geos[0].attributes)) { const sz = geos[0].attributes[name].itemSize, arr = new Float32Array(total * sz); let o = 0; for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; } out.setAttribute(name, new THREE.BufferAttribute(arr, sz)); }
      out.computeBoundingSphere(); return out; };
    const rockGeo = merge(rockGeos); rockGeo.computeVertexNormals();
    const rockMat = new THREE.ShaderMaterial({ uniforms: { uTex: tunnel.uniforms.uWallTex, uUseTex: tunnel.uniforms.uUseWallTex, uRock: ROCK_TEX, uUseRock: ROCK_TEX_ON, uFog: { value: GRADE.fog }, uAmber: { value: PALETTE.amber }, uCyan: { value: PALETTE.cyan }, uBreath: tunnel.uniforms.uBreath, uTime: tunnel.uniforms.uTime, ...gradeUniforms(), ...LIGHT_U },
      side: THREE.DoubleSide,
      vertexShader: `attribute float aGlow; attribute vec2 aVent; attribute vec3 aLoc; varying vec2 vUv, vVent; varying float vGlow, vDist, vShade; varying vec3 vN; varying highp vec3 vLoc;
        ${HL_VS}
        void main(){ vUv = uv; vGlow = aGlow; vVent = aVent; vLoc = aLoc; vec4 wp = modelMatrix * vec4(position,1.0); vec3 e = cameraPosition - wp.xyz; vDist = length(e);
        vec3 n = normalize(mat3(modelMatrix) * normal); vN = n; hlVertex(wp.xyz, n, 1.0); vShade = 0.35 + 0.55 * abs(dot(n, e / vDist)) + 0.2 * max(n.y, 0.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `precision mediump float; uniform sampler2D uTex, uRock; uniform float uUseTex, uUseRock, uFog, uBreath; uniform highp float uTime; uniform vec3 uFogCol, uAmber, uCyan; varying vec2 vUv, vVent; varying float vGlow, vDist, vShade; varying vec3 vN; varying highp vec3 vLoc;
        ${NOISE}
        ${GRADE_GLSL}
        ${HL_FS}
        void main(){ vec3 t = uUseRock > 0.5 ? texture2D(uRock, vUv * vec2(2.0, 1.0)).rgb * 1.2 : (uUseTex > 0.5 ? texture2D(uTex, vUv * vec2(2.0, 1.0)).rgb : vec3(0.35)); vec3 hl = headlight(normalize(vN), 1.0);   /* faceted props, double-sided: |N.L| */
          float vr = vVent.x; float tl = dot(t, vec3(0.3, 0.5, 0.2));                                    // test #6: vents area = dark basalt (desaturated rock.jpg), not blue
          vec3 alb = mix(vec3(0.03, 0.10, 0.16) * (0.6 + 1.2 * t), vec3(0.062, 0.054, 0.048) * (0.3 + 1.9 * tl), vr);
          vec3 tt = mix(t, tl * vec3(1.0, 0.92, 0.84), vr);
          vec3 c = hmdGrade(alb * vShade * uAmb + (alb * 0.5 + tt * 0.08) * hl) + uWallGlow * (1.0 - 0.8 * vr);
          c += uCyan * veinMask(t) * uVeinGlow * 0.4 * (1.0 - vr) + uAmber * vGlow * (0.9 + 0.15 * uBreath);
          if (vVent.y > 0.01) {   // amber lava cracks, strongest at the mouth; thin bright core + warm halo, slow flicker
            highp vec3 q = vLoc * vec3(2.2, 1.3, 2.2); float r1 = 1.0 - abs(vnoise(q) * 2.0 - 1.0), r2 = 1.0 - abs(vnoise(q * 2.1 + 7.3) * 2.0 - 1.0);
            float cr = pow(r1, 16.0) * 1.1 + pow(r2, 22.0) * 0.6 + pow(r1, 5.0) * 0.12;
            float fl = 0.8 + 0.2 * sin(mod(uTime, 6283.0) * 0.6 + vLoc.y * 1.7 + vLoc.x);
            c += mix(vec3(1.0, 0.30, 0.05), vec3(1.0, 0.68, 0.28), pow(r1, 36.0)) * cr * vVent.y * 1.25 * fl * (0.9 + 0.15 * uBreath);
            c += uAmber * 0.10 * vVent.y * vVent.y;                                                       // warm under-glow of the upper stack
          }
          gl_FragColor = vec4(softClip(mix(c, uFogCol, (1.0 - exp(-vDist * uFog)) * (1.0 - 0.6 * max(vGlow, vVent.y * 0.6))) + hlBeam()), 1.0); }` });
    const rock = new THREE.Mesh(rockGeo, rockMat); rock.renderOrder = -9; rock.frustumCulled = false; rideWorld.add(rock);
    const iceGeo = merge(iceGeos);
    /* Ice (test #5): CLEAR, not blue. Neutral near-white body that is mostly transparent, fresnel rim, frost detail from tex/walls.jpg (the frosty
       ice tile, shared with the float cavern: no extra GPU memory), and refraction-like highlights: thin bright internal streaks that slide with
       the view direction (fake IOR offset) + a sharp specular glint from the headlights. The headlight colour (near-white) is the only light colour;
       ambient/beam colour no longer tints the ice. ICE_CLEAR = 0 restores the old blue ice. */
    const iceMat = new THREE.ShaderMaterial({ uniforms: { uFog: { value: GRADE.fog }, uCyan: { value: PALETTE.cyan }, uBreath: tunnel.uniforms.uBreath, uTime: tunnel.uniforms.uTime,
        uIceTex: ICE_TEX, uUseIceTex: ICE_TEX_ON, uClear: { value: CONFIG.ICE_CLEAR ?? 1 }, ...LIGHT_U },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
      vertexShader: `varying vec3 vN, vE, vW, vWorld; varying float vDist; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = position; vWorld = wp.xyz; vE = cameraPosition - wp.xyz; vDist = length(vE); vN = mat3(modelMatrix) * normal; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `precision mediump float; uniform float uFog, uBreath, uTime, uUseIceTex, uClear; uniform vec3 uFogCol, uCyan; uniform sampler2D uIceTex; varying vec3 vN, vE, vW; varying highp vec3 vWorld; varying float vDist;
        ${HL_GLSL}
        void main(){ vec3 n = normalize(vN), e = normalize(vE); float ndv = abs(dot(n, e)); float f = 1.0 - ndv; float rim = pow(f, 2.4);
          float band = 0.5 + 0.5 * sin(vW.y * 1.7 + sin(vW.x * 0.6) * 2.0 + uTime * 0.15);
          vec3 rr = refract(-e, faceforward(n, -e, n), 0.76);                                    // fake refraction: look 'through' the column
          vec2 fq = vec2(vW.x + vW.z, vW.y * 0.35) * 0.32 + rr.xy * 0.35;
          float frost = uUseIceTex > 0.5 ? texture2D(uIceTex, fq).r : 0.5 + 0.2 * band;          // frosty detail, moves slightly with the view (parallax)
          float streak = pow(1.0 - abs(sin((vW.y + rr.y * 2.5) * 2.3 + sin(vW.x * 1.3 + rr.x * 3.0) * 1.6)), 18.0);   // thin internal light streaks
          float amb = 0.3 + 0.7 * uAmb;
          vec3 bodyOld = vec3(0.16, 0.42, 0.55) * (0.55 + 0.25 * band) * amb + mix(uCyan, vec3(0.85, 1.0, 1.0), 0.4) * rim * (0.9 + 0.15 * uBreath) * (0.6 + 0.4 * uAmb);
          vec3 iceW = vec3(0.86, 0.92, 0.95);                                                     // clear ice: near-neutral (the faintest cool cast)
          vec3 bodyNew = iceW * (0.05 + 0.10 * frost) * amb + iceW * rim * 0.30 * (0.9 + 0.1 * uBreath) * (0.5 + 0.5 * uAmb)
                       + uCyan * rim * 0.05 + iceW * streak * 0.12 * amb;                          // only a whisper of the cyan environment in the rim
          vec3 c = mix(bodyOld, bodyNew, uClear);
          float lit = 0.0, glint = 0.0;
          if (uHLInt > 0.0) { lit = hlSpot(vWorld, n, 1.0);
            vec3 l = normalize(vWorld - 0.5 * (uHLPos[0] + uHLPos[1])); vec3 nf = faceforward(n, l, n); glint = pow(max(dot(reflect(l, nf), e), 0.0), 24.0) * lit; }
          vec3 litCol = mix(vec3(0.10, 0.26, 0.32), vec3(0.20 + 0.25 * frost) + 0.9 * streak, uClear);   // beams light the ice with THEIR colour (near-white)
          c += uHLCol * uHLInt * (litCol * lit + mix(0.55, 0.9, uClear) * glint);
          c = mix(c, uFogCol, (1.0 - exp(-vDist * uFog)) * 0.8);
          float m = max(max(c.r, c.g), c.b); if (m > 0.85) c *= (0.85 + 0.15 * (1.0 - exp(-(m - 0.85) / 0.15))) / m;
          float a = mix(0.38 + 0.5 * rim + 0.25 * min(lit, 1.0), 0.22 + 0.55 * rim + 0.35 * min(lit, 1.0) + 0.3 * streak * lit, uClear);
          gl_FragColor = vec4(c, a); }` });
    const ice = new THREE.Mesh(iceGeo, iceMat); ice.renderOrder = -7; ice.frustumCulled = false; rideWorld.add(ice);
    return { rock, ice };
  }
  /* test #10 (Scott): the jelly-hall and pillars backdrop PAINTINGS are gone (pixelated / fake in the headset). Those caves are built from real 3D rock
     instead: noisy low-poly columns, wall buttresses, floor boulders, ceiling stalactites and a few spires, all flat-faceted, one merged mesh = 1 draw call.
     Material: black basalt / dark ice. Near-zero ambient; only the sub's headlight cones reveal it (sharp facets + a fine procedural grain), then fog.
     A very faint cyan rim in the jelly hall (aZone = 1). Every vertex is kept >= CAVE_CLEAR from the path (comfort: > 6 m from the cockpit). */
  const caveRock = (CONFIG.CAVE_ROCK ?? 1) > 0 ? buildCaveRock() : null;
  function buildCaveRock() {
    const CAVE_CLEAR = 6.6; let seed = 1234; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const items = [];   // [kind, fracOfLap, lateral, up, size, height, zone]
    const J = CHAMBERS[0], P = CHAMBERS[2], LL = L;
    const at = (f, ds) => f + ds / LL;
    // jelly hall (left = former backdrop side): columns floor-to-roof, buttresses into the wall, boulders, stalactites; a couple on the right
    for (const [ds, lat, r] of [[-15, -15.6, 1.6], [-6, -16.4, 2.0], [5, -15.2, 1.4], [15, -16.0, 1.9], [-12, 15.8, 1.5], [11, 16.2, 1.8]]) items.push(['col', at(J, ds), lat, 0, r, 0, 1]);
    for (const [ds, lat, up, r] of [[-9, -12.5, -6.5, 3.4], [0, -13.5, -7.0, 4.2], [10, -12.2, -6.6, 3.0], [-20, 11.5, -6.8, 3.2], [3, 12.8, -6.9, 3.6], [19, -11.8, -6.8, 3.0]]) items.push(['blob', at(J, ds), lat, up, r, 0, 1]);
    for (const [ds, lat, r, h] of [[-8, -7.5, 1.1, 6.5], [2, 6.8, 0.9, 5.5], [9, -5.0, 1.0, 5.0], [-17, 4.0, 0.8, 4.5]]) items.push(['tite', at(J, ds), lat, 0, r, h, 1]);
    // pillars cave (crystal spires before): more columns + tall spires rising from the cathedral floor, buttresses on the old backdrop side
    for (const [ds, lat, r] of [[-17, -15.0, 1.7], [-8, -16.2, 2.2], [2, -15.4, 1.5], [12, -16.0, 2.0], [-4, 15.6, 1.6], [16, 15.2, 1.4]]) items.push(['col', at(P, ds), lat, 0, r, 0, 0]);
    for (const [ds, lat, r, h] of [[-12, -11.2, 1.3, 9.0], [-3, -12.0, 1.6, 11.0], [7, -11.0, 1.2, 8.0], [-14, 11.8, 1.2, 7.5], [9, 12.2, 1.4, 9.5]]) items.push(['spire', at(P, ds), lat, 0, r, h, 0]);
    for (const [ds, lat, up, r] of [[-1, -14.2, 2.5, 3.6], [-20, 13.5, 1.0, 3.2]]) items.push(['blob', at(P, ds), lat, up, r, 0, 0]);
    for (const [ds, lat, r, h] of [[-6, 7.5, 1.0, 5.5], [5, -7.0, 1.1, 6.0]]) items.push(['tite', at(P, ds), lat, 0, r, h, 0]);
    // dark corridor (vents -> pillars, the angler's stretch): a few buttresses / stalactites only, kept off the lone vent at 0.58
    for (const [f, lat, up, r] of [[0.625, 10.8, -2.5, 2.8], [0.655, -10.6, -3.0, 2.6], [0.69, 10.4, -2.0, 2.4]]) items.push(['blob', f, lat, up, r, 0, 0]);
    for (const [f, lat, r, h] of [[0.64, 5.0, 0.8, 3.2], [0.675, -5.5, 0.9, 3.5]]) items.push(['tite', f, lat, 0, r, h, 0]);
    const geos = [], c = new THREE.Vector3(), q = new THREE.Vector3(), eye = new THREE.Vector3();
    const pathPts = []; for (let s = 0; s < L; s += 0.5) pathPts.push(path.pointOf(s, new THREE.Vector3()));
    const minDist = (g) => { const p = g.attributes.position; let m = 1e9; for (let k = 0; k < p.count; k++) { q.fromBufferAttribute(p, k); for (const e of pathPts) { const dx = e.x - q.x, dz = e.z - q.z; if (dx * dx + dz * dz > 400) continue; const d = Math.hypot(dx, e.y - q.y, dz); if (d < m) m = d; } } return m; };
    const displace = (g, amt, freq, sd) => { const p = g.attributes.position; for (let k = 0; k < p.count; k++) { q.fromBufferAttribute(p, k);
      const n1 = fbm3(q.x * freq + sd, q.y * freq, q.z * freq) - 0.5, n2 = fbm3(q.x * freq * 2.7, q.y * freq * 2.7 + sd, q.z * freq * 2.7) - 0.5;
      const dx = q.x - c.x, dz = q.z - c.z, hl = Math.hypot(dx, dz) || 1, w = g.userData.radial ? 1 : 0;
      const nx = w ? dx / hl : (q.x - c.x), ny = w ? 0 : (q.y - c.y), nz = w ? dz / hl : (q.z - c.z), nl = Math.hypot(nx, ny, nz) || 1;
      const d = amt * (n1 * 2.2 + n2 * 0.9); p.setXYZ(k, q.x + nx / nl * d, q.y + ny / nl * d * (w ? 0 : 1), q.z + nz / nl * d); } };
    for (const [kind, f, lat0, up, r0, h, zone] of items) {
      let lat = lat0, g = null;
      for (let it = 0; it < 12; it++) {
        const s = f * L; frameAt(s, lat, 0, c); const base = c.y; const R = tunnelRadius(s, L);
        /* t10b shapes (Scott: "big blobby slabs"): slim tapered columns with a waist, kinked irregular stalactites, thin spires, and broken angular rock
           chunks (low-detail, squashed, sharply displaced) instead of round blobs. bend() kinks a shape sideways along its height (noise), so nothing is a straight card. */
        const bend = (gg, amt, sd) => { const p = gg.attributes.position; for (let k = 0; k < p.count; k++) { const y = p.getY(k); p.setX(k, p.getX(k) + amt * (vnoise3(y * 0.35 + sd, sd, 0.5) - 0.5) * 2); p.setZ(k, p.getZ(k) + amt * (vnoise3(sd, y * 0.35 + sd, 2.5) - 0.5) * 2); } };
        const waist = (gg, y0, y1, w) => { const p = gg.attributes.position; for (let k = 0; k < p.count; k++) { const u = (p.getY(k) - y0) / (y1 - y0), sc = 1 - w * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * (0.7 + 0.6 * vnoise3(u * 3, 1.3, 0)); p.setX(k, p.getX(k) * sc); p.setZ(k, p.getZ(k) * sc); } };
        if (kind === 'col') { const y0 = FLOOR - 1.5, y1 = Math.sqrt(Math.max(1, R * R - lat * lat)) + 1.5, rr = r0 * 0.62;
          g = new THREE.CylinderGeometry(rr * 0.55, rr * 1.15, y1 - y0, 11, Math.max(10, Math.round((y1 - y0) / 0.9)), true); waist(g, -(y1 - y0) / 2, (y1 - y0) / 2, 0.38); bend(g, rr * 0.9, f * 7);
          g.translate(c.x, base + (y0 + y1) / 2, c.z); g.userData.radial = 1; c.y = base; displace(g, rr * 0.42, 0.7, f * 31); }
        else if (kind === 'blob') { const rr = r0 * 0.72; g = new THREE.IcosahedronGeometry(rr, 1); g.scale(1.0 + 0.5 * rnd(), 0.55 + 0.35 * rnd(), 0.8 + 0.4 * rnd()); g.rotateY(rnd() * 6.28); g.rotateZ((rnd() - 0.5) * 0.6);
          c.y = base + up; g.translate(c.x, c.y, c.z); displace(g, rr * 0.5, 0.55, f * 17); }
        else if (kind === 'spire') { const rr = r0 * 0.7; g = new THREE.ConeGeometry(rr, h, 9, 12, true); bend(g, rr * 0.7, f * 11); c.y = base + FLOOR + h / 2 - 0.8; g.translate(c.x, c.y, c.z); g.userData.radial = 1; displace(g, rr * 0.4, 0.9, f * 23); }
        else { const top = Math.sqrt(Math.max(1, R * R - lat * lat)) + 0.5, rr = r0 * 0.75, hh = h * (0.8 + 0.5 * rnd()); g = new THREE.ConeGeometry(rr, hh, 9, 12, true); bend(g, rr * 1.1, f * 13); g.rotateX(Math.PI); g.rotateZ((rnd() - 0.5) * 0.25);
          c.y = base + top - hh / 2; g.translate(c.x, c.y, c.z); g.userData.radial = 1; displace(g, rr * 0.45, 0.9, f * 29); }
        if (minDist(g) >= CAVE_CLEAR) break;
        g.dispose(); g = null; lat += Math.sign(lat0) * 0.6;   // push outward (into the wall) until it clears
      }
      if (!g) continue;
      const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose(); ng.deleteAttribute('uv'); ng.deleteAttribute('normal');
      ng.setAttribute('aZone', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count).fill(zone), 1)); geos.push(ng);
    }
    let total = 0; for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), zon = new Float32Array(total); let o = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, o * 3); zon.set(g.attributes.aZone.array, o); o += g.attributes.position.count; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aZone', new THREE.BufferAttribute(zon, 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();   // non-indexed -> flat facet normals (sharp low-poly rock)
    const mat = new THREE.ShaderMaterial({ uniforms: { uFog: { value: GRADE.fog }, uCyan: { value: PALETTE.cyan }, uGain: { value: CONFIG.CAVE_ROCK_GAIN ?? 1.0 }, uRim: { value: CONFIG.CAVE_RIM ?? 1.0 }, ...gradeUniforms(), ...LIGHT_U },
      side: THREE.FrontSide,
      vertexShader: `attribute float aZone; varying float vZone, vDist; varying vec3 vN; varying highp vec3 vW;
        ${HL_VS}
        void main(){ vZone = aZone; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vDist = length(cameraPosition - wp.xyz);
          vec3 n = normalize(mat3(modelMatrix) * normal); vN = n; hlVertex(wp.xyz, n, 0.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `precision mediump float; uniform float uFog, uGain, uRim; uniform vec3 uFogCol, uCyan; varying float vZone, vDist; varying vec3 vN; varying highp vec3 vW;
        ${NOISE}
        ${GRADE_GLSL}
        ${HL_FS}
        /* t10b (Scott: "flat matte grey-teal cutouts, same with lights on or off"): the fog colour was filling the rock in. Now it is ICE in black:
           unlit = near-black (fog only darkens it), lit = icy blue with real per-pixel form (facet + bevel-grain normal, N.L from both lamps),
           a translucent wrap glow, a tight frosty specular and a fresnel rim, all scaled by how much headlight actually reaches the pixel. */
        void main(){
          highp vec3 p = vW * 2.2; float g1 = vnoise(p), g2 = vnoise(p * 2.7 + 11.7);
          vec3 nf = normalize(vN); vec3 n = normalize(nf + 0.35 * vec3(g1 - 0.5, g2 - 0.5, g1 - g2));   // bevel/grain: facets break up into chiselled ice
          vec3 V = normalize(cameraPosition - vW);
          vec3 hl = headlight(n, 0.0); float hi = dot(hl, vec3(0.333));                                    // lamp light reaching this pixel (cone x falloff x N.L)
          vec3 Ld = -normalize(vHLd0 + vHLd1);                                                               // toward the lamps
          float wrap = clamp(dot(nf, Ld) * 0.5 + 0.5, 0.0, 1.0);
          float reach = hi > 0.0 ? clamp(hi / max(wrap, 0.15), 0.0, 4.0) : 0.0;                            // cone+falloff without the N.L term
          vec3 ice = vec3(0.05, 0.30, 0.52) * (0.75 + 0.5 * g1);
          vec3 c = ice * hl * 1.6 * uGain;                                                                  // lit faces: ice blue with form
          c += vec3(0.03, 0.17, 0.28) * reach * wrap * 0.35 * uGain;                                       // translucency: light soaks into the ice
          float spec = pow(max(dot(n, normalize(Ld + V)), 0.0), 48.0) * smoothstep(0.45, 0.8, g2);       // frosty glints
          c += vec3(0.75, 0.92, 1.0) * spec * reach * 0.55 * uGain;
          float fr = pow(1.0 - abs(dot(nf, V)), 3.0);
          c += vec3(0.25, 0.75, 1.0) * fr * reach * 0.30 * uGain;                                          // fresnel rim where lit
          c = hmdGrade(c) + uCyan * fr * vZone * 0.010 * uRim;                                             // (jelly hall: a whisper of cyan rim even unlit)
          float fog = 1.0 - exp(-vDist * uFog);
          gl_FragColor = vec4(softClip(mix(c, uFogCol * 0.18, fog) + hlBeam() * 0.4), 1.0); }` });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = -8; mesh.frustumCulled = false; mesh.name = 'cave-rock'; rideWorld.add(mesh);
    return { mesh, count: geos.length, tris: total / 3, minClear: minDist(geo) };
  }
  // cathedral floor (chamber 2): displaced 3D rock between the cockpit and the ice backdrop. One merged mesh (1 draw call), frustum-culled.
  // tunnel.jpg + vein mask (cyan veins, as on the walls) plus warm amber/orange lava cracks concentrated in the foreground rocks and crevices.
  const cathedral = buildCathedralFloor();
  function buildCathedralFloor() {
    const s0 = CHAMBERS[2] * L, SL = 26, LAT = 15, ds = 0.45, dl = 0.45, ns = Math.round(2 * SL / ds), nl = Math.round(2 * LAT / dl);
    const P = [], UV = [], LP = [], I = [], q = new THREE.Vector3(), sd = new THREE.Vector3();
    for (let i = 0; i <= ns; i++) for (let j = 0; j <= nl; j++) {
      const u = -SL + i * ds, lat = -LAT + j * dl, s = s0 + u; path.pointOf(s, q); const yaw = path.yawOf(s); sd.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const al = Math.abs(lat), wx = q.x + sd.x * lat, wz = q.z + sd.z * lat;
      const big = fbm3(wx * 0.16, 1.7, wz * 0.16), fine = vnoise3(wx * 0.9, 3.1, wz * 0.9);
      const boulders = Math.max(0, big - 0.38) / 0.62;                              // sparse rock heaps
      const amp = 0.35 + 2.3 * Math.min(1, Math.max(0, (al - 3) / 9));              // flat-ish under the sub, taller rock toward the sides
      let y = FLOOR + 0.2 + amp * Math.pow(boulders, 0.9) * 1.6 + 0.25 * (fine - 0.5);
      const edge = Math.min(1, (SL - Math.abs(u)) / 5) * Math.min(1, (LAT - al) / 3);   // sink the glowSpot edges under the tunnel bed
      y = FLOOR - 0.6 + (y - FLOOR + 0.6) * Math.max(0, edge);
      const cap = -Math.sqrt(Math.max(0, (MIN_CLEARANCE + 0.3) ** 2 - lat * lat));   // clearance: stay below the 6.2 m sphere around the path point
      if (cap < 0) y = Math.min(y, cap);
      P.push(wx, q.y + y, wz); UV.push(u / 3.5, lat / 3.5); LP.push(u, y - FLOOR, lat);
    }
    const w = nl + 1; for (let i = 0; i < ns; i++) for (let j = 0; j < nl; j++) { const a = i * w + j, b = a + w; I.push(a, a + 1, b, b, a + 1, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setAttribute('aLocal', new THREE.Float32BufferAttribute(LP, 3)); geo.setIndex(I); geo.computeVertexNormals(); geo.computeBoundingSphere();
    { const n = geo.attributes.normal; for (let k = 0; k < n.count; k++) if (n.getY(k) < 0) n.setXYZ(k, -n.getX(k), -n.getY(k), -n.getZ(k)); }   // up-facing
    const TU = tunnel.uniforms;
    const uniforms = { uTex: TU.uWallTex, uUseTex: TU.uUseWallTex, uVeinTex: TU.uVeinTex, uUseVeinTex: TU.uUseVeinTex, uTime: TU.uTime, uBreath: TU.uBreath, uMood: TU.uMood,
      uFog: { value: GRADE.fog }, uCyan: { value: PALETTE.cyan }, uDeep: { value: PALETTE.deep }, uLava: { value: CONFIG.LAVA_GLOW }, uLavaPulse: { value: 0 }, ...gradeUniforms(), ...LIGHT_U };
    const mat = new THREE.ShaderMaterial({ uniforms,
      vertexShader: /* glsl */`attribute vec3 aLocal; varying vec2 vUv; varying vec3 vL; varying float vDist, vShade; varying vec3 vN;
        ${HL_VS}
        void main(){ vUv = uv; vL = aLocal; vec4 wp = modelMatrix * vec4(position, 1.0); vec3 e = cameraPosition - wp.xyz; vDist = length(e);
          vec3 n = normalize(mat3(modelMatrix) * normal); vN = n; hlVertex(wp.xyz, n, 0.0); vShade = 0.38 + 0.5 * max(dot(n, e / vDist), 0.0) + 0.25 * max(n.y, 0.0) * (0.6 + 0.4 * clamp(aLocal.y * 0.5, 0.0, 1.0));
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`precision mediump float;
        uniform sampler2D uTex, uVeinTex; uniform float uUseTex, uUseVeinTex, uBreath, uMood, uFog, uLava, uLavaPulse; uniform highp float uTime; uniform vec3 uFogCol, uCyan, uDeep;
        varying vec2 vUv; varying highp vec3 vL; varying float vDist, vShade; varying vec3 vN;
        ${NOISE}
        ${GRADE_GLSL}
        ${HL_FS}
        void main(){
          vec3 t = uUseTex > 0.5 ? texture2D(uTex, vUv).rgb : vec3(0.35);
          float tv = veinMask(t); if (uUseVeinTex > 0.5) tv = max(tv, texture2D(uVeinTex, vUv).r);
          vec3 hl = headlight(normalize(vN), 0.0);
          vec3 alb = vec3(0.028, 0.10, 0.15) * (0.55 + 1.3 * t); vec3 c = hmdGrade(alb * vShade * uAmb + (alb * 0.5 + t * 0.11) * hl) + uWallGlow * (0.7 + 0.3 * vShade);
          c += mix(uDeep, uCyan, 0.6 + 0.4 * uMood) * tv * uVeinGlow * 0.32;                          // cyan veins
          highp vec3 q = vec3(vL.x * 0.42, vL.z * 0.42, 0.0); q.xy += sin(q.yx * 1.7) * 0.35;      // lava cracks: ridged noise, thin bright core + warm halo
          float r = 1.0 - abs(vnoise(q) * 2.0 - 1.0); float crack = pow(r, 22.0) * 1.2 + pow(r, 6.0) * 0.18;
          float fg = 1.0 - smoothstep(6.0, 12.0, abs(vL.z));                                       // foreground: near the sub's track
          float low = 1.0 - smoothstep(0.3, 1.6, vL.y);                                            // glows in the crevices, not on boulder tops
          float flick = 0.85 + 0.15 * sin(uTime * 0.5 + vL.x * 0.3) ;
          vec3 lava = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.72, 0.30), pow(r, 30.0));               // orange halo, amber-white core
          float lv = crack * (0.35 + 0.65 * fg) * (0.4 + 0.6 * low) * uLava * flick * (1.0 + uLavaPulse);
          c += lava * lv;
          c = mix(c, uFogCol, (1.0 - exp(-vDist * uFog)) * (1.0 - 0.5 * min(1.0, tv + lv)));
          gl_FragColor = vec4(softClip(c + hlBeam()), 1.0); }` });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = -9; mesh.name = 'cathedral-floor'; rideWorld.add(mesh);
    return { mesh, uniforms };
  }
  /* ---- loop-video INSTANCES (test #5): one decoding video feeds several planes (varied size / mirror / crop / tilt so they don't read as copies).
     Plumes (loop 2) stand on the vent chimney mouths; rays (loop 4) glide on slow circuits; one BIG ray makes a choreographed close pass. ---- */
  const instances = [];   // { loop, plane, kind, ... } ; all planes face the sub each frame (yaw-only for plumes, full for rays)
  /* test #6: plumes were offset from their chimneys. The fire base in 03 sits at u = 0.494, v = 0.015 of the frame, but the crop was centred on
     u = 0.46 (+-0.024 jitter) and mirrored copies flipped that offset to the other side; the plane's centre-pivot tilt moved the base sideways;
     and the generic edge + radial feather faded out the bottom ~20 % of the plane, i.e. the whole fire base, so plumes floated ~1 m above the
     mouths. Now: crop centred on the plume axis (width varies symmetrically), plane pivot at its bottom centre (tilt keeps the base fixed),
     base pinned 0.015 h + 8 cm below the mouth centre (fire emerges from the throat), plume-shaped feather (uPlume) with no bottom fade. */
  const PLUME_CX = 0.494, PLUME_V0 = 0.015;
  const PLUME_CROP = [PLUME_CX - 0.28, 0.0, 0.56, 1.0], RAY_CROP = [0.0, 0.15, 1.0, 0.65];
  const cropAspect = (c, vw, vh) => (c[2] * vw) / (c[3] * vh);
  const RAYS = [   // [s, lateral, up, width m, circuit radius m, period s, phase]
    [CHAMBERS[0] * L - 6, -9.5, 7.5, 4.0, 2.4, 150, 0.0], [CHAMBERS[1] * L + 9, 8.5, 9.0, 3.2, 2.8, 175, 2.0], [CHAMBERS[2] * L + 11, -11.5, 10.0, 5.5, 2.0, 210, 4.1]];
  /* BIG RAY: ~9 m span, once per lap through the cathedral. Pose is a function of the SUB's progress u through a 30 m stretch, in sub-relative
     coordinates (ahead a, lateral x, up y): it comes from ~28 m ahead, slightly left and high, drifts over the window diagonally (dipping ~3 m at the
     closest point, then rising) and leaves behind on the right. Closest centre approach ~7 m; the plane always faces the cockpit, so its nearest
     point IS its centre (verified by clearance(): bigRay >= 6 m). Relative speed ~0.37 m/s at the default cruise; no motion toward the face. */
  const BIG = { s0: CHAMBERS[2] * L - 19, D: 30, width: 9.0 };
  const bigRel = (u, out) => { const a = 28 - 44 * u, x = -3 + 10 * u, y = 9.2 - 3.0 * Math.exp(-(((u - 0.62) / 0.22) ** 2)); return out.set(a, x, y); };
  /* test #7: OVERHEAD pass, once per lap in the jelly hall (roof ~18 m up there): the ray comes from ~24 m ahead, high, glides straight over the sub
     (centre 9.0 m above the eye = ~8 m above the cockpit roof; the hall's roof is still ~5 m above it), lingers (it slows to ~0.12 m/s relative while it is overhead, so it stays in the
     skylight for ~20 s) and leaves behind. Over the sub it lies flat, belly down, head along its travel direction (no billboard flip at the zenith). */
  const BIG2 = { s0: CHAMBERS[0] * L - 14, D: 30, width: 9.0, overhead: true };
  const bigRel2 = (u, out) => { const a = 24 - 40 * u - 4 * Math.sin(2 * Math.PI * u), x = 0.6 * Math.sin(Math.PI * u * 1.3), y = 9.8 - 0.8 * Math.exp(-(((u - 0.68) / 0.22) ** 2)); return out.set(a, x, y); };
  const PASSES = (CONFIG.BIG_RAY_OVERHEAD ?? true) ? [[BIG, bigRel], [BIG2, bigRel2]] : [[BIG, bigRel]];
  const _rel = new THREE.Vector3(), _sub = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _fw = new THREE.Vector3();
  let _pass = null;
  function bigPose(subS, out) { for (const [B, rel] of PASSES) { let u = (subS - B.s0) % L; if (u < 0) u += L; u /= B.D; if (u < 0 || u > 1) continue;
      rel(u, _rel); frameAt(subS + _rel.x, _rel.y, _rel.z, out); _pass = B; return u; } _pass = null; return -1; }
  /** true while either big-ray pass is on (with ~6 m lead-in so the video is already running): main.js gives the ray video priority then. */
  const bigActive = (subS) => PASSES.some(([B]) => { let d = (subS - B.s0) % L; if (d < 0) d += L; return d <= B.D + 1 || d >= L - 6; });
  function addLoopInstances(i, tex) {
    const made = [];
    if (i === 2) VENTS.forEach((v, k) => { if ((k % 4 === 3 && k < 14) || made.length >= (CONFIG.PLUME_PLANES ?? 14)) return;   // 14 of 17 chimneys smoke (a few quiet ones read more natural)
      const pl = createLoopPlane(tex, { pos: [0, 0, 0], size: 4 }); const hgt = 3.6 + ((k * 37) % 7) * 0.45 + (v[0] > CHAMBERS[1] * L + 30 || v[0] < CHAMBERS[1] * L - 30 ? -0.8 : 0);
      const cr = PLUME_CROP.slice(); cr[2] += ((k * 13) % 5 - 2) * 0.03; cr[0] = PLUME_CX - cr[2] / 2; pl.material.uniforms.uUvRect.value.set(...cr);   // width varies, centre stays on the plume axis
      pl.geometry.translate(0, 0.5, 0); pl.material.uniforms.uPlume.value = 1;   // pivot at the bottom centre; plume-shaped feather
      const top = ventTop(v); pl.userData.kind = 'plume'; pl.userData.mouth = top.clone(); pl.userData.base = top.clone(); pl.userData.base.y -= PLUME_V0 * hgt + 0.08; pl.userData.baseV = 0;
      pl.userData.h = hgt; pl.userData.flip = k % 2 ? -1 : 1; pl.userData.tilt = ((k * 29) % 9 - 4) * 0.012;
      pl.userData.spot = { s: v[0] }; pl.userData.setAspect = (a) => { const asp = cropAspect(cr, a, 1); pl.scale.set(hgt * asp * pl.userData.flip, hgt, 1); pl.userData.size = [hgt * asp, hgt]; pl.userData.aspect = asp; };
      pl.userData.setAspect(16 / 9); rideWorld.add(pl); made.push(pl); instances.push(pl); });
    if (i === 4) {
      RAYS.slice(0, CONFIG.EXTRA_RAYS ?? 3).forEach((r, k) => { const pl = createLoopPlane(tex, { pos: [0, 0, 0], size: 4 }); pl.material.uniforms.uUvRect.value.set(...RAY_CROP);
        pl.userData.kind = 'ray'; pl.userData.ray = r; pl.userData.flip = k % 2 ? -1 : 1; pl.userData.spot = { s: r[0] };
        pl.userData.setAspect = (a) => { const asp = cropAspect(RAY_CROP, a, 1); pl.scale.set(r[3] * pl.userData.flip, r[3] / asp, 1); pl.userData.size = [r[3], r[3] / asp]; pl.userData.aspect = asp; };
        pl.userData.setAspect(9 / 16); rideWorld.add(pl); made.push(pl); instances.push(pl); });
      const pl = createLoopPlane(tex, { pos: [0, 0, 0], size: 9 }); pl.material.uniforms.uUvRect.value.set(...RAY_CROP); pl.name = 'big-ray';
      pl.geometry.dispose(); pl.geometry = new THREE.PlaneGeometry(1, 1, 16, 4);   // subdivided: slow wing flex in the vertex shader (uFlex)
      pl.material.uniforms.uFlex.value = CONFIG.BIG_RAY_FLEX ?? 0.5; pl.material.uniforms.uTime = tunnel.uniforms.uTime;
      pl.userData.kind = 'bigray'; pl.userData.spot = { s: BIG.s0 + BIG.D * 0.6 }; pl.userData.spot2 = { s: BIG2.s0 + BIG2.D * 0.68 }; pl.visible = false; pl.renderOrder = 2;
      pl.userData.setAspect = (a) => { const asp = cropAspect(RAY_CROP, a, 1); pl.scale.set(BIG.width, BIG.width / asp, 1); pl.userData.size = [BIG.width, BIG.width / asp]; pl.userData.aspect = asp; };
      pl.userData.setAspect(9 / 16); rideWorld.add(pl); made.push(pl); instances.push(pl);
    }
    return made;
  }
  /** Pose of an instance plane for sub progress subS at time t (also used by clearance()). Returns false when hidden. */
  function poseInstance(pl, subS, t, eye) {
    const k = pl.userData.kind;
    if (k === 'plume') { pl.position.copy(pl.userData.base); pl.rotation.set(0, Math.atan2(eye.x - pl.position.x, eye.z - pl.position.z), pl.userData.tilt); return true; }   // base pinned on the mouth, yaw-billboard, lean about the base
    if (k === 'ray') { const [rs, lat, up, , rad, per, ph] = pl.userData.ray, a = (t / per) * Math.PI * 2 + ph;
      frameAt(rs + Math.cos(a) * rad, lat + Math.sin(a) * rad * 0.7, up + Math.sin(a * 2.0) * 0.6, pl.position); }
    else if (k === 'bigray') { const u = bigPose(subS, pl.position); if (u < 0) return false;
      pl.material.uniforms.uFade.value = Math.min(1, u / 0.12, (1 - u) / 0.12); pl.userData.u = u; pl.userData.pass = _pass === BIG2 ? 2 : 1;
      if (_pass === BIG2) { pl.material.uniforms.uFade.value *= CONFIG.BIG_RAY_OVERHEAD_GAIN ?? 1.6; const yaw = path.yawOf(subS); _fw.set(Math.sin(yaw), 0, Math.cos(yaw));   // -forward: head along its (sub-relative) travel
        _m.lookAt(eye, pl.position, _fw); pl.quaternion.setFromRotationMatrix(_m); pl.rotateZ(0.12 * Math.sin(t * 0.21)); return true; } }   // faces the cockpit, never flips at the zenith
    _m.lookAt(eye, pl.position, _up); pl.quaternion.setFromRotationMatrix(_m);   // full face-the-cockpit billboard (nearest point = centre)
    if (k === 'bigray') pl.rotateZ(0.18 * Math.sin(t * 0.21));                    // slow gentle bank
    return true;
  }
  function updateInstances(subS, t) { path.pointOf(subS, _sub); let part = 0;
    for (const pl of instances) { const vis = poseInstance(pl, subS, t, _sub); pl.visible = vis;
      if (vis && pl.userData.pass === 2 && pl.userData.kind === 'bigray') { const dx = pl.position.x - _sub.x, dz = pl.position.z - _sub.z; part = pl.material.uniforms.uFade.value * Math.exp(-(dx * dx + dz * dz) / 25); } }
    SKY_PART_U.value = part * (CONFIG.SKYLIGHT_PART ?? 1); }
  /** Sub progress values (s) where a loop's planes are in view, for the video-decode budget (nearest-N within RIDE_VIDEO_NEAR_M). */
  const loopSpotList = (i) => [loopSpots[i]?.s, ...instances.filter((p) => (i === 2 ? p.userData.kind === 'plume' : i === 4 ? p.userData.kind !== 'plume' : false)).flatMap((p) => [p.userData.spot.s, p.userData.spot2?.s])].filter((x) => x != null);
  /** Big-ray clearance over its whole stretch: min distance from the cockpit eye to the plane (sampled 9x7 grid; the plane faces the eye). */
  function bigRayClearance(step = 0.1) {
    const pl = instances.find((p) => p.userData.kind === 'bigray'); if (!pl) return { min: Infinity };
    let best = { min: Infinity }; const e = new THREE.Vector3(), q = new THREE.Vector3();
    const fx = (pl.material.uniforms.uFlex?.value ?? 0);   // wing flex: tips can bend up to fx toward the eye (worst case)
    for (const [B] of PASSES) for (let ss = B.s0 - 1; ss <= B.s0 + B.D + 1; ss += step) { path.pointOf(ss, e); if (!poseInstance(pl, ss, 0, e)) continue; pl.updateMatrix();
      for (let a = -0.5; a <= 0.5001; a += 0.125) for (let b = -0.5; b <= 0.5001; b += 1 / 6) { q.set(a, b, fx * 4 * a * a / Math.max(1e-3, pl.scale.z)).applyMatrix4(pl.matrix); const d = q.distanceTo(e); if (d < best.min) best = { min: d, s: ss, u: pl.userData.u, pass: pl.userData.pass, centre: pl.position.distanceTo(e) }; } }
    return best;
  }
  /* ---------- test #8: bioluminescent creatures (Scott's Drive art, tools/prepare_creatures.py -> tex/creatures.ktx2|jpg, one additive atlas) ----------
     ONE mesh, ONE draw call for all three animals: each is two gently curved cards (a sharp front layer + a softer, dimmer layer 0.3 m behind it,
     so it reads with depth in stereo), the angler also has a camera-facing glow quad for its lure orb. Poses are uniforms (mat4 per animal,
     updated in updateCreatures); fins/tentacles move in the vertex shader. Additive with colour premultiplied by the matte: black = transparent,
     no sorting, no rectangle. Paths: slow closed loops (0.08-0.13 m/s) well off the sub's path; fish + angler face along their swim direction
     (no billboard spin), the veil (rotationally symmetric-ish) yaw-turns toward the sub slowly. clearance(): every card point >= 6 m. */
  const CRE = [   // kind, centre (s, lateral, up), loop radii along s / lateral / vertical bob, period s, phase, card width m, aspect h/w, uv rect (atlas, v up)
    { kind: 'fish', s: 0.44 * L, lat: -10.0, up: 2.0, ra: 1.1, rl: 2.2, rv: 0.35, per: 200, ph: 0.6, w: 3.8, gain: 1.35, asp: 1248 / 2048, uv: [0.0, 0.390625, 0.5, 0.609375] },
    { kind: 'angler', s: 0.665 * L, lat: -8.6, up: 1.8, ra: 1.4, rl: 1.0, rv: 0.25, per: 300, ph: 2.2, w: 3.3, gain: 1.2, asp: 800 / 2048, uv: [0.0, 0.0, 0.5, 0.390625], orb: [0.425, -0.241] },
    { kind: 'veil', s: CHAMBERS[0] * L + 7, lat: -9.4, up: 1.6, ra: 1.4, rl: 1.0, rv: 0.6, per: 210, ph: 4.0, w: 2.3, asp: 2048 / 1656, uv: [0.5, 0.0, 0.404296875, 1.0] },
  ];
  CRE.forEach((c, i) => { c.id = i; c.on = (CONFIG.CREATURES ?? [1, 1, 1])[i] ?? 1; if (c.kind === 'angler' && CONFIG.ANGLER_S != null) c.s = CONFIG.ANGLER_S * L; });
  const creU = { uMap: { value: null }, uC: { value: CRE.map(() => new THREE.Matrix4()) }, uRect: { value: CRE.map((c) => new THREE.Vector4(...c.uv)) },
    uTime: tunnel.uniforms.uTime, uEnergy: BACKDROP_ENERGY_U, uFog: { value: GRADE.fog }, uGain: { value: CONFIG.CREATURE_GAIN ?? 1.0 },
    uSway: { value: CONFIG.CREATURE_SWAY ?? 1.0 }, uCG: { value: CRE.map((c) => c.gain ?? 1) }, uOrb: { value: CONFIG.ANGLER_ORB ?? 1.0 }, uOrbPos: { value: new THREE.Vector2(...CRE[1].orb) }, uFade: { value: CRE.map(() => 0) } };
  const creGeo = (() => {   // unit cards: x,y in [-0.5, 0.5]; aC = creature id, aL = layer (0 front, 1 back, 2 orb quad)
    const pos = [], uv = [], ac = [], al = [], idx = []; let base = 0;
    const card = (id, layer, nx, ny) => { for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { pos.push(i / nx - 0.5, j / ny - 0.5, 0); uv.push(i / nx, j / ny); ac.push(id); al.push(layer); }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = base + j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); } base += (nx + 1) * (ny + 1); };
    CRE.forEach((c) => { const [nx, ny] = c.kind === 'veil' ? [10, 20] : [24, 8]; card(c.id, 0, nx, ny); card(c.id, 1, Math.ceil(nx / 2), Math.ceil(ny / 2)); });
    card(1, 2, 1, 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aC', new THREE.Float32BufferAttribute(ac, 1)); g.setAttribute('aL', new THREE.Float32BufferAttribute(al, 1)); g.setIndex(idx); return g; })();
  const CRE_DEFORM = /* glsl */`
    // local card units (x,y in [-0.5,0.5]) -> displacement in metres (dz) and card units (dx, dy). All slow: 0.6-1.3 rad/s.
    vec3 creDeform(float id, vec2 p, float t, float w) {
      vec3 d = vec3(0.0);
      if (id < 0.5) {            // fish: body wave travelling head -> tail, bigger toward the tail; fins flutter a little
        float tail = clamp(0.62 - p.x, 0.0, 1.2);
        d.z = 0.16 * tail * tail * sin(p.x * 7.5 - t * 1.25) + 0.06 * abs(p.y) * 2.0 * sin(p.y * 9.0 + p.x * 4.0 - t * 1.1);
        d.y = 0.012 * tail * sin(p.x * 6.0 - t * 1.25);
      } else if (id < 1.5) {     // angler: tentacles (left/bottom) sway, the lure stalk bobs slowly
        float tent = smoothstep(0.05, -0.5, p.x) + 0.6 * smoothstep(0.0, -0.5, p.y) * smoothstep(0.15, -0.2, p.x);
        d.z = 0.22 * tent * sin(p.x * 6.0 + p.y * 4.0 - t * 0.9);
        d.y = 0.02 * tent * sin(p.x * 9.0 - t * 0.8);
        float stalk = smoothstep(0.05, 0.45, p.x); d.y += 0.025 * stalk * stalk * sin(t * 0.55); d.z += 0.12 * stalk * stalk * sin(t * 0.45 + 1.0);
      } else {                   // veil: waves rolling down the curtain, stronger at the trailing bottom
        float low = clamp(0.55 - p.y, 0.0, 1.1);
        d.x = 0.035 * low * sin(p.y * 8.0 + t * 0.95 + p.x * 2.0);
        d.z = 0.18 * low * sin(p.y * 6.0 + t * 0.8 + p.x * 3.0) + 0.05 * sin(p.x * 5.0 - t * 0.6);
      }
      d.z += -0.11 * w * (p.x * 2.0) * (p.x * 2.0);   // gently curved card (edges bend away from the viewer side)
      return d;
    }`;
  const creMat = new THREE.ShaderMaterial({ uniforms: creU, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`uniform mat4 uC[3]; uniform highp float uTime; uniform float uSway, uFade[3]; uniform vec2 uOrbPos;
      attribute float aC, aL; varying vec2 vUv; varying float vL, vC, vDist, vFade;
      ${CRE_DEFORM}
      void main() { int id = int(aC + 0.5); mat4 M = id == 0 ? uC[0] : (id == 1 ? uC[1] : uC[2]); float fd = id == 0 ? uFade[0] : (id == 1 ? uFade[1] : uFade[2]);
        float t = mod(uTime, 6283.0) + aC * 17.0; float w = length(M[0].xyz);
        vUv = uv; vL = aL; vC = aC; vFade = fd;
        vec4 wp;
        if (aL > 1.5) {   // lure orb glow: follows the deformed stalk tip, faces the camera
          vec3 d = creDeform(aC, uOrbPos, t, w) * uSway; vec4 c = modelMatrix * (M * vec4(uOrbPos + d.xy, 0.0, 1.0) + vec4(normalize(M[2].xyz) * d.z, 0.0));
          vec4 vp = viewMatrix * c; vp.xy += position.xy * 0.9; vDist = length(vp.xyz); gl_Position = projectionMatrix * vp; return; }
        vec2 p = position.xy; vec3 d = creDeform(aC, p, t, w) * uSway;
        float back = aL;                                    // back layer: 3 % larger, 0.3 m behind
        vec3 lp = vec3((p + d.xy) * (1.0 + 0.03 * back), 0.0);
        vec3 nz = normalize(M[2].xyz);
        wp = modelMatrix * (M * vec4(lp, 1.0) + vec4(nz * (d.z - 0.3 * back), 0.0));
        vDist = length(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`precision mediump float; uniform sampler2D uMap; uniform vec4 uRect[3]; uniform highp float uTime; uniform float uEnergy, uFog, uGain, uOrb, uCG[3];
      varying vec2 vUv; varying float vL, vC, vDist, vFade;
      void main() { float fog = exp(-vDist * uFog * 0.75); vec3 c;
        if (vL > 1.5) {   // orb: hot core + soft halo, gentle pulse (with the music when it plays)
          float r = length(vUv - 0.5) * 2.0; float pulse = 0.78 + 0.22 * sin(mod(uTime, 6283.0) * 1.15) + 0.5 * uEnergy;
          float g = exp(-r * r * 7.0) * 0.55 + exp(-r * r * 60.0) * 1.1; g *= smoothstep(1.0, 0.7, r);
          c = vec3(0.35, 0.9, 1.0) * g * pulse * uOrb;
        } else {
          int id = int(vC + 0.5); vec4 R = id == 0 ? uRect[0] : (id == 1 ? uRect[1] : uRect[2]);
          vec2 e = smoothstep(vec2(0.0), vec2(0.035), vUv) * smoothstep(vec2(1.0), vec2(0.965), vUv);   // guaranteed black border
          vec3 tx = pow(texture2D(uMap, R.xy + vUv * R.zw, vL * 1.6).rgb, vec3(0.4545));               // display values (raw output like the walls)
          c = tx * e.x * e.y * (vL > 0.5 ? 0.38 : 1.0) * uGain * (id == 0 ? uCG[0] : (id == 1 ? uCG[1] : uCG[2]));
        }
        c *= fog * vFade;
        gl_FragColor = vec4(c, 1.0); }` });
  const creMesh = new THREE.Mesh(creGeo, creMat); creMesh.frustumCulled = false; creMesh.renderOrder = 3; creMesh.visible = false; creMesh.name = 'creatures'; rideWorld.add(creMesh);
  const _cp = new THREE.Vector3(), _cv = new THREE.Vector3(), _cx = new THREE.Vector3(), _cy = new THREE.Vector3(0, 1, 0), _cz = new THREE.Vector3(), _ce = new THREE.Vector3(), _cs = new THREE.Vector3();
  /** creature c centre at time t (rideWorld-local) */
  const crePos = (c, t, out) => { const a = (t / c.per) * Math.PI * 2 + c.ph; return frameAt(c.s + Math.cos(a) * c.ra, c.lat + Math.sin(a) * c.rl, c.up + Math.sin(a * 2.0 + 0.7) * c.rv, out); };
  /** pose matrix (T * R * S(w, h, 1)) of creature c at time t, seen from eye */
  function crePose(c, t, eye, M) {
    crePos(c, t, _cp);
    if (c.kind === 'veil') { _cz.set(eye.x - _cp.x, 0, eye.z - _cp.z).normalize(); _cx.crossVectors(_cy, _cz).normalize(); }   // yaw toward the sub (slow: it is ~9 m away)
    else { crePos(c, t + 7.0, _cv); crePos(c, t - 7.0, _cx); _cx.subVectors(_cv, _cx).setY(0).normalize(); _cz.crossVectors(_cx, _cy).normalize(); }  // head along the swim direction (14 s chord: turns are slow and smooth)
    M.makeBasis(_cx, _cy, _cz).scale(_cs.set(c.w, c.w * c.asp, 1)).setPosition(_cp); return M;
  }
  function updateCreatures(subS, t, dt = 0) {
    if (!creU.uMap.value) return; path.pointOf(subS, _ce); let any = false;
    CRE.forEach((c, i) => { crePose(c, t, _ce, creU.uC.value[i]); const d = _cp.distanceTo(_ce);
      const want = c.on && d < 70 ? 1 : 0; const f = creU.uFade.value; f[i] += (want - f[i]) * Math.min(1, dt * 1.0 + (dt === 0 ? 1 : 0)); if (f[i] > 0.002) any = true; });   // (fog hides it long before 70 m)
    creMesh.visible = any;
  }
  /** min distance from the cockpit eye to any creature card point (incl. sway + curvature bounds) over a lap and over each loop period */
  function creatureClearance(stepS = 1.0) {
    let best = { min: Infinity }; const M = new THREE.Matrix4(), e = new THREE.Vector3(), q = new THREE.Vector3();
    for (const c of CRE) { if (!c.on) continue;
      for (let ss = c.s - 40; ss <= c.s + 40; ss += stepS) { path.pointOf(ss, e);
        for (let k = 0; k < 24; k++) { const t = k / 24 * c.per; crePose(c, t, e, M);
          for (let a = -0.5; a <= 0.5001; a += 0.125) for (let b = -0.5; b <= 0.5001; b += 0.25) for (const z of [-0.95, 0.3]) {   // z: sway + curve envelope, both sides
            q.set(a, b, 0).applyMatrix4(M); q.addScaledVector(_cz.setFromMatrixColumn(M, 2).normalize(), z); const d = q.distanceTo(e); if (d < best.min) best = { min: d, kind: c.kind, s: ss, t }; } } } }
    return best;
  }
  const setCreatureTexture = (t) => { t.anisotropy = Math.max(t.anisotropy || 1, 4); creU.uMap.value = t; creMat.needsUpdate = true; };
  let lastRipple = -10;
  return {
    tunnel, jellies, snow, shafts, vent, loopPlanes, loopSpots, anchors, addLoop, backdrops, backdropLayers, backdropSpots, addBackdrop, props, cathedral, caveRock,
    VENTS, instances, addLoopInstances, updateInstances, loopSpotList, bigRayClearance, BIG, BIG2, bigActive,
    CRE, creMesh, creU, updateCreatures, creatureClearance, setCreatureTexture, crePose, crePos,
    /** ripple origin: a wall point 12-30 m ahead of the sub, never the floor */
    ripple(sNow, t) {
      if (t - lastRipple < CONFIG.RIPPLE_MIN_INTERVAL) return false; lastRipple = t;
      const s = sNow + 12 + Math.random() * 18, R = tunnelRadius(((s % L) + L) % L, L), th = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.3);
      frameAt(s, Math.sin(th) * R * 0.95, -Math.cos(th) * R * 0.95, tmp); tunnel.ripple(tmp, t); return true;
    },
    /** Closest approach of anything to the cockpit (eye on the path) over a full lap, sampled every `step` m. Returns per-category minima. */
    clearance(step = 0.5) {
      const res = { walls: Infinity, jellies: Infinity, loops: Infinity, backdrops: Infinity, props: Infinity, floor: Infinity, shafts: Infinity, vent: Infinity, instances: Infinity, samples: 0 }, e = new THREE.Vector3(), q = new THREE.Vector3();
      const rp = tunnel.ringPts, nR = rp.length - 1;
      const loopPts = loopPlanes.map((p) => { p.updateMatrix(); const pts = []; const w = p.scale.x, h = p.scale.y; for (let a = -0.5; a <= 0.5; a += 0.125) for (let b = -0.5; b <= 0.5; b += 0.25) pts.push(new THREE.Vector3(a, b, 0).applyMatrix4(p.matrix)); return pts; });
      const shaftAx = []; for (const sh of shafts) { sh.group.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(rideWorld.matrixWorld).invert(); sh.group.children.forEach((m) => { const top = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld).applyMatrix4(inv); shaftAx.push({ top, r: 3.8 * 0.6 }); }); }
      const bdPts = backdropLayers.map((b) => { b.updateMatrix(); const P = b.geometry.attributes.position, w = b.geometry.parameters.width, h = b.geometry.parameters.height, pts = [];
        for (let a = -0.5; a <= 0.5; a += 0.1) for (let c2 = -0.5; c2 <= 0.5; c2 += 0.25) pts.push(new THREE.Vector3(a * w, c2 * h, 0).applyMatrix4(b.matrix));   // planar samples
        for (let k = 0; k < P.count; k++) pts.push(new THREE.Vector3().fromBufferAttribute(P, k).applyMatrix4(b.matrix)); return pts; });   // + real (curved) vertices
      const propPts = Float32Array.from([...props.rock.geometry.attributes.position.array, ...props.ice.geometry.attributes.position.array]);
      const flPts = cathedral.mesh.geometry.attributes.position.array;
      for (let s = 0; s < L; s += step) {
        path.pointOf(s, e); res.samples++;
        const i0 = Math.round(s / L * nR);
        for (let di = -40; di <= 40; di++) { const ring = rp[((i0 + di) % nR + nR) % nR]; for (const v of ring) { const d = Math.hypot(v[0] - e.x, v[1] - e.y, v[2] - e.z); if (d < res.walls) res.walls = d; } }
        for (const a of anchors) { const j = jellies.jellies[anchors.indexOf(a)]; const sz = j.size; q.copy(a.pos); q.y -= 1.8 * sz; const d = q.distanceTo(e) - (a.r + 2.2 * sz + 0.6); if (d < res.jellies) res.jellies = d; }
        for (const pts of loopPts) for (const p of pts) { const d = p.distanceTo(e); if (d < res.loops) res.loops = d; }
        for (const ax of shaftAx) { const d = Math.hypot(ax.top.x - e.x, ax.top.z - e.z) - ax.r; if (d < res.shafts) res.shafts = d; }
        for (const b of bdPts) for (const p of b) { const d = p.distanceTo(e); if (d < res.backdrops) res.backdrops = d; }
        for (let k = 0; k < propPts.length; k += 3) { const dx = propPts[k] - e.x, dy = propPts[k + 1] - e.y, dz = propPts[k + 2] - e.z; if (dx * dx + dz * dz > 900) continue; const d = Math.sqrt(dx * dx + dy * dy + dz * dz); if (d < res.props) res.props = d; }
        for (let k = 0; k < flPts.length; k += 3) { const dx = flPts[k] - e.x, dz = flPts[k + 2] - e.z; if (dx * dx + dz * dz > 900) continue; const d = Math.hypot(dx, flPts[k + 1] - e.y, dz); if (d < res.floor) res.floor = d; }
        const dv = vent.position.distanceTo(e) - 2; if (dv < res.vent) res.vent = dv;
        for (const pl of instances) { if (pl.userData.kind === 'bigray') continue; if (pl.userData.spot && Math.abs(pl.userData.spot.s - s) > 45 && L - Math.abs(pl.userData.spot.s - s) > 45) continue;
          for (const tt of (pl.userData.kind === 'ray' ? [0, 30, 60, 90, 120, 150, 180] : [0])) { poseInstance(pl, s, tt, e); pl.updateMatrix();
            const b0 = pl.userData.kind === 'plume' ? 0 : -0.5;   // plume planes pivot at their bottom edge (local y 0..1)
            for (let a = -0.5; a <= 0.5001; a += 0.25) for (let b = b0; b <= b0 + 1.0001; b += 0.25) { q.set(a, b, 0).applyMatrix4(pl.matrix); const d = q.distanceTo(e); if (d < res.instances) res.instances = d; } } }
      }
      res.bigRay = bigRayClearance().min; res.creatures = creatureClearance(2.0).min; res.caveRock = caveRock ? caveRock.minClear : Infinity;
      res.min = Math.min(res.floor, res.walls, res.jellies, res.loops, res.backdrops, res.props, res.shafts, res.vent, res.instances, res.bigRay, res.creatures, res.caveRock); return res;
    },
  };
}
