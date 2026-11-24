'use strict';
const $ = s => document.querySelector(s);
const socket = io();
const ANIMES = { naruto: 'ناروتو', dbz: 'دراغون بول Z', dbs: 'دراغون بول سوبر', onepiece: 'ون بيس', bleach: 'بليتش' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

let room = null, inRoom = false, lastEnd = null, avatar = null, tick = null, answered = false, roundEndsAt = 0;

/* ── الصوت ── */
let muted = store.get('muted') === '1', actx;
function beep(f, d = .12, type = 'sine', v = .05, delay = 0) {
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d);
  } catch {}
}
const sfx = {
  ok: () => { beep(660); beep(880, .2, 'sine', .05, .1); },
  bad: () => beep(180, .25, 'sawtooth', .035),
  tick: () => beep(900, .05, 'square', .015),
  pop: () => beep(520, .08),
  start: () => { beep(440); beep(660, .1, 'sine', .05, .1); beep(880, .22, 'sine', .05, .2); },
  end: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, .25, 'sine', .05, i * .12)); },
};
$('#muteBtn').textContent = muted ? '🔇' : '🔊';
$('#muteBtn').onclick = () => { muted = !muted; store.set('muted', muted ? '1' : '0'); $('#muteBtn').textContent = muted ? '🔇' : '🔊'; };

/* ── أدوات واجهة ── */
function show(id) {
  document.querySelectorAll('.screen').forEach(e => e.classList.toggle('active', e.id === id));
  $('#room').classList.toggle('hidden', id === 'home');
}
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3000); }
function ava(p, cls = '') {
  return `<span class="ava ${cls}">${p.avatar ? `<img src="${esc(p.avatar)}" referrerpolicy="no-referrer" alt="">` : esc((p.name || '?')[0])}</span>`;
}
const isHost = () => room && room.hostId === socket.id;

/* ── الشاشة الرئيسية ── */
$('#nameInput').value = store.get('name');
const qCode = new URLSearchParams(location.search).get('room');
if (qCode) $('#codeInput').value = qCode.toUpperCase().slice(0, 5);

/* ── منتقي الأفتارات ── */
let avList = [], avGroup = 'الكل';
const avImg = (url, name) => `<img src="${esc(url)}" referrerpolicy="no-referrer" alt="${esc(name)}" loading="lazy">`;
function avPreview() {
  const a = avList.find(x => x.image === avatar);
  $('#avPrev').innerHTML = avatar ? avImg(avatar, a ? a.name : '') : '?';
  $('#avPrevName').textContent = a ? a.name : 'لم تختر أفتاراً بعد';
  $('#avPrevGroup').textContent = a ? a.group : '';
}
function avRender() {
  const groups = ['الكل', ...new Set(avList.map(a => a.group))];
  if (!groups.includes(avGroup)) avGroup = 'الكل';
  $('#avTabs').innerHTML = groups.map(g => `<button type="button" class="chip ${g === avGroup ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
  const list = avGroup === 'الكل' ? avList : avList.filter(a => a.group === avGroup);
  $('#avatarGrid').innerHTML = list.map(a => `<button type="button" class="av ${a.image === avatar ? 'sel' : ''}" data-url="${esc(a.image)}" title="${esc(a.name)}" aria-label="${esc(a.name)}">${avImg(a.image, a.name)}</button>`).join('');
}
function avSelect(url) {
  avatar = url; avPreview();
  document.querySelectorAll('.av').forEach(b => b.classList.toggle('sel', b.dataset.url === url));
}
async function loadAvatars(refresh) {
  const btn = $('#avReload'), grid = $('#avatarGrid');
  btn.disabled = true; grid.innerHTML = '<span class="muted">جارٍ تحميل الأفتارات من AniList...</span>';
  try {
    const r = await fetch('/api/avatars' + (refresh ? '?refresh=1' : '')); if (!r.ok) throw 0;
    avList = await r.json();
    const saved = store.get('avatar');
    avRender();
    const keep = avList.find(a => a.image === avatar) || avList.find(a => a.image === saved) || avList[0];
    if (keep) avSelect(keep.image); else avPreview();
  } catch {
    avList = []; grid.innerHTML = '<span class="muted">تعذّر تحميل الأفتارات. اضغط «تحديث» للمحاولة (يمكنك اللعب بدونها).</span>';
  }
  setTimeout(() => { btn.disabled = false; }, 1500);
}
$('#avatarGrid').onclick = e => { const b = e.target.closest('.av'); if (b) { avSelect(b.dataset.url); sfx.pop(); } };
$('#avTabs').onclick = e => { const b = e.target.closest('.chip'); if (b) { avGroup = b.dataset.g; avRender(); } };
$('#avRandom').onclick = () => {
  const list = avGroup === 'الكل' ? avList : avList.filter(a => a.group === avGroup);
  if (!list.length) return; avSelect(list[Math.floor(Math.random() * list.length)].image); sfx.pop();
  document.querySelector('.av.sel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
};
$('#avReload').onclick = () => loadAvatars(true);
loadAvatars();

function identity() {
  const name = $('#nameInput').value.trim();
  if (!name) { toast('اكتب اسمك أولاً'); $('#nameInput').focus(); return null; }
  store.set('name', name); if (avatar) store.set('avatar', avatar);
  return { name, avatar };
}
function enter(res) {
  if (res.error) return toast(res.error);
  inRoom = true; room = res.room; $('#msgs').innerHTML = ''; show('lobby'); renderRoom(); sfx.pop();
  history.replaceState(null, '', location.pathname);
}
$('#createBtn').onclick = () => { const id = identity(); if (id) socket.emit('room:create', id, enter); };
$('#joinBtn').onclick = () => {
  const id = identity(); if (!id) return;
  const code = $('#codeInput').value.trim().toUpperCase();
  if (code.length < 5) return toast('أدخل كود الغرفة (5 أحرف)');
  socket.emit('room:join', { ...id, code }, enter);
};
$('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });

/* ── مغادرة الغرفة والعودة للقائمة الرئيسية ── */
function resetHome() {
  inRoom = false; room = null; lastEnd = null; answered = false; stopTimer();
  $('#msgs').innerHTML = ''; $('#players').innerHTML = ''; $('#reveal').classList.add('hidden');
  show('home'); history.replaceState(null, '', location.pathname);
}
function leaveRoom() {
  if (room && ['loading', 'round', 'between'].includes(room.state) && !confirm('اللعبة جارية. هل تريد المغادرة والعودة للقائمة الرئيسية؟')) return;
  socket.emit('room:leave'); resetHome();
}
$('#leaveBtn').onclick = leaveRoom;

/* ── اللوبي والإعدادات ── */
function copy(text, msg) {
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg)).catch(() => {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); toast(msg); } catch { toast(text); } t.remove();
  });
}
$('#copyCode').onclick = () => copy(room.code, 'تم نسخ الكود ✅');
$('#copyLink').onclick = () => copy(`${location.origin}/?room=${room.code}`, 'تم نسخ رابط الدعوة ✅');

function renderSettings() {
  const s = room.settings, dis = isHost() ? '' : 'disabled';
  const sel = (id, opts, val) => `<select id="${id}" ${dis}>${opts.map(o => `<option value="${o[0]}" ${String(o[0]) === String(val) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  const all = s.animes.includes('all');
  $('#settings').innerHTML = `
    <div class="grid2">
      <label>عدد الجولات${sel('sRounds', [5, 10, 15, 20, 30].map(n => [n, n]), s.rounds)}</label>
      <label>زمن الجولة (ثانية)${sel('sTime', [10, 15, 20, 30].map(n => [n, n]), s.time)}</label>
      <label>نمط الإجابة${sel('sMode', [['choice', '4 اختيارات'], ['type', 'كتابة الاسم']], s.mode)}</label>
    </div>
    <label>الأنمي</label>
    <div class="chips">
      <button type="button" class="chip ${all ? 'on' : ''}" data-k="all" ${dis}>الكل</button>
      ${Object.entries(ANIMES).map(([k, v]) => `<button type="button" class="chip ${!all && s.animes.includes(k) ? 'on' : ''}" data-k="${k}" ${dis}>${v}</button>`).join('')}
    </div>
    <label class="chk"><input type="checkbox" id="sZoom" ${s.zoom ? 'checked' : ''} ${dis}> تأثير التقريب (Zoom يبتعد تدريجياً)</label>
    <label class="chk"><input type="checkbox" id="sHint" ${s.hint ? 'checked' : ''} ${dis}> تلميح باسم الأنمي</label>`;
}
function pushSettings(animes) {
  socket.emit('room:settings', {
    rounds: +$('#sRounds').value, time: +$('#sTime').value, mode: $('#sMode').value,
    zoom: $('#sZoom').checked, hint: $('#sHint').checked, animes: animes || room.settings.animes,
  });
}
$('#settings').addEventListener('change', e => { if (isHost() && e.target.closest('select,input')) pushSettings(); });
$('#settings').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b || !isHost()) return;
  const k = b.dataset.k; let cur = room.settings.animes.filter(x => x !== 'all');
  if (k === 'all') cur = ['all'];
  else { cur = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]; if (!cur.length) cur = ['all']; }
  pushSettings(cur);
});
$('#startBtn').onclick = () => { $('#startBtn').disabled = true; socket.emit('game:start'); };

function renderRoom() {
  if (!room) return;
  $('#roomCode').textContent = room.code; $('#roomTag').textContent = `غرفة ${room.code}`;
  const host = isHost();
  $('#startBtn').classList.toggle('hidden', !host);
  $('#startBtn').disabled = room.state !== 'lobby';
  $('#waitMsg').textContent = host ? '' : '⏳ بانتظار المضيف ليبدأ اللعبة...';
  renderSettings();
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  $('#players').innerHTML = sorted.map(p => `<li>${ava(p)}<span class="nm">${esc(p.name)}${p.id === room.hostId ? ' 👑' : ''}${p.id === socket.id ? ' (أنت)' : ''}</span>
    ${room.state === 'round' && p.answered ? '<span class="tick">✔</span>' : ''}<span class="pts">${p.score}</span></li>`).join('');
}
socket.on('room:update', r => {
  if (!inRoom) return;
  room = r; renderRoom();
  if ($('#end').classList.contains('active')) renderEnd();
  if (r.state === 'lobby' && !$('#lobby').classList.contains('active') && !$('#home').classList.contains('active')) show('lobby');
});

/* ── الجولة ── */
function stopTimer() { clearInterval(tick); tick = null; }

socket.on('game:loading', () => toast('⏳ جارٍ تجهيز الشخصيات...'));
socket.on('notice', t => { toast(t); renderRoom(); });

socket.on('round:start', d => {
  show('game'); sfx.start(); answered = false; stopTimer();
  $('#reveal').classList.add('hidden'); $('#play').classList.remove('hidden');
  $('#roundLbl').textContent = `الجولة ${d.index} / ${d.total}`;
  const hint = $('#hintChip'); hint.classList.toggle('hidden', !d.hint); if (d.hint) hint.textContent = `💡 ${d.hint}`;
  const st = $('#status'); st.textContent = ''; st.className = 'status';

  const img = $('#charImg');
  img.style.transition = 'none';
  img.style.transformOrigin = `${20 + Math.random() * 60}% ${20 + Math.random() * 60}%`;
  img.style.transform = d.zoom ? 'scale(5)' : 'none';
  img.onload = () => {
    if (!d.zoom) return;
    void img.offsetWidth;
    img.style.transition = `transform ${d.duration * .9}s cubic-bezier(.2,.6,.3,1)`;
    img.style.transform = 'scale(1)';
  };
  img.src = d.image;

  const opts = $('#options'), form = $('#typeForm');
  if (d.mode === 'choice') {
    form.classList.add('hidden'); opts.classList.remove('hidden');
    opts.innerHTML = d.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('');
  } else {
    opts.classList.add('hidden'); opts.innerHTML = ''; form.classList.remove('hidden');
    $('#typeInput').value = ''; $('#typeInput').disabled = false; form.querySelector('button').disabled = false;
    setTimeout(() => $('#typeInput').focus({ preventScroll: true }), 50);
  }

  const bar = $('#barFill');
  bar.style.transition = 'none'; bar.style.width = '100%'; void bar.offsetWidth;
  bar.style.transition = `width ${d.duration}s linear`; bar.style.width = '0%';
  roundEndsAt = Date.now() + d.duration * 1000;
  const lbl = $('#timeLbl');
  const upd = () => {
    const left = Math.max(0, Math.ceil((roundEndsAt - Date.now()) / 1000));
    lbl.textContent = left; lbl.classList.toggle('low', left <= 5);
    if (left <= 5 && left > 0 && !answered) sfx.tick();
    if (left <= 0) stopTimer();
  };
  upd(); tick = setInterval(upd, 1000);
});

function lockInputs() {
  document.querySelectorAll('.opt').forEach(b => b.disabled = true);
  $('#typeInput').disabled = true; $('#typeForm button').disabled = true;
}
$('#options').addEventListener('click', e => {
  const b = e.target.closest('.opt'); if (!b || answered) return;
  socket.emit('guess', { value: +b.dataset.i });
  document.querySelectorAll('.opt').forEach(x => x.disabled = true);
  b.classList.add('pending');
});
$('#typeForm').addEventListener('submit', e => {
  e.preventDefault(); const v = $('#typeInput').value.trim(); if (!v || answered) return;
  socket.emit('guess', { value: v });
});
socket.on('guess:result', r => {
  const st = $('#status');
  if (r.correct) {
    answered = true; lockInputs(); sfx.ok();
    st.className = 'status ok'; st.textContent = `✅ إجابة صحيحة! +${r.gained} نقطة`;
    document.querySelector('.opt.pending')?.classList.add('good');
  } else {
    sfx.bad();
    if (r.locked) {
      answered = true; lockInputs();
      document.querySelector('.opt.pending')?.classList.replace('pending', 'bad');
      st.className = 'status bad'; st.textContent = '❌ إجابة خاطئة، انتظر نهاية الجولة';
    } else {
      st.className = 'status bad'; st.textContent = '❌ جرّب مرة أخرى';
      const inp = $('#typeInput'); inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.select();
    }
  }
});

socket.on('round:end', d => {
  stopTimer(); lockInputs();
  $('#play').classList.add('hidden');
  const rv = $('#reveal'); rv.classList.remove('hidden');
  rv.innerHTML = `<div class="reveal">
    <div class="pic"><img src="${esc(d.answer.image)}" referrerpolicy="no-referrer" alt=""></div>
    <h2>${esc(d.answer.name)}</h2>
    <div class="jp">${[d.answer.en, d.answer.native, d.answer.anime].filter(Boolean).map(esc).join(' • ')}</div>
    <ul class="lb">${d.results.map(p => `<li>${ava(p)}<span class="nm">${esc(p.name)}</span>
      ${p.correct ? `<span class="gain">+${p.gained}</span>` : '<span class="muted">—</span>'}</li>`).join('')}</ul>
    <h3>🏆 المتصدرون</h3>
    <ul class="lb">${d.leaderboard.slice(0, 5).map((p, i) => `<li><span class="rk">${i + 1}</span>${ava(p)}<span class="nm">${esc(p.name)}</span><span class="tot">${p.score}</span></li>`).join('')}</ul>
    <div class="nextin">${d.last ? 'النتائج النهائية بعد لحظات...' : 'الجولة التالية بعد <b id="cd">' + d.wait + '</b> ث'}</div></div>`;
  let n = d.wait; const cd = setInterval(() => { n--; const el = $('#cd'); if (!el || n < 0) return clearInterval(cd); el.textContent = n; }, 1000);
});

function renderEnd() {
  if (!lastEnd) return;
  const top = lastEnd.leaderboard, order = [top[1], top[0], top[2]].map((p, i) => p && { p, c: ['p2', 'p1', 'p3'][i], m: ['🥈', '🥇', '🥉'][i] }).filter(Boolean);
  $('#endBox').innerHTML = `<h3 class="center" style="font-size:1.5rem">🎉 انتهت اللعبة!</h3>
    <div class="podium">${order.map(o => `<div class="${o.c}">${ava(o.p, 'lg')}<b>${esc(o.p.name)}</b><div>${o.m} ${o.p.score}</div></div>`).join('')}</div>
    <ul class="lb">${top.map((p, i) => `<li><span class="rk">${i + 1}</span>${ava(p)}<span class="nm">${esc(p.name)}</span><span class="tot">${p.score}</span></li>`).join('')}</ul>
    ${isHost() ? '<button id="againBtn" class="btn primary">🔁 العب مرة أخرى</button>' : '<p class="muted center">بانتظار المضيف لإعادة اللعب...</p>'}
    <button id="leaveEnd" class="btn leave" style="width:100%;margin-top:10px">🏠 العودة للقائمة الرئيسية</button>`;
  $('#againBtn')?.addEventListener('click', () => socket.emit('game:restart'));
  $('#leaveEnd').addEventListener('click', leaveRoom);
}
socket.on('game:end', d => { lastEnd = d; show('end'); sfx.end(); renderEnd(); });
socket.on('game:reset', () => { show('lobby'); renderRoom(); });

/* ── الشات والرياكشنات ── */
function addMsg(m) {
  const box = $('#msgs'), d = document.createElement('div');
  d.className = 'msg' + (m.system ? ' sys' : '');
  d.innerHTML = m.system ? esc(m.text) : `${ava(m)}<div><b>${esc(m.name)}</b>${esc(m.text)}</div>`;
  box.appendChild(d);
  while (box.children.length > 80) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}
socket.on('chat', m => { addMsg(m); if (!m.system && m.id !== socket.id) sfx.pop(); });
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault(); const v = $('#chatInput').value.trim(); if (!v) return;
  socket.emit('chat', v); $('#chatInput').value = '';
});
document.querySelector('.reacts').addEventListener('click', e => { const b = e.target.closest('button'); if (b) socket.emit('react', b.dataset.e); });
socket.on('react', d => {
  const el = document.createElement('div'); el.className = 'fl';
  el.style.left = (8 + Math.random() * 78) + '%';
  el.innerHTML = `<span>${esc(d.emoji)}</span><small>${esc(d.name)}</small>`;
  $('#floaters').appendChild(el); setTimeout(() => el.remove(), 2700); sfx.pop();
});

/* ── انقطاع الاتصال ── */
socket.on('disconnect', () => {
  if (inRoom) { toast('انقطع الاتصال بالسيرفر، تمت العودة للقائمة الرئيسية'); resetHome(); }
});
