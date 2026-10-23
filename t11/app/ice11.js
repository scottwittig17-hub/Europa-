// ice11.js — Europa test #11: ice walls with rippled overhangs + brinicles, glassy ice columns, jagged distant ice formations,
// and the shared normal/roughness-map helpers (dFdx/dFdy cotangent frame: no tangent attributes needed; WebGL2 / three r160).
// Everything here is lit ONLY by the sub's shader headlights (hlSpot): unlit it is black (deep-black look), lit it appears in the beams.
// Comfort: every vertex is kept >= CLEAR m from the path (the cockpit eye rides on the path); verified by clearance() in ride.js.
import * as THREE from 'three';
import { CONFIG } from './config.js';

/* ---------- textures (filled by main.js from art-manifest.json; neutral 1x1 defaults so shaders never branch) ---------- */
const px = (r, g, b, srgb) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; };
const FLAT_NR = () => px(128, 128, 170, false);   // flat normal, roughness ~0.67
export const T11_TEX = {
  icewall: { value: px(70, 95, 120, true) }, icewallNr: { value: FLAT_NR() },
  icecol: { value: px(120, 170, 210, true) }, icecolNr: { value: FLAT_NR() },
  icedet: { value: px(160, 190, 210, true) }, icedetNr: { value: FLAT_NR() },
  rockNr: { value: FLAT_NR() }, tunnelNr: { value: FLAT_NR() }, wallsNr: { value: FLAT_NR() },
};
/* normal strengths, tuned in-engine (Quest grade); every one is a live uniform (?nr=0 turns all maps off for A/B) */
const NRQ = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('nr') : null, NRK = NRQ != null ? +NRQ : 1;
export const NR_U = {
  uNrTunnel: { value: (CONFIG.TUNNEL_NR_STR ?? 0.85) * NRK }, uNrRock: { value: (CONFIG.ROCK_NR_STR ?? 1.0) * NRK }, uNrWalls: { value: (CONFIG.WALLS_NR_STR ?? 0.7) * NRK },
  uNrIceWall: { value: (CONFIG.ICEWALL_NR_STR ?? 1.15) * NRK }, uNrIceCol: { value: (CONFIG.ICECOL_NR_STR ?? 0.8) * NRK }, uNrIceDet: { value: (CONFIG.ICEDET_NR_STR ?? 0.55) * NRK },
  uSpec: { value: (CONFIG.T11_SPEC ?? 1) * (NRQ === '0' ? 0 : 1) },
};

/** GLSL: perturb a (world) normal with a tangent-space normal map using screen-space derivatives (no tangents). xy = map.xy*2-1 times strength. */
export const NR_GLSL = /* glsl */`
vec3 nrPerturb(vec3 N, highp vec3 wp, highp vec2 uv, vec2 xy){
  highp vec3 q0 = dFdx(wp), q1 = dFdy(wp); highp vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  highp vec3 q1p = cross(q1, N), q0p = cross(N, q0);
  highp vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  highp float det = max(dot(T, T), dot(B, B)); if (det <= 0.0) return N;
  highp float sc = inversesqrt(det); float l = length(xy); if (l > 0.95) xy *= 0.95 / l;
  return normalize(vec3(T * (xy.x * sc) + B * (xy.y * sc)) + N * sqrt(max(0.0, 1.0 - dot(xy, xy))));
}
vec2 nrXY(vec4 t, float k){ return (t.xy * 2.0 - 1.0) * k; }`;
/** GLSL (needs HL_UNIFORMS): headlight specular (Blinn, roughness-driven), per pixel, for both lamps. */
export const SPEC_GLSL = /* glsl */`
float hlSpec(highp vec3 wp, vec3 n, vec3 e, float rough){
  if (uHLInt <= 0.0) return 0.0; float acc = 0.0, pw = mix(260.0, 10.0, rough);
  for (int i = 0; i < 2; i++) { highp vec3 d = wp - uHLPos[i]; highp float dist = max(length(d), 0.05); vec3 l = vec3(d / dist);
    float cone = smoothstep(uHLCone.x, uHLCone.y, dot(l, uHLDir[i])); if (cone <= 0.0) continue;
    vec3 h = normalize(e - l); float nh = abs(dot(n, h)); acc += cone * hlFall(float(dist)) * pow(nh, pw) * (pw + 8.0) / 40.0; }
  return acc * (1.0 - rough) * (1.0 - rough);
}
float hlCone(highp vec3 wp){   // cone x falloff only (no N.L): light that reaches a point (translucent scatter)
  float acc = 0.0; for (int i = 0; i < 2; i++) { highp vec3 d = wp - uHLPos[i]; highp float dist = max(length(d), 0.05);
    acc += smoothstep(uHLCone.x, uHLCone.y, dot(vec3(d / dist), uHLDir[i])) * hlFall(float(dist)); } return acc; }`;

/* ---------- geometry helpers ---------- */
/** Non-indexed triangle soup -> normals smoothed only across edges whose faces meet at < angleDeg (crease angle; flat-faceted beyond). */
export function creaseNormals(g, angleDeg = 35) {
  if (g.index) g = g.toNonIndexed();
  const P = g.attributes.position.array, n = P.length / 9, fn = new Float32Array(n * 3), cosA = Math.cos(angleDeg * Math.PI / 180);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < n; f++) { a.fromArray(P, f * 9); b.fromArray(P, f * 9 + 3); c.fromArray(P, f * 9 + 6); b.sub(a); c.sub(a); b.cross(c); fn[f * 3] = b.x; fn[f * 3 + 1] = b.y; fn[f * 3 + 2] = b.z; }   // area-weighted
  const key = (i) => `${Math.round(P[i] * 1e3)},${Math.round(P[i + 1] * 1e3)},${Math.round(P[i + 2] * 1e3)}`, map = new Map();
  for (let v = 0; v < n * 3; v++) { const k = key(v * 3); let l = map.get(k); if (!l) map.set(k, (l = [])); l.push(Math.floor(v / 3)); }
  const N = new Float32Array(n * 9), fa = new THREE.Vector3(), fb = new THREE.Vector3(), s = new THREE.Vector3();
  for (let v = 0; v < n * 3; v++) { const f = Math.floor(v / 3); fa.fromArray(fn, f * 3).normalize(); s.set(0, 0, 0);
    for (const o of map.get(key(v * 3))) { fb.fromArray(fn, o * 3); const len = fb.length(); if (len < 1e-12) continue; if (fb.dot(fa) / len >= cosA) s.addScaledVector(fb, 1); }
    if (s.lengthSq() < 1e-20) s.copy(fa); s.normalize(); N[v * 3] = s.x; N[v * 3 + 1] = s.y; N[v * 3 + 2] = s.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); return g;
}
function mergeGeos(geos, names) {
  const total = geos.reduce((a, g) => a + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
  for (const name of names) { const sz = geos[0].attributes[name].itemSize, arr = new Float32Array(total * sz); let o = 0; for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; } out.setAttribute(name, new THREE.BufferAttribute(arr, sz)); }
  out.computeBoundingSphere(); return out;
}
const attr1 = (g, name, v) => { g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; };

/**
 * Build the test-#11 ice set. ctx = { path, rideWorld, frameAt, tunnelRadius, FLOOR, CHAMBERS, VENTS, ventTop, loopSpots, ringPts, vnoise3, fbm3,
 *   GRADE, LIGHT_U, GRADE_U, GRADE_GLSL, HL_GLSL, NOISE, columns: [{s, lat, h, r}], tunnelUniforms }
 */
export function buildIce11(ctx) {
  const { path, rideWorld, frameAt, tunnelRadius, FLOOR, CHAMBERS, VENTS, ringPts, vnoise3 } = ctx, { L } = path;
  const CLEAR = CONFIG.T11_CLEAR ?? 6.6;
  let seed = 9001; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const v = new THREE.Vector3(), pp = new THREE.Vector3(), side = new THREE.Vector3();
  const wrapS = (s) => ((s % L) + L) % L;
  // path samples for clearance (every 0.5 m), bucketed by 10 m of s for speed
  const PS = []; for (let s = 0; s < L; s += 0.5) PS.push(path.pointOf(s, new THREE.Vector3()).clone());
  const minDistNear = (p, sHint, span = 30) => { let m = 1e9; const i0 = Math.round(wrapS(sHint) / 0.5), n = PS.length, k = Math.round(span / 0.5);
    for (let di = -k; di <= k; di++) { const q = PS[((i0 + di) % n + n) % n]; const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  // tunnel cross-section at s in (lateral, up) path coordinates (displaced ring vertices) and a point-in-polygon test
  const nR = ringPts.length - 1, c0 = new THREE.Vector3();
  const sect = (s) => { const i = ((Math.round(wrapS(s) / L * nR) % nR) + nR) % nR, ss = i / nR * L; path.pointOf(ss, c0); const yaw = path.yawOf(ss); side.set(Math.cos(yaw), 0, -Math.sin(yaw));
    return ringPts[i].map((q) => [(q[0] - c0.x) * side.x + (q[2] - c0.z) * side.z, q[1] - c0.y]); };
  const inPoly = (poly, x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
  // distance to the polygon boundary (approx: min vertex distance) and the wall's lateral extent at height y on one side
  const wallLat = (poly, y, sgn) => { let best = null; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y)) { const x = xi + (y - yi) / (yj - yi) * (xj - xi); if (x * sgn > 0 && (best === null || Math.abs(x) < Math.abs(best))) best = x; } } return best; };
  const nearVent = (s, lat, r) => VENTS.some((vv) => { let ds = Math.abs(wrapS(vv[0]) - wrapS(s)); ds = Math.min(ds, L - ds); return Math.hypot(ds, vv[1] - lat) < r + vv[3] * 2.9; });
  const nearLoop = (p, r) => ctx.loopSpots.some((sp) => sp.pos.distanceTo(p) < r);
  const report = { walls: 0, brinicles: 0, shards: 0, columns: 0, minClear: Infinity, tris: 0 };

  /* ===== 1. ICE WALLS with rippled overhangs + brinicles (one opaque mesh, 1 draw) ===== */
  const wallGeos = [];
  const SEGS = CONFIG.T11_ICE_WALLS === 0 ? [] : [   // [lap fraction of the centre, side (+1 right / -1 left), length m, base lateral, overhang height above the path, overhang reach]
    [0.235, -1, 24, 9.3, 4.2, 1.9], [0.365, 1, 16, 9.0, 3.6, 1.6], [0.605, 1, 22, 9.4, 4.6, 2.0],
    [0.655, -1, 15, 9.2, 3.9, 1.7], [0.875, -1, 24, 9.4, 4.4, 2.0], [0.018, 1, 20, 9.2, 4.0, 1.8]];
  const brin = [];
  for (const [f, sg, len, base, lipUp, lipOut] of SEGS) {
    const sc = f * L, s0 = sc - len / 2, ds = 0.5, dy = 0.4, y0 = FLOOR - 1.0, y1 = 12.5, ns = Math.round(len / ds), ny = Math.round((y1 - y0) / dy);
    const P = [], UV = [], grid = [];
    for (let i = 0; i <= ns; i++) {
      const s = s0 + i * ds, t = i / ns, endB = THREE.MathUtils.smoothstep(t, 0, 0.16) * (1 - THREE.MathUtils.smoothstep(t, 0.84, 1)), poly = sect(s);
      const row = [];
      for (let j = 0; j <= ny; j++) {
        const y = y0 + j * dy;
        const under = y < lipUp ? Math.exp(-(((y - lipUp) / 2.4) ** 2)) : Math.exp(-(((y - lipUp) / 0.75) ** 2));   // gradual underside, abrupt top: an overhang
        const n1 = vnoise3(s * 0.22 + f * 50, y * 0.28, sg * 3.1), n2 = vnoise3(s * 0.6, y * 0.9 + 7, f * 20);
        // rippled ice: horizontal scallop bands (strongest on the overhang underside, like the reference), slow along-path waves, fbm lumps
        const ripple = (0.22 + 0.32 * under) * Math.sin(y * 3.4 + 2.2 * n1 + 0.35 * Math.sin(s * 0.5)) + 0.55 * (n1 - 0.5) + 0.22 * (n2 - 0.5) + 0.18 * Math.sin(s * 0.95 + y * 0.6);
        const lipK = lipOut * (0.75 + 0.5 * vnoise3(s * 0.18, 3.3, f * 9));
        let lat = base + ripple - lipK * under - 0.5 * Math.max(0, (y - lipUp - 1.2) / 6);   // slight inward lean above the lip, then into the roof
        const wl = wallLat(poly, y, sg); const behind = wl === null ? base + 3 : Math.abs(wl) + 1.2;   // just behind the tunnel rock: sinks into the wall
        lat = Math.min(lat, behind); lat = lat + (behind - lat) * (1 - endB);
        frameAt(s, sg * lat, y, v);
        for (let it = 0; it < 12 && minDistNear(v, s) < CLEAR; it++) { lat += 0.35; frameAt(s, sg * lat, y, v); }   // comfort push-out
        row.push(P.length / 3); P.push(v.x, v.y, v.z); UV.push(s * 0.26, y * 0.26);
      }
      grid.push(row);
    }
    const I = []; for (let i = 0; i < ns; i++) for (let j = 0; j < ny; j++) { const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1]; I.push(a, b, d, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
    const gn = creaseNormals(g.toNonIndexed(), 35); attr1(gn, 'aKind', 0); wallGeos.push(gn); report.walls++;
    // brinicles: hanging from the overhang lip, inside the wall (3-4 per wall), tapering knobbly tubes with a slow curl
    const nb = 2 + Math.round(len / 9);
    for (let k = 0; k < nb; k++) brin.push([s0 + len * (0.2 + 0.6 * (k + 0.5) / nb) + (rnd() - 0.5) * 2, sg, base - lipOut * 0.75, lipUp - 0.2, 2.6 + rnd() * 3.4, 0.22 + rnd() * 0.16, f]);
  }
  for (const [s, sg, lat0, top, len0, r0, f] of brin) {
    let lat = lat0, len = len0, ok = false, geo = null;
    for (let tries = 0; tries < 16 && !ok; tries++) {
      const RS = 7, NS = 16, P = [], UV = [], I = [], ph = rnd() * 6.28;
      for (let i = 0; i <= NS; i++) { const t = i / NS, y = top - t * len, curl = 0.35 * Math.sin(t * 3.2 + ph) * t, curl2 = 0.25 * Math.cos(t * 2.6 + ph) * t;
        const rr = r0 * (1 - 0.85 * Math.pow(t, 1.3)) * (1 + 0.32 * Math.sin(t * 17 + ph) * (1 - t) + 0.18 * (vnoise3(s, y * 2.2, ph) - 0.5)) + 0.02;
        frameAt(s + curl2, sg * (lat + curl), y, pp);
        for (let k = 0; k <= RS; k++) { const a = k / RS * Math.PI * 2; P.push(pp.x + Math.cos(a) * rr, pp.y, pp.z + Math.sin(a) * rr); UV.push(k / RS, -y * 0.6); } }
      for (let i = 0; i < NS; i++) for (let k = 0; k < RS; k++) { const a = i * (RS + 1) + k, b = a + RS + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
      const pa = g.attributes.position; let m = 1e9; for (let j = 0; j < pa.count; j++) { v.fromBufferAttribute(pa, j); m = Math.min(m, minDistNear(v, s)); }
      if (m >= CLEAR) { ok = true; geo = g; } else { lat += 0.3; len *= 0.88; }
    }
    if (geo) { const gn = creaseNormals(geo.toNonIndexed(), 40); attr1(gn, 'aKind', 1); wallGeos.push(gn); report.brinicles++; }
  }

  const iceWallMat = new THREE.ShaderMaterial({
    uniforms: { uAlb: T11_TEX.icewall, uNr: T11_TEX.icewallNr, uNrK: NR_U.uNrIceWall, uSpecK: NR_U.uSpec, uFog: { value: ctx.GRADE.fog }, ...ctx.GRADE_U, ...ctx.LIGHT_U,
      uDeepBlue: { value: new THREE.Color(...(CONFIG.ICEWALL_GLOW ?? [0.03, 0.17, 0.62])) }, uGlowK: { value: CONFIG.ICEWALL_GLOW_K ?? 1.0 } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`attribute float aKind; varying vec3 vN; varying highp vec3 vW; varying highp vec2 vUv; varying float vDist, vKind;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vUv = uv; vKind = aKind; vN = normalize(mat3(modelMatrix) * normal); vDist = length(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`precision mediump float;
      uniform sampler2D uAlb, uNr; uniform float uNrK, uSpecK, uFog, uGlowK; uniform vec3 uFogCol, uDeepBlue;
      varying vec3 vN; varying highp vec3 vW; varying highp vec2 vUv; varying float vDist, vKind;
      ${ctx.GRADE_GLSL}
      ${ctx.HL_GLSL}
      ${SPEC_GLSL}
      ${NR_GLSL}
      void main(){
        vec3 e = normalize(cameraPosition - vW), n0 = normalize(vN); n0 = faceforward(n0, -e, n0);
        vec4 nt = texture2D(uNr, vUv); vec3 n = nrPerturb(n0, vW, vUv, nrXY(nt, uNrK * (1.0 - 0.6 * vKind)));
        vec3 alb = texture2D(uAlb, vUv).rgb; float rough = nt.b;
        if (vKind > 0.5) { alb = mix(alb, vec3(0.62, 0.82, 0.95), 0.55); rough *= 0.55; }   // brinicles: whiter, glassier
        float ndv = max(dot(n, e), 0.0);
        float lit = hlSpot(vW, n, 0.0), reach = hlCone(vW);                                   // direct (N.L) + light that reaches the ice (scatter)
        float sp = hlSpec(vW, n, e, rough) * uSpecK;
        // deep-blue glow in the beam: light scattering inside the ice, strongest at grazing angles and in the thin overhang lips/brinicles
        float sss = reach * (0.45 + 0.55 * pow(1.0 - ndv, 1.5)) * (1.0 + 0.8 * vKind);
        float crack = veinMask(alb);
        vec3 lin = alb * lit * 0.95 + uDeepBlue * sss * 0.9 * uGlowK + vec3(0.75, 0.92, 1.0) * sp * 0.55 + vec3(0.1, 0.75, 0.95) * crack * reach * 0.35;
        vec3 c = hmdGrade(uHLCol * uHLInt * lin + alb * uAmb * 0.06 * (0.6 + 0.4 * ndv));   // ~black unlit in headlights mode (uAmb tiny)
        c = mix(c, uFogCol, 1.0 - exp(-vDist * uFog));
        gl_FragColor = vec4(softClip(c), 1.0); }`,
  });
  let walls = null;
  if (wallGeos.length) { const g = mergeGeos(wallGeos, ['position', 'normal', 'uv', 'aKind']); walls = new THREE.Mesh(g, iceWallMat); walls.name = 'ice-walls'; walls.renderOrder = -8; walls.frustumCulled = false; rideWorld.add(walls); report.tris += g.attributes.position.count / 3; }

  /* ===== 2. GLASSY ICE: columns (pillars chamber) + jagged distant formations (one translucent mesh, 1 draw) ===== */
  const glassGeos = [];
  const lumpy = (g, amt, fq) => { const p = g.attributes.position; for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); const n = vnoise3(v.x * fq + 3, v.y * fq, v.z * fq) - 0.5; const r = Math.hypot(v.x, v.z); if (r > 1e-3) { const sc = 1 + amt * n * 2; p.setX(k, v.x * sc); p.setZ(k, v.z * sc); } } return g; };
  if (CONFIG.T11_COLUMNS !== 0) for (const c of ctx.columns || []) {
    const { s, lat, h, r } = c; const reps = Math.max(1, Math.round(2 * Math.PI * r / 1.7));
    const g = new THREE.CylinderGeometry(r * 0.8, r * 1.25, h, 12, 12, true); lumpy(g, 0.2, 0.9); g.translate(0, h / 2, 0);
    { const p = g.attributes.position, uv = g.attributes.uv; for (let j = 0; j < p.count; j++) { const y = p.getY(j), a = y * 0.09, x = p.getX(j), z = p.getZ(j); p.setX(j, x * Math.cos(a) - z * Math.sin(a)); p.setZ(j, x * Math.sin(a) + z * Math.cos(a)); uv.setXY(j, uv.getX(j) * reps, y / 1.7); } }
    const pf = frameAt(s, lat, 0, new THREE.Vector3()); g.translate(pf.x, pf.y + FLOOR - 0.5, pf.z);
    const gn = creaseNormals(g.toNonIndexed(), 35); attr1(gn, 'aKind', 0); glassGeos.push(gn); report.columns++;
  }
  // jagged formations: clusters of 3-6 sharp hexagonal/pentagonal shards rising from the bed or hanging from the roof, near the walls on BOTH sides,
  // flat-faceted (crease 0). Tips stay inside the tunnel section; nothing within CLEAR of the path; not in front of the vents painting, chimneys or loops.
  const shard = (r, h, sides, lean, twist) => { const g = new THREE.CylinderGeometry(0, r, h, sides, 2, false); const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) { const y = p.getY(j) + h / 2, k = y / h; p.setX(j, p.getX(j) * (1 + 0.25 * Math.sin(j * 1.7)) + lean * k * h * 0.25); p.setZ(j, p.getZ(j) + twist * k * h * 0.12); p.setY(j, y); }
    return g; };
  const NCL = CONFIG.T11_SHARDS === 0 ? 0 : (CONFIG.T11_SHARD_CLUSTERS ?? 46);
  for (let k = 0; k < NCL; k++) {
    const s = (k + rnd() * 0.8) / NCL * L, sg = rnd() < 0.5 ? -1 : 1, hang = rnd() < 0.3;
    let dc = 1; for (const c of CHAMBERS) { let d = Math.abs(s - c * L); d = Math.min(d, L - d); dc = Math.min(dc, d); }
    if (Math.abs(s - CHAMBERS[1] * L) < 17 && sg < 0) continue;   // keep the vents painting (left side of the vents chamber) clear
    const poly = sect(s); const y = hang ? 6 + rnd() * 3 : FLOOR + 0.3; const wl = wallLat(poly, hang ? y : FLOOR + 1.2, sg); if (wl === null) continue;
    const latB = Math.abs(wl) - (hang ? 0.6 : 0.4) - rnd() * 1.2; if (latB < 9.5) continue;   // "in the distance": against the walls, well off the path
    if (nearVent(s, sg * latB, 2.5)) continue; frameAt(s, sg * latB, y, pp); if (nearLoop(pp, 6)) continue;
    const n = 3 + Math.floor(rnd() * 4), cl = [];
    for (let q = 0; q < n; q++) {
      let h = (hang ? 1.8 + rnd() * 3.2 : 2.2 + rnd() * 5.5) * (q === 0 ? 1.25 : 0.75 + rnd() * 0.4), r = 0.25 + rnd() * 0.45 + h * 0.05;
      const sides = rnd() < 0.5 ? 5 : 6, lean = (rnd() - 0.5) * 1.6, tw = (rnd() - 0.5) * 2, rx = (rnd() - 0.5) * 0.9, rz = (rnd() - 0.5) * 0.9, ry = rnd() * 6.28;
      const off = [(rnd() - 0.5) * 2.2, (rnd() - 0.5) * 1.4];
      for (let tries = 0; tries < 10; tries++) {
        const g = shard(r, h, sides, lean, tw); g.rotateY(ry); g.rotateX(rx); g.rotateZ(rz - sg * 0.35); if (hang) g.scale(1, -1, 1);   // lean in toward the path a little (jagged)
        frameAt(s + off[0], sg * (latB + off[1] * 0.5), y, pp); g.translate(pp.x, pp.y, pp.z);
        const pa = g.attributes.position; let m = 1e9, tipIn = true;
        for (let j = 0; j < pa.count; j++) { v.fromBufferAttribute(pa, j); m = Math.min(m, minDistNear(v, s)); }
        { // the tip (max |y - base|) must sit inside the tunnel cross-section
          let tj = 0, best = -1; for (let j = 0; j < pa.count; j++) { const dy = Math.abs(pa.getY(j) - pp.y); if (dy > best) { best = dy; tj = j; } }
          v.fromBufferAttribute(pa, tj); path.pointOf(s, c0); const yaw = path.yawOf(s); side.set(Math.cos(yaw), 0, -Math.sin(yaw));
          tipIn = inPoly(poly, (v.x - c0.x) * side.x + (v.z - c0.z) * side.z - sg * 0.4, v.y - c0.y + (hang ? 0.4 : -0.4)); }
        if (m >= CLEAR && tipIn) { const gn = g.toNonIndexed(); gn.deleteAttribute('normal'); gn.computeVertexNormals();   // flat facets
          const uv = gn.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * 2.0, gn.attributes.position.getY(j) / 1.7);
          attr1(gn, 'aKind', 1); cl.push(gn); break; }
        h *= 0.85;
      }
    }
    if (cl.length) { glassGeos.push(...cl); report.shards += cl.length; }
  }
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uAlb: T11_TEX.icecol, uNr: T11_TEX.icecolNr, uDet: T11_TEX.icedet, uDetNr: T11_TEX.icedetNr, uNrK: NR_U.uNrIceCol, uDetK: NR_U.uNrIceDet, uSpecK: NR_U.uSpec,
      uFog: { value: ctx.GRADE.fog }, uTime: ctx.tunnelUniforms.uTime, ...ctx.GRADE_U, ...ctx.LIGHT_U },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,   // premultiplied: glass only dims what is behind where it is LIT
    vertexShader: /* glsl */`attribute float aKind; varying vec3 vN; varying highp vec3 vW; varying highp vec2 vUv; varying float vDist, vKind;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vUv = uv; vKind = aKind; vN = normalize(mat3(modelMatrix) * normal); vDist = length(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`precision mediump float;
      uniform sampler2D uAlb, uNr, uDet, uDetNr; uniform float uNrK, uDetK, uSpecK, uFog; uniform vec3 uFogCol;
      varying vec3 vN; varying highp vec3 vW; varying highp vec2 vUv; varying float vDist, vKind;
      ${ctx.GRADE_GLSL}
      ${ctx.HL_GLSL}
      ${SPEC_GLSL}
      ${NR_GLSL}
      void main(){
        vec3 e = normalize(cameraPosition - vW), n0 = normalize(vN); n0 = faceforward(n0, -e, n0);
        float near = 1.0 - smoothstep(5.0, 15.0, vDist);                     // bubbles detail layer only up close (and only costs there visually)
        highp vec2 duv = vUv * 3.3;
        vec4 nt = texture2D(uNr, vUv), dt = texture2D(uDetNr, duv);
        vec3 n = nrPerturb(n0, vW, vUv, nrXY(nt, uNrK) + nrXY(dt, uDetK * near));
        vec3 alb = texture2D(uAlb, vUv).rgb, det = texture2D(uDet, duv).rgb;
        alb = mix(alb, alb * (0.55 + 0.9 * det), 0.6 * near);
        float rough = clamp(mix(nt.b, dt.b, 0.4 * near) * 0.7, 0.04, 1.0);   // glassy: smoother than the maps' rock-ish range
        float ndv = max(dot(n, e), 0.0), fr = pow(1.0 - ndv, 3.0);
        float lit = hlSpot(vW, n, 1.0), reach = hlCone(vW);
        float sp = hlSpec(vW, n, e, rough) * uSpecK;
        vec3 rr = refract(-e, n, 0.76); float through = 0.5 + 0.5 * sin(dot(rr, vec3(3.1, 1.7, 2.3)) + vUv.y * 2.0);   // fake refraction streaks
        vec3 body = alb * vec3(0.55, 0.8, 1.0) * (0.14 * lit + 0.22 * reach * (0.35 + 0.65 * through));                 // light scattered inside the clear ice
        vec3 glow = vec3(0.10, 0.42, 0.78) * reach * (0.25 + 0.75 * fr) * 0.7;                  // cold transmitted blue at the silhouettes
        vec3 c = uHLCol * uHLInt * (body + glow + vec3(0.9, 0.97, 1.0) * sp * 1.1) + alb * uAmb * 0.05 * (0.4 + fr);
        float a = clamp(uHLInt * (0.10 * lit + 0.28 * reach * (0.3 + fr)) + uAmb * 0.05, 0.0, 0.7);
        float fog = exp(-vDist * uFog); c = hmdGrade(c) * fog; a *= fog;
        gl_FragColor = vec4(softClip(c), a); }`,
  });
  let glass = null;
  if (glassGeos.length) { const g = mergeGeos(glassGeos, ['position', 'normal', 'uv', 'aKind']); glass = new THREE.Mesh(g, glassMat); glass.name = 'ice-glass'; glass.renderOrder = -7; glass.frustumCulled = false; rideWorld.add(glass); report.tris += g.attributes.position.count / 3; }

  // exact comfort check over every vertex (lazy: called by ride.js clearance(), i.e. the verify script, not at load)
  const measureClear = () => { let mn = Infinity; for (const m of [walls, glass]) if (m) { const a = m.geometry.attributes.position; for (let j = 0; j < a.count; j++) { v.fromBufferAttribute(a, j);
      for (const q of PS) { const dx = q.x - v.x, dz = q.z - v.z; if (dx * dx + dz * dz > 400) continue; const d = Math.hypot(dx, q.y - v.y, dz); if (d < mn) mn = d; } } } report.minClear = +mn.toFixed(3); return mn; };
  report.tris = Math.round(report.tris);
  console.info('[t11 ice]', JSON.stringify(report));
  return { walls, glass, report, iceWallMat, glassMat, measureClear };
}
