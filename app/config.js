// config.js — tuning constants for comfort (bedtime calm) and Quest 3 performance. Edit here, not in the shaders.
export const CONFIG = {
  CALM: 0.6,                 // global scale on every audio reaction (1 = full, 0 = audio ignored, world just breathes)
  BEAT_FLASH: 0.45,          // vein brightening on a beat (was 1.1)
  RIPPLES: true,             // bass light-ripple rings on/off
  RIPPLE_INTENSITY: 0.4,     // ring brightness (was 1.0)
  RIPPLE_SPEED: 0.14,        // ring growth, radians/s across the wall (was 0.32) — slow
  RIPPLE_LIFE: 14,           // seconds a ring lives (was 9)
  RIPPLE_WIDTH: 0.10,        // ring softness in radians (was 0.045) — soft edge
  RIPPLE_MIN_INTERVAL: 3.0,  // seconds between rings (was 1.3)
  CAUSTIC_SPEED: 0.35,       // caustic drift scale (was effectively 1; the old drift read as a sweep)
  SNOW_COUNT: 700,           // marine-snow particles (was 1400)
  PLUME_PLANES: 14,          // test #5: plume planes on the vent chimneys, all fed by ONE video (03). Lower first if the headset frame budget is blown
  EXTRA_RAYS: 3,             // test #5: extra gliding ice-ray planes (05 video, reused); the big once-per-lap ray is separate
  MAX_LOOP_VIDEOS: 3,        // loops/*.mp4 DECODING at once (one video can feed many planes: plumes x10, rays x5)
  // submarine ride (comfort): constant slow cruise, long smooth ease, yaw-only heading
  RIDE_SPEEDS: { slow: 0.35, veryslow: 0.25, drift: 0.15 },   // m/s cruise presets (entry page, ?speed=, dashboard toggle)
  RIDE_SPEED_DEFAULT: 'veryslow',                                // 0.25 m/s -> ~10 min per ~150 m lap (was 0.5 m/s, ~5 min)
  RIDE_SPEED: 0.25,          // m/s cruise used when no preset is chosen (= veryslow)
  RIDE_EASE_S: 12,           // seconds of smootherstep ease-in / ease-out AND for every speed change (was 8)
  RIDE_VIDEO_NEAR_M: 45,     // loop videos play only within this distance of the sub
  COMFORT_VIGNETTE: false,   // default for the entry-page checkbox
  // headset sharpness (Quest 3). Fixed foveation 0 = off, 1 = max. Ride mode uses FOVEATION_RIDE (text on the dashboard sits
  // in the periphery, where foveation hurts most); float mode keeps FOVEATION. FRAMEBUFFER_SCALE is clamped to >= 1.0 in main.js.
  FOVEATION: 0.5,            // float mode (was 0.7)
  FOVEATION_RIDE: 0.1,       // ride mode (was 0.2, before that 0.7): near-off so the glowing walls in the periphery stay crisp
  FRAMEBUFFER_SCALE: 1.0,    // native eye buffer (was 1.2 = 1.44× pixels). Pays for the lower foveation + extra glow; net GPU cost lower than test #3
  PANEL_SUPERSAMPLE: 2,      // dashboard canvases (music, speed, i, stats) drawn at 2× texel density, mipmapped, anisotropic
  TEX_ANISOTROPY: 8,         // tunnel rock, backdrops, dashboard face (clamped to the GPU max)
  USE_KTX2: true,           // load tex/*.ktx2 when art-manifest.json lists one (tools/prepare_art.py --ktx2); falls back to the JPEG/WebP. ?ktx2=0 forces JPEG
  // Platform-split grade (headset test #4). The HMD_* grade is applied ONLY while an XR session is presenting (renderer.xr.isPresenting,
  // switched on sessionstart/sessionend); the browser/desktop view uses DESKTOP_*. ?grade=hmd forces the HMD grade on desktop (screenshots), ?hmd=0 = old ungraded look.
  HMD_BRIGHTNESS: 2.0,       // stops of exposure lift in the headset (test #4 still "a bit dark" at 1.5)
  HMD_SHADOW_LIFT: 0.07,     // added floor so near-black rock keeps detail
  HMD_CONTRAST: 1.28,        // contrast around a dark mid-grey after the lift
  HMD_WALL_GLOW: 1.25,       // unlit dim-teal emissive on ALL rock in the headset (was 1.0)
  HMD_VEIN_GLOW: 4.0,        // cyan vein emissive gain in the headset (soft-clipped, never pure white)
  DESKTOP_BRIGHTNESS: 1.0,   // desktop: the earlier ~+1 stop look (test #4 screenshot at 1.5 was near-white-hot)
  DESKTOP_SHADOW_LIFT: 0.035,
  DESKTOP_CONTRAST: 1.18,
  DESKTOP_WALL_GLOW: 0.6,
  DESKTOP_VEIN_GLOW: 2.2,
  EMISSIVE_KNEE: 0.78,       // soft-clip knee: above this the brightest channel rolls off smoothly toward 1.0 (hue kept, no white blow-out)
  LAVA_GLOW: 1.0,            // cathedral floor: warm amber/orange crack glow (0 = off)
  LAVA_BASS_PULSE: 0.35,     // gentle extra lava glow from analysis.bass (× CALM); 0 = only the idle breath
  FOG_DENSITY: 0.017,        // ride fog (was 0.026, before 0.038)
  FOG_LIFT: 1.6,             // abyss × FOG_LIFT ...
  FOG_TEAL: 0.55,            // ... mixed this far toward a lit teal, so distant walls fade to glowing water instead of black
  // Sub headlights (Oct 2026 art direction: local light carving detail out of darkness, not global brightening).
  // 'headlights' (default) = two analytic spot cones from the sub's nose + faint near fill, low ambient, veins still bioluminescent.
  // 'glow' = the previous all-emissive look (headlights off, full wall glow). URL: ?lights=1 / ?lights=0. Dashboard: LIGHTS toggle.
  // Per-platform values are { hmd, desktop } (HMD = while an XR session presents, or ?grade=hmd). All switches are uniform-only (no recompiles).
  LIGHTING_MODE: 'headlights',
  HEADLIGHT_INTENSITY: { hmd: 7.5, desktop: 6.5 },     // spot gain on the rock albedo (before the grade). Test #5: a bit hotter inside the (narrower) cones
  HEADLIGHT_RANGE: 30,       // m: soft window to zero at this distance (inverse-square-ish falloff before it)
  HEADLIGHT_ANGLE: 19,       // deg: outer half-angle of each cone (test #5: was 34 -> read as wash; now beams cutting darkness)
  HEADLIGHT_INNER: 0.74,     // penumbra starts at this fraction of the outer angle (was 0.6): crisper, still soft edge
  HEADLIGHT_TOE_OUT: 9,      // deg each lamp is angled outward (was 12; narrower cones overlap a little in the middle)
  HEADLIGHT_TILT_DOWN: 6,    // deg each lamp is angled down
  HEADLIGHT_FILL: { hmd: 0.07, desktop: 0.06 },        // faint near fill (was 0.45: the main 'wash' source). Just enough that the rock beside the window isn't a hole
  HEADLIGHT_COLOR: [1.0, 0.97, 0.91],                   // near-white, slightly warm (test #5): ice must read clear, not tinted
  BEAM_OPACITY: { hmd: 0.20, desktop: 0.16 },           // in-water beam shaft (3-tap in-scatter along the view ray, no extra geometry). Subtle but visible. 0 = off
  AMBIENT_IN_HEADLIGHTS: { hmd: 0.05, desktop: 0.04 },  // scale on the old fake "eye headlamp" base shading (glow mode = 1). Test #5: was 0.20 -> deep black outside the beams
  WALL_GLOW_IN_HEADLIGHTS: { hmd: 0.05, desktop: 0.025 },// dim-teal unlit rock glow (was 0.30 / 0.14; glow mode keeps HMD_/DESKTOP_WALL_GLOW 1.25 / 0.6)
  VEIN_GLOW_IN_HEADLIGHTS: { hmd: 1.5, desktop: 0.9 },  // bioluminescent veins outside the beams: faint but present (glow mode 4.0 / 2.2)
  SHADOW_LIFT_IN_HEADLIGHTS: { hmd: 0.008, desktop: 0.004 }, // near-zero floor: deep black is the aesthetic now (test #5; was 0.035 / 0.015)
  FOG_TEAL_IN_HEADLIGHTS: 0.015,  // distant water ~black-blue (was 0.10)
  FOG_LIFT_IN_HEADLIGHTS: 0.55,   // abyss x this (was 1.15; glow mode FOG_LIFT 1.6)
  BACKDROP_GAIN: [0.75, 1.25, 0.5],   // per chamber (jelly, vents, pillars): evens out the Oct 18 hi-res paintings (mean luma 0.29 / 0.15 / 0.31; the pillars top is near-white)
  BACKDROP_IN_HEADLIGHTS: 0.42,   // chamber paintings: dim distant glow in the black (was 0.9; test #5 deep-black direction + brighter hi-res art)
  // Backdrop life (test #5): slow parallax drift between the 3 layers, caustic shimmer on lit areas, breathing glow on bright features,
  // marine-snow motes drifting in front (all in the existing 3 backdrop draws, no video). 0 = static, 1 = designed level.
  BACKDROP_ANIM: 1.0,
  BACKDROP_AUDIO: 0.35,           // glow breathing gain from analysis.energy (x CALM). 0 = not audio-reactive
  ICE_CLEAR: 1.0,                 // test #5 ice: neutral clear/white body + refraction-like highlights (0 = old blue ice)
  // headset test #6 (Oct 18 evening)
  SKYLIGHT_GAIN: 1.0,             // roof window: overall gain of the layered ice view (caustics, shafts, frost). 0.7 = dimmer, 1.3 = brighter
  SKYLIGHT_CLEAR: 0.6,            // test #7: how see-through the roof ice is (0 = opaque ice, 1 = only frost/caustics hide the world above)
  PLUME_ALWAYS_DECODE: true,      // ride: the vent-plume video (03, feeds all 14 plume planes) keeps one of the MAX_LOOP_VIDEOS slots all lap,
                                  // so plumes already fire when seen from far away; the other loops share the remaining slots (nearest first).
  VENT_ROCK: 1.0,                      // vent chimneys + vents-chamber cones: dark basalt with lava cracks and a rocky mound (0 = previous blue rock)
  // test #7 (Oct 18 night)
  BACKDROP_DARK: [1.0, 0.0, 1.0],      // per chamber (jelly, vents, pillars): 1 = deep shadow, only bright rims/glow survive; 0 = painting as is (lava vents)
  BIG_RAY_OVERHEAD: true,              // second big-manta pass, straight over the sub in the jelly hall (seen through the skylight)
  BIG_RAY_FLEX: 0.5,
  SKYLIGHT_PART: 1.0,                  // how much the roof ice's own glow/frost steps back while the manta is overhead (0 = never)                   // m of slow wing flex at the big ray's wing tips (0 = flat plane)
  BACKDROP_VIGNETTE: [0.75, 0.85, 1.0], // per chamber: radial vignette into black, colour and coverage (0 = old soft edge only, 1 = strong)
  // test #8 (Oct 18 late night)
  SKYLIGHT_R: 0.52,                    // roof window radius m (test #7: 0.26). 0.52 = the 9 m manta fits in it when it is overhead
  BIG_RAY_OVERHEAD_GAIN: 1.6,          // brightness of the big ray during the overhead pass (seen through the skylight ice)
  CREATURES_ON: true,                  // fish / angler / veil creatures (tex/creatures.ktx2 atlas, one draw call)
  CREATURES: [1, 1, 1],                // per animal on/off: [fish (vents), angler (dark corridor vents -> pillars), veil (jelly hall)]
  CREATURE_GAIN: 1.0,                  // brightness of the creature art
  CREATURE_SWAY: 1.0,                  // fin / tentacle / veil undulation amount (0 = rigid curved cards)
  ANGLER_ORB: 1.0,                     // lure-orb glow strength (pulses gently, + music energy)
  ANGLER_S: null,                      // optional: angler loop centre as a fraction of the lap (null = 0.665: the dark corridor between the vents and the pillars)
  // test #10 (Oct 19): jelly-hall + pillars paintings removed; those caves are procedural 3D rock (1 draw call), black until the headlights hit it
  CAVE_ROCK: 1,                        // 0 = no procedural cave rock
  CAVE_ROCK_GAIN: 1.0,                 // how strongly the headlight beams reveal the black rock
  CAVE_RIM: 1.0,                       // faint cyan silhouette rim in the jelly hall (0 = off)
  TARGET_FPS: 72,            // requested via XRSession.updateTargetFrameRate when supported
};
