/* Temporary, opt-in diagnostic. Open the site with ?audioDebug=1. */
(() => {
  'use strict';
  const audio=window.__astra.audio;
  const modal=document.querySelector('#modal');
  const section=document.createElement('section');
  section.innerHTML=`
    <h2>TEMPORARY AUDIO DIAGNOSTIC</h2>
    <p>Tests use the existing AudioContext. The direct tone bypasses application mute and master gain. Device volume and output routing still apply. Signal measurements cannot prove that your speaker is audible.</p>
    <div class="story-actions">
      <button class="btn" data-test="direct">Test direct output</button>
      <button class="btn" data-test="master">Test master path</button>
      <button class="btn" data-test="measure">Measure soundtrack</button>
      <button class="btn" data-test="refresh">Refresh status</button>
    </div>
    <p>Optional Safari comparison: playback mode can pause audio from other apps. It lasts for this page session.</p>
    <button class="btn" data-test="session">Compare playback session</button>
    <p role="status" id="audio-test-result">No test performed.</p>
    <div class="story-actions">
      <button class="btn" data-heard="yes">I heard the tone</button>
      <button class="btn" data-heard="no">Tone was silent</button>
    </div>
    <div id="audio-test-status"></div>
    <p>Copy these results when reporting the phone, OS version, browser, silent-mode setting, and whether you heard the tone.</p>
    <textarea aria-label="Audio diagnostic report" rows="10" cols="30" readonly></textarea>
    <hr>
  `;
  modal.querySelector('.box').insertBefore(section,modal.querySelector('.box h2'));
  modal.classList.add('on');
  const result=section.querySelector('#audio-test-result');
  const status=section.querySelector('#audio-test-status');
  const report=section.querySelector('textarea');
  const localErrors=[];
  let busy=false,lastTest=null,lastMeasurement=null,heard=null;
  function error(stage,value){localErrors.push({stage,message:value?.message||String(value)});}
  function refresh(){
    const snapshot=audio.diagnosticSnapshot();
    status.replaceChildren();
    for(const [key,value] of Object.entries({
      'AudioContext':snapshot.context,'Application mute':snapshot.muted,
      'Master gain':snapshot.masterGain,'Soundtrack':snapshot.score?.cue||'none',
      'Score bus gain':snapshot.score?.busGain,'Track gain':snapshot.score?.trackGain,
      'Active score notes':snapshot.score?.activeNotes,'Audio session':snapshot.session?.type||'unsupported'
    })){
      const p=document.createElement('p');p.textContent=key+' — '+String(value??'unavailable');status.appendChild(p);
    }
    report.value=JSON.stringify({diagnosticVersion:'audio-output-1',userAgent:navigator.userAgent,url:location.href,snapshot,
      lastTest,heard,lastMeasurement,diagnosticErrors:localErrors},null,2);
  }
  function meter(ctx){
    const analyser=ctx.createAnalyser(),silence=ctx.createGain();
    silence.gain.value=0;
    analyser.fftSize=2048;
    analyser.connect(silence).connect(ctx.destination);
    return {analyser,dispose(){analyser.disconnect();silence.disconnect()}};
  }
  async function test(mode){
    if(busy)return;
    busy=true;heard=null;lastTest=mode;
    result.textContent='Testing '+mode+'…';
    let oscillator,envelope,direct,master,score,detachScore;
    try{
      // init() and the test source start both happen in this tap's call stack.
      audio.init();
      const graph=audio.diagnosticOutput(),ctx=graph.context;
      if(!ctx)throw Error('Audio initialization failed. See initialization errors.');
      direct=meter(ctx);master=meter(ctx);score=meter(ctx);
      graph.master.connect(master.analyser);
      detachScore=graph.score.diagnosticMeter(score.analyser);
      if(mode!=='measure'){
        oscillator=ctx.createOscillator();envelope=ctx.createGain();
        oscillator.frequency.value=660;
        const t=ctx.currentTime;
        envelope.gain.setValueAtTime(0,t);
        envelope.gain.linearRampToValueAtTime(.08,t+.03);
        envelope.gain.setValueAtTime(.08,t+.65);
        envelope.gain.linearRampToValueAtTime(0,t+.8);
        oscillator.connect(envelope);
        if(mode==='direct'){
          envelope.connect(ctx.destination);
          envelope.connect(direct.analyser);
        }else envelope.connect(graph.master);
        oscillator.start(t);oscillator.stop(t+.85);
      }
      const started=ctx.currentTime,peaks={direct:0,master:0,score:0};
      const samples=new Float32Array(2048);
      // Peak measurements are made before the device output, never presented as audibility.
      const deadline=performance.now()+(mode==='measure'?2500:1200);
      while(performance.now()<deadline){
        for(const [name,probe] of Object.entries({direct,master,score})){
          probe.analyser.getFloatTimeDomainData(samples);
          for(const value of samples)peaks[name]=Math.max(peaks[name],Math.abs(value));
        }
        await new Promise(resolve=>setTimeout(resolve,40));
      }
      lastMeasurement={peaks,audioClockAdvanced:ctx.currentTime-started,context:ctx.state};
      result.textContent='Test finished. '+(mode==='measure'?'Signal measured inside the graph.':'Did you hear the tone? Use a response button below.');
    }catch(value){
      error(mode,value);result.textContent='Test error: '+(value.message||value);
    }finally{
      if(oscillator){try{oscillator.stop()}catch{}oscillator.disconnect()}
      envelope?.disconnect();
      const graph=audio.diagnosticOutput();
      if(master)graph.master?.disconnect(master.analyser);
      detachScore?.();
      direct?.dispose();master?.dispose();score?.dispose();
      busy=false;refresh();
    }
  }
  section.addEventListener('click',event=>{
    const testButton=event.target.closest('[data-test]');
    if(testButton){
      const mode=testButton.dataset.test;
      if(mode==='refresh')refresh();
      else if(mode==='session'){
        try{
          if(!navigator.audioSession)throw Error('Audio Session API is unavailable in this browser.');
          navigator.audioSession.type='playback';
          audio.init();
          result.textContent='Playback session selected. Tap Test direct output again to compare.';
        }catch(value){error('audio session comparison',value);result.textContent=value.message}
        refresh();
      }else test(mode);
    }
    const response=event.target.closest('[data-heard]');
    if(response){heard=response.dataset.heard;refresh()}
  });
  window.addEventListener('error',event=>{error('window error',event.error||event.message);refresh()});
  window.addEventListener('unhandledrejection',event=>{
    if(!event.reason?.cancelled){error('unhandled promise',event.reason);refresh()}
  });
  refresh();
})();
