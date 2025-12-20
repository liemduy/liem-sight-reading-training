/* taydem.audio.js (v2.0 - Option A Only JS)
 * - Strong phone-friendly mix (3 buses: guitar/piano/perc)
 * - JS-only "articulation" layers:
 *   - bodyThump on downstroke accents
 *   - pickNoise on plucks
 *   - muteClick / "chát" on muteBrush
 * - Better ducking on chord changes / mudGuard events
 * - preload() + enable() for deterministic startup
 *
 * Exposes: window.TayDemAudio.create()
 */
(function (global) {
  "use strict";

  function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }

  function makeImpulseResponse(ctx, seconds=1.05, decay=3.2){
    const rate=ctx.sampleRate;
    const length=Math.max(1, Math.floor(rate*seconds));
    const ir=ctx.createBuffer(2,length,rate);
    for (let ch=0;ch<2;ch++){
      const data=ir.getChannelData(ch);
      for (let i=0;i<length;i++){
        const t=i/length;
        const env=Math.pow(1-t,decay);
        data[i]=(Math.random()*2-1)*env;
      }
    }
    return ir;
  }

  function makeSoftClipCurve(amount){
    const a=clamp(amount!=null?amount:0.92, 0.6, 0.98);
    const n=2048;
    const curve=new Float32Array(n);
    for (let i=0;i<n;i++){
      const x=(i*2)/(n-1)-1;
      curve[i]=Math.tanh(x/(1-a));
    }
    return curve;
  }

  const BASE="https://surikov.github.io/webaudiofontdata/sound/";
  const INSTRUMENTS = {
    nylon_lk:   { file:"0240_LK_Godin_Nylon_SF2_file.js",   varName:"_tone_0240_LK_Godin_Nylon_SF2_file" },
    steel_lk:   { file:"0250_LK_AcousticSteel_SF2_file.js", varName:"_tone_0250_LK_AcousticSteel_SF2_file" },
    steel_std:  { file:"0250_Acoustic_Guitar_sf2_file.js",  varName:"_tone_0250_Acoustic_Guitar_sf2_file" },
    piano_std:  { file:"0000_AcousticGrandPiano_sf2_file.js", varName:"_tone_0000_AcousticGrandPiano_sf2_file" },
    epiano:     { file:"0040_ElectricPiano1_sf2_file.js",     varName:"_tone_0040_ElectricPiano1_sf2_file" }
  };

  const GUITAR_OPEN_MIDI=[40,45,50,55,59,64]; // 6..1
  function midiForString(shape, stringNum){
    const idx=6-stringNum;
    const fret=shape[idx];
    if (fret==="x"||fret==="X"||fret==null) return null;
    return GUITAR_OPEN_MIDI[idx]+Number(fret);
  }

  function create(opts){
    const cfg=opts||{};
    const AudioContextFunc = global.AudioContext || global.webkitAudioContext;
    const player = new global.WebAudioFontPlayer();

    let ctx=null;

    // buses
    let busGuitar, busPiano, busPerc;
    // master chain
    let masterGain, compressor, hp, lp, convolver, wetGain, dryGain, outGain, clipper;

    let outputMode = cfg.outputMode || "phone";
    let guitarPresetKey = cfg.guitarPresetKey || "nylon_lk";
    let pianoPresetKey  = cfg.pianoPresetKey  || "piano_std";
    let guitarPreset=null, pianoPreset=null;

    const maxQueuedNotes = cfg.maxQueuedNotes!=null ? cfg.maxQueuedNotes : 260;
    let queuedCount=0, lastResetTime=0;

    let lastBarChord=null;

    function ensureContext(){
      if (ctx) return;
      if (!AudioContextFunc) throw new Error("WebAudio not supported");
      ctx=new AudioContextFunc();

      busGuitar=ctx.createGain(); busGuitar.gain.value=1.0;
      busPiano =ctx.createGain(); busPiano.gain.value =0.85;
      busPerc  =ctx.createGain(); busPerc.gain.value  =0.85;

      masterGain=ctx.createGain(); masterGain.gain.value=0.95;

      compressor=ctx.createDynamicsCompressor();
      compressor.threshold.value=-28;
      compressor.knee.value=18;
      compressor.ratio.value=2.2;
      compressor.attack.value=0.010;
      compressor.release.value=0.20;

      hp=ctx.createBiquadFilter();
      hp.type="highpass"; hp.frequency.value=120; hp.Q.value=0.7;

      lp=ctx.createBiquadFilter();
      lp.type="lowpass"; lp.frequency.value=8600; lp.Q.value=0.7;

      convolver=ctx.createConvolver();
      convolver.buffer=makeImpulseResponse(ctx);

      wetGain=ctx.createGain();
      dryGain=ctx.createGain();
      outGain=ctx.createGain();

      clipper=ctx.createWaveShaper();
      clipper.curve=makeSoftClipCurve(0.92);
      clipper.oversample="2x";

      busGuitar.connect(masterGain);
      busPiano.connect(masterGain);
      busPerc.connect(masterGain);

      masterGain.connect(compressor);
      compressor.connect(hp);
      hp.connect(lp);

      lp.connect(dryGain);
      lp.connect(convolver);
      convolver.connect(wetGain);

      dryGain.connect(outGain);
      wetGain.connect(outGain);

      outGain.connect(clipper);
      clipper.connect(ctx.destination);

      applyOutputMode(outputMode);
    }

    function applyOutputMode(mode){
      outputMode = (mode==="external") ? "external" : "phone";
      if (!ctx) return;
      const t=ctx.currentTime;

      if (outputMode==="phone"){
        hp.frequency.setValueAtTime(120, t);
        lp.frequency.setValueAtTime(8600, t);
        wetGain.gain.setValueAtTime(0.06, t);
        dryGain.gain.setValueAtTime(1.0, t);
        outGain.gain.setValueAtTime(0.95, t);
        masterGain.gain.setValueAtTime(0.95, t);

        busPerc.gain.setValueAtTime(0.80, t);
        busPiano.gain.setValueAtTime(0.80, t);
        busGuitar.gain.setValueAtTime(1.00, t);
      } else {
        hp.frequency.setValueAtTime(85, t);
        lp.frequency.setValueAtTime(9800, t);
        wetGain.gain.setValueAtTime(0.14, t);
        dryGain.gain.setValueAtTime(1.0, t);
        outGain.gain.setValueAtTime(0.98, t);
        masterGain.gain.setValueAtTime(0.95, t);

        busPerc.gain.setValueAtTime(0.88, t);
        busPiano.gain.setValueAtTime(0.88, t);
        busGuitar.gain.setValueAtTime(1.00, t);
      }
    }

    function loadPresetByKey(key){
      ensureContext();
      const instr=INSTRUMENTS[key];
      if (!instr) throw new Error("Unknown instrument key: "+key);

      if (global[instr.varName]) return Promise.resolve(global[instr.varName]);

      return new Promise((resolve,reject)=>{
        try{
          const url=BASE+instr.file;
          player.loader.startLoad(ctx, url, instr.varName);
          player.loader.waitLoad(()=>{
            try{
              player.loader.decodeAfterLoading(ctx, instr.varName);
              resolve(global[instr.varName]);
            }catch(e){ reject(e); }
          });
        }catch(e){ reject(e); }
      });
    }

    async function loadGuitarPreset(key){
      guitarPresetKey = key || guitarPresetKey;
      guitarPreset = await loadPresetByKey(guitarPresetKey);
      return guitarPreset;
    }
    async function loadPianoPreset(key){
      pianoPresetKey = key || pianoPresetKey;
      pianoPreset = await loadPresetByKey(pianoPresetKey);
      return pianoPreset;
    }

    async function preload(){
      ensureContext();
      await Promise.all([loadGuitarPreset(guitarPresetKey), loadPianoPreset(pianoPresetKey)]);
      return true;
    }

    async function enable(){
      ensureContext();
      if (ctx.state!=="running") await ctx.resume();
      await preload();
      return true;
    }

    function now(){ return ctx ? ctx.currentTime : 0; }

    function shouldThrottle(when){
      if (!ctx) return false;
      const t=when!=null?when:ctx.currentTime;
      if (t-lastResetTime>1.0){ lastResetTime=t; queuedCount=0; }
      queuedCount++;
      return queuedCount>maxQueuedNotes;
    }

    function duckQuick(strength){
      if (!ctx) return;
      const s=clamp(strength||1.0, 0.8, 1.5);
      const t=ctx.currentTime;
      const g=masterGain.gain;
      g.cancelScheduledValues(t);
      const cur=g.value;
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(cur*(0.90/s), t+0.020);
      g.linearRampToValueAtTime(outputMode==="phone"?0.95:0.95, t+0.070);
    }

    function queuePreset(preset, bus, when, midi, dur, vel){
      if (!ctx || !preset || midi==null) return;
      const t=Math.max(when, ctx.currentTime+0.001);
      const v=clamp(vel, 0.02, 1.0);
      const d=clamp(dur, 0.04, 6.0);

      if (shouldThrottle(t)){
        player.cancelQueue(ctx);
        queuedCount=0;
        lastResetTime=t;
      }
      player.queueWaveTable(ctx, bus, preset, t, midi, d, v);
    }

    // ------------------------------------------------------------
    // JS-only articulation layers
    // ------------------------------------------------------------
    function pickNoise(when, vel){
      if (!ctx) return;
      const dur=0.020;
      const buffer=ctx.createBuffer(1, Math.floor(ctx.sampleRate*dur), ctx.sampleRate);
      const data=buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i]=(Math.random()*2-1);

      const src=ctx.createBufferSource(); src.buffer=buffer;

      const bp=ctx.createBiquadFilter();
      bp.type="bandpass";
      bp.frequency.value=(outputMode==="phone")?3200:3800;
      bp.Q.value=1.0;

      const g=ctx.createGain();
      const v=clamp(vel,0.02,1.0) * ((outputMode==="phone")?0.10:0.12);

      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(v, when+0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, when+dur);

      src.connect(bp); bp.connect(g); g.connect(busGuitar);
      src.start(when); src.stop(when+dur+0.01);
    }

    function muteClick(when, vel){
      if (!ctx) return;
      const dur=0.040;
      const buffer=ctx.createBuffer(1, Math.floor(ctx.sampleRate*dur), ctx.sampleRate);
      const data=buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i]=(Math.random()*2-1);

      const src=ctx.createBufferSource(); src.buffer=buffer;

      const hp2=ctx.createBiquadFilter();
      hp2.type="highpass";
      hp2.frequency.value=1400;
      hp2.Q.value=0.8;

      const g=ctx.createGain();
      const v=clamp(vel,0.02,1.0) * ((outputMode==="phone")?0.12:0.15);

      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(v, when+0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when+dur);

      src.connect(hp2); hp2.connect(g); g.connect(busGuitar);
      src.start(when); src.stop(when+dur+0.01);
    }

    function bodyThump(when, vel){
      if (!ctx) return;
      const o=ctx.createOscillator();
      const g=ctx.createGain();

      const v=clamp(vel,0.02,1.0) * ((outputMode==="phone")?0.10:0.13);

      o.type="sine";
      o.frequency.setValueAtTime(110, when);
      o.frequency.exponentialRampToValueAtTime(62, when+0.06);

      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(v, when+0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when+0.10);

      o.connect(g); g.connect(busGuitar);
      o.start(when); o.stop(when+0.12);
    }

    // ------------------------------------------------------------
    // Perc synth
    // ------------------------------------------------------------
    function percShaker(when, vel){
      if (!ctx) return;
      const dur=0.030;
      const buffer=ctx.createBuffer(1, Math.floor(ctx.sampleRate*dur), ctx.sampleRate);
      const data=buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i]=(Math.random()*2-1);

      const src=ctx.createBufferSource(); src.buffer=buffer;

      const bp=ctx.createBiquadFilter();
      bp.type="bandpass";
      bp.frequency.value=(outputMode==="phone")?5400:6200;
      bp.Q.value=0.9;

      const g=ctx.createGain();
      const v=clamp(vel,0.02,1.0) * ((outputMode==="phone")?0.22:0.28);

      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(v, when+0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when+dur);

      src.connect(bp); bp.connect(g); g.connect(busPerc);
      src.start(when); src.stop(when+dur+0.01);
    }

    function percSnare(when, vel){
      if (!ctx) return;
      const dur=0.080;
      const buffer=ctx.createBuffer(1, Math.floor(ctx.sampleRate*dur), ctx.sampleRate);
      const data=buffer.getChannelData(0);
      for (let i=0;i<data.length;i++) data[i]=(Math.random()*2-1);

      const src=ctx.createBufferSource(); src.buffer=buffer;

      const hp2=ctx.createBiquadFilter();
      hp2.type="highpass";
      hp2.frequency.value=1200;
      hp2.Q.value=0.7;

      const g=ctx.createGain();
      const v=clamp(vel,0.02,1.0) * ((outputMode==="phone")?0.25:0.32);

      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(v, when+0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when+dur);

      src.connect(hp2); hp2.connect(g); g.connect(busPerc);
      src.start(when); src.stop(when+dur+0.01);
    }

    function percKick(when, vel){
      if (!ctx) return;
      const o=ctx.createOscillator();
      const g=ctx.createGain();
      const v=clamp(vel,0.02,1.0) * ((outputMode==="phone")?0.35:0.45);

      o.type="sine";
      o.frequency.setValueAtTime(140, when);
      o.frequency.exponentialRampToValueAtTime(52, when+0.08);

      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(v, when+0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, when+0.12);

      o.connect(g); g.connect(busPerc);
      o.start(when); o.stop(when+0.14);
    }

    // ------------------------------------------------------------
    // Guitar actions
    // ------------------------------------------------------------
    function guitarPickString(evt){
      if (!guitarPreset || !ctx) return;
      const shape=evt.data && evt.data.shape;
      const sNum=evt.data && evt.data.string;
      if (!shape || !sNum) return;
      const midi=midiForString(shape, sNum);
      if (midi==null) return;

      // articulation: pick noise (subtle)
      pickNoise(evt.t, evt.vel);

      queuePreset(guitarPreset, busGuitar, evt.t, midi, evt.dur, evt.vel);
    }

    function guitarPickMidi(evt){
      if (!guitarPreset || !ctx) return;
      const midi=evt.data && evt.data.midi;
      if (midi==null) return;

      pickNoise(evt.t, evt.vel);
      queuePreset(guitarPreset, busGuitar, evt.t, midi, evt.dur, evt.vel);
    }

    function guitarBrush(evt, muted){
      if (!guitarPreset || !ctx) return;
      const shape=evt.data && evt.data.shape;
      if (!shape) return;

      const strings=(evt.data && evt.data.strings) ? evt.data.strings : [5,4,3,2,1];
      const dir=(evt.data && evt.data.dir) ? evt.data.dir : "down";
      const spreadMs=(evt.data && evt.data.spreadMs!=null) ? evt.data.spreadMs : 18;

      const order=(dir==="up") ? strings.slice().reverse() : strings.slice();
      const spread=clamp(spreadMs,8,60)/1000;

      const hint = evt.data && evt.data.hint;
      const accent = hint && hint.accent;
      const mud = hint && hint.mudGuardLevel || 0;

      // articulation: body thump on strong downstroke accent
      if (dir==="down" && accent && !muted) bodyThump(evt.t, evt.vel);
      if (muted) muteClick(evt.t + spread*0.5, clamp(evt.vel*0.75, 0.05, 0.5));

      // if mud guard high: shorten further
      const mudMul = (mud===2) ? 0.75 : (mud===1 ? 0.85 : 1.0);

      for (let i=0;i<order.length;i++){
        const s=order[i];
        const midi=midiForString(shape,s);
        if (midi==null) continue;

        const v=clamp(evt.vel*(1-0.08*i), 0.03, 1.0);
        const d=muted ? clamp(evt.dur*0.35, 0.05, 0.28) : clamp(evt.dur*mudMul, 0.06, 1.6);
        queuePreset(guitarPreset, busGuitar, evt.t + i*spread, midi, d, v);
      }

      if (muted) percShaker(evt.t + spread*0.6, clamp(evt.vel*0.35, 0.05, 0.25));
    }

    // ------------------------------------------------------------
    // Piano actions
    // ------------------------------------------------------------
    function pianoBass(evt){
      if (!pianoPreset || !ctx) return;
      const midi=evt.data && evt.data.midi;
      if (midi==null) return;
      queuePreset(pianoPreset, busPiano, evt.t, midi, evt.dur, evt.vel);
    }

    function pianoChordHit(evt){
      if (!pianoPreset || !ctx) return;
      const midis=evt.data && evt.data.midis;
      if (!midis || !midis.length) return;

      const staccato=!!(evt.data && evt.data.staccato);
      const hint = evt.data && evt.data.hint;
      const mud = hint && hint.mudGuardLevel || 0;

      const mudMul = (mud===2) ? 0.75 : (mud===1 ? 0.85 : 1.0);
      const d=staccato ? clamp(evt.dur*0.35, 0.05, 0.32) : clamp(evt.dur*mudMul, 0.08, 1.8);
      const spread = (outputMode==="phone") ? 0.0035 : 0.0055;

      for (let i=0;i<midis.length;i++){
        const m=midis[i];
        const v=clamp(evt.vel*(1-0.04*i), 0.03, 1.0);
        queuePreset(pianoPreset, busPiano, evt.t + i*spread, m, d, v);
      }
    }

    function schedule(evt){
      if (!evt) return;
      ensureContext();

      // meta
      if (evt.kind==="meta"){
        if (evt.action==="bar" && evt.data){
          if (evt.data.outputMode && evt.data.outputMode!==outputMode) applyOutputMode(evt.data.outputMode);

          // chord change duck
          if (evt.chord && lastBarChord && evt.chord!==lastBarChord) duckQuick(1.0);
          lastBarChord = evt.chord || lastBarChord;

          // mud guard duck stronger
          if (evt.data.mudGuardLevel===2) duckQuick(1.25);
          else if (evt.data.mudGuardLevel===1) duckQuick(1.10);

          // band phone safety: lower piano a bit
          if (evt.data.instrumentMode==="band" && outputMode==="phone"){
            busPiano.gain.setValueAtTime(0.74, ctx.currentTime);
          } else if (outputMode==="phone"){
            busPiano.gain.setValueAtTime(0.80, ctx.currentTime);
          }
        }
        else if (evt.action==="stopAt"){
          const when=evt.t || (ctx.currentTime+0.02);
          const t=Math.max(when, ctx.currentTime+0.01);
          outGain.gain.cancelScheduledValues(t);
          outGain.gain.setValueAtTime(outGain.gain.value, t);
          outGain.gain.linearRampToValueAtTime(0.0001, t+0.05);
          setTimeout(()=>{ try{ player.cancelQueue(ctx);}catch(_){ } }, 120);
        }
        return;
      }

      if (!ctx || ctx.state!=="running") return;

      // lazy load
      if (!guitarPreset) loadGuitarPreset(guitarPresetKey).catch(()=>{});
      if (!pianoPreset)  loadPianoPreset(pianoPresetKey).catch(()=>{});

      if (evt.kind==="guitar"){
        if (evt.action==="pickString") guitarPickString(evt);
        else if (evt.action==="pickMidi") guitarPickMidi(evt);
        else if (evt.action==="brush") guitarBrush(evt,false);
        else if (evt.action==="muteBrush") guitarBrush(evt,true);
      } else if (evt.kind==="piano"){
        if (evt.action==="bass") pianoBass(evt);
        else if (evt.action==="chordHit") pianoChordHit(evt);
      } else if (evt.kind==="perc"){
        if (evt.action==="shaker") percShaker(evt.t, evt.vel);
        else if (evt.action==="kick") percKick(evt.t, evt.vel);
        else if (evt.action==="snare") percSnare(evt.t, evt.vel);
      }
    }

    function stop(){
      if (!ctx) return;
      player.cancelQueue(ctx);
      const t=ctx.currentTime;
      outGain.gain.cancelScheduledValues(t);
      outGain.gain.setValueAtTime(outGain.gain.value, t);
      outGain.gain.linearRampToValueAtTime(0.0001, t+0.03);
      outGain.gain.linearRampToValueAtTime(outputMode==="phone"?0.95:0.98, t+0.07);
    }

    return {
      enable,
      preload,
      now,
      schedule,
      stop,
      setOutputMode: applyOutputMode,
      loadGuitarPreset,
      loadPianoPreset,
      setPresets: async ({ guitarKey, pianoKey }={})=>{
        if (guitarKey) await loadGuitarPreset(guitarKey);
        if (pianoKey)  await loadPianoPreset(pianoKey);
        return true;
      },
      getState: ()=>({
        version:"audio-2.0",
        outputMode,
        guitarPresetKey,
        pianoPresetKey,
        hasContext:!!ctx,
        ctxState: ctx ? ctx.state : "none"
      })
    };
  }

  global.TayDemAudio = { create };

})(typeof window !== "undefined" ? window : this);
