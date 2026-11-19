/* Original procedural score. Frequencies are derived from MIDI notes. */
const AstravumScore = (() => {
  const cues = {
    ambient: { chords: [[36, 48, 55], [36, 48, 57]], period: 9, cutoff: 280, volume: .22 },
    eagle: { chords: [[38, 50, 57, 66, 69], [35, 50, 57, 62, 66], [31, 50, 55, 59, 66], [33, 52, 57, 62, 71]],
      period: 6.3, cutoff: 970, volume: .38 },
    opp: { chords: [[45, 57, 60, 64, 71], [41, 57, 60, 64, 67], [48, 55, 60, 64, 74], [43, 55, 62, 64, 69]],
      period: 4.8, cutoff: 1300, volume: .32, pulse: .6 },
    storm: { chords: [[41, 48, 57, 60], [45, 52, 55, 59]], period: 7.2, cutoff: 380, volume: .27 },
    voy: { chords: [[40, 52, 59, 66, 71], [40, 54, 57, 64, 73], [35, 54, 62, 66, 76], [40, 55, 62, 69, 71]],
      period: 7.5, cutoff: 1550, volume: .34, pulse: 1.5, beats: 3, beatLen: .38, beatRelease: 1.5, distant: true },
    /* Cockpit and docking: a low unresolved drone with sparse, far-off pings. */
    signal: { chords: [[33, 45, 52, 58], [34, 46, 52, 57]], period: 8.5, cutoff: 560, volume: .24,
      pulse: 3.4, beats: 2, beatLen: .2, beatRelease: 2.2, distant: true },
    /* The dark hangar: hollow, quiet fifths and one lonely distant tone. */
    hangar: { chords: [[29, 41, 48], [31, 41, 46]], period: 11, cutoff: 430, volume: .17,
      pulse: 5.5, beats: 1, beatLen: .6, beatRelease: 3, distant: true },
    hum: { chords: [[32, 44, 51]], period: 6, cutoff: 210, volume: .16 },
    /* The return home: quiet, open D and G voicings. */
    home: { chords: [[38, 50, 57, 62, 69], [43, 50, 55, 62, 66]], period: 9.5, cutoff: 760, volume: .2 },
    restored: { chords: [[38, 50, 57, 62, 66, 76], [31, 55, 59, 62, 69, 74]],
      period: 8, cutoff: 1120, volume: .24 }
  };
  const hz = note => 440 * 2 ** ((note - 69) / 12);

  function create(ctx, output, reportError = ()=>{}) {
    const bus = ctx.createGain();
    bus.connect(output);
    let current, ducked = false;
    const voices = new Set();

    function ramp(param, value, duration) {
      const now = ctx.currentTime;
      if(param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
      else {
        const currentValue = param.value;
        param.cancelScheduledValues(now);
        param.setValueAtTime(currentValue, now);
      }
      param.linearRampToValueAtTime(value, now + duration);
    }
    function makeTrack(name, cutoff, pan = false) {
      const gain = ctx.createGain(), filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      filter.Q.value = .4;
      gain.gain.value = 0;
      filter.connect(gain).connect(bus);
      const stereo = pan && ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if(stereo){
        stereo.pan.value = .52;
        stereo.connect(filter);
      }
      const track = {name, gain, filter, stereo, notes:new Set()};
      voices.add(track);
      return track;
    }
    function note(track, midi, start, sustain, level, { attack = 1.5, release = 1.6, wave = 'sine', detune = 0, distant = false } = {}) {
      const osc = ctx.createOscillator(), envelope = ctx.createGain(), end = start + sustain + release;
      osc.type = wave;
      osc.frequency.value = hz(midi);
      osc.detune.value = detune;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(level, start + attack);
      envelope.gain.setValueAtTime(level, start + sustain);
      envelope.gain.linearRampToValueAtTime(0, end);
      osc.connect(envelope).connect(distant && track.stereo ? track.stereo : track.filter);
      track.notes.add(osc);
      osc.onended = () => { track.notes.delete(osc); osc.disconnect(); envelope.disconnect(); };
      osc.start(start);
      osc.stop(end + .02);
    }
    function retire(track, duration) {
      clearInterval(track.clock);
      ramp(track.gain.gain, 0, duration);
      const silenceAt = ctx.currentTime + duration;
      const release = () => {
        if(ctx.state === 'running' && ctx.currentTime < silenceAt) {
          setTimeout(release, 120);
          return;
        }
        for(const osc of track.notes) osc.stop();
        track.stereo?.disconnect();
        track.filter.disconnect();
        track.gain.disconnect();
        voices.delete(track);
      };
      setTimeout(release, duration * 1000 + 40);
    }
    function clearOldTails() {
      for(const track of voices) {
        if(track !== current) ramp(track.gain.gain, 0, .12);
      }
    }
    function set(name, duration = 1.25) {
      if(current?.name === name) return;
      clearOldTails();
      if(current) retire(current, duration);
      current = null;
      const cue = cues[name];
      if(!cue) return;
      const track = current = makeTrack(name, cue.cutoff, !!cue.distant);
      const chord = (index, start) => {
        const notes = cue.chords[index % cue.chords.length];
        notes.forEach((midi, i) => {
          note(track, midi, start, cue.period + .5, i < 2 ? .083 : .038, {wave:i < 2 ? 'sine' : 'triangle', detune:i % 2 ? 3 : -3});
        });
        if(cue.pulse) {
          const count = cue.beats ?? 8;
          for(let beat = 0; beat < count; beat++){
            const time = start + beat * cue.pulse;
            const midi = notes[(beat + 1) % notes.length] + 12;
            note(track, midi, time, cue.beatLen ?? .16, .026,
              {attack:.07, release:cue.beatRelease ?? .55, distant:!!cue.distant});
          }
        }
      };
      let index = 1, next = ctx.currentTime + cue.period;
      chord(0, ctx.currentTime + .02);
      track.clock = setInterval(() => {
        if(ctx.state!=='running') return;
        const now = ctx.currentTime;
        if(now > next) next = now + .03;
        if(next - now > .23) return;
        try{chord(index++, next)}catch(error){reportError('soundtrack scheduler',error)}
        next += cue.period;
      }, 140);
      ramp(track.gain.gain, cue.volume, duration);
    }
    function swell(seconds) {
      clearOldTails();
      if(current) retire(current, .65);
      const track = current = makeTrack('awakening', 1850, true);
      const start = ctx.currentTime + .025;
      const crest = start + seconds;
      track.gain.gain.setValueAtTime(.04, start);
      track.gain.gain.linearRampToValueAtTime(.68, crest);
      [26, 38, 50, 57, 62, 66, 69].forEach((midi, i) => {
        note(track, midi, start + seconds * i / 13, seconds + 1.2, i < 3 ? .1 : .048,
          {attack:Math.min(2.3, seconds * .62), release:3.4, wave:i < 2 ? 'sine' : 'triangle', detune:i % 2 ? -5 : 4});
      });
      [62, 69, 74, 78, 81].forEach((midi, i) => {
        note(track, midi, crest + i * .095, 2.7, .048, {attack:.32, release:3.1, distant:i % 2 === 0});
      });
    }
    function duck(value) {
      ducked = value;
      ramp(bus.gain, value ? .48 : 1, value ? .25 : .85);
    }
    function diagnosticMeter(analyser){
      bus.connect(analyser);
      return ()=>bus.disconnect(analyser);
    }
    return { set, swell, duck, diagnosticMeter,
      get diagnostics(){return {cue:current?.name||null,busGain:bus.gain.value,
        trackGain:current?.gain.gain.value??null,activeNotes:current?.notes.size??0,tracks:voices.size}},
      get cue(){return current?.name || null}, get ducked(){return ducked} };
  }
  return { create };
})();
