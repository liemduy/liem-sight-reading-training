// engine.js
// Engine: Audio (Tone.js) + Sequencer (pattern) + Music-theory helpers + State store
// Mục tiêu: UI chỉ gọi public API; không đụng trực tiếp Tone.js.

export function createEngine({ Tone, SONGS, PATTERNS, CHORD_DB, GENRE_DEFAULTS }) {
  if (!Tone) throw new Error("Tone.js is required. Load Tone.js before app.js.");

  // =========================
  // Sample config (MP3-first for mobile/Safari compatibility)
  // =========================
  const SAMPLE_PACK = {
    mp3: {
      baseUrl: "https://cdn.jsdelivr.net/npm/tonejs-instrument-guitar-acoustic-mp3@1.1.2/",
      ext: "mp3",
    },
    ogg: {
      baseUrl: "https://cdn.jsdelivr.net/npm/tonejs-instrument-guitar-acoustic-ogg@1.1.0/",
      ext: "ogg",
    },
  };

  function browserCanPlayOggVorbis() {
    try {
      const a = document.createElement("audio");
      return Boolean(a && a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"'));
    } catch {
      return false;
    }
  }

  // Thực dụng: MP3 là mặc định (ổn nhất trên iOS/Safari). Nếu bạn muốn ưu tiên OGG
  // trên Chrome/Firefox, có thể đổi điều kiện bên dưới.
  const SELECTED_PACK = SAMPLE_PACK.mp3; // browserCanPlayOggVorbis() ? SAMPLE_PACK.ogg : SAMPLE_PACK.mp3;

  const SAMPLE_URLS = {
    E2: `E2.${SELECTED_PACK.ext}`,
    F2: `F2.${SELECTED_PACK.ext}`,
    G2: `G2.${SELECTED_PACK.ext}`,
    A2: `A2.${SELECTED_PACK.ext}`,
    B2: `B2.${SELECTED_PACK.ext}`,
    C3: `C3.${SELECTED_PACK.ext}`,
    D3: `D3.${SELECTED_PACK.ext}`,
    E3: `E3.${SELECTED_PACK.ext}`,
    F3: `F3.${SELECTED_PACK.ext}`,
    G3: `G3.${SELECTED_PACK.ext}`,
    A3: `A3.${SELECTED_PACK.ext}`,
    B3: `B3.${SELECTED_PACK.ext}`,
    C4: `C4.${SELECTED_PACK.ext}`,
    D4: `D4.${SELECTED_PACK.ext}`,
    E4: `E4.${SELECTED_PACK.ext}`,
    F4: `F4.${SELECTED_PACK.ext}`,
    G4: `G4.${SELECTED_PACK.ext}`,
  };

  const LOAD_TIMEOUT_MS = 25_000;

  function withTimeout(promise, ms, msg) {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(msg)), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
  }

  // =========================
  // Timing constants
  // =========================
  const TRANSPORT_START_OFFSET = "+0.05"; // tránh click khi start

  // Standard tuning (E2 A2 D3 G3 B3 E4) mapping strings 6..1
  const TUNING_MIDI_6_TO_1 = [40, 45, 50, 55, 59, 64];

  // =========================
  // State
  // =========================
  const state = {
    // runtime
    ready: false,
    playing: false,

    // current song
    song: null,
    bpm: 78,
    transpose: 0, // semitones

    // controls
    dynamics: 50,
    dynamicsSmoothed: 50, // internal smoothing
    changeMode: "nextBar", // "nextBar" | "immediate"
    bassMode: "auto", // "auto" | 6 | 5 | 4
    metronome: "off", // "off" | "on"

    // lyric parsing / progression
    lyricsTokens: [],
    progression: [],
    freestyle: [],
    activeChordIndex: 0,
    queuedChordIndex: null,
    activeChordName: null,
    queuedChordName: null,

    // patterns / slots
    slots: Array.from({ length: 6 }, () => ({ patternId: null })),
    activeSlotIndex: 0,
    activePatternId: null,
    queuedPatternId: null,

    // playback counters
    stepIndex: 0,
    barIndex: 0,
    stepInBar: 0,
    lastNote: "—",

    // computed UI
    lyricsHtml: "",

    // melody pad (7 bậc)
    melody: { notes: [] },

    // song defaults
    timeSig: { num: 4, den: 4 },
    quantize: "BAR",

    // fill
    fillArmed: false,
  };

  // Dirty flags để tránh rebuild nặng mỗi tick
  let lyricsDirty = true;
  let melodyDirty = true;

  // =========================
  // Audio nodes
  // =========================
  let guitar = null;
  let reverb = null;
  let limiter = null;
  let metroSynth = null;

  // =========================
  // Simple store
  // =========================
  const subs = new Set();

  function snapshot() {
    // Trả snapshot “đủ dùng” cho UI, hạn chế clone nặng.
    return {
      ready: state.ready,
      playing: state.playing,

      song: state.song,
      bpm: state.bpm,
      transpose: state.transpose,

      dynamics: state.dynamics,
      dynamicsSmoothed: state.dynamicsSmoothed,
      changeMode: state.changeMode,
      bassMode: state.bassMode,
      metronome: state.metronome,

      lyricsHtml: state.lyricsHtml,

      progression: state.progression,
      freestyle: state.freestyle,
      activeChordIndex: state.activeChordIndex,
      queuedChordIndex: state.queuedChordIndex,
      activeChordName: state.activeChordName,
      queuedChordName: state.queuedChordName,

      slots: state.slots.map((s) => ({ patternId: s.patternId })),
      activeSlotIndex: state.activeSlotIndex,
      activePatternId: state.activePatternId,
      queuedPatternId: state.queuedPatternId,

      stepIndex: state.stepIndex,
      barIndex: state.barIndex,
      stepInBar: state.stepInBar,
      lastNote: state.lastNote,

      melody: { notes: Array.isArray(state.melody.notes) ? [...state.melody.notes] : [] },

      timeSig: state.timeSig,
      quantize: state.quantize,
      fillArmed: state.fillArmed,
    };
  }

  function emit() {
    const s = snapshot();
    subs.forEach((fn) => {
      try {
        fn(s);
      } catch (e) {
        console.error("Subscriber error:", e);
      }
    });
  }

  function subscribe(fn) {
    subs.add(fn);
    fn(snapshot());
    return () => subs.delete(fn);
  }

  // =========================
  // Utility: time signature & quantize
  // =========================
  function resolveTimeSignature(song) {
    if (song?.time_signature?.num && song?.time_signature?.den) return song.time_signature;
    const g = GENRE_DEFAULTS?.[song?.genre_id] || GENRE_DEFAULTS?.bolero;
    return g?.time_signature || { num: 4, den: 4 };
  }

  function resolveQuantize(song) {
    if (song?.quantize) return song.quantize;
    const g = GENRE_DEFAULTS?.[song?.genre_id] || GENRE_DEFAULTS?.bolero;
    return g?.quantize || "BAR";
  }

  // =========================
  // Utility: lyrics parsing
  // =========================
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function parseLyrics(lyricsText) {
    const tokens = [];
    const progression = [];

    const txt = String(lyricsText || "");
    const re = /\[([^\]]+)\]/g;

    let last = 0;
    let chordIndex = 0;

    for (;;) {
      const m = re.exec(txt);
      if (!m) break;

      const start = m.index;
      const end = start + m[0].length;

      const before = txt.slice(last, start);
      if (before) tokens.push({ type: "text", value: escapeHtml(before) });

      const chordRaw = (m[1] || "").trim();
      if (chordRaw) {
        tokens.push({ type: "chord", value: chordRaw, chordIndex });
        progression.push(chordRaw);
        chordIndex += 1;
      } else {
        // rỗng: giữ nguyên như text
        tokens.push({ type: "text", value: escapeHtml(m[0]) });
      }

      last = end;
    }

    const tail = txt.slice(last);
    if (tail) tokens.push({ type: "text", value: escapeHtml(tail) });

    return { tokens, progression };
  }

  function uniqueByFirstAppearance(arr) {
    const seen = new Set();
    const out = [];
    for (const x of arr || []) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }

  // =========================
  // Utility: chord transpose
  // =========================
  const NOTE_ORDER_SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTE_ORDER_FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  function parseChordName(chord) {
    const m = /^([A-G])([#b]?)(.*)$/.exec(String(chord || "").trim());
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
    if (!key) return true;
    if (String(key).includes("b")) return false;
    if (String(key).includes("#")) return true;
    return true;
  }

  function transposeChordName(chordRaw, semis, preferSharps = true) {
    const p = parseChordName(chordRaw);
    if (!p) return chordRaw;
    const nextRoot = transposeRoot(p.root, semis, preferSharps);
    return `${nextRoot}${p.suffix || ""}`;
  }

  function buildLyricsHtml(tokens) {
    const preferSharps = preferSharpsForKey(state.song?.original_key);
    const activeIdx = state.activeChordIndex;
    const queuedIdx = state.queuedChordIndex;

    return (tokens || [])
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

  function refreshLyricsIfNeeded() {
    if (!lyricsDirty) return;
    state.lyricsHtml = buildLyricsHtml(state.lyricsTokens);
    lyricsDirty = false;
  }

  // =========================
  // Audio: voicing + trigger
  // =========================
  function midiToNoteName(midi) {
    return Tone.Frequency(midi, "midi").toNote();
  }

  function getNoteForString(chordRaw, stringNum) {
    const entry = CHORD_DB?.[chordRaw];
    if (!entry) return null;
    const idx = 6 - stringNum; // string 6->0 ... 1->5
    const fret = entry.frets?.[idx];
    if (fret == null || fret < 0) return null;
    const midi = TUNING_MIDI_6_TO_1[idx] + fret + state.transpose;
    return midiToNoteName(midi);
  }

  function safeTrigger(note, dur, time, vel) {
    if (!guitar) return;
    try {
      guitar.triggerAttackRelease(note, dur, time, vel);
      state.lastNote = note;
    } catch (e) {
      // Không crash transport khi sampler bị dispose hoặc chưa sẵn.
      console.warn("trigger failed:", e);
    }
  }

  function pickBassString(chordRaw) {
    if (state.bassMode !== "auto") return Number(state.bassMode);
    const entry = CHORD_DB?.[chordRaw];
    const bass = entry?.bass;
    if (bass === 6 || bass === 5 || bass === 4) return bass;
    // fallback: ưu tiên dây 6 -> 5 -> 4 có nốt
    if (getNoteForString(chordRaw, 6)) return 6;
    if (getNoteForString(chordRaw, 5)) return 5;
    if (getNoteForString(chordRaw, 4)) return 4;
    return 5;
  }

  function playBass(chordRaw, time, vel) {
    const stringNum = pickBassString(chordRaw);
    const n = getNoteForString(chordRaw, stringNum);
    if (!n) return;
    safeTrigger(n, "8n", time, vel);
  }

  function playPluck(chordRaw, stringNum, time, vel) {
    const n = getNoteForString(chordRaw, stringNum);
    if (!n) return;
    safeTrigger(n, "8n", time, vel);
  }

  function strum(chordRaw, direction, time, velBase) {
    // direction: "down" (6->1) or "up" (1->6)
    const order = direction === "up" ? [1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1];
    const STRUM_DELAY = 0.012; // seconds

    let i = 0;
    for (const sNum of order) {
      const n = getNoteForString(chordRaw, sNum);
      if (!n) continue;
      safeTrigger(n, "8n", time + i * STRUM_DELAY, velBase);
      i += 1;
    }
  }

  // =========================
  // Metronome
  // =========================
  function maybeMetronome(stepInBar, time) {
    if (state.metronome !== "on" || !metroSynth) return;

    const accent = stepInBar === 0;
    const isBeat = stepInBar % 2 === 0; // 8n grid: beat at even indices (0,2,4,6)

    // 6/8 pulse: 1 & a 2 & a => pulse on 0 and 3 (giống file mẫu)
    const isSixEight = state.song?.genre_id === "six_eight";
    const isPulse = isSixEight ? stepInBar === 0 || stepInBar === 3 : isBeat;

    if (!isPulse) return;
    metroSynth.triggerAttackRelease("C2", "32n", time, accent ? 0.85 : 0.55);
  }

  // =========================
  // Dynamics
  // =========================
  function updateDynamicsSmoothing() {
    const a = 0.18; // responsiveness
    state.dynamicsSmoothed = state.dynamicsSmoothed + (state.dynamics - state.dynamicsSmoothed) * a;
  }

  function dynRegion(dyn) {
    if (dyn <= 30) return "SOFT";
    if (dyn <= 70) return "MID";
    return "HARD";
  }

  function dynamicsToVelocity(dyn) {
    // map 0..100 -> ~0.35..0.85
    const t = Math.min(100, Math.max(0, dyn)) / 100;
    const baseVel = 0.35 + t * 0.5;
    const bassVel = Math.min(0.95, baseVel + 0.08);
    return { baseVel, bassVel };
  }

  // =========================
  // Patterns / Song defaults
  // =========================
  function getPatternById(id) {
    return (PATTERNS || []).find((p) => p.id === id) || null;
  }

  function resolveDefaultPatternForSong(song) {
    // ưu tiên GENRE_DEFAULTS -> patternId -> match trong PATTERNS
    const g = GENRE_DEFAULTS?.[song?.genre_id] || GENRE_DEFAULTS?.bolero || {};
    const defId = g.default_pattern_id;
    if (defId) {
      const p = getPatternById(defId);
      if (p) return p;
    }
    // fallback: pattern cùng genre
    const candidates = (PATTERNS || []).filter((p) => p.genre_id === song?.genre_id);
    return candidates[0] || (PATTERNS || [])[0] || null;
  }

  function getPatternOptionsForSong(songOrId) {
    const song =
      typeof songOrId === "string" ? (SONGS || []).find((s) => s.id === songOrId) : songOrId;
    const genreId = song?.genre_id;
    return (PATTERNS || [])
      .filter((p) => (genreId ? p.genre_id === genreId : true))
      .map((p) => ({ id: p.id, name: p.name, genre_id: p.genre_id }));
  }

  // =========================
  // Transport
  // =========================
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
    // nextBar
    return stepInBar === 0;
  }

  function maybeCommitQueued(stepInBar) {
    let changed = false;

    if (state.queuedChordName && shouldCommitAtStep(stepInBar)) {
      state.activeChordName = state.queuedChordName;
      if (state.queuedChordIndex != null) state.activeChordIndex = state.queuedChordIndex;
      state.queuedChordName = null;
      state.queuedChordIndex = null;
      changed = true;
    }

    if (state.queuedPatternId && shouldCommitAtStep(stepInBar)) {
      state.activePatternId = state.queuedPatternId;
      state.queuedPatternId = null;
      changed = true;
    }

    if (changed) lyricsDirty = true;
    return changed;
  }

  function isInFillWindow(stepInBar, stepsBar) {
    return stepInBar >= Math.max(0, stepsBar - 2);
  }

  function scheduleTick(time) {
    const pattern = getPatternById(state.activePatternId);
    const chord = state.activeChordName;

    if (!pattern || !chord || !guitar) {
      state.stepIndex += 1;
      emit();
      return;
    }

    const stepsBar = pattern.steps.length;
    const stepInBar = state.stepIndex % stepsBar;

    state.stepInBar = stepInBar;
    state.barIndex = Math.floor(state.stepIndex / stepsBar);

    // Commit queued at boundary (đầu ô nhịp nếu nextBar)
    maybeCommitQueued(stepInBar);

    // Metronome
    maybeMetronome(stepInBar, time);

    // Smooth dynamics
    updateDynamicsSmoothing();

    // Pattern step
    let st = pattern.steps[stepInBar] || { type: "rest" };

    // Fill override (cửa sổ cuối bar)
    if (state.fillArmed && isInFillWindow(stepInBar, stepsBar)) {
      const isLast = stepInBar === Math.max(0, stepsBar - 1);
      st = { type: isLast ? "strumUp" : "strumDown" };
      if (isLast) state.fillArmed = false;
    }

    const dyn = state.dynamicsSmoothed;
    const region = dynRegion(dyn);
    const { baseVel, bassVel } = dynamicsToVelocity(dyn);

    // SOFT policy: hạn chế strum -> đổi sang pluck
    if (region === "SOFT") {
      if (st.type === "strumDown" || st.type === "strumUp") {
        st = { type: "pluck", string: 3 };
      }
    }

    // Execute step
    switch (st.type) {
      case "bass":
        playBass(chord, time, bassVel);
        break;

      case "pluck": {
        const sNum = st.string ? Number(st.string) : 3;
        playPluck(chord, sNum, time, baseVel);
        break;
      }

      case "strumDown":
        strum(chord, "down", time, baseVel);
        break;

      case "strumUp":
        strum(chord, "up", time, baseVel);
        break;

      case "rest":
      default:
        break;
    }

    // Chỉ rebuild khi thật sự thay đổi
    refreshLyricsIfNeeded();
    // melody pad chỉ rebuild khi transpose/song đổi; không làm mỗi tick

    state.stepIndex += 1;
    emit();
  }

  // =========================
  // Melody pad (7 bậc) - MVP
  // =========================
  function rebuildMelodyNotes() {
    const k = String(state.song?.original_key || "C").trim();
    const isMinor = k.endsWith("m");
    const keyRoot = isMinor ? k.slice(0, -1) : k;

    const preferSharps = preferSharpsForKey(keyRoot);
    const rootName = transposeRoot(keyRoot, state.transpose, preferSharps);
    const rootIndexAfter = noteIndex(rootName);
    if (rootIndexAfter < 0) {
      state.melody.notes = [];
      melodyDirty = false;
      return;
    }

    const majorIntervals = [0, 2, 4, 5, 7, 9, 11];
    const minorIntervals = [0, 2, 3, 5, 7, 8, 10];
    const intervals = isMinor ? minorIntervals : majorIntervals;

    // Pick a comfortable octave around C4 (60)
    const baseMidi = 60 + ((rootIndexAfter - noteIndex("C") + 12) % 12);
    state.melody.notes = intervals.map((itv) => midiToNoteName(baseMidi + itv));
    melodyDirty = false;
  }

  function refreshMelodyIfNeeded() {
    if (!melodyDirty) return;
    rebuildMelodyNotes();
  }

  function playMelodyDegree(degIndex, time = Tone.now()) {
    if (!state.ready || !guitar) return;
    refreshMelodyIfNeeded();
    const notes = state.melody.notes || [];
    const idx = Math.max(0, Math.min(notes.length - 1, Number(degIndex) || 0));
    const n = notes[idx];
    if (!n) return;
    safeTrigger(n, "8n", time, 0.7);
  }

  // =========================
  // Public API
  // =========================
  async function init() {
    if (state.ready) return;

    // Bắt buộc trên mobile: phải gọi trong user gesture
    await Tone.start();

    try {
      guitar = new Tone.Sampler({
        urls: SAMPLE_URLS,
        baseUrl: SELECTED_PACK.baseUrl,
      });

      reverb = new Tone.Reverb({ decay: 2.0, wet: 0.16 });
      limiter = new Tone.Limiter(-1.0);

      guitar.connect(reverb);
      reverb.connect(limiter);
      limiter.toDestination();

      metroSynth = new Tone.MembraneSynth({
        pitchDecay: 0.01,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.01 },
      }).connect(limiter);

      // Đợi toàn bộ buffer load (timeout để báo lỗi rõ ràng)
      await withTimeout(
        Tone.loaded(),
        LOAD_TIMEOUT_MS,
        "Không tải được sample âm thanh (timeout). Nếu bạn đang mở trên iPhone/iPad, hãy dùng sample MP3 và mở bằng HTTPS."
      );

      // Default song
      const song = (SONGS || [])[0];
      if (!song) throw new Error("No songs found.");

      // Load song state
      loadSong(song);

      state.ready = true;
      lyricsDirty = true;
      melodyDirty = true;
      refreshLyricsIfNeeded();
      refreshMelodyIfNeeded();

      resetTransportState();
      emit();
    } catch (e) {
      // Clean up partially created nodes to avoid dangling audio nodes
      try {
        guitar?.dispose?.();
      } catch {}
      try {
        reverb?.dispose?.();
      } catch {}
      try {
        limiter?.dispose?.();
      } catch {}
      try {
        metroSynth?.dispose?.();
      } catch {}
      guitar = reverb = limiter = metroSynth = null;
      state.ready = false;

      // Enrich error message for common mobile case
      const hint =
        SELECTED_PACK.ext === "ogg"
          ? "Thiết bị của bạn có thể không hỗ trợ OGG (đặc biệt iOS/Safari). Hãy đổi sang MP3 sample."
          : "Nếu bạn đang mở bằng file:// hoặc mạng chặn CDN, hãy host qua HTTPS.";

      throw new Error(`${e?.message || e}\n\nGợi ý: ${hint}`);
    }
  }

  function loadSong(songOrId) {
    const song =
      typeof songOrId === "string" ? (SONGS || []).find((s) => s.id === songOrId) : songOrId;
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

    const def = resolveDefaultPatternForSong(song);
    state.activePatternId = def?.id || (PATTERNS || [])[0]?.id || null;
    state.queuedPatternId = null;

    state.activeSlotIndex = 0;
    state.slots = Array.from({ length: 6 }, () => ({ patternId: null }));
    if (state.activePatternId) state.slots[0].patternId = state.activePatternId;

    state.fillArmed = false;
    state.stepIndex = 0;
    state.barIndex = 0;
    state.stepInBar = 0;
    state.lastNote = "—";

    lyricsDirty = true;
    melodyDirty = true;
    refreshLyricsIfNeeded();
    refreshMelodyIfNeeded();

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
    state.queuedChordName = null;
    state.queuedChordIndex = null;
    state.fillArmed = false;
    emit();
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

  function setTranspose(semitones) {
    const v = Math.max(-12, Math.min(12, Number(semitones) || 0));
    if (v === state.transpose) return;
    state.transpose = v;
    lyricsDirty = true;
    melodyDirty = true;
    refreshLyricsIfNeeded();
    refreshMelodyIfNeeded();
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

  function fill() {
    state.fillArmed = true;
    emit();
  }

  function nextChord() {
    const prog = state.progression || [];
    if (!prog.length) return;

    const nextIdx = Math.min(prog.length - 1, (state.queuedChordIndex ?? state.activeChordIndex) + 1);
    const chordRaw = prog[nextIdx];

    if (state.changeMode === "immediate") {
      state.activeChordIndex = nextIdx;
      state.activeChordName = chordRaw;
      state.queuedChordIndex = null;
      state.queuedChordName = null;
    } else {
      state.queuedChordIndex = nextIdx;
      state.queuedChordName = chordRaw;
    }

    lyricsDirty = true;
    refreshLyricsIfNeeded();
    emit();
  }

  // Cho “đệm thực tế”: chạm vào chord trên lyrics để nhảy thẳng đến chordIndex đó
  function setChordIndex(index) {
    const prog = state.progression || [];
    if (!prog.length) return;

    const idx = Math.max(0, Math.min(prog.length - 1, Number(index) || 0));
    const chordRaw = prog[idx];

    if (state.changeMode === "immediate") {
      state.activeChordIndex = idx;
      state.activeChordName = chordRaw;
      state.queuedChordIndex = null;
      state.queuedChordName = null;
    } else {
      state.queuedChordIndex = idx;
      state.queuedChordName = chordRaw;
    }

    lyricsDirty = true;
    refreshLyricsIfNeeded();
    emit();
  }

  function auditionChord(chordRaw) {
    const chord = String(chordRaw || "").trim();
    if (!chord) return;

    if (!state.playing) {
      // Nếu đang stop: strum thử ngay
      strum(chord, "down", Tone.now(), 0.65);
      state.lastNote = chord;
      emit();
      return;
    }

    if (state.changeMode === "immediate") {
      state.activeChordName = chord;
      state.queuedChordName = null;
      state.queuedChordIndex = null;
    } else {
      state.queuedChordName = chord;
      state.queuedChordIndex = null; // freestyle chord không map vào lyric index
    }

    lyricsDirty = true;
    refreshLyricsIfNeeded();
    emit();
  }

  function selectSlot(slotIndex) {
    const idx = Math.max(0, Math.min(state.slots.length - 1, Number(slotIndex) || 0));
    state.activeSlotIndex = idx;

    const pid = state.slots[idx]?.patternId || null;
    if (!pid) {
      emit();
      return;
    }

    // Thay pattern: immediate -> set; nextBar -> queue
    if (state.changeMode === "immediate") {
      state.activePatternId = pid;
      state.queuedPatternId = null;
    } else {
      state.queuedPatternId = pid;
    }

    emit();
  }

  function assignPatternToSlot(slotIndex, patternId) {
    const idx = Math.max(0, Math.min(state.slots.length - 1, Number(slotIndex) || 0));
    const pid = patternId ? String(patternId) : null;

    state.slots[idx].patternId = pid;

    // Nếu assign vào active slot thì áp dụng luôn (theo changeMode)
    if (idx === state.activeSlotIndex && pid) {
      if (state.changeMode === "immediate") {
        state.activePatternId = pid;
        state.queuedPatternId = null;
      } else {
        state.queuedPatternId = pid;
      }
    }

    emit();
  }

  return {
    // lifecycle
    init,
    loadSong,

    // transport
    play,
    stop,

    // chord control
    nextChord,
    auditionChord,
    setChordIndex,

    // performance
    fill,
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