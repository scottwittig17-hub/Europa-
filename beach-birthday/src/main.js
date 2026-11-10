// Black Sand Beach — Night. Standalone WebXR prototype (three r160, same CDN import map as /surface/).
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MusicPlayer, createMusicPanel } from '../../core/music.js';   // b11: the submarine scene's music player + panel
import { CanvasPanel, roundRect } from '../../core/panels.js';

const BUILD = 'Build Nov 10 Birthday Beach (test)';
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
const GAL_DIR = dirFrom(42, 39), GAL_ROT = deg(-18), GAL_W = 16, GAL_ASPECT = 783 / 1400;
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
  const D = 1650, w = 2 * D * Math.tan(deg(GAL_W) / 2), h = w * GAL_ASPECT;   // b8: beyond the 1500 m star sphere, same angular size
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: gTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(0.55, 0.55, 0.55) }));
  m.position.copy(GAL_DIR).multiplyScalar(D); m.lookAt(0, 0, 0); m.rotateZ(GAL_ROT);
  m.renderOrder = -12; m.frustumCulled = false; skyRig.add(m);   // b8: drawn before (behind) the stars
}

/* ---------------------------------------------------------- birthday: "Happy Birthday, Scott" in pinpoint stars (sky-fixed, fades in) */
const bdayU = { uPx: { value: renderer.getPixelRatio() }, uFade: { value: 0 } };
{
  // baked Cormorant Garamond Light Italic, Poisson-sampled; a constellation, not a glow sign
  const BDAY_DOTS = new Float32Array([0.3616,0.7709,0.9,0.5117,0.1049,0.801,0.5124,0.2699,0.9,0.8134,0.1903,0.9,0.7418,0.1786,0.9,0.4277,0.9417,0.9,0.2076,0.1495,0.9,0.6454,0.9068,0.9,0.0288,0.167,0.9,0.6516,0.1942,0.9,0.465,0.2738,0.9,0.6952,0.2524,0.9,0.5941,0.1689,0.9,0.098,0.101,0.9,0.6695,0.1592,0.9,0.5093,0.0485,1.0,0.5062,0.866,0.773,0.5941,0.2427,0.537,0.126,0.2874,0.477,0.6509,0.8408,0.9,0.6532,0.9806,0.9,0.5132,0.068,1.0,0.6796,0.8175,0.51,0.6446,0.2117,1.0,0.3593,0.9922,0.9,0.486,0.0427,0.9,0.4743,0.1029,1.0,0.0249,0.2311,0.9,0.5513,0.1592,0.9,0.8072,0.2252,0.9,0.8204,0.0816,0.9,0.7605,0.268,0.9,0.1687,0.1806,0.9,0.6423,0.2427,0.9,0.6516,0.8194,0.9,0.0218,0.3049,0.9,0.5956,0.8136,0.9,0.2683,0.2602,0.9,0.8834,0.2291,0.9,0.0988,0.1456,0.546,0.5964,0.2039,0.732,0.8857,0.2505,0.9,0.3414,0.9087,0.557,0.9907,0.3087,1.0,0.696,0.1942,0.9,0.6477,0.1612,0.9,0.5583,0.8505,0.9,0.4751,0.3068,0.9,0.1205,0.2816,0.9,0.4767,0.8272,0.62,0.5949,0.833,1.0,0.1345,0.1786,0.518,0.5964,0.9845,0.9,0.6446,0.3049,0.9,0.5933,0.8738,0.9,0.5848,0.9126,0.664,0.5311,0.9942,1.0,0.6446,0.9748,0.9,0.3126,0.1748,0.537,0.937,0.2019,0.9,0.6532,0.8874,0.9,0.3919,0.1631,0.9,0.9044,0.4117,0.9,0.7022,0.2311,0.885,0.2348,0.2777,0.9,0.9658,0.233,0.622,0.3655,0.7942,0.9,0.6905,0.3126,1.0,0.7348,0.1825,0.479,0.5894,0.932,0.9,0.514,0.235,0.9,0.6509,0.9534,0.455,0.8165,0.1689,0.9,0.4152,0.6932,0.9,0.0327,0.0466,0.9,0.1252,0.2388,0.9,0.6446,0.2602,0.9,0.626,0.8078,0.9,0.5023,0.9417,0.9,0.9432,0.2641,0.9,0.5148,0.2019,0.9,0.6485,0.2291,0.9,0.7068,0.0757,0.9,0.2006,0.2757,0.9,0.4393,0.9748,0.9,0.5202,0.2097,0.9,0.4129,0.7359,0.9,0.3196,0.4058,0.424,0.9689,0.1398,0.801,0.1672,0.1437,0.9,0.6532,0.3068,0.9,0.3561,0.1845,0.9,0.5505,0.2175,0.9,0.6812,0.8019,0.9,0.3849,0.8291,0.9,0.3857,0.9845,1.0,0.7084,0.0369,0.9,0.8826,0.2078,0.867,0.3639,0.2447,0.9,0.2061,0.2175,0.9,0.0334,0.0971,0.9,0.7107,0.1825,0.9,0.3927,0.8408,0.9,0.8865,0.1612,0.9,0.5163,0.8175,0.9,0.7333,0.2913,0.9,0.2667,0.3456,0.9,0.0894,0.2175,0.9,0.612,0.8117,0.9,0.2947,0.1553,0.674,0.9432,0.2816,0.9,0.4409,0.8291,0.9,0.5669,0.2796,0.9,0.7387,0.1437,0.783,0.6423,0.9456,0.732,0.9393,0.3379,0.9,0.3694,0.699,0.9,0.4798,0.0932,0.674,0.3997,0.8641,0.9,0.2893,0.299,0.9,0.7037,0.0951,1.0,0.2504,0.2,0.9,0.5886,0.2233,0.9,0.2037,0.299,0.9,0.8608,0.1612,0.9,0.8779,0.2874,0.636,0.2465,0.1883,0.9,0.7154,0.0155,0.864,0.318,0.167,0.9,0.8429,0.2117,0.508,0.7737,0.1806,0.76,0.4938,0.3068,0.877,0.9378,0.1845,0.826,0.3398,0.1437,0.9,0.1283,0.3068,0.9,0.5226,0.9903,0.9,0.4401,0.8583,0.514,0.4751,0.0505,0.9,0.3523,0.3728,1.0,0.0264,0.1845,0.9,0.2636,0.3243,0.9,0.5078,0.8369,1.0,0.465,0.3049,0.9,0.4378,0.8816,0.655,0.5288,0.7942,0.419,0.5925,0.1864,0.9,0.4759,0.165,0.9,0.1019,0.0718,0.9,0.0832,0.2602,0.9,0.3445,0.9709,0.9,0.1376,0.3029,0.9,0.4697,0.2019,0.9,0.1983,0.2893,0.9,0.5521,0.8078,1.0,0.7838,0.3049,1.0,0.1967,0.3612,0.9,0.7799,0.165,0.51,0.6571,0.8272,0.9,0.8383,0.2466,1.0,0.1703,0.2078,0.9,0.4681,0.1553,0.9,0.2037,0.233,0.9,0.2395,0.268,0.9,0.8468,0.2971,0.9,0.2737,0.2718,0.907,0.5365,0.1709,0.9,0.7084,0.0078,0.869,0.7138,0.0427,0.533,0.0218,0.2019,0.9,0.112,0.0466,0.9,0.5451,0.3049,0.9,0.3756,0.8078,0.9,0.1656,0.2563,0.9,0.7348,0.1592,0.9,0.4829,0.8175,0.9,0.8017,0.1417,0.9,0.958,0.2602,0.646,0.8219,0.1049,0.9,0.6804,0.965,0.763,0.6236,0.1612,0.9,0.5047,0.9184,0.781,0.6516,0.9961,0.9,0.7963,0.2738,0.826,0.2333,0.1515,0.9,0.36,0.3126,0.9,0.5879,0.1573,0.712,0.8733,0.2583,0.9,0.3344,0.4155,0.9,0.3056,0.2738,0.89,0.0179,0.2718,0.9,0.8709,0.1456,0.9,0.1198,0.3049,0.9,0.8981,0.4272,0.867,0.8406,0.2854,0.9,0.8196,0.1495,0.9,0.1944,0.4039,0.9,0.5972,0.2214,0.729,0.4044,0.9437,0.798,0.2115,0.1689,0.872,0.1314,0.1981,0.9,0.8079,0.1515,0.9,0.8414,0.2621,0.9,0.0319,0.132,0.9,0.9184,0.1476,0.9,0.0995,0.1184,0.9,0.3274,0.4214,1.0,0.7372,0.2447,0.9,0.6128,0.1515,0.729,0.696,0.2175,0.9,0.8904,0.1981,0.9,0.4689,0.1825,0.9,0.7193,0.1592,0.9,0.0327,0.1165,0.9,0.2442,0.233,0.9,0.6547,0.8544,0.9,0.1967,0.334,0.9,0.1058,0.0485,0.9,0.8289,0.0117,0.9,0.4697,0.9864,0.861,0.2652,0.3864,0.9,0.6089,0.1689,0.9,0.1633,0.2932,0.9,0.8585,0.2932,0.9,0.6921,0.2816,0.9,0.3585,0.2951,0.869,0.2745,0.1825,0.9,0.8818,0.3107,0.9,0.7722,0.3068,0.9,0.6003,0.7709,0.686,0.2053,0.1748,0.9,0.5871,0.8854,0.9,0.2706,0.4136,0.9,0.6967,0.0252,0.9,0.2667,0.365,0.9,0.5575,0.3049,0.508,0.5412,0.8039,0.9,0.5622,0.8816,0.9,0.3771,0.9903,0.9,0.7659,0.2563,0.9,0.7037,0.1748,0.892,0.853,0.299,0.9,0.1501,0.1534,0.9,0.2193,0.1515,1.0,0.5925,0.8,1.0,0.4689,0.2175,0.9,0.5513,0.3107,1.0,0.1975,0.2544,0.525,0.1267,0.2155,0.9,0.2815,0.1282,0.9,0.3585,0.7223,0.9,0.3631,0.2214,0.979,0.7263,0.1534,0.9,0.5894,0.2757,0.9,0.4432,0.9922,1.0,0.0529,0.1709,0.9,0.0918,0.132,0.761,0.9355,0.2272,0.9,0.2675,0.3087,1.0,0.5008,0.1534,0.778,0.5544,0.8641,0.9,0.0529,0.0466,0.813,0.556,0.8796,0.9,0.1431,0.2951,0.887,0.3484,0.9825,0.9,0.5202,0.0951,0.712,0.6874,0.8039,0.9,0.4051,0.6777,0.9,0.8383,0.299,0.9,0.5863,0.2971,1.0,0.5529,0.8388,0.9,0.8344,0.2835,0.65,0.1742,0.3049,0.584,0.2442,0.2078,0.892,0.189,0.3903,0.9,0.7068,0.0583,0.9,0.8896,0.301,0.9,0.4067,0.9068,0.9,0.5482,0.9573,0.679,0.9246,0.1398,0.43,0.6159,0.9728,0.9,0.4689,0.2369,0.9,0.9176,0.4078,0.9,0.9813,0.3786,0.604,0.0949,0.1786,0.9,0.4557,0.9922,0.9,0.3919,0.6757,0.9,0.4471,0.8136,0.892,0.5498,0.2466,0.9,0.2722,0.2447,0.9,0.8079,0.3107,0.9,0.9642,0.1495,0.9,0.5879,0.2466,0.9,0.2162,0.299,0.9,0.0816,0.2951,0.9,0.4728,0.1184,0.9,0.9953,0.2874,0.9,0.3974,0.9029,0.62,0.8165,0.1262,0.9,0.2768,0.2078,0.9,0.5638,0.8563,0.801,0.5816,0.9709,0.9,0.4689,0.1379,0.724,0.1952,0.3184,0.9,0.4331,0.9767,0.882,0.3118,0.2602,0.9,0.3616,0.7553,0.9,0.5607,0.066,0.9,0.4969,0.9262,0.9,0.8243,0.0583,0.9,0.2449,0.1573,0.9,0.2496,0.2252,0.435,0.5016,0.8854,0.9,0.0397,0.0544,0.9,0.8896,0.2175,0.856,0.3165,0.2117,0.9,0.3523,0.1709,1.0,0.3079,0.1592,0.51,0.0871,0.2039,1.0,0.2823,0.1689,0.525,0.8103,0.2816,0.9,0.5933,0.8932,0.9,0.5614,0.2932,0.9,0.4339,0.9146,0.9,0.8686,0.2757,0.781,0.5894,0.8563,0.9,0.9697,0.2078,0.595,0.3663,0.3282,0.877,0.2092,0.3049,0.9,0.6991,0.1456,0.688,0.2138,0.1243,0.9,0.0964,0.3049,0.522,0.6617,0.7942,0.618,0.993,0.334,0.9,0.1687,0.1592,0.9,0.2589,0.3806,0.861,0.3616,0.7379,0.9,0.7722,0.2,0.655,0.9222,0.3961,0.9,0.7652,0.3087,0.751,0.493,0.1553,0.736,0.3888,0.2097,0.9,0.8849,0.1825,0.686,0.0747,0.3087,0.9,0.598,0.8485,0.613,0.042,0.167,0.9,0.8787,0.2699,0.471,0.8554,0.1786,0.892,0.6617,0.1553,0.9,0.7628,0.2816,0.9,0.3655,0.2835,0.729,0.4782,0.967,0.9,0.7379,0.3049,0.9,0.4323,0.8932,0.9,0.7395,0.2233,1.0,0.8398,0.2272,0.566,0.5754,0.165,0.622,0.4393,0.9553,0.9,0.556,0.9087,0.9,0.9386,0.3029,0.9,0.332,0.1612,0.9,0.2963,0.299,0.705,0.3795,0.6816,1.0,0.6944,0.268,0.9,0.6384,0.2796,0.419,0.5233,0.8,0.529,0.374,0.8291,0.9,0.5117,0.1301,0.9,0.7294,0.3107,0.43,0.6649,0.8136,0.544,0.6019,0.7903,0.841,0.458,0.3029,0.9,0.3204,0.1845,0.9,0.9705,0.1903,0.9,0.0894,0.2971,0.736,0.5039,0.2854,0.9,0.6633,0.3029,0.655,0.0879,0.2466,0.9,0.9953,0.3495,0.449,0.5443,0.2641,0.746,0.5078,0.9612,1.0,0.6462,0.2854,0.9,0.1625,0.2757,0.9,0.318,0.4252,0.577,0.584,0.2835,0.887,0.5482,0.1437,0.609,0.6493,0.934,0.9,0.3173,0.2311,0.9,0.703,0.134,0.9,0.591,0.2602,0.9,0.5902,0.9495,0.9,0.7356,0.2019,0.9,0.661,0.9922,0.9,0.3593,0.2,0.9,0.8118,0.235,0.9,0.7294,0.2718,0.879,0.3383,0.9534,0.9,0.7869,0.2874,0.739,0.3561,0.3573,0.9,0.6788,0.1476,0.715,0.5109,0.1864,0.9,0.5109,0.9806,0.9,0.7621,0.2369,0.9,0.3608,0.3417,0.9,0.6477,0.8757,0.9,0.5956,0.1495,0.9,0.7675,0.2951,0.9,0.6493,0.8039,0.9,0.5544,0.9359,0.9,0.605,0.8117,0.9,0.4145,0.7184,0.9,0.0171,0.2544,0.463,0.5163,1.0,0.653,0.0925,0.1573,0.9,0.3593,0.2544,0.9,0.5467,0.2291,0.441,0.8834,0.1437,0.9,0.5894,0.1417,0.669,0.556,0.1767,0.9,0.437,0.9359,0.9,0.5537,0.0641,0.9,0.1633,0.3087,0.9,0.2045,0.4175,0.544,0.4588,0.8019,0.717,0.8942,0.1417,0.9,0.5886,0.9922,0.9,0.6205,0.8,0.838,0.8468,0.2,1.0,0.5599,0.8252,0.9,0.3694,0.3107,0.9,0.2659,0.1922,0.861,0.4012,0.9165,0.9,0.3841,0.2408,0.9,0.3888,0.8621,0.9,0.6579,0.7825,0.522,0.605,0.9845,0.9,0.8764,0.1398,0.727,0.1244,0.2563,0.897,0.8274,0.033,1.0,0.0373,0.0854,0.579,0.6703,0.9786,1.0,0.5513,0.1864,0.9,0.2729,0.2932,0.9,0.2753,0.1612,0.9,0.7442,0.2932,0.816,0.535,0.7922,0.741,0.4339,0.8621,0.9,0.4292,0.9573,0.9,0.5,0.2971,0.9,0.3561,0.7476,0.9,0.5505,0.8233,0.9,0.811,0.2097,1.0,0.3981,0.8485,0.9,0.4992,0.8699,0.544,0.028,0.2097,0.9,0.8258,0.0738,0.869,0.4642,0.2466,0.9,0.8204,0.299,0.52,0.3966,0.9631,0.9,0.3663,0.9981,0.854,0.7053,0.1553,1.0,0.6423,0.1534,0.9,0.0754,0.1709,0.9,0.8064,0.2951,0.9,0.1563,0.2485,0.749,0.4751,0.134,0.9,0.2737,0.2214,0.9,0.4269,0.9165,0.9,0.9984,0.3282,0.9,0.951,0.2951,0.9,0.895,0.2913,1.0,0.6633,0.7709,0.707,0.3453,0.1515,0.9,0.591,0.2097,0.9,0.1602,0.233,0.816,0.1936,0.3476,0.9,0.2535,0.4252,0.559,0.818,0.0175,0.9,0.409,0.699,0.9,0.4829,0.8,0.756,0.8935,0.1709,0.477,0.9432,0.3223,0.9,0.3476,0.3864,0.9,0.8056,0.268,0.9,0.5467,0.2874,0.9,0.7519,0.2757,0.42,0.8266,0.2777,0.861,0.3616,0.8058,0.9,0.2636,0.4214,0.593,0.7092,0.0893,0.9,0.0156,0.2893,0.9,0.4798,0.0777,0.9,0.7683,0.2155,0.9,0.3857,0.1456,0.9,0.3056,0.1437,1.0,0.3546,0.7883,0.508,0.3865,0.8485,0.9,0.4082,0.8913,1.0,0.7045,0.1165,0.9,0.7294,0.1398,0.693,0.4495,0.9806,0.9,0.2823,0.3068,0.9,0.4448,0.3049,0.432,0.5809,0.1592,0.9,0.1003,0.0544,0.9,0.9728,0.1515,0.867,0.7309,0.2563,0.9,1.0,0.3107,0.669,0.5591,0.1573,0.469,0.5832,0.934,0.674,0.168,0.2272,0.9,0.5435,0.9748,0.9,0.2076,0.1883,0.9,0.7068,0.1942,0.593,0.6711,0.8019,1.0,0.93,0.1806,0.9,0.4961,0.9068,0.895,0.6524,0.134,0.811,0.6182,0.1456,0.9,0.6019,0.1942,0.743,0.7939,0.1476,0.9,0.9393,0.2524,0.9,0.2037,0.2505,0.9,0.5054,0.1786,0.9,0.3733,0.2971,0.9,0.8009,0.2524,0.9,0.7325,0.2311,0.9,0.8118,0.0252,0.9,0.5614,0.899,0.9,0.9331,0.1631,0.9,0.3981,0.6718,0.717,0.0816,0.1709,0.9,0.5591,0.9223,1.0,0.3919,0.1417,0.897,0.5614,0.0816,0.9,0.5023,0.9786,1.0,0.7037,0.0214,0.897,0.1555,0.1456,0.9,0.276,0.1437,0.9,0.3118,0.1437,0.861,0.9347,0.3631,0.9,0.2613,0.3515,0.9,0.1454,0.2816,1.0,0.2271,0.1553,0.43,0.7037,0.2136,0.9,0.3523,0.1961,0.506,0.4044,0.8777,0.9,0.3655,0.7204,0.9,0.1765,0.1534,0.856,0.6882,0.2932,0.808,0.3787,0.8408,0.9,0.3554,0.7728,0.9,0.1781,0.4233,0.9,0.0645,0.167,0.9,0.5187,0.0757,1.0,0.395,0.8777,0.9,0.0303,0.0757,1.0,0.2496,0.1748,0.9,0.196,0.1922,0.861,0.5023,0.0485,0.529,0.7426,0.1631,0.648,0.5552,0.1456,0.9,0.1524,0.268,1.0,0.9269,0.3806,0.859,0.8095,0.2485,0.9,0.7869,0.1573,1.0,0.8445,0.3126,0.9,0.0941,0.2078,0.758,0.9689,0.1728,0.9,0.4533,0.8078,0.62,0.8779,0.2427,0.546,0.4736,0.8019,0.9,0.909,0.1689,0.449,0.9067,0.4252,0.9,0.654,0.1689,0.681,0.1198,0.2447,0.879,0.028,0.1437,0.9,0.3569,0.2252,0.9,0.591,0.965,0.674,0.7356,0.2757,0.89,0.388,0.1922,0.9,0.5568,0.1922,0.771,0.3017,0.2874,1.0,0.6509,0.2136,0.627,0.591,0.9087,0.9,0.0249,0.2505,0.9,0.1804,0.2893,0.885,0.4596,0.2874,0.9,0.9401,0.2175,0.9,0.9883,0.2951,0.9,0.4969,0.0427,0.9,0.1851,0.4194,0.9,0.8142,0.1553,0.9,0.0964,0.066,0.9,0.3398,0.3961,0.771,0.2823,0.1515,0.655,0.3398,0.9806,0.9,0.5054,0.1379,0.9,0.584,0.9515,0.9,0.7776,0.299,0.9,0.5863,0.8097,0.42,0.4285,0.8816,0.579,0.8134,0.3049,0.9,0.3896,0.9689,0.439,0.4969,0.9534,0.555,0.1913,0.3709,0.9,0.3647,0.268,0.9,0.5202,0.235,0.487,0.4658,0.8,0.9,0.3523,0.1553,0.9,0.6384,0.2971,0.42,0.6711,0.2874,0.9,0.2698,0.3243,0.791,0.5871,0.9767,1.0,0.2582,0.4155,1.0,0.6252,0.1456,0.846,0.0925,0.2311,0.688,0.0879,0.1728,0.9,0.8351,0.266,0.773,0.4743,0.1495,0.9,0.168,0.2427,1.0,0.4821,0.0602,0.9,0.0226,0.0447,0.9,0.3935,0.1864,0.71,0.035,0.1709,0.9,0.1734,0.1942,0.9,0.5513,0.2019,0.9,0.9557,0.2757,0.9,0.902,0.2777,0.512,0.0863,0.0447,0.9,0.4635,0.2233,0.9,0.2792,0.1942,0.965,0.2636,0.4039,0.9,0.0972,0.0835,0.9,0.5365,0.9864,0.9,0.2387,0.1456,0.9,0.3616,0.7068,0.821,0.6547,0.1515,0.9,0.6983,0.1689,0.9,0.3585,0.2757,0.9,0.0358,0.068,0.9,0.3981,0.9379,0.9,0.6454,0.1883,0.616,0.007,0.3068,0.9,0.4611,0.0427,0.736,0.2418,0.2524,0.9,0.1446,0.1592,0.9,0.9899,0.3592,0.9,0.1944,0.3845,0.9,0.0295,0.3087,0.9,0.3398,0.9379,0.9,0.3266,0.4058,1.0,0.0194,0.2214,0.465,0.8857,0.2893,0.551,0.4627,0.9825,0.445,0.3678,0.8136,0.9,0.3756,0.2796,0.773,0.5513,0.266,0.6,0.0949,0.0447,1.0,0.6524,0.9087,0.9,0.9261,0.167,0.9,0.402,0.8932,0.9,0.8857,0.2718,0.803,0.5101,0.2466,0.548,0.4837,0.833,0.786,0.1843,0.2777,0.512,0.5124,0.2175,0.9,0.1983,0.4155,0.9,0.0871,0.2796,0.9,0.5412,0.1612,0.9,0.5529,0.2311,0.9,0.6936,0.2369,0.9,0.2022,0.2019,0.9,0.3865,0.2233,0.9,0.2986,0.1437,0.882,0.3546,0.2097,0.9,0.5863,0.3126,0.806,0.6485,0.8583,0.593,0.2753,0.3068,0.9,0.5101,0.1689,0.89,0.804,0.2388,0.9,0.1765,0.1379,0.9,0.6563,0.1165,0.808,0.0008,0.3087,0.885,0.3865,0.1689,0.9,0.486,0.165,0.9,0.084,0.3087,0.9,0.7138,0.1689,0.9,0.9432,0.2408,0.433,0.4736,0.0816,0.9,0.8888,0.235,0.477,0.2675,0.2757,0.9,0.5016,0.8563,0.51,0.0218,0.2835,0.9,0.3523,0.9942,0.9,0.0933,0.1126,0.895,0.1641,0.2155,0.9,0.3142,0.1922,0.793,0.1742,0.1709,0.9,0.8227,0.0078,0.914,0.4844,0.3107,0.877,0.5179,0.1126,0.872,0.3639,0.301,0.9,0.8219,0.134,0.433,0.5544,0.0854,0.669,0.9611,0.2447,0.778,0.4362,0.8427,1.0,0.5171,0.1883,0.9,0.3126,0.2427,0.9,0.4992,0.1709,0.717,0.6477,0.8932,0.9,0.0925,0.1922,0.9,0.1174,0.268,0.874,0.0132,0.3049,0.9,0.1617,0.1553,0.522,0.3849,0.6757,0.9,0.4059,0.9262,0.9,0.381,0.2641,0.89,0.5622,0.8388,0.9,0.6571,0.8039,0.9,0.2885,0.1573,0.9,0.2247,0.2951,0.821,0.4316,0.9301,0.9,0.6485,0.2485,0.512,0.937,0.2816,0.9,0.4518,0.3087,0.9,0.381,0.8175,0.9,0.4673,0.2602,0.9,0.9114,0.1515,0.828,0.937,0.3184,0.698,0.5047,0.9029,0.477,0.0194,0.2388,0.9,0.9487,0.3107,0.9,0.6407,0.9631,0.439,0.6446,0.9243,0.9,0.5124,0.0835,0.622,0.2652,0.2932,0.861,0.5163,0.2485,0.9,0.1928,0.4214,0.683,0.9114,0.4058,0.9,0.7411,0.1942,0.9,0.5086,0.9942,0.422,0.2131,0.1437,0.489,0.5163,0.0544,0.441,0.4689,0.0466,0.869,0.5941,0.9981,0.895,0.6431,0.8078,0.854,0.2014,0.1864,0.867,0.8958,0.4117,0.497,0.6198,0.9592,0.465,0.0855,0.2311,0.9,0.4611,0.2621,0.9,0.5467,0.7961,0.9,0.2768,0.4136,0.643,0.6011,0.9961,0.546,0.2426,0.1748,0.787,0.1182,0.0466,0.897,0.7162,0.0,0.65,0.7014,0.2,0.9,0.1882,0.4058,0.9,0.2838,0.1126,0.9,0.9285,0.1534,1.0,0.6446,0.9903,0.892,0.0467,0.0485,0.667,0.3733,0.6854,0.9,0.6182,0.8155,1.0,0.944,0.2971,0.768,0.2582,0.3961,0.9,0.4487,0.9981,0.768,0.7597,0.2524,0.604,0.6563,0.8738,0.437,0.0264,0.1243,0.568,0.6944,0.299,0.9,0.1392,0.167,0.676,0.2309,0.2893,0.9,0.3212,0.2,0.9,0.7605,0.2951,0.595,0.0894,0.266,0.9,0.7675,0.2311,0.9,0.8647,0.2874,0.618,0.8118,0.2621,0.877,0.4114,0.6796,0.841,0.9844,0.3068,0.43,0.2473,0.4233,0.882,0.5459,0.8136,0.9,0.2714,0.1981,0.443,0.8663,0.1553,0.9,0.4642,0.2078,0.895,0.0241,0.268,0.803,0.028,0.1068,1.0,0.0661,0.3068,0.588,0.5537,0.9515,0.781,0.1952,0.3029,0.9,0.0303,0.0602,0.648,0.3173,0.1515,0.833,0.8227,0.0427,0.9,0.8165,0.2039,0.611,0.168,0.2699,0.892,0.2084,0.2039,0.786,0.8103,0.167,0.977,0.4658,0.2893,0.9,0.0591,0.1728,0.9,0.2084,0.134,0.435,0.3445,0.9534,0.625,0.4269,0.899,0.562,0.8149,0.2214,0.816,0.6112,0.9825,0.813,0.7372,0.2602,0.518,0.7333,0.2155,0.688,0.1664,0.1942,0.823,0.7092,0.1049,0.634,0.1026,0.0893,0.611,0.6477,0.1437,0.508,0.8787,0.1534,0.864,0.1998,0.2194,0.422,0.5171,0.9825,0.9,0.6423,0.2272,0.439,0.7006,0.2466,0.719,0.161,0.1398,0.885,0.8515,0.1903,0.9,0.5848,0.2641,0.435,0.0327,0.1534,0.475,0.8437,0.2408,0.562,0.3717,0.7961,0.897,0.5016,0.9631,0.9,0.937,0.266,0.9,0.7123,0.0641,0.531,0.2006,0.3126,0.831,0.6726,0.1456,0.602,0.9331,0.2136,0.808,0.6065,0.1825,0.741,0.598,0.1806,0.627,0.8919,0.1553,0.9,0.3569,0.2408,0.9,0.437,0.9883,0.42,0.1687,0.299,0.9,0.3274,0.1728,0.455,0.965,0.2175,0.724,0.3585,0.3282,0.686,0.5109,0.8233,0.546,0.8142,0.1398,0.525,0.9316,0.1961,0.9,0.4759,0.066,0.9,0.9868,0.3728,0.984,0.8165,0.1107,0.62,0.6734,0.8155,0.533,0.2691,0.2311,0.455,0.5062,0.2718,0.606,0.1322,0.2951,0.604,0.0241,0.1573,0.566,0.4448,0.9689,0.463,0.339,0.9223,0.9]);
  const N = BDAY_DOTS.length / 3;
  const YAW0 = 0, ELEV0 = 23, YAW_SPAN = 30;          // degrees, straight ahead over the water, under the moons
  const ELEV_SPAN = YAW_SPAN / 2.4970873786407766;    // preserve letter aspect (~12°)
  const D = 1500;
  const pos = new Float32Array(N * 3), mag = new Float32Array(N), col = new Float32Array(N * 3);
  let s = 19; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const u = BDAY_DOTS[i * 3], v = BDAY_DOTS[i * 3 + 1], m = BDAY_DOTS[i * 3 + 2];
    const yaw = YAW0 + (u - 0.5) * YAW_SPAN;
    const elev = ELEV0 + (0.5 - v) * ELEV_SPAN;
    const d = dirFrom(yaw, elev);
    pos.set([d.x * D, d.y * D, d.z * D], i * 3);
    mag[i] = m;
    const k = r();
    const c = k < 0.12 ? [1, 0.92, 0.78] : k < 0.3 ? [0.92, 0.95, 1] : [1, 1, 1];
    col.set(c, i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: bdayU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float mag; attribute vec3 color; varying float vB; varying vec3 vC; uniform float uPx, uFade;
      void main(){ vB = (0.35 + 1.35*mag) * uFade; vC = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        gl_PointSize = (1.15 + 1.35*mag) * uPx; }`,
    fragmentShader: `varying float vB; varying vec3 vC;
      void main(){ vec2 c = gl_PointCoord-0.5; float a = smoothstep(0.42, 0.12, length(c));
        gl_FragColor = vec4(vC*vB*a, 1.0); }`
  });
  const stars = new THREE.Points(g, mat); stars.frustumCulled = false; stars.renderOrder = -9; skyRig.add(stars);
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

/* ---------------------------------------------------------- birthday: fireflies + a few warm lanterns (over water and blanket) */
{
  // one Points mesh, shader-drifted — no per-frame buffer writes (Quest-friendly)
  const flies = [];
  let s = 23; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const LIE_CLEAR = { x: -0.35, y: 0.4, z: -2.4, r: 0.85 };   // keep clear of the lying-down head
  const farEnough = (x, y, z) => {
    const dx = x - LIE_CLEAR.x, dy = y - LIE_CLEAR.y, dz = z - LIE_CLEAR.z;
    return dx * dx + dy * dy + dz * dz > LIE_CLEAR.r * LIE_CLEAR.r;
  };
  // around the blanket: sides and foot end, below standing eye height
  for (let i = 0, n = 0; i < 220 && n < 18; i++) {
    const x = -2.2 + r() * 4.4, z = -4.55 + r() * 2.5, y = 0.35 + r() * 1.05;
    if (!farEnough(x, y, z)) continue;
    flies.push({ x, y, z, amp: 0.12 + r() * 0.22, ampY: 0.06 + r() * 0.10, spd: 0.22 + r() * 0.28, ph: r() * 6.28, size: 0.040 + r() * 0.020, kind: 0 });
    n++;
  }
  // sand between the blanket and the shore
  for (let i = 0; i < 14; i++) {
    const x = (r() * 2 - 1) * 8, z = -5.0 - r() * 9.0, y = 0.4 + r() * 1.5;
    flies.push({ x, y, z, amp: 0.18 + r() * 0.30, ampY: 0.08 + r() * 0.14, spd: 0.18 + r() * 0.25, ph: r() * 6.28, size: 0.045 + r() * 0.022, kind: 0 });
  }
  // over the near water
  for (let i = 0; i < 40; i++) {
    const x = (r() * 2 - 1) * 14, z = -15.5 - r() * 28, y = 0.45 + r() * 2.2;
    flies.push({ x, y, z, amp: 0.25 + r() * 0.45, ampY: 0.10 + r() * 0.18, spd: 0.14 + r() * 0.22, ph: r() * 6.28, size: 0.055 + r() * 0.025, kind: 0 });
  }
  // a few slightly larger, slower lanterns farther out over the water
  for (let i = 0; i < 8; i++) {
    const x = (r() * 2 - 1) * 16, z = -20 - r() * 30, y = 1.6 + r() * 2.6;
    flies.push({ x, y, z, amp: 0.35 + r() * 0.50, ampY: 0.08 + r() * 0.14, spd: 0.08 + r() * 0.10, ph: r() * 6.28, size: 0.130 + r() * 0.050, kind: 1 });
  }
  const N = flies.length;
  const pos = new Float32Array(N * 3), aPh = new Float32Array(N), aSpd = new Float32Array(N);
  const aAmp = new Float32Array(N), aAmpY = new Float32Array(N), aSize = new Float32Array(N), aKind = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const f = flies[i];
    pos.set([f.x, f.y, f.z], i * 3);
    aPh[i] = f.ph; aSpd[i] = f.spd; aAmp[i] = f.amp; aAmpY[i] = f.ampY; aSize[i] = f.size; aKind[i] = f.kind;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPh', new THREE.BufferAttribute(aPh, 1));
  geo.setAttribute('aSpd', new THREE.BufferAttribute(aSpd, 1));
  geo.setAttribute('aAmp', new THREE.BufferAttribute(aAmp, 1));
  geo.setAttribute('aAmpY', new THREE.BufferAttribute(aAmpY, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(aKind, 1));
  const flyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPx: { value: renderer.getPixelRatio() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute float aPh, aSpd, aAmp, aAmpY, aSize, aKind;
      uniform float uTime, uPx;
      varying float vB, vK; varying vec3 vC;
      void main(){
        float t = uTime;
        vec3 p = position;
        p.x += aAmp * sin(t * aSpd + aPh);
        p.z += aAmp * 0.72 * sin(t * aSpd * 0.73 + aPh + 1.1);
        p.y += aAmpY * sin(t * aSpd * 0.51 + aPh + 0.6);
        // slow breathe — never fully off, not a strobe
        float breathe = 0.62 + 0.38 * (0.5 + 0.5 * sin(t * aSpd * 0.85 + aPh * 1.7));
        vB = breathe * mix(1.05, 0.80, aKind);
        vK = aKind;
        vC = mix(vec3(1.0, 0.78, 0.38), vec3(1.0, 0.62, 0.28), aKind);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(0.25, -mv.z);
        gl_PointSize = clamp(aSize * 800.0 / dist, 4.0, 16.0) * uPx;
      }`,
    fragmentShader: `
      varying float vB, vK; varying vec3 vC;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float r2 = dot(c,c);
        float core = exp(-r2 * mix(48.0, 24.0, vK));
        float halo = exp(-r2 * mix(9.0, 5.5, vK)) * mix(0.32, 0.42, vK);
        float a = (core + halo) * vB * smoothstep(0.25, 0.08, r2);
        gl_FragColor = vec4(vC * a, 1.0);
      }`
  });
  const flyPts = new THREE.Points(geo, flyMat); flyPts.frustumCulled = false; flyPts.renderOrder = 5; scene.add(flyPts);
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
  // b6: breeze (band-passed noise, slow swell) + rare distant bird / cliff creak, quiet
  const amb = ctx.createGain(); amb.gain.value = 0.10; amb.connect(ctx.destination);
  const wsrc = ctx.createBufferSource(); wsrc.buffer = buf; wsrc.loop = true; wsrc.playbackRate.value = 0.6;
  const wbp = ctx.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 420; wbp.Q.value = 0.6;
  const wg = ctx.createGain(); wg.gain.value = 0;
  wsrc.connect(wbp).connect(wg).connect(amb); wsrc.start(0, Math.random() * 3);
  audio = { ctx, voices, wind: { g: wg, bp: wbp }, amb, nextCall: ctx.currentTime + 12 + Math.random() * 15 };
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

/* ---------------------------------------------------------- b11: radio music menu (same player/panel as the submarine scene) */
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
const fileIn = document.createElement('input'); fileIn.type = 'file'; fileIn.accept = 'audio/*'; fileIn.multiple = true; fileIn.style.display = 'none'; document.body.appendChild(fileIn);
fileIn.addEventListener('change', () => { const f = [...fileIn.files]; if (f.length) player.addTracks(f.map(x => ({ name: x.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(x) }))); fileIn.value = ''; });
// '+ Add': a file picker can't open inside a Quest immersive session, so in VR it ends the session (like the sub scene); pick, then Enter VR again.
musicPanel.setOnAdd(() => { if (renderer.xr.isPresenting) renderer.xr.getSession()?.end(); else fileIn.click(); });
let analyser = null, levelBuf = null;
player.onChange(() => {                       // route the music through the scene's AudioContext once, for the glow level
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
const _uiTargets = [closeBtn.mesh, musicPanel.mesh];
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
  const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
  g.font = '24px system-ui, sans-serif'; g.fillStyle = 'rgba(160,210,215,0.6)'; g.textAlign = 'center'; g.fillText(`Black Sand Beach · ${BUILD}`, 512, 40);
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.036), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, toneMapped: false }));
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
  { const ft = Math.min(1, Math.max(0, (t - 3.5) / 5.0)); bdayU.uFade.value = ft * ft * (3 - 2 * ft); }
  softBounds(Math.min(0.1, (now - (window.__lastFrame ?? now)) / 1000)); window.__lastFrame = now;
  if (!renderer.xr.isPresenting) { camera.rotation.set(0, 0, 0); camera.rotateY(yaw); camera.rotateX(pitch); }
  else pollPads();
  camera.getWorldPosition(_p); skyRig.position.copy(_p);
  ledMat.opacity = 0.55 + 0.35 * Math.sin(t * 0.8);
  if (musicPanel.mesh.visible) { musicPanel.refresh(now); closeBtn.refresh(now); }
  glowU.uLevel.value += (musicLevel() - glowU.uLevel.value) * 0.15;
  tickAudio(t);
  renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

window.__beach = { camera, rig, scene, renderer, lieDown, standUp, snapTurn,
  look: (y, p = 0) => { yaw = y; pitch = p; },
  setPos: (x, y, z) => { rig.position.set(x, 0, z); rig.quaternion.identity(); camera.position.set(0, y, 0); },
  toggleMenu, player, musicPanel,
  get lying() { return lying; } };
