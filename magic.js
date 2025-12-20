/**
 * GUITAR VIET AI - CORE ENGINE
 * @description: Bộ não xử lý đệm đàn thông minh (Smart Accompaniment)
 * @author: Gemini AI (Based on User's PRD)
 */

// ==========================================
// 1. CONSTANTS & CONFIG
// ==========================================
const CONFIG = {
    TICK_RATE: 20, // Mili-giây mỗi lần cập nhật vòng lặp (50Hz)
    LOOK_AHEAD: 0.1, // Giây (đọc trước dữ liệu để tránh trễ tiếng)
    HUMANIZE_VELOCITY: 10, // Độ lệch lực đánh ngẫu nhiên (+/-)
    HUMANIZE_TIMING: 0.015, // Độ lệch thời gian ngẫu nhiên (giây)
    QUANTIZE_WINDOW_LATE: 0.15, // Cửa sổ cho phép bấm trễ (150ms)
};

// Các loại hành động trong Pattern
const ACTION = {
    BASS_ROOT: 'BASS_ROOT',     // Bass chính (Gốc)
    BASS_ALT: 'BASS_ALT',       // Bass phụ (Bậc 5)
    PLUCK_LOW: 'PLUCK_LOW',     // Móc dây thấp (3)
    PLUCK_MID: 'PLUCK_MID',     // Móc dây giữa (2)
    PLUCK_HIGH: 'PLUCK_HIGH',   // Móc dây cao (1)
    STRUM_DOWN: 'STRUM_DOWN',   // Quạt xuống
    STRUM_UP: 'STRUM_UP',       // Quạt lên
    MUTE: 'MUTE',               // Ngắt tiếng (Dằn)
    FILL_NOTE: 'FILL_NOTE'      // Nốt chạy ngón
};

// ==========================================
// 2. MUSIC THEORY (Kiến thức Nhạc lý)
// ==========================================
const MusicTheory = {
    // Bản đồ dây Bass cho từng hợp âm (Logic Auto-Bass)
    // Format: [Dây Bass Chính (0-5), Dây Bass Phụ, Nốt Gốc MIDI]
    // Giả định dây 6 = index 5, dây 1 = index 0. Dây Bass thường là 3, 4, 5.
    ChordMap: {
        'C':  { string: 4, altString: 5, rootMIDI: 48, type: 'maj' }, // Dây 5
        'Dm': { string: 3, altString: 4, rootMIDI: 50, type: 'min' }, // Dây 4
        'E':  { string: 5, altString: 4, rootMIDI: 40, type: 'maj' }, // Dây 6
        'Em': { string: 5, altString: 4, rootMIDI: 40, type: 'min' },
        'F':  { string: 5, altString: 4, rootMIDI: 41, type: 'maj' },
        'G':  { string: 5, altString: 3, rootMIDI: 43, type: 'maj' },
        'Am': { string: 4, altString: 5, rootMIDI: 45, type: 'min' },
        'Bb': { string: 4, altString: 3, rootMIDI: 46, type: 'maj' },
        'B':  { string: 4, altString: 5, rootMIDI: 47, type: 'maj' },
    },

    // Định nghĩa các nốt trong hợp âm để Rải/Quạt
    // Offsets tính từ nốt Gốc
    Voicings: {
        'maj': [0, 4, 7, 12], // Đồ Mi Sol Đố
        'min': [0, 3, 7, 12], // Đồ Mi(b) Sol Đố
        '7':   [0, 4, 7, 10],
    },

    // Hàm lấy thông tin dây Bass
    getBassInfo: function(chordName) {
        return this.ChordMap[chordName] || this.ChordMap['C']; // Fallback về C
    }
};

// ==========================================
// 3. STYLE LIBRARY (Thư viện Điệu)
// ==========================================
// Dữ liệu mẫu Bolero với chu kỳ 4 ô nhịp
const Styles = {
    'Bolero': {
        tempo: 60,
        timeSig: 4, // 4/4
        // Mode 1: Rải (Intro/Verse 1)
        'ARPEGGIO': [
            // BAR 1: Cơ bản
            [
                { time: 0.0, action: ACTION.BASS_ROOT, vel: 110 },
                { time: 0.5, action: ACTION.PLUCK_LOW, vel: 70 },
                { time: 1.0, action: ACTION.PLUCK_MID, vel: 70 },
                { time: 1.5, action: ACTION.PLUCK_HIGH, vel: 75 },
                { time: 2.0, action: ACTION.PLUCK_MID, vel: 60 },
                { time: 2.5, action: ACTION.PLUCK_LOW, vel: 60 },
                { time: 3.0, action: ACTION.BASS_ROOT, vel: 90 }, // Bass lặp lại
                { time: 3.5, action: ACTION.PLUCK_MID, vel: 60 }
            ],
            // BAR 2: Đảo Bass (Tự động đổi dây)
            [
                { time: 0.0, action: ACTION.BASS_ALT, vel: 105 }, // <-- Đảo ở đây
                { time: 0.5, action: ACTION.PLUCK_LOW, vel: 70 },
                { time: 1.0, action: ACTION.PLUCK_MID, vel: 70 },
                { time: 1.5, action: ACTION.PLUCK_HIGH, vel: 75 },
                { time: 2.0, action: ACTION.PLUCK_MID, vel: 60 },
                { time: 2.5, action: ACTION.PLUCK_LOW, vel: 60 },
                { time: 3.0, action: ACTION.BASS_ROOT, vel: 90 },
                { time: 3.5, action: ACTION.PLUCK_MID, vel: 60 }
            ],
            // BAR 3: Giống Bar 1
            [ /* ...Copy logic Bar 1... */ ], 
            // BAR 4: Mini Fill (Báo hết vòng)
            [
                { time: 0.0, action: ACTION.BASS_ALT, vel: 110 },
                { time: 0.5, action: ACTION.PLUCK_MID, vel: 70 },
                { time: 1.0, action: ACTION.PLUCK_HIGH, vel: 80 },
                { time: 1.5, action: ACTION.PLUCK_MID, vel: 70 },
                // Chạy ngón cuối nhịp
                { time: 2.0, action: ACTION.FILL_NOTE, noteOffset: 7, vel: 90 }, // Sol
                { time: 2.5, action: ACTION.FILL_NOTE, noteOffset: 5, vel: 95 }, // Fa
                { time: 3.0, action: ACTION.FILL_NOTE, noteOffset: 4, vel: 100 }, // Mi
                { time: 3.5, action: ACTION.FILL_NOTE, noteOffset: 2, vel: 105 }  // Rê
            ]
        ],
        // Mode 2: Quạt (Chorus)
        'STRUM': [
            // Chỉ cần định nghĩa 1 Bar mẫu, App sẽ loop
            [
                { time: 0.0, action: ACTION.BASS_ROOT, vel: 127 }, // Mạnh nhất
                { time: 0.5, action: ACTION.STRUM_DOWN, vel: 90 },
                { time: 1.0, action: ACTION.STRUM_DOWN, vel: 80 },
                { time: 1.5, action: ACTION.STRUM_UP, vel: 70 },
                { time: 2.0, action: ACTION.STRUM_DOWN, vel: 100 }, // Chách
                { time: 2.5, action: ACTION.STRUM_DOWN, vel: 60 },
                { time: 3.0, action: ACTION.BASS_ALT, vel: 110 },
                { time: 3.5, action: ACTION.STRUM_DOWN, vel: 70 }
            ]
        ]
    }
};

// ==========================================
// 4. GUITAR ENGINE (CLASS CHÍNH)
// ==========================================
class GuitarVietEngine {
    constructor(audioOutput) {
        this.audio = audioOutput; // Interface gửi lệnh ra loa (Native/WebAudio)
        
        // Trạng thái bài hát
        this.context = {
            tempo: 60,
            isPlaying: false,
            currentBeat: 0,
            barCount: 0, // Đếm số ô nhịp để biết đang ở Bar 1, 2, 3 hay 4
            nextNoteTime: 0, // Thời gian dự kiến phát nốt tiếp theo
        };

        // Trạng thái người chơi (2 Tay)
        this.inputState = {
            rightHandChord: null, // Hợp âm hiện tại (VD: 'Dm')
            leftHandMode: 'ARPEGGIO', // Chế độ: ARPEGGIO, STRUM, MUTE...
            isFillActive: false, // Có đang bấm nút Fill không?
        };

        // Vòng lặp
        this.intervalID = null;
    }

    // -----------------------------------
    // A. INPUT HANDLERS (Xử lý thao tác tay)
    // -----------------------------------

    /**
     * TAY PHẢI: Bấm Hợp âm (Harmony Zone)
     * Logic: Quantization & Smart Sync
     */
    setRightHandChord(chordName) {
        const now = this.audio.getCurrentTime();
        const prevChord = this.inputState.rightHandChord;
        this.inputState.rightHandChord = chordName;

        if (!this.context.isPlaying) {
            this.start(); // Bấm là chạy luôn
            return;
        }

        // --- SMART QUANTIZATION LOGIC ---
        // Tính khoảng cách tới phách 1 tiếp theo
        const beatDuration = 60 / this.context.tempo;
        const timeToNextBeat = this.context.nextNoteTime - now;
        
        // Scenario 1: Bấm Sớm (Early) -> Đã xử lý tự động bởi Scheduler (nó sẽ đọc chord mới ở nhịp tới)
        
        // Scenario 2: Bấm Muộn (Late) trong ngưỡng cho phép (< 150ms)
        // User bấm trễ sau khi phách 1 đã qua. Cần "Bù" ngay lập tức.
        if (timeToNextBeat > (beatDuration - CONFIG.QUANTIZE_WINDOW_LATE)) {
             console.log(`User bấm trễ! Bù ngay lập tức hợp âm ${chordName}`);
             this.playImmediateAccent(chordName);
        }
    }

    /**
     * TAY TRÁI: Chọn Kiểu chơi (Style Zone)
     * ButtonID: 1=Rải, 2=Đệm, 3=Quạt, 4=Bass, 5=Fill, 6=Kết
     */
    setLeftHandAction(buttonId, actionType) {
        // actionType: 'PRESS', 'RELEASE', 'DOUBLE_TAP'
        
        switch (buttonId) {
            case 1: this.inputState.leftHandMode = 'ARPEGGIO'; break;
            case 2: this.inputState.leftHandMode = 'STRUM_LIGHT'; break;
            case 3: this.inputState.leftHandMode = 'STRUM'; break;
            case 5: // Nút Fill (Báo)
                if (actionType === 'PRESS') {
                    this.triggerFillIn();
                }
                break;
            case 6: // Nút Dằn/Kết
                if (actionType === 'PRESS') {
                    this.triggerStop();
                } else if (actionType === 'DOUBLE_TAP') {
                    this.triggerOutro();
                }
                break;
        }
    }

    // -----------------------------------
    // B. CORE SCHEDULER (Bộ lập lịch)
    // -----------------------------------

    start() {
        if (this.context.isPlaying) return;
        this.context.isPlaying = true;
        this.context.nextNoteTime = this.audio.getCurrentTime() + 0.1;
        this.context.barCount = 0;
        this.context.currentBeat = 0;
        
        this.intervalID = setInterval(() => this.scheduler(), CONFIG.TICK_RATE);
    }

    scheduler() {
        // Đọc trước thời gian thực để lên lịch cho các nốt sắp tới
        while (this.context.nextNoteTime < this.audio.getCurrentTime() + CONFIG.LOOK_AHEAD) {
            this.scheduleBeat();
            this.advanceBeat();
        }
    }

    scheduleBeat() {
        // 1. Xác định đang ở đâu trong chu kỳ 4 nhịp
        // barIndex: 0, 1, 2, 3 (Tương ứng Bar 1-4)
        const barIndex = this.context.barCount % 4; 
        
        // 2. Lấy Pattern phù hợp từ Style Library
        const styleData = Styles['Bolero'][this.inputState.leftHandMode] || Styles['Bolero']['ARPEGGIO'];
        
        // Nếu Pattern chỉ có 1 Bar mẫu, dùng luôn Bar 0. Nếu có 4 Bar, dùng barIndex.
        const patternBar = styleData[barIndex] ? styleData[barIndex] : styleData[0];

        // 3. Tìm sự kiện trong Pattern khớp với Beat hiện tại
        // currentBeat chạy từ 0.0 -> 3.5
        const events = patternBar.filter(e => e.time === this.context.currentBeat);

        // 4. Xử lý từng sự kiện
        events.forEach(event => {
            this.processEvent(event, this.context.nextNoteTime);
        });
    }

    advanceBeat() {
        // Tăng beat lên 0.5 (nốt móc đơn)
        const secondsPerBeat = 60 / this.context.tempo;
        this.context.nextNoteTime += (secondsPerBeat * 0.5); // Bước nhảy 0.5 beat
        
        this.context.currentBeat += 0.5;
        if (this.context.currentBeat >= 4.0) {
            this.context.currentBeat = 0;
            this.context.barCount++; // Sang ô nhịp mới
        }
    }

    // -----------------------------------
    // C. PROCESSOR (Bộ xử lý logic nhạc lý)
    // -----------------------------------

    processEvent(event, time) {
        const chordName = this.inputState.rightHandChord;
        if (!chordName) return; // Chưa bấm hợp âm thì không kêu

        // 1. Lấy thông tin Hợp âm (Music Theory)
        const bassInfo = MusicTheory.getBassInfo(chordName);
        const voicings = MusicTheory.Voicings[bassInfo.type];

        // 2. Tính toán Humanize (Ngẫu nhiên hóa)
        const humanVel = event.vel + (Math.random() * CONFIG.HUMANIZE_VELOCITY * 2 - CONFIG.HUMANIZE_VELOCITY);
        const humanTime = time + (Math.random() * CONFIG.HUMANIZE_TIMING);

        // 3. Phân loại hành động và gửi lệnh ra Audio
        switch (event.action) {
            case ACTION.BASS_ROOT:
                // Tự chọn dây 4, 5 hoặc 6 dựa trên ChordMap
                this.audio.playString(bassInfo.string, bassInfo.rootMIDI, humanVel, humanTime);
                break;
            
            case ACTION.BASS_ALT:
                // Tự chọn dây Bass phụ (Bậc 5)
                // Logic đơn giản: Cộng 7 bán cung hoặc trừ 5 bán cung
                const altNote = bassInfo.rootMIDI - 5; 
                this.audio.playString(bassInfo.altString, altNote, humanVel, humanTime);
                break;

            case ACTION.PLUCK_LOW:
            case ACTION.PLUCK_MID:
            case ACTION.PLUCK_HIGH:
                // Mapping: Low=Dây 3, Mid=Dây 2, High=Dây 1
                const stringIdx = (event.action === ACTION.PLUCK_LOW) ? 2 : (event.action === ACTION.PLUCK_MID ? 1 : 0);
                // Tìm nốt trong voicing khớp với dây
                // (Đây là logic giả lập, thực tế cần map note vào fretboard)
                const note = bassInfo.rootMIDI + voicings[stringIdx % voicings.length] + 12; 
                this.audio.playString(stringIdx, note, humanVel, humanTime);
                break;

            case ACTION.STRUM_DOWN:
                // Quạt xuống: Trigger 4-6 dây nhanh liên tiếp
                this.strumChord(chordName, 'DOWN', humanVel, humanTime);
                break;
                
            case ACTION.FILL_NOTE:
                // Chạy ngón: Note gốc + Offset định nghĩa trong Pattern
                const fillNote = bassInfo.rootMIDI + event.noteOffset;
                this.audio.playNote(fillNote, humanVel, humanTime);
                break;
        }
    }

    // Hàm hỗ trợ quạt chả (mô phỏng độ trễ giữa các dây)
    strumChord(chordName, direction, velocity, startTime) {
        const bassInfo = MusicTheory.getBassInfo(chordName);
        const startString = bassInfo.string; // Bắt đầu từ dây Bass
        const strumSpeed = 0.03; // 30ms giữa các dây

        // Quạt 4 dây dưới
        for (let i = 0; i < 4; i++) {
            const stringIdx = (startString - i); // VD: Dây 4 -> 3 -> 2 -> 1
            if (stringIdx < 0) break;
            
            // Logic đơn giản hóa note
            const note = bassInfo.rootMIDI + MusicTheory.Voicings[bassInfo.type][i] + 12;
            
            const timeOffset = (direction === 'DOWN') ? (i * strumSpeed) : ((3-i) * strumSpeed);
            this.audio.playString(stringIdx, note, velocity * 0.9, startTime + timeOffset);
        }
    }
    
    // Hàm xử lý khi user bấm muộn (Bù đắp)
    playImmediateAccent(chordName) {
        const now = this.audio.getCurrentTime();
        const bassInfo = MusicTheory.getBassInfo(chordName);
        // Đánh mạnh dây Bass ngay lập tức
        this.audio.playString(bassInfo.string, bassInfo.rootMIDI, 127, now);
    }

    triggerFillIn() {
        console.log("TRIGGER FILL: Kích hoạt câu báo đè lên Pattern hiện tại");
        // Logic thực tế: Thay thế patternBar của nhịp hiện tại bằng Pattern Fill
        // Cần reset lại sau khi hết nhịp.
    }

    triggerStop() {
        console.log("STOP: Ngắt toàn bộ âm thanh");
        this.context.isPlaying = false;
        clearInterval(this.intervalID);
        this.audio.stopAll();
    }
}

// ==========================================
// 5. MOCK AUDIO INTERFACE (Giả lập đầu ra)
// ==========================================
// Trong thực tế, thay cái này bằng Tone.js hoặc Native Module
class MockAudioEngine {
    getCurrentTime() {
        return Date.now() / 1000; // Trả về giây
    }

    playString(stringIndex, midiNote, velocity, time) {
        // stringIndex: 0 (Dây 1 - Nhỏ nhất) -> 5 (Dây 6 - To nhất)
        const delay = Math.max(0, time - this.getCurrentTime());
        setTimeout(() => {
            console.log(`[AUDIO] 🎵 String:${stringIndex+1} | Note:${midiNote} | Vel:${Math.floor(velocity)}`);
        }, delay * 1000);
    }
    
    playNote(midiNote, velocity, time) {
         const delay = Math.max(0, time - this.getCurrentTime());
         setTimeout(() => {
            console.log(`[AUDIO] 🎹 Solo Note:${midiNote} | Vel:${Math.floor(velocity)}`);
        }, delay * 1000);
    }
    
    stopAll() { console.log("[AUDIO] 🔇 Mute All"); }
}

// ==========================================
// 6. USAGE EXAMPLE (Cách dùng)
// ==========================================

// 1. Khởi tạo
const audio = new MockAudioEngine();
const app = new GuitarVietEngine(audio);

// 2. Mô phỏng User chơi bài "Đắp mộ cuộc tình"
console.log("--- BẮT ĐẦU ---");

// Tay trái giữ nút RẢI
app.setLeftHandAction(1, 'PRESS'); 

// Tay phải bấm Dm (Bắt đầu chạy)
app.setRightHandChord('Dm');

// Sau 2 giây, User đổi sang hợp âm Bb
setTimeout(() => {
    console.log("\n--- CHUYỂN HỢP ÂM [Bb] ---");
    app.setRightHandChord('Bb');
}, 2000);

// Sau 4 giây, User chuyển sang Điệp Khúc (Tay trái bấm QUẠT, Tay phải bấm F)
setTimeout(() => {
    console.log("\n--- ĐIỆP KHÚC [F] + QUẠT ---");
    app.setLeftHandAction(3, 'PRESS'); // Nút 3 = Quạt
    app.setRightHandChord('F');
}, 4000);

// Sau 6 giây, Kết bài
setTimeout(() => {
    console.log("\n--- KẾT BÀI ---");
    app.setLeftHandAction(6, 'DOUBLE_TAP');
}, 6000);
