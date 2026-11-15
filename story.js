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
    if(motion.matches || signals.some(signal => signal.aborted)) return Promise.resolve();
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
  function playBeats(root, line, beats, { speaker, onBeat, finish, finishOnReveal = false, speaking, sound }) {
    const advance = root.querySelector('.story-advance');
    const skip = root.querySelector('.story-skip');
    const visual = document.createElement('span');
    const caret = document.createElement('span');
    const announcement = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    caret.className = 'story-caret';
    caret.setAttribute('aria-hidden', 'true');
    announcement.className = 'story-sr';
    announcement.setAttribute('role', 'status');
    line.replaceChildren(visual, caret, announcement);

    let index = 0, timer, animation, text, glyphs, start, typing, stopped = false;
    let shown = 0, lastPulse = 0, gap = 0;
    speaking?.(true);
    function quiet() {
      line.classList.remove('typing');
      sound?.stop();
    }
    function stop() {
      if(stopped) return false;
      stopped = true;
      clearTimeout(timer);
      quiet();
      animation?.cancel();
      advance.hidden = true;
      skip.hidden = true;
      advance.onclick = skip.onclick = null;
      speaking?.(false);
      return true;
    }
    function done() {
      if(stop()) finish();
    }
    function reveal() {
      clearTimeout(timer);
      typing = false;
      quiet();
      visual.textContent = text;
      animation?.cancel();
      advance.textContent = 'Continue';
      skip.textContent = 'Skip to next';
      if (finishOnReveal && index === beats.length - 1) done();
    }
    function type() {
      const elapsed = performance.now() - start;
      // Allow a short silence at manual line breaks.
      const delay = Math.min(17, 1700 / glyphs.length);
      let count = 0, time = 0;
      while (count < glyphs.length && time <= elapsed) {
        time += glyphs[count] === '\n' ? 210 : delay;
        count++;
      }
      if (count > shown) {
        // Spaced, slightly irregular pulses rather than one click per character.
        const now = performance.now();
        if (sound && /\S/.test(glyphs[count - 1]) && now - lastPulse >= gap) {
          lastPulse = now;
          gap = 62 + Math.random() * 48;
          sound.pulse();
        }
        shown = count;
      }
      if (count >= glyphs.length) reveal();
      else {
        visual.textContent = glyphs.slice(0, count).join('');
        timer = setTimeout(type, 25);
      }
    }
    function show() {
      const beat = beats[index];
      text = typeof beat === 'string' ? beat : beat.text;
      if (speaker && typeof beat !== 'string') speaker.textContent = beat.speaker;
      announcement.textContent = speaker?.textContent ? speaker.textContent + '. ' + text : text;
      onBeat?.(index);
      if (motion.matches) {
        reveal();
        return;
      }
      animation?.cancel();
      animation = visual.animate([{opacity:.35},{opacity:1}], {duration:240});
      glyphs = Array.from(text);
      typing = true;
      shown = 0;
      lastPulse = gap = 0;
      sound?.stop();
      line.classList.add('typing');
      start = performance.now();
      advance.textContent = 'Reveal text';
      skip.textContent = 'Skip typing';
      type();
    }
    advance.hidden = false;
    skip.hidden = false;
    const step = () => {
      if(stopped) return;
      if (typing) reveal();
      else if (index === beats.length - 1) done();
      else {
        index++;
        show();
      }
    };
    advance.onclick = skip.onclick = step;
    show();
    return { stop, step };
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
    const pace = ms => pause(ms, ...signals);
    let player, resolve;
    active = { cancel, skip };
    const finishDialogue = () => { player?.stop(); resolve?.(); };
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
      await new Promise(finish => {
        resolve = finish;
        player = playBeats(dialog, line, segment, { speaker, finish, speaking:options.speaking, sound:options.voice,
          finishOnReveal:!!options.hold });
        advance.focus();
      });
      player.stop();
      // Optionally let the final words rest on screen before the overlay fades.
      if(options.hold) await pace(options.hold);
      player = resolve = null;
      content.classList.remove('visible');
      skipScene.focus();
      await pace(280);
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
  return { SCRIPT, playBeats, cinematic, skipCinema, cancelCinema: reason => active?.cancel.abort(reason) };
})();
