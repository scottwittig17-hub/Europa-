// Black Sand Beach — Night. Standalone WebXR prototype (three r160, same CDN import map as /surface/).
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const BUILD = 'Beach b1';
{ const b = document.querySelector('#hud .build'); if (b) b.textContent = BUILD; }

const PLAYER_HEIGHT = 1.7, LIE_EYE = 0.25, LIE_PITCH = THREE.MathUtils.degToRad(50);
const SHORE_Z = -15;                          // mean waterline (water toward -Z)
const deg = THREE.MathUtils.degToRad;
function dirFrom(yawDeg, elevDeg) {           // yaw + = to the right of straight ahead (-Z)
  const y = deg(yawDeg), e = deg(elevDeg);
  return new THREE.Vector3(Math.sin(y) * Math.cos(e), Math.sin(e), -Math.cos(y) * Math.cos(e)).normalize();
}
const MOON_A = { dir: dirFrom(-14, 44), color: new THREE.Color(0.62, 0.93, 0.95), size: deg(7.5) };  // large pale teal
const MOON_B = { dir: dirFrom(20, 31), color: new THREE.Color(1.0, 0.72, 0.62), size: deg(3.6) };    // small warm rose-amber

/* ---------------------------------------------------------- renderer */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFoveation(1.0);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 3000);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
camera.position.set(0, PLAYER_HEIGHT, 0);
const START = new THREE.Vector3(-0.6, 0, 0.6);
rig.position.copy(START);

const U = { uTime: { value: 0 } };
const NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+17.1; a*=0.5; } return s; }`;
const moonUniforms = {
  uLA: { value: MOON_A.dir }, uCA: { value: new THREE.Vector3(...MOON_A.color.toArray()) },
  uLB: { value: MOON_B.dir }, uCB: { value: new THREE.Vector3(...MOON_B.color.toArray()) },
};

/* ---------------------------------------------------------- lights (for real meshes) */
const lightA = new THREE.DirectionalLight(MOON_A.color, 1.0);
lightA.position.copy(MOON_A.dir).multiplyScalar(20).add(new THREE.Vector3(0, 0, -3));
lightA.target.position.set(0, 0, -3);
lightA.castShadow = true; lightA.shadow.mapSize.set(1024, 1024);
Object.assign(lightA.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 40 });
lightA.shadow.bias = -0.0005; lightA.shadow.normalBias = 0.01; lightA.shadow.radius = 4;
const lightB = new THREE.DirectionalLight(MOON_B.color, 0.55);
lightB.position.copy(MOON_B.dir).multiplyScalar(20);
scene.add(lightA, lightA.target, lightB, new THREE.HemisphereLight(0x22343a, 0x060606, 0.35));

/* ---------------------------------------------------------- blanket geometry helpers */
const BL = { x0: -1.55, x1: 1.55, z0: -4.25, z1: -2.05 };   // ~3.1 m wide x 2.2 m long, head edge at z1 (toward cliffs)
const bcx = (BL.x0 + BL.x1) / 2, bcz = (BL.z0 + BL.z1) / 2;
function hsh(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hsh(ix, iy), b = hsh(ix + 1, iy), c = hsh(ix, iy + 1), d = hsh(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
function sandH(x, z) {   // gentle real dunes of the beach (meters)
  const k = Math.min(1, Math.max(0, (Math.hypot(x - 0.0, (z + 3.15) * 1.2) - 2.6) / 3));   // flat bed under the blanket
  return k * (0.05 * (vnoise(x * 0.25, z * 0.25) - 0.5) + 0.015 * (vnoise(x * 1.3, z * 1.3) - 0.5));
}
const folds = [];
{ let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9; i++) folds.push({ a: r() * Math.PI, c: [bcx + (r() - 0.5) * 2.8, bcz + (r() - 0.5) * 2], len: 0.4 + r() * 0.9, w: 0.03 + r() * 0.05, h: 0.008 + r() * 0.018 }); }
function blanketLift(x, z) {   // fabric height above the sand
  const ex = Math.min(x - BL.x0, BL.x1 - x), ez = Math.min(z - BL.z0, BL.z1 - z), e = Math.min(ex, ez);
  let h = 0.006;
  for (const f of folds) {   // long soft ridges (rumples), fading at their ends
    const dx = x - f.c[0], dz = z - f.c[1], ca = Math.cos(f.a), sa = Math.sin(f.a);
    const u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
    h += f.h * Math.exp(-(v * v) / (f.w * f.w)) * Math.exp(-(u * u) / (f.len * f.len));
  }
  h += 0.006 * vnoise(x * 6, z * 6) + 0.003 * vnoise(x * 17, z * 17);
  // edges: settle onto the sand, with a little lifted curl in places
  const edge = Math.min(1, e / 0.12);
  h = h * (0.25 + 0.75 * edge) + (1 - edge) * (0.012 + 0.01 * vnoise(x * 3 + 5, z * 3));
  return h;
}
function blanketY(x, z) { return sandH(x, z) + blanketLift(x, z); }

/* ---------------------------------------------------------- sand */
const sandMat = new THREE.ShaderMaterial({
  uniforms: { ...U, ...moonUniforms, uShore: { value: SHORE_Z }, uBL: { value: new THREE.Vector4(BL.x0, BL.z0, BL.x1, BL.z1) } },
  vertexShader: `
    varying vec3 vW;
    float hsh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    uniform float uTime, uShore; uniform vec3 uLA,uCA,uLB,uCB; uniform vec4 uBL; varying vec3 vW;
    ${NOISE}
    void main(){
      vec2 p = vW.xz;
      float d = length(vW - cameraPosition);
      // procedural normal: ripples + grain, fading with distance (no shimmer far away)
      float fd = 1.0 - smoothstep(6.0, 40.0, d);
      float e = 0.02;
      float h0 = fbm(p*3.0)*0.6 + vn(p*vec2(1.2,9.0) + vec2(fbm(p*0.5)*3.0,0.0))*0.25;
      float hx = fbm((p+vec2(e,0))*3.0)*0.6 + vn((p+vec2(e,0))*vec2(1.2,9.0) + vec2(fbm((p+vec2(e,0))*0.5)*3.0,0.0))*0.25;
      float hz = fbm((p+vec2(0,e))*3.0)*0.6 + vn((p+vec2(0,e))*vec2(1.2,9.0) + vec2(fbm((p+vec2(0,e))*0.5)*3.0,0.0))*0.25;
      vec3 N = normalize(vec3(-(hx-h0)/e*0.06*fd, 1.0, -(hz-h0)/e*0.06*fd));
      vec3 V = normalize(cameraPosition - vW);
      // swash: the waterline breathes in and out
      float swell = sin(uTime*0.42)*0.55 + sin(uTime*0.23+1.3)*0.35;
      float line = uShore + 1.2 + swell + (fbm(vec2(p.x*0.35, uTime*0.05))-0.5)*1.4;
      float wet = smoothstep(line + 3.5, line - 0.3, p.y);          // z grows toward the beach
      float sheet = smoothstep(line + 0.05, line - 0.6, p.y);        // thin water sheet
      vec3 base = mix(vec3(0.011,0.011,0.012), vec3(0.004,0.0045,0.005), wet);
      base *= 0.8 + 0.4*fbm(p*0.7);
      vec3 col = vec3(0.0);
      for(int i=0;i<2;i++){
        vec3 L = i==0 ? uLA : uLB; vec3 C = i==0 ? uCA : uCB * 0.6;
        float ndl = max(dot(N,L),0.0);
        col += base * C * (0.35 + ndl*1.6);
        vec3 H = normalize(L+V);
        float rough = mix(18.0, 260.0, wet);
        col += C * pow(max(dot(N,H),0.0), rough) * mix(0.02, 0.35, wet) * (1.0 + sheet*3.0);
        // glittery speckle: tiny mineral facets catching each moon
        vec2 cell = floor(p*260.0);
        float r = h21(cell + float(i)*31.7);
        vec3 fn = normalize(vec3(h21(cell+3.1)-0.5, 1.2, h21(cell+7.7)-0.5));
        float g = pow(max(dot(fn,H),0.0), 200.0) * step(0.975, r);
        col += C * g * 1.2 * fd * (1.0 - wet*0.6);
      }
      col += vec3(0.002,0.0026,0.003);
      // foam line at the swash edge
      float fl = abs(p.y - line);
      float foam = smoothstep(0.25, 0.0, fl) * smoothstep(0.45, 0.8, fbm(vec2(p.x*1.3, p.y*2.0 - uTime*0.3)));
      col += foam * (uCA*0.07 + uCB*0.03);
      // contact darkening under/around the blanket
      vec2 q = max(vec2(uBL.x - p.x, p.x - uBL.z), 0.0); vec2 r2 = max(vec2(uBL.y - p.y, p.y - uBL.w), 0.0);
      float bd = length(vec2(max(q.x,q.y), max(r2.x,r2.y)));
      col *= mix(0.55, 1.0, smoothstep(0.0, 0.12, bd));
      col = mix(col, vec3(0.0), smoothstep(80.0, 400.0, d));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const sandGeo = new THREE.PlaneGeometry(400, 220, 200, 110); sandGeo.rotateX(-Math.PI / 2);
{ const pa = sandGeo.attributes.position; for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i) + 90; pa.setZ(i, z);
    let y = sandH(x, z) - Math.max(0, SHORE_Z + 4 - z) * 0.045;   // beach slopes down into the sea
    pa.setY(i, y); } }
const sand = new THREE.Mesh(sandGeo, sandMat); scene.add(sand);

/* ---------------------------------------------------------- water */
const waterMat = new THREE.ShaderMaterial({
  uniforms: { ...U, ...moonUniforms, uShore: { value: SHORE_Z } },
  transparent: true,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
    uniform float uTime, uShore; uniform vec3 uLA,uCA,uLB,uCB; varying vec3 vW;
    ${NOISE}
    vec2 wgrad(vec2 p, float t){
      vec2 g = vec2(0.0);
      // a few directional swells + noise chop
      vec4 dirs[4]; dirs[0]=vec4(0.10,1.0,0.55,0.9); dirs[1]=vec4(-0.35,1.0,1.1,1.3); dirs[2]=vec4(0.6,1.0,2.3,1.9); dirs[3]=vec4(-0.8,0.6,4.1,2.6);
      for(int i=0;i<4;i++){ vec2 d = normalize(dirs[i].xy); float k = dirs[i].z; float ph = dot(p,d)*k + t*dirs[i].w;
        g += d * cos(ph) * (0.16 / k); }
      float e = 0.15; vec2 q = p*1.3 + vec2(0.0, t*0.25);
      float n0 = fbm(q); g += vec2(fbm(q+vec2(e,0))-n0, fbm(q+vec2(0,e))-n0)/e * 0.05;
      return g;
    }
    void main(){
      vec3 toC = cameraPosition - vW; float d = length(toC); vec3 V = toC/d;
      float lod = 1.0 / (1.0 + d*0.02);
      vec2 g = wgrad(vW.xz, uTime) * (0.4 + 0.6*lod);
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 R = reflect(-V, N);
      float fres = 0.02 + 0.98*pow(1.0 - max(dot(N,V),0.0), 5.0);
      vec3 col = vec3(0.002,0.0035,0.0045) + vec3(0.004,0.007,0.009)*fres;
      for(int i=0;i<2;i++){
        vec3 L = i==0 ? uLA : uLB; vec3 C = i==0 ? uCA : uCB;
        float c = max(dot(R,L),0.0);
        float sz = i==0 ? 1.0 : 0.55;
        col += C * (pow(c, 700.0/sz)*7.0 + pow(c, 60.0/sz)*0.8 + pow(c, 14.0)*0.025) * (0.4 + fres*2.0);
      }
      // shallow edge: fade into the wet sand, faint foam
      float swell = sin(uTime*0.42)*0.55 + sin(uTime*0.23+1.3)*0.35;
      float line = uShore + 1.2 + swell + (fbm(vec2(vW.x*0.35, uTime*0.05))-0.5)*1.4;
      float a = smoothstep(line - 0.2, line - 1.8, vW.z);
      float hz = smoothstep(150.0, 900.0, d);
      col = mix(col, vec3(0.0), hz*0.9);
      gl_FragColor = vec4(col, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 1500).rotateX(-Math.PI / 2), waterMat);
water.position.set(0, -0.06, SHORE_Z - 750 + 3); scene.add(water);

/* ---------------------------------------------------------- sky: stars + two moons (glued to the head) */
const skyRig = new THREE.Group(); scene.add(skyRig);
{
  const N = 9000, pos = new Float32Array(N * 3), mag = new Float32Array(N), col = new Float32Array(N * 3);
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1, t = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
    const y = Math.abs(u) * 0.98 + 0.01;
    pos.set([rr * Math.cos(t) * 1500, y * 1500, rr * Math.sin(t) * 1500], i * 3);
    mag[i] = Math.pow(r(), 5.0);                  // most stars faint, a few bright
    const k = r(); const c = k < 0.15 ? [1, 0.85, 0.7] : k < 0.35 ? [0.8, 0.88, 1] : [1, 1, 1];
    col.set(c, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('mag', new THREE.BufferAttribute(mag, 1)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: renderer.getPixelRatio() }, uLA: moonUniforms.uLA, uLB: moonUniforms.uLB },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float mag; attribute vec3 color; varying float vB; varying vec3 vC; uniform float uPx; uniform vec3 uLA, uLB;
      void main(){ vec3 dir = normalize(position);
        float wash = smoothstep(0.93, 0.995, dot(dir,uLA))*0.85 + smoothstep(0.97, 0.998, dot(dir,uLB))*0.6;   // moonlight drowns nearby stars
        float hor = smoothstep(0.0, 0.12, dir.y);
        vB = (0.18 + 1.6*mag) * hor * (1.0 - wash); vC = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        gl_PointSize = (1.1 + 1.6*mag) * uPx; }`,
    fragmentShader: `varying float vB; varying vec3 vC;
      void main(){ vec2 c = gl_PointCoord-0.5; float a = smoothstep(0.5, 0.15, length(c));
        gl_FragColor = vec4(vC*vB*a, 1.0); }`
  });
  const stars = new THREE.Points(g, m); stars.frustumCulled = false; stars.renderOrder = -10; skyRig.add(stars);
}
function makeMoon(M, seed, phaseDir) {
  const D = 1400, rad = D * Math.tan(M.size / 2);
  const geo = new THREE.PlaneGeometry(rad * 2.0 * 1.6, rad * 2.0 * 1.6);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Vector3(...M.color.toArray()) }, uSeed: { value: seed }, uPh: { value: phaseDir } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; vUv *= 1.6; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uC; uniform float uSeed; uniform vec2 uPh; varying vec2 vUv;
      ${NOISE}
      void main(){
        float r = length(vUv);
        vec3 col = vec3(0.0);
        if (r < 1.0) {
          vec3 n = vec3(vUv, sqrt(1.0 - r*r));
          vec3 L = normalize(vec3(uPh, 1.0));
          float lit = smoothstep(-0.05, 0.25, dot(n, L));
          float maria = fbm(vUv*2.2 + uSeed)*0.55 + fbm(vUv*7.0 + uSeed*2.0)*0.25;
          float alb = 0.55 + 0.55*smoothstep(0.35, 0.7, maria);
          float limb = 0.75 + 0.25*n.z;
          col = uC * alb * limb * lit * 1.25 + uC*0.015;
          col *= smoothstep(1.0, 0.97, r);
        }
        float halo = (exp(-max(r-1.0,0.0)*7.0) * 0.05 + exp(-max(r-1.0,0.0)*2.5)*0.015) * smoothstep(1.58, 1.2, r);
        col += uC * halo;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(M.dir).multiplyScalar(D); m.lookAt(0, 0, 0); m.renderOrder = -5; m.frustumCulled = false;
  skyRig.add(m); return m;
}
makeMoon(MOON_A, 1.3, new THREE.Vector2(0.25, 0.15));
makeMoon(MOON_B, 7.9, new THREE.Vector2(-0.55, 0.2));

/* ---------------------------------------------------------- cliffs: painted wall on curved panels behind + sides */
const texLoader = new THREE.TextureLoader();
const cliffTex = texLoader.load('./assets/cliff.jpg'); cliffTex.colorSpace = THREE.SRGBColorSpace; cliffTex.anisotropy = 4;
const cliffTop = texLoader.load('./assets/cliff_top.png'); cliffTop.minFilter = cliffTop.magFilter = THREE.LinearFilter;
function addCliff({ R, arcDeg, yawDeg, flip = 0, bright = 1, tint = [1, 1, 1], ground = 0.1, cx = 0, cz = 0, sideFade = 0.12, sy = 1.45 }) {
  const arc = deg(arcDeg), H = R * arc * 9 / 16 * sy;
  const geo = new THREE.CylinderGeometry(R, R, H, 64, 1, true, Math.PI - arc / 2, arc);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: cliffTex }, uTop: { value: cliffTop }, uFlip: { value: flip }, uB: { value: bright }, uT: { value: new THREE.Vector3(...tint) }, uSide: { value: sideFade } },
    side: THREE.BackSide, transparent: true, depthWrite: true,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = vec2(1.0-uv.x, uv.y); vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uMap, uTop; uniform float uFlip, uB, uSide; uniform vec3 uT; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 uv = vec2(mix(vUv.x, 1.0-vUv.x, uFlip), vUv.y);
        float top = texture2D(uTop, vec2(uv.x, 0.5)).r;
        float a = 1.0 - smoothstep(top - 0.004, top + 0.002, uv.y);
        a *= smoothstep(0.0, uSide, vUv.x) * smoothstep(1.0, 1.0-uSide, vUv.x);
        if (a < 0.01) discard;
        vec3 c = texture2D(uMap, uv).rgb * uB * uT;
        // the bottom of the picture melts into the real sand
        c *= smoothstep(0.02, 0.16, uv.y);
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, -0.1 + H / 2 - ground * H, cz);
  mesh.rotation.y = -deg(yawDeg);
  mesh.renderOrder = 2; scene.add(mesh); return mesh;
}
addCliff({ R: 19, arcDeg: 125, yawDeg: 180, bright: 0.55, cz: -3 });
addCliff({ R: 20.5, arcDeg: 95, yawDeg: -100, flip: 1, bright: 0.48, tint: [0.95, 1, 1.05], cz: -4, sideFade: 0.2 });
addCliff({ R: 20.5, arcDeg: 95, yawDeg: 100, flip: 1, bright: 0.48, tint: [1.05, 1, 0.95], cz: -4, sideFade: 0.2 });
// a few real boulders at the cliff foot help the wall sit on the sand
{
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.75, metalness: 0.0 });
  let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const g = new THREE.IcosahedronGeometry(1, 4); const pa = g.attributes.position;
    for (let j = 0; j < pa.count; j++) { const v = new THREE.Vector3().fromBufferAttribute(pa, j); v.multiplyScalar(0.7 + 0.45 * vnoise(v.x * 1.5 + i, v.y * 1.5 + v.z * 1.3) + 0.08 * vnoise(v.x * 6, v.z * 6 + v.y)); pa.setXYZ(j, v.x, v.y, v.z); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMat);
    const a = deg(105 + r() * 150) , R = 15.5 + r() * 2.5;
    const sc = 0.4 + r() * 1.3;
    m.position.set(Math.sin(a) * R, sc * 0.2, -3 - Math.cos(a) * R);
    m.scale.set(sc * (1 + r()), sc * (0.6 + r() * 0.6), sc * (1 + r()));
    m.rotation.set(r() * 3, r() * 3, r() * 3); scene.add(m);
  }
}

/* ---------------------------------------------------------- blanket */
function weaveNormalTex() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const id = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = Math.sin(x / S * Math.PI * 2 * 48), wy = Math.sin(y / S * Math.PI * 2 * 48);
    const check = ((Math.floor(x / S * 48) + Math.floor(y / S * 48)) & 1) ? 1 : -1;
    const nx = 0.25 * wx * check + (Math.random() - 0.5) * 0.08, ny = 0.25 * wy * -check + (Math.random() - 0.5) * 0.08;
    const i = (y * S + x) * 4; id.data[i] = 128 + nx * 127; id.data[i + 1] = 128 + ny * 127; id.data[i + 2] = 255; id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 4); return t;
}
const blanketMat = new THREE.MeshPhysicalMaterial({
  color: 0x4b4d51, roughness: 0.8, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x6c7378), sheenRoughness: 0.5,
  normalMap: weaveNormalTex(), normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
});
{
  const W = BL.x1 - BL.x0, L = BL.z1 - BL.z0;
  const g = new THREE.PlaneGeometry(W, L, 180, 130); g.rotateX(-Math.PI / 2);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    let x = pa.getX(i) + bcx, z = pa.getZ(i) + bcz;
    // slightly irregular outline (fabric never lies perfectly square)
    const ex = Math.min(x - BL.x0, BL.x1 - x), ez = Math.min(z - BL.z0, BL.z1 - z);
    x += (vnoise(z * 1.5, 3) - 0.5) * 0.07 * Math.max(0, 1 - ex / 0.3) * Math.sign(x - bcx);
    z += (vnoise(x * 1.5, 9) - 0.5) * 0.07 * Math.max(0, 1 - ez / 0.3) * Math.sign(z - bcz);
    pa.setXYZ(i, x, blanketY(x, z), z);
  }
  g.computeVertexNormals();
  const b = new THREE.Mesh(g, blanketMat); b.receiveShadow = true; b.castShadow = false; scene.add(b);
}

/* ---------------------------------------------------------- clothes pile (extra room on the +X side) */
{
  const cols = [0x26272b, 0x262c3a, 0x3a1e22, 0x1c1c1f, 0x34363d];
  const mats = cols.map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.85, sheen: 1.0, sheenColor: new THREE.Color(0x9098a0), sheenRoughness: 0.4, normalMap: blanketMat.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) }));
  const pile = new THREE.Group(); const px = 1.05, pz = -2.75;
  const pieces = [   // [type, x, z, sx, sy, sz, rot, mat]  folded garments + one loosely crumpled top
    ['fold', 0.0, 0.0, 0.46, 0.022, 0.34, 0.25, 1],
    ['fold', 0.04, -0.02, 0.38, 0.02, 0.28, -0.35, 4],
    ['crumple', 0.14, 0.12, 0.36, 0.035, 0.28, 1.1, 2],
    ['fold', -0.22, -0.18, 0.3, 0.018, 0.22, 0.9, 0],
  ];
  let yStack = 0;
  pieces.forEach(([t, x, z, sx, sy, sz, rot, mi], k) => {
    let g;
    if (t === 'fold') { g = new RoundedBoxGeometry(1, 1, 1, 6, 0.3); }
    else g = new THREE.IcosahedronGeometry(0.5, 4);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pa, i);
      const n = vnoise(v.x * 7 + k * 3, v.z * 7 + v.y * 5) - 0.5, n2 = vnoise(v.x * 17 + k, v.z * 17 - v.y * 9) - 0.5;
      if (t === 'crumple') { v.multiplyScalar(1 + n * 0.35 + n2 * 0.12); v.y *= 0.8; } else { v.y += n * 0.35 + n2 * 0.12; v.x += n2 * 0.04; }
      pa.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats[mi]); m.scale.set(sx, sy, sz); m.rotation.y = rot;
    m.position.set(px + x, 0, pz + z);
    m.position.y = blanketY(px + x, pz + z) + sy * 0.45 + 0.014 * k;
    m.castShadow = m.receiveShadow = true; pile.add(m);
  });
  scene.add(pile);
}

/* ---------------------------------------------------------- music player on the head edge */
const ledMat = new THREE.MeshBasicMaterial({ color: 0x6fe0d0, toneMapped: false, transparent: true, opacity: 0.9 });
{
  const g = new RoundedBoxGeometry(0.075, 0.011, 0.14, 4, 0.005);
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, roughness: 0.35, metalness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
  const x = 0.55, z = -2.2; m.position.set(x, blanketY(x, z) + 0.006, z); m.rotation.y = 0.35;
  m.castShadow = true; scene.add(m);
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12).rotateX(-Math.PI / 2), ledMat);
  led.position.set(0.018, 0.0058, 0.05); m.add(led);
}

/* ---------------------------------------------------------- lie-down marker */
const LIE_SPOT = new THREE.Vector3(-0.35, 0, -3.15);          // middle of the two-person area
const LIE_HEAD = new THREE.Vector3(-0.35, 0, -2.4);           // where the eyes rest when lying (head end of the blanket)
const markerMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float r = length(vUv);
    float ring = smoothstep(0.08, 0.0, abs(r - 0.62)) ; float core = exp(-r*r*10.0)*0.5;
    float a = (ring*0.7 + core) * (0.55 + 0.45*sin(uTime*1.6)) * smoothstep(1.0, 0.8, r);
    gl_FragColor = vec4(vec3(0.55,0.85,0.9)*a*0.6, 1.0); }`
});
const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36).rotateX(-Math.PI / 2), markerMat);
marker.position.set(LIE_SPOT.x, blanketY(LIE_SPOT.x, LIE_SPOT.z) + 0.015, LIE_SPOT.z); scene.add(marker);
const hitPad = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), new THREE.MeshBasicMaterial({ visible: false }));
hitPad.position.copy(marker.position); scene.add(hitPad);

/* ---------------------------------------------------------- sound: water lapping (WebAudio filtered noise) */
let audio = null;
function startAudio() {
  if (audio) { audio.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let b = 0; for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 3; } }
  const master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination);
  const mk = (pan, f, q) => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f; lp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(lp).connect(g).connect(p).connect(master); src.start(0, Math.random() * 3); return { g, lp };
  };
  const voices = [mk(-0.5, 700, 0.7), mk(0.5, 900, 0.7), mk(0, 380, 0.5)];
  audio = { ctx, voices };
}
function tickAudio(t) {   // slow swells: each voice rises as the swash comes in, hisses down as it recedes
  if (!audio) return;
  const now = audio.ctx.currentTime;
  audio.voices.forEach((v, i) => {
    const ph = t * (0.42 + i * 0.05) + i * 2.1;
    const s = Math.max(0, Math.sin(ph)); const sw = Math.pow(s, 2.5) * 0.8 + 0.12;
    v.g.gain.setTargetAtTime(i === 2 ? 0.35 : sw, now, 0.15);
    v.lp.frequency.setTargetAtTime(300 + 1100 * sw, now, 0.2);
  });
}

/* ---------------------------------------------------------- lying down / standing */
let yaw = 0, pitch = 0, lying = false;
const fadeEl = document.getElementById('fade');
function fadeThen(fn) { fadeEl.style.opacity = 1; setTimeout(() => { fn(); fadeEl.style.opacity = 0; }, 260); }
function lieDown() {
  if (lying) return; lying = true; marker.visible = false;
  const eyeY = blanketY(LIE_HEAD.x, LIE_HEAD.z) + LIE_EYE;
  const faceYaw = Math.atan2(-(MOON_A.dir.x + MOON_B.dir.x) / 2, -(MOON_A.dir.z + MOON_B.dir.z) / 2);  // yaw toward the two moons
  if (renderer.xr.isPresenting) {
    // VR: keep the headset's own tracking, but move/rotate the rig so the head ends up at blanket height,
    // facing the moons, with the whole world tilted back by LIE_PITCH (a reclined view while you sit/stand IRL).
    const head = camera.position.clone();                     // tracked head in rig space
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(LIE_PITCH, faceYaw, 0, 'YXZ'));
    rig.quaternion.copy(q);
    rig.position.set(LIE_HEAD.x, eyeY, LIE_HEAD.z).sub(head.applyQuaternion(q));
  } else {
    rig.position.set(LIE_HEAD.x, 0, LIE_HEAD.z); rig.rotation.set(0, 0, 0);
    camera.position.set(0, eyeY, 0); yaw = faceYaw; pitch = LIE_PITCH;
  }
}
function standUp() {
  if (!lying) return; lying = false; marker.visible = true;
  rig.quaternion.identity(); rig.position.copy(START).add(new THREE.Vector3(0, 0, 0));
  if (!renderer.xr.isPresenting) { camera.position.set(0, PLAYER_HEIGHT, 0); pitch = 0; yaw = 0; }
}
const toggleLie = () => fadeThen(() => (lying ? standUp() : lieDown()));
document.getElementById('lie').onclick = () => fadeThen(lieDown);
document.getElementById('stand').onclick = () => fadeThen(standUp);
addEventListener('keydown', e => { if (e.key === 'Escape') fadeThen(standUp); });

/* ---------------------------------------------------------- input: desktop */
const raycaster = new THREE.Raycaster();
let dragging = false, px = 0, py = 0;
const dom = renderer.domElement;
dom.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; startAudio(); });
addEventListener('pointerup', e => {
  if (dragging && Math.hypot(e.clientX - px, e.clientY - py) < 6) {
    raycaster.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    selectRay(raycaster.ray.origin, raycaster.ray.direction);
  }
  dragging = false;
});
addEventListener('pointermove', e => {
  if (!dragging || renderer.xr.isPresenting) return;
  yaw -= (e.clientX - px) * 0.0032; pitch -= (e.clientY - py) * 0.0028;
  pitch = THREE.MathUtils.clamp(pitch, -1.3, 1.45); px = e.clientX; py = e.clientY;
});
function selectRay(o, d) {
  raycaster.set(o, d);
  if (lying) { fadeThen(standUp); return; }                   // any click while lying = stand up
  if (raycaster.intersectObject(hitPad, false)[0]) { fadeThen(lieDown); return; }
  const h = raycaster.intersectObject(sand, false)[0];        // click the sand = walk there
  if (h && h.distance < 25 && h.point.z > SHORE_Z + 0.5 && h.point.z < 14) fadeThen(() => {
    const head = new THREE.Vector3(); camera.getWorldPosition(head);
    rig.position.x += h.point.x - head.x; rig.position.z += h.point.z - head.z; });
}

/* ---------------------------------------------------------- input: XR */
for (let i = 0; i < 2; i++) {
  const ctl = renderer.xr.getController(i);
  ctl.addEventListener('selectstart', () => {
    const m = new THREE.Matrix4().extractRotation(ctl.matrixWorld);
    selectRay(new THREE.Vector3().setFromMatrixPosition(ctl.matrixWorld), new THREE.Vector3(0, 0, -1).applyMatrix4(m).normalize());
  });
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -3)]),
    new THREE.LineBasicMaterial({ color: 0x8fd8dc, transparent: true, opacity: 0.35 }));
  ctl.add(ray); rig.add(ctl);
}
const SNAP_TURN_DEG = 30;
function snapTurn(dg) {
  const before = new THREE.Vector3(); camera.getWorldPosition(before);
  rig.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), deg(dg)); rig.updateMatrixWorld(true);
  const after = new THREE.Vector3(); camera.getWorldPosition(after);
  rig.position.x += before.x - after.x; rig.position.z += before.z - after.z; rig.updateMatrixWorld(true);
}
const was = new Map(), armedMap = new Map();
function pollPads() {
  const sess = renderer.xr.getSession(); if (!sess) return;
  for (const src of sess.inputSources) {
    const gp = src.gamepad; if (!gp) continue;
    const prev = was.get(src) || [];
    if (gp.buttons[5] && gp.buttons[5].pressed && !prev[5]) fadeThen(standUp);   // B / Y
    const sx = gp.axes.length >= 4 ? gp.axes[2] : (gp.axes[0] || 0);
    const armed = armedMap.get(src) !== false;
    if (armed && Math.abs(sx) > 0.7) { snapTurn(sx > 0 ? -SNAP_TURN_DEG : SNAP_TURN_DEG); armedMap.set(src, false); }
    else if (!armed && Math.abs(sx) < 0.3) armedMap.set(src, true);
    was.set(src, gp.buttons.map(b => b.pressed));
  }
}

/* ---------------------------------------------------------- in-headset build label */
{
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
  g.font = '28px system-ui, sans-serif'; g.fillStyle = 'rgba(160,210,215,0.6)'; g.textAlign = 'center'; g.fillText(`Black Sand Beach · ${BUILD}`, 256, 40);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.04), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, toneMapped: false }));
  lab.position.set(0, -0.42, -0.9); lab.rotation.x = -0.4; lab.renderOrder = 999; lab.visible = false; camera.add(lab);
  renderer.xr.addEventListener('sessionstart', () => { lab.visible = true; startAudio(); document.getElementById('overlay').classList.add('hidden'); });
  renderer.xr.addEventListener('sessionend', () => { lab.visible = false; standUp(); document.getElementById('overlay').classList.remove('hidden'); });
}

/* ---------------------------------------------------------- overlay / VR button */
{
  const btn = document.getElementById('enter-vr');
  document.getElementById('enter-desk').onclick = () => { startAudio(); document.getElementById('overlay').classList.add('hidden'); };
  if ('xr' in navigator) navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if (!ok) { btn.textContent = 'VR not available — desktop mode'; return; }
    document.body.appendChild(VRButton.createButton(renderer));
    const real = document.querySelector('#VRButton'); real.style.display = 'none';
    btn.disabled = false; btn.textContent = 'Enter VR';
    btn.onclick = () => { startAudio(); real.click(); };
  }).catch(() => { btn.textContent = 'VR not available — desktop mode'; });
  else btn.textContent = 'VR not available — desktop mode';
}

/* ---------------------------------------------------------- loop */
const fpsEl = document.querySelector('#hud .fps'); let frames = 0, lastT = performance.now(), ema = 60;
const _p = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const now = performance.now(); frames++;
  if (now - lastT > 500) { ema = ema * 0.6 + frames * 1000 / (now - lastT) * 0.4; fpsEl.textContent = `${ema.toFixed(0)} fps`; frames = 0; lastT = now; }
  const t = window.__beachTime ?? now * 0.001; U.uTime.value = t;
  if (!renderer.xr.isPresenting) { camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch); }
  else pollPads();
  camera.getWorldPosition(_p); skyRig.position.copy(_p);
  ledMat.opacity = 0.55 + 0.35 * Math.sin(t * 0.8);
  tickAudio(t);
  renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

window.__beach = { camera, rig, scene, renderer, lieDown, standUp, snapTurn,
  look: (y, p = 0) => { yaw = y; pitch = p; },
  setPos: (x, y, z) => { rig.position.set(x, 0, z); rig.quaternion.identity(); camera.position.set(0, y, 0); },
  get lying() { return lying; } };
