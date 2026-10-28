'use strict';
// BBX Community v1.0: standalone, dependency-free, loopback-only broadcast server.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { URL } = require('node:url');

const ROOT = path.join(__dirname, 'public');
const DATA_DIR = process.env.BBX_DATA_DIR || (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'BBX Broadcast Studio', 'Community')
  : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'bbx-community'));
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const HOST = '127.0.0.1'; // deliberately not remotely accessible
const PORT = Number(process.env.BBX_PORT || 3784);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw Error('BBX_PORT must be between 1024 and 65535');
const CLIENTS = new Set();
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const validModes = new Set(['full', 'mini', 'hidden']);
const FINISHES = Object.freeze({ spin: 1, over: 2, burst: 2, xtreme: 3 });
const newFinishes = () => ({ spin: 0, over: 0, burst: 0, xtreme: 0 });
const JUDGE_DURATION_MS = 5000;
const blank = () => ({
  version: 1,
  player1: { name: 'Player 1', score: 0, rounds: 0, matchPoints: 0, finishes: newFinishes() },
  player2: { name: 'Player 2', score: 0, rounds: 0, matchPoints: 0, finishes: newFinishes() },
  round: 1, target: 4, winner: null, status: 'live',
  judge: { text: '', visible: false, expiresAt: 0 },
  callout: { text: '', kind: '', side: '', finish: '', stamp: 0 },
  panels: { horizontal: 'full', vertical: 'full' },
  scoreboardVisible: true,
  updatedAt: new Date().toISOString()
});
function cleanName(name, fallback) {
  return typeof name === 'string' ? (name.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 36) || fallback) : fallback;
}
function sanitise(raw) {
  const state = blank();
  if (!raw || typeof raw !== 'object') return state;
  for (const p of ['player1', 'player2']) {
    const src = raw[p] || {};
    state[p] = {
      name: cleanName(src.name, state[p].name),
      score: Number.isInteger(src.score) ? clamp(src.score, 0, 99) : 0,
      rounds: Number.isInteger(src.rounds) ? clamp(src.rounds, 0, 99) : 0,
      matchPoints: Number.isInteger(src.matchPoints) ? clamp(src.matchPoints, 0, 9999) : (Number.isInteger(src.score) ? clamp(src.score, 0, 9999) : 0),
      finishes: Object.fromEntries(Object.keys(FINISHES).map(finish => [finish, Number.isInteger(src.finishes?.[finish]) ? clamp(src.finishes[finish], 0, 9999) : 0]))
    };
  }
  state.round = Number.isInteger(raw.round) ? clamp(raw.round, 1, 99) : 1;
  state.target = Number.isInteger(raw.target) ? clamp(raw.target, 1, 25) : 4;
  state.winner = ['player1', 'player2'].includes(raw.winner) ? raw.winner : null;
  state.status = state.winner ? 'finished' : 'live';
  const expiresAt = Number.isSafeInteger(raw.judge?.expiresAt) ? raw.judge.expiresAt : 0;
  state.judge = {
    text: typeof raw.judge?.text === 'string' ? raw.judge.text.slice(0, 40) : '',
    visible: Boolean(raw.judge?.visible) && expiresAt > Date.now(),
    expiresAt: expiresAt > Date.now() ? expiresAt : 0
  };
  state.callout = {
    text: typeof raw.callout?.text === 'string' ? raw.callout.text.slice(0, 90) : '',
    kind: ['finish', 'round', 'winner', 'info'].includes(raw.callout?.kind) ? raw.callout.kind : '',
    side: ['player1', 'player2'].includes(raw.callout?.side) ? raw.callout.side : '',
    finish: Object.hasOwn(FINISHES, raw.callout?.finish) ? raw.callout.finish : '',
    stamp: Number.isSafeInteger(raw.callout?.stamp) ? raw.callout.stamp : 0
  };
  for (const format of ['horizontal', 'vertical']) {
    if (validModes.has(raw.panels?.[format])) state.panels[format] = raw.panels[format];
  }
  state.scoreboardVisible = raw.scoreboardVisible !== false;
  return state;
}
function readState() {
  try { return sanitise(JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') console.error('Could not read prior state:', e.message); return blank(); }
}
let state = readState();
const undoStack = [];
let stamp = Date.now();
let judgeTimer = null;
function clearJudgeWhenExpired() {
  clearTimeout(judgeTimer); judgeTimer = null;
  if (!state.judge.visible) return;
  const delay = state.judge.expiresAt - Date.now();
  if (delay > 0) { judgeTimer = setTimeout(clearJudgeWhenExpired, delay); judgeTimer.unref?.(); return; }
  state.judge = { text: '', visible: false, expiresAt: 0 };
  state.updatedAt = new Date().toISOString();
  save(); emit();
}
clearJudgeWhenExpired();
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${STATE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, STATE_PATH);
}
function emit() {
  const event = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const res of CLIENTS) { try { res.write(event); } catch { CLIENTS.delete(res); } }
}
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
const requireSide = side => { if (!['player1', 'player2'].includes(side)) fail('Unknown player'); return side; };
function finiteInt(x, min, max, label) {
  if (!Number.isInteger(x) || x < min || x > max) fail(`${label} must be ${min}–${max}`);
  return x;
}
function setCallout(text, kind, side = '', finish = '') { stamp = Math.max(Date.now(), stamp + 1); state.callout = { text, kind, side, finish, stamp }; }
function change(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('Invalid command');
  const cmd = payload.command;
  if (cmd === 'undo') {
    if (undoStack.length === 0) fail('Nothing to undo');
    state = undoStack.pop();
    // Undo shouldn't replay the previous scorer animation or an expired judge call.
    setCallout('', 'info');
    if (state.judge.expiresAt <= Date.now()) state.judge = { text: '', visible: false, expiresAt: 0 };
    state.updatedAt = new Date().toISOString();
    clearJudgeWhenExpired();
    save(); emit(); return state;
  }
  const before = structuredClone(state);
  switch (cmd) {
    case 'setNames':
      if (typeof payload.player1 !== 'string' || typeof payload.player2 !== 'string') fail('Both player names are required');
      if (payload.player1.trim().length > 36 || payload.player2.trim().length > 36) fail('Names must be 36 characters or less');
      if (!payload.player1.trim() || !payload.player2.trim()) fail('Player names cannot be empty');
      state.player1.name = cleanName(payload.player1, 'Player 1');
      state.player2.name = cleanName(payload.player2, 'Player 2');
      break;
    case 'target':
      state.target = finiteInt(payload.value, 1, 25, 'Target'); break;
    case 'score': {
      const side = requireSide(payload.side);
      if (state.winner) fail('Reset the match before scoring again');
      let amount;
      if (payload.finish) {
        if (!Object.hasOwn(FINISHES, payload.finish)) fail('Unknown finish');
        amount = FINISHES[payload.finish];
      } else { amount = finiteInt(payload.amount, -1, -1, 'Adjustment'); }
      const oldScore = state[side].score;
      state[side].score = clamp(oldScore + amount, 0, 99);
      const actual = state[side].score - oldScore;
      if (payload.finish) {
        state[side].finishes[payload.finish]++;
        state[side].matchPoints = clamp(state[side].matchPoints + actual, 0, 9999);
        setCallout(`${payload.finish.toUpperCase()} FINISH`, 'finish', side, payload.finish);
      } else {
        // Manual corrections adjust the current round and match points without
        // inventing or rewriting the historical finish counts.
        state[side].matchPoints = clamp(state[side].matchPoints + actual, 0, 9999);
        setCallout('', 'info');
      }
      break;
    }
    case 'roundWin': {
      const side = requireSide(payload.side);
      if (state.winner) fail('The match has ended');
      state[side].rounds = clamp(state[side].rounds + 1, 0, 99);
      setCallout(`${state[side].name} — ROUND WIN`, 'round');
      break;
    }
    case 'nextRound':
      if (state.winner) fail('Reset the match to start a new one');
      state.round = clamp(state.round + 1, 1, 99);
      state.player1.score = state.player2.score = 0;
      setCallout(`ROUND ${state.round}`, 'info');
      break;
    case 'matchWin': {
      const side = requireSide(payload.side);
      state.winner = side; state.status = 'finished';
      setCallout(`${state[side].name} — MATCH WINNER`, 'winner');
      break;
    }
    case 'swap': {
      [state.player1, state.player2] = [state.player2, state.player1];
      if (state.winner) state.winner = state.winner === 'player1' ? 'player2' : 'player1';
      setCallout('SIDES SWAPPED', 'info');
      break;
    }
    case 'resetMatch': {
      const { player1, player2, panels, target, scoreboardVisible } = state;
      state = blank();
      state.player1.name = player1.name; state.player2.name = player2.name;
      state.panels = panels; state.target = target; state.scoreboardVisible = scoreboardVisible;
      break;
    }
    case 'judge': {
      const approved = ['JUDGE REVIEW', 'RESHOOT', 'PENALTY', 'DECK CHECK', 'EQUIPMENT CHECK', 'MATCH PAUSED', 'MATCH RESUMED'];
      if (!approved.includes(payload.text)) fail('Unsupported judge call');
      state.judge = { text: payload.text, visible: true, expiresAt: Date.now() + JUDGE_DURATION_MS };
      setCallout('', 'info');
      break;
    }
    case 'hideJudge':
      state.judge = { text: '', visible: false, expiresAt: 0 }; break;
    case 'panel':
      if (!['horizontal', 'vertical'].includes(payload.format) || !validModes.has(payload.mode)) fail('Invalid panel settings');
      state.panels[payload.format] = payload.mode; break;
    case 'scoreboard':
      if (typeof payload.visible !== 'boolean') fail('Visibility must be boolean');
      state.scoreboardVisible = payload.visible; break;
    default: fail('Unsupported command', 404);
  }
  // No-op changes do not pollute Undo history.
  if (JSON.stringify({ ...before, updatedAt: null }) === JSON.stringify({ ...state, updatedAt: null })) return state;
  undoStack.push(before);
  if (undoStack.length > 80) undoStack.shift();
  state.updatedAt = new Date().toISOString();
  clearJudgeWhenExpired();
  save(); emit(); return state;
}
function json(res, status, body) {
  const content = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(content);
}
function sendStatic(res, pathname, method) {
  if (!['GET', 'HEAD'].includes(method)) return json(res, 405, { error: 'Method not allowed' });
  const allowed = /^\/(?:$|index\.html$|css\/[a-z0-9-]+\.css$|js\/[a-z0-9-]+\.js$|outputs\/(?:horizontal|vertical)\.html$)/i;
  if (!allowed.test(pathname)) return json(res, 404, { error: 'Not found' });
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  const full = path.join(ROOT, file);
  const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript';
  fs.readFile(full, (error, contents) => {
    if (error) return json(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' });
    res.end(method === 'HEAD' ? undefined : contents);
  });
}
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser CLI clients
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && Number(url.port || 80) === PORT;
  } catch { return false; }
}
function createServer() {
  return http.createServer((req, res) => {
    const host = String(req.headers.host || '');
    if (![ `127.0.0.1:${PORT}`, `localhost:${PORT}` ].includes(host)) return json(res, 403, { error: 'Local access only' });
    let url;
    try { url = new URL(req.url, `http://127.0.0.1:${PORT}`); } catch { return json(res, 400, { error: 'Bad URL' }); }
    const pathname = url.pathname;
    if (pathname === '/api/health' && req.method === 'GET') return json(res, 200, { product: 'BBX Community', version: '1.0.1', localOnly: true });
    if (pathname === '/api/state' && req.method === 'GET') return json(res, 200, state);
    if (pathname === '/api/events' && req.method === 'GET') {
      if (CLIENTS.size > 64) return json(res, 503, { error: 'Too many connections' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`retry: 1200\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
      CLIENTS.add(res);
      req.on('close', () => CLIENTS.delete(res)); return;
    }
    if (pathname === '/api/command') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });
      if (!originOk(req)) return json(res, 403, { error: 'Origin blocked' });
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(res, 415, { error: 'Expected JSON' });
      let body = '', tooLong = false;
      req.on('data', chunk => { body += chunk; if (body.length > 4096) { tooLong = true; req.destroy(); } });
      req.on('end', () => {
        if (tooLong) return;
        try { return json(res, 200, change(JSON.parse(body))); }
        catch (e) { return json(res, e.status || 400, { error: e.message }); }
      }); return;
    }
    return sendStatic(res, pathname, req.method);
  });
}
function launchBrowser() {
  const url = `http://127.0.0.1:${PORT}/`;
  try {
    const args = process.platform === 'win32' ? ['/c', 'start', '', url]
      : process.platform === 'darwin' ? [url] : [url];
    const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const proc = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    proc.on('error', () => {}); proc.unref();
  } catch { /* copy URL shown in console */ }
}
if (require.main === module) {
  const server = createServer();
  const heartbeat = setInterval(() => {
    for (const client of CLIENTS) { try { client.write(': keepalive\n\n'); } catch { CLIENTS.delete(client); } }
  }, 20000); heartbeat.unref();
  server.listen(PORT, HOST, () => {
    console.log(`BBX Broadcast Studio — Community v1.0.1\nLive controller: http://127.0.0.1:${PORT}/\nOBS horizontal: http://127.0.0.1:${PORT}/outputs/horizontal.html\nOBS vertical:   http://127.0.0.1:${PORT}/outputs/vertical.html\nClose this window or Ctrl+C to stop.`);
    if (process.env.BBX_OPEN_BROWSER === '1') setTimeout(launchBrowser, 350);
  });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
      // A second desktop shortcut click should reopen the already-running app.
      http.get(`http://${HOST}:${PORT}/api/health`, response => {
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.product === 'BBX Community') {
              console.log('BBX Community is already running. Opening its controller.');
              if (process.env.BBX_OPEN_BROWSER === '1') launchBrowser();
              return;
            }
          } catch { /* another application is using the port */ }
          console.error(`Port ${PORT} is occupied by another application.`);
          process.exitCode = 1;
        });
      }).on('error', () => { console.error(`Port ${PORT} is in use.`); process.exitCode = 1; });
      return;
    }
    console.error(`Could not start BBX Community on ${HOST}:${PORT}: ${error.message}`);
    process.exitCode = 1;
  });
}
module.exports = { createServer, change, blank, sanitise, DATA_DIR, PORT };
