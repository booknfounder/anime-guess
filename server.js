'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

/* ───────────── AniList + Cache ───────────── */
const ANILIST = 'https://graphql.anilist.co';
const ANIME = {
  naruto:   { label: 'Naruto',            ids: [20, 1735] },
  dbz:      { label: 'Dragon Ball Z',     ids: [813] },
  dbs:      { label: 'Dragon Ball Super', ids: [30694] },
  onepiece: { label: 'One Piece',         ids: [21] },
  bleach:   { label: 'Bleach',            ids: [269] },
};
const TTL = 12 * 3600 * 1000;
const cache = new Map();     // mediaId -> { at, chars }
const inflight = new Map();  // mediaId -> Promise
const sleep = ms => new Promise(r => setTimeout(r, ms));

const QUERY = `query($id:Int){Media(id:$id,type:ANIME){id characters(sort:FAVOURITES_DESC,perPage:50,page:1){nodes{id name{full native} image{large}}}}}`;

async function anilist(id, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { id } }),
      });
      if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 3) * 1000); continue; }
      if (!r.ok) { await sleep(800 * (i + 1)); continue; }
      const j = await r.json();
      if (j.errors) throw new Error(j.errors[0].message);
      return j.data.Media;
    } catch (e) { if (i === tries - 1) throw e; await sleep(800); }
  }
  throw new Error('AniList unavailable');
}

async function loadMedia(id, label) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.chars;
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    try {
      const m = await anilist(id);
      const chars = m.characters.nodes
        .filter(c => c.image && c.image.large && !/default/i.test(c.image.large))
        .map(c => ({ id: c.id, name: c.name.full, native: c.name.native || '', image: c.image.large, anime: label }));
      cache.set(id, { at: Date.now(), chars });
      return chars;
    } catch (e) {
      if (hit) return hit.chars; // استخدم النسخة القديمة عند الفشل
      throw e;
    }
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

async function loadPool(keys) {
  const list = keys.includes('all') ? Object.keys(ANIME) : keys.filter(k => ANIME[k]);
  const out = [], seen = new Set();
  for (const k of list) {
    for (const id of ANIME[k].ids) {
      const chars = await loadMedia(id, ANIME[k].label);
      for (const c of chars) if (!seen.has(c.id)) { seen.add(c.id); out.push(c); }
    }
  }
  return out;
}

let avatarCache = null;
app.get('/api/avatars', async (req, res) => {
  try {
    if (!avatarCache || Date.now() - avatarCache.at > TTL) {
      const items = [];
      for (const k of Object.keys(ANIME)) (await loadPool([k])).slice(0, 6).forEach(c => items.push({ name: c.name, image: c.image }));
      avatarCache = { at: Date.now(), items };
    }
    res.json(avatarCache.items);
  } catch (e) { res.status(503).json({ error: 'anilist' }); }
});

// تسخين الكاش عند التشغيل (بهدوء لتفادي حدود الطلبات)
(async () => {
  for (const k of Object.keys(ANIME)) {
    try { await loadPool([k]); } catch (e) { console.log('prewarm failed:', k, e.message); }
    await sleep(800);
  }
  console.log('AniList cache warmed');
})();

/* ───────────── أدوات ───────────── */
const strip = s => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const norm = s => strip(s).replace(/[^a-z0-9]/g, '');
const words = s => strip(s).split(/[^a-z0-9]+/).filter(Boolean);
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function matches(guess, ch) {
  const g = norm(guess); if (!g) return false;
  const full = norm(ch.name);
  if (g === full || (full.length >= 7 && lev(g, full) <= 1)) return true;
  return words(ch.name).some(p => p.length >= 4 && (g === p || (p.length >= 6 && lev(g, p) <= 1)));
}
function leaks(text, ch) {
  if (norm(text).includes(norm(ch.name))) return true;
  const w = words(text);
  return words(ch.name).filter(p => p.length >= 3).some(p => w.includes(p) || (p.length >= 5 && w.some(x => lev(x, p) <= 1)));
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const okAvatar = u => (typeof u === 'string' && u.startsWith('https://s4.anilist.co/') && u.length < 300) ? u : null;
const REACTS = ['🔥', '😂', '😱', 'GG', '👏', '❤️'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ───────────── الغرف ───────────── */
const rooms = new Map();
const genCode = () => { let c; do { c = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (rooms.has(c)); return c; };
const publicRoom = r => ({
  code: r.code, hostId: r.hostId, state: r.state, settings: r.settings,
  players: [...r.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, answered: p.answered || p.locked })),
});
const emitRoom = r => io.to(r.code).emit('room:update', publicRoom(r));
const board = r => [...r.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score })).sort((a, b) => b.score - a.score);
const sys = (r, text) => io.to(r.code).emit('chat', { system: true, text });

function sanitizeSettings(s, prev) {
  s = s || {};
  const keys = Array.isArray(s.animes) ? s.animes.filter(k => k === 'all' || ANIME[k]) : prev.animes;
  return {
    rounds: Math.min(50, Math.max(3, parseInt(s.rounds) || prev.rounds)),
    time: Math.min(60, Math.max(8, parseInt(s.time) || prev.time)),
    mode: s.mode === 'type' ? 'type' : 'choice',
    animes: keys.length ? (keys.includes('all') ? ['all'] : keys) : ['all'],
    zoom: !!s.zoom, hint: !!s.hint,
  };
}

async function startGame(r) {
  r.state = 'loading'; emitRoom(r);
  io.to(r.code).emit('game:loading');
  try {
    r.pool = await loadPool(r.settings.animes);
    if (r.pool.length < 8) throw new Error('few');
  } catch (e) {
    r.state = 'lobby'; emitRoom(r);
    return io.to(r.code).emit('notice', 'تعذّر جلب الشخصيات من AniList. حاول بعد قليل.');
  }
  r.players.forEach(p => { p.score = 0; });
  r.queue = shuffle(r.pool).slice(0, Math.min(r.settings.rounds, r.pool.length));
  r.index = -1;
  nextRound(r);
}

function nextRound(r) {
  clearTimeout(r.timer);
  r.index++;
  if (r.index >= r.queue.length) return endGame(r);
  const ch = r.cur = r.queue[r.index];
  r.players.forEach(p => { p.answered = false; p.locked = false; p.gained = 0; });
  let options = null;
  if (r.settings.mode === 'choice') {
    const others = shuffle(r.pool.filter(c => norm(c.name) !== norm(ch.name))).slice(0, 3).map(c => c.name);
    options = shuffle([ch.name, ...others]);
    r.correct = options.indexOf(ch.name);
  }
  const dur = r.settings.time;
  r.startedAt = Date.now(); r.state = 'round';
  io.to(r.code).emit('round:start', {
    index: r.index + 1, total: r.queue.length, image: ch.image, duration: dur, mode: r.settings.mode,
    hint: r.settings.hint ? ch.anime : null, zoom: r.settings.zoom, options,
  });
  emitRoom(r);
  r.timer = setTimeout(() => endRound(r), dur * 1000 + 600);
}

const allDone = r => [...r.players.values()].every(p => p.answered || p.locked);

function endRound(r) {
  if (r.state !== 'round') return;
  clearTimeout(r.timer);
  r.state = 'between';
  const ch = r.cur;
  io.to(r.code).emit('round:end', {
    answer: { name: ch.name, native: ch.native, anime: ch.anime, image: ch.image },
    results: [...r.players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, correct: p.answered, gained: p.gained })).sort((a, b) => b.gained - a.gained),
    leaderboard: board(r), last: r.index + 1 >= r.queue.length, wait: 7,
  });
  emitRoom(r);
  r.timer = setTimeout(() => nextRound(r), 7000);
}

function endGame(r) {
  r.state = 'end';
  io.to(r.code).emit('game:end', { leaderboard: board(r) });
  emitRoom(r);
}

function processGuess(r, p, socket, value) {
  if (r.state !== 'round' || p.answered || p.locked) return;
  const ok = r.settings.mode === 'choice' ? Number(value) === r.correct : matches(value, r.cur);
  if (ok) {
    const total = r.settings.time * 1000;
    const left = Math.max(0, total - (Date.now() - r.startedAt));
    p.gained = 100 + Math.round(900 * left / total);
    p.score += p.gained; p.answered = true;
    socket.emit('guess:result', { correct: true, gained: p.gained });
  } else {
    if (r.settings.mode === 'choice') p.locked = true;
    socket.emit('guess:result', { correct: false, locked: p.locked, index: r.settings.mode === 'choice' ? Number(value) : undefined });
  }
  emitRoom(r);
  if (allDone(r)) endRound(r);
}

function leave(socket) {
  const code = socket.data.code; if (!code) return;
  socket.leave(code); socket.data.code = null;
  const r = rooms.get(code); if (!r) return;
  const p = r.players.get(socket.id); r.players.delete(socket.id);
  if (!r.players.size) { clearTimeout(r.timer); rooms.delete(code); return; }
  if (r.hostId === socket.id) r.hostId = r.players.keys().next().value;
  if (p) sys(r, `${p.name} غادر الغرفة`);
  emitRoom(r);
  if (r.state === 'round' && allDone(r)) endRound(r);
}

const mkPlayer = (socket, d) => ({ id: socket.id, name: clean(d && d.name, 16), avatar: okAvatar(d && d.avatar), score: 0, answered: false, locked: false, gained: 0 });

io.on('connection', socket => {
  let lastMsg = 0;
  const cur = () => rooms.get(socket.data.code);

  socket.on('room:create', (d, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    const p = mkPlayer(socket, d);
    if (!p.name) return cb({ error: 'اكتب اسمك أولاً' });
    leave(socket);
    const code = genCode();
    const r = { code, hostId: socket.id, state: 'lobby', players: new Map([[socket.id, p]]), timer: null, queue: [], pool: [], index: -1,
      settings: { rounds: 10, time: 20, mode: 'choice', animes: ['all'], zoom: true, hint: true } };
    rooms.set(code, r); socket.join(code); socket.data.code = code;
    cb({ ok: true, room: publicRoom(r) });
  });

  socket.on('room:join', (d, cb) => {
    cb = typeof cb === 'function' ? cb : () => {};
    const p = mkPlayer(socket, d);
    if (!p.name) return cb({ error: 'اكتب اسمك أولاً' });
    const r = rooms.get(clean(d && d.code, 5).toUpperCase());
    if (!r) return cb({ error: 'كود الغرفة غير صحيح' });
    if (r.state !== 'lobby') return cb({ error: 'اللعبة بدأت بالفعل، انتظر الجولة القادمة' });
    if (r.players.size >= 12) return cb({ error: 'الغرفة ممتلئة' });
    leave(socket);
    r.players.set(socket.id, p); socket.join(r.code); socket.data.code = r.code;
    cb({ ok: true, room: publicRoom(r) });
    sys(r, `${p.name} انضم للغرفة 👋`); emitRoom(r);
  });

  socket.on('room:settings', s => {
    const r = cur(); if (!r || r.hostId !== socket.id || r.state !== 'lobby') return;
    r.settings = sanitizeSettings(s, r.settings); emitRoom(r);
  });

  socket.on('game:start', () => {
    const r = cur(); if (!r || r.hostId !== socket.id || r.state !== 'lobby') return;
    startGame(r);
  });

  socket.on('game:restart', () => {
    const r = cur(); if (!r || r.hostId !== socket.id || r.state !== 'end') return;
    r.state = 'lobby'; r.players.forEach(p => { p.score = 0; });
    io.to(r.code).emit('game:reset'); emitRoom(r);
  });

  socket.on('guess', d => {
    const r = cur(); if (!r) return;
    const p = r.players.get(socket.id); if (!p) return;
    processGuess(r, p, socket, d && d.value);
  });

  socket.on('chat', text => {
    const r = cur(); if (!r) return;
    const p = r.players.get(socket.id); if (!p) return;
    const now = Date.now(); if (now - lastMsg < 400) return; lastMsg = now;
    text = clean(text, 140); if (!text) return;
    // منع كشف اسم الشخصية أثناء الجولة
    if (r.state === 'round' && leaks(text, r.cur)) {
      if (r.settings.mode === 'type') {
        socket.emit('notice', '🤫 رسالتك تحتوي اسم الشخصية، تم احتسابها كتخمين.');
        processGuess(r, p, socket, text);
      } else socket.emit('notice', '🚫 لا يمكن كتابة اسم الشخصية أثناء الجولة.');
      return;
    }
    io.to(r.code).emit('chat', { id: p.id, name: p.name, avatar: p.avatar, text });
  });

  socket.on('react', e => {
    const r = cur(); if (!r || !REACTS.includes(e)) return;
    const p = r.players.get(socket.id); if (!p) return;
    io.to(r.code).emit('react', { name: p.name, avatar: p.avatar, emoji: e });
  });

  socket.on('disconnect', () => leave(socket));
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
