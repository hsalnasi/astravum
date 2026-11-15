/* Approved story text, in scene order. Each entry is one readable beat. */
const AstravumStory = (() => {
  const SCRIPT = {
    signal: [
      '“Across the silence of space, a forgotten voice has found you.”',
      '“Somewhere in the darkness, a story is waiting to be heard.”'
    ],
    station: [
      '“If you can hear this...”\n“Please...”',
      '“Don’t let our stories disappear.”'
    ],
    hangar: [
      'Once, this place was filled with stories.\nStories of courage. Of discovery. Of journeys beyond imagination.',
      'But time passed.\nThe lights faded.\nAnd one by one, the voices fell silent.',
      'Yet something remains...\nSomewhere in this darkness, a memory is waiting.',
      'Move your light through the darkness. Find what was forgotten.'
    ],
    discovery: {
      eagle: [
        '“Someone... came?”\n“I had almost forgotten what it felt like to be seen.”',
        '“My name is Eagle.”\n“I carried two explorers to a world no human had ever walked upon.”',
        '“...And when they left...”\n“I stayed.”'
      ],
      opp: [
        '“Oh!”\n“A visitor?”\n“Well, this is unexpected.”',
        '“My name is Opportunity.”\n“I was sent to explore a world of red dust and distant horizons.”',
        '“They gave me ninety days.”\n“I gave them fourteen years.”',
        '“Would you like to see where my wheels took me?”'
      ],
      voy: [
        '“How strange...”\n“To be remembered from so far away.”',
        '“My name is Voyager.”\n“I was sent to visit distant worlds.”',
        '“...But I kept traveling...”\n“Past the planets.”\n“Beyond the Sun’s protective embrace.”',
        '“And into the space between stars.”\n“Even now, my journey continues.”',
        '“Would you like to hear what I found along the way?”'
      ]
    },
    awakening: [
      '“If you can hear this...”',
      'Can you hear us?',
      'You found us.\nYou remembered.'
    ],
    map: [
      'You came searching for a signal.',
      'You found the echoes of humanity.\nYou gave this place its light again...'
    ],
    farewell: [
      'Not every explorer finds their way home.',
      'But every story deserves to find its way back.',
      'Abandoned, but not forgotten.'
    ]
  };

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function pause(ms, ...signals) {
    if(!ms || signals.some(signal => signal.aborted)) return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(timer);
        signals.forEach(signal => signal.removeEventListener('abort', finish));
        resolve();
      };
      const timer = setTimeout(finish, ms);
      signals.forEach(signal => signal.addEventListener('abort', finish, {once:true}));
    });
  }

  /* `sound` is an optional { pulse(), stop() } voice. Pulses are driven by the
     reveal loop itself, so no sound can outlive the typing that produced it. */
  function typeBeat(line, text, speaker, { speaking, sound }, finish) {
    const visual = document.createElement('span');
    const caret = document.createElement('span');
    const announcement = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    caret.className = 'story-caret';
    caret.setAttribute('aria-hidden', 'true');
    announcement.className = 'story-sr';
    announcement.setAttribute('role', 'status');
    line.replaceChildren(visual, caret, announcement);
    announcement.textContent = speaker?.textContent ? speaker.textContent + '. ' + text : text;

    let timer, animation, stopped = false;
    function stop() {
      if(stopped) return;
      stopped = true;
      clearTimeout(timer);
      animation?.cancel();
      line.classList.remove('typing');
      sound?.stop();
      speaking?.(false);
      finish();
    }
    function reveal() {
      if(stopped) return;
      visual.textContent = text;
      stop();
    }

    speaking?.(true);
    if(motion.matches) reveal();
    else {
      const glyphs = Array.from(text);
      const delay = Math.min(17, 1700 / glyphs.length);
      const start = performance.now();
      let shown = 0, lastPulse = 0, gap = 0;
      animation = visual.animate([{opacity:.35},{opacity:1}], {duration:240});
      line.classList.add('typing');
      function type() {
        const now = performance.now(), elapsed = now - start;
        let count = 0, time = 0;
        while(count < glyphs.length && time <= elapsed) {
          time += glyphs[count] === '\n' ? 210 : delay;
          count++;
        }
        // Spaced, slightly irregular pulses rather than one click per character.
        if(count > shown && sound && /\S/.test(glyphs[count - 1]) && now - lastPulse >= gap) {
          lastPulse = now;
          gap = 62 + Math.random() * 48;
          sound.pulse();
        }
        shown = count;
        if(count >= glyphs.length) reveal();
        else {
          visual.textContent = glyphs.slice(0, count).join('');
          timer = setTimeout(type, 25);
        }
      }
      type();
    }
    return { stop, reveal };
  }

  function playAutomatically(line, beats, { speaker, speaking, sound, finish, skip, fadeTarget = line }) {
    const controller = new AbortController();
    const { signal } = controller;
    let player, fade, complete = false;
    function hideSkip() {
      if(!skip) return;
      skip.hidden = true;
      skip.onclick = null;
    }
    function stop() {
      controller.abort();
      player?.stop();
      fade?.cancel();
      hideSkip();
    }
    function done() {
      if(complete) return;
      complete = true;
      hideSkip();
      finish?.();
    }
    function step() {
      if(complete || signal.aborted) return;
      player?.reveal();
      stop();
      done();
    }
    function fadeTo(from, to) {
      fade?.cancel();
      if(!motion.matches){
        fade = fadeTarget.animate([{opacity:from},{opacity:to}], {duration:900,easing:'ease-in-out',fill:'both'});
      }
    }
    if(skip){
      skip.hidden = false;
      skip.onclick = step;
    }
    const finished = (async () => {
      for(const [i, beat] of beats.entries()){
        if(signal.aborted) return;
        const text = typeof beat === 'string' ? beat : beat.text;
        if(speaker && typeof beat !== 'string') speaker.textContent = beat.speaker;
        fadeTo(0,1);
        await new Promise(resolve => { player = typeBeat(line, text, speaker, {speaking,sound}, resolve); });
        // Reduced motion removes the transitions while retaining reading time.
        await pause(Math.min(6500,Math.max(2200,1600+text.length*22)),signal);
        if(signal.aborted) return;
        if(skip && i === beats.length-1) break; // Keep the last line beside the manual action.
        fadeTo(1,0);
        await pause(motion.matches?0:1050,signal);
      }
      if(!signal.aborted) done();
    })();
    return { stop, step, finished };
  }

  let active;
  async function cinematic(beats, options = {}) {
    const dialog = document.querySelector('#cinema');
    const content = dialog.querySelector('.cinema-content');
    const speaker = dialog.querySelector('.cinema-speaker');
    const advance = dialog.querySelector('.story-advance');
    const skipScene = dialog.querySelector('.scene-skip');
    const line = dialog.querySelector('.cinema-line');
    const cancel = new AbortController(), skip = new AbortController();
    const signals = [cancel.signal, skip.signal];
    const shouldSkip = () => signals.some(signal => signal.aborted);
    const pace = ms => pause(motion.matches?0:ms, ...signals);
    let player;
    active = { cancel, skip };
    const finishDialogue = () => {
      content.classList.remove('visible');
      player?.stop();
    };
    signals.forEach(signal => signal.addEventListener('abort', finishDialogue, {once:true}));
    const jump = () => skip.abort();
    skipScene.onclick = jump;
    dialog.oncancel = event => { event.preventDefault(); jump(); };
    dialog.className = options.dark ? 'dark' : options.veil || '';
    dialog.classList.toggle('interference', !!options.interference);
    speaker.textContent = options.speaker || '';
    line.replaceChildren();
    advance.hidden = dialog.querySelector('.story-skip').hidden = true;
    content.classList.remove('visible');
    dialog.showModal();
    skipScene.focus();
    void dialog.offsetWidth;
    dialog.classList.add('visible');

    async function present(segment) {
      if(!segment.length || shouldSkip()) return;
      content.classList.add('visible');
      player = playAutomatically(line, segment, { speaker, speaking:options.speaking, sound:options.voice, fadeTarget:content });
      await player.finished;
      content.classList.remove('visible');
      await pace(280);
      player.stop();
      player = null;
    }

    try {
      options.sound?.();
      await pace(420);
      cancel.signal.throwIfAborted();
      await options.between?.(pace, shouldSkip);
      cancel.signal.throwIfAborted();
      const split = options.interlude?.at ?? beats.length;
      await present(beats.slice(0,split));
      cancel.signal.throwIfAborted();
      if(options.interlude && !shouldSkip()){
        await options.interlude.run(pace, shouldSkip);
        cancel.signal.throwIfAborted();
        await present(beats.slice(split));
      }
      cancel.signal.throwIfAborted();
      await options.after?.(pace, shouldSkip);
      cancel.signal.throwIfAborted();
      dialog.classList.remove('visible');
      await pace(420);
      cancel.signal.throwIfAborted();
      return skip.signal.aborted;
    } finally {
      player?.stop();
      options.voice?.stop();
      active = null;
      dialog.oncancel = skipScene.onclick = null;
      dialog.close();
    }
  }

  function skipCinema(){
    if(!active) return false;
    active.skip.abort();
    return true;
  }
  return { SCRIPT, playAutomatically, cinematic, skipCinema, cancelCinema: reason => active?.cancel.abort(reason) };
})();
