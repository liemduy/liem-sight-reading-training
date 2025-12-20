/* taydem.engine.js (v2.0 - Option A Only JS)
 * Core goals:
 * - Smooth transitions: chord/style/tempo/meter/energy/rightHand/part/mode apply at bar boundary
 * - Adaptive anti-mud: chord spam guard + tail trimming + automatic duck hint for audio
 * - Groove presets: merge (style.grooveBase + groovePreset adjustments)
 * - Fill intensity: soft/hard; Ending: short/long (style supports both)
 * - Still "web-static" friendly: no heavy math, deterministic PRNG
 *
 * Contract: schedule(evt) where evt={t,kind,action,chord,vel,dur,data}
 * Exposes: window.TayDemEngine.create()
 */
(function (global) {
  "use strict";

  function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }

  // FNV-1a hash 32
  function hash32(str){
    let h = 0x811c9dc5;
    for (let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h>>>0;
  }
  function mulberry32(seed){
    let t = seed>>>0;
    return function(){
      t += 0x6D2B79F5;
      let x = Math.imul(t ^ (t>>>15), 1|t);
      x ^= x + Math.imul(x ^ (x>>>7), 61|x);
      return ((x ^ (x>>>14))>>>0)/4294967296;
    };
  }
  function prngFromKey(key){ return mulberry32(hash32(key)); }

  // ------------------------------------------------------------
  // Chord parsing helpers
  // ------------------------------------------------------------
  const NOTE = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };

  function normalizeChordSymbol(raw){
    if (!raw) return "";
    let s = String(raw).trim().replace(/\s+/g,"");
    s = s.replace(/Δ/g,"maj").replace(/♭/g,"b").replace(/♯/g,"#");
    s = s.replace(/minor/ig,"m").replace(/min(?!or)/ig,"m").replace(/major/ig,"maj");
    // normalize common "Dm7" etc already fine
    const m = s.match(/^([A-Ga-g])([#b]?)(.*)$/);
    if (!m) return s;
    const root = m[1].toUpperCase();
    const acc = m[2] || "";
    let rest = m[3] || "";
    rest = rest.replace(/^min7/i,"m7");
    return root + acc + rest;
  }

  function parseChordSymbol(sym){
    const s = normalizeChordSymbol(sym);
    if (!s) return { ok:false };

    let main = s, bassPart = null;
    const slash = s.indexOf("/");
    if (slash >= 0){ main = s.slice(0,slash); bassPart = s.slice(slash+1); }

    const m = main.match(/^([A-G])([#b]?)(.*)$/);
    if (!m) return { ok:false };

    const root = m[1], acc = m[2]||"", ext = (m[3]||"");
    const rootSemi = (NOTE[root] + (acc==="#"?1:acc==="b"?-1:0) + 12)%12;

    let quality = "maj";
    if (/^m(?!aj)/i.test(ext)) quality = "min";
    if (/^dim/i.test(ext)) quality = "dim";
    if (/^aug/i.test(ext)) quality = "aug";
    if (/^sus2/i.test(ext)) quality = "sus2";
    if (/^sus4/i.test(ext) || /^sus/i.test(ext)) quality = "sus4";
    if (/^maj/i.test(ext)) quality = "maj";

    let bassSemi = null;
    if (bassPart){
      const b = bassPart.match(/^([A-G])([#b]?)$/);
      if (b){
        bassSemi = (NOTE[b[1]] + (b[2]==="#"?1:b[2]==="b"?-1:0) + 12)%12;
      }
    }
    return { ok:true, sym:s, rootSemi, quality, ext, bassSemi };
  }

  function chordTones(rootSemi, quality, extStr){
    let third = 4, fifth = 7;
    if (quality==="min") third=3;
    if (quality==="dim"){ third=3; fifth=6; }
    if (quality==="aug"){ third=4; fifth=8; }
    if (quality==="sus2"){ third=2; fifth=7; }
    if (quality==="sus4"){ third=5; fifth=7; }

    const tones = [0, third, fifth];
    if (/maj7/i.test(extStr)) tones.push(11);
    else if (/m7/i.test(extStr)) tones.push(10);
    else if (/(^|[^a-z])7/i.test(extStr)) tones.push(10);

    return tones.map(x => (rootSemi + x)%12);
  }

  // ------------------------------------------------------------
  // Guitar shapes + voice-leading
  // ------------------------------------------------------------
  const OPEN_MIDI = [40,45,50,55,59,64]; // strings 6..1

  function midiForString(shape, stringNum){
    const idx = 6 - stringNum;
    const fret = shape[idx];
    if (fret==="x"||fret==="X"||fret==null) return null;
    return OPEN_MIDI[idx] + Number(fret);
  }

  function shapeToPitches(shape){
    const out=[];
    for (let i=0;i<6;i++){
      const f=shape[i];
      if (f==="x"||f==="X"||f==null) continue;
      out.push({ string:6-i, midi:OPEN_MIDI[i]+Number(f), fret:Number(f) });
    }
    out.sort((a,b)=>a.midi-b.midi);
    return out;
  }

  function topNoteMidi(shape){
    const p=shapeToPitches(shape);
    return p.length ? p[p.length-1].midi : null;
  }

  function bassNoteMidiFromShape(shape){
    const p=shapeToPitches(shape);
    return p.length ? p[0].midi : null;
  }

  function shapeDistance(a,b){
    let s=0,n=0;
    for (let i=0;i<6;i++){
      const fa=a[i], fb=b[i];
      if (fa==="x"||fb==="x"||fa==="X"||fb==="X"||fa==null||fb==null) continue;
      s += Math.abs(Number(fa)-Number(fb)); n++;
    }
    return n ? s/n : 999;
  }

  function chooseTrebleString(shape){
    if (midiForString(shape,1)!=null) return 1;
    if (midiForString(shape,2)!=null) return 2;
    if (midiForString(shape,3)!=null) return 3;
    if (midiForString(shape,4)!=null) return 4;
    return 3;
  }
  function chooseMidString(shape){
    if (midiForString(shape,3)!=null) return 3;
    if (midiForString(shape,4)!=null) return 4;
    if (midiForString(shape,2)!=null) return 2;
    return chooseTrebleString(shape);
  }

  function nearestMidiForSemi(semi, lo, hi, prefer){
    let best=null, bestScore=Infinity;
    const center = prefer!=null ? prefer : (lo+hi)/2;
    for (let m=lo;m<=hi;m++){
      if ((m%12)!==semi) continue;
      const sc=Math.abs(m-center);
      if (sc<bestScore){ bestScore=sc; best=m; }
    }
    return best;
  }

  // bass alternation: root/fifth w/ minimal jump
  function chooseBassMidi(parsed, state, forcedTone){
    const lo=38, hi=55, center=45;

    if (parsed.bassSemi!=null){
      const m=nearestMidiForSemi(parsed.bassSemi, lo, hi, state.lastBassMidi ?? center);
      state.lastBassMidi=m; state.bassAlt=0;
      return m;
    }

    const root=parsed.rootSemi;
    const fifth=(root+7)%12;

    let wantSemi;
    if (forcedTone==="root") wantSemi=root;
    else if (forcedTone==="fifth") wantSemi=fifth;
    else {
      const alt=state.bassAlt%2;
      const semiA = alt===0 ? root : fifth;
      const semiB = alt===0 ? fifth : root;

      const a=nearestMidiForSemi(semiA, lo, hi, state.lastBassMidi ?? center);
      const b=nearestMidiForSemi(semiB, lo, hi, state.lastBassMidi ?? center);

      const moveA = state.lastBassMidi==null ? 0 : Math.abs(a-state.lastBassMidi);
      const moveB = state.lastBassMidi==null ? 0 : Math.abs(b-state.lastBassMidi);

      wantSemi = (moveA <= moveB+2) ? semiA : semiB;
    }

    const chosen=nearestMidiForSemi(wantSemi, lo, hi, state.lastBassMidi ?? center);
    state.lastBassMidi=chosen;
    state.bassAlt++;
    return chosen;
  }

  // Piano voicing: pick notes around targetCenter, then reduce jumps vs previous
  function choosePianoVoicingMidis(toneSemis, targetCenterMidi, count){
    const c = count || (toneSemis.length>=4?4:3);
    const cand=[];
    for (let m=targetCenterMidi-24;m<=targetCenterMidi+24;m++){
      if (toneSemis.includes(m%12)) cand.push(m);
    }

    const picked=[];
    const idealMin=targetCenterMidi-10;
    const idealMax=targetCenterMidi+14;

    for (const m of cand){
      if (picked.length>=c) break;
      if (m<idealMin||m>idealMax) continue;
      if (picked.some(x=>Math.abs(x-m)<3)) continue;
      picked.push(m);
    }

    while (picked.length<c){
      let best=null, bestScore=Infinity;
      for (const m of cand){
        if (picked.includes(m)) continue;
        const sc=Math.abs(m-targetCenterMidi)+(picked.some(x=>Math.abs(x-m)<2)?100:0);
        if (sc<bestScore){ bestScore=sc; best=m; }
      }
      if (best==null) break;
      picked.push(best);
    }

    picked.sort((a,b)=>a-b);
    while (picked.length>c){
      const low=Math.abs(picked[0]-targetCenterMidi);
      const high=Math.abs(picked[picked.length-1]-targetCenterMidi);
      if (low>high) picked.shift(); else picked.pop();
    }
    return picked;
  }

  function resolvePianoVoicing(data, chordSymNorm, prev){
    const p=parseChordSymbol(chordSymNorm);
    if (!p.ok) return { bass:50, notes:[62,65,69] };

    const tones=chordTones(p.rootSemi, p.quality, p.ext);
    const cnt=tones.length>=4?4:3;
    const targetCenter=(data.piano && data.piano.targetCenterMidi) ? data.piano.targetCenterMidi : 64;

    const base=choosePianoVoicingMidis(tones, targetCenter, cnt);

    if (!prev || !prev.notes) {
      const bassSemi = (p.bassSemi!=null) ? p.bassSemi : p.rootSemi;
      return { bass: nearestMidiForSemi(bassSemi,40,55,46), notes: base };
    }

    const prevN=prev.notes.slice().sort((a,b)=>a-b);
    const curN=base.slice().sort((a,b)=>a-b);
    let dist=0;
    for (let i=0;i<Math.min(prevN.length,curN.length);i++) dist += Math.abs(prevN[i]-curN[i]);

    if (dist > 18){
      for (let i=0;i<curN.length;i++){
        const pnote = prevN[Math.min(i,prevN.length-1)];
        while (curN[i]-pnote > 8) curN[i]-=12;
        while (pnote-curN[i] > 8) curN[i]+=12;
      }
      curN.sort((a,b)=>a-b);
    }

    const bassSemi = (p.bassSemi!=null) ? p.bassSemi : p.rootSemi;
    return { bass: nearestMidiForSemi(bassSemi,40,55,46), notes: curN };
  }

  function resolveGuitarShape(data, chordSymNorm, prevShape){
    const shapes=data.guitarShapes || {};
    const entry=shapes[chordSymNorm];
    if (!entry) return ['x','x',0,2,3,1]; // safe

    const candidates=Array.isArray(entry)?entry:[entry];
    if (!prevShape || candidates.length===1) return candidates[0];

    const prevTop=topNoteMidi(prevShape);
    const prevBass=bassNoteMidiFromShape(prevShape);

    let best=candidates[0], bestScore=Infinity;
    for (const sh of candidates){
      const fd=shapeDistance(prevShape, sh);
      const top=topNoteMidi(sh);
      const bass=bassNoteMidiFromShape(sh);

      const topMove=(prevTop!=null && top!=null)?Math.abs(top-prevTop):12;
      const bassMove=(prevBass!=null && bass!=null)?Math.abs(bass-prevBass):12;

      // stronger preference for minimal fret motion + avoid huge top jumps
      const score = fd*1.0 + topMove*0.30 + bassMove*0.20;
      if (score<bestScore){ bestScore=score; best=sh; }
    }
    return best;
  }

  // ------------------------------------------------------------
  // Pattern selection (supports variants)
  // ------------------------------------------------------------
  function getPattern(data, id){
    return (data.patterns && data.patterns[id]) ? data.patterns[id] : null;
  }

  function pickVariant(def, rightHand){
    if (!def) return null;
    if (typeof def === "string") return def;
    // variant object: {down,up,auto} or {soft,hard} etc
    if (def.down || def.up || def.auto){
      const key = (rightHand==="down"||rightHand==="up") ? rightHand : "auto";
      return def[key] || def.auto || def.down || def.up || null;
    }
    return null;
  }

  function pickFill(def, fillIntensity){
    if (!def) return null;
    if (typeof def === "string") return def;
    if (def.soft || def.hard){
      return def[fillIntensity] || def.soft || def.hard || null;
    }
    return null;
  }

  function pickEnding(def, endingType){
    if (!def) return null;
    if (typeof def === "string") return def;
    if (def.short || def.long){
      return def[endingType] || def.long || def.short || null;
    }
    return null;
  }

  function selectTrackPattern(data, styleId, trackKey, part, rightHand, transitionMode, fillIntensity, endingType){
    const st = data.styles && data.styles[styleId];
    if (!st) return null;
    const tr = st[trackKey];
    if (!tr) return null;

    let id=null;
    if (transitionMode === "ending") id = pickEnding(tr.ending, endingType) || pickFill(tr.fill, fillIntensity) || pickVariant(tr.chorus, rightHand) || tr.verse;
    else if (transitionMode === "fill") id = pickFill(tr.fill, fillIntensity) || pickVariant(tr.chorus, rightHand) || tr.verse;
    else id = (part==="chorus") ? (pickVariant(tr.chorus, rightHand) || tr.verse) : tr.verse;

    return id ? getPattern(data, id) : null;
  }

  // ------------------------------------------------------------
  // Energy application + drop logic
  // ------------------------------------------------------------
  function applyEnergyToEvent(ev, energy, energyRules){
    const rules = (energyRules && energyRules[energy]) || null;
    const out = Object.assign({}, ev);
    if (!rules) return out;
    const velMul = (rules.velMul!=null)?rules.velMul:1.0;
    out.vel = clamp((out.vel!=null?out.vel:1.0)*velMul, 0.05, 1.0);
    if (rules.durMul!=null && out.durBeats!=null) out.durBeats = clamp(out.durBeats*rules.durMul, 0.05, 12);
    return out;
  }

  function shouldDropEvent(seedBase, energyRules, energy){
    const rules=(energyRules && energyRules[energy]) || null;
    if (!rules) return false;
    const drop=rules.densityDrop || 0;
    if (drop<=0) return false;
    return prngFromKey(seedBase+"|drop")() < drop;
  }

  // ------------------------------------------------------------
  // Human feel
  // ------------------------------------------------------------
  function calcStrumSpreadMs(bpm, loi01){
    const spbMs=(60/bpm)*1000;
    const base=10;
    const extra=clamp(0.04*spbMs*loi01, 0, 35);
    return clamp(base+extra, 10, 48);
  }
  function calcJitterMs(human01){ return clamp(2+10*human01, 2, 12); }

  // ------------------------------------------------------------
  // Groove merge: style base + groove preset (nhau/phongtra/tiktok)
  // ------------------------------------------------------------
  function mergeGroove(styleGrooveBase, groovePreset, barIndex){
    const g = styleGrooveBase || {};
    const p = groovePreset || {};
    const cycle = (g.cycleVel && g.cycleVel.length) ? g.cycleVel.slice() : [1.00,0.99,1.01,0.99];

    const cycleVel = cycle.map(v => v * (p.cycleVelMul!=null ? p.cycleVelMul : 1.0));

    // slight breathing per bar (deterministic)
    const breathe = (barIndex%8===0) ? 1.02 : (barIndex%8===4 ? 0.99 : 1.00);

    return {
      laybackMs: (g.laybackMs||0) + (p.laybackMsAdd||0),
      swingMs:   (g.swingMs||0) + (p.swingMsAdd||0),
      feel8:     g.feel8 || {},
      cycleVel,
      accentMul: p.accentMul!=null ? p.accentMul : 1.0,
      breathe
    };
  }

  // ------------------------------------------------------------
  // Engine
  // ------------------------------------------------------------
  function createEngine(opts){
    const cfg=opts||{};
    const data=cfg.data||{};
    const now=cfg.now || (()=>0);
    const schedule=cfg.schedule || (()=>{});
    const onState=cfg.onState || (()=>{});

    // state
    let instrumentMode = (data.defaults && data.defaults.instrumentMode) || "guitar";
    let outputMode = (data.defaults && data.defaults.outputMode) || "phone";
    let energy = (data.defaults && data.defaults.energy) || "normal";
    let styleId = (data.defaults && data.defaults.styleId) || "bolero";
    let groovePresetId = (data.defaults && data.defaults.groovePreset) || "nhau";
    let part = (data.defaults && data.defaults.part) || "verse";
    let rightHand = (data.defaults && data.defaults.rightHand) || "auto";
    let autoAssist = (data.defaults && data.defaults.autoAssist) != null ? !!data.defaults.autoAssist : true;

    let tempoCurrent = (data.defaults && data.defaults.bpm) || 84;
    let tempoTarget = tempoCurrent;

    let currentChord = normalizeChordSymbol((data.defaults && data.defaults.chord) || "Dm");

    // pending changes apply at bar boundary
    let pendingChord=null, pendingStyle=null, pendingEnergy=null, pendingMode=null, pendingOut=null, pendingPart=null, pendingRH=null, pendingAutoAssist=null, pendingGroove=null;

    // transitions
    let holdOn=false, running=false;
    let fillPending=false, endPending=false, endingBarsLeft=0;
    let fillIntensity = "soft"; // soft|hard
    let endingType = "long";    // short|long

    let meter="4/4", beatsPerBar=4;

    // voicing memory
    let prevGuitarShape=null;
    let prevPianoVo=null;
    const bassState={ lastBassMidi:null, bassAlt:0, lastChord:null };

    // human
    let loi = (cfg.loi!=null) ? cfg.loi : 0.60;
    let human = (cfg.human!=null) ? cfg.human : 0.45;

    // scheduler
    let tickTimer=null, nextBarTime=0, barIndex=0;
    const tickIntervalMs = cfg.tickIntervalMs!=null ? cfg.tickIntervalMs : 25;
    const lookaheadSec = cfg.lookaheadSec!=null ? cfg.lookaheadSec : 0.28;

    // anti spam (one-shot)
    let lastOneShotMs=0;
    const oneShotMinMs = cfg.oneShotMinMs!=null ? cfg.oneShotMinMs : 200;

    // anti-mud (hold): detect too many chord changes
    let recentChordChanges=[]; // timestamps (sec)
    let mudGuardLevel=0; // 0..2 auto

    function getStyle(sid){
      const st=data.styles && data.styles[sid];
      if (!st) throw new Error("Style not found: "+sid);
      return st;
    }
    function applyStyleMeter(st){
      const m = st.meter || "4/4";
      meter = m;
      beatsPerBar = (m==="3/4") ? 3 : 4;
    }

    function getGroovePreset(id){
      return (data.groovePresets && data.groovePresets[id]) ? data.groovePresets[id] : (data.groovePresets && data.groovePresets.nhau) || {};
    }

    try { applyStyleMeter(getStyle(styleId)); } catch(_) {}

    function secPerBeat(){ return 60/tempoCurrent; }
    function barDur(){ return secPerBeat()*beatsPerBar; }

    function recordChordChange(){
      const t=now();
      recentChordChanges.push(t);
      // keep last 2.2 sec
      recentChordChanges = recentChordChanges.filter(x => (t-x) <= 2.2);

      // mudGuard: if too many changes quickly, raise level
      // 0: normal, 1: trim tails more, 2: strong trim + extra duck
      if (recentChordChanges.length >= 6) mudGuardLevel = 2;
      else if (recentChordChanges.length >= 4) mudGuardLevel = 1;
      else mudGuardLevel = 0;
    }

    function applyPendingAtBar(){
      // tempo ramp per bar: smoother but bounded
      const maxStep = cfg.tempoMaxStepPerBar!=null ? cfg.tempoMaxStepPerBar : 7;
      if (tempoTarget!==tempoCurrent){
        const diff=tempoTarget-tempoCurrent;
        // gentle easing near target
        const step = clamp(diff*0.40, -maxStep, +maxStep);
        tempoCurrent = Math.round((tempoCurrent + step)*1000)/1000;
      }

      if (pendingStyle){
        styleId=pendingStyle; pendingStyle=null;
        applyStyleMeter(getStyle(styleId));
      }
      if (pendingGroove){
        groovePresetId=pendingGroove; pendingGroove=null;
      }
      if (pendingAutoAssist!=null){
        autoAssist=!!pendingAutoAssist; pendingAutoAssist=null;
      }
      if (pendingPart){
        part=pendingPart; pendingPart=null;
        if (autoAssist){
          energy = (part==="chorus") ? "high" : "low";
          // auto change rightHand for chorus to down unless user picked explicit
          if (rightHand==="auto") rightHand = (part==="chorus") ? "down" : "auto";
        }
      }
      if (pendingEnergy){ energy=pendingEnergy; pendingEnergy=null; }
      if (pendingRH){ rightHand=pendingRH; pendingRH=null; }
      if (pendingMode){ instrumentMode=pendingMode; pendingMode=null; }
      if (pendingOut){ outputMode=pendingOut; pendingOut=null; }

      if (pendingChord){
        currentChord=normalizeChordSymbol(pendingChord);
        pendingChord=null;
      }

      if (endPending){
        endPending=false;
        const st=getStyle(styleId);
        endingBarsLeft = clamp(st.endingBars || 2, 1, 4);
        fillPending=false;
        onState({ type:"endingStart", bars: endingBarsLeft, endingType });
      }

      onState({
        type:"barBoundary",
        barIndex, tempoCurrent, tempoTarget, meter, beatsPerBar,
        styleId, groovePresetId,
        instrumentMode, outputMode, energy, part, rightHand, autoAssist,
        currentChord, fillPending, fillIntensity, endingBarsLeft, endingType,
        mudGuardLevel
      });
    }

    function scheduleTrackBar(trackKey, chordNorm, parsed, barStart, pattern, groove, context){
      if (!pattern || !pattern.events || !pattern.events.length) return;

      const bpm=tempoCurrent;
      const spreadMs=calcStrumSpreadMs(bpm, loi);
      const jitterMs=calcJitterMs(human);

      const subdiv = pattern.subdivision || 8;
      const energyRules = pattern.energyRules || null;

      const cycle = groove.cycleVel || [1.00,0.99,1.01,0.99];
      const barDyn = (cycle[barIndex % cycle.length] || 1.0) * (groove.breathe || 1.0);

      const feel = groove.feel8 || {};
      const laybackMs = groove.laybackMs!=null ? groove.laybackMs : 0;
      const swingMs = groove.swingMs!=null ? groove.swingMs : 0;
      const accentMul = groove.accentMul!=null ? groove.accentMul : 1.0;

      // anti-mud: shorten ending indices if chord pending / mudGuard active
      const willChange = context.willChangeSoon;
      const tailTrim = willChange ? 0.55 : (mudGuardLevel===2 ? 0.55 : mudGuardLevel===1 ? 0.70 : 1.0);

      function timeAtIdx(idx){
        const beatsPerIdx = beatsPerBar / subdiv;
        return barStart + (idx*beatsPerIdx)*secPerBeat();
      }
      function idxFeelOffsetSec(idx, role){
        let ms=0;
        if (subdiv===8 && feel && feel[idx]!=null) ms += feel[idx];
        if (subdiv===8 && (idx%2===1) && swingMs) ms += swingMs;

        // role micro offsets
        if (role==="BASS") ms -= 2;
        if (role==="TREBLE") ms += 1;

        ms += laybackMs;
        return ms/1000;
      }
      function finalizeVel(baseVel, idx, role){
        let v=baseVel!=null?baseVel:1.0;
        if (pattern.accent && pattern.accent[idx]!=null) v *= pattern.accent[idx];
        v *= accentMul;

        const roleMul =
          role==="BASS" ? 0.98 :
          role==="MID" ? 0.62 :
          role==="TREBLE" ? 0.54 :
          role==="MUTE" ? 0.76 :
          role==="CHORD" ? 0.70 : 0.62;

        v *= roleMul;
        v *= barDyn;

        if (outputMode==="phone") v *= 0.98;
        return clamp(v, 0.06, 1.0);
      }

      function durSeconds(durBeats, idx, action){
        let d=(durBeats!=null?durBeats:0.6)*secPerBeat();
        if (outputMode==="phone" && (action==="brush"||action==="muteBrush")) d *= 0.85;
        // extra tail trim near bar end
        if (idx >= subdiv-2) d *= tailTrim;
        return clamp(d, 0.05, barDur()*0.95);
      }

      for (let ei=0;ei<pattern.events.length;ei++){
        const ev0=pattern.events[ei];
        const seedBase = `${chordNorm}|${barIndex}|${trackKey}|${pattern.id}|${ei}`;

        if (shouldDropEvent(seedBase, energyRules, energy)) continue;

        const ev=applyEnergyToEvent(ev0, energy, energyRules);
        const idx=ev.idx;

        const r=prngFromKey(seedBase);
        const jitter = (r()*2-1) * (jitterMs/1000) * (trackKey==="perc"?0.35:1.0);

        const role=ev.role||"MID";
        const action=ev.action||"pluck";

        const t = timeAtIdx(idx) + idxFeelOffsetSec(idx, role) + jitter;
        const dur = durSeconds(ev.durBeats, idx, action);
        const vel = finalizeVel(ev.vel, idx, role);

        // meta hint: on strong accents, suggest "pick noise/body" in audio
        const accentHint = (pattern.accent && pattern.accent[idx]!=null && pattern.accent[idx] > 1.05);

        if (trackKey==="guitar"){
          const shape=context.guitarShape;
          if (!shape) continue;

          if (role==="BASS" && (action==="pluck"||action==="pickString")){
            const bassMidi = parsed.ok ? chooseBassMidi(parsed, bassState, ev.bassTone||"auto")
                                      : (bassNoteMidiFromShape(shape)||45);
            schedule({ t, kind:"guitar", action:"pickMidi", chord:chordNorm, vel, dur,
              data:{ role:"BASS", midi:bassMidi, shape, hint:{ accent:accentHint, mudGuardLevel } }});
            continue;
          }

          if (action==="pluck"||action==="pickString"){
            const sNum = (role==="TREBLE") ? chooseTrebleString(shape)
                       : (role==="MID") ? chooseMidString(shape)
                       : chooseMidString(shape);
            schedule({ t, kind:"guitar", action:"pickString", chord:chordNorm, vel, dur,
              data:{ role, shape, string:sNum, hint:{ accent:accentHint, mudGuardLevel } }});
          } else if (action==="brush"||action==="strum"){
            const dir=ev.dir||"down";
            const strings=ev.strings || (outputMode==="external"?[6,5,4,3,2,1]:[5,4,3,2,1]);
            schedule({ t, kind:"guitar", action:"brush", chord:chordNorm, vel, dur,
              data:{ role:"CHORD", shape, dir, spreadMs, muted:!!ev.muted, strings, hint:{ accent:accentHint, mudGuardLevel } }});
          } else if (action==="muteBrush"||action==="mute"){
            const dir=ev.dir||"down";
            const strings=ev.strings || [4,3,2,1];
            schedule({ t, kind:"guitar", action:"muteBrush", chord:chordNorm, vel, dur:clamp(dur*0.35,0.05,0.25),
              data:{ role:"MUTE", shape, dir, spreadMs, strings, hint:{ accent:accentHint, mudGuardLevel } }});
          }
        }

        else if (trackKey==="piano"){
          const vo=context.pianoVoicing;
          if (!vo) continue;

          // phone band mode: avoid LH bass to reduce mud
          const allowBass = (instrumentMode!=="band") ? true : (outputMode==="external");

          if (role==="BASS" || action==="bass"){
            if (!allowBass) continue;
            schedule({ t, kind:"piano", action:"bass", chord:chordNorm, vel:clamp(vel*0.95,0.05,0.9), dur,
              data:{ role:"BASS", midi: vo.bass, hint:{ mudGuardLevel } }});
          } else {
            let v=vel;
            if (instrumentMode==="band") v *= 0.72;
            v=clamp(v, 0.05, 0.88);
            schedule({ t, kind:"piano", action:"chordHit", chord:chordNorm, vel:v, dur,
              data:{ role:"CHORD", midis: vo.notes, staccato: !!ev.staccato, hint:{ mudGuardLevel } }});
          }
        }

        else if (trackKey==="perc"){
          schedule({ t, kind:"perc", action: action, chord: chordNorm, vel, dur,
            data:{ role:"PERC", hint:{ mudGuardLevel } }});
        }
      }
    }

    function scheduleOneBar(barStart){
      const chordNorm=normalizeChordSymbol(currentChord);
      const parsed=parseChordSymbol(chordNorm);

      if (bassState.lastChord !== chordNorm){
        bassState.lastChord = chordNorm;
        bassState.bassAlt = 0;
      }

      const st=getStyle(styleId);
      const gPreset=getGroovePreset(groovePresetId);
      const groove = mergeGroove(st.grooveBase || {}, gPreset, barIndex);

      const transitionMode = (endingBarsLeft>0) ? "ending" : (fillPending ? "fill" : null);

      // Will change soon? (affects tail trim)
      const willChangeSoon = !!pendingChord || !!pendingStyle || !!pendingOut || !!pendingMode || !!pendingEnergy || !!pendingRH || !!pendingPart || !!pendingGroove || (endingBarsLeft>0) || fillPending || endPending;

      schedule({
        t:barStart, kind:"meta", action:"bar", chord:chordNorm, vel:0, dur:0,
        data:{
          barIndex, bpm:tempoCurrent, meter, beatsPerBar,
          styleId, groovePresetId,
          energy, part, rightHand,
          instrumentMode, outputMode,
          transitionMode, fillIntensity, endingType,
          mudGuardLevel
        }
      });

      const useGuitar = (instrumentMode==="guitar" || instrumentMode==="band");
      const usePiano  = (instrumentMode==="piano"  || instrumentMode==="band");
      const usePerc   = (instrumentMode==="band") && !!st.perc;

      const guitarShape = useGuitar ? resolveGuitarShape(data, chordNorm, prevGuitarShape) : null;
      if (guitarShape) prevGuitarShape = guitarShape;

      const pianoVo = usePiano ? resolvePianoVoicing(data, chordNorm, prevPianoVo) : null;
      if (pianoVo) prevPianoVo = pianoVo;

      const gPat = useGuitar ? selectTrackPattern(data, styleId, "guitar", part, rightHand, transitionMode, fillIntensity, endingType) : null;
      const pPat = usePiano  ? selectTrackPattern(data, styleId, "piano",  part, rightHand, transitionMode, fillIntensity, endingType) : null;
      const kPat = usePerc   ? selectTrackPattern(data, styleId, "perc",   part, rightHand, transitionMode, fillIntensity, endingType) : null;

      const ctx = { guitarShape, pianoVoicing:pianoVo, willChangeSoon };

      scheduleTrackBar("guitar", chordNorm, parsed, barStart, gPat, groove, ctx);
      scheduleTrackBar("piano",  chordNorm, parsed, barStart, pPat, groove, ctx);
      scheduleTrackBar("perc",   chordNorm, parsed, barStart, kPat, groove, ctx);

      if (fillPending && transitionMode==="fill"){
        fillPending=false;
        onState({ type:"fillUsed", fillIntensity });
      }

      if (endingBarsLeft>0 && transitionMode==="ending"){
        endingBarsLeft--;
        if (endingBarsLeft===0){
          const stopAt = barStart + barDur();
          schedule({ t: stopAt, kind:"meta", action:"stopAt", chord: chordNorm, vel:0, dur:0, data:{} });
          onState({ type:"endingDone", stopAt });
        }
      }
    }

    function tick(){
      if (!running) return;

      const tNow=now();
      while (nextBarTime < tNow + lookaheadSec){
        applyPendingAtBar();
        scheduleOneBar(nextBarTime);
        nextBarTime += barDur();
        barIndex++;
      }
      tickTimer=setTimeout(tick, tickIntervalMs);
    }

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------
    function startHold(initialChord){
      holdOn=true;
      if (initialChord) currentChord=normalizeChordSymbol(initialChord);

      if (!running){
        running=true;
        applyStyleMeter(getStyle(styleId));
        nextBarTime=now()+0.10;
        barIndex=0;
        recentChordChanges=[];
        mudGuardLevel=0;

        onState({
          type:"start",
          holdOn, currentChord, styleId, groovePresetId,
          meter, beatsPerBar, instrumentMode, outputMode, energy, part, rightHand, autoAssist,
          tempoCurrent, tempoTarget
        });
        tick();
      }
    }

    function stop(){
      running=false;
      holdOn=false;
      if (tickTimer) clearTimeout(tickTimer);
      tickTimer=null;

      pendingChord=pendingStyle=pendingEnergy=pendingMode=pendingOut=pendingPart=pendingRH=pendingGroove=null;
      pendingAutoAssist=null;
      fillPending=false; endPending=false; endingBarsLeft=0;

      onState({ type:"stop" });
    }

    function oneShot(chordSym){
      const ms=performance.now();
      if ((ms-lastOneShotMs) < oneShotMinMs) return;
      lastOneShotMs=ms;

      const start = now()+0.03;
      currentChord=normalizeChordSymbol(chordSym || currentChord);

      applyStyleMeter(getStyle(styleId));
      scheduleOneBar(start);
      onState({ type:"oneShot", chord: currentChord });
    }

    function setChord(chordSym){
      const c=normalizeChordSymbol(chordSym);
      if (!c) return;

      if (!holdOn || !running){
        oneShot(c);
      } else {
        pendingChord=c;
        recordChordChange();
        onState({ type:"chordPending", currentChord, pendingChord:c, mudGuardLevel });
      }
    }

    function setTempo(bpm){
      tempoTarget=clamp(Number(bpm)||tempoTarget, 40, 220);
      onState({ type:"tempoTarget", tempoTarget, tempoCurrent });
    }

    function setStyle(sid){
      if (!sid) return;
      if (!holdOn || !running){
        styleId=sid;
        applyStyleMeter(getStyle(styleId));
        onState({ type:"style", styleId, meter, beatsPerBar });
      } else {
        pendingStyle=sid;
        onState({ type:"stylePending", styleId, pendingStyleId:sid });
      }
    }

    function setGroovePreset(presetId){
      const id = (data.groovePresets && data.groovePresets[presetId]) ? presetId : "nhau";
      if (!holdOn || !running){
        groovePresetId=id;
        onState({ type:"groovePreset", groovePresetId });
      } else {
        pendingGroove=id;
        onState({ type:"groovePresetPending", groovePresetIdPending:id });
      }
    }

    function setEnergy(e){
      const v=(e==="low"||e==="normal"||e==="high")?e:"normal";
      if (!holdOn || !running){
        energy=v;
        onState({ type:"energy", energy });
      } else {
        pendingEnergy=v;
        onState({ type:"energyPending", pendingEnergy:v });
      }
    }

    function setPresetPart(p){
      const v=(p==="chorus")?"chorus":"verse";
      if (!holdOn || !running){
        part=v;
        if (autoAssist){
          energy = (part==="chorus") ? "high" : "low";
          if (rightHand==="auto") rightHand = (part==="chorus") ? "down" : "auto";
        }
        onState({ type:"part", part, energy, rightHand, autoAssist });
      } else {
        pendingPart=v;
        onState({ type:"partPending", pendingPart:v });
      }
    }

    function setRightHandVariant(v){
      const rh=(v==="down"||v==="up"||v==="auto")?v:"auto";
      if (!holdOn || !running){
        rightHand=rh;
        onState({ type:"rightHand", rightHand });
      } else {
        pendingRH=rh;
        onState({ type:"rightHandPending", pendingRightHand:rh });
      }
    }

    function setAutoAssist(on){
      const v=!!on;
      if (!holdOn || !running){
        autoAssist=v;
        onState({ type:"autoAssist", autoAssist });
      } else {
        pendingAutoAssist=v;
        onState({ type:"autoAssistPending", autoAssistPending:v });
      }
    }

    function setInstrumentMode(m){
      const v=(m==="guitar"||m==="piano"||m==="band")?m:"guitar";
      if (!holdOn || !running){
        instrumentMode=v;
        onState({ type:"instrument", instrumentMode });
      } else {
        pendingMode=v;
        onState({ type:"instrumentPending", pendingInstrumentMode:v });
      }
    }

    function setOutputMode(m){
      const v=(m==="phone"||m==="external")?m:"phone";
      if (!holdOn || !running){
        outputMode=v;
        onState({ type:"output", outputMode });
      } else {
        pendingOut=v;
        onState({ type:"outputPending", pendingOutputMode:v });
      }
    }

    function setHumanize(params){
      if (params && typeof params.loi==="number") loi=clamp(params.loi, 0, 1);
      if (params && typeof params.human==="number") human=clamp(params.human, 0, 1);
      onState({ type:"humanize", loi, human });
    }

    function triggerFill(intensity){
      if (!holdOn || !running) return;
      if (endingBarsLeft>0) return;
      fillPending=true;
      fillIntensity = (intensity==="hard") ? "hard" : "soft";
      onState({ type:"fillPending", fillIntensity });
    }

    function triggerEnd(type){
      if (!holdOn || !running) return;
      endingType = (type==="short") ? "short" : "long";
      endPending=true;
      onState({ type:"endingPending", endingType });
    }

    function getState(){
      return {
        version:"engine-2.0",
        running, holdOn,
        styleId, groovePresetId, meter, beatsPerBar,
        instrumentMode, outputMode,
        tempoCurrent, tempoTarget,
        energy, part, rightHand, autoAssist,
        currentChord, pendingChord,
        fillPending, fillIntensity,
        endPending, endingBarsLeft, endingType,
        mudGuardLevel
      };
    }

    return {
      startHold, stop, oneShot,
      setChord, setTempo, setStyle, setGroovePreset,
      setEnergy, setPresetPart,
      setRightHandVariant, setAutoAssist,
      setInstrumentMode, setOutputMode,
      setHumanize,
      triggerFill, triggerEnd,
      getState,
      normalizeChordSymbol, parseChordSymbol
    };
  }

  global.TayDemEngine = { create: createEngine, normalizeChordSymbol, parseChordSymbol };

})(typeof window !== "undefined" ? window : this);
