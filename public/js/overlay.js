'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const fmt = document.body.dataset.format;
  let lastStamp = 0;
  let finishTimer, callTimer, judgeTimer;
  const finishes = { spin: 1, over: 2, burst: 2, xtreme: 3 };
  function fitForBrowser() {
    // OBS renders at the exact output size; a regular browser viewport is usually
    // shorter, causing the bottom-positioned vertical graphics to be offscreen.
    // Fit the entire stage only when dimensions differ from the native output.
    const width = fmt === 'vertical' ? 1080 : 1920;
    const height = fmt === 'vertical' ? 1920 : 1080;
    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;
    const native = Math.abs(viewportW - width) < 2 && Math.abs(viewportH - height) < 2;
    if (native) {
      document.body.style.cssText = '';
      $('stage').style.transform = '';
      $('stage').style.margin = '';
      $('stage').style.width = '';
      $('stage').style.height = '';
      return;
    }
    const scale = Math.min(viewportW / width, viewportH / height);
    // CSS sizing is needed because the entire overlay is a fixed-resolution stage.
    document.body.style.width = `${viewportW}px`;
    document.body.style.height = `${viewportH}px`;
    $('stage').style.width = `${width}px`;
    $('stage').style.height = `${height}px`;
    $('stage').style.transform = `scale(${scale})`;
    $('stage').style.marginLeft = `${Math.max(0,(viewportW - width*scale)/2)}px`;
    $('stage').style.marginTop = `${Math.max(0,(viewportH - height*scale)/2)}px`;
  }
  window.addEventListener('resize', fitForBrowser);
  fitForBrowser();
  function showFinish(call) {
    const side = call.side === 'player2' ? 2 : 1;
    const other = side === 1 ? 2 : 1;
    const node = $('finish' + side);
    clearTimeout(finishTimer);
    $('finish' + other).classList.remove('show');
    node.className = `finish-popout p${side} ${call.finish || ''}`;
    $('finishTitle' + side).textContent = `${(call.finish || '').toUpperCase()} FINISH`;
    $('finishDetail' + side).textContent = `+${finishes[call.finish] || 0} POINT${finishes[call.finish] === 1 ? '' : 'S'}`;
    // Force next animation to start even if the same side scores twice in succession.
    void node.offsetWidth;
    node.classList.add('show');
    finishTimer = setTimeout(() => node.classList.remove('show'), 2900);
  }
  function render(state) {
    if (!state || !state.player1) return;
    for (const [i, p] of [[1,'player1'],[2,'player2']]) {
      const player = state[p];
      $('railName'+i).textContent = player.name;
      $('sbScore'+i).textContent = player.score;
      $('railRounds'+i).textContent = `${player.rounds} ROUND${player.rounds === 1 ? '' : 'S'}`;
      $('matchPoints'+i).textContent = player.matchPoints || 0;
      const count = Object.values(player.finishes || {}).reduce((a,b) => a+b,0);
      $('finishCount'+i).textContent = count;
      $('railRound'+i).textContent = state.round;
      for (const finish of Object.keys(finishes)) $(finish+i).textContent = player.finishes?.[finish] || 0;
    }
    $('scorebug').classList.toggle('off', !state.scoreboardVisible);
    $('playerPanels').className = `player-panels ${state.panels?.[fmt] || 'full'}`;
    clearTimeout(judgeTimer);
    const remaining = (state.judge?.expiresAt || 0) - Date.now();
    const judgeVisible = Boolean(state.judge?.visible) && remaining > 0;
    $('judgeText').textContent = judgeVisible ? state.judge.text : '';
    $('judge').classList.toggle('show', judgeVisible);
    if (judgeVisible) judgeTimer = setTimeout(() => $('judge').classList.remove('show'), remaining);
    $('winner').classList.toggle('show', Boolean(state.winner));
    $('winnerName').textContent = state.winner ? state[state.winner].name : '';
    const call = state.callout || {};
    if (call.stamp !== lastStamp) {
      lastStamp = call.stamp;
      clearTimeout(callTimer);
      const node = $('callout');
      node.className = 'callout';
      // Refresh/OBS reactivation must not replay old scoring graphics.
      const age = Date.now() - call.stamp;
      if (call.stamp && age > -1500 && age < 5500) {
        if (call.kind === 'finish' && call.side && call.finish) {
          showFinish(call);
        } else if (call.text && call.kind !== 'finish') {
          node.textContent = call.text;
          node.className = `callout ${call.kind} show`;
          callTimer = setTimeout(() => node.classList.remove('show'), 3000);
        }
      }
    }
  }
  async function initialState() {
    try { const res = await fetch('/api/state', {cache:'no-store'}); if(res.ok) render(await res.json()); } catch {}
  }
  initialState();
  const es = new EventSource('/api/events');
  es.addEventListener('state', e => { try { render(JSON.parse(e.data)); } catch {} });
})();
