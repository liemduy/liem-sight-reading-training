/*!
 * SightReadingGenV3.1 - constraint-based piano sight-reading excerpt generator
 *
 * Improvements vs v3:
 *  1) Timeline-correct continuity for A–A’–B–A:
 *     - Align A' and Aret octave (2-bar chunk shift) to minimize boundary leaps
 *     - Update melodic state (prev) to match the actual emitted notes
 *  2) Key validation:
 *     - keyMode is limited to "auto" | "C" | "G" | "F" (throws on invalid)
 *  3) Octave choice is range-safe:
 *     - chooseOctClose searches wider and clamps to nearest in-range octave
 *  4) Optional quality gate (best-of-N):
 *     - generatePiece({ candidates: 20 }) samples multiple seeds and returns best-scoring excerpt
 *  5) Beat strength model:
 *     - strong (1&3), medium (2&4), weak (subdivisions) for better rhythmic stability
 *
 * Output format: ABC notation (L:1/8, M:4/4, 2 voices)
 *
 * Usage (browser):
 *   <script src="sightreading-gen-v3.1.js"></script>
 *   const piece = SightReadingGenV3.generatePiece({ level:2, bars:8, bpm:60, candidates: 25 });
 *   ABCJS.renderAbc("score", piece.abc);
 *
 * Usage (Node/CommonJS):
 *   const { generatePiece } = require("./sightreading-gen-v3.1.js");
 *   console.log(generatePiece({bars:8, candidates: 10}).abc);
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SightReadingGenV3 = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* =========================
     RNG (deterministic)
     ========================= */
  function xorshift32(seed) {
    let x = (seed >>> 0) || 1;
    return function () {
      x ^= (x << 13) >>> 0;
      x ^= (x >>> 17) >>> 0;
      x ^= (x << 5) >>> 0;
      return (x >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    try {
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        const a = new Uint32Array(1);
        crypto.getRandomValues(a);
        return a[0] >>> 0;
      }
    } catch (_) {}
    return (Date.now() >>> 0) ^ ((Math.random() * 0xffffffff) >>> 0);
  }

  function mixSeed(baseSeed, i) {
    // golden ratio increment for seed diffusion
    return (baseSeed + (i * 0x9e3779b9)) >>> 0;
  }

  function pick(rnd, arr) {
    return arr[Math.floor(rnd() * arr.length)];
  }

  function sum(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s;
  }

  function starts(durs) {
    let p = 0;
    const out = new Array(durs.length);
    for (let i = 0; i < durs.length; i++) {
      out[i] = p;
      p += durs[i];
    }
    return out;
  }

  function beatStrength(posEighth) {
    // L:1/8 in 4/4 => positions 0..7
    // strong: 1&3 => 0,4 ; medium: 2&4 => 2,6 ; weak: others
    if (posEighth === 0 || posEighth === 4) return 2;
    if (posEighth === 2 || posEighth === 6) return 1;
    return 0;
  }

  /* =========================
     Music model (major only; keys C/G/F)
     ========================= */
  const BASE = ["C", "D", "E", "F", "G", "A", "B"];
  const ALLOWED_KEYS = ["C", "G", "F"];
  const TRIADS = {
    I: [0, 2, 4],
    ii: [1, 3, 5],
    iii: [2, 4, 6],
    IV: [3, 5, 0],
    V: [4, 6, 1],
    vi: [5, 0, 2],
  };

  function validateKeyMode(keyMode) {
    if (keyMode == null || keyMode === "auto") return "auto";
    if (ALLOWED_KEYS.indexOf(keyMode) >= 0) return keyMode;
    throw new Error('Invalid keyMode "' + keyMode + '". Supported: "auto", "C", "G", "F".');
  }

  function rotatedLetters(key) {
    const idx = BASE.indexOf(key);
    if (idx < 0) throw new Error("Internal error: unsupported key " + key);
    const out = [];
    for (let i = 0; i < 7; i++) out.push(BASE[(idx + i) % 7]);
    return out;
  }

  function diatonicIndex(deg, oct) {
    return oct * 7 + deg;
  }

  function noteToAbc(letter, octave) {
    const base = letter.toUpperCase();
    if (octave === 4) return base;
    if (octave < 4) return base + ",".repeat(4 - octave);
    return base.toLowerCase() + "'".repeat(octave - 5);
  }

  /* =========================
     Constraints by level
     ========================= */
  function getConstraints(level) {
    const RH = {
      min: diatonicIndex(0, 4), // ~C4
      max: diatonicIndex(6, 5), // ~B5
      maxLeap: level <= 2 ? 3 : level === 3 ? 4 : 5,
      maxEighthPerBar: level <= 2 ? 2 : level === 3 ? 4 : 6,
    };
    const LH = {
      min: diatonicIndex(0, 2), // ~C2
      max: diatonicIndex(4, 3), // ~G3
      maxLeap: level <= 2 ? 3 : 4,
      allowThird: level >= 3,
    };
    return { RH, LH };
  }

  /* =========================
     Rhythm pools (durations in 1/8; bar sum=8)
     ========================= */
  function rhPool(level) {
    const L1 = [
      [2, 2, 2, 2],
      [4, 2, 2],
      [2, 2, 4],
    ];
    const L2 = L1.concat([
      [2, 2, 1, 1, 2],
      [2, 1, 1, 2, 2],
      [1, 1, 2, 2, 2],
    ]);
    const L3 = L2.concat([
      [3, 1, 2, 2],
      [2, 3, 1, 2],
      [1, 1, 3, 1, 2],
    ]);
    const L4 = L3.concat([
      [1, 1, 1, 1, 2, 2],
      [2, 1, 1, 1, 1, 2],
    ]);
    const L5 = L4.concat([
      [1, 1, 1, 1, 1, 1, 2],
      [2, 1, 1, 2, 1, 1],
    ]);

    if (level <= 1) return L1;
    if (level === 2) return L2;
    if (level === 3) return L3;
    if (level === 4) return L4;
    return L5;
  }

  function lhPool(level) {
    if (level <= 1) return [[8]];
    if (level === 2) return [[8], [4, 4]];
    return [[2, 2, 2, 2]];
  }

  /* =========================
     Harmony (phrase-based; cadence enforced)
     ========================= */
  const MID_CHOICES = ["I", "ii", "IV", "vi"];

  function chooseKey(level, keyMode, rnd) {
    if (keyMode && keyMode !== "auto") return keyMode;
    if (level <= 2) return "C";
    const r = rnd();
    return r < 0.34 ? "C" : r < 0.67 ? "G" : "F";
  }

  function buildPhraseProg(isFinal, rnd) {
    const b2 = pick(rnd, MID_CHOICES);
    const b3 = pick(rnd, ["IV", "ii", "I", "vi"]);
    return isFinal ? ["I", b2, "V", "I"] : ["I", b2, b3, "V"];
  }

  function buildProg(bars, rnd) {
    if (bars % 4 !== 0) throw new Error("bars must be a multiple of 4");
    const phrases = bars / 4;
    const out = [];
    for (let p = 0; p < phrases; p++) out.push.apply(out, buildPhraseProg(p === phrases - 1, rnd));
    out[bars - 2] = "V";
    out[bars - 1] = "I";
    return out;
  }

  /* =========================
     Melody helpers
     ========================= */
  function nearestChordTone(deg, chord) {
    const tones = TRIADS[chord];
    let best = tones[0], bestDist = 99;
    for (let i = 0; i < tones.length; i++) {
      const t = tones[i];
      const d = Math.min((deg - t + 7) % 7, (t - deg + 7) % 7);
      if (d < bestDist) { bestDist = d; best = t; }
    }
    return best;
  }

  function chooseOctClose(targetDeg, prevDeg, prevOct, RH) {
    const prevIdx = diatonicIndex(prevDeg, prevOct);
    const deltas = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
    for (let i = 0; i < deltas.length; i++) {
      const o = prevOct + deltas[i];
      const idx = diatonicIndex(targetDeg, o);
      if (idx >= RH.min && idx <= RH.max) return o;
    }
    let bestOct = prevOct;
    let bestDist = Infinity;
    for (let o = -1; o <= 9; o++) {
      const idx = diatonicIndex(targetDeg, o);
      if (idx < RH.min || idx > RH.max) continue;
      const dist = Math.abs(idx - prevIdx);
      if (dist < bestDist) { bestDist = dist; bestOct = o; }
    }
    return bestOct;
  }

  function nextDegree(level, chord, prevDeg, prevOct, strength, RH, rnd) {
    const tones = TRIADS[chord];
    const cand = [];

    const chordW = strength === 2 ? 8 : strength === 1 ? 6 : 3;
    for (let i = 0; i < tones.length; i++) cand.push({ deg: tones[i], w: chordW });

    const stepW = strength === 2 ? 2 : strength === 1 ? 4 : 6;
    cand.push({ deg: (prevDeg + 1) % 7, w: stepW });
    cand.push({ deg: (prevDeg + 6) % 7, w: stepW });

    if (level >= 3) {
      const thirdW = strength === 2 ? 2 : strength === 1 ? 2 : 1;
      cand.push({ deg: (prevDeg + 2) % 7, w: thirdW });
      cand.push({ deg: (prevDeg + 5) % 7, w: thirdW });
    }

    let total = 0;
    for (let i = 0; i < cand.length; i++) total += cand[i].w;
    let r = rnd() * total;

    let deg = cand[cand.length - 1].deg;
    for (let i = 0; i < cand.length; i++) { r -= cand[i].w; if (r <= 0) { deg = cand[i].deg; break; } }

    let oct = chooseOctClose(deg, prevDeg, prevOct, RH);
    const leap = Math.abs(diatonicIndex(deg, oct) - diatonicIndex(prevDeg, prevOct));
    if (leap > RH.maxLeap) {
      deg = nearestChordTone(prevDeg, chord);
      oct = chooseOctClose(deg, prevDeg, prevOct, RH);
    }
    return { deg, oct };
  }

  function makeBarMelody(level, chord, rhythm, prev, RH, rnd) {
    const st = starts(rhythm);
    const notes = [];
    for (let i = 0; i < rhythm.length; i++) {
      const strength = beatStrength(st[i]);
      const n = nextDegree(level, chord, prev.deg, prev.oct, strength, RH, rnd);
      notes.push(n);
      prev.deg = n.deg; prev.oct = n.oct;
    }
    return notes;
  }

  function enforceFinalCadence(barNotes, chord) {
    if (chord !== "I" || !barNotes.length) return;
    const last = barNotes[barNotes.length - 1];
    if (last.deg !== 0 && last.deg !== 2) last.deg = 0;
  }

  /* =========================
     Motif (2 bars) + variation (A')
     ========================= */
  function motifPlan(level, rnd) {
    const types = level >= 3 ? ["transpose", "contour"] : ["transpose"];
    return { type: pick(rnd, types), tr: rnd() < 0.5 ? 1 : -1 };
  }

  function buildMotif2Bars(level, chords2, rhythm2, prev, RH, rnd) {
    return [
      makeBarMelody(level, chords2[0], rhythm2[0], prev, RH, rnd),
      makeBarMelody(level, chords2[1], rhythm2[1], prev, RH, rnd),
    ];
  }

  function varyMotif2Bars(motif, plan, chords2, rhythm2, RH, rnd) {
    const out = [
      motif[0].map(n => ({ deg: n.deg, oct: n.oct })),
      motif[1].map(n => ({ deg: n.deg, oct: n.oct })),
    ];

    if (plan.type === "transpose") {
      for (let b = 0; b < 2; b++) for (let i = 0; i < out[b].length; i++)
        out[b][i].deg = (out[b][i].deg + plan.tr + 700) % 7;
    } else {
      const b = out[0];
      if (b.length >= 3) {
        const i = 1 + Math.floor(rnd() * (b.length - 2));
        const prevDeg = b[i - 1].deg;
        const cur = b[i].deg;
        const step = (cur - prevDeg + 7) % 7;
        if (step === 1) b[i].deg = (prevDeg + 6) % 7;
        if (step === 6) b[i].deg = (prevDeg + 1) % 7;
      }
    }

    for (let bi = 0; bi < 2; bi++) {
      const chord = chords2[bi];
      const st = starts(rhythm2[bi]);
      for (let i = 0; i < out[bi].length; i++) {
        const strength = beatStrength(st[i]);
        if (strength >= 1) out[bi][i].deg = nearestChordTone(out[bi][i].deg, chord);
      }
      for (let i = 1; i < out[bi].length; i++)
        out[bi][i].oct = chooseOctClose(out[bi][i].deg, out[bi][i - 1].deg, out[bi][i - 1].oct, RH);
    }
    return out;
  }

  function countEighths(rhythm) {
    let c = 0;
    for (let i = 0; i < rhythm.length; i++) if (rhythm[i] === 1) c++;
    return c;
  }

  function pickMotifRhythm2Bars(level, RH, rnd) {
    let r1 = level <= 1 ? [2, 2, 2, 2] : pick(rnd, [[2, 2, 2, 2], [2, 2, 1, 1, 2], [2, 1, 1, 2, 2]]);
    let r2 = level <= 1 ? [2, 2, 2, 2] : pick(rnd, [[2, 2, 2, 2], [2, 2, 1, 1, 2], [2, 1, 1, 2, 2]]);
    if (countEighths(r1) > RH.maxEighthPerBar) r1 = [2, 2, 2, 2];
    if (countEighths(r2) > RH.maxEighthPerBar) r2 = [2, 2, 2, 2];
    return [r1, r2];
  }

  /* =========================
     RH stitching (octave shift per 2-bar chunk)
     ========================= */
  function inRangeNote(note, RH) {
    const idx = diatonicIndex(note.deg, note.oct);
    return idx >= RH.min && idx <= RH.max;
  }

  function inRangeChunk(chunk2Bars, RH) {
    for (let b = 0; b < chunk2Bars.length; b++) {
      for (let i = 0; i < chunk2Bars[b].length; i++) {
        if (!inRangeNote(chunk2Bars[b][i], RH)) return false;
      }
    }
    return true;
  }

  function shiftChunkOct(chunk2Bars, shift) {
    return chunk2Bars.map(bar => bar.map(n => ({ deg: n.deg, oct: n.oct + shift })));
  }

  function boundaryLeap(lastNote, firstNote) {
    return Math.abs(diatonicIndex(lastNote.deg, lastNote.oct) - diatonicIndex(firstNote.deg, firstNote.oct));
  }

  function bestShiftForChunk(chunk2Bars, RH, prevLastNote) {
    const shifts = [0, 1, -1, 2, -2];
    let best = 0;
    let bestScore = Infinity;

    for (let si = 0; si < shifts.length; si++) {
      const sh = shifts[si];
      const cand = shiftChunkOct(chunk2Bars, sh);
      if (!inRangeChunk(cand, RH)) continue;

      const leap = boundaryLeap(prevLastNote, cand[0][0]);
      const score = leap;
      if (score < bestScore) { bestScore = score; best = sh; }
    }
    return best;
  }

  /* =========================
     LH voice-leading (inversions)
     ========================= */
  function chooseBass(chord, LH, prevBass) {
    const tones = TRIADS[chord];
    let options = [tones[0], tones[2]];
    if (LH.allowThird) options = [tones[0], tones[1], tones[2]];

    const cand = [];
    for (let i = 0; i < options.length; i++) {
      const deg = options[i];
      for (let oct = 2; oct <= 3; oct++) {
        const idx = diatonicIndex(deg, oct);
        if (idx < LH.min || idx > LH.max) continue;
        cand.push({ deg, oct, idx });
      }
    }
    if (!cand.length) return { deg: tones[0], oct: 2, idx: diatonicIndex(tones[0], 2) };
    if (!prevBass) { cand.sort((a, b) => a.idx - b.idx); return cand[0]; }

    cand.sort((a, b) => Math.abs(a.idx - prevBass.idx) - Math.abs(b.idx - prevBass.idx));
    for (let i = 0; i < cand.length; i++)
      if (Math.abs(cand[i].idx - prevBass.idx) <= LH.maxLeap) return cand[i];

    return cand[0];
  }

  function makeLHBar(level, chord, prevBassRef, LH, letters, rnd) {
    const rhythm = pick(rnd, lhPool(level));
    const bass = chooseBass(chord, LH, prevBassRef.value);
    prevBassRef.value = bass;

    const tones = TRIADS[chord];
    const root = tones[0], third = tones[1], fifth = tones[2];

    const tokens = [];
    if (rhythm.length === 1) {
      tokens.push(noteToAbc(letters[bass.deg], bass.oct) + "8");
      return { tokens, rhythm };
    }
    if (rhythm.length === 2) {
      tokens.push(noteToAbc(letters[bass.deg], bass.oct) + "4");
      tokens.push(noteToAbc(letters[fifth], bass.oct) + "4");
      return { tokens, rhythm };
    }
    for (let i = 0; i < 4; i++) {
      let deg = bass.deg;
      if (level >= 4) {
        const seq = [root, fifth, third, fifth];
        deg = seq[i];
        if (!LH.allowThird && deg === third) deg = root;
      } else {
        deg = (i % 2 === 0) ? bass.deg : fifth;
      }
      tokens.push(noteToAbc(letters[deg], bass.oct) + "2");
    }
    return { tokens, rhythm };
  }

  /* =========================
     ABC assembly + validation
     ========================= */
  function barTokensFromMelody(barNotes, barRhythm, letters) {
    const t = [];
    for (let i = 0; i < barNotes.length; i++) {
      const n = barNotes[i];
      const d = barRhythm[i];
      t.push(noteToAbc(letters[n.deg], n.oct) + (d === 1 ? "" : String(d)));
    }
    return t.join(" ");
  }

  function joinBars(bars) {
    return bars.join(" | ") + " |]";
  }

  function validateBarRhythm(durs) { return sum(durs) === 8; }
  function validateVoiceDurations(rhByBar, lhByBar) {
    for (let i = 0; i < rhByBar.length; i++) if (!validateBarRhythm(rhByBar[i])) return false;
    for (let i = 0; i < lhByBar.length; i++) if (!validateBarRhythm(lhByBar[i])) return false;
    return true;
  }

  /* =========================
     Quality scoring (best-of-N)
     ========================= */
  function scoreRH(rhNotesByBar, rhRhythmByBar) {
    let steps = 0, moves = 0;
    let dirChanges = 0;
    let prevInterval = 0;

    const flat = [];
    for (let b = 0; b < rhNotesByBar.length; b++) {
      for (let i = 0; i < rhNotesByBar[b].length; i++) flat.push(rhNotesByBar[b][i]);
    }
    for (let i = 1; i < flat.length; i++) {
      const a = flat[i - 1], c = flat[i];
      const interval = diatonicIndex(c.deg, c.oct) - diatonicIndex(a.deg, a.oct);
      const absInt = Math.abs(interval);
      if (absInt <= 1) steps++;
      moves++;
      const sgn = interval === 0 ? 0 : interval > 0 ? 1 : -1;
      const prevSgn = prevInterval === 0 ? 0 : prevInterval > 0 ? 1 : -1;
      if (i >= 2 && sgn !== 0 && prevSgn !== 0 && sgn !== prevSgn) dirChanges++;
      prevInterval = interval;
    }

    let boundaryLeapSum = 0;
    for (let b = 1; b < rhNotesByBar.length; b++) {
      const lastPrev = rhNotesByBar[b - 1][rhNotesByBar[b - 1].length - 1];
      const firstCur = rhNotesByBar[b][0];
      boundaryLeapSum += boundaryLeap(lastPrev, firstCur);
    }

    let eighthPenalty = 0;
    for (let b = 0; b < rhRhythmByBar.length; b++) {
      const e = countEighths(rhRhythmByBar[b]);
      if (e > 2) eighthPenalty += (e - 2);
    }

    const stepRatio = moves ? (steps / moves) : 1;
    const score =
      (stepRatio * 100)
      - (dirChanges * 2.5)
      - (boundaryLeapSum * 1.2)
      - (eighthPenalty * 2.0);

    return score;
  }

  /* =========================
     Core generation (single candidate)
     ========================= */
  function generateSingleCandidate(params) {
    const level = params.level;
    const bpm = params.bpm;
    const bars = params.bars;
    const keyMode = params.keyMode;
    const seed = params.seed;

    const rnd = xorshift32(seed);
    const key = chooseKey(level, keyMode, rnd);
    const letters = rotatedLetters(key);
    const C = getConstraints(level);
    const RH = C.RH, LH = C.LH;
    const prog = buildProg(bars, rnd);

    const rhBars = [], lhBars = [];
    const rhDurByBar = [], lhDurByBar = [];
    const rhNotesByBar = [];

    const prev = { deg: rnd() < 0.5 ? 2 : 3, oct: 4 };
    const prevBassRef = { value: null };

    function gen8Bars(offset) {
      const A_rhythm = pickMotifRhythm2Bars(level, RH, rnd);
      const B_rhythm = pickMotifRhythm2Bars(level, RH, rnd);

      const A_chords = [prog[offset + 0], prog[offset + 1]];
      const Aprime_chords = [prog[offset + 2], prog[offset + 3]];
      const B_chords = [prog[offset + 4], prog[offset + 5]];
      const Aret_chords = [prog[offset + 6], prog[offset + 7]];

      const A = buildMotif2Bars(level, A_chords, A_rhythm, prev, RH, rnd);

      let Aprime = varyMotif2Bars(A, motifPlan(level, rnd), Aprime_chords, A_rhythm, RH, rnd);
      const lastA = A[1][A[1].length - 1];
      const shA = bestShiftForChunk(Aprime, RH, lastA);
      if (shA !== 0) Aprime = shiftChunkOct(Aprime, shA);

      const lastAprime = Aprime[1][Aprime[1].length - 1];
      prev.deg = lastAprime.deg;
      prev.oct = lastAprime.oct;

      const B = buildMotif2Bars(level, B_chords, B_rhythm, prev, RH, rnd);

      let Aret = varyMotif2Bars(A, { type: "transpose", tr: 0 }, Aret_chords, A_rhythm, RH, rnd);
      const lastB = B[1][B[1].length - 1];
      const shR = bestShiftForChunk(Aret, RH, lastB);
      if (shR !== 0) Aret = shiftChunkOct(Aret, shR);

      if (offset + 7 === bars - 1) enforceFinalCadence(Aret[1], prog[offset + 7]);

      const barsMel = [A[0], A[1], Aprime[0], Aprime[1], B[0], B[1], Aret[0], Aret[1]];
      const barsDur = [A_rhythm[0], A_rhythm[1], A_rhythm[0], A_rhythm[1], B_rhythm[0], B_rhythm[1], A_rhythm[0], A_rhythm[1]];

      for (let i = 0; i < 8; i++) {
        const chord = prog[offset + i];

        rhBars.push(barTokensFromMelody(barsMel[i], barsDur[i], letters));
        rhDurByBar.push(barsDur[i]);
        rhNotesByBar.push(barsMel[i]);

        const lh = makeLHBar(level, chord, prevBassRef, LH, letters, rnd);
        lhBars.push(lh.tokens.join(" "));
        lhDurByBar.push(lh.rhythm);
      }

      const lastOut = Aret[1][Aret[1].length - 1];
      prev.deg = lastOut.deg;
      prev.oct = lastOut.oct;
    }

    const blocks = Math.floor(bars / 8);
    const remainder = bars % 8;

    for (let b = 0; b < blocks; b++) gen8Bars(b * 8);

    if (remainder) {
      const start = blocks * 8;
      const pool = rhPool(level);

      for (let i = 0; i < remainder; i++) {
        const chord = prog[start + i];
        let r = pick(rnd, pool);
        if (countEighths(r) > RH.maxEighthPerBar) r = [2, 2, 2, 2];

        const mel = makeBarMelody(level, chord, r, prev, RH, rnd);
        if (start + i === bars - 1) enforceFinalCadence(mel, chord);

        rhBars.push(barTokensFromMelody(mel, r, letters));
        rhDurByBar.push(r);
        rhNotesByBar.push(mel);

        const lh = makeLHBar(level, chord, prevBassRef, LH, letters, rnd);
        lhBars.push(lh.tokens.join(" "));
        lhDurByBar.push(lh.rhythm);
      }
    }

    if (!validateVoiceDurations(rhDurByBar, lhDurByBar)) {
      throw new Error("internal error: duration validation failed");
    }

    const title = "Cold SR v3.1 — " + key + " maj — L" + level + " — " + bars + " bars";
    const abc =
      "X:" + ((seed % 999999) + 1) + "\n" +
      "T:" + title + "\n" +
      "M:4/4\n" +
      "L:1/8\n" +
      "Q:1/4=" + bpm + "\n" +
      "K:" + key + "\n" +
      "V:1 clef=treble name=\"RH\"\n" +
      "V:2 clef=bass name=\"LH\"\n" +
      "%%score (1 2)\n" +
      "[V:1] " + joinBars(rhBars) + "\n" +
      "[V:2] " + joinBars(lhBars) + "\n";

    const qualityScore = scoreRH(rhNotesByBar, rhDurByBar);

    return {
      abc,
      title,
      key,
      bars,
      level,
      bpm,
      seed,
      progression: prog.slice(),
      qualityScore,
    };
  }

  /* =========================
     Public API: generatePiece (best-of-N)
     ========================= */
  function generatePiece(opts) {
    const o = opts || {};
    const level = clampInt(o.level, 1, 5, 2);
    const bpm = clampInt(o.bpm, 30, 180, 60);
    const bars = clampInt(o.bars, 4, 64, 8);
    const keyMode = validateKeyMode(o.keyMode || "auto");
    const baseSeed = (o.seed == null) ? randomSeed() : (o.seed >>> 0);
    const candidates = clampInt(o.candidates, 1, 200, 50);

    if (bars % 4 !== 0) throw new Error("bars must be a multiple of 4 (4/8/12/16/...)");

    let best = null;
    for (let i = 0; i < candidates; i++) {
      const seed = (candidates === 1) ? baseSeed : mixSeed(baseSeed, i);
      const cand = generateSingleCandidate({ level, bpm, bars, keyMode, seed });
      if (!best || cand.qualityScore > best.qualityScore) best = cand;
    }
    return best;
  }

  function signature(abc) {
    return String(abc || "")
      .replace(/^X:.*\n/m, "X:0\n")
      .replace(/^Q:.*\n/m, "Q:0\n")
      .trim();
  }

  function chooseBarsUpToMax(maxBars, seed) {
    const m = clampInt(maxBars, 4, 64, 8);
    if (m % 4 !== 0) throw new Error("maxBars must be multiple of 4");
    const rnd = xorshift32((seed == null) ? randomSeed() : (seed >>> 0));
    const k = Math.floor(rnd() * (m / 4)) + 1; // 1..m/4
    return k * 4;
  }

  function clampInt(v, lo, hi, def) {
    const n = Number.isFinite(v) ? Math.trunc(v) : def;
    return Math.max(lo, Math.min(hi, n));
  }

  return { generatePiece, signature, randomSeed, chooseBarsUpToMax };
});
