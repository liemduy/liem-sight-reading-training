// app.js (PRD Layout Binder + Audio Unlock + Add Song)
import { SONGS, PATTERNS, CHORD_DB, GENRE_DEFAULTS } from "./data.js";
import { createEngine } from "./engine.js";

const el = {
  overlay: document.getElementById("orientationOverlay"),

  // pattern modal
  patternModal: document.getElementById("patternModal"),
  modalTitle: document.getElementById("modalTitle"),
  patternList: document.getElementById("patternList"),
  btnModalClose: document.getElementById("btnModalClose"),

  // add song modal
  addSongModal: document.getElementById("addSongModal"),
  addSongInput: document.getElementById("addSongInput"),
  addSongError: document.getElementById("addSongError"),
  btnAddSong: document.getElementById("btnAddSong"),
  btnAddSongCancel: document.getElementById("btnAddSongCancel"),
  btnAddSongImport: document.getElementById("btnAddSongImport"),

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
  btnInitAudio: document.getElementById("btnInitAudio"),
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
let pendingAssignSlotIndex = null;

// Lưu các bài người dùng thêm vào
const customSongs = new Map(); // id -> songObj

boot().catch((e) => {
  console.error(e);
  alert(String(e?.message || e));
});

async function boot() {
  populateSongSelect();

  wireEvents();
  updateOrientationOverlay();

  engine.subscribe((s) => {
    currentState = s;
    render(s);
  });

  // QUAN TRỌNG: không gọi engine.init() ở đây.
  // iOS/Android sẽ chặn Tone.start nếu không phải user gesture.
  // Chỉ init khi user bấm "Bắt đầu" hoặc Play lần đầu.
  engine.loadSong(SONGS[0].id);
}

function populateSongSelect() {
  el.songSelect.innerHTML = "";
  SONGS.forEach((s) => addSongOption(s.id, s.title));
  // custom songs (nếu có)
  for (const [id, song] of customSongs.entries()) {
    addSongOption(id, `${song.title} (Your song)`);
  }
}

function addSongOption(id, label) {
  const opt = document.createElement("option");
  opt.value = id;
  opt.textContent = label;
  el.songSelect.appendChild(opt);
}

function wireEvents() {
  window.addEventListener("resize", updateOrientationOverlay);
  window.addEventListener("orientationchange", updateOrientationOverlay);

  el.btnInitAudio.addEventListener("click", async () => {
    await ensureAudioReady();
  });

  el.btnPlay.addEventListener("click", async () => {
    await ensureAudioReady();
    await engine.play();
  });

  el.btnStop.addEventListener("click", () => engine.stop());

  el.songSelect.addEventListener("change", () => {
    const id = el.songSelect.value;
    if (customSongs.has(id)) engine.loadSong(customSongs.get(id));
    else engine.loadSong(id);
  });

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
  el.slotBtns.forEach((btn, idx) => btn.addEventListener("click", () => onSlotClick(idx)));

  // Pattern modal
  el.btnModalClose.addEventListener("click", closePatternModal);
  el.patternModal.addEventListener("click", (ev) => {
    if (ev.target === el.patternModal) closePatternModal();
  });

  // Add song modal open/close
  el.btnAddSong.addEventListener("click", () => openAddSongModal());
  el.btnAddSongCancel.addEventListener("click", closeAddSongModal);
  el.addSongModal.addEventListener("click", (ev) => {
    if (ev.target === el.addSongModal) closeAddSongModal();
  });

  el.btnAddSongImport.addEventListener("click", () => {
    try {
      const raw = el.addSongInput.value || "";
      const songObj = parseUserSong(raw);

      // add to custom list + select it
      customSongs.set(songObj.id, songObj);

      // add option without rebuilding everything
      addSongOption(songObj.id, `${songObj.title} (Your song)`);
      el.songSelect.value = songObj.id;

      engine.loadSong(songObj);
      closeAddSongModal();
    } catch (err) {
      showAddSongError(String(err?.message || err));
    }
  });
}

async function ensureAudioReady() {
  if (currentState?.ready) return;
  try {
    await engine.init(); // user gesture guaranteed (from button click)
  } catch (e) {
    console.error(e);
    alert("Không khởi tạo được âm thanh. Hãy thử bấm lại 'Bắt đầu'.\n\n" + (e?.message || e));
  }
}

function updateOrientationOverlay() {
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;
  el.overlay.classList.toggle("hidden", !isPortrait);

  // Optional safety: portrait -> stop
  // if (isPortrait && currentState?.playing) engine.stop();
}

function onSlotClick(slotIndex) {
  if (!currentState) return;
  const pid = currentState.slots?.[slotIndex]?.patternId;

  if (!pid) {
    pendingAssignSlotIndex = slotIndex;
    openPatternModalForSong();
    return;
  }
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
      engine.selectSlot(pendingAssignSlotIndex);
      closePatternModal();
    });

    row.appendChild(left);
    row.appendChild(btn);
    el.patternList.appendChild(row);
  });

  el.patternModal.classList.add("open");
}

function closePatternModal() {
  el.patternModal.classList.remove("open");
  pendingAssignSlotIndex = null;
}

function openAddSongModal() {
  clearAddSongError();
  el.addSongInput.value = `song-name: Giã Từ
song-style: bolero
artist: Tô Thanh Tùng

1. Tuổi đời chân đơn [Am] côi gót mòn đại lộ [F] buồn
Đèn [G] đêm bóng mờ nhạt [C] nhòa
[A7] Hồn lắng tâm [Dm] tư, đi vào dĩ [Am] vãng
Đường tình không chung [E7] lối mang nuối tiếc cho [F] nhau [E7]

ĐK:
Em sang ngang [F] rồi chôn kỷ [G] niệm vào thương [C] nhớ
Hôn lên tóc [Am] mềm lệ [A7] sầu thắm ướt đôi [Dm] mi
Xin em một [G] lần cho ước nguyện tình yêu [E7] cuối
Thương yêu không [G] thành thôi giã [E7] từ đi em [Am] ơi.
`;
  el.addSongModal.classList.add("open");
}

function closeAddSongModal() {
  el.addSongModal.classList.remove("open");
}

function showAddSongError(msg) {
  el.addSongError.textContent = msg;
  el.addSongError.classList.add("show");
}

function clearAddSongError() {
  el.addSongError.textContent = "";
  el.addSongError.classList.remove("show");
}

// Parse theo format user đưa
function parseUserSong(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("Bạn chưa paste nội dung bài hát.");

  const lines = text.split("\n");
  let name = "";
  let style = "";
  let artist = "";
  let i = 0;

  // Read headers until blank line or non-header start
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { i++; break; } // skip blank line -> lyrics start

    const mName = /^\s*song-name\s*:\s*(.+)\s*$/i.exec(line);
    const mStyle = /^\s*song-style\s*:\s*(.+)\s*$/i.exec(line);
    const mArtist = /^\s*artist\s*:\s*(.+)\s*$/i.exec(line);

    if (mName) { name = mName[1].trim(); continue; }
    if (mStyle) { style = mStyle[1].trim(); continue; }
    if (mArtist) { artist = mArtist[1].trim(); continue; }

    // Not a header line: treat the rest as lyrics
    break;
  }

  const lyrics = lines.slice(i).join("\n").trim();
  if (!name) throw new Error("Thiếu 'song-name:'");
  if (!style) throw new Error("Thiếu 'song-style:' (ví dụ: bolero)");
  if (!lyrics) throw new Error("Thiếu lời bài hát (phần dưới header).");

  const genre_id = slugify(style);

  // Heuristic: original_key = first chord encountered or fallback "C"
  const firstChord = findFirstChord(lyrics);
  const original_key = firstChord || "C";

  // bpm default theo genre (có thể chỉnh sau)
  const bpm = genre_id === "bolero" ? 76 : 90;

  const id = `custom_${slugify(name)}_${Date.now().toString(36)}`;

  return {
    id,
    title: name,
    genre_id,
    original_key,
    bpm,
    lyrics,
    // optional metadata (not used by engine yet, but preserved)
    artist,
  };
}

function findFirstChord(lyrics) {
  const m = /\[([^\]]+)\]/.exec(lyrics);
  if (!m) return null;
  const chord = (m[1] || "").trim();
  // Keep simple: use chord itself (Am, E7...) as "original_key" heuristic
  return chord || null;
}

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "song";
}

function render(s) {
  // left status + values
  el.status.textContent = s.ready ? (s.playing ? "Đang chạy" : "Sẵn sàng (đã load âm thanh)") : "Chưa load âm thanh";
  el.transposeVal.textContent = String(s.transpose);
  el.bpmVal.textContent = String(s.bpm);
  el.dynSlider.value = String(s.dynamics);

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
    b.addEventListener("click", async () => {
      // đảm bảo audio ready khi user bấm audition chord
      await ensureAudioReady();
      engine.auditionChord(ch);
    });
    el.freestyleRow.appendChild(b);
  });

  // lyrics view
  el.lyricsView.innerHTML = s.lyricsHtml || "";
}
