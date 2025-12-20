/* taydem.data.js (v2.0 - Option A Only JS)
 * - 10 styles: bolero, ballad, slowrock, pop8, rumba, waltz, chacha, reggae, disco, shuffle
 * - Per style: guitar/piano/perc: verse/chorus(fill/ending) + guitar chorus/verse variants down/up/auto
 * - Groove presets: nhau / phongtra / tiktok (feel & accent only)
 * - Guitar shapes: multiple voicings for voice-leading
 *
 * Exposes: window.TayDemData
 */
(function (global) {
  "use strict";

  const defaults = {
    bpm: 84,
    meter: "4/4",
    instrumentMode: "guitar",   // guitar | piano | band
    outputMode: "phone",        // phone | external
    energy: "normal",           // low | normal | high
    styleId: "bolero",
    groovePreset: "nhau",       // nhau | phongtra | tiktok
    chord: "Dm",
    part: "verse",              // verse | chorus
    rightHand: "auto",          // down | up | auto
    autoAssist: true            // verse->low, chorus->high (engine can override)
  };

  // -----------------------------------------
  // Energy Rules (multipliers only; engine uses them)
  // -----------------------------------------
  const ENERGY = {
    guitar: {
      low:    { velMul: 0.82, densityDrop: 0.20, durMul: 0.92 },
      normal: { velMul: 1.00, densityDrop: 0.00, durMul: 1.00 },
      high:   { velMul: 1.13, densityDrop: 0.00, durMul: 1.05 }
    },
    piano: {
      low:    { velMul: 0.80, densityDrop: 0.25, durMul: 0.90 },
      normal: { velMul: 1.00, densityDrop: 0.00, durMul: 1.00 },
      high:   { velMul: 1.08, densityDrop: 0.00, durMul: 1.02 }
    },
    perc: {
      low:    { velMul: 0.82, densityDrop: 0.15, durMul: 1.00 },
      normal: { velMul: 1.00, densityDrop: 0.00, durMul: 1.00 },
      high:   { velMul: 1.08, densityDrop: 0.00, durMul: 1.00 }
    }
  };

  // -----------------------------------------
  // Groove presets (JS-only realism: feel + accent)
  // Engine merges preset into style.grooveBase
  // -----------------------------------------
  const groovePresets = {
    nhau: {
      name: "Nhậu (đều, dễ hát)",
      laybackMsAdd: 2,
      swingMsAdd: 1,
      cycleVelMul: 1.00,
      accentMul: 1.05,
      phoneCleanMul: 1.00
    },
    phongtra: {
      name: "Phòng trà (mềm, lơi)",
      laybackMsAdd: 5,
      swingMsAdd: 0,
      cycleVelMul: 0.98,
      accentMul: 1.02,
      phoneCleanMul: 0.98
    },
    tiktok: {
      name: "TikTok (đậm, rõ, punchy)",
      laybackMsAdd: 0,
      swingMsAdd: 0,
      cycleVelMul: 1.05,
      accentMul: 1.10,
      phoneCleanMul: 1.02
    }
  };

  // -----------------------------------------
  // Pattern registry
  // event fields: idx, role, action, vel, durBeats, dir, muted, strings, bassTone, staccato
  // -----------------------------------------
  const patterns = {};
  function defPattern(p) { patterns[p.id] = p; return p.id; }

  function pat(id, subdivision, events, accent, energyRules) {
    return defPattern({ id, subdivision, events, accent: accent || {}, energyRules });
  }

  // ============================================================
  // Common helpers: Perc skeletons (8th grid)
  // ============================================================
  function percShaker8(vel = 0.30) {
    return [
      { idx:1, role:"PERC", action:"shaker", vel, durBeats:0.10 },
      { idx:3, role:"PERC", action:"shaker", vel:vel*1.03, durBeats:0.10 },
      { idx:5, role:"PERC", action:"shaker", vel, durBeats:0.10 },
      { idx:7, role:"PERC", action:"shaker", vel:vel*1.03, durBeats:0.10 }
    ];
  }

  // ============================================================
  // STYLE: BOLERO (4/4) — signature
  // ============================================================
  pat("g_bolero_verse", 8,
    [
      { idx:0, role:"BASS",   action:"pluck", vel:1.00, durBeats:0.70, bassTone:"root" },
      { idx:1, role:"MID",    action:"pluck", vel:0.46, durBeats:0.40 },
      { idx:2, role:"TREBLE", action:"pluck", vel:0.70, durBeats:0.50 },
      { idx:4, role:"BASS",   action:"pluck", vel:0.92, durBeats:0.65, bassTone:"auto" },
      { idx:5, role:"MID",    action:"pluck", vel:0.46, durBeats:0.40 },
      { idx:6, role:"TREBLE", action:"pluck", vel:0.68, durBeats:0.50 }
    ],
    { 0:1.14, 4:1.08 },
    ENERGY.guitar
  );

  pat("g_bolero_chorus_down", 8,
    [
      { idx:0, role:"BASS", action:"pluck",     vel:1.00, durBeats:0.60, bassTone:"root" },
      { idx:2, role:"MUTE", action:"muteBrush", vel:0.80, durBeats:0.25, dir:"down" },
      { idx:4, role:"BASS", action:"pluck",     vel:0.90, durBeats:0.55, bassTone:"auto" },
      { idx:6, role:"MUTE", action:"muteBrush", vel:0.76, durBeats:0.25, dir:"down" }
    ],
    { 0:1.16, 4:1.06, 2:1.03, 6:1.03 },
    ENERGY.guitar
  );

  pat("g_bolero_chorus_up", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:0.58, bassTone:"root" },
      { idx:1, role:"CHORD", action:"brush", vel:0.52, durBeats:0.25, dir:"up", muted:true, strings:[4,3,2,1] },
      { idx:4, role:"BASS",  action:"pluck", vel:0.88, durBeats:0.52, bassTone:"auto" },
      { idx:5, role:"CHORD", action:"brush", vel:0.52, durBeats:0.25, dir:"up", muted:true, strings:[4,3,2,1] }
    ],
    { 1:1.10, 5:1.10 },
    ENERGY.guitar
  );

  pat("g_bolero_fill_soft", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:0.95, durBeats:0.55, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.72, durBeats:0.35, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:4, role:"BASS",  action:"pluck", vel:0.86, durBeats:0.50, bassTone:"auto" },
      { idx:6, role:"MUTE",  action:"muteBrush", vel:0.72, durBeats:0.22, dir:"down" }
    ],
    null,
    ENERGY.guitar
  );

  pat("g_bolero_fill_hard", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:0.55, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.82, durBeats:0.40, dir:"down", strings:[6,5,4,3,2,1] },
      { idx:3, role:"CHORD", action:"brush", vel:0.58, durBeats:0.35, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:4, role:"BASS",  action:"pluck", vel:0.88, durBeats:0.50, bassTone:"auto" },
      { idx:6, role:"MUTE",  action:"muteBrush", vel:0.80, durBeats:0.22, dir:"down" }
    ],
    { 2:1.06, 6:1.05 },
    ENERGY.guitar
  );

  pat("g_bolero_ending_short", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:0.90, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.82, durBeats:0.90, dir:"down", strings:[5,4,3,2,1] }
    ],
    { 0:1.10 },
    ENERGY.guitar
  );

  pat("g_bolero_ending_long", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:0.95, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.84, durBeats:1.10, dir:"down", strings:[6,5,4,3,2,1] },
      { idx:4, role:"CHORD", action:"brush", vel:0.72, durBeats:1.10, dir:"down", strings:[5,4,3,2,1], muted:true }
    ],
    { 2:1.06 },
    ENERGY.guitar
  );

  pat("p_bolero_main", 8,
    [
      { idx:0, role:"BASS",  action:"bass",     vel:0.82, durBeats:0.55 },
      { idx:2, role:"CHORD", action:"chordHit", vel:0.74, durBeats:0.35, staccato:true },
      { idx:6, role:"CHORD", action:"chordHit", vel:0.74, durBeats:0.35, staccato:true }
    ],
    { 0:1.06, 2:1.04, 6:1.04 },
    ENERGY.piano
  );

  pat("p_bolero_fill", 8,
    [
      { idx:0, role:"BASS",  action:"bass",     vel:0.82, durBeats:0.45 },
      { idx:2, role:"CHORD", action:"chordHit", vel:0.78, durBeats:0.30, staccato:true },
      { idx:4, role:"BASS",  action:"bass",     vel:0.76, durBeats:0.40 },
      { idx:6, role:"CHORD", action:"chordHit", vel:0.78, durBeats:0.30, staccato:true }
    ],
    { 2:1.06, 6:1.06 },
    ENERGY.piano
  );

  pat("p_bolero_ending", 8,
    [
      { idx:0, role:"BASS",  action:"bass",     vel:0.88, durBeats:0.90 },
      { idx:2, role:"CHORD", action:"chordHit", vel:0.74, durBeats:1.10, staccato:false }
    ],
    null,
    ENERGY.piano
  );

  pat("k_bolero_verse", 8,
    [
      ...percShaker8(0.40),
      { idx:0, role:"PERC", action:"kick", vel:0.34, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick", vel:0.30, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  pat("k_bolero_chorus", 8,
    [
      ...percShaker8(0.46),
      { idx:0, role:"PERC", action:"kick",  vel:0.38, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick",  vel:0.34, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.26, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.26, durBeats:0.10 }
    ],
    { 2:1.02, 6:1.02 },
    ENERGY.perc
  );

  pat("k_bolero_fill", 8,
    [
      { idx:0, role:"PERC", action:"kick",  vel:0.36, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.28, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick",  vel:0.34, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.30, durBeats:0.10 },
      { idx:7, role:"PERC", action:"snare", vel:0.38, durBeats:0.10 }
    ],
    { 7:1.10 },
    ENERGY.perc
  );

  pat("k_bolero_ending", 8,
    [
      { idx:0, role:"PERC", action:"kick", vel:0.40, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.30, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: BALLAD (4/4)
  // ============================================================
  pat("g_ballad_verse", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:0.95, durBeats:0.85, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.58, durBeats:0.55, dir:"down", strings:[4,3,2,1] },
      { idx:4, role:"BASS",  action:"pluck", vel:0.86, durBeats:0.80, bassTone:"auto" },
      { idx:6, role:"CHORD", action:"brush", vel:0.56, durBeats:0.55, dir:"down", strings:[4,3,2,1] }
    ],
    { 0:1.06, 4:1.04 },
    ENERGY.guitar
  );

  pat("g_ballad_chorus_down", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:0.70, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.66, durBeats:0.50, dir:"down", strings:[5,4,3,2,1] },
      { idx:4, role:"BASS",  action:"pluck", vel:0.92, durBeats:0.65, bassTone:"auto" },
      { idx:6, role:"CHORD", action:"brush", vel:0.64, durBeats:0.50, dir:"down", strings:[5,4,3,2,1] }
    ],
    { 2:1.05, 6:1.05 },
    ENERGY.guitar
  );

  pat("g_ballad_chorus_up", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:0.70, bassTone:"root" },
      { idx:3, role:"CHORD", action:"brush", vel:0.58, durBeats:0.35, dir:"up", muted:true, strings:[4,3,2,1] },
      { idx:4, role:"BASS",  action:"pluck", vel:0.92, durBeats:0.65, bassTone:"auto" },
      { idx:7, role:"CHORD", action:"brush", vel:0.58, durBeats:0.35, dir:"up", muted:true, strings:[4,3,2,1] }
    ],
    { 3:1.10, 7:1.10 },
    ENERGY.guitar
  );

  pat("g_ballad_fill", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:0.95, durBeats:0.55, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.70, durBeats:0.40, dir:"down" },
      { idx:3, role:"CHORD", action:"brush", vel:0.55, durBeats:0.35, dir:"up" },
      { idx:6, role:"MUTE",  action:"muteBrush", vel:0.62, durBeats:0.22, dir:"down" }
    ],
    null,
    ENERGY.guitar
  );

  pat("g_ballad_ending", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:1.00, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.70, durBeats:1.10, dir:"down", strings:[5,4,3,2,1] }
    ],
    { 0:1.10 },
    ENERGY.guitar
  );

  pat("p_ballad_main", 8,
    [
      { idx:0, role:"BASS",  action:"bass",     vel:0.82, durBeats:0.85 },
      { idx:4, role:"CHORD", action:"chordHit", vel:0.70, durBeats:0.60, staccato:false }
    ],
    { 4:1.04 },
    ENERGY.piano
  );

  pat("k_ballad_verse", 8,
    [
      ...percShaker8(0.32)
    ],
    null,
    ENERGY.perc
  );

  pat("k_ballad_chorus", 8,
    [
      ...percShaker8(0.38),
      { idx:4, role:"PERC", action:"kick", vel:0.22, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: SLOW ROCK (4/4)
  // ============================================================
  pat("g_slowrock_verse", 8,
    [
      { idx:0, role:"BASS",  action:"pluck", vel:1.00, durBeats:0.55, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.64, durBeats:0.40, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:4, role:"BASS",  action:"pluck", vel:0.90, durBeats:0.50, bassTone:"auto" },
      { idx:6, role:"CHORD", action:"brush", vel:0.62, durBeats:0.40, dir:"down", strings:[5,4,3,2,1], muted:true }
    ],
    { 2:1.06, 6:1.06 },
    ENERGY.guitar
  );

  pat("g_slowrock_chorus_down", 8,
    [
      { idx:0, role:"CHORD", action:"brush", vel:0.76, durBeats:0.55, dir:"down", strings:[6,5,4,3,2,1] },
      { idx:2, role:"CHORD", action:"brush", vel:0.64, durBeats:0.35, dir:"up",   strings:[4,3,2,1], muted:true },
      { idx:4, role:"CHORD", action:"brush", vel:0.74, durBeats:0.55, dir:"down", strings:[6,5,4,3,2,1] },
      { idx:6, role:"CHORD", action:"brush", vel:0.64, durBeats:0.35, dir:"up",   strings:[4,3,2,1], muted:true }
    ],
    { 0:1.06, 4:1.04 },
    ENERGY.guitar
  );

  pat("g_slowrock_chorus_up", 8,
    [
      { idx:1, role:"CHORD", action:"brush", vel:0.64, durBeats:0.35, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:3, role:"CHORD", action:"brush", vel:0.66, durBeats:0.35, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:5, role:"CHORD", action:"brush", vel:0.64, durBeats:0.35, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:7, role:"CHORD", action:"brush", vel:0.66, durBeats:0.35, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_slowrock_verse", 8,
    [
      { idx:0, role:"PERC", action:"kick",  vel:0.38, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick",  vel:0.34, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.30, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.30, durBeats:0.10 }
    ],
    { 2:1.04, 6:1.04 },
    ENERGY.perc
  );

  pat("k_slowrock_chorus", 8,
    [
      ...percShaker8(0.30),
      { idx:0, role:"PERC", action:"kick",  vel:0.40, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick",  vel:0.36, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.32, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.32, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: POP 8-beat (4/4)
  // ============================================================
  pat("g_pop8_verse", 8,
    [
      { idx:0, role:"CHORD", action:"brush", vel:0.70, durBeats:0.35, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:2, role:"CHORD", action:"brush", vel:0.60, durBeats:0.28, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:4, role:"CHORD", action:"brush", vel:0.68, durBeats:0.35, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:6, role:"CHORD", action:"brush", vel:0.60, durBeats:0.28, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    { 0:1.04, 4:1.04 },
    ENERGY.guitar
  );

  pat("g_pop8_chorus_down", 8,
    [
      { idx:0, role:"CHORD", action:"brush", vel:0.78, durBeats:0.42, dir:"down", strings:[6,5,4,3,2,1] },
      { idx:2, role:"CHORD", action:"brush", vel:0.66, durBeats:0.30, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:4, role:"CHORD", action:"brush", vel:0.76, durBeats:0.42, dir:"down", strings:[6,5,4,3,2,1] },
      { idx:6, role:"CHORD", action:"brush", vel:0.66, durBeats:0.30, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("g_pop8_chorus_up", 8,
    [
      { idx:1, role:"CHORD", action:"brush", vel:0.62, durBeats:0.26, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:3, role:"CHORD", action:"brush", vel:0.66, durBeats:0.26, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:5, role:"CHORD", action:"brush", vel:0.62, durBeats:0.26, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:7, role:"CHORD", action:"brush", vel:0.66, durBeats:0.26, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_pop8_verse", 8,
    [
      ...percShaker8(0.30),
      { idx:0, role:"PERC", action:"kick",  vel:0.36, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick",  vel:0.32, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.28, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.28, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  pat("k_pop8_chorus", 8,
    [
      ...percShaker8(0.32),
      { idx:0, role:"PERC", action:"kick",  vel:0.40, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick",  vel:0.36, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.30, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.30, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: RUMBA (4/4) — latin light
  // ============================================================
  pat("g_rumba_verse", 8,
    [
      { idx:0, role:"BASS", action:"pluck", vel:0.95, durBeats:0.55, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.60, durBeats:0.28, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:3, role:"CHORD", action:"brush", vel:0.54, durBeats:0.22, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:4, role:"BASS", action:"pluck", vel:0.86, durBeats:0.50, bassTone:"auto" },
      { idx:6, role:"CHORD", action:"brush", vel:0.60, durBeats:0.28, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:7, role:"CHORD", action:"brush", vel:0.54, durBeats:0.22, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_rumba_verse", 8,
    [
      { idx:0, role:"PERC", action:"kick", vel:0.34, durBeats:0.10 },
      { idx:3, role:"PERC", action:"snare", vel:0.26, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick", vel:0.30, durBeats:0.10 },
      { idx:7, role:"PERC", action:"snare", vel:0.26, durBeats:0.10 },
      { idx:1, role:"PERC", action:"shaker", vel:0.28, durBeats:0.10 },
      { idx:5, role:"PERC", action:"shaker", vel:0.28, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: WALTZ 3/4 — subdivision 6 = 1&2&3&
  // ============================================================
  pat("g_waltz_verse", 6,
    [
      { idx:0, role:"BASS", action:"pluck", vel:0.96, durBeats:0.65, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.56, durBeats:0.35, dir:"down", strings:[4,3,2,1], muted:true },
      { idx:4, role:"CHORD", action:"brush", vel:0.56, durBeats:0.35, dir:"down", strings:[4,3,2,1], muted:true }
    ],
    { 0:1.08 },
    ENERGY.guitar
  );

  pat("g_waltz_chorus_down", 6,
    [
      { idx:0, role:"BASS", action:"pluck", vel:1.00, durBeats:0.60, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.64, durBeats:0.35, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:4, role:"CHORD", action:"brush", vel:0.64, durBeats:0.35, dir:"down", strings:[5,4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("g_waltz_chorus_up", 6,
    [
      { idx:1, role:"CHORD", action:"brush", vel:0.54, durBeats:0.22, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:3, role:"CHORD", action:"brush", vel:0.56, durBeats:0.22, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:5, role:"CHORD", action:"brush", vel:0.56, durBeats:0.22, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_waltz_verse", 6,
    [
      { idx:0, role:"PERC", action:"kick", vel:0.34, durBeats:0.10 },
      { idx:2, role:"PERC", action:"shaker", vel:0.28, durBeats:0.10 },
      { idx:4, role:"PERC", action:"shaker", vel:0.28, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: CHA-CHA (4/4) — light latin dance (simplified)
  // ============================================================
  pat("g_chacha_verse", 8,
    [
      { idx:0, role:"BASS", action:"pluck", vel:0.90, durBeats:0.45, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.62, durBeats:0.22, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:3, role:"CHORD", action:"brush", vel:0.56, durBeats:0.18, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:5, role:"CHORD", action:"brush", vel:0.62, durBeats:0.22, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:6, role:"CHORD", action:"brush", vel:0.56, durBeats:0.18, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_chacha_verse", 8,
    [
      { idx:0, role:"PERC", action:"kick", vel:0.28, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.22, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick", vel:0.26, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.22, durBeats:0.10 },
      { idx:1, role:"PERC", action:"shaker", vel:0.26, durBeats:0.10 },
      { idx:3, role:"PERC", action:"shaker", vel:0.26, durBeats:0.10 },
      { idx:5, role:"PERC", action:"shaker", vel:0.26, durBeats:0.10 },
      { idx:7, role:"PERC", action:"shaker", vel:0.26, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: REGGAE POP (4/4) — skank on offbeats
  // ============================================================
  pat("g_reggae_verse", 8,
    [
      { idx:1, role:"MUTE", action:"muteBrush", vel:0.70, durBeats:0.18, dir:"down", strings:[4,3,2,1] },
      { idx:3, role:"MUTE", action:"muteBrush", vel:0.74, durBeats:0.18, dir:"down", strings:[4,3,2,1] },
      { idx:5, role:"MUTE", action:"muteBrush", vel:0.70, durBeats:0.18, dir:"down", strings:[4,3,2,1] },
      { idx:7, role:"MUTE", action:"muteBrush", vel:0.74, durBeats:0.18, dir:"down", strings:[4,3,2,1] }
    ],
    { 3:1.05, 7:1.05 },
    ENERGY.guitar
  );

  pat("g_reggae_chorus_down", 8,
    [
      { idx:1, role:"MUTE", action:"muteBrush", vel:0.78, durBeats:0.20, dir:"down", strings:[5,4,3,2,1] },
      { idx:3, role:"MUTE", action:"muteBrush", vel:0.82, durBeats:0.20, dir:"down", strings:[5,4,3,2,1] },
      { idx:5, role:"MUTE", action:"muteBrush", vel:0.78, durBeats:0.20, dir:"down", strings:[5,4,3,2,1] },
      { idx:7, role:"MUTE", action:"muteBrush", vel:0.82, durBeats:0.20, dir:"down", strings:[5,4,3,2,1] }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_reggae_verse", 8,
    [
      { idx:0, role:"PERC", action:"kick", vel:0.34, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick", vel:0.30, durBeats:0.10 },
      ...percShaker8(0.24)
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: DISCO 4-on-floor (4/4) — kick every beat
  // ============================================================
  pat("g_disco_verse", 8,
    [
      { idx:0, role:"CHORD", action:"brush", vel:0.70, durBeats:0.22, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:2, role:"CHORD", action:"brush", vel:0.62, durBeats:0.20, dir:"up", strings:[4,3,2,1], muted:true },
      { idx:4, role:"CHORD", action:"brush", vel:0.70, durBeats:0.22, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:6, role:"CHORD", action:"brush", vel:0.62, durBeats:0.20, dir:"up", strings:[4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_disco_verse", 8,
    [
      { idx:0, role:"PERC", action:"kick", vel:0.42, durBeats:0.10 },
      { idx:2, role:"PERC", action:"kick", vel:0.40, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick", vel:0.42, durBeats:0.10 },
      { idx:6, role:"PERC", action:"kick", vel:0.40, durBeats:0.10 },
      ...percShaker8(0.28),
      { idx:2, role:"PERC", action:"snare", vel:0.18, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.18, durBeats:0.10 }
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // STYLE: SHUFFLE/FOX (4/4) — light shuffle feel (8th grid but swing)
  // ============================================================
  pat("g_shuffle_verse", 8,
    [
      { idx:0, role:"BASS", action:"pluck", vel:0.96, durBeats:0.55, bassTone:"root" },
      { idx:2, role:"CHORD", action:"brush", vel:0.62, durBeats:0.28, dir:"down", strings:[5,4,3,2,1], muted:true },
      { idx:4, role:"BASS", action:"pluck", vel:0.88, durBeats:0.50, bassTone:"auto" },
      { idx:6, role:"CHORD", action:"brush", vel:0.60, durBeats:0.28, dir:"down", strings:[5,4,3,2,1], muted:true }
    ],
    null,
    ENERGY.guitar
  );

  pat("k_shuffle_verse", 8,
    [
      { idx:0, role:"PERC", action:"kick", vel:0.34, durBeats:0.10 },
      { idx:4, role:"PERC", action:"kick", vel:0.30, durBeats:0.10 },
      { idx:2, role:"PERC", action:"snare", vel:0.28, durBeats:0.10 },
      { idx:6, role:"PERC", action:"snare", vel:0.28, durBeats:0.10 },
      ...percShaker8(0.26)
    ],
    null,
    ENERGY.perc
  );

  // ============================================================
  // Minimal piano patterns reused across styles (kept light)
  // ============================================================
  pat("p_pop_main", 8,
    [
      { idx:0, role:"BASS",  action:"bass",     vel:0.78, durBeats:0.35 },
      { idx:4, role:"BASS",  action:"bass",     vel:0.74, durBeats:0.35 },
      { idx:2, role:"CHORD", action:"chordHit", vel:0.68, durBeats:0.25, staccato:true },
      { idx:6, role:"CHORD", action:"chordHit", vel:0.68, durBeats:0.25, staccato:true }
    ],
    null,
    ENERGY.piano
  );

  pat("p_sparse", 8,
    [
      { idx:0, role:"BASS",  action:"bass",     vel:0.80, durBeats:0.80 },
      { idx:4, role:"CHORD", action:"chordHit", vel:0.68, durBeats:0.60, staccato:false }
    ],
    null,
    ENERGY.piano
  );

  // -----------------------------------------
  // Style registry
  // - guitar.chorus/verse allow variant object {down,up,auto}
  // - fill/ending provide soft/hard or short/long where applicable
  // -----------------------------------------
  const styles = {
    bolero: {
      name: "Bolero",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse: "g_bolero_verse",
        chorus: { down:"g_bolero_chorus_down", up:"g_bolero_chorus_up", auto:"g_bolero_chorus_down" },
        fill: { soft:"g_bolero_fill_soft", hard:"g_bolero_fill_hard" },
        ending: { short:"g_bolero_ending_short", long:"g_bolero_ending_long" }
      },
      piano: { verse:"p_bolero_main", chorus:"p_bolero_main", fill:"p_bolero_fill", ending:"p_bolero_ending" },
      perc:  { verse:"k_bolero_verse", chorus:"k_bolero_chorus", fill:"k_bolero_fill", ending:"k_bolero_ending" },
      grooveBase: { laybackMs:2, swingMs:2, feel8:{1:6,3:8,5:6,7:8}, cycleVel:[1.00,0.98,1.02,0.99] }
    },

    ballad: {
      name: "Ballad / Slow",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_ballad_verse",
        chorus:{ down:"g_ballad_chorus_down", up:"g_ballad_chorus_up", auto:"g_ballad_chorus_down" },
        fill:"g_ballad_fill",
        ending:"g_ballad_ending"
      },
      piano: { verse:"p_sparse", chorus:"p_sparse", fill:"p_sparse", ending:"p_sparse" },
      perc:  { verse:"k_ballad_verse", chorus:"k_ballad_chorus", fill:"k_ballad_chorus", ending:"k_ballad_chorus" },
      grooveBase: { laybackMs:4, swingMs:0, feel8:{}, cycleVel:[1.00,0.99,1.01,0.99] }
    },

    slowrock: {
      name: "Slow Rock",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_slowrock_verse",
        chorus:{ down:"g_slowrock_chorus_down", up:"g_slowrock_chorus_up", auto:"g_slowrock_chorus_down" },
        fill:"g_slowrock_verse",
        ending:"g_slowrock_chorus_down"
      },
      piano: { verse:"p_pop_main", chorus:"p_pop_main", fill:"p_pop_main", ending:"p_sparse" },
      perc:  { verse:"k_slowrock_verse", chorus:"k_slowrock_chorus", fill:"k_slowrock_chorus", ending:"k_slowrock_verse" },
      grooveBase: { laybackMs:0, swingMs:0, feel8:{}, cycleVel:[1.00,1.00,1.01,0.99] }
    },

    pop8: {
      name: "Pop 8-beat",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_pop8_verse",
        chorus:{ down:"g_pop8_chorus_down", up:"g_pop8_chorus_up", auto:"g_pop8_chorus_down" },
        fill:"g_pop8_verse",
        ending:"g_pop8_chorus_down"
      },
      piano: { verse:"p_pop_main", chorus:"p_pop_main", fill:"p_pop_main", ending:"p_sparse" },
      perc:  { verse:"k_pop8_verse", chorus:"k_pop8_chorus", fill:"k_pop8_chorus", ending:"k_pop8_verse" },
      grooveBase: { laybackMs:0, swingMs:0, feel8:{}, cycleVel:[1.00,0.99,1.01,0.99] }
    },

    rumba: {
      name: "Rumba (Light)",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_rumba_verse",
        chorus:{ down:"g_rumba_verse", up:"g_rumba_verse", auto:"g_rumba_verse" },
        fill:"g_rumba_verse",
        ending:"g_rumba_verse"
      },
      piano: { verse:"p_pop_main", chorus:"p_pop_main", fill:"p_pop_main", ending:"p_sparse" },
      perc:  { verse:"k_rumba_verse", chorus:"k_rumba_verse", fill:"k_rumba_verse", ending:"k_rumba_verse" },
      grooveBase: { laybackMs:0, swingMs:2, feel8:{1:4,3:6,5:4,7:6}, cycleVel:[1.00,0.99,1.01,0.99] }
    },

    waltz: {
      name: "Waltz 3/4",
      meter: "3/4",
      endingBars: 2,
      guitar: {
        verse:"g_waltz_verse",
        chorus:{ down:"g_waltz_chorus_down", up:"g_waltz_chorus_up", auto:"g_waltz_chorus_down" },
        fill:"g_waltz_verse",
        ending:"g_waltz_chorus_down"
      },
      piano: { verse:"p_sparse", chorus:"p_sparse", fill:"p_sparse", ending:"p_sparse" },
      perc:  { verse:"k_waltz_verse", chorus:"k_waltz_verse", fill:"k_waltz_verse", ending:"k_waltz_verse" },
      grooveBase: { laybackMs:2, swingMs:0, feel8:{}, cycleVel:[1.00,0.99,1.01] }
    },

    chacha: {
      name: "Cha-cha (Light)",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_chacha_verse",
        chorus:{ down:"g_chacha_verse", up:"g_chacha_verse", auto:"g_chacha_verse" },
        fill:"g_chacha_verse",
        ending:"g_chacha_verse"
      },
      piano: { verse:"p_pop_main", chorus:"p_pop_main", fill:"p_pop_main", ending:"p_sparse" },
      perc:  { verse:"k_chacha_verse", chorus:"k_chacha_verse", fill:"k_chacha_verse", ending:"k_chacha_verse" },
      grooveBase: { laybackMs:0, swingMs:0, feel8:{}, cycleVel:[1.00,0.99,1.01,0.99] }
    },

    reggae: {
      name: "Reggae Pop",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_reggae_verse",
        chorus:{ down:"g_reggae_chorus_down", up:"g_reggae_chorus_down", auto:"g_reggae_chorus_down" },
        fill:"g_reggae_verse",
        ending:"g_reggae_chorus_down"
      },
      piano: { verse:"p_sparse", chorus:"p_sparse", fill:"p_sparse", ending:"p_sparse" },
      perc:  { verse:"k_reggae_verse", chorus:"k_reggae_verse", fill:"k_reggae_verse", ending:"k_reggae_verse" },
      grooveBase: { laybackMs:0, swingMs:0, feel8:{1:2,3:2,5:2,7:2}, cycleVel:[1.00,1.00,1.00,1.00] }
    },

    disco: {
      name: "Disco 4-on-floor",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_disco_verse",
        chorus:{ down:"g_disco_verse", up:"g_disco_verse", auto:"g_disco_verse" },
        fill:"g_disco_verse",
        ending:"g_disco_verse"
      },
      piano: { verse:"p_pop_main", chorus:"p_pop_main", fill:"p_pop_main", ending:"p_sparse" },
      perc:  { verse:"k_disco_verse", chorus:"k_disco_verse", fill:"k_disco_verse", ending:"k_disco_verse" },
      grooveBase: { laybackMs:0, swingMs:0, feel8:{}, cycleVel:[1.02,0.98,1.02,0.98] }
    },

    shuffle: {
      name: "Shuffle / Fox",
      meter: "4/4",
      endingBars: 2,
      guitar: {
        verse:"g_shuffle_verse",
        chorus:{ down:"g_shuffle_verse", up:"g_shuffle_verse", auto:"g_shuffle_verse" },
        fill:"g_shuffle_verse",
        ending:"g_shuffle_verse"
      },
      piano: { verse:"p_pop_main", chorus:"p_pop_main", fill:"p_pop_main", ending:"p_sparse" },
      perc:  { verse:"k_shuffle_verse", chorus:"k_shuffle_verse", fill:"k_shuffle_verse", ending:"k_shuffle_verse" },
      grooveBase: { laybackMs:0, swingMs:6, feel8:{1:4,3:8,5:4,7:8}, cycleVel:[1.00,0.99,1.01,0.99] }
    }
  };

  // -----------------------------------------
  // Guitar shapes library (expanded)
  // - Each chord has multiple voicings for voice-leading
  // - Shapes are [string6..1] frets or 'x'
  // -----------------------------------------
  const guitarShapes = {
    // Minor
    "Am":  [['x',0,2,2,1,0], [5,7,7,5,5,5], ['x',12,14,14,13,12]],
    "Am7": [['x',0,2,0,1,0], [5,7,5,5,5,5], ['x',12,14,12,13,12]],
    "Bm":  [['x',2,4,4,3,2], [7,9,9,7,7,7]],
    "Cm":  [['x',3,5,5,4,3], [8,10,10,8,8,8]],
    "Dm":  [['x','x',0,2,3,1], ['x',5,7,7,6,5], [10,12,12,10,10,10]],
    "Dm7": [['x','x',0,2,1,1], ['x',5,7,5,6,5], [10,12,10,10,10,10]],
    "Em":  [[0,2,2,0,0,0], [7,9,9,8,7,7]],
    "Fm":  [[1,3,3,1,1,1], [8,10,10,8,8,8]],
    "Gm":  [[3,5,5,3,3,3], ['x',10,12,12,11,10], [15,17,17,15,15,15]],

    // Major
    "C":   [['x',3,2,0,1,0], ['x',3,5,5,5,3], [8,10,10,9,8,8]],
    "D":   [['x','x',0,2,3,2], ['x',5,7,7,7,5], [10,12,12,11,10,10]],
    "E":   [[0,2,2,1,0,0], [7,9,9,9,7,7]],
    "F":   [[1,3,3,2,1,1], ['x',8,10,10,10,8], [13,15,15,14,13,13]],
    "G":   [[3,2,0,0,0,3], [3,5,5,4,3,3], ['x',10,12,12,12,10]],
    "A":   [['x',0,2,2,2,0], [5,7,7,6,5,5]],
    "Bb":  [['x',1,3,3,3,1], [6,8,8,7,6,6], ['x',13,15,15,15,13]],

    // 7th
    "A7":  [['x',0,2,0,2,0], [5,7,5,6,5,5]],
    "B7":  [['x',2,1,2,0,2], [7,9,7,8,7,7]],
    "C7":  [['x',3,2,3,1,0], ['x',3,5,3,5,3], [8,10,8,9,8,8]],
    "D7":  [['x','x',0,2,1,2], ['x',5,7,5,7,5]],
    "E7":  [[0,2,0,1,0,0], [7,9,7,8,7,7]],
    "F7":  [[1,3,1,2,1,1], ['x',8,10,8,10,8]],
    "G7":  [[3,2,0,0,0,1], [3,5,3,4,3,3], ['x',10,12,10,12,10]],

    // Maj7 (common)
    "Cmaj7": [['x',3,2,0,0,0], ['x',3,5,4,5,3], [8,10,9,9,8,8]],
    "Fmaj7": [[1,3,2,2,1,0], ['x',8,10,9,10,8]],
    "Gmaj7": [[3,2,0,0,0,2], [3,5,4,4,3,3]]
  };

  const piano = { targetCenterMidi: 64 };

  global.TayDemData = {
    defaults,
    styles,
    patterns,
    energyRules: ENERGY,
    groovePresets,
    guitarShapes,
    piano,
    version: "data-2.0"
  };

})(typeof window !== "undefined" ? window : this);
