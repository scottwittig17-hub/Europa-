// scene.js — procedural placeholder world for "Europa's Hidden Ocean".
// Everything is emissive (no lights, no sun). All colours are display-space values (ShaderMaterials write them directly).
import * as THREE from 'three';
import { CONFIG } from './config.js';

export const PALETTE = {
  abyss: new THREE.Color(0.016, 0.075, 0.13),     // fog / far water, never pure black
  deep: new THREE.Color(0.10, 0.28, 0.78),       // mellow vein colour
  cyan: new THREE.Color(0.25, 0.92, 0.95),       // energetic vein / bioluminescence
  amber: new THREE.Color(1.0, 0.62, 0.25),       // rare warm accents
};

const NOISE = /* glsl */`
float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }`;

/* ---------- cavern: inverted, gently displaced sphere with vein shader, lakebed, ice ceiling, ripples ---------- */
export const MAX_RIPPLES = 4;
export function createCavern({ radius = 32, eyeY = 1.2 } = {}) {
  const geo = new THREE.SphereGeometry(radius, 96, 48);
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {   // lumpy cavern walls (static CPU displacement, zero per-frame cost); floor flattened into a lakebed
    v.fromBufferAttribute(pos, i); const d = v.clone().normalize();
    let k = 1 + 0.08 * Math.sin(d.x * 5.1 + d.y * 3.3) * Math.cos(d.z * 4.7 - d.y * 2.1) + 0.04 * Math.sin(d.x * 11 + d.z * 9);
    v.multiplyScalar(k);
    if (v.y < -6) v.y = -6 - (v.y + 6) * 0.08;  // lakebed ~7 m below eye
    if (v.y > 22) v.y = 22 + (v.y - 22) * 0.35; // ice ceiling
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 1, 0, -100));
  const uniforms = {
    uTime: { value: 0 }, uBeat: { value: 0 }, uBass: { value: 0 }, uMood: { value: 0.3 }, uBreath: { value: 0 },
    uRipples: { value: ripples }, uBeatFlash: { value: CONFIG.BEAT_FLASH }, uCalm: { value: CONFIG.CALM },
    uRippleGain: { value: CONFIG.RIPPLES ? CONFIG.RIPPLE_INTENSITY : 0 }, uRippleSpeed: { value: CONFIG.RIPPLE_SPEED }, uRippleLife: { value: CONFIG.RIPPLE_LIFE }, uRippleWidth: { value: CONFIG.RIPPLE_WIDTH },
    uCausticSpeed: { value: CONFIG.CAUSTIC_SPEED },
    uDeep: { value: PALETTE.deep }, uCyan: { value: PALETTE.cyan }, uAbyss: { value: PALETTE.abyss }, uAmber: { value: PALETTE.amber },
    uVentDir: { value: new THREE.Vector3(0.62, -0.32, 0.72).normalize() },
    uVent2Dir: { value: new THREE.Vector3(-0.85, -0.25, -0.46).normalize() },
    uPano: { value: null }, uUsePano: { value: 0 }, uWallTex: { value: null }, uUseWallTex: { value: 0 },
    uPanoTexels: { value: new THREE.Vector2(4096, 2048) }, uWallTexels: { value: new THREE.Vector2(8192, 4096) },   // texture size (x repeats) for the explicit LOD: set from the real image on load
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms,   // fragment math is mediump (see FS header); time-like values are explicitly highp
    vertexShader: /* glsl */`
      varying vec3 vDir; varying vec3 vPos;
      void main(){ vPos = position; vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`precision mediump float;
      
      uniform highp float uTime;
      uniform float uBeat, uBass, uMood, uBreath, uUsePano, uUseWallTex, uBeatFlash, uCalm, uRippleGain, uRippleSpeed, uRippleLife, uRippleWidth, uCausticSpeed;
      uniform highp vec4 uRipples[${MAX_RIPPLES}];
      uniform vec3 uDeep, uCyan, uAbyss, uAmber, uVentDir, uVent2Dir;
      uniform sampler2D uPano, uWallTex; uniform vec2 uPanoTexels, uWallTexels;
      varying vec3 vDir; varying vec3 vPos;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float up = d.y;
        // base colours: walls deep blue, lakebed dim teal, ice ceiling pale teal glow
        vec3 wall = vec3(0.025, 0.11, 0.19);
        vec3 bed  = vec3(0.02, 0.085, 0.11);
        vec3 ice  = vec3(0.09, 0.24, 0.33);
        vec3 base = mix(wall, bed, smoothstep(-0.12, -0.32, up));
        base = mix(base, ice, smoothstep(0.45, 0.85, up));
        // equirect lookups use an explicit mip LOD computed from wrap-corrected derivatives (textureLod; textureGrad is a slow path on mobile GPUs)
        // with the u-wrap removed, so mipmapping never draws a seam line where atan wraps (behind you)
        highp vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(up,-1.,1.)) / 3.1415927 + 0.5);
        vec2 gx = dFdx(uv), gy = dFdy(uv); gx.x -= floor(gx.x + 0.5); gy.x -= floor(gy.x + 0.5);
        if (uUsePano > 0.5) { vec2 sx = gx * uPanoTexels, sy = gy * uPanoTexels;
          base = textureLod(uPano, uv, 0.5 * log2(max(max(dot(sx, sx), dot(sy, sy)), 1.0))).rgb * 1.5; }   // painted cavern (its own veins) replaces the procedural base
        if (uUseWallTex > 0.5) { vec2 sx = gx * uWallTexels, sy = gy * uWallTexels;
          base *= 0.6 + 0.8 * textureLod(uWallTex, uv * vec2(8.0, 4.0), 0.5 * log2(max(max(dot(sx, sx), dot(sy, sy)), 1.0))).rgb; }
        // bioluminescent veins: ridged value noise on the wall surface
        vec3 p = vPos * 0.15 + vec3(0.0, fract(uTime * 0.0004) * 10.0, 0.0);
        p.xz += sin(p.zx * 2.1) * 0.18;                 // cheap domain warp instead of a 2nd noise octave
        float n = vnoise(p);
        float ridge = 1.0 - abs(n * 2.0 - 1.0);
        float vein = pow(ridge, 34.0) + 0.06 * pow(ridge, 6.0);
        float wallMask = smoothstep(-0.55, -0.2, up) * (1.0 - smoothstep(0.55, 0.9, up) * 0.6);
        vec3 veinCol = mix(uDeep, uCyan, uMood);
        float idle = uUsePano > 0.5 ? 0.3 : 1.0;   // with painted art, procedural veins mostly appear on beats/bass so the painting reads
        float glow = (0.32 + 0.18 * uBreath) * idle + (uBeatFlash * uBeat + 0.35 * uBass * idle) * uCalm;
        vec3 col = base + veinCol * vein * glow * wallMask;
        // bass light-ripple rings expanding across the walls from their origin direction
        if (uRippleGain > 0.0) for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          float age = float(uTime - uRipples[i].w);
          if (age < 0.0 || age > uRippleLife) continue;
          float ang = acos(clamp(dot(d, uRipples[i].xyz), -1.0, 1.0));
          float x = (ang - age * uRippleSpeed) / uRippleWidth;
          float life = smoothstep(0.0, 1.5, age) * (1.0 - smoothstep(uRippleLife * 0.4, uRippleLife, age));   // fade in and out, no pop
          col += veinCol * exp(-x * x) * life * uRippleGain * uCalm * (0.35 + 0.65 * vein) * wallMask;
        }
        // caustic shimmer on lakebed + ice ceiling
        // two layers drifting in opposite directions so the pattern shimmers in place instead of sweeping one way
        float causMask = smoothstep(-0.2, -0.4, up) * 0.6 + smoothstep(0.5, 0.8, up) * 0.9;
        if (causMask > 0.001) {   // only floor/ceiling pixels pay for caustics
          highp vec2 c = vPos.xz * 0.35; highp float ct = mod(uTime * uCausticSpeed, 6283.1853);   // highp: fp16 sin() of large phases breaks on Quest
          highp float ca = sin(c.x * 1.7 + ct * 0.31 + sin(c.y * 1.3 + ct * 0.21)) * sin(c.y * 1.9 - ct * 0.27 + sin(c.x * 1.1 - ct * 0.17));
          ca = 0.5 * ca + 0.5 * sin(c.y * 1.6 - ct * 0.29 + sin(c.x * 1.4 - ct * 0.19)) * sin(c.x * 1.8 + ct * 0.25 + sin(c.y * 1.2 + ct * 0.15));
          float caustic = pow(abs(ca), 6.0);
          col += mix(uDeep, uCyan, 0.5 + 0.3 * uMood) * caustic * causMask * (0.10 + 0.05 * uBreath);
        }
        // warm amber vent glows (distant, rare)
        float v1 = max(dot(d, uVentDir), 0.0), v2 = max(dot(d, uVent2Dir), 0.0);
        col += uAmber * (pow(v1, 600.0) * 0.9 + pow(v1, 60.0) * 0.18 + pow(v1, 12.0) * 0.04) * (0.85 + 0.15 * uBreath);
        col += uAmber * (pow(v2, 900.0) * 0.5 + pow(v2, 90.0) * 0.08);
        // depth fog toward abyssal blue (moderate contrast)
        col = mix(col, uAbyss, uUsePano > 0.5 ? 0.15 : 0.28);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.y = eyeY; mesh.renderOrder = -10; mesh.frustumCulled = false;
  let next = 0;
  return {
    mesh, uniforms,
    /** Start a light-ripple ring from a world direction. */
    ripple(dir, time) { ripples[next].set(dir.x, dir.y, dir.z, time); next = (next + 1) % MAX_RIPPLES; },
  };
}

/* ---------- marine snow: GPU-drifted instanced points (no per-frame CPU work) ---------- */
/** light: optional shared headlight uniforms (ride.js LIGHT_U); flakes inside the sub's beams light up (per-vertex, ~free). Float mode: none. */
export function createMarineSnow({ count = CONFIG.SNOW_COUNT, box = 22, sizeTex = null, light = null } = {}) {
  const geo = new THREE.BufferGeometry(); const p = new Float32Array(count * 3), s = new Float32Array(count);
  for (let i = 0; i < count; i++) { p[i * 3] = (Math.random() - .5) * box; p[i * 3 + 1] = (Math.random() - .5) * box; p[i * 3 + 2] = (Math.random() - .5) * box; s[i] = Math.random(); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const uniforms = { uTime: { value: 0 }, uBox: { value: box }, uBreath: { value: 0 }, uTint: { value: new THREE.Color(0.62, 0.86, 0.92) }, uMap: { value: sizeTex }, uUseMap: { value: sizeTex ? 1 : 0 }, uScale: { value: 300 }, uCenter: { value: new THREE.Vector3() },
    ...(light ? { uHLPos: light.uHLPos, uHLDir: light.uHLDir, uHLCone: light.uHLCone, uHLInt: light.uHLInt, uHLCol: light.uHLCol }
      : { uHLPos: { value: [new THREE.Vector3(), new THREE.Vector3()] }, uHLDir: { value: [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)] }, uHLCone: { value: new THREE.Vector4(0.9, 0.95, 0.03, 0.01) }, uHLInt: { value: 0 }, uHLCol: { value: new THREE.Color(1, 1, 1) } }) };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime, uBox, uScale; uniform vec3 uCenter; varying float vA, vLit;
      uniform vec3 uHLPos[2], uHLDir[2]; uniform vec4 uHLCone; uniform float uHLInt;
      void main(){
        vec3 q = position;
        q.y -= uTime * (0.04 + 0.05 * seed);                          // slow sink
        q.x += sin(uTime * 0.13 + seed * 40.0) * 0.4; q.z += cos(uTime * 0.11 + seed * 31.0) * 0.4;  // sway
        q = mod(q - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;   // wrap around the viewer (uCenter = sub position in ride mode)
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        float dist = -mv.z;
        vA = smoothstep(0.6, 1.6, dist) * exp(-dist * 0.09) * (0.35 + 0.65 * seed);  // never in your face; fog
        gl_PointSize = clamp(uScale * (0.012 + 0.018 * seed) / max(dist, 0.1), 1.0, 6.0);
        vLit = 0.0;
        if (uHLInt > 0.0) { vec3 wq = (modelMatrix * vec4(q, 1.0)).xyz;      // flakes drifting through the headlight cones catch the light
          for (int i = 0; i < 2; i++) { vec3 d = wq - uHLPos[i]; float r = max(length(d), 0.1); vLit += smoothstep(uHLCone.x, uHLCone.y, dot(d / r, uHLDir[i])) / (1.0 + r * r * uHLCone.w * 2.0); }
          vLit *= uHLInt * smoothstep(0.6, 1.6, dist) * (0.35 + 0.65 * seed); }
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`precision mediump float;
      
      uniform vec3 uTint, uHLCol; uniform float uBreath, uUseMap; uniform sampler2D uMap; varying float vA, vLit;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c));
        vec3 tint = uTint;
        if (uUseMap > 0.5) { vec4 tx = texture2D(uMap, gl_PointCoord); a = tx.a; tint = mix(uTint, tx.rgb, 0.6); }   // tex/snow.png: real alpha + its own colour
        gl_FragColor = vec4(tint * a * vA * (0.75 + 0.25 * uBreath) + uHLCol * a * min(vLit * 0.32, 0.8), 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2;
  return { mesh: pts, uniforms };
}

/* ---------- light shafts: soft additive cones from the ice ceiling, swaying ---------- */
export function createLightShafts({ count = 5 } = {}) {
  const group = new THREE.Group(); const shafts = [];
  const uniforms = { uTime: { value: 0 }, uBreath: { value: 0 }, uMood: { value: 0.3 }, uDeep: { value: PALETTE.deep }, uCyan: { value: PALETTE.cyan }, uBeat: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying float vH; varying float vFace; varying float vDist;
      void main(){ vH = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal); vec3 vd = normalize(cameraPosition - wp.xyz);
        vFace = abs(dot(n, vd)); vDist = length(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`precision mediump float;
      
      uniform float uBreath, uMood, uBeat; uniform vec3 uDeep, uCyan; varying float vH; varying float vFace; varying float vDist;
      void main(){ float a = pow(vFace, 2.5) * smoothstep(0.0, 0.55, vH) * smoothstep(1.0, 0.85, vH) * smoothstep(1.5, 5.0, vDist);
        a *= 0.07 * (0.8 + 0.2 * uBreath + 0.15 * uBeat);
        vec3 c = mix(mix(uDeep, uCyan, 0.55 + 0.35 * uMood), vec3(0.75, 0.95, 1.0), 0.35);
        gl_FragColor = vec4(c * a, 1.0); }`,
  });
  for (let i = 0; i < count; i++) {
    const h = 26, geo = new THREE.CylinderGeometry(0.35 + Math.random() * 0.4, 2.2 + Math.random() * 1.6, h, 16, 1, true);
    geo.translate(0, -h / 2, 0);   // pivot at the top (ceiling)
    const m = new THREE.Mesh(geo, mat);
    const a = (i / count) * Math.PI * 2 + 0.6, r = 7 + Math.random() * 9;
    m.position.set(Math.sin(a) * r, 21, -Math.cos(a) * r);
    m.userData = { phase: Math.random() * 6.28, base: (Math.random() - .5) * 0.18 };
    m.renderOrder = 3; group.add(m); shafts.push(m);
  }
  return {
    group, uniforms,
    update(t) { for (const m of shafts) { const u = m.userData; m.rotation.z = u.base + Math.sin(t * 0.09 + u.phase) * 0.05; m.rotation.x = Math.sin(t * 0.07 + u.phase * 1.3) * 0.04; } },
  };
}

/* ---------- jellyfish drifters: translucent emissive bells + trailing tentacles, gliding on distant orbits ---------- */
/** Float mode: orbits around the user (>= minDist+1 m). Ride mode: pass `anchors` [{pos: Vector3, r}] — each jelly circles its own anchor. */
export function createJellies({ count = 6, minDist = 5, eyeY = 1.2, anchors = null } = {}) {
  if (anchors) count = anchors.length;
  const group = new THREE.Group(); const jellies = [];
  const bellGeo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const uniforms = { uMood: { value: 0.3 }, uDeep: { value: PALETTE.deep }, uCyan: { value: PALETTE.cyan }, uAmber: { value: PALETTE.amber } };
  const SEG = 14, TENT = 7;
  for (let i = 0; i < count; i++) {
    const amberEye = i === 2;  // one rare warm eye-shine
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uPulse: { value: 0 }, uWarm: { value: amberEye ? 1 : 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying float vY; varying float vDist;
        void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz);
          vY = position.y; vDist = length(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`precision mediump float;
      uniform float uMood, uPulse, uWarm; uniform vec3 uDeep, uCyan, uAmber; varying vec3 vN; varying vec3 vV; varying float vY; varying float vDist;
        void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          vec3 c = mix(uDeep, uCyan, 0.6 + 0.4 * uMood);
          float inner = smoothstep(0.2, 0.9, vY) * 0.25;
          vec3 col = c * (0.10 + fr * 0.85 + inner) * (0.75 + 0.35 * uPulse);
          col += uAmber * uWarm * smoothstep(0.75, 1.0, vY) * 0.6;
          col *= exp(-vDist * 0.045);
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const bell = new THREE.Mesh(bellGeo, mat);
    const tGeo = new THREE.BufferGeometry(); const tPos = new Float32Array(TENT * SEG * 2 * 3);
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    const tMat = new THREE.LineBasicMaterial({ color: PALETTE.cyan.clone().multiplyScalar(0.55), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const tent = new THREE.LineSegments(tGeo, tMat); tent.frustumCulled = false;
    const root = new THREE.Group(); root.add(bell); root.add(tent); group.add(root);
    const size = 0.45 + Math.random() * 0.55;
    const j = {
      root, bell, tent, mat, tMat, size, amberEye,
      r: anchors ? anchors[i].r : minDist + 1 + (i / count) * 9 + Math.random() * 1.5,   // orbit radius: float mode always >= minDist+1 from user
      c: anchors ? anchors[i].pos : null, yAmp: anchors ? 0.6 : 1.2,
      a0: (i / count) * Math.PI * 2 + Math.random() * 0.5,
      w: (0.018 + Math.random() * 0.012) * (i % 2 ? 1 : -1),          // rad/s — slow glide
      y0: -1.5 + Math.random() * 5, ph: Math.random() * 10, phase: 0, trail: [],
    };
    jellies.push(j);
  }
  const tmp = new THREE.Vector3();
  return {
    group, jellies, uniforms,
    /** speed: tempo factor (clamped gentle by the analyser). */
    update(dt, t, speed, breath) {
      for (const j of jellies) {
        const pulse = 0.5 + 0.5 * Math.sin(j.ph + j.phase * 2.2);        // bell contraction cycle
        j.phase += dt * speed * (0.55 + 0.45 * pulse);                     // propel a little more on contraction
        const a = j.a0 + j.w * j.phase * 1.8;
        let x = Math.sin(a) * j.r, z = -Math.cos(a) * j.r, y = eyeY + j.y0 + Math.sin(j.phase * 0.12 + j.ph) * j.yAmp;
        if (j.c) { x += j.c.x; z += j.c.z; y = j.c.y + Math.sin(j.phase * 0.12 + j.ph) * j.yAmp; }
        j.root.position.set(x, y, z);
        const s = j.size; j.bell.scale.set(s * (1 + 0.12 * pulse), s * (0.8 - 0.12 * pulse), s * (1 + 0.12 * pulse));
        j.bell.rotation.z = Math.sin(j.phase * 0.4 + j.ph) * 0.12;
        j.mat.uniforms.uPulse.value = pulse * (0.8 + 0.2 * breath);
        // tentacles: rope trailing below the bell, swaying with phase
        const arr = j.tent.geometry.attributes.position.array; let k = 0;
        for (let ti = 0; ti < 7; ti++) {
          const ang = ti / 7 * Math.PI * 2, rx = Math.cos(ang) * s * 0.55, rz = Math.sin(ang) * s * 0.55;
          let px = rx, py = -s * 0.05, pz = rz;
          for (let si = 0; si < 14; si++) {
            const f = (si + 1) / 14, len = s * 0.28;
            const nx = px + Math.sin(j.phase * 1.3 + si * 0.5 + ti) * len * 0.25 * f - rx * 0.02;
            const ny = py - len, nz = pz + Math.cos(j.phase * 1.1 + si * 0.45 + ti * 1.7) * len * 0.25 * f - rz * 0.02;
            arr[k++] = px; arr[k++] = py; arr[k++] = pz; arr[k++] = nx; arr[k++] = ny; arr[k++] = nz; px = nx; py = ny; pz = nz;
          }
        }
        j.tent.geometry.attributes.position.needsUpdate = true;
        j.tMat.opacity = 0.35 + 0.15 * pulse;
        tmp.set(x, y, z);
        j.dist = Math.hypot(x, z);   // horizontal distance to the user's column (test hook)
      }
    },
  };
}

/* ---------- amber vent glow sprites (distant, breathing) ---------- */
export function createVentGlows(cavernUniforms, distance = 26) {
  const group = new THREE.Group();
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,190,110,1)'); grd.addColorStop(0.25, 'rgba(255,150,70,.45)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sprites = [];
  for (const [dir, size, str] of [[cavernUniforms.uVentDir.value, 6, 0.55], [cavernUniforms.uVent2Dir.value, 3.5, 0.3]]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: str }));
    s.position.copy(dir).multiplyScalar(distance); s.position.y += 1.2; s.scale.setScalar(size); s.userData.base = str; s.renderOrder = 1;
    group.add(s); sprites.push(s);
  }
  return { group, update(t) { sprites.forEach((s, i) => { s.material.opacity = s.userData.base * (0.8 + 0.2 * Math.sin(t * 0.35 + i * 2)); }); } };
}

/* ---------- optional video loops (loops/*.mp4) on soft additive planes at distance ----------
 * Spec: PORTRAIT clips (~720x1280, any portrait aspect), ~6 s clean loop, black background (additive -> black is transparent).
 * Planes are sized from each video's real aspect (videoWidth/videoHeight) once metadata loads, so nothing is distorted:
 *   portrait/square -> `size` m tall (~8 m), width = size * aspect;  landscape -> width capped at maxWidth, height = width / aspect.
 * Anchors sit 16-20 m from the user. */
export const LOOP_ANCHORS = [
  { pos: [-12, 3, -14], size: 8 }, { pos: [15, 1.5, -10], size: 8 }, { pos: [-17, 1, 8], size: 8 }, { pos: [11, 3, 14], size: 8 },
  { pos: [3, 4, -17], size: 8 }, { pos: [-3, 2, 17.5], size: 8 },   // 5th/6th slots: built, hidden in float (MAX_LOOP_VIDEOS), used along the ride
];
/** Size a loop plane for a video aspect (w/h). Returns [width, height] in metres. */
export function loopPlaneSize(aspect, size = 8, maxWidth = 12) {
  if (!(aspect > 0)) aspect = 9 / 16;
  if (aspect <= 1) return [size * aspect, size];
  const w = Math.min(maxWidth, size * aspect); return [w, w / aspect];
}
export function createLoopPlane(tex, anchor, aspect = 9 / 16) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uOpacity: { value: 0.0 }, uKey: { value: 0.035 }, uFade: { value: 1 }, uUvRect: { value: new THREE.Vector4(...(anchor.rect || [0, 0, 1, 1])) }, uPad: { value: new THREE.Vector4(...(anchor.pad || [0, 0, 0, 0])) }, uPlume: { value: 0 }, uFlex: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,   // DoubleSide: instances may be mirrored (scale.x < 0)
    // uFlex (big ray, test #7): slow wing flex, tips bend up to uFlex m in a travelling wave (needs a subdivided plane; 0 = flat, as before)
    vertexShader: 'uniform float uFlex, uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; if (uFlex > 0.0) { float ax = abs(p.x) * 2.0; p.z += uFlex * ax * ax * sin(mod(uTime, 6283.0) * 0.55 - ax * 1.6) / max(1e-3, length(modelMatrix[2].xyz)); } gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: /* glsl */`precision mediump float;
      uniform sampler2D uMap; uniform float uOpacity, uKey, uFade, uPlume; uniform vec4 uUvRect, uPad; varying vec2 vUv;   // uUvRect: crop (x0, y0, w, h) of the video
      void main(){ vec2 e = smoothstep(0.0, 0.2, vUv) * smoothstep(1.0, 0.8, vUv); e.x *= 1.0 - smoothstep(0.5, 0.97, length((vUv - 0.5) * 2.0));   /* edge + radial feather */
        // t11 uPad (left, right, bottom, top; fractions of the video): black margins around the video inside the plane, so the feather lands on empty water
        vec2 tv = vec2(vUv.x * (1.0 + uPad.x + uPad.y) - uPad.x, vUv.y * (1.0 + uPad.z + uPad.w) - uPad.z);
        float inV = step(0.0, tv.x) * step(tv.x, 1.0) * step(0.0, tv.y) * step(tv.y, 1.0);
        if (uPlume > 0.5) {   // vent plume (test #6): keep the fire base at the bottom edge; feather narrows toward the base (plume shape), soft top
          float hx = abs(vUv.x - 0.5) * 2.0; e = vec2(1.0 - smoothstep(0.42 + 0.38 * vUv.y, 0.62 + 0.36 * vUv.y, hx), smoothstep(0.0, 0.012, vUv.y) * smoothstep(1.0, 0.72, vUv.y)); }
        vec3 c = texture2D(uMap, uUvRect.xy + clamp(tv, 0.0, 1.0) * uUvRect.zw).rgb * inV;
        c = max(c - uKey, 0.0) / (1.0 - uKey);   // black-point key: crush near-black compression noise so no rectangle shows
        gl_FragColor = vec4(c * e.x * e.y * uOpacity * uFade, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);   // unit plane, scaled to the clip's aspect
  m.position.set(...anchor.pos); m.lookAt(0, 1.2, 0); m.renderOrder = 1;
  // t11: crop (rect) and padding change the plane's aspect; with a top/bottom pad the plane grows around the video so the video itself keeps its place
  const pad = anchor.pad || [0, 0, 0, 0], rect = anchor.rect || [0, 0, 1, 1], base = m.position.clone();
  m.userData.setAspect = (a) => { const a2 = a * (rect[2] / rect[3]) * (1 + pad[0] + pad[1]) / (1 + pad[2] + pad[3]); const [w, h] = loopPlaneSize(a2, anchor.size); m.scale.set(w, h, 1); m.userData.aspect = w / h; m.userData.size = [w, h];
    if (pad[2] || pad[3]) { const hv = h / (1 + pad[2] + pad[3]); m.position.copy(base); m.position.y += (pad[3] - pad[2]) * hv / 2 * (anchor.size ? 1 : 1); } };
  m.userData.setAspect(aspect);
  return m;
}
