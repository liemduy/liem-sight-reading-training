// app.js (PRD Layout Binder)
import { SONGS, PATTERNS, CHORD_DB, GENRE_DEFAULTS } from "./data.js";
import { createEngine } from "./engine.js";

const el = {
  overlay: document.getElementById("orientationOverlay"),

  // modal
  modal: document.getElementById("patternModal"),
  modalTitle: document.getElementById("modalTitle"),
  patternList: document.getElementById("patternList"),
  btnModalClose: document.getElementById("btnModalClose"),

  // left
  melodyBtns: Array.from({ length: 7 }, (_, i) => document.getElementById(`mel${i}`)),
  slotBtns: Array.from({ length: 6 }, (_, i) => document.getElementById(`slot${i}`)),
  btnNextChord: document.getElementById("btnNextChord"),
  nextChordPreview: document.getElementById("nextChordPreview"),
  btnFill: document.getElementById("btnFill"),
  btnTransMinus: document.getElementById("btnTransMinus"),
  btnTransPlus: document.getElementById("btnTransPlus"),
  transposeVal: document.getElementById("transposeVal"),
  btnBpmMinus: document.getElementById("btnBpmMinus"),
  btnBpmPlus: document.getElementById("btnBpmPlus"),
  bpmVal: document.getElementById("bpmVal"),
  changeMode: document.getElementById("changeMode"),
  metroMode: document.getElementById("metroMode"),
  status: document.getElementById("status"),

  // middle
  songTitle: document.getElementById("songTitle"),
  songSelect: document.getElementById("songSelect"),
  btnPlay: document.getElementById("btnPlay"),
  btnStop: document.getElementById("btnStop"),
  songGenre: document.getElementById("songGenre"),
  activePattern: document.getElementById("activePattern"),
  activeChord: document.getElementById("activeChord"),
  queuedChord: document.getElementById("queuedChord"),
  freestyleRow: document.getElementById("freestyleRow"),
  lyricsView: document.getElementById("lyricsView"),

  // right
  dynSlider: document.getElementById("dynSlider"),
};

const engine = createEngine({
  Tone: window.Tone,
  SONGS,
  PATTERNS,
  CHORD_DB,
  GENRE_DEFAULTS,
});

let currentState = null;
let pendingAssignSlotIndex = null; // slot index for modal selection

boot().catch((e) => {
  console.error(e);
  alert(String(e?.message || e));
});

async function boot() {
  // populate song selector
  el.songSelect.innerHTML = "";
  SONGS.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.title;
    el.songSelect.appendChild(opt);
  });

  wireEvents();
  updateOrientationOverlay();

  engine.subscribe((s) => {
    currentState = s;
    render(s);
  });

  await engine.init();
  engine.loadSong(SONGS[0].id);
}

function wireEvents() {
  window.addEventListener("resize", updateOrientationOverlay);
  window.addEventListener("orientationchange", updateOrientationOverlay);

  el.btnPlay.addEventListener("click", () => engine.play().catch(console.error));
  el.btnStop.addEventListener("click", () => engine.stop());

  el.songSelect.addEventListener("change", () => engine.loadSong(el.songSelect.value));

  el.btnNextChord.addEventListener("click", () => engine.nextChord());
  el.btnFill.addEventListener("click", () => engine.fill());

  el.btnTransMinus.addEventListener("click", () => engine.adjustTranspose(-1));
  el.btnTransPlus.addEventListener("click", () => engine.adjustTranspose(+1));

  el.btnBpmMinus.addEventListener("click", () => engine.adjustBpm(-1));
  el.btnBpmPlus.addEventListener("click", () => engine.adjustBpm(+1));

  el.dynSlider.addEventListener("input", () => engine.setDynamics(Number(el.dynSlider.value)));

  el.changeMode.addEventListener("change", () => engine.setChangeMode(el.changeMode.value));
  el.metroMode.addEventListener("change", () => engine.setMetronome(el.metroMode.value));

  // Melody pad
  el.melodyBtns.forEach((btn, i) => btn.addEventListener("click", () => engine.playMelodyDegree(i)));

  // Slots
  el.slotBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => onSlotClick(idx));
  });

  // Modal close
  el.btnModalClose.addEventListener("click", closePatternModal);
  el.modal.addEventListener("click", (ev) => {
    if (ev.target === el.modal) closePatternModal();
  });
}

function updateOrientationOverlay() {
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  el.overlay.classList.toggle("hidden", !isPortrait);

  // If portrait, you may want to stop audio immediately (optional):
  // if (isPortrait && currentState?.playing) engine.stop();
}

function onSlotClick(slotIndex) {
  if (!currentState) return;
  const pid = currentState.slots?.[slotIndex]?.patternId;

  if (!pid) {
    // empty -> open modal to assign
    pendingAssignSlotIndex = slotIndex;
    openPatternModalForSong();
    return;
  }

  // assigned -> select (queue switch at bar boundary inside engine)
  engine.selectSlot(slotIndex);
}

function openPatternModalForSong() {
  const opts = engine.getPatternOptionsForSong();
  el.patternList.innerHTML = "";

  el.modalTitle.textContent = `Chọn điệu (Slot ${pendingAssignSlotIndex + 1})`;

  opts.forEach((p) => {
    const row = document.createElement("div");
    row.className = "patternItem";

    const left = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `genre: ${p.genre_id} • id: ${p.id}`;

    left.appendChild(name);
    left.appendChild(meta);

    const btn = document.createElement("button");
    btn.textContent = "Chọn";
    btn.addEventListener("click", () => {
      engine.assignPatternToSlot(pendingAssignSlotIndex, p.id);
      // select that slot immediately
      engine.selectSlot(pendingAssignSlotIndex);
      closePatternModal();
    });

    row.appendChild(left);
    row.appendChild(btn);
    el.patternList.appendChild(row);
  });

  el.modal.classList.add("open");
}

function closePatternModal() {
  el.modal.classList.remove("open");
  pendingAssignSlotIndex = null;
}

function render(s) {
  // left status + values
  el.status.textContent = s.ready ? (s.playing ? "Đang chạy" : "Sẵn sàng") : "Đang load...";
  el.transposeVal.textContent = String(s.transpose);
  el.bpmVal.textContent = String(s.bpm);
  el.dynSlider.value = String(s.dynamics);

  // hero next chord preview
  el.nextChordPreview.textContent = s.queuedChordName ?? "—";

  // slots
  el.slotBtns.forEach((btn, i) => {
    const pid = s.slots?.[i]?.patternId;
    btn.classList.toggle("empty", !pid);
    btn.classList.toggle("active", i === s.activeSlotIndex);
    btn.textContent = pid ? pid : "+";
  });

  // melody buttons show label + note (2 lines)
  el.melodyBtns.forEach((btn, i) => {
    const label = s.melody?.labels?.[i] ?? String(i + 1);
    const note = s.melody?.notes?.[i] ?? "—";
    btn.textContent = `${label}\n${note}`;
  });

  // middle header
  el.songTitle.textContent = s.song?.title ?? "Guitar Nhậu";
  el.songGenre.textContent = s.song?.genre_id ?? "—";
  el.activePattern.textContent = s.activePatternId ?? "—";
  el.activeChord.textContent = s.activeChordName ?? "—";
  el.queuedChord.textContent = s.queuedChordName ?? "—";

  // freestyle row
  el.freestyleRow.innerHTML = "";
  (s.freestyle || []).forEach((ch) => {
    const b = document.createElement("button");
    b.textContent = ch;
    b.addEventListener("click", () => engine.auditionChord(ch));
    el.freestyleRow.appendChild(b);
  });

  // lyrics view
  el.lyricsView.innerHTML = s.lyricsHtml || "";
}
