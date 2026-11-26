import * as THREE from 'three';
/* Shared helper for post/bar/frame vs glass: inset/split panes, trim bars,
 * polygon-offset glass, and AABB overlap tests so nothing crosses or shares a face. */
export const GLASS_INSET = 0.02; // gap between a glass edge and the nearest frame/post

export function prepGlassMaterial(mat) {
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;
  mat.depthWrite = false;
  return mat;
}

export function aabb(x0, x1, y0, y1, z0, z1, name = '') {
  return {
    name,
    min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
    max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) },
  };
}

export function aabbFromCenterSize(cx, cy, cz, sx, sy, sz, name = '') {
  return aabb(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, name);
}

export function aabbsOverlap(a, b, eps = 0.001) {
  return a.min.x < b.max.x - eps && a.max.x > b.min.x + eps &&
         a.min.y < b.max.y - eps && a.max.y > b.min.y + eps &&
         a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;
}

export function findIntersections(solids, glasses, eps = 0.001) {
  const hits = [];
  for (const s of solids) for (const g of glasses) {
    if (aabbsOverlap(s, g, eps)) hits.push({ solid: s.name, glass: g.name });
  }
  return hits;
}

/** Evenly spaced post centers from first to last inclusive. */
export function postCenters(first, last, step) {
  const xs = [];
  for (let x = first; x <= last + 1e-9; x += step) xs.push(Number(x.toFixed(6)));
  if (Math.abs(xs[xs.length - 1] - last) > 0.05) xs.push(last);
  else xs[xs.length - 1] = last;
  return xs;
}

/** Pane spans along an axis, inset from each post's half-width. */
export function paneSpans(centers, postHalf, inset = GLASS_INSET) {
  const spans = [];
  for (let i = 0; i < centers.length - 1; i++) {
    const a = centers[i] + postHalf + inset;
    const b = centers[i + 1] - postHalf - inset;
    if (b - a > 0.04) spans.push({ a, b, mid: (a + b) / 2, len: b - a });
  }
  return spans;
}

export const glassParts = [];
export const solidParts = [];

export function registerGlass(box) { glassParts.push(box); }
export function registerSolid(box) { solidParts.push(box); }

export function reportGlassFits(label) {
  const hits = findIntersections(solidParts, glassParts);
  const summary = { label, solids: solidParts.length, glasses: glassParts.length, overlaps: hits.length, hits };
  console.log(`[glass-fit ${label}] solids=${summary.solids} glass=${summary.glasses} overlaps=${summary.overlaps}`);
  for (const h of hits) console.log('  overlap:', h.solid, 'x', h.glass);
  if (typeof window !== 'undefined') window.__glassFit = summary;
  return hits;
}

/** Subtle cool-smoked exterior window glass. From outside, opacity ~0.40 calms interior sparkle;
 *  from inside, opacity stays ~0.16 so the sky still reads clearly. The glass floor should keep the
 *  clear prepGlassMaterial instead. Geometry is unchanged, so glass-fit AABBs are unaffected. */
export function makeWindowGlass(envMap, roomCenter = new THREE.Vector3(0, 18, 0)) {
  const mat = prepGlassMaterial(new THREE.MeshStandardMaterial({
    color: 0x5c7588, roughness: 0.10, metalness: 0.12,
    transparent: true, opacity: 0.38, depthWrite: false,
    envMap, envMapIntensity: 0.85,
  }));
  const center = roomCenter.clone();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRoomCenter = { value: center };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinWorldPos;\nvarying vec3 vWinWorldNormal;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\n  vWinWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vWinWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRoomCenter;\nvarying vec3 vWinWorldPos;\nvarying vec3 vWinWorldNormal;')
      .replace('#include <dithering_fragment>',
        '  { bool ext = dot(normalize(vWinWorldNormal), normalize(vWinWorldPos - uRoomCenter)) > 0.0;\n' +
        '    gl_FragColor.a *= ext ? 1.05 : 0.42;\n' +
        '    gl_FragColor.a = clamp(gl_FragColor.a, 0.0, 0.45); }\n' +
        '#include <dithering_fragment>');
  };
  mat.customProgramCacheKey = () => 'b17-window-tint';
  return mat;
}
