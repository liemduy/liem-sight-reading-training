/**
 * GUITAR VIET AI - CORE ENGINE (UPGRADED)
 * Bao gồm: Logic nhạc lý + Web Audio Synth (Tạo tiếng thật)
 */

// ==========================================
// 1. WEB AUDIO GUITAR (TẠO TIẾNG THẬT)
// ==========================================
class WebAudioGuitar {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
        this.reverbNode = this.createReverb();
    }

    // Kích hoạt âm thanh (Bắt buộc do chính sách trình duyệt)
    resume() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    getCurrentTime() {
        return this.ctx.currentTime;
    }

    // Tạo hiệu ứng vang (Reverb giả lập)
    createReverb() {
        const convolver = this.ctx.createConvolver();
        // Tạo impulse response đơn giản
        const rate = this.ctx.sampleRate;
        const length = rate * 2.0; // 2 giây
        const decay = 2.0;
        const buffer = this.ctx.createBuffer(2, length, rate);
        
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        convolver.buffer = buffer;
        
        const reverbGain = this.ctx.createGain();
        reverbGain.gain.value = 0.3; // Mức độ vang
        convolver.connect(reverbGain);
        reverbGain.connect(this.masterGain);
        return convolver;
    }

    // Mô phỏng tiếng gảy dây (Karplus-Strong simplified or Subtractive)
    playString(stringIndex, midiNote, velocity, time) {
        // Chuyển MIDI sang Tần số
        const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
        const startTime = Math.max(time, this.ctx.currentTime);
        const volume = velocity / 127;

        // 1. Oscillator (Dây đàn)
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle'; // Tam giác cho tiếng ấm
        osc.frequency.value = frequency;

        // 2. Filter (Mô phỏng độ bật của dây)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500 + (velocity * 10), startTime);
        filter.frequency.exponentialRampToValueAtTime(100, startTime + 0.5);

        // 3. Envelope (Độ to nhỏ theo thời gian)
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, startTime);
        env.gain.linearRampToValueAtTime(volume, startTime + 0.01); // Attack cực nhanh
        env.gain.exponentialRampToValueAtTime(0.001, startTime + 2.0); // Decay từ từ

        // Kết nối: Osc -> Filter -> Env -> Reverb & Master
        osc.connect(filter);
        filter.connect(env);
        env.connect(this.masterGain);
        env.connect(this.reverbNode); // Gửi sang Reverb

        osc.start(startTime);
        osc.stop(startTime + 2.5);
    }

    playNote(midiNote, velocity, time) {
        // Tiếng solo (sáng hơn chút)
        this.playString(0, midiNote, velocity, time); 
    }

    stopAll() {
        // Trong WebAudio đơn giản, ta để nốt tự tắt (Decay) cho tự nhiên
    }
}

// ==========================================
// 2. LOGIC ENGINE (GIỮ NGUYÊN TỪ PHIÊN BẢN TRƯỚC)
// ==========================================
// Cấu hình
const CONFIG = {
    TICK_RATE: 20,
    LOOK_AHEAD: 0.1,
    HUMANIZE_VELOCITY: 15,
    HUMANIZE_TIMING: 0.02,
    QUANTIZE_WINDOW_LATE: 0.15,
};

const ACTION = {
    BASS_ROOT: 'BASS_ROOT', BASS_ALT: 'BASS_ALT',
    PLUCK_LOW: 'PLUCK_LOW', PLUCK_MID: 'PLUCK_MID', PLUCK_HIGH: 'PLUCK_HIGH',
    STRUM_DOWN: 'STRUM_DOWN', STRUM_UP: 'STRUM_UP',
    MUTE: 'MUTE', FILL_NOTE: 'FILL_NOTE'
};

const MusicTheory = {
    ChordMap: {
        'C':  { string: 4, altString: 5, rootMIDI: 48, type: 'maj' },
        'Cm': { string: 4, altString: 5, rootMIDI: 48, type: 'min' },
        'D':  { string: 3, altString: 4, rootMIDI: 50, type: 'maj' },
        'Dm': { string: 3, altString: 4, rootMIDI: 50, type: 'min' },
        'E':  { string: 5, altString: 4, rootMIDI: 40, type: 'maj' },
        'Em': { string: 5, altString: 4, rootMIDI: 40, type: 'min' },
        'F':  { string: 5, altString: 4, rootMIDI: 41, type: 'maj' },
        'Fm': { string: 5, altString: 4, rootMIDI: 41, type: 'min' },
        'G':  { string: 5, altString: 3, rootMIDI: 43, type: 'maj' },
        'Gm': { string: 5, altString: 3, rootMIDI: 43, type: 'min' },
        'A':  { string: 4, altString: 5, rootMIDI: 45, type: 'maj' },
        'Am': { string: 4, altString: 5, rootMIDI: 45, type: 'min' },
        'Bb': { string: 4, altString: 3, rootMIDI: 46, type: 'maj' },
        'B':  { string: 4, altString: 5, rootMIDI: 47, type: 'maj' },
        'Bm': { string: 4, altString: 5, rootMIDI: 47, type: 'min' },
    },
    Voicings: {
        'maj': [0, 4, 7, 12], 'min': [0, 3, 7, 12], '7': [0, 4, 7, 10],
    },
    getBassInfo: function(chordName) {
        // Xử lý cơ bản, nếu không tìm thấy thì fallback về C
        return this.ChordMap[chordName] || this.ChordMap['C'];
    }
};

const Styles = {
    'Bolero': {
        tempo: 60,
        'ARPEGGIO': [
            [{ time: 0.0, action: ACTION.BASS_ROOT, vel: 110 }, { time: 0.5, action: ACTION.PLUCK_LOW, vel: 70 }, { time: 1.0, action: ACTION.PLUCK_MID, vel: 70 }, { time: 1.5, action: ACTION.PLUCK_HIGH, vel: 75 }, { time: 2.0, action: ACTION.PLUCK_MID, vel: 60 }, { time: 2.5, action: ACTION.PLUCK_LOW, vel: 60 }, { time: 3.0, action: ACTION.BASS_ROOT, vel: 90 }, { time: 3.5, action: ACTION.PLUCK_MID, vel: 60 }],
            [{ time: 0.0, action: ACTION.BASS_ALT, vel: 105 }, { time: 0.5, action: ACTION.PLUCK_LOW, vel: 70 }, { time: 1.0, action: ACTION.PLUCK_MID, vel: 70 }, { time: 1.5, action: ACTION.PLUCK_HIGH, vel: 75 }, { time: 2.0, action: ACTION.PLUCK_MID, vel: 60 }, { time: 2.5, action: ACTION.PLUCK_LOW, vel: 60 }, { time: 3.0, action: ACTION.BASS_ROOT, vel: 90 }, { time: 3.5, action: ACTION.PLUCK_MID, vel: 60 }],
            [{ time: 0.0, action: ACTION.BASS_ROOT, vel: 110 }, { time: 0.5, action: ACTION.PLUCK_LOW, vel: 70 }, { time: 1.0, action: ACTION.PLUCK_MID, vel: 70 }, { time: 1.5, action: ACTION.PLUCK_HIGH, vel: 75 }, { time: 2.0, action: ACTION.PLUCK_MID, vel: 60 }, { time: 2.5, action: ACTION.PLUCK_LOW, vel: 60 }, { time: 3.0, action: ACTION.BASS_ROOT, vel: 90 }, { time: 3.5, action: ACTION.PLUCK_MID, vel: 60 }],
            [{ time: 0.0, action: ACTION.BASS_ALT, vel: 110 }, { time: 0.5, action: ACTION.PLUCK_MID, vel: 70 }, { time: 1.0, action: ACTION.PLUCK_HIGH, vel: 80 }, { time: 1.5, action: ACTION.PLUCK_MID, vel: 70 }, { time: 2.0, action: ACTION.FILL_NOTE, noteOffset: 7, vel: 90 }, { time: 2.5, action: ACTION.FILL_NOTE, noteOffset: 5, vel: 95 }, { time: 3.0, action: ACTION.FILL_NOTE, noteOffset: 4, vel: 100 }, { time: 3.5, action: ACTION.FILL_NOTE, noteOffset: 2, vel: 105 }]
        ],
        'STRUM_LIGHT': [ // Đệm nhẹ
             [{ time: 0.0, action: ACTION.BASS_ROOT, vel: 100 }, { time: 1.0, action: ACTION.STRUM_DOWN, vel: 50 }, { time: 2.0, action: ACTION.STRUM_DOWN, vel: 60 }, { time: 3.0, action: ACTION.BASS_ALT, vel: 90 }]
        ],
        'STRUM': [ // Quạt sung
            [{ time: 0.0, action: ACTION.BASS_ROOT, vel: 127 }, { time: 0.5, action: ACTION.STRUM_DOWN, vel: 90 }, { time: 1.0, action: ACTION.STRUM_DOWN, vel: 80 }, { time: 1.5, action: ACTION.STRUM_UP, vel: 70 }, { time: 2.0, action: ACTION.STRUM_DOWN, vel: 100 }, { time: 2.5, action: ACTION.STRUM_DOWN, vel: 60 }, { time: 3.0, action: ACTION.BASS_ALT, vel: 110 }, { time: 3.5, action: ACTION.STRUM_DOWN, vel: 70 }]
        ]
    }
};

class GuitarVietEngine {
    constructor(audioOutput) {
        this.audio = audioOutput;
        this.context = { tempo: 60, isPlaying: false, currentBeat: 0, barCount: 0, nextNoteTime: 0 };
        this.inputState = { rightHandChord: null, leftHandMode: 'ARPEGGIO', isFillActive: false };
        this.intervalID = null;
    }

    setRightHandChord(chordName) {
        // Đảm bảo Audio Context đã bật khi user tương tác
        this.audio.resume();

        const now = this.audio.getCurrentTime();
        this.inputState.rightHandChord = chordName;

        if (!this.context.isPlaying) {
            this.start();
            return;
        }
        
        // Smart Quantize Logic
        const beatDuration = 60 / this.context.tempo;
        const timeToNextBeat = this.context.nextNoteTime - now;
        if (timeToNextBeat > (beatDuration - CONFIG.QUANTIZE_WINDOW_LATE)) {
             this.playImmediateAccent(chordName);
        }
    }

    setLeftHandAction(buttonId, actionType) {
        this.audio.resume();
        switch (buttonId) {
            case 1: this.inputState.leftHandMode = 'ARPEGGIO'; break;
            case 2: this.inputState.leftHandMode = 'STRUM_LIGHT'; break;
            case 3: this.inputState.leftHandMode = 'STRUM'; break;
            case 5: if (actionType === 'PRESS') this.triggerFillIn(); break;
            case 6: if (actionType === 'PRESS') this.triggerStop(); 
                    else if (actionType === 'DOUBLE_TAP') this.triggerOutro(); break;
        }
    }

    start() {
        if (this.context.isPlaying) return;
        this.audio.resume();
        this.context.isPlaying = true;
        this.context.nextNoteTime = this.audio.getCurrentTime() + 0.1;
        this.context.barCount = 0;
        this.context.currentBeat = 0;
        this.intervalID = setInterval(() => this.scheduler(), CONFIG.TICK_RATE);
    }

    scheduler() {
        while (this.context.nextNoteTime < this.audio.getCurrentTime() + CONFIG.LOOK_AHEAD) {
            this.scheduleBeat();
            this.advanceBeat();
        }
    }

    scheduleBeat() {
        const barIndex = this.context.barCount % 4;
        let styleMode = this.inputState.leftHandMode;
        
        // Fallback nếu mode chưa định nghĩa
        if(!Styles['Bolero'][styleMode]) styleMode = 'ARPEGGIO';

        const styleData = Styles['Bolero'][styleMode];
        const patternBar = styleData[barIndex] ? styleData[barIndex] : styleData[0];
        const events = patternBar.filter(e => Math.abs(e.time - this.context.currentBeat) < 0.01);

        events.forEach(event => this.processEvent(event, this.context.nextNoteTime));
    }

    advanceBeat() {
        const secondsPerBeat = 60 / this.context.tempo;
        this.context.nextNoteTime += (secondsPerBeat * 0.5);
        this.context.currentBeat += 0.5;
        if (this.context.currentBeat >= 4.0) {
            this.context.currentBeat = 0;
            this.context.barCount++;
        }
    }

    processEvent(event, time) {
        const chordName = this.inputState.rightHandChord;
        if (!chordName) return;

        const bassInfo = MusicTheory.getBassInfo(chordName);
        const voicings = MusicTheory.Voicings[bassInfo.type];
        
        const humanVel = event.vel + (Math.random() * CONFIG.HUMANIZE_VELOCITY * 2 - CONFIG.HUMANIZE_VELOCITY);
        const humanTime = time + (Math.random() * CONFIG.HUMANIZE_TIMING);

        switch (event.action) {
            case ACTION.BASS_ROOT:
                this.audio.playString(bassInfo.string, bassInfo.rootMIDI, humanVel, humanTime);
                break;
            case ACTION.BASS_ALT:
                const altNote = bassInfo.rootMIDI - 5; 
                this.audio.playString(bassInfo.altString, altNote, humanVel, humanTime);
                break;
            case ACTION.PLUCK_LOW:
            case ACTION.PLUCK_MID:
            case ACTION.PLUCK_HIGH:
                const stringIdx = (event.action === ACTION.PLUCK_LOW) ? 2 : (event.action === ACTION.PLUCK_MID ? 1 : 0);
                const note = bassInfo.rootMIDI + voicings[stringIdx % voicings.length] + 12; 
                this.audio.playString(stringIdx, note, humanVel, humanTime);
                break;
            case ACTION.STRUM_DOWN:
                this.strumChord(chordName, 'DOWN', humanVel, humanTime);
                break;
            case ACTION.STRUM_UP:
                this.strumChord(chordName, 'UP', humanVel, humanTime);
                break;
            case ACTION.FILL_NOTE:
                const fillNote = bassInfo.rootMIDI + event.noteOffset;
                this.audio.playNote(fillNote, humanVel, humanTime);
                break;
        }
    }

    strumChord(chordName, direction, velocity, startTime) {
        const bassInfo = MusicTheory.getBassInfo(chordName);
        const startString = bassInfo.string;
        const strumSpeed = 0.03; 
        for (let i = 0; i < 4; i++) {
            const stringIdx = (startString - i);
            if (stringIdx < 0) break;
            const note = bassInfo.rootMIDI + MusicTheory.Voicings[bassInfo.type][i] + 12;
            const timeOffset = (direction === 'DOWN') ? (i * strumSpeed) : ((3-i) * strumSpeed);
            this.audio.playString(stringIdx, note, velocity * 0.9, startTime + timeOffset);
        }
    }
    
    playImmediateAccent(chordName) {
        const now = this.audio.getCurrentTime();
        const bassInfo = MusicTheory.getBassInfo(chordName);
        this.audio.playString(bassInfo.string, bassInfo.rootMIDI, 127, now);
    }

    triggerFillIn() { console.log("Fill-in trigger!"); }
    triggerStop() { 
        this.context.isPlaying = false; 
        clearInterval(this.intervalID); 
        this.audio.stopAll(); 
    }
    triggerOutro() { console.log("Outro trigger!"); }
}

// Hàm hỗ trợ Parse Input
function parseSongInput(inputText) {
    const lines = inputText.split('\n');
    const songData = [];
    
    lines.forEach(line => {
        if (!line.trim()) {
            songData.push({ line: "" }); // Dòng trống
            return;
        }

        // Regex tìm hợp âm trong ngoặc vuông [Dm] hoặc tròn (Dm)
        const regex = /\[([A-Za-z0-9#]+)\]|\(([A-Za-z0-9#]+)\)/g;
        let match;
        const chords = [];
        let cleanLine = line;
        
        // Vì vị trí hợp âm trong text gốc có thể nằm giữa từ, ta cần logic map
        // Ở đây dùng logic đơn giản: Hợp âm đứng trước từ nào thì gán cho từ đó
        
        // Cách tiếp cận đơn giản hơn cho MVP:
        // Tách chuỗi thành các phần tử, nếu là hợp âm thì gán cho từ tiếp theo
        const parts = line.split(/(\[[^\]]+\]|\([^\)]+\)|\s+)/).filter(p => p.trim().length > 0);
        
        let wordIndex = 0;
        let pendingChord = null;
        let lineText = "";
        
        // Parse lại dòng
        // Ví dụ: "[Dm] Say [Bb] giấc" -> 
        // Token 1: [Dm] -> pendingChord = Dm
        // Token 2: Say -> chords.push({wordIndex: 0, chord: Dm}), pendingChord = null, wordIndex++
        
        // Lưu ý: Logic này cần xử lý chuỗi input phức tạp. 
        // Để an toàn và nhanh, ta dùng Regex thay thế hợp âm để lấy text sạch,
        // và tính toán vị trí tương đối.
        
        // 1. Lấy text sạch (chỉ lời)
        const textOnly = line.replace(regex, "").trim();
        if(!textOnly) return; // Dòng chỉ có hợp âm (Intro?) bỏ qua hoặc xử lý riêng
        
        // 2. Tìm vị trí hợp âm
        let currentTextIndex = 0;
        let rawWords = line.split(/\s+/); // Tách theo khoảng trắng của dòng gốc
        
        // Logic đơn giản hóa cho MVP:
        // User nhập: [Dm] Say giấc mộng [Bb] ban đầu
        // Output: line: "Say giấc mộng ban đầu", chords: [{idx:0, Dm}, {idx:3, Bb}]
        
        const finalWords = [];
        let currentWordIdx = 0;
        
        // Tách bằng khoảng trắng nhưng giữ lại delimiter
        // Ta dùng một parser thủ công
        const tokens = line.split(' ');
        
        tokens.forEach(token => {
            // Check nếu token bắt đầu bằng hợp âm
            const chordMatch = token.match(/^\[([A-Za-z0-9#]+)\]/);
            if (chordMatch) {
                const chord = chordMatch[1];
                const word = token.replace(chordMatch[0], ""); // Lấy phần từ còn lại
                if (word) {
                    chords.push({ wordIndex: currentWordIdx, text: word, chord: chord });
                    finalWords.push(word);
                    currentWordIdx++;
                } else {
                    pendingChord = chord; // Hợp âm đứng một mình, gán cho từ sau
                }
            } else {
                if (pendingChord) {
                    chords.push({ wordIndex: currentWordIdx, text: token, chord: pendingChord });
                    pendingChord = null;
                }
                finalWords.push(token);
                currentWordIdx++;
            }
        });
        
        songData.push({ line: finalWords.join(" "), chords: chords });
    });
    
    return songData;
}
