// Black Sand Beach — Night. Standalone WebXR prototype (three r160, same CDN import map as /surface/).
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MusicPlayer, createMusicPanel } from '../../core/music.js';   // b11: the submarine scene's music player + panel
import { CanvasPanel, circleBtn, roundRect } from '../../core/panels.js';

const BUILD = 'Beach b12m-ship-b (b12m-ship + off-screen entry, 15s loop gap)';
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

const NOISE2 = `
// b5: grid-free noise for sand + water (simplex; Hoskins hash; rotated octaves) - no tile seams, no hash columns
float hh12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hh22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 sperm(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
  vec3 p = sperm(sperm(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0); m = m*m; m = m*m;
  vec3 x = 2.0*fract(p*C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314*(a0*a0 + h*h);
  vec3 g; g.x = a0.x*x0.x + h.x*x0.y; g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0*dot(m, g);   // -1..1
}
const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);
float sfbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*snoise(p); p=ROT*p*2.07+vec2(5.3,1.7); a*=0.5; } return 0.5+0.5*s; }
// band-limited: drop octaves whose wavelength is below the pixel footprint (no aliasing at headset res)
float sfbmAA(vec2 p, float fw){ float a=0.5, s=0.0, f=1.0; for(int i=0;i<5;i++){ float k = 1.0 - smoothstep(0.25, 0.6, f*fw); s+=a*snoise(p)*k; p=ROT*p*2.07+vec2(5.3,1.7); a*=0.5; f*=2.07; } return 0.5+0.5*s; }
`;
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
// b5: creme 'Sparks and Static' blanket back on the flattened bed
function blanketLift(x, z) {
  const ex = Math.min(x - BL.x0, BL.x1 - x), ez = Math.min(z - BL.z0, BL.z1 - z), e = Math.max(0, Math.min(ex, ez));
  let h = 0.006 + 0.008 * vnoise(x * 2.2 + 3, z * 2.2) + 0.004 * vnoise(x * 7, z * 7 + 2);
  h += 0.012 * Math.exp(-Math.pow((x * 0.6 + z * 0.8 + 1.4) / 0.06, 2)) * vnoise(x * 1.5, z);   // one soft rumple
  const edge = Math.min(1, e / 0.15);
  return h * (0.3 + 0.7 * edge) + (1 - edge) * 0.01 * vnoise(x * 4 + 9, z * 4);
}
function blanketY(x, z) {
  const inside = x > BL.x0 - 0.05 && x < BL.x1 + 0.05 && z > BL.z0 - 0.05 && z < BL.z1 + 0.05;
  return sandH(x, z) + (inside ? blanketLift(x, z) : 0);
}

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
    ${NOISE2}
    void main(){
      vec2 p = vW.xz;
      float d = length(vW - cameraPosition);
      // b5: continuous grainy sand from simplex noise, band-limited by the pixel footprint.
      float fw = length(fwidth(p));                         // metres per pixel here
      vec3 V = normalize(cameraPosition - vW);
      float warp = sfbm(p*0.5)*5.0;
      vec2 rd = normalize(vec2(0.35, 1.0));
      float rp = dot(p, rd)*11.0 + warp;                    // soft wind ripples (wavelength ~57 cm)
      float rk = 1.0 - smoothstep(0.03, 0.12, fw);          // fade ripples before they alias
      vec2 rg = rd*11.0*cos(rp)*(0.4+0.6*sfbm(p*0.35))*rk;
      // grain normal from two simplex scales via central differences, faded by footprint
      float e = 0.004;
      float gA = 1.0 - smoothstep(0.004, 0.012, fw), gB = 1.0 - smoothstep(0.012, 0.035, fw);
      vec2 q = ROT*p;
      float n1x = snoise((q+vec2(e,0))*120.0) - snoise((q-vec2(e,0))*120.0), n1z = snoise((q+vec2(0,e))*120.0) - snoise((q-vec2(0,e))*120.0);
      float n2x = snoise((p+vec2(e,0))*35.0) - snoise((p-vec2(e,0))*35.0), n2z = snoise((p+vec2(0,e))*35.0) - snoise((p-vec2(0,e))*35.0);
      vec2 gg = vec2(n1x, n1z)/(2.0*e)*0.0012*gA + vec2(n2x, n2z)/(2.0*e)*0.0025*gB;
      vec3 N = normalize(vec3(-(rg.x*0.004 + gg.x), 1.0, -(rg.y*0.004 + gg.y)));
      // swash: the waterline breathes in and out
      float swell = sin(uTime*0.34)*0.8 + sin(uTime*0.19+1.3)*0.45;
      float line = uShore + 1.2 + swell + (sfbm(vec2(p.x*0.3, uTime*0.04))-0.5)*1.4;
      float wet = smoothstep(line + 3.0, line - 0.3, p.y);
      float sheet = smoothstep(line + 0.05, line - 0.6, p.y);
      // albedo: salt-and-pepper basalt grains; detail averages to mid-grey with distance (no shimmer)
      float grain = mix(0.5, 0.5+0.5*snoise(q*260.0), 1.0 - smoothstep(0.002, 0.006, fw))*0.5
                  + mix(0.5, 0.5+0.5*snoise(p*80.0), 1.0 - smoothstep(0.006, 0.02, fw))*0.3
                  + sfbmAA(p*9.0, fw*9.0)*0.2;
      vec3 base = vec3(0.016,0.015,0.015) * (0.5 + 1.0*grain) * (0.85 + 0.3*sfbm(p*0.6));
      base = mix(base, base*0.4, wet);
      vec3 col = vec3(0.0);
      for(int i=0;i<2;i++){
        vec3 L = i==0 ? uLA : uLB; vec3 C = i==0 ? uCA : uCB * 0.6;
        float ndl = max(dot(N,L),0.0);
        col += base * C * (0.3 + ndl*1.4);
        vec3 H = normalize(L+V);
        col += C * pow(max(dot(N,H),0.0), 60.0) * 0.025 * wet * (0.3 + sheet);
        // sparse soft glints: rotated + jittered cells, tiny round dots, footprint + distance faded
        vec2 gp = (ROT*ROT*p + float(i)*vec2(17.3, 5.1)) * 160.0;
        vec2 cid = floor(gp), cf = fract(gp) - 0.5;
        vec2 jit = hh22(cid + 41.0) - 0.5;
        float dot_ = smoothstep(0.16, 0.04, length(cf - jit*0.6));
        float pick = step(0.985, hh12(cid*1.37 + 7.0));
        vec3 fn = normalize(vec3(hh12(cid+3.1)-0.5, 1.4, hh12(cid+7.7)-0.5));
        float vis = (1.0 - smoothstep(0.002, 0.005, fw)) * (1.0 - smoothstep(3.0, 9.0, d));
        col += C * pow(max(dot(fn,H),0.0), 80.0) * pick * dot_ * 0.22 * vis * (1.0 - wet*0.8);
      }
      col += vec3(0.002,0.0026,0.003);
      // foam line at the swash edge
      float fl = abs(p.y - line);
      float foam = smoothstep(0.45, 0.0, fl) * smoothstep(0.45, 0.8, sfbm(vec2(p.x*1.3, p.y*2.0 - uTime*0.3)));
      col += foam * (uCA*0.06 + uCB*0.03);
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
    ${NOISE2}
    // b4: every swell travels TOWARD the shore (+Z), within +-25 deg of the shore normal.
    // phase = dot(p,d)*k - w*t  -> crests move along +d.
    vec2 wgrad(vec2 p, float t, float fw, out float crest){
      vec2 g = vec2(0.0);
      vec4 W[5];
      W[0]=vec4( 0.00,1.0,0.42,0.55); W[1]=vec4( 0.25,1.0,0.80,0.80); W[2]=vec4(-0.30,1.0,1.30,1.05);
      W[3]=vec4( 0.45,1.0,2.40,1.45); W[4]=vec4(-0.40,1.0,3.60,1.80);
      float amp[5]; amp[0]=0.14; amp[1]=0.09; amp[2]=0.05; amp[3]=0.022; amp[4]=0.012;
      crest = 0.0;
      for(int i=0;i<5;i++){ vec2 d = normalize(W[i].xy); float k = W[i].z;
        float ph = dot(p,d)*k - t*W[i].w;
        g += d * cos(ph) * amp[i] * (1.0 - smoothstep(0.15, 0.5, k*fw/6.2832));   // footprint fade
        if(i==0) crest = sin(ph);
      }
      // fine ripples: simplex (no grid), two crossing drifts toward shore, faded by pixel footprint
      float e = 0.05;
      vec2 q1 = ROT*p*1.8 + vec2(0.0, -t*0.30), q2 = ROT*ROT*p*3.4 + vec2(t*0.15, -t*0.25);
      float f1 = 1.0 - smoothstep(0.08, 0.3, fw*1.8), f2 = 1.0 - smoothstep(0.08, 0.3, fw*3.4);
      g += vec2(snoise(q1+vec2(e,0))-snoise(q1-vec2(e,0)), snoise(q1+vec2(0,e))-snoise(q1-vec2(0,e)))/(2.0*e) * 0.020 * f1;
      g += vec2(snoise(q2+vec2(e,0))-snoise(q2-vec2(e,0)), snoise(q2+vec2(0,e))-snoise(q2-vec2(0,e)))/(2.0*e) * 0.008 * f2;
      return g;
    }
    void main(){
      vec3 toC = cameraPosition - vW; float d = length(toC); vec3 V = toC/d;
      float lod = 1.0 / (1.0 + d*0.025);
      float fw = length(fwidth(vW.xz));
      float crest;
      vec2 g = wgrad(vW.xz, uTime, fw, crest);
      // lost (filtered-out) slope variance becomes roughness, so the far moon path widens softly instead of banding
      float rough = clamp(fw*1.5, 0.0, 1.0);
      vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 R = reflect(-V, N);
      float ndv = max(dot(N,V),0.0);
      float fres = 0.02 + 0.98*pow(1.0 - ndv, 5.0);
      fres = min(fres, 0.35);                                       // never a mirror at grazing angles
      // dark blue-green body; the black night sky reflects only faintly
      vec3 body = vec3(0.0025,0.0065,0.0070);
      vec3 col = body*(1.0-fres) + vec3(0.003,0.005,0.007)*fres;
      for(int i=0;i<2;i++){
        vec3 L = i==0 ? uLA : uLB; vec3 C = i==0 ? uCA : uCB;
        float c = max(dot(R,L),0.0);
        float sz = i==0 ? 1.0 : 0.6;
        // soft broken moon path: medium-tight lobe on rippled normals, no broad sheen lobe
        float ex = mix(260.0, 45.0, rough)/sz;
        col += C * (pow(c, ex)*mix(1.6, 0.35, rough) + pow(c, 60.0/sz)*0.06) * (0.25 + fres*1.2);
        // crests of the main swell catch the moons a little (moves toward the shore with the swell)
        float cr = pow(max(crest,0.0), 6.0);
        col += C * cr * pow(c, 18.0) * 0.012;
      }
      // shoreline: water thins out over the sand, soft foam where the swash meets the beach
      float swell = sin(uTime*0.34)*0.8 + sin(uTime*0.19+1.3)*0.45;
      float line = uShore + 1.2 + swell + (sfbm(vec2(vW.x*0.3, uTime*0.04))-0.5)*1.4;
      float a = smoothstep(line - 0.2, line - 1.8, vW.z);
      float toShore = line - vW.z;                                  // metres seaward of the swash line
      // breaking crests: only where the main swell crest is, within the last ~8 m, carried by the swell phase
      float br = smoothstep(9.0, 2.5, toShore) * smoothstep(0.0, 1.0, toShore);
      float fo = smoothstep(0.82, 0.98, crest) * br;
      float fn2 = smoothstep(0.3, 0.75, sfbm(vec2(vW.x*1.1, vW.z*2.3) + vec2(0.0, -uTime*0.3)));
      col += fo * fn2 * (uCA*0.035 + uCB*0.018);
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
// b8: galaxy frame shared by the star mask and the galaxy quad (quad local axes in skyRig space)
const GAL_DIR = dirFrom(42, 39), GAL_ROT = deg(-18), GAL_W = 9, GAL_ASPECT = 783 / 1400;  // mid: b12 16° / b17 3° → 9°, still clearly visible but distant
const galFrame = new THREE.Object3D(); galFrame.position.copy(GAL_DIR); galFrame.lookAt(0, 0, 0); galFrame.rotateZ(GAL_ROT); galFrame.updateMatrix();
const galX = new THREE.Vector3(), galY = new THREE.Vector3(), galZ = new THREE.Vector3(); galFrame.matrix.extractBasis(galX, galY, galZ);
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
    uniforms: { uPx: { value: renderer.getPixelRatio() }, uLA: moonUniforms.uLA, uLB: moonUniforms.uLB,
      uGX: { value: galX }, uGY: { value: galY }, uGN: { value: GAL_DIR.clone() },
      uGH: { value: new THREE.Vector2(Math.tan(deg(GAL_W) / 2), Math.tan(deg(GAL_W) / 2) * GAL_ASPECT) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float mag; attribute vec3 color; varying float vB; varying vec3 vC; uniform float uPx; uniform vec3 uLA, uLB, uGX, uGY, uGN; uniform vec2 uGH;
      void main(){ vec3 dir = normalize(position);
        float wash = smoothstep(0.93, 0.995, dot(dir,uLA))*0.85 + smoothstep(0.97, 0.998, dot(dir,uLB))*0.6;   // moonlight drowns nearby stars
        float hor = smoothstep(0.0, 0.12, dir.y);
        float gd = dot(dir, uGN); vec2 gq = vec2(dot(dir, uGX), dot(dir, uGY)) / max(gd, 1e-3) / uGH;   // b8: stars behind the galaxy are hidden
        float gal = gd > 0.0 ? smoothstep(1.05, 0.75, length(gq)) : 0.0;
        vB = (0.18 + 1.6*mag) * hor * (1.0 - wash) * (1.0 - gal); vC = color;
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

/* ---------------------------------------------------------- merging galaxies (sky-fixed, additive, no parallax) */
{
  const gTex = new THREE.TextureLoader().load('./assets/galaxies.jpg'); gTex.colorSpace = THREE.SRGBColorSpace;
  const D = 2200, w = 2 * D * Math.tan(deg(GAL_W) / 2), h = w * GAL_ASPECT;   // mid: b12 1650 m / b17 2800 m → 2200 m (inside the 3000 m far plane)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: gTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(0.55, 0.55, 0.55) }));
  m.position.copy(GAL_DIR).multiplyScalar(D); m.lookAt(0, 0, 0); m.rotateZ(GAL_ROT);
  m.renderOrder = -12; m.frustumCulled = false; skyRig.add(m);   // b8: drawn before (behind) the stars
}

/* ---------------------------------------------------------- shooting stars: occasional thin streaks (not a stream) */
const METEOR_R = 1450, METEOR_N = 14;
function makeMeteorLine() {
  const pos = new Float32Array(METEOR_N * 3), col = new Float32Array(METEOR_N * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const line = new THREE.Line(g, mat); line.frustumCulled = false; line.renderOrder = -8; line.visible = false; skyRig.add(line);
  return { line, pos, col, g, active: false, t0: 0, dur: 1, from: new THREE.Vector3(), to: new THREE.Vector3() };
}
const meteors = [makeMeteorLine(), makeMeteorLine()];
let nextMeteorAt = 4 + Math.random() * 8;   // first streak after a short beat, then 15–45 s gaps
function armMeteor(slot, t, from, to, dur) {
  const m = meteors[slot];
  m.active = true; m.t0 = t; m.dur = dur; m.from.copy(from); m.to.copy(to); m.line.visible = true;
}
function spawnMeteor(slot, t) {
  const yaw = (Math.random() * 140 - 70) * Math.PI / 180;       // ahead of the beach, not behind the cliffs
  const elev = (28 + Math.random() * 38) * Math.PI / 180;       // mid/high sky, away from the horizon
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), -Math.cos(yaw) * Math.cos(elev)).normalize();
  // short downward-right or downward-left fall, 9–14° of sky
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0); else right.normalize();
  const down = new THREE.Vector3().crossVectors(right, dir).normalize();
  const fall = right.multiplyScalar((Math.random() < 0.5 ? 1 : -1) * (0.55 + Math.random() * 0.45))
    .addScaledVector(down, 0.7 + Math.random() * 0.4).normalize();
  const span = deg(9 + Math.random() * 5);
  const from = dir.clone(), to = dir.clone().addScaledVector(fall, span).normalize();
  armMeteor(slot, t, from, to, 0.7 + Math.random() * 0.5);
}
function tickMeteors(t) {
  if (t >= nextMeteorAt) {
    spawnMeteor(0, t);
    nextMeteorAt = t + 15 + Math.random() * 30;                 // 15–45 s until the next one
    if (Math.random() < 0.18) {                                 // occasional close pair
      spawnMeteor(1, t + 0.25 + Math.random() * 0.55);
    }
  }
  for (const m of meteors) {
    if (!m.active) continue;
    const p = (t - m.t0) / m.dur;
    if (p >= 1) { m.active = false; m.line.visible = false; continue; }
    const fade = p < 0.12 ? p / 0.12 : p > 0.62 ? 1 - (p - 0.62) / 0.38 : 1;
    const tail = 0.22 + 0.1 * (1 - p);                          // short fading tail, shrinks as it dies
    for (let i = 0; i < METEOR_N; i++) {
      const u = i / (METEOR_N - 1);
      const s = Math.max(0, p - tail * (1 - u));
      const d = new THREE.Vector3().lerpVectors(m.from, m.to, s).normalize().multiplyScalar(METEOR_R);
      m.pos.set([d.x, d.y, d.z], i * 3);
      const k = fade * Math.pow(u, 1.35) * 0.7;                 // faint: bright head, dim tail
      m.col.set([0.85 * k, 0.9 * k, 1.0 * k], i * 3);
    }
    m.g.attributes.position.needsUpdate = true;
    m.g.attributes.color.needsUpdate = true;
    m.line.material.opacity = 0.9 * fade;
  }
}


/* ---------------------------------------------------------- cliffs: painted wall on curved panels behind + sides */
const texLoader = new THREE.TextureLoader();
const cliffTex = texLoader.load('./assets/cliff2.jpg'); cliffTex.colorSpace = THREE.SRGBColorSpace; cliffTex.anisotropy = 8;
cliffTex.wrapS = THREE.RepeatWrapping;
const cliffTop = texLoader.load('./assets/cliff2_top.png'); cliffTop.minFilter = cliffTop.magFilter = THREE.LinearFilter; cliffTop.wrapS = THREE.RepeatWrapping;
// b3: one solid basalt wall sweeping ~250 deg around the back; texture = [rock | mirrored rock] tiles seamlessly.
// Opaque (no alpha edge fade); only the crisp top silhouette is cut out against the black sky.
function addCliff({ R, arcDeg, cz = 0, uOff = 0.25, reps = 1, sy = 1.0, ground = 0.08, bright = 1.35 }) {
  const arc = deg(arcDeg), H = R * arc / (3888 / 1952) / reps * sy;
  const geo = new THREE.CylinderGeometry(R, R, H, 128, 1, true, Math.PI - arc / 2, arc);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: cliffTex }, uTop: { value: cliffTop }, uOff: { value: uOff }, uReps: { value: reps }, uB: { value: bright } },
    side: THREE.BackSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = vec2(1.0-uv.x, uv.y); vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D uMap, uTop; uniform float uOff, uReps, uB; varying vec2 vUv; varying vec3 vW;
      void main(){
        float u = vUv.x*uReps + uOff;
        vec3 tp = texture2D(uTop, vec2(u, 0.5)).rgb;
        float top = tp.r + tp.g/255.0;
        // headland ends: the wall steps down toward the open sea side
        float endT = min(vUv.x, 1.0-vUv.x);
        top = mix(0.12, top, smoothstep(0.0, 0.09, endT));
        if (vUv.y > top - 0.001) discard;
        vec3 c = texture2D(uMap, vec2(u, vUv.y)).rgb * uB;
        // moon tint: teal moon side (-X) leans teal, rose side (+X) a hint warm
        float s = clamp(vW.x/29.5, -1.0, 1.0);   // b9: tint span scaled with the wall radius
        c *= mix(vec3(0.92,1.03,1.08), vec3(1.07,0.98,0.94), s*0.5+0.5);
        c *= mix(0.55, 1.0, smoothstep(0.0, 0.07, endT));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -0.15 + H / 2 - ground * H, cz);
  mesh.rotation.y = Math.PI;
  scene.add(mesh); return mesh;
}
addCliff({ R: 32, arcDeg: 236, cz: -3 });   // b9: pushed back from 19.5 m; height scales with R so the angular size stays the same
// a few real boulders at the cliff foot help the wall sit on the sand
{
  // b7: dark basalt, smooth normals, grid-free simplex mottling in world space that fades with pixel footprint
  const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.08, 0.08, 0.09), roughness: 0.92, metalness: 0.0 });
  rockMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRW;\n' + NOISE2)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float fw = length(fwidth(vRW)); vec3 P = vRW;
          float big = (snoise(P.xz * 0.9) + snoise(P.xy * 0.9 + 3.1) + snoise(P.zy * 0.9 + 7.3)) / 3.0;
          float fine = (snoise(P.xz * 7.0) + snoise(P.xy * 7.0 + 1.7) + snoise(P.zy * 7.0 + 5.2)) / 3.0 * (1.0 - smoothstep(0.02, 0.08, fw));
          diffuseColor.rgb *= clamp(0.85 + 0.35 * big + 0.2 * fine, 0.55, 1.25); }`);
  };
  let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    let g = new THREE.IcosahedronGeometry(1, 5); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); const pa = g.attributes.position;
    for (let j = 0; j < pa.count; j++) { const v = new THREE.Vector3().fromBufferAttribute(pa, j); v.multiplyScalar(0.7 + 0.45 * vnoise(v.x * 1.5 + i, v.y * 1.5 + v.z * 1.3) + 0.08 * vnoise(v.x * 6, v.z * 6 + v.y)); pa.setXYZ(j, v.x, v.y, v.z); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMat);
    const a = deg(105 + r() * 150) , R = 28.0 + r() * 2.8;   // b9: follows the wall back to its foot
    const sc = (0.4 + r() * 1.3) * 1.4;   // b9: a bit larger at the new distance
    m.position.set(Math.sin(a) * R, sc * 0.2, -3 - Math.cos(a) * R);
    m.scale.set(sc * (1 + r()), sc * (0.6 + r() * 0.6), sc * (1 + r()));
    m.rotation.set(r() * 3, r() * 3, r() * 3); scene.add(m);
  }
}

/* ---------------------------------------------------------- visiting ship: Scott's long dark wedge
   Procedural hull matching his reference: a low flattened blade, sharp nose, stepped stern decks,
   gunmetal with a single warm amber side-line and a few underside lights. Cruises left → right
   over the water at z = −85 m (well seaward of the basalt wall, whose headlands sit at
   x ≈ ±28 m, z ≈ −18 m, yaw ≈ ±56° from the blanket). Mid-crossing it slows, eases down to
   hover ~5 m over the water, scans with a soft teal fan, then rises and continues out.

   b12m-ship-b: the ship no longer pops in already on-screen. It spawns fully off-screen to the
   left (x0 = −200 m; the whole hull sits outside a ~132° FOV from the standing blanket, generous
   past Quest 3 ~110° and a 120° view) and flies in, first becoming visible at the left edge —
   at or just left of the left-hand wall — then crosses at the same calm ~2.4 m/s cruise as
   b12m-ship. It is hidden only after the whole hull is off-screen to the right (x1 = +200 m).
   From leaving a ~110° view on the right to re-entering one on the left is ~15 s (6 s fly-out
   past the right edge + 3 s pause + 6 s fly-in from the left). Cycle ~147 s. */
const SHIP = {
  z: -85, yCruise: 11, yHover: 5.0,
  x0: -200, x1: 200, xHover: 0,
  xVisL: -130, xVisR: 129,           // hull just at a ~110° VR view edge (nose / trailing stern)
  xApproach: -8, xDepart: 10,
  vCruise: 2.4,                      // same calm pace as b12m-ship cruise-in (82 m / 34 s)
  offIn: 6, descend: 10, hover: 12, ascend: 10, offOut: 6, pause: 3,
  scanDelay: 1.6, scanDur: 7.0, scanFade: 1.0,
  bobCruise: 0.25, bobHover: 0.16,
  waterY: -0.04,
};
SHIP.cruiseIn  = (SHIP.xApproach - SHIP.xVisL) / SHIP.vCruise;   // 122 m
SHIP.cruiseOut = (SHIP.xVisR - SHIP.xDepart)   / SHIP.vCruise;   // 119 m
SHIP.tOffInEnd = SHIP.offIn;
SHIP.tIn = SHIP.tOffInEnd + SHIP.cruiseIn;
SHIP.tDesc = SHIP.tIn + SHIP.descend;
SHIP.tHov = SHIP.tDesc + SHIP.hover;
SHIP.tAsc = SHIP.tHov + SHIP.ascend;
SHIP.tCruiseOutEnd = SHIP.tAsc + SHIP.cruiseOut;
SHIP.tOut = SHIP.tCruiseOutEnd + SHIP.offOut;
SHIP.cycle = SHIP.tOut + SHIP.pause;
const ship = new THREE.Group(); ship.visible = false; scene.add(ship);
const shipBody = new THREE.Group(); ship.add(shipBody); // pitch lives here; group is yawed −90°
const scanRig = new THREE.Group(); scanRig.visible = false; scene.add(scanRig);
{
  // Modeled facing −Z (length along Z). The group is then yawed −90° so the nose cruises toward +X.
  const hullMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.058, 0.062, 0.072), roughness: 0.30, metalness: 0.80,
    emissive: new THREE.Color(0.016, 0.018, 0.022),
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.070, 0.074, 0.084), roughness: 0.26, metalness: 0.84,
    emissive: new THREE.Color(0.022, 0.024, 0.028),
  });

  // Lofted main hull: rounded-bottom, flatter-deck stations. ~14.6 m long, ~3.8 m beam, ~1.1 m body.
  const stations = [
    { z: -7.55, halfW: 0.012, yb:  0.00, yd:  0.035 },  // sharp tip
    { z: -6.85, halfW: 0.14,  yb: -0.03, yd:  0.11 },
    { z: -5.70, halfW: 0.48,  yb: -0.12, yd:  0.22 },
    { z: -4.20, halfW: 0.95,  yb: -0.24, yd:  0.34 },
    { z: -2.40, halfW: 1.40,  yb: -0.34, yd:  0.44 },
    { z: -0.50, halfW: 1.70,  yb: -0.42, yd:  0.50 },
    { z:  1.20, halfW: 1.86,  yb: -0.45, yd:  0.52 },
    { z:  2.80, halfW: 1.90,  yb: -0.44, yd:  0.52 },
    { z:  4.20, halfW: 1.86,  yb: -0.38, yd:  0.48 },
    { z:  5.50, halfW: 1.74,  yb: -0.26, yd:  0.38 },
    { z:  6.50, halfW: 1.58,  yb: -0.14, yd:  0.28 },
    { z:  7.15, halfW: 1.42,  yb: -0.04, yd:  0.18 },   // transom
  ];
  const SEGS = 16;
  function loftHull(sts, segs) {
    const nr = sts.length, nv = segs + 1;
    const pos = new Float32Array(nr * nv * 3);
    for (let r = 0; r < nr; r++) {
      const st = sts[r], y0 = (st.yb + st.yd) * 0.5, hUp = st.yd - y0, hDn = y0 - st.yb;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2 - Math.PI / 2;     // 0 at starboard
        const c = Math.cos(a), s = Math.sin(a);
        const n = s >= 0 ? 3.4 : 2.15;                       // flatter deck, rounder keel
        const h = s >= 0 ? hUp : hDn;
        const x = Math.sign(c) * st.halfW * Math.pow(Math.abs(c), 2 / n);
        const y = y0 + Math.sign(s) * h * Math.pow(Math.abs(s), 2 / n);
        const o = (r * nv + i) * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = st.z;
      }
    }
    const idx = [];
    for (let r = 0; r < nr - 1; r++) {
      for (let i = 0; i < segs; i++) {
        const a = r * nv + i, b = a + nv;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    // transom cap (last ring → centre)
    const last = sts[sts.length - 1];
    const capY = (last.yb + last.yd) * 0.5, capI = pos.length / 3;
    const cap = new Float32Array(pos.length + 3);
    cap.set(pos); cap[pos.length] = 0; cap[pos.length + 1] = capY; cap[pos.length + 2] = last.z;
    const capIdx = idx.slice();
    const ring0 = (nr - 1) * nv;
    for (let i = 0; i < segs; i++) capIdx.push(capI, ring0 + i + 1, ring0 + i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cap, 3));
    g.setIndex(capIdx);
    g.computeVertexNormals();
    return g;
  }
  const hull = new THREE.Mesh(loftHull(stations, SEGS), hullMat);
  shipBody.add(hull);

  // Stepped stern / upper decks — layered plates like the reference's terraced aft.
  const plates = [
    { z: 3.55, dz: 5.9, y: 0.57, h: 0.11, w: 3.40 },   // long low terrace, hangs aft
    { z: 3.25, dz: 4.5, y: 0.66, h: 0.09, w: 3.05 },
    { z: 3.05, dz: 3.3, y: 0.74, h: 0.08, w: 2.62 },
    { z: 2.90, dz: 2.2, y: 0.81, h: 0.07, w: 2.12 },   // short top step
  ];
  for (const p of plates) {
    const g = new RoundedBoxGeometry(p.w, p.h, p.dz, 2, 0.045);
    const m = new THREE.Mesh(g, plateMat);
    m.position.set(0, p.y, p.z);
    shipBody.add(m);
  }
  // Long low cabin that slopes into the forward deck (a hump, not a tower).
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(0, 0); cabinShape.lineTo(2.4, 0); cabinShape.lineTo(2.2, 0.06);
  cabinShape.lineTo(0.6, 0.22); cabinShape.lineTo(-2.6, 0.18); cabinShape.lineTo(-3.4, 0); cabinShape.closePath();
  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  cabinGeo.rotateY(-Math.PI / 2); cabinGeo.translate(1.1, 0.50, 1.35);
  shipBody.add(new THREE.Mesh(cabinGeo, plateMat));

  // Warm amber/peach character line along each side, mid-height, following the hull taper.
  const amber = new THREE.Color(1.0, 0.72, 0.48);
  const lineMat = new THREE.MeshBasicMaterial({ color: amber, toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const lineGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.70, 0.42), toneMapped: false, transparent: true, opacity: 0.38,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const lineY = 0.04, zLine0 = -6.15, zLine1 = 5.55;
  function halfWAt(z) {
    if (z <= stations[0].z) return stations[0].halfW;
    if (z >= stations[stations.length - 1].z) return stations[stations.length - 1].halfW;
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      if (z >= a.z && z <= b.z) { const t = (z - a.z) / (b.z - a.z); return a.halfW + (b.halfW - a.halfW) * t; }
    }
    return stations[stations.length - 1].halfW;
  }
  function makeSideRibbon(outer, y0, y1, z0, z1, steps) {
    const pos = [], idx = [];
    for (let i = 0; i <= steps; i++) {
      const z = z0 + (z1 - z0) * (i / steps), x = halfWAt(z) + outer;
      pos.push(x, y0, z, x, y1, z);
    }
    for (let i = 0; i < steps; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  for (const s of [-1, 1]) {
    const bar = new THREE.Mesh(makeSideRibbon(0.008, lineY - 0.016, lineY + 0.016, zLine0, zLine1, 20), lineMat);
    bar.scale.x = s; shipBody.add(bar);
    const glow = new THREE.Mesh(makeSideRibbon(0.03, lineY - 0.055, lineY + 0.055, zLine0, zLine1, 20), lineGlowMat);
    glow.scale.x = s; shipBody.add(glow);
  }

  // A few small warm point lights on the underside (mid-aft, as in the reference).
  const podMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.52), toneMapped: false, transparent: true, opacity: 0.7 });
  const podGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.7, 0.42), toneMapped: false, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pods = [];
  for (const z of [0.4, 2.0, 3.6]) {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), podMat);
    pod.position.set(0, -0.47, z); shipBody.add(pod);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), podGlowMat);
    halo.position.copy(pod.position); shipBody.add(halo);
    pods.push(halo);
  }
  ship.userData.pods = pods;

  // Scanner port — small dark blister under midships; the beam origin.
  const port = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), hullMat);
  port.scale.set(1.6, 0.55, 1.3); port.position.set(0, -0.50, 0.2); shipBody.add(port);
  const scanner = new THREE.Object3D(); scanner.position.set(0, -0.56, 0.2); shipBody.add(scanner);
  ship.userData.scanner = scanner;

  ship.rotation.y = -Math.PI / 2;                               // cruise toward +X (the blanket's right)
}

/* Soft additive scan materials — gauss / radial falloff in a shader so the edges never read as a quad. */
function _scanMat(color, mode) {
  const mid = mode === 'fan' ? 0 : (mode === 'line' ? 1 : 2);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uOp: { value: 1 }, uMode: { value: mid } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uOp, uMode; varying vec2 vUv;
      float gauss(float x, float s){ return exp(-0.5 * x * x / (s * s)); }
      void main(){
        float a = 0.0;
        if (uMode < 0.5) {
          a = (gauss(vUv.x - 0.5, 0.07) + 0.4 * gauss(vUv.x - 0.5, 0.18)) * (0.22 + 0.78 * (1.0 - vUv.y));
        } else if (uMode < 1.5) {
          a = (gauss(vUv.x - 0.5, 0.06) + 0.3 * gauss(vUv.x - 0.5, 0.16)) * pow(sin(3.14159265 * vUv.y), 1.4);
        } else {
          float r = length(vec2((vUv.x - 0.5) / 0.48, (vUv.y - 0.5) / 0.48));
          a = pow(max(0.0, 1.0 - r), 2.0);
        }
        if (a < 0.008) discard;
        gl_FragColor = vec4(uColor * a * uOp, a * uOp);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, premultipliedAlpha: true,
  });
}

/* Thin teal scan: a narrow vertical fan that walks stern → nose, plus a bright water line and a faint shimmer.
   World-space rig so the line stays on the water as the ship bobs. Soft cyan-teal, kin to the large moon. */
{
  const teal = new THREE.Color(0.45, 0.94, 0.92);
  const fan = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), _scanMat(teal, 'fan'));
  const core = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), _scanMat(new THREE.Color(0.80, 1.0, 0.98), 'fan'));
  const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 6.0), _scanMat(teal, 'line'));
  line.rotation.x = -Math.PI / 2;
  const shimmer = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 7.5), _scanMat(new THREE.Color(0.30, 0.72, 0.74), 'shimmer'));
  shimmer.rotation.x = -Math.PI / 2;
  scanRig.add(fan, core, line, shimmer);
  ship.userData.scan = { fan, core, line, shimmer };
}
function _shipEase(t) { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }
function _shipLerp(a, b, t) { return a + (b - a) * _shipEase(t); }
function _shipLin(a, b, t) { t = Math.min(1, Math.max(0, t)); return a + (b - a) * t; }
const _scanOrigin = new THREE.Vector3();
function tickShip(t) {
  const S = SHIP;
  const u = ((t % S.cycle) + S.cycle) % S.cycle;
  const flying = u < S.tOut;
  ship.visible = flying;
  if (!flying) { scanRig.visible = false; return; }

  let x, y, pitch = 0;
  if (u < S.tOffInEnd) {
    x = _shipLin(S.x0, S.xVisL, u / S.offIn);                // off-screen left → just entering a ~110° view
    y = S.yCruise;
  } else if (u < S.tIn) {
    x = _shipLin(S.xVisL, S.xApproach, (u - S.tOffInEnd) / S.cruiseIn);
    y = S.yCruise;
  } else if (u < S.tDesc) {
    const p = (u - S.tIn) / S.descend;
    x = _shipLerp(S.xApproach, S.xHover, p);
    y = _shipLerp(S.yCruise, S.yHover, p);
    pitch = -0.055 * Math.sin(p * Math.PI);                  // gentle nose-down on the way in
  } else if (u < S.tHov) {
    x = S.xHover;
    y = S.yHover;
    pitch = 0;
  } else if (u < S.tAsc) {
    const p = (u - S.tHov) / S.ascend;
    x = _shipLerp(S.xHover, S.xDepart, p);
    y = _shipLerp(S.yHover, S.yCruise, p);
    pitch = 0.05 * Math.sin(p * Math.PI);                    // gentle nose-up on the way out
  } else if (u < S.tCruiseOutEnd) {
    x = _shipLin(S.xDepart, S.xVisR, (u - S.tAsc) / S.cruiseOut);
    y = S.yCruise;
  } else {
    x = _shipLin(S.xVisR, S.x1, (u - S.tCruiseOutEnd) / S.offOut);  // leave a ~110° view → fully off-screen right
    y = S.yCruise;
  }
  const bobAmp = (u >= S.tDesc && u < S.tHov) ? S.bobHover : S.bobCruise;
  const bob = bobAmp * Math.sin(t * 0.55);
  ship.position.set(x, y + bob, S.z);
  shipBody.rotation.x = pitch;

  // Underside pods breathe slowly the whole flight.
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
  const pods = ship.userData.pods;
  if (pods) for (const h of pods) h.material.opacity = 0.12 + 0.16 * pulse;

  // Scan: after a short settle, one slow stern→nose pass under the hull, then fade.
  const su = u - S.tDesc;
  const inScan = u >= S.tDesc && u < S.tHov && su > S.scanDelay;
  const scan = ship.userData.scan;
  if (!inScan || !scan) { scanRig.visible = false; return; }
  const raw = su - S.scanDelay;
  let fade = 1;
  if (raw < 0.6) fade = raw / 0.6;
  else if (raw > S.scanDur - S.scanFade) fade = Math.max(0, (S.scanDur - raw) / S.scanFade);
  if (fade <= 0) { scanRig.visible = false; return; }
  scanRig.visible = true;

  const scanner = ship.userData.scanner;
  scanner.getWorldPosition(_scanOrigin);
  const sweep = _shipEase(Math.min(1, Math.max(0, raw / S.scanDur)));
  const xHit = x - 6.0 + 12.0 * sweep;                       // stern (−X) toward the nose (+X)
  const yW = S.waterY;
  const yTop = _scanOrigin.y - 0.02;
  const h = Math.max(0.4, yTop - (yW + 0.08));
  const yMid = (yTop + yW) * 0.5;

  // Thin vertical fan + brighter core, both facing the blanket (in the X-up plane, thin in X).
  for (const [mesh, w, op] of [[scan.fan, 2.2, 0.55 * fade], [scan.core, 0.38, 0.85 * fade]]) {
    mesh.position.set(xHit, yMid, S.z);
    mesh.scale.set(w, h, 1);
    mesh.material.uniforms.uOp.value = op;
  }
  scan.line.position.set(xHit, yW + 0.03, S.z);
  scan.line.rotation.set(-Math.PI / 2, 0, 0);               // short in X, longer toward the beach
  scan.line.material.uniforms.uOp.value = 0.9 * fade;
  const sh = 0.85 + 0.15 * Math.sin(t * 3.2);
  scan.shimmer.position.set(xHit, yW + 0.015, S.z);
  scan.shimmer.rotation.set(-Math.PI / 2, 0, 0);
  scan.shimmer.scale.set(1, 0.85 + 0.2 * Math.sin(t * 1.4), 1);
  scan.shimmer.material.uniforms.uOp.value = 0.28 * fade * sh;
}

/* ---------------------------------------------------------- blanket (b5: creme, 'Sparks and Static') */
{
  const tex = new THREE.TextureLoader().load('./assets/blanket.jpg'); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(0.60, 0.57, 0.53), roughness: 0.97, metalness: 0,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const W = BL.x1 - BL.x0, L = BL.z1 - BL.z0;
  const g = new THREE.PlaneGeometry(W, L, 120, 90); g.rotateX(-Math.PI / 2);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    let x = pa.getX(i) + bcx, z = pa.getZ(i) + bcz;
    const ex = Math.min(x - BL.x0, BL.x1 - x), ez = Math.min(z - BL.z0, BL.z1 - z);
    x += (vnoise(z * 1.5, 3) - 0.5) * 0.08 * Math.max(0, 1 - ex / 0.3) * Math.sign(x - bcx);
    z += (vnoise(x * 1.5, 9) - 0.5) * 0.08 * Math.max(0, 1 - ez / 0.3) * Math.sign(z - bcz);
    // b6: fold the foot-right corner back over itself (reflect across the line 0.38 m in from the corner)
    const FC = 0.6, u = (x - (BL.x1 - FC)) + ((BL.z0 + FC) - z) - FC;
    if (u > 0) { const fy = blanketY(x - u, z + u) + 0.014 + 0.025 * Math.min(1, u / 0.08); pa.setXYZ(i, x - u, fy, z + u); continue; }
    pa.setXYZ(i, x, blanketY(x, z), z);
  }
  g.computeVertexNormals();
  const b = new THREE.Mesh(g, mat); b.receiveShadow = true; scene.add(b);
}

/* ---------------------------------------------------------- music player on the head edge */
const radioHit = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.26), new THREE.MeshBasicMaterial({ visible: false }));
const ledMat = new THREE.MeshBasicMaterial({ color: 0x6fe0d0, toneMapped: false, transparent: true, opacity: 0.55 });
{
  const g = new RoundedBoxGeometry(0.075, 0.011, 0.14, 4, 0.005);
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, roughness: 0.55, metalness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.5 }));
  const x = 0.55, z = -2.2; m.position.set(x, blanketY(x, z) + 0.006, z); m.rotation.y = 0.35;
  m.castShadow = true; scene.add(m);
  radioHit.position.copy(m.position); radioHit.position.y += 0.03; scene.add(radioHit);   // b11: generous invisible click target
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12).rotateX(-Math.PI / 2), ledMat);
  led.position.set(0.018, 0.0058, 0.05); m.add(led);
}

/* ---------------------------------------------------------- b6: warm radio glow (fake additive patch, slow pulse) */
const glowU = { uTime: U.uTime, uLevel: { value: 0 } };   // b11: uLevel = music loudness (0 when silent)
{
  const gm = new THREE.ShaderMaterial({ uniforms: glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uLevel; varying vec2 vUv; void main(){ float r = length(vUv);
      float a = (1.0 + 0.7*uLevel) * exp(-r*r*5.0) * smoothstep(1.0, 0.7, r);
      float pulse = 0.86 + 0.08*sin(uTime*0.9) + 0.06*sin(uTime*2.3 + 1.7);
      gl_FragColor = vec4(vec3(1.0,0.55,0.22)*a*0.12*pulse, 1.0); }` });
  const gx = 0.55, gz = -2.2, gs = 1.3, gg = new THREE.PlaneGeometry(gs, gs, 24, 24); gg.rotateX(-Math.PI / 2);
  const ga = gg.attributes.position;
  for (let i = 0; i < ga.count; i++) { const x = ga.getX(i) + gx, z = ga.getZ(i) + gz; ga.setXYZ(i, x, blanketY(x, z) + 0.004, z); }
  scene.add(new THREE.Mesh(gg, gm));
}

/* ---------------------------------------------------------- b6: soft pillow at the head end */
{
  const pg = new RoundedBoxGeometry(0.52, 0.11, 0.30, 5, 0.05);
  const pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
    const k = (1 - Math.pow(Math.abs(x) / 0.26, 2)) * (1 - Math.pow(Math.abs(z) / 0.15, 2));
    pp.setY(i, y * (0.55 + 0.45 * Math.max(0, k))); }
  pg.computeVertexNormals();
  const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.60, 0.56), roughness: 0.97, metalness: 0 }));
  const px = -0.35, pz = -2.28; pm.position.set(px, blanketY(px, pz) + 0.035, pz); pm.rotation.y = 0.04;
  pm.castShadow = true; pm.receiveShadow = true; scene.add(pm);
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
const AMBIENT_VOL_KEY = 'europa-beach-b12m-vol-ambient';
const AMBIENT_VOL_DEFAULT = 1;   // 100% of the current mix — identical to b12 / b12m at default
function loadAmbientVol() {
  try {
    const raw = localStorage.getItem(AMBIENT_VOL_KEY);
    if (raw == null || raw === '') return AMBIENT_VOL_DEFAULT;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  } catch (e) { /* private mode */ }
  return AMBIENT_VOL_DEFAULT;
}
let ambientVol = loadAmbientVol();
function applyAmbientGain() {
  if (audio && audio.ambientGain) audio.ambientGain.gain.setTargetAtTime(ambientVol, audio.ctx.currentTime, 0.04);
}
function setAmbientVol(v) {
  ambientVol = Math.min(1, Math.max(0, Math.round(v * 100) / 100));
  applyAmbientGain();
  try { localStorage.setItem(AMBIENT_VOL_KEY, String(ambientVol)); } catch (e) { /* ignore */ }
  syncAmbientUi();
}
function syncAmbientUi() {
  const slider = document.getElementById('ambientSlider'), label = document.getElementById('ambientVal');
  if (slider) slider.value = String(Math.round(ambientVol * 100));
  if (label) label.textContent = `${Math.round(ambientVol * 100)}%`;
  if (typeof ambPanel !== 'undefined' && ambPanel) ambPanel.dirty = true;
}
function startAudio() {
  if (audio) { audio.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let b = 0; for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 3; } }
  const ambientGain = ctx.createGain(); ambientGain.gain.value = ambientVol; ambientGain.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = 0.22; master.connect(ambientGain);
  const mk = (pan, f, q) => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f; lp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(lp).connect(g).connect(p).connect(master); src.start(0, Math.random() * 3); return { g, lp };
  };
  const voices = [mk(-0.5, 700, 0.7), mk(0.5, 900, 0.7), mk(0, 380, 0.5)];
  // b6: breeze (band-passed noise, slow swell) + rare distant bird / cliff creak, quiet
  const amb = ctx.createGain(); amb.gain.value = 0.10; amb.connect(ambientGain);
  const wsrc = ctx.createBufferSource(); wsrc.buffer = buf; wsrc.loop = true; wsrc.playbackRate.value = 0.6;
  const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 420; wbp.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = 0;
  wsrc.connect(wbp).connect(wg).connect(amb); wsrc.start(0, Math.random() * 3);
  audio = { ctx, voices, wind: { g: wg, bp: wbp }, amb, ambientGain, nextCall: ctx.currentTime + 12 + Math.random() * 15 };
}
function distantCall() {
  const { ctx, amb } = audio, t0 = ctx.currentTime, pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(amb);
  if (Math.random() < 0.6) {           // far-off bird: two soft falling whistles
    for (let k = 0; k < 2; k++) { const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + k * 0.42;
      const f = 2100 + Math.random() * 500; o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 0.72, s + 0.3);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.05, s + 0.05); g.gain.exponentialRampToValueAtTime(0.0005, s + 0.34);
      o.connect(g).connect(pan); o.start(s); o.stop(s + 0.4); }
  } else {                             // soft low cliff creak
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t0); o.frequency.linearRampToValueAtTime(95, t0 + 0.9); lp.type = 'lowpass'; lp.frequency.value = 320;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 0.3); g.gain.linearRampToValueAtTime(0, t0 + 1.0);
    o.connect(lp).connect(g).connect(pan); o.start(t0); o.stop(t0 + 1.05);
  }
}
function tickAudio(t) {   // slow swells: each voice rises as the swash comes in, hisses down as it recedes
  if (!audio) return;
  const now = audio.ctx.currentTime;
  audio.voices.forEach((v, i) => {
    const ph = t * (0.34 + i * 0.04) + i * 2.1;
    const s = Math.max(0, Math.sin(ph)); const sw = Math.pow(s, 2.5) * 1.0 + 0.12;
    v.g.gain.setTargetAtTime(i === 2 ? 0.35 : sw, now, 0.15);
    v.lp.frequency.setTargetAtTime(300 + 1250 * sw, now, 0.2);
  });
  const w = 0.5 + 0.3 * Math.sin(t * 0.11) + 0.2 * Math.sin(t * 0.047 + 1.3);   // breeze rises and falls over ~10-60 s
  audio.wind.g.gain.setTargetAtTime(0.25 + 0.75 * w, now, 1.5);
  audio.wind.bp.frequency.setTargetAtTime(300 + 350 * w, now, 1.5);
  if (now > audio.nextCall) { distantCall(); audio.nextCall = now + 25 + Math.random() * 35; }
}

/* ---------------------------------------------------------- b11/b16: radio music menu (same player/panel + custom-track flow as the submarine scene) */
const PLACEHOLDER_TRACKS = [
  { name: 'Under the Ice', url: '../assets/music/under-the-ice.mp3', placeholder: true },
  { name: 'Vent Pulse', url: '../assets/music/vent-pulse.mp3', placeholder: true },
];
const player = new MusicPlayer({ tracks: PLACEHOLDER_TRACKS, volume: 0.5 });
const musicPanel = createMusicPanel(player, { width: 0.62, height: 0.4, theme: { moon: '#f1e9d8', inkSoft: '#a9b8b8', accent: '#f0b878', error: '#f0a58a' } });
musicPanel.mesh.visible = false; musicPanel.mesh.scale.setScalar(0.5 / 0.62); scene.add(musicPanel.mesh);   // drawn at the sub's 0.62 m layout, shown 0.5 m wide
const closeBtn = new CanvasPanel(0.05, 0.05, 1400, (ctx, p) => {
  const W = ctx.lw; ctx.fillStyle = p.hover === 'close' ? 'rgba(95,230,236,.3)' : 'rgba(7,11,20,.8)'; roundRect(ctx, 0, 0, W, W, W / 2); ctx.fill();
  ctx.strokeStyle = '#f1e9d8'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(W * .32, W * .32); ctx.lineTo(W * .68, W * .68); ctx.moveTo(W * .68, W * .32); ctx.lineTo(W * .32, W * .68); ctx.stroke();
  p.regions.push({ id: 'close', x: 0, y: 0, w: W, h: W }); });
closeBtn.mesh.position.set(0.31 - 0.012, 0.2 - 0.012, 0.004); musicPanel.mesh.add(closeBtn.mesh);
closeBtn.onPress = () => toggleMenu(false);
/* Ambient volume strip under the radio panel (own CanvasPanel — core/music.js is not edited).
   − / + in 10% steps, same language as the music volume row. */
const ambPanel = new CanvasPanel(0.62, 0.11, 1400, (ctx, p) => {
  const W = ctx.lw, H = ctx.lh, pad = 40, moon = '#f1e9d8', cy = H * 0.54, r = 36;
  ctx.fillStyle = 'rgba(7,11,20,.74)'; roundRect(ctx, 0, 0, W, H, 32); ctx.fill();
  ctx.strokeStyle = 'rgba(241,233,216,.18)'; ctx.lineWidth = 3; roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 31); ctx.stroke();
  ctx.fillStyle = '#a9b8b8'; ctx.font = '500 26px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('Ambient sounds', pad, H * 0.32);
  const xVu = W - pad - r, xVd = pad + r;
  circleBtn(ctx, p, 'ambdown', xVd, cy, r, ambientVol <= 0, (c, x, y, rr) => {
    c.strokeStyle = moon; c.lineWidth = rr * .12; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - rr * .38, y); c.lineTo(x + rr * .38, y); c.stroke();
  });
  circleBtn(ctx, p, 'ambup', xVu, cy, r, ambientVol >= 1, (c, x, y, rr) => {
    c.strokeStyle = moon; c.lineWidth = rr * .12; c.lineCap = 'round'; c.beginPath();
    c.moveTo(x - rr * .38, y); c.lineTo(x + rr * .38, y); c.moveTo(x, y - rr * .38); c.lineTo(x, y + rr * .38); c.stroke();
  });
  const mx0 = xVd + r + 14, mx1 = xVu - r - 14, my = cy;
  ctx.fillStyle = 'rgba(241,233,216,.2)'; roundRect(ctx, mx0, my - 5, mx1 - mx0, 10, 5); ctx.fill();
  ctx.fillStyle = moon; roundRect(ctx, mx0, my - 5, (mx1 - mx0) * ambientVol, 10, 5); ctx.fill();
  ctx.fillStyle = '#a9b8b8'; ctx.font = '400 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${Math.round(ambientVol * 100)}%`, (mx0 + mx1) / 2, my + 28);
});
ambPanel.mesh.position.set(0, -0.2 - 0.055 - 0.014, 0.001); musicPanel.mesh.add(ambPanel.mesh);
ambPanel.onPress = (id) => {
  if (id === 'ambdown') setAmbientVol(Math.round((ambientVol - 0.1) * 10) / 10);
  else if (id === 'ambup') setAmbientVol(Math.round((ambientVol + 0.1) * 10) / 10);
};
{
  const slider = document.getElementById('ambientSlider');
  if (slider) slider.addEventListener('input', () => setAmbientVol(Number(slider.value) / 100));
  syncAmbientUi();
}
/* Music queue (same as the submarine, test #5): a multi-file pick becomes the queue; choosing again APPENDS
   (placeholders are replaced by the first real pick). Lenient filter: some pickers (Quest/Android content URIs)
   report an empty MIME type, so anything with an audio/video type, a known audio extension, or no type at all
   is queued; files that turn out unplayable are skipped by the player. Tracks are blob URLs and do not persist
   across reloads. */
const fileInput = document.getElementById('musicInput'), trackList = document.getElementById('trackList');
const queueNote = document.getElementById('queueNote'), musicBtn = document.getElementById('musicBtn');
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|wav|wave|ogg|oga|opus|flac|webm|weba|mp4|aif|aiff|caf)$/i;
function updateEntryTracks() {
  trackList.innerHTML = '';
  player.list.forEach((tr, i) => {
    const li = document.createElement('li'); li.textContent = `${i + 1}. ${tr.name}`;
    if (tr.placeholder) { const s = document.createElement('span'); s.className = 'tag'; s.textContent = 'placeholder'; li.append(s); }
    trackList.append(li);
  });
}
function addFiles(list) {
  const files = [...list].filter((f) => f.type.startsWith('audio/') || f.type.startsWith('video/') || AUDIO_EXT.test(f.name) || !f.type);
  if (!files.length) { queueNote.textContent = 'No audio files in that selection.'; return 0; }
  const n = player.addTracks(files.map((f) => ({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) })));
  queueNote.textContent = `Queued ${files.length} file${files.length > 1 ? 's' : ''} · ${n} track${n > 1 ? 's' : ''} in the queue. Choosing again adds more.`;
  musicBtn.classList.remove('pulse'); console.info('[music] queued', files.length, 'files; queue length', n); updateEntryTracks(); return files.length;
}
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
document.getElementById('usePlaceholders').addEventListener('click', () => {
  player.setPlaylist(PLACEHOLDER_TRACKS); fileInput.value = '';
  queueNote.textContent = 'Placeholder tracks queued.'; updateEntryTracks();
});
updateEntryTracks();
/* '+ Add' on the in-VR music panel. A file picker must open from a user gesture and cannot show inside an
   immersive session on Quest, so in VR it ends the session (music pauses), returns to this page with the
   music button highlighted; pick files, then Enter VR again. On desktop the press arrives inside the
   pointer event, so the picker opens directly. */
let pendingAdd = false, resumeAfterAdd = false;
musicPanel.setOnAdd(() => {
  if (renderer.xr.isPresenting) { pendingAdd = true; resumeAfterAdd = player.playing; player.pause(); renderer.xr.getSession()?.end(); }
  else fileInput.click();
});
let analyser = null, levelBuf = null;
player.onChange(() => {                       // route the music through the scene's AudioContext once, for the glow level
  updateEntryTracks();
  if (!player.playing || analyser) return; startAudio(); const ctx = audio.ctx;
  const src = ctx.createMediaElementSource(player.audio); analyser = ctx.createAnalyser(); analyser.fftSize = 256; levelBuf = new Uint8Array(analyser.fftSize);
  src.connect(analyser); analyser.connect(ctx.destination);
});
function musicLevel() {
  if (!analyser || !player.playing) return 0; analyser.getByteTimeDomainData(levelBuf);
  let e = 0; for (let i = 0; i < levelBuf.length; i++) { const v = (levelBuf[i] - 128) / 128; e += v * v; } return Math.min(1, Math.sqrt(e / levelBuf.length) * 4);
}
const _mh = new THREE.Vector3(), _md = new THREE.Vector3(), _rp = new THREE.Vector3();
function toggleMenu(open = !musicPanel.mesh.visible) {
  musicPanel.mesh.visible = open; if (!open) return;
  if (!renderer.xr.isPresenting) { camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch); }
  rig.updateMatrixWorld(true); camera.getWorldPosition(_mh); camera.getWorldDirection(_md);
  if (!lying) { radioHit.getWorldPosition(_rp); _rp.y = _mh.y; const toR = _rp.sub(_mh).normalize(); _md.y = 0; _md.normalize().lerp(toR, 0.5).normalize(); _md.y = -0.35; _md.normalize(); }
  musicPanel.mesh.position.copy(_mh).addScaledVector(_md, 0.85);
  musicPanel.mesh.up.set(0, 1, 0); if (lying && renderer.xr.isPresenting) musicPanel.mesh.up.set(0, 1, 0).applyQuaternion(rig.quaternion);
  musicPanel.mesh.lookAt(_mh); musicPanel.dirty = true;
}
const _uiTargets = [closeBtn.mesh, ambPanel.mesh, musicPanel.mesh];
function menuRay() {                            // returns true when the ray was used by the music UI
  if (musicPanel.mesh.visible) {
    const h = raycaster.intersectObjects(_uiTargets, false)[0];
    if (h) { const P = h.object.userData.panel, r = P.hit(h.uv); if (r) P.press(r.id); return true; }
  }
  if (raycaster.intersectObject(radioHit, false)[0]) { toggleMenu(); return true; }
  return false;
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
// b10: walkable area - stay >= 12 m from the cliff wall (wall R 32 around (0,-3) -> head within 20 m of that centre)
// and no deeper than knee-depth past the waterline. Teleports land inside; walking out gets a soft ease-back.
const WALK = { cx: 0, cz: -3, r: 32 - 12, minZ: SHORE_Z - 0.6 };
function clampXZ(x, z) {
  let dx = x - WALK.cx, dz = z - WALK.cz; const d = Math.hypot(dx, dz);
  if (d > WALK.r) { dx *= WALK.r / d; dz *= WALK.r / d; }
  return [WALK.cx + dx, Math.max(WALK.minZ, WALK.cz + dz)];
}
const _hw = new THREE.Vector3();
function softBounds(dt) {
  if (lying) return;
  camera.getWorldPosition(_hw); const [x, z] = clampXZ(_hw.x, _hw.z);
  const ex = x - _hw.x, ez = z - _hw.z; if (ex === 0 && ez === 0) return;
  const k = 1 - Math.exp(-dt * 6);                            // ~0.4 s soft stop, no snap
  rig.position.x += ex * k; rig.position.z += ez * k;
}
function selectRay(o, d) {
  raycaster.set(o, d);
  if (menuRay()) return;                                       // b11: music menu / radio first
  if (lying) { fadeThen(standUp); return; }                   // any click while lying = stand up
  if (raycaster.intersectObject(hitPad, false)[0]) { fadeThen(lieDown); return; }
  const h = raycaster.intersectObject(sand, false)[0];        // click the sand = walk there
  if (h && h.distance < 25 && h.point.z > SHORE_Z + 0.5 && h.point.z < 14) fadeThen(() => {
    const head = new THREE.Vector3(); camera.getWorldPosition(head);
    const [tx, tz] = clampXZ(h.point.x, h.point.z);           // b10: teleport target kept in the walkable area
    rig.position.x += tx - head.x; rig.position.z += tz - head.z; });
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
  const c = document.createElement('canvas'); c.width = 2048; c.height = 64; const g = c.getContext('2d');
  g.font = '22px system-ui, sans-serif'; g.fillStyle = 'rgba(160,210,215,0.6)'; g.textAlign = 'center'; g.fillText(`Black Sand Beach · ${BUILD}`, 1024, 40);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.04), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, toneMapped: false }));
  lab.position.set(0, -0.42, -0.9); lab.rotation.x = -0.4; lab.renderOrder = 999; lab.visible = false; camera.add(lab);
  renderer.xr.addEventListener('sessionstart', () => {
    lab.visible = true; startAudio(); document.getElementById('overlay').classList.add('hidden');
    if (resumeAfterAdd) { resumeAfterAdd = false; player.play(); }
  });
  renderer.xr.addEventListener('sessionend', () => {
    lab.visible = false; standUp(); document.getElementById('overlay').classList.remove('hidden');
    if (pendingAdd) {
      pendingAdd = false; musicBtn.classList.add('pulse');
      queueNote.textContent = 'Choose more music to add to the queue, then Enter VR again.';
    }
  });
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
  softBounds(Math.min(0.1, (now - (window.__lastFrame ?? now)) / 1000)); window.__lastFrame = now;
  if (!renderer.xr.isPresenting) { camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch); }
  else pollPads();
  camera.getWorldPosition(_p); skyRig.position.copy(_p);
  ledMat.opacity = 0.55 + 0.35 * Math.sin(t * 0.8);
  if (musicPanel.mesh.visible) { musicPanel.refresh(now); closeBtn.refresh(now); ambPanel.refresh(now); }
  glowU.uLevel.value += (musicLevel() - glowU.uLevel.value) * 0.15;
  tickShip(t); tickMeteors(t);
  tickAudio(t);
  renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

window.__beach = { camera, rig, scene, renderer, lieDown, standUp, snapTurn,
  look: (y, p = 0) => { yaw = y; pitch = p; },
  setPos: (x, y, z) => { rig.position.set(x, 0, z); rig.quaternion.identity(); camera.position.set(0, y, 0); },
  toggleMenu, player, musicPanel, addFiles, setAmbientVol, ship, SHIP,
  get lying() { return lying; }, get pendingAdd() { return pendingAdd; },
  get ambientVol() { return ambientVol; },
  get ambientGain() { return audio && audio.ambientGain ? audio.ambientGain.gain.value : null; } };
