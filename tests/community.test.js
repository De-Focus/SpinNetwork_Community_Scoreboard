'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbx-community-test-'));
const port = String(39000 + Math.floor(Math.random() * 1000));
const base = `http://127.0.0.1:${port}`;
let server;
function request(route, body, options = {}) {
  return fetch(`${base}${route}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, body: JSON.stringify(body)
  } : options);
}
async function ready() {
  for (let i=0; i<80; i++) {
    try { const response = await request('/api/health'); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw Error('Server not ready');
}
async function apply(command, expectedStatus = 200) {
  const res = await request('/api/command', command);
  const value = await res.json();
  assert.equal(res.status, expectedStatus, JSON.stringify(value));
  return value;
}
async function getState() { return (await request('/api/state')).json(); }

test('Community v1.0.1 standalone integration', async t => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, BBX_DATA_DIR: dir, BBX_PORT: port, BBX_OPEN_BROWSER: '0' },
    stdio: ['ignore','pipe','pipe']
  });
  t.after(() => { server.kill(); fs.rmSync(dir,{recursive:true,force:true}); });
  await ready();
  await t.test('Clean default state, no private dataset', async () => {
    const s = await getState();
    assert.equal(s.player1.name, 'Player 1'); assert.equal(s.player2.name, 'Player 2');
    assert.equal(s.target, 4); assert.equal(s.round, 1);
    assert.equal(s.player1.score, 0); assert.equal(s.winner, null);
  });
  await t.test('Only Live and two OBS outputs are reachable', async () => {
    const root = await request('/'); assert.equal(root.status, 200);
    const html = await root.text();
    assert.match(html, /Match control/);
    assert.match(html, /Manual player names/);
    for (const route of ['/outputs/horizontal.html','/outputs/vertical.html','/css/overlay.css','/js/overlay.js']) {
      const r = await request(route); assert.equal(r.status, 200, route);
      const content = await r.text(); assert.ok(content.length > 30);
    }
    for (const route of ['/match.html','/production.html','/branding.html','/portal.html','/league.html','/api/obs','/api/players','/api/leagues','/server.js','/.github/workflows/build-windows.yml']) {
      assert.equal((await request(route)).status, 404, route);
    }
  });
  await t.test('Manual player names and point target update', async () => {
    let s = await apply({command:'setNames',player1:'Alice',player2:'Bob'});
    assert.equal(s.player1.name,'Alice'); assert.equal(s.player2.name,'Bob');
    s = await apply({command:'target',value:7}); assert.equal(s.target,7);
    await apply({command:'setNames',player1:'',player2:'Bob'},400);
    await apply({command:'target',value:1000},400);
  });
  await t.test('Beyblade X scoring and undo', async () => {
    for (const [finish, points] of [['spin',1],['over',2],['burst',2],['xtreme',3]]) {
      const current = (await getState()).player1.score;
      const s = await apply({command:'score',side:'player1',finish});
      assert.equal(s.player1.score,current+points);
      assert.equal(s.player1.finishes[finish], 1);
      assert.equal(s.callout.side, 'player1');
      assert.equal(s.callout.finish, finish);
    }
    let s = await apply({command:'score',side:'player1',amount:-1});
    assert.equal(s.player1.score,7);
    assert.equal(s.player1.matchPoints,7);
    assert.equal(s.player1.finishes.spin,1);
    s = await apply({command:'undo'}); assert.equal(s.player1.score,8);
    assert.equal(s.player1.matchPoints,8);
    assert.equal(s.callout.text,'');
    await apply({command:'score',side:'player1',finish:'invalid'},400);
    await apply({command:'score',side:'admin',finish:'spin'},400);
  });
  await t.test('Judge calls, round actions, side swaps and match winner', async () => {
    let s = await apply({command:'roundWin',side:'player2'}); assert.equal(s.player2.rounds,1);
    s = await apply({command:'nextRound'}); assert.equal(s.round,2); assert.equal(s.player1.score,0);
    assert.equal(s.player1.matchPoints,8);
    assert.equal(s.player1.finishes.xtreme,1);
    s = await apply({command:'judge',text:'JUDGE REVIEW'}); assert.equal(s.judge.visible,true);
    assert.ok(s.judge.expiresAt > Date.now() + 4000);
    s = await apply({command:'hideJudge'}); assert.equal(s.judge.visible,false);
    s = await apply({command:'panel',format:'horizontal',mode:'mini'}); assert.equal(s.panels.horizontal,'mini');
    s = await apply({command:'panel',format:'vertical',mode:'hidden'}); assert.equal(s.panels.vertical,'hidden');
    s = await apply({command:'scoreboard',visible:false}); assert.equal(s.scoreboardVisible,false);
    s = await apply({command:'swap'}); assert.equal(s.player1.name,'Bob');
    s = await apply({command:'matchWin',side:'player1'}); assert.equal(s.winner,'player1');
    await apply({command:'score',side:'player2',finish:'spin'},400);
    s = await apply({command:'resetMatch'}); assert.equal(s.winner,null); assert.equal(s.round,1);
    assert.equal(s.player1.matchPoints,0); assert.equal(s.player2.finishes.spin,0);
    assert.equal(s.player1.name,'Bob'); assert.equal(s.panels.horizontal,'mini');
  });
  await t.test('Judge graphic automatically expires after five seconds', async () => {
    let s = await apply({command:'judge',text:'DECK CHECK'});
    assert.equal(s.judge.visible, true);
    await new Promise(resolve => setTimeout(resolve, 5300));
    s = await getState();
    assert.equal(s.judge.visible,false);
    assert.equal(s.judge.text,'');
    assert.equal(s.judge.expiresAt,0);
  });
  await t.test('Vertical and horizontal overlays have side statistics, animation and browser fit support', async () => {
    for (const format of ['vertical','horizontal']) {
      const response = await request(`/outputs/${format}.html`);
      assert.equal(response.status,200);
      const html = await response.text();
      assert.match(html, /id="matchPoints1"/);
      assert.match(html, /id="finish2"/);
      assert.match(html, /id="scorebug"/);
      assert.doesNotMatch(html,/id="sbName1"/);
    }
    const script = await (await request('/js/overlay.js')).text();
    assert.match(script,/fitForBrowser/);
    assert.match(script,/showFinish/);
    assert.match(script,/judge\?\.expiresAt/);
  });
  await t.test('Persist state outside application in clean data directory', async () => {
    const state = JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));
    assert.equal(state.player1.name,'Bob'); assert.equal(state.player1.score,0);
    assert.equal(state.panels.vertical,'hidden');
  });
  await t.test('Blocks cross-origin mutations and suspicious HTTP paths', async () => {
    const cross = await request('/api/command', {command:'resetMatch'}, {headers:{Origin:'https://evil.example'}});
    assert.equal(cross.status,403);
    const badHostStatus = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: Number(port), path:'/api/state', headers: {Host:'fake.example'} }, res => {
        res.resume(); resolve(res.statusCode);
      }).on('error', reject);
    });
    assert.equal(badHostStatus,403);
    const nonpost = await request('/api/command'); assert.equal(nonpost.status,405);
  });
  await t.test('Event stream provides live updates', async () => {
    const ac = new AbortController();
    const stream = await fetch(`${base}/api/events`,{signal:ac.signal});
    assert.equal(stream.status,200);
    assert.match(stream.headers.get('content-type'),/text\/event-stream/);
    const reader = stream.body.getReader();
    const initial = await reader.read();
    assert.match(Buffer.from(initial.value).toString(),/event: state/);
    await apply({command:'judge',text:'RESHOOT'});
    const next = await reader.read();
    assert.match(Buffer.from(next.value).toString(),/RESHOOT/);
    ac.abort(); await reader.cancel().catch(()=>{});
  });
});
