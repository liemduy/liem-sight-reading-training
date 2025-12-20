// data.js
// Dữ liệu tối thiểu để MVP chạy. Bạn mở rộng dần SONGS / PATTERNS / CHORD_DB theo nhu cầu.

export const GENRE_DEFAULTS = {
  bolero: { time_signature: { num: 4, den: 4 }, quantize: "BAR" },
  ballad: { time_signature: { num: 4, den: 4 }, quantize: "BAR" },
  strum: { time_signature: { num: 4, den: 4 }, quantize: "BAR" },
  waltz: { time_signature: { num: 3, den: 4 }, quantize: "BAR" },
  six_eight: { time_signature: { num: 6, den: 8 }, quantize: "BAR" },
};

export const SONGS = [
  {
    id: "diem_xua",
    title: "Diễm Xưa",
    genre_id: "bolero",
    original_key: "C",
    bpm: 78,
    // time_signature: { num: 4, den: 4 }, // optional (nếu không có sẽ fallback theo genre)
    lyrics:
      "Mưa vẫn [C] mưa bay trên tầng tháp [Am] cổ...\n" +
      "Dòng [Dm] sông xưa [G7] vẫn trôi...\n" +
      "Ta [C] nghe [E7] đời...\n",
  },
  {
    id: "thanh_pho_buon",
    title: "Thành phố buồn",
    genre_id: "bolero",
    original_key: "Em",
    bpm: 76,
    lyrics:
      "Thành [Em] phố nào nhớ [Am] không em...\n" +
      "Nơi [B7] chúng mình tìm [Em] phút êm đềm...\n",
  },
];

// Chord shapes: frets for strings 6->1, -1 = mute.
// bass: string number 6/5/4... (dùng để pick bass).
export const CHORD_DB = {
  // Basic open
  C: { frets: [-1, 3, 2, 0, 1, 0], bass: 5 },
  G: { frets: [3, 2, 0, 0, 0, 3], bass: 6 },
  D: { frets: [-1, -1, 0, 2, 3, 2], bass: 4 },
  A: { frets: [-1, 0, 2, 2, 2, 0], bass: 5 },
  E: { frets: [0, 2, 2, 1, 0, 0], bass: 6 },
  Am: { frets: [-1, 0, 2, 2, 1, 0], bass: 5 },
  Em: { frets: [0, 2, 2, 0, 0, 0], bass: 6 },
  Dm: { frets: [-1, -1, 0, 2, 3, 1], bass: 4 },
  F: { frets: [-1, -1, 3, 2, 1, 0], bass: 4 }, // F dễ (xx3210 ~ Fmaj7 feel)

  // Common 7th (bolero/pop)
  A7: { frets: [-1, 0, 2, 0, 2, 0], bass: 5 },
  D7: { frets: [-1, -1, 0, 2, 1, 2], bass: 4 },
  E7: { frets: [0, 2, 0, 1, 0, 0], bass: 6 },
  G7: { frets: [3, 2, 0, 0, 0, 1], bass: 6 },
  C7: { frets: [-1, 3, 2, 3, 1, 0], bass: 5 },
  Am7: { frets: [-1, 0, 2, 0, 1, 0], bass: 5 },
  Dm7: { frets: [-1, -1, 0, 2, 1, 1], bass: 4 },
};

// Pattern steps chạy theo grid 8th-note ("8n").
// Với 4/4: 8 steps; 3/4: 6 steps; 6/8: 6 steps.
export const PATTERNS = [
  // Bolero
  {
    id: "bolero_rai_1",
    genre_id: "bolero",
    name: "Bolero Rải 1 (Bass–3–2–1–2–3–2–1)",
    compatible_time_signatures: [{ num: 4, den: 4 }],
    steps: [
      { type: "bass", which: "root" },
      { type: "pluck", string: 3 },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 1 },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 3 },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 1 },
    ],
  },
  {
    id: "bolero_chum_1",
    genre_id: "bolero",
    name: "Bolero Chùm (Bass–Chùm–2–1–Bass2–Chùm–2–1)",
    compatible_time_signatures: [{ num: 4, den: 4 }],
    steps: [
      { type: "bass", which: "root" },
      { type: "strumDown" },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 1 },
      { type: "bass", which: "alt" },
      { type: "strumDown" },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 1 },
    ],
  },

  // Strum / Pop
  {
    id: "strum_1",
    genre_id: "strum",
    name: "Strum 1 (D – D – U U – D U)",
    compatible_time_signatures: [{ num: 4, den: 4 }],
    steps: [
      { type: "strumDown" },
      { type: "rest" },
      { type: "strumDown" },
      { type: "rest" },
      { type: "strumUp" },
      { type: "strumUp" },
      { type: "strumDown" },
      { type: "strumUp" },
    ],
  },

  // Waltz 3/4
  {
    id: "waltz_1",
    genre_id: "waltz",
    name: "Waltz Rải 1 (Bass–3–2–1–2–3)",
    compatible_time_signatures: [{ num: 3, den: 4 }],
    steps: [
      { type: "bass", which: "root" },
      { type: "pluck", string: 3 },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 1 },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 3 },
    ],
  },

  // 6/8
  {
    id: "six8_1",
    genre_id: "six_eight",
    name: "6/8 Rải 1 (Bass–3–2–Bass2–2–1)",
    compatible_time_signatures: [{ num: 6, den: 8 }],
    steps: [
      { type: "bass", which: "root" },
      { type: "pluck", string: 3 },
      { type: "pluck", string: 2 },
      { type: "bass", which: "alt" },
      { type: "pluck", string: 2 },
      { type: "pluck", string: 1 },
    ],
  },
];
