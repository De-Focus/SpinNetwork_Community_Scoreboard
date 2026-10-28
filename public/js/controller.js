'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let state;
  let suppressInputRender = false;
  const toastNode = $('toast');
  let timeout;
  function toast(message, error = false) {
    toastNode.textContent = message;
    toastNode.className = `toast show${error ? ' error' : ''}`;
    clearTimeout(timeout);
    timeout = setTimeout(() => toastNode.classList.remove('show'), 2700);
  }
  async function command(body, success) {
    try {
      const response = await fetch('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || `HTTP ${response.status}`);
      render(result);
      if (success) toast(success);
    } catch (error) { toast(error.message || 'Could not update match', true); }
  }
  function render(next) {
    if (!next || !next.player1) return;
    state = next;
    for (const [index, side] of [[1,'player1'],[2,'player2']]) {
      $('heading'+index).textContent = next[side].name;
      $('score'+index).textContent = next[side].score;
      const fin = next[side].finishes || {};
      const totalFinishes = Object.values(fin).reduce((sum, v) => sum + v, 0);
      $('stats'+index).textContent = `MATCH: ${next[side].matchPoints || 0} PTS  ·  ${next[side].rounds} ROUNDS  ·  ${totalFinishes} FINISHES  (S ${fin.spin || 0} / O ${fin.over || 0} / B ${fin.burst || 0} / X ${fin.xtreme || 0})`;
      const input = $('name'+index);
      if (!suppressInputRender && document.activeElement !== input) input.value = next[side].name;
    }
    if (document.activeElement !== $('target')) $('target').value = String(next.target);
    $('roundNumber').textContent = `ROUND ${String(next.round).padStart(2, '0')}`;
    $('targetText').textContent = `FIRST TO ${next.target}`;
    const judgeLive = Boolean(next.judge.visible) && next.judge.expiresAt > Date.now();
    $('judgeStatus').textContent = judgeLive ? next.judge.text : 'CLEAR';
    $('judgeStatus').classList.toggle('on-air', judgeLive);
    const winner = $('winnerStatus');
    winner.hidden = !next.winner;
    if (next.winner) winner.textContent = `MATCH WINNER — ${next[next.winner].name}`;
    for (const button of document.querySelectorAll('[data-finish], [data-command="roundWin"], [data-command="matchWin"], [data-command="score"]')) {
      button.disabled = Boolean(next.winner);
    }
    for (const button of document.querySelectorAll('[data-panel]')) {
      button.classList.toggle('selected', next.panels[button.dataset.panel] === button.dataset.mode);
      button.setAttribute('aria-pressed', String(next.panels[button.dataset.panel] === button.dataset.mode));
    }
    for (const button of document.querySelectorAll('[data-scoreboard]')) {
      const selected = next.scoreboardVisible === (button.dataset.scoreboard === 'true');
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    }
  }
  $('namesForm').addEventListener('submit', async event => {
    event.preventDefault(); suppressInputRender = false;
    await command({ command: 'setNames', player1: $('name1').value, player2: $('name2').value }, 'Player names saved');
  });
  $('namesForm').addEventListener('input', () => { suppressInputRender = true; });
  $('target').addEventListener('change', () => command({ command: 'target', value: Number($('target').value) }, 'Point target updated'));
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.finish) return command({ command:'score', side:button.dataset.side, finish:button.dataset.finish });
    if (button.dataset.judge) return command({ command:'judge', text:button.dataset.judge }, 'Judge call on-air');
    if (button.dataset.panel) return command({ command:'panel', format:button.dataset.panel, mode:button.dataset.mode });
    if (button.dataset.scoreboard) return command({ command:'scoreboard', visible:button.dataset.scoreboard==='true' });
    if (button.dataset.copy) {
      const el = $(button.dataset.copy);
      navigator.clipboard?.writeText(el.value).then(()=>toast('OBS URL copied')).catch(()=>{ el.select();toast('Select and copy the URL'); });
      return;
    }
    const action = button.dataset.command;
    if (!action) return;
    if (action === 'resetMatch' && !confirm('Reset all points, rounds and winner? Player names are kept.')) return;
    const body = { command: action };
    if (button.dataset.side) body.side = button.dataset.side;
    if (action === 'score') body.amount = -1;
    command(body, action === 'undo' ? 'Last action undone' : undefined);
  });
  function connect() {
    const events = new EventSource('/api/events');
    events.addEventListener('open', () => { $('signal').classList.add('online'); $('connection').textContent = 'Local controller connected'; });
    events.addEventListener('state', event => { try { render(JSON.parse(event.data)); } catch {} });
    events.addEventListener('error', () => { $('signal').classList.remove('online'); $('connection').textContent = 'Reconnecting…'; });
  }
  function updatePreviewSize() {
    for (const [id,width,height] of [['previewH',1920,1080],['previewV',1080,1920]]) {
      const iframe = $(id); const container = iframe.parentElement;
      iframe.style.width = `${width}px`; iframe.style.height = `${height}px`;
      iframe.style.transform = `scale(${Math.min(container.clientWidth / width,container.clientHeight / height)})`;
    }
  }
  $('urlH').value = new URL('/outputs/horizontal.html', location.href).href;
  $('urlV').value = new URL('/outputs/vertical.html', location.href).href;
  window.addEventListener('resize', updatePreviewSize);
  updatePreviewSize();
  connect();
})();
