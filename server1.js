'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { norm, words, sortedKey, lookup, partFreq } = require('./names-ar');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

/* ───────────── AniList + Cache + Fallback ───────────── */
const fs = require('fs');
const ANILIST = 'https://graphql.anilist.co';
const GAP_MS = 1100;                 // فاصل بين كل طلبات AniList
const FAIL_COOLDOWN = 90 * 1000;     // بعد فشل أنمي، لا نعيد المحاولة قبل هذه المدة
const TTL = 12 * 3600 * 1000;
const DATA_DIR = path.join(__dirname, 'data');
const DISK_FILE = path.join(DATA_DIR, 'cache.json');

const ANIME = {
  naruto:   { label: 'Naruto',            labelAr: 'ناروتو',           ids: [20, 1735] },
  dbz:      { label: 'Dragon Ball Z',     labelAr: 'دراغون بول Z',     ids: [813] },
  dbs:      { label: 'Dragon Ball Super', labelAr: 'دراغون بول سوبر',  ids: [30694] },
  onepiece: { label: 'One Piece',         labelAr: 'ون بيس',           ids: [21] },
  bleach:   { label: 'Bleach',            labelAr: 'بليتش',            ids: [269] },
};

// قائمة طوارئ ثابتة: تُستخدم فقط إن فشل AniList ولا توجد نسخة محفوظة (صور بديلة)
const BUILTIN = {
  naruto: ['Naruto Uzumaki', 'Sasuke Uchiha', 'Sakura Haruno', 'Kakashi Hatake', 'Itachi Uchiha', 'Gaara', 'Hinata Hyuuga', 'Jiraiya', 'Minato Namikaze', 'Madara Uchiha', 'Rock Lee', 'Shikamaru Nara'],
  dbz: ['Son Goku', 'Vegeta', 'Son Gohan', 'Piccolo', 'Trunks', 'Frieza', 'Cell', 'Majin Buu', 'Krillin', 'Bulma', 'Goten', 'Android 18'],
  dbs: ['Beerus', 'Whis', 'Jiren', 'Hit', 'Goku Black', 'Zamasu', 'Broly', 'Toppo', 'Kefla', 'Caulifla', 'Vados', 'Champa'],
  onepiece: ['Monkey D. Luffy', 'Roronoa Zoro', 'Nami', 'Usopp', 'Sanji', 'Tony Tony Chopper', 'Nico Robin', 'Franky', 'Brook', 'Portgas D. Ace', 'Trafalgar Law', 'Shanks'],
  bleach: ['Ichigo Kurosaki', 'Rukia Kuchiki', 'Orihime Inoue', 'Uryu Ishida', 'Yasutora Sado', 'Byakuya Kuchiki', 'Kenpachi Zaraki', 'Toshiro Hitsugaya', 'Sosuke Aizen', 'Renji Abarai', 'Grimmjow Jaegerjaquez', 'Ulquiorra Cifer'],
};
const KEYS = Object.keys(ANIME);
const withTimeout = (p, ms, fb) => Promise.race([p, new Promise(r => setTimeout(() => r(fb()), ms))]);

function placeholderImg(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#ff4fa3"/></linearGradient></defs><rect width="200" height="300" fill="url(#g)"/><text x="100" y="175" font-size="120" text-anchor="middle" fill="#fff" fill-opacity=".85" font-family="sans-serif" font-weight="800">?</text><text x="100" y="270" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* إضافة الاسم العربي والمفاتيح المقبولة في التخمين لكل شخصية */
const STOP = new Set(['دي', 'من', 'the', 'and']);
const isAr = w => /[\u0621-\u064A]/.test(w);
const missing = new Set();
function decorate(c, key) {
  const e = lookup(c.name);
  if (!e && !missing.has(c.name)) { missing.add(c.name); console.log('No Arabic name for:', c.name, '(أضفه في names-ar.js)'); }
  const keys = new Set([norm(c.name)]), parts = new Set();
  const addParts = str => words(str).forEach(w => { if (w.length >= (isAr(w) ? 3 : 4) && !STOP.has(w) && (partFreq.get(w) || 0) <= 1) parts.add(w); });
  addParts(c.name);
  const all = e ? [e.ar, ...e.aliases, ...e.en] : [];
  all.forEach(x => { keys.add(norm(x)); addParts(x); });
  return { ...c, ar: e ? e.ar : c.name, hasAr: !!e, anime: ANIME[key].labelAr,
    keys: [...keys].filter(Boolean), skeys: [...new Set([c.name, ...all].map(sortedKey))].filter(Boolean), parts: [...parts] };
}
function builtin(key) {
  const k = KEYS.indexOf(key), img = placeholderImg(ANIME[key].labelAr);
  return BUILTIN[key].map((name, i) => decorate({ id: -(k * 100 + i + 1), name, native: '', image: img, anime: ANIME[key].label, fallback: true }, key));
}

/* أفتارات بديلة: SVG يُولَّد من السيرفر (رمز لكل أنمي × ألوان متعددة) */
const AV_EMOJI = { naruto: '🍥', dbz: '🐉', dbs: '⚡', onepiece: '🏴‍☠️', bleach: '⚔️' };
app.get('/fb/av.svg', (req, res) => {
  const c = Math.min(999, parseInt(req.query.c) || 0), e = Math.min(KEYS.length - 1, parseInt(req.query.e) || 0);
  const h1 = (c * 47) % 360, h2 = (h1 + 70) % 360;
  res.type('image/svg+xml').set('Cache-Control', 'public,max-age=86400').send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},80%,58%)"/><stop offset="1" stop-color="hsl(${h2},75%,38%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="3"/><text x="50" y="66" font-size="46" text-anchor="middle">${AV_EMOJI[KEYS[e]]}</text></svg>`);
});
const fallbackAvatars = () => KEYS.flatMap((k, ki) => Array.from({ length: 8 }, (_, i) => ({
  name: `${ANIME[k].labelAr} ${i + 1}`, image: `/fb/av.svg?c=${ki * 8 + i}&e=${ki}`, group: 'بديلة' })));

const cache = new Map();     // mediaId -> { at, chars }   (at=0 تعني قديمة/من القرص)
const failUntil = new Map(); // mediaId -> timestamp
const inflight = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* قرص: تحميل وحفظ (اختياري، لا يوقف اللعبة إن فشل) */
try {
  const saved = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8'));
  for (const [id, v] of Object.entries(saved)) if (v && Array.isArray(v.chars) && v.chars.length) cache.set(Number(id), { at: v.at || 0, chars: v.chars });
  console.log(`Loaded ${cache.size} media from disk cache`);
} catch (e) { /* لا يوجد ملف بعد */ }
let saveT;
function saveDisk(now = false) {
  const write = () => new Promise(resolve => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const obj = {}; cache.forEach((v, id) => { obj[id] = v; });
      fs.writeFile(DISK_FILE, JSON.stringify(obj), () => resolve());
    } catch (e) { resolve(); }
  });
  if (now) return write();
  clearTimeout(saveT); saveT = setTimeout(write, 2000);
}

/* طابور عام: طلب واحد كل GAP_MS كحد أدنى */
let chain = Promise.resolve();
function throttled(fn) {
  const run = chain.then(async () => { await sleep(GAP_MS); return fn(); });
  chain = run.catch(() => {});
  return run;
}

const QUERY = `query($id:Int){Media(id:$id,type:ANIME){id characters(sort:FAVOURITES_DESC,perPage:50,page:1){nodes{id name{full native} image{large}}}}}`;

async function anilist(id, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await throttled(() => fetch(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { id } }),
        signal: AbortSignal.timeout(12000),
      }));
      if (r.status === 429) {
        const wait = Math.min(15, Number(r.headers.get('retry-after')) || 5);
        console.log(`AniList 429 (id ${id}) — waiting ${wait}s`);
        await sleep(wait * 1000); lastErr = new Error('429'); continue;
      }
      if (!r.ok) { console.log(`AniList HTTP ${r.status} (id ${id})`); lastErr = new Error('HTTP ' + r.status); await sleep(1000 * (i + 1)); continue; }
      const j = await r.json();
      if (j.errors) throw new Error(j.errors[0].message);
      return j.data.Media;
    } catch (e) { lastErr = e; console.log(`AniList error (id ${id}, try ${i + 1}): ${e.message}`); await sleep(800 * (i + 1)); }
  }
  throw lastErr || new Error('AniList unavailable');
}

// لا ترمي أخطاء أبداً: تُرجع { chars, live }
async function loadMedia(id, label, force = false) {
  const hit = cache.get(id);
  if (hit && hit.at && Date.now() - hit.at < TTL) return { chars: hit.chars, live: true };
  if (!force && Date.now() < (failUntil.get(id) || 0)) return { chars: hit ? hit.chars : [], live: false };
  if (inflight.has(id)) return inflight.get(id);
  const p = (async () => {
    try {
      const m = await anilist(id);
      const chars = m.characters.nodes
        .filter(c => c.image && c.image.large && !/default/i.test(c.image.large))
        .map(c => ({ id: c.id, name: c.name.full, native: c.name.native || '', image: c.image.large, anime: label }));
      if (!chars.length) throw new Error('empty');
      cache.set(id, { at: Date.now(), chars }); failUntil.delete(id); saveDisk();
      return { chars, live: true };
    } catch (e) {
      failUntil.set(id, Date.now() + FAIL_COOLDOWN);
      console.log(`Using stale/fallback for media ${id}: ${e.message}`);
      return { chars: hit ? hit.chars : [], live: false };
    }
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

// تُرجع مصفوفة شخصيات دائماً (حتى لو فشل AniList كلياً). degraded=true إن استُخدم بديل.
async function loadPool(keys) {
  const list = keys.includes('all') ? KEYS : keys.filter(k => ANIME[k]);
  const out = [], seen = new Set();
  let degraded = false;
  for (const k of list) {
    let got = 0;
    for (const id of ANIME[k].ids) {
      const { chars, live } = await loadMedia(id, ANIME[k].label);
      if (!live) degraded = true;
      for (const c of chars) if (!seen.has(c.id)) { seen.add(c.id); out.push(decorate(c, k)); got++; }
    }
    if (!got) for (const c of builtin(k)) { seen.add(c.id); out.push(c); degraded = true; }
  }
  out.degraded = degraded;
  return out;
}

let avatarCache = null, lastRefresh = 0;
app.get('/api/avatars', async (req, res) => {
  try {
    if (req.query.refresh && Date.now() - lastRefresh > 15000) { lastRefresh = Date.now(); avatarCache = null; failUntil.clear(); }
    if (!avatarCache || Date.now() > avatarCache.until) {
      const items = []; let degraded = false;
      await withTimeout((async () => {
        for (const k of KEYS) {
          const pool = await loadPool([k]); degraded = degraded || pool.degraded;
          pool.filter(c => !c.fallback).slice(0, 16).forEach(c => items.push({ name: c.hasAr ? c.ar : c.name, image: c.image, group: ANIME[k].labelAr }));
        }
      })(), 12000, () => { degraded = true; });
      avatarCache = { items, until: Date.now() + (degraded || items.length < 20 ? 60 * 1000 : TTL) };
    }
    res.json([...avatarCache.items, ...fallbackAvatars()]);
  } catch (e) { res.json(fallbackAvatars()); }
});

// تسخين الكاش عند التشغيل (الطابور العام يضمن الفاصل الزمني)
async function prewarm() {
  for (const k of KEYS) await loadPool([k]);
  console.log('AniList prewarm finished');
}

// وضع التعبئة: node server.js --seed  → يكتب data/cache.json لترفعه مع المشروع كنسخة احتياطية حقيقية
if (process.argv.includes('--seed')) {
  (async () => {
    for (const k of KEYS) for (const id of ANIME[k].ids) {
      const r = await loadMedia(id, ANIME[k].label, true);
      console.log(`${ANIME[k].label} (${id}): ${r.live ? 'OK' : 'FAILED'} — ${r.chars.length} characters`);
    }
    await saveDisk(true);
    console.log('Saved to', DISK_FILE); process.exit(0);
  })();
} else {
  prewarm();
}

/* ───────────── أدوات ───────────── */
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// يقبل: الاسم العربي الكامل، الأسماء البديلة، الاسم الإنجليزي، الكلمة المميزة (مع تسامح بحرف واحد للأسماء الطويلة)
function matches(guess, ch) {
  const g = norm(guess); if (!g) return false;
  if (ch.keys.includes(g) || ch.skeys.includes(sortedKey(guess))) return true;
  if (g.length >= 6 && ch.keys.some(k => k.length >= 6 && lev(g, k) <= 1)) return true;
  return ch.parts.some(p => g === p || (p.length >= 5 && lev(g, p) <= 1));
}
// هل تكشف الرسالة اسم الشخصية (بأي لغة)؟
function leaks(text, ch) {
  const compact = norm(text);
  if (ch.keys.some(k => k.length >= 4 && compact.includes(k))) return true;
  const w = words(text);
  return ch.parts.some(p => w.includes(p) || (p.length >= 5 && w.some(x => lev(x, p) <= 1)));
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
const okAvatar = u => (typeof u === 'string' && u.length < 300 && (u.startsWith('https://s4.anilist.co/') || /^\/fb\/av\.svg\?c=\d{1,3}&e=\d$/.test(u))) ? u : null;
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
  const keysSel = r.settings.animes.includes('all') ? KEYS : r.settings.animes;
  let pool = await withTimeout(loadPool(r.settings.animes), 15000, () => { const b = keysSel.flatMap(builtin); b.degraded = true; return b; });
  if (!rooms.has(r.code) || !r.players.size) return;
  // الأولوية: صور حقيقية + أسماء عربية، ثم أسماء عربية، ثم صور حقيقية
  const realAr = pool.filter(c => !c.fallback && c.hasAr), ar = pool.filter(c => c.hasAr), real = pool.filter(c => !c.fallback);
  pool = realAr.length >= 8 ? realAr : (ar.length >= 8 ? ar : (real.length >= 8 ? real : pool));
  r.pool = pool;
  if (pool.some(c => c.fallback)) io.to(r.code).emit('notice', '⚠️ AniList غير متاح حالياً، تم استخدام قائمة احتياطية (صور بديلة).');
  r.players.forEach(p => { p.score = 0; });
  r.queue = shuffle(r.pool).slice(0, Math.min(r.settings.rounds, r.pool.length));
  r.index = -1;
  nextRound(r);
}

function nextRound(r) {
  clearTimeout(r.timer);
  if (!r.players.size) return;
  r.index++;
  if (r.index >= r.queue.length) return endGame(r);
  const ch = r.cur = r.queue[r.index];
  r.players.forEach(p => { p.answered = false; p.locked = false; p.gained = 0; });
  let options = null;
  if (r.settings.mode === 'choice') {
    const others = [], used = new Set([norm(ch.ar)]);
    for (const c of shuffle(r.pool)) { const k = norm(c.ar); if (!used.has(k)) { used.add(k); others.push(c.ar); if (others.length === 3) break; } }
    options = shuffle([ch.ar, ...others]);
    r.correct = options.indexOf(ch.ar);
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
    answer: { name: ch.ar, en: ch.hasAr ? ch.name : '', native: ch.native, anime: ch.anime, image: ch.image },
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
  if (!r.players.size) { clearTimeout(r.timer); rooms.delete(code); return; }   // آخر لاعب غادر: إغلاق الغرفة
  const wasHost = r.hostId === socket.id;
  if (wasHost) r.hostId = r.players.keys().next().value;                          // تسليم الاستضافة تلقائياً
  if (p) {
    sys(r, `🚪 ${p.name} غادر الغرفة`);
    io.to(r.code).emit('notice', `🚪 ${p.name} غادر الغرفة`);
  }
  if (wasHost) {
    const nh = r.players.get(r.hostId);
    sys(r, `👑 ${nh.name} أصبح المضيف الجديد`);
    io.to(r.hostId).emit('notice', '👑 أصبحت أنت المضيف الجديد للغرفة');
  }
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

  socket.on('room:leave', () => leave(socket));

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
