// engine.js
// Gộp Audio + Sequencer + Theory + State vào 1 file để đúng “3 file”.
// UI chỉ gọi public API của engine, không đụng Tone.js trực tiếp.

export function createEngine({ Tone, SONGS, PATTERNS, CHORD_DB, GENRE_DEFAULTS }) {
  if (!Tone) throw new Error("Tone.js is required. Load Tone.js before app.js.");

  // =========================
  // Constants (bám file mẫu)
  // =========================
  const SAMPLE_BASE_URL =
    "https://cdn.jsdelivr.net/npm/tonejs-instrument-guitar-acoustic-ogg@1.1.0/";
  const SAMPLE_URLS = {
    E2: "E2.ogg",
    F2: "F2.ogg",
    G2: "G2.ogg",
    A2: "A2.ogg",
    B2: "B2.ogg",
    C3: "C3.ogg",
    D3: "D3.ogg",
    E3: "E3.ogg",
    F3: "F3.ogg",
    G3: "G3.ogg",
    A3: "A3.ogg",
    B3: "B3.ogg",
    C4: "C4.ogg",
    D4: "D4.ogg",
    E4: "E4.ogg",
    F4: "F4.ogg",
    G4: "G4.ogg",
  };

  // Standard tuning MIDI for strings 6->1: E2 A2 D3 G3 B3 E4
  const TUNING_MIDI_6_TO_1 = [40, 45, 50, 55, 59, 64];

  // Strum spread (bám file mẫu): 0.012s ~ 12ms
  const STRUM_DELAY_SEC = 0.012;

  // Start offset để tránh click/glitch (bám file mẫu)
  const TRANSPORT_START_OFFSET = "+0.05";

  // =========================
  // Internal audio nodes
  // =========================
  let guitar = null;
  let reverb = null;
  let limiter = null;
  let metroSynth = null;

  // =========================
  // State + subscriptions
  // =========================
  const subscribers = new Set();

  const state = {
    ready: false,
    playing: false,

    // song context
    song: null,
    timeSig: { num: 4, den: 4 },
    quantize: "BAR",
    bpm: 78,
    transpose: 0, // semitone
    dynamics: 50, // 0..100 (target)
    dynamicsSmoothed: 50, // internal smoothing

    // chord progression extracted from lyrics
    progression: [], // chord names as they appear (raw)
    freestyle: [], // unique chords for freestyle row
    activeChordIndex: 0, // index in progression
    queuedChordIndex: null, // index in progression (nextChord)
    activeChordName: null, // raw chord name (progression[activeChordIndex] or freestyle)
    queuedChordName: null, // raw chord name

    // patterns / slots
    slots: Array.from({ length: 6 }, () => ({ patternId: null })),
    activeSlotIndex: 0,
    activePatternId: null,
    queuedPatternId: null,
    fillArmed: false,

    // sequencer runtime
    stepIndex: 0,
    barIndex: 0,
    stepInBar: 0,
    lastNote: "—",

    // lyrics rendering
    lyricsTokens: [], // {type:'text'|'chord', value, chordIndex?}
    lyricsHtml: "",

    // melody pad
    melody: {
      labels: ["1", "2", "3", "4", "5", "6", "7"],
      notes: [], // note names after transpose (e.g., ["D4","E4"...])
    },

    // modes (optional)
    changeMode: "nextBar", // "nextBar" | "immediate"
    bassMode: "auto", // "auto" | 6 | 5 | 4
    metronome: "off", // "off" | "on"
  };

  function emit() {
    const snapshot = JSON.parse(JSON.stringify(state));
    subscribers.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (e) {
        console.error("[engine] subscriber error", e);
      }
    });
  }

  function subscribe(fn) {
    subscribers.add(fn);
    fn(JSON.parse(JSON.stringify(state)));
    return () => subscribers.delete(fn);
  }

  // =========================
  // Utility: time signature & steps
  // =========================
  function resolveTimeSignature(song) {
    if (song?.time_signature?.num && song?.time_signature?.den) return song.time_signature;
    const g = GENRE_DEFAULTS[song?.genre_id] || GENRE_DEFAULTS.bolero;
    return g.time_signature;
  }

  function resolveQuantize(song) {
    if (song?.quantize) return song.quantize;
    const g = GENRE_DEFAULTS[song?.genre_id] || GENRE_DEFAULTS.bolero;
    return g.quantize || "BAR";
  }

  // 8th-note grid:
  // - den=4: 1 beat = 2 steps (8th)
  // - den=8: 1 beat = 1 step (8th)
  function stepsPerBar(timeSig) {
    const { num, den } = timeSig;
    const stepsPerBeat = den === 4 ? 2 : 1;
    return num * stepsPerBeat;
  }

  // =========================
  // Theory: parse lyrics & transpose (visual)
  // =========================
  function parseLyrics(lyricsText) {
    const tokens = [];
    const progression = [];
    const re = /\[([^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    let chordIndex = 0;

    while ((match = re.exec(lyricsText)) !== null) {
      const before = lyricsText.slice(lastIndex, match.index);
      if (before) tokens.push({ type: "text", value: escapeHtml(before) });

      const chordRaw = (match[1] || "").trim();
      const idx = chordIndex++;
      tokens.push({ type: "chord", value: chordRaw, chordIndex: idx });
      progression.push(chordRaw);

      lastIndex = match.index + match[0].length;
    }
    const tail = lyricsText.slice(lastIndex);
    if (tail) tokens.push({ type: "text", value: escapeHtml(tail) });

    return { tokens, progression };
  }

  function uniqueByFirstAppearance(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      if (seen.has(x)) continue;
      seen.add(x);
      out.push(x);
    }
    return out;
  }

  // Visual transpose chord name (root only, suffix preserved).
  // MVP supports roots: A-G with optional #/b. Suffix: whatever remains (m,7,m7,...).
  const NOTE_ORDER_SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTE_ORDER_FLATS  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  function parseChordName(chord) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(chord.trim());
    if (!m) return null;
    return { root: m[1] + (m[2] || ""), suffix: m[3] || "" };
  }

  function noteIndex(root) {
    const iSharp = NOTE_ORDER_SHARPS.indexOf(root);
    if (iSharp !== -1) return iSharp;
    const iFlat = NOTE_ORDER_FLATS.indexOf(root);
    if (iFlat !== -1) return iFlat;
    return -1;
  }

  function transposeRoot(root, semis, preferSharps = true) {
    const idx = noteIndex(root);
    if (idx < 0) return root;
    const next = (idx + semis) % 12;
    const fixed = next < 0 ? next + 12 : next;
    return (preferSharps ? NOTE_ORDER_SHARPS : NOTE_ORDER_FLATS)[fixed];
  }

  function preferSharpsForKey(key) {
    // Heuristic: nếu original_key có 'b' -> prefer flats; nếu có '#'/khác -> prefer sharps
    if (!key) return true;
    if (key.includes("b")) return false;
    if (key.includes("#")) return true;
    // keys tự nhiên: mặc định sharps
    return true;
  }

  function transposeChordName(chordRaw, semis, preferSharps) {
    const p = parseChordName(chordRaw);
    if (!p) return chordRaw;
    const rootT = transposeRoot(p.root, semis, preferSharps);
    return `${rootT}${p.suffix}`;
  }

  function buildLyricsHtml(tokens) {
    const preferSharps = preferSharpsForKey(state.song?.original_key);
    const activeIdx = state.activeChordIndex;
    const queuedIdx = state.queuedChordIndex;

    return tokens
      .map((t) => {
        if (t.type === "text") return t.value;
        const chordDisp = transposeChordName(t.value, state.transpose, preferSharps);
        let cls = "chord";
        if (t.chordIndex === activeIdx) cls += " chord-active";
        else if (queuedIdx != null && t.chordIndex === queuedIdx) cls += " chord-queued";
        else if (t.chordIndex < activeIdx) cls += " chord-past";
        return `<span class="${cls}" data-chord-index="${t.chordIndex}">[${escapeHtml(
          chordDisp
        )}]</span>`;
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =========================
  // Audio: voicing + trigger (bám file mẫu)
  // =========================
  function midiToNoteName(midi) {
    return Tone.Frequency(midi, "midi").toNote();
  }

  function getNoteForString(chordRaw, stringNum) {
    const entry = CHORD_DB[chordRaw];
    if (!entry) return null;
    const idx = 6 - stringNum; // 6->0 ... 1->5
    const fret = entry.frets[idx];
    if (fret == null || fret < 0) return null;
    const midi = TUNING_MIDI_6_TO_1[idx] + fret + state.transpose;
    return midiToNoteName(midi);
  }

  function activeStrings(chordRaw) {
    const arr = [];
    for (let s = 6; s >= 1; s--) {
      if (getNoteForString(chordRaw, s)) arr.push(s);
    }
    return arr; // 6->1
  }

  function safeTrigger(note, duration, time, vel) {
    if (!note || !guitar) return;
    guitar.triggerAttackRelease(note, duration, time, vel);
    state.lastNote = note;
  }

  function doStrum(direction, time, velBase) {
    const chordRaw = state.activeChordName;
    if (!chordRaw) return;

    const strings = activeStrings(chordRaw);
    const ordered = direction === "down" ? strings : [...strings].reverse();

    ordered.forEach((s, idx) => {
      const n = getNoteForString(chordRaw, s);
      if (!n) return;
      safeTrigger(n, "2n", time + idx * STRUM_DELAY_SEC, velBase);
    });
  }

  function pickBassString(chordRaw, which) {
    const entry = CHORD_DB[chordRaw];
    const root = entry?.bass ?? 6;

    if (state.bassMode !== "auto") return Number(state.bassMode);

    if (which === "root") return root;
    // alt: if root on 6/5 -> 4; if root on 4 -> 5 (best-effort)
    if (root === 4) return 5;
    return 4;
  }

  function doBass(which, time, bassVel) {
    const chordRaw = state.activeChordName;
    if (!chordRaw) return;

    const s = pickBassString(chordRaw, which);
    const n = getNoteForString(chordRaw, s);
    if (!n) return;
    safeTrigger(n, "2n", time, bassVel);
  }

  function doPluck(stringNum, time, velBase) {
    const chordRaw = state.activeChordName;
    if (!chordRaw) return;
    const n = getNoteForString(chordRaw, stringNum);
    if (!n) return;
    safeTrigger(n, "2n", time, velBase);
  }

  function maybeMetronome(stepInBar, time) {
    if (state.metronome !== "on" || !metroSynth) return;

    const accent = stepInBar === 0;
    const isBeat = stepInBar % 2 === 0;

    const isSixEight = state.song?.genre_id === "six_eight";
    const isPulse = isSixEight ? stepInBar === 0 || stepInBar === 3 : isBeat;

    if (!isPulse) return;
    metroSynth.triggerAttackRelease("C2", "32n", time, accent ? 0.85 : 0.55);
  }

  // =========================
  // Dynamics mapping (smooth)
  // =========================
  function updateDynamicsSmoothing() {
    // simple low-pass
    const a = 0.18; // responsiveness
    state.dynamicsSmoothed = state.dynamicsSmoothed + (state.dynamics - state.dynamicsSmoothed) * a;
  }

  function dynamicsToVelocity(dyn) {
    // map 0..100 -> 0.35..0.85
    const t = Math.min(100, Math.max(0, dyn)) / 100;
    const base = 0.35 + t * (0.85 - 0.35);
    const bass = Math.min(1.0, base + 0.15);
    return { baseVel: base, bassVel: bass };
  }

  function dynRegion(dyn) {
    if (dyn <= 30) return "SOFT";
    if (dyn <= 70) return "MID";
    return "HARD";
  }

  // =========================
  // Sequencer (bám file mẫu: scheduleRepeat "8n")
  // =========================
  function getPatternById(id) {
    return PATTERNS.find((p) => p.id === id) || null;
  }

  function resolveDefaultPatternForSong(song) {
    // ưu tiên pattern cùng genre và khớp timeSig
    const ts = resolveTimeSignature(song);
    const candidates = PATTERNS.filter((p) => p.genre_id === song.genre_id);
    const match = candidates.find((p) =>
      (p.compatible_time_signatures || []).some((x) => x.num === ts.num && x.den === ts.den)
    );
    return match || candidates[0] || PATTERNS[0] || null;
  }

  function resetTransportState() {
    Tone.Transport.stop();
    Tone.Transport.cancel(0);
    state.stepIndex = 0;
    state.barIndex = 0;
    state.stepInBar = 0;
    Tone.Transport.scheduleRepeat(scheduleTick, "8n");
  }

  function shouldCommitAtStep(stepInBar) {
    if (state.changeMode === "immediate") return true;
    // nextBar: commit only at bar boundary
    return stepInBar === 0;
  }

  function commitQueuedAtBarBoundary(stepInBar) {
    if (stepInBar !== 0) return;

    if (state.stepIndex > 0) state.barIndex += 1;

    if (state.queuedChordName) {
      state.activeChordName = state.queuedChordName;
      if (state.queuedChordIndex != null) state.activeChordIndex = state.queuedChordIndex;
      state.queuedChordName = null;
      state.queuedChordIndex = null;
    }

    if (state.queuedPatternId) {
      state.activePatternId = state.queuedPatternId;
      state.queuedPatternId = null;
    }

    // Fill chỉ tác động 1 lần
    // (fillArmed reset trong scheduleTick khi đã “chạy fill”)
  }

  function isInFillWindow(stepInBar, stepsBar) {
    // fill ở 1 beat cuối: với den=4 => 2 step cuối; với den=8 => 2 step cuối vẫn ok
    return stepInBar >= Math.max(0, stepsBar - 2);
  }

  function scheduleTick(time) {
    const pattern = getPatternById(state.activePatternId);
    if (!pattern || !state.activeChordName || !guitar) {
      state.stepIndex += 1;
      emit();
      return;
    }

    const len = pattern.steps.length;
    const stepInBar = state.stepIndex % len;
    state.stepInBar = stepInBar;

    // Commit chord/pattern ở đầu ô nhịp (nextBar)
    commitQueuedAtBarBoundary(stepInBar);

    updateDynamicsSmoothing();
    maybeMetronome(stepInBar, time);

    // Resolve step
    let st = pattern.steps[stepInBar] || { type: "rest" };

    // Fill: nếu armed và đang ở cửa sổ fill thì thay step bằng fill step mặc định
    const stepsBar = stepsPerBar(state.timeSig);
    if (state.fillArmed && isInFillWindow(stepInBar, stepsBar)) {
      // default fill: D (step -2) then U (step -1)
      const isLast = stepInBar === Math.max(0, stepsBar - 1);
      st = { type: isLast ? "strumUp" : "strumDown" };
      if (isLast) state.fillArmed = false;
    }

    const dyn = state.dynamicsSmoothed;
    const region = dynRegion(dyn);
    const { baseVel, bassVel } = dynamicsToVelocity(dyn);

    // SOFT region policy: chỉ bass + pluck, hạn chế strum
    if (region === "SOFT") {
      if (st.type === "strumDown" || st.type === "strumUp") {
        // thay strum bằng pluck string 3 để giữ nhịp nhưng nhẹ
        st = { type: "pluck", string: 3 };
      }
    }

    // MID region: cho strum nhưng ít dây hơn (tối ưu đơn giản: giảm vel)
    // HARD region: vel cao, strum đầy đủ.

    switch (st.type) {
      case "rest":
        break;

      case "bass": {
        const which = st.which || "root";
        doBass(which, time, bassVel);
        break;
      }

      case "pluck": {
        const s = Number(st.string || 3);
        doPluck(s, time, baseVel);
        break;
      }

      case "strumDown":
        doStrum("down", time, region === "MID" ? baseVel * 0.85 : baseVel);
        break;

      case "strumUp":
        doStrum("up", time, region === "MID" ? baseVel * 0.85 : baseVel);
        break;

      default:
        break;
    }

    // Update lyrics html (highlight active/queued)
    state.lyricsHtml = buildLyricsHtml(state.lyricsTokens);

    // Update melody pad notes
    rebuildMelodyNotes();

    state.stepIndex += 1;
    emit();
  }

  // =========================
  // Melody pad (7 bậc) - MVP
  // =========================
  function rebuildMelodyNotes() {
    // MVP: lấy key root từ song.original_key (root only), build major scale intervals.
    // Nếu bài minor (key ends with 'm'), dùng natural minor.
    const k = (state.song?.original_key || "C").trim();
    const isMinor = k.endsWith("m");
    const keyRoot = isMinor ? k.slice(0, -1) : k;

    const preferSharps = preferSharpsForKey(keyRoot);
    const rootIdx = noteIndex(keyRoot);
    if (rootIdx < 0) {
      state.melody.notes = [];
      return;
    }

    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
    const intervals = isMinor ? minorIntervals : majorIntervals;

    // Choose a comfortable octave around 4th string range: start at C4-ish.
    // We'll map to note names; octave selection is heuristic.
    // MIDI base: C4 = 60. For root, pick around 60..67.
    const rootName = transposeRoot(keyRoot, state.transpose, preferSharps);
    const rootIndexAfter = noteIndex(rootName);
    if (rootIndexAfter < 0) {
      state.melody.notes = [];
      return;
    }

    // Base MIDI: find nearest root to 60
    const baseMidi = 60 + ((rootIndexAfter - noteIndex("C") + 12) % 12);
    state.melody.notes = intervals.map((itv) => midiToNoteName(baseMidi + itv));
  }

  // =========================
  // Public API
  // =========================
  async function init() {
    if (state.ready) return;

    await Tone.start();

    guitar = new Tone.Sampler({ urls: SAMPLE_URLS, baseUrl: SAMPLE_BASE_URL });

    reverb = new Tone.Reverb({ decay: 2.0, wet: 0.16 });
    limiter = new Tone.Limiter(-1.0);

    guitar.connect(reverb);
    reverb.connect(limiter);
    limiter.toDestination();

    // Optional: metronome synth (connect limiter)
    metroSynth = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.01 },
    }).connect(limiter);

    await Tone.loaded();

    state.ready = true;
    resetTransportState();
    emit();
  }

  function loadSong(songOrId) {
    const song =
      typeof songOrId === "string" ? SONGS.find((s) => s.id === songOrId) : songOrId;

    if (!song) throw new Error("Song not found.");

    state.song = song;
    state.timeSig = resolveTimeSignature(song);
    state.quantize = resolveQuantize(song);

    state.bpm = Number(song.bpm || 78);
    Tone.Transport.bpm.value = state.bpm;

    state.transpose = 0;
    state.dynamics = 50;
    state.dynamicsSmoothed = 50;

    const { tokens, progression } = parseLyrics(song.lyrics || "");
    state.lyricsTokens = tokens;
    state.progression = progression;
    state.freestyle = uniqueByFirstAppearance(progression);

    state.activeChordIndex = 0;
    state.queuedChordIndex = null;
    state.activeChordName = progression[0] || "C";
    state.queuedChordName = null;

    // default patterns + slots
    const def = resolveDefaultPatternForSong(song);
    state.activePatternId = def?.id || PATTERNS[0]?.id || null;
    state.queuedPatternId = null;
    state.activeSlotIndex = 0;
    state.slots = Array.from({ length: 6 }, () => ({ patternId: null }));
    if (state.activePatternId) state.slots[0].patternId = state.activePatternId;

    state.fillArmed = false;

    state.stepIndex = 0;
    state.barIndex = 0;
    state.stepInBar = 0;
    state.lastNote = "—";

    state.lyricsHtml = buildLyricsHtml(state.lyricsTokens);
    rebuildMelodyNotes();

    resetTransportState();
    emit();
  }

  async function play() {
    if (!state.ready) throw new Error("Engine not ready. Call init() first.");
    state.stepIndex = 0;
    state.barIndex = 0;
    state.stepInBar = 0;
    state.queuedChordName = null;
    state.queuedChordIndex = null;
    state.fillArmed = false;

    await Tone.start();
    Tone.Transport.start(TRANSPORT_START_OFFSET);
    state.playing = true;
    emit();
  }

  function stop() {
    Tone.Transport.stop();
    state.playing = false;
    emit();
  }

  function nextChord() {
    // queue chord theo progression
    if (!state.progression.length) return;
    const nextIdx = Math.min(state.activeChordIndex + 1, state.progression.length - 1);
    const chordRaw = state.progression[nextIdx];

    if (state.changeMode === "immediate") {
      state.activeChordIndex = nextIdx;
      state.activeChordName = chordRaw;
      state.queuedChordIndex = null;
      state.queuedChordName = null;
    } else {
      state.queuedChordIndex = nextIdx;
      state.queuedChordName = chordRaw;
    }

    state.lyricsHtml = buildLyricsHtml(state.lyricsTokens);
    emit();
  }

  function auditionChord(chordRaw) {
    // Nếu đang stop: đánh thử chord ngay (down strum)
    // Nếu đang play: queue như “nextBar”
    if (!chordRaw) return;

    if (!state.playing) {
      state.activeChordName = chordRaw;
      state.activeChordIndex = 0; // lyric highlight không còn ý nghĩa khi audition; giữ 0 cho đơn giản
      const t = Tone.now() + 0.02;
      doStrum("down", t, dynamicsToVelocity(state.dynamicsSmoothed).baseVel);
      state.lyricsHtml = buildLyricsHtml(state.lyricsTokens);
      emit();
      return;
    }

    if (state.changeMode === "immediate") {
      state.activeChordName = chordRaw;
      state.queuedChordName = null;
      state.queuedChordIndex = null;
    } else {
      state.queuedChordName = chordRaw;
      state.queuedChordIndex = null; // freestyle chord không map vào lyric index
    }

    state.lyricsHtml = buildLyricsHtml(state.lyricsTokens);
    emit();
  }

  function fill() {
    state.fillArmed = true;
    emit();
  }

  function setTranspose(semitones) {
    const v = Math.max(-12, Math.min(12, Number(semitones) || 0));
    state.transpose = v;
    state.lyricsHtml = buildLyricsHtml(state.lyricsTokens);
    rebuildMelodyNotes();
    emit();
  }

  function adjustTranspose(delta) {
    setTranspose(state.transpose + delta);
  }

  function setBpm(bpm) {
    const v = Math.max(40, Math.min(200, Number(bpm) || state.bpm));
    state.bpm = v;
    Tone.Transport.bpm.value = v;
    emit();
  }

  function adjustBpm(delta) {
    setBpm(state.bpm + delta);
  }

  function setDynamics(v) {
    state.dynamics = Math.max(0, Math.min(100, Number(v) || 0));
    emit();
  }

  function selectSlot(slotIndex) {
    const i = Math.max(0, Math.min(5, Number(slotIndex) || 0));
    state.activeSlotIndex = i;

    const pid = state.slots[i]?.patternId;
    if (!pid) {
      emit();
      return;
    }

    // Quantize switching at bar boundary
    state.queuedPatternId = pid;
    emit();
  }

  function assignPatternToSlot(slotIndex, patternId) {
    const i = Math.max(0, Math.min(5, Number(slotIndex) || 0));
    const p = getPatternById(patternId);
    if (!p) throw new Error("Pattern not found.");

    state.slots[i].patternId = p.id;

    // Nếu đang gán vào slot đang active, cho queue đổi luôn
    if (i === state.activeSlotIndex) {
      state.queuedPatternId = p.id;
    }

    emit();
  }

  function getPatternOptionsForSong() {
    if (!state.song) return [];
    const ts = state.timeSig;
    return PATTERNS.filter((p) => {
      if (p.genre_id !== state.song.genre_id) return false;
      const compat = p.compatible_time_signatures || [];
      if (!compat.length) return true;
      return compat.some((x) => x.num === ts.num && x.den === ts.den);
    });
  }

  function setChangeMode(mode) {
    state.changeMode = mode === "immediate" ? "immediate" : "nextBar";
    emit();
  }

  function setBassMode(mode) {
    if (mode === "auto") state.bassMode = "auto";
    else if (mode === 6 || mode === 5 || mode === 4 || mode === "6" || mode === "5" || mode === "4")
      state.bassMode = Number(mode);
    emit();
  }

  function setMetronome(mode) {
    state.metronome = mode === "on" ? "on" : "off";
    emit();
  }

  function playMelodyDegree(degreeIndex) {
    const i = Math.max(0, Math.min(6, Number(degreeIndex) || 0));
    const note = state.melody.notes[i];
    if (!note) return;
    const vel = dynamicsToVelocity(state.dynamicsSmoothed).baseVel * 0.85;
    safeTrigger(note, "8n", Tone.now() + 0.02, vel);
    emit();
  }

  return {
    // lifecycle
    init,
    loadSong,
    play,
    stop,

    // core controls
    nextChord,
    fill,
    auditionChord,

    // settings
    setTranspose,
    adjustTranspose,
    setBpm,
    adjustBpm,
    setDynamics,
    setChangeMode,
    setBassMode,
    setMetronome,

    // patterns
    selectSlot,
    assignPatternToSlot,
    getPatternOptionsForSong,

    // melody pad
    playMelodyDegree,

    // state
    subscribe,
  };
}
