// app.js
// UI tối thiểu để test. Nếu bạn đã có HTML theo PRD, bạn chỉ cần:
// - map ID/button/slider đúng vào handler bên dưới
// - giữ engine.js nguyên

import { SONGS, PATTERNS, CHORD_DB, GENRE_DEFAULTS, PATTERNS as PATTERN_LIST } from "./data.js";
import { createEngine } from "./engine.js";

const engine = createEngine({
  Tone: window.Tone,
  SONGS,
  PATTERNS: PATTERN_LIST,
  CHORD_DB,
  GENRE_DEFAULTS,
});

ensureMinimalStyles();
const ui = ensureMinimalUI();

engine.subscribe(render);
wireEvents();

(async function boot() {
  await engine.init();
  engine.loadSong(SONGS[0]);
})().catch((e) => {
  console.error(e);
  alert(String(e?.message || e));
});

function wireEvents() {
  ui.btnInit.addEventListener("click", async () => {
    // init đã chạy trong boot; nút này chủ yếu để giữ flow giống iOS unlock (nếu bạn muốn)
    try {
      await engine.init();
    } catch (e) {
      console.error(e);
      alert("Init failed: " + (e?.message || e));
    }
  });

  ui.btnPlay.addEventListener("click", () => engine.play().catch(console.error));
  ui.btnStop.addEventListener("click", () => engine.stop());

  ui.btnNextChord.addEventListener("click", () => engine.nextChord());
  ui.btnFill.addEventListener("click", () => engine.fill());

  ui.btnTransMinus.addEventListener("click", () => engine.adjustTranspose(-1));
  ui.btnTransPlus.addEventListener("click", () => engine.adjustTranspose(+1));

  ui.btnBpmMinus.addEventListener("click", () => engine.adjustBpm(-1));
  ui.btnBpmPlus.addEventListener("click", () => engine.adjustBpm(+1));
  ui.bpmInput.addEventListener("change", () => engine.setBpm(Number(ui.bpmInput.value)));

  ui.dynSlider.addEventListener("input", () => engine.setDynamics(Number(ui.dynSlider.value)));

  ui.songSelect.addEventListener("change", () => engine.loadSong(ui.songSelect.value));

  ui.changeMode.addEventListener("change", () => engine.setChangeMode(ui.changeMode.value));
  ui.bassMode.addEventListener("change", () => engine.setBassMode(ui.bassMode.value));
  ui.metroMode.addEventListener("change", () => engine.setMetronome(ui.metroMode.value));

  ui.slotButtons.forEach((btn, idx) => btn.addEventListener("click", () => engine.selectSlot(idx)));

  ui.patternSelect.addEventListener("change", () => {
    const idx = Number(ui.activeSlotIndex.textContent || "0");
    engine.assignPatternToSlot(idx, ui.patternSelect.value);
  });

  ui.melodyButtons.forEach((b, i) => b.addEventListener("click", () => engine.playMelodyDegree(i)));

  window.addEventListener("resize", updateOrientationOverlay);
  window.addEventListener("orientationchange", updateOrientationOverlay);
  updateOrientationOverlay();
}

function render(s) {
  // status
  ui.status.textContent = s.ready ? (s.playing ? "Đang chạy" : "Đã load - sẵn sàng") : "Chưa load";

  ui.curChord.textContent = s.activeChordName ?? "—";
  ui.nextChord.textContent = s.queuedChordName ?? "—";
  ui.barCount.textContent = String(s.barIndex);
  ui.stepCount.textContent = `${s.stepInBar}`;
  ui.lastNote.textContent = s.lastNote ?? "—";

  ui.transposeVal.textContent = String(s.transpose);
  ui.bpmVal.textContent = String(s.bpm);
  ui.bpmInput.value = String(s.bpm);

  ui.dynSlider.value = String(s.dynamics);

  // lyrics view
  ui.lyrics.innerHTML = s.lyricsHtml || "";

  // freestyle row
  ui.freestyle.innerHTML = "";
  const prefer = s.transpose; // display done in engine lyrics; here show raw + transposed for clarity
  s.freestyle.forEach((ch) => {
    const b = document.createElement("button");
    b.className = "mini";
    b.textContent = ch;
    b.addEventListener("click", () => engine.auditionChord(ch));
    ui.freestyle.appendChild(b);
  });

  // patterns dropdown (genre filter is already baked in engine.getPatternOptionsForSong())
  const options = engine.getPatternOptionsForSong();
  ui.patternSelect.innerHTML = "";
  options.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name}`;
    ui.patternSelect.appendChild(opt);
  });

  // slots render
  ui.slotButtons.forEach((btn, i) => {
    const pid = s.slots[i]?.patternId;
    btn.textContent = pid ? `Slot ${i + 1}\n${pid}` : `Slot ${i + 1}\n+`;
    btn.classList.toggle("active", i === s.activeSlotIndex);
  });
  ui.activeSlotIndex.textContent = String(s.activeSlotIndex);

  // melody pad
  ui.melodyButtons.forEach((b, i) => {
    const label = s.melody.labels[i] || String(i + 1);
    const note = s.melody.notes[i] || "—";
    b.textContent = `${label}\n${note}`;
  });
}

function ensureMinimalUI() {
  // Nếu bạn đã có UI riêng, bạn có thể xóa hàm này và map lại element theo ID.
  let root = document.getElementById("app");
  if (!root) {
    root = document.createElement("div");
    root.id = "app";
    document.body.appendChild(root);
  }

  root.innerHTML = `
    <div id="orientationOverlay" class="overlay hidden">
      <div class="overlayCard">
        <div class="overlayTitle">Xoay ngang máy để bắt đầu nhậu!</div>
        <div class="overlaySub">Landscape only</div>
      </div>
    </div>

    <div class="panel">
      <div class="row">
        <label>Bài:</label>
        <select id="songSelect"></select>

        <button id="btnInit" class="primary">Bắt đầu (Unlock + Load)</button>
        <button id="btnPlay" class="primary">Play</button>
        <button id="btnStop" class="danger">Stop</button>
      </div>

      <div class="row">
        <button id="btnNextChord" class="hero">NEXT CHORD</button>
        <button id="btnFill" class="warn">FILL</button>

        <div class="group">
          <div class="label">Transpose</div>
          <button id="btnTransMinus">-</button>
          <div id="transposeVal" class="val">0</div>
          <button id="btnTransPlus">+</button>
        </div>

        <div class="group">
          <div class="label">BPM</div>
          <button id="btnBpmMinus">-</button>
          <div id="bpmVal" class="val">78</div>
          <button id="btnBpmPlus">+</button>
          <input id="bpmInput" class="bpmInput" type="number" min="40" max="200" value="78"/>
        </div>

        <div class="group">
          <div class="label">Dynamics</div>
          <input id="dynSlider" type="range" min="0" max="100" value="50"/>
        </div>
      </div>

      <div class="row smallRow">
        <label>Đổi hợp âm:</label>
        <select id="changeMode">
          <option value="nextBar" selected>Đầu ô nhịp</option>
          <option value="immediate">Đổi ngay</option>
        </select>

        <label>Bass:</label>
        <select id="bassMode">
          <option value="auto" selected>Auto</option>
          <option value="6">Dây 6</option>
          <option value="5">Dây 5</option>
          <option value="4">Dây 4</option>
        </select>

        <label>Metronome:</label>
        <select id="metroMode">
          <option value="off" selected>Tắt</option>
          <option value="on">Bật</option>
        </select>

        <div class="status">Status: <span id="status">—</span></div>
      </div>

      <div class="row chips">
        <div class="chip">Chord: <span id="curChord">—</span></div>
        <div class="chip">Queued: <span id="nextChord">—</span></div>
        <div class="chip">Bar: <span id="barCount">0</span></div>
        <div class="chip">Step: <span id="stepCount">0</span></div>
        <div class="chip">Last: <span id="lastNote">—</span></div>
      </div>

      <div class="row">
        <div class="col">
          <div class="sectionTitle">Freestyle Chords</div>
          <div id="freestyle" class="wrapButtons"></div>

          <div class="sectionTitle">Pattern (gán vào slot đang chọn)</div>
          <div class="row">
            <select id="patternSelect"></select>
            <div class="muted">Active slot: <span id="activeSlotIndex">0</span></div>
          </div>

          <div class="sectionTitle">Slots</div>
          <div class="slots" id="slots"></div>
        </div>

        <div class="col">
          <div class="sectionTitle">Lyrics</div>
          <div id="lyrics" class="lyrics"></div>

          <div class="sectionTitle">Melody Pad</div>
          <div class="melody" id="melody"></div>
        </div>
      </div>
    </div>
  `;

  // Populate song select
  const songSelect = root.querySelector("#songSelect");
  SONGS.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.title;
    songSelect.appendChild(opt);
  });

  // Slots
  const slots = root.querySelector("#slots");
  const slotButtons = [];
  for (let i = 0; i < 6; i++) {
    const b = document.createElement("button");
    b.className = "slot";
    b.textContent = `Slot ${i + 1}\n+`;
    slots.appendChild(b);
    slotButtons.push(b);
  }

  // Melody
  const melody = root.querySelector("#melody");
  const melodyButtons = [];
  for (let i = 0; i < 7; i++) {
    const b = document.createElement("button");
    b.className = "melodyBtn";
    b.textContent = `${i + 1}\n—`;
    melody.appendChild(b);
    melodyButtons.push(b);
  }

  return {
    root,
    overlay: root.querySelector("#orientationOverlay"),

    songSelect,

    btnInit: root.querySelector("#btnInit"),
    btnPlay: root.querySelector("#btnPlay"),
    btnStop: root.querySelector("#btnStop"),

    btnNextChord: root.querySelector("#btnNextChord"),
    btnFill: root.querySelector("#btnFill"),

    btnTransMinus: root.querySelector("#btnTransMinus"),
    btnTransPlus: root.querySelector("#btnTransPlus"),
    transposeVal: root.querySelector("#transposeVal"),

    btnBpmMinus: root.querySelector("#btnBpmMinus"),
    btnBpmPlus: root.querySelector("#btnBpmPlus"),
    bpmVal: root.querySelector("#bpmVal"),
    bpmInput: root.querySelector("#bpmInput"),

    dynSlider: root.querySelector("#dynSlider"),

    changeMode: root.querySelector("#changeMode"),
    bassMode: root.querySelector("#bassMode"),
    metroMode: root.querySelector("#metroMode"),

    status: root.querySelector("#status"),
    curChord: root.querySelector("#curChord"),
    nextChord: root.querySelector("#nextChord"),
    barCount: root.querySelector("#barCount"),
    stepCount: root.querySelector("#stepCount"),
    lastNote: root.querySelector("#lastNote"),

    freestyle: root.querySelector("#freestyle"),
    patternSelect: root.querySelector("#patternSelect"),
    activeSlotIndex: root.querySelector("#activeSlotIndex"),
    slotButtons,

    lyrics: root.querySelector("#lyrics"),
    melodyButtons,
  };
}

function updateOrientationOverlay() {
  // Landscape only
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  ui.overlay.classList.toggle("hidden", !isPortrait);
}

function ensureMinimalStyles() {
  if (document.getElementById("guitar-nhau-style")) return;
  const style = document.createElement("style");
  style.id = "guitar-nhau-style";
  style.textContent = `
    body { margin: 0; background:#0b0f14; color:#e7edf5; font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial; }
    .panel { padding: 14px; }
    .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
    .smallRow { opacity: .95; font-size: 13px; }
    .primary { background:#2a4a7a; border:1px solid #3a66a8; color:#e7edf5; }
    .danger { background:#5a1f2c; border:1px solid #7a2a3c; color:#e7edf5; }
    .warn { background:#7a5a2a; border:1px solid #a8833a; color:#0b0f14; font-weight:700; }
    button { background:#1f2b3e; border:1px solid #2d3f5c; color:#e7edf5; border-radius:12px; padding:10px 12px; cursor:pointer; }
    button.hero { font-size:18px; font-weight:800; padding:14px 18px; border-radius:16px; background:#ff8a00; border-color:#ffb15a; color:#0b0f14; }
    .group { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #223047; border-radius:12px; background:#121924; }
    .label { font-size: 12px; opacity:.85; }
    .val { width:36px; text-align:center; font-weight:800; }
    .bpmInput { width:70px; border-radius:10px; border:1px solid #2d3f5c; background:#0f1520; color:#e7edf5; padding:8px; }
    .chips .chip { background:#121924; border:1px solid #223047; border-radius:999px; padding:6px 10px; font-size:13px; }
    .status { margin-left:auto; font-size: 13px; opacity:.9; }
    .col { flex: 1; min-width: 320px; }
    .sectionTitle { font-weight:800; margin: 6px 0; }
    .wrapButtons { display:flex; flex-wrap:wrap; gap:8px; }
    button.mini { padding:8px 10px; border-radius:999px; }
    .slots { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
    .slot { white-space:pre-line; text-align:left; min-height:54px; }
    .slot.active { outline:2px solid #72a7ff; }
    .lyrics { background:#121924; border:1px solid #223047; border-radius:12px; padding:10px; min-height:120px; white-space:pre-wrap; font-size:18px; line-height:1.5; }
    .chord { font-weight:800; padding:0 4px; border-radius:8px; }
    .chord-active { background: rgba(72,255,179,.20); }
    .chord-queued { background: rgba(255,184,107,.20); }
    .chord-past { opacity:.6; }
    .melody { display:grid; grid-template-columns: repeat(7, 1fr); gap:8px; }
    .melodyBtn { white-space:pre-line; padding:10px 8px; font-weight:800; }
    .muted { opacity:.7; font-size:12px; }

    .overlay { position:fixed; inset:0; background:rgba(0,0,0,.92); display:flex; align-items:center; justify-content:center; z-index:9999; }
    .overlay.hidden { display:none; }
    .overlayCard { background:#121924; border:1px solid #223047; border-radius:16px; padding:18px; text-align:center; width:min(520px, 92vw); }
    .overlayTitle { font-weight:900; font-size:18px; margin-bottom:6px; }
    .overlaySub { opacity:.8; }
  `;
  document.head.appendChild(style);
}
