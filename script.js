/* ==========================================================
   Selfora – Tahap 2 (Supabase: Auth + Postgres + RLS + Realtime)
   Semua data tersimpan di database. Hak akses dijaga oleh
   Row Level Security di supabase/schema.sql, bukan hanya UI.
   ========================================================== */
const CFG = window.DEARME_CONFIG || {};
const READY = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('GANTI') && window.supabase;
const sb = READY ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;
let ME = null, curView = 'home', MCACHE = null, chan = null;

/* ---------- Helper ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('sv-SE');
const fmt = d => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const run = async p => { const { data, error } = await p; if (error) throw error; return data; };
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
const go = p => { if (location.hash === '#/' + p) route(); else location.hash = '#/' + p; };
const homeOf = u => u.role === 'konselor' ? 'konselor' : u.role === 'admin' ? 'admin' : 'dashboard';
const MSG_ORDER = q => q.order('created_at', { ascending: false }).order('created_at', { referencedTable: 'replies', ascending: true });

/* ---------- Auth (Supabase Auth) ---------- */
const ROLE_LABEL = { mahasiswa: 'Mahasiswa', konselor: 'Konselor / Dosen BK', admin: 'Admin' };
const ROLE_ICON = { mahasiswa: '🎓', konselor: '🤝', admin: '🛡️' };
const Auth = {
  async init() { const { data } = await sb.auth.getSession(); await this.load(data.session); },
  async load(session) {
    ME = null; if (!session) return;
    const p = await run(sb.from('profiles').select('id,name,role').eq('id', session.user.id).maybeSingle());
    if (p) ME = { ...p, email: session.user.email };
  },
  async register({ name, email, password, role, code }) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name, role, code } } });
    if (error) throw Error(role === 'konselor' ? 'Pendaftaran gagal. Periksa kode registrasi konselor atau gunakan email lain.' : error.message.includes('registered') ? 'Email sudah terdaftar. Silakan masuk.' : 'Pendaftaran gagal: ' + error.message);
    if (!data.session) return { confirm: true };
    await this.load(data.session); return ME;
  },
  async login(email, password, role) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw Error(/confirm/i.test(error.message) ? 'Email belum dikonfirmasi. Cek kotak masuk emailmu.' : 'Email atau kata sandi salah.');
    await this.load(data.session);
    if (!ME) { await this.logout(); throw Error('Profil akun tidak ditemukan. Coba daftar ulang.'); }
    if (role && ME.role !== role) { const asal = ROLE_LABEL[ME.role] || ME.role; await this.logout(); throw Error('Akun ini terdaftar sebagai ' + asal + ', bukan ' + ROLE_LABEL[role] + '. Pilih peran yang sesuai.'); }
    return ME;
  },
  async logout() { stopRealtime(); await sb.auth.signOut(); ME = null; MCACHE = null; }
};

/* Materi dibaca dari database; jika masih kosong, pakai data cadangan (materi-data.js) */
async function getMateri() {
  if (!MCACHE) { const d = await run(sb.from('materials').select('*').order('id')); MCACHE = d.length ? d : MATERI; }
  return MCACHE;
}

/* ---------- Notifikasi ---------- */
async function countUnread() {
  const q = ME.role === 'konselor' ? sb.from('messages').select('id', { count: 'exact', head: true }).eq('counselor_seen', false)
    : sb.from('replies').select('id', { count: 'exact', head: true }).eq('seen', false);
  const { count } = await q; return count || 0;
}
async function refreshBadges() {
  ['#fbDot', '#dashDot'].forEach(s => { const e = $(s); if (e) e.hidden = true; });
  if (!ME) return;
  const n = await countUnread(), e = $(ME.role === 'konselor' ? '#dashDot' : '#fbDot');
  if (e && n) { e.textContent = n; e.hidden = false; }
}
async function notifyUnread() {
  const n = await countUnread();
  if (n) toast(ME.role === 'konselor' ? `📩 ${n} pesan baru belum dibaca.` : `💬 ${n} balasan baru dari konselor.`);
}
function stopRealtime() { if (chan) { sb.removeChannel(chan); chan = null; } }
function startRealtime() {
  stopRealtime(); if (!ME) return;
  chan = sb.channel('dearme-' + ME.id);
  if (ME.role === 'konselor') chan.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
    toast('📩 Pesan baru dari ' + (p.new.student_name || 'mahasiswa')); refreshBadges();
    if (curView === 'konselor' && !$('#view-konselor details[open]')) Render.konselor();
  });
  else chan.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies' }, () => {
    toast('💬 Konselor membalas pesanmu. Buka Ruang Umpan Balik.'); refreshBadges();
    if (curView === 'umpanbalik' && !$('#fbList details[open]')) Render.umpanbalik();
  });
  chan.subscribe();
}

/* ---------- Router ---------- */
async function route() {
  const [v, param] = location.hash.replace('#/', '').split('/');
  let view = $('#view-' + v) ? v : 'home';
  const studentOnly = ['dashboard', 'materi', 'refleksi', 'jurnal', 'umpanbalik'];
  if (studentOnly.includes(view) && (!ME || ME.role !== 'mahasiswa')) {
    if (ME) view = homeOf(ME); else { view = 'login'; toast('Silakan masuk terlebih dahulu.'); }
  }
  if (view === 'konselor' && (!ME || ME.role !== 'konselor')) view = ME ? homeOf(ME) : 'login';
  if (view === 'admin' && (!ME || ME.role !== 'admin')) view = ME ? homeOf(ME) : 'login';
  curView = view;
  $$('.view').forEach(e => e.hidden = e.id !== 'view-' + view);
  $$('#menu [data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === view));
  updateNav(); scrollTo(0, 0);
  $('#menu').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
  try { await Render[view]?.(param); } catch (e) { console.error(e); toast('Terjadi kendala: ' + e.message); }
  refreshBadges();
}
function updateNav() {
  $('#authBtn').textContent = ME ? 'Keluar' : 'Masuk';
  $$('[data-role]').forEach(b => b.hidden = !(ME && ME.role === b.dataset.role));
  const d = $('#dashBtn'); d.hidden = !ME;
  if (ME) { d.dataset.go = homeOf(ME); d.innerHTML = ({ konselor: 'Dashboard BK', admin: 'Dashboard Admin' }[ME.role] || 'Dashboard') + ' <span class="dot" id="dashDot" hidden></span>'; }
  $$('.app-name').forEach(e => e.textContent = 'Selfora');
}

/* ---------- Renderer ---------- */
const replyHtml = r => `<div class="reply"><b>💬 ${esc(r.counselor_name || 'Konselor BK')}</b> · <time>${fmt(r.created_at)}</time><p>${esc(r.body)}</p></div>`;
const statusBadge = m => `<span class="badge ${m.status === 'dibalas' ? 'ok' : ''}">${m.status === 'dibalas' ? 'Sudah Dibalas' : 'Menunggu Balasan'}</span>`;

let ADM_MAT = [];
function matForm(m) {
  m = m || { id: 0, icon: '📘', title: '', intro: '', body: [], example: '', q: [] };
  const f = $('#matForm');
  f.innerHTML = `<div class="card"><h3>${m.id ? 'Ubah materi' : 'Materi baru'}</h3>
    <label>Ikon (emoji)<input id="mIcon" maxlength="4" value="${esc(m.icon)}"></label>
    <label>Judul<input id="mTitle" maxlength="120" value="${esc(m.title)}"></label>
    <label>Pengantar<textarea id="mIntro" rows="3">${esc(m.intro)}</textarea></label>
    <label>Isi materi (pisahkan paragraf dengan satu baris kosong)<textarea id="mBody" rows="7">${esc((m.body || []).join('\n\n'))}</textarea></label>
    <label>Contoh kasus<textarea id="mEx" rows="3">${esc(m.example)}</textarea></label>
    <label>Pertanyaan refleksi (satu pertanyaan per baris)<textarea id="mQ" rows="4">${esc((m.q || []).join('\n'))}</textarea></label>
    <div class="row"><button class="btn" data-act="saveMat" data-id="${m.id}">Simpan materi</button><button class="btn ghost" data-act="cancelMat">Batal</button></div></div>`;
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const Render = {
  login() { showRolePick(); },

  async dashboard() {
    const M = await getMateri();
    const [pr, ci, jr, unread] = await Promise.all([run(sb.from('progress').select('material_id')), run(sb.from('checkins').select('date')), run(sb.from('journals').select('id')), countUnread()]);
    const ids = pr.map(x => x.material_id), pct = Math.round(ids.length / M.length * 100), next = M.find(m => !ids.includes(m.id));
    const h = new Date().getHours(), sapa = h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam', done = ci.some(c => c.date === today());
    $('#view-dashboard').innerHTML = `
      <h2>Selamat ${sapa}, ${esc(ME.name)} 👋</h2>
      <p class="lead">${done ? 'Kamu sudah check-in hari ini. Terima kasih sudah meluangkan waktu untuk dirimu.' : 'Bagaimana kabarmu hari ini? Yuk, luangkan beberapa menit untuk menyapa dirimu.'}</p>
      <div class="card"><b>Progres belajar: ${ids.length} dari ${M.length} materi (${pct}%)</b>
        <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        ${next ? `<button class="btn small" data-go="materi/${next.id}">${ids.length ? 'Lanjutkan' : 'Mulai'}: ${esc(next.title)}</button>` : '<span class="badge ok">Semua materi selesai 🎉</span>'}</div>
      <div class="stats"><div class="stat"><b>${ids.length}/${M.length}</b>materi selesai</div><div class="stat"><b>${ci.length}</b>check-in</div><div class="stat"><b>${jr.length}</b>catatan jurnal</div></div>
      <div class="grid3">
        <article class="card"><span class="ico">📖</span><h3>Materi</h3><p>Pelajari self-acceptance langkah demi langkah.</p><button class="btn ghost small" data-go="materi">Buka materi</button></article>
        <article class="card"><span class="ico">🌤️</span><h3>Refleksi harian</h3><p>${done ? 'Perbarui check-in hari ini.' : 'Check-in belum dilakukan.'}</p><button class="btn ghost small" data-go="refleksi">Check-in</button></article>
        <article class="card"><span class="ico">📓</span><h3>Jurnal</h3><p>Tulis dan kelola catatan pribadimu.</p><button class="btn ghost small" data-go="jurnal">Buka jurnal</button></article>
        <article class="card"><span class="ico">💬</span><h3>Ruang Umpan Balik</h3><p>${unread ? `<span class="badge new">${unread} balasan baru</span> dari konselor.` : 'Tanya atau minta arahan konselor BK.'}</p><button class="btn ghost small" data-go="umpanbalik">Buka</button></article>
        <article class="card"><span class="ico">🤝</span><h3>Bantuan &amp; konseling</h3><p>Informasi layanan konseling.</p><button class="btn ghost small" data-go="bantuan">Lihat bantuan</button></article>
      </div>`;
  },

  async materi(id) {
    const M = await getMateri(), box = $('#view-materi'), m = M.find(x => x.id == id);
    const pr = (await run(sb.from('progress').select('material_id'))).map(x => x.material_id);
    if (!m) {
      box.innerHTML = `<h2>Materi Self-Acceptance</h2><p class="lead">Lima materi singkat untuk dipelajari sesuai kecepatanmu.</p><div class="grid3">${M.map(x => `
        <button class="card mcard" data-go="materi/${x.id}"><span class="ico">${x.icon}</span><h3>${x.id}. ${esc(x.title)}</h3><p>${esc(x.intro)}</p>
        <span class="badge ${pr.includes(x.id) ? 'ok' : ''}">${pr.includes(x.id) ? '✓ Selesai' : 'Belum selesai'}</span></button>`).join('')}</div>`;
      return;
    }
    const a = await run(sb.from('material_answers').select('answers').eq('material_id', m.id).maybeSingle()), ans = a?.answers || [], done = pr.includes(m.id);
    box.innerHTML = `<button class="back" data-go="materi">← Semua materi</button>
      <h2>${m.icon} ${m.id}. ${esc(m.title)}</h2><p class="lead">${esc(m.intro)}</p>
      <div class="prose">${m.body.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      <div class="example"><b>Contoh sederhana</b><p>${esc(m.example)}</p></div>
      <h3>Pertanyaan refleksi</h3>
      <div class="card">${m.q.map((q, i) => `<label>${i + 1}. ${esc(q)}<textarea rows="3" data-q="${i}">${esc(ans[i] || '')}</textarea></label>`).join('')}
        <div class="row"><button class="btn" data-act="saveAns" data-id="${m.id}">Simpan jawaban</button>
        <button class="btn ${done ? 'ghost' : ''}" data-act="toggleDone" data-id="${m.id}">${done ? '✓ Selesai (klik untuk batalkan)' : 'Tandai selesai'}</button></div></div>
      <div class="row">${m.id > 1 ? `<button class="btn ghost small" data-go="materi/${m.id - 1}">← Sebelumnya</button>` : ''}${m.id < M.length ? `<button class="btn ghost small" data-go="materi/${m.id + 1}">Berikutnya →</button>` : ''}</div>`;
  },

  async refleksi() {
    const list = await run(sb.from('checkins').select('*').order('date', { ascending: false })), t = list.find(c => c.date === today());
    $('#moods').innerHTML = MOODS.map(([e, n]) => `<button type="button" data-mood="${n}" class="${t && t.mood === n ? 'sel' : ''}"><b>${e}</b>${n}</button>`).join('');
    $('#cFeel').value = t?.feel || ''; $('#cExp').value = t?.exp || ''; $('#cGrat').value = t?.grat || '';
    $('#checkinList').innerHTML = list.length ? list.map(c => `<article class="item"><header><h4>${(MOODS.find(m => m[1] === c.mood) || ['📝'])[0]} ${esc(c.mood || 'Tanpa suasana hati')}</h4><time>${fmt(c.date)}</time></header>
      ${c.feel ? `<p><b>Perasaan:</b> ${esc(c.feel)}</p>` : ''}${c.exp ? `<p><b>Pengalaman:</b> ${esc(c.exp)}</p>` : ''}${c.grat ? `<p><b>Disyukuri:</b> ${esc(c.grat)}</p>` : ''}</article>`).join('')
      : '<p class="empty">Belum ada check-in. Mulai dari hari ini, ya.</p>';
  },

  async jurnal() {
    const list = await run(sb.from('journals').select('*').order('created_at', { ascending: false }));
    $('#journalList').innerHTML = list.length ? list.map(j => `<article class="item"><header><div><h4>${esc(j.title)}</h4><time>${fmt(j.created_at)}</time></div>
      <button class="btn danger small" data-act="delJ" data-id="${j.id}">Hapus</button></header><p>${esc(j.body)}</p></article>`).join('')
      : '<p class="empty">Belum ada catatan. Tulis catatan pertamamu di atas.</p>';
  },

  async umpanbalik() {
    const ms = await run(MSG_ORDER(sb.from('messages').select('*,replies(*)')));
    $('#fbList').innerHTML = ms.length ? ms.map(m => { const nw = m.replies.filter(r => !r.seen).length; return `
      <details class="item msg" data-mid="${m.id}"><summary><span><b>${esc(m.subject)}</b><br><span class="muted">${esc(m.category)} · ${fmt(m.created_at)}</span></span>
      <span>${nw ? '<span class="badge new">Balasan baru</span> ' : ''}${statusBadge(m)}</span></summary>
      <p>${esc(m.body)}</p>${m.replies.length ? m.replies.map(replyHtml).join('') : '<p class="muted">Belum ada balasan dari konselor.</p>'}</details>`; }).join('')
      : '<p class="empty">Belum ada pesan. Kirim pertanyaan pertamamu di atas.</p>';
  },

  async admin() {
    const [o, us, mats] = await Promise.all([run(sb.rpc('admin_overview')), run(sb.rpc('admin_list_users')), run(sb.from('materials').select('*').order('id'))]);
    ADM_MAT = mats;
    const lbl = { mahasiswa: 'Mahasiswa', konselor: 'Konselor BK', admin: 'Admin' }, ord = { admin: 0, konselor: 1, mahasiswa: 2 };
    us.sort((a, b) => (ord[a.role] ?? 3) - (ord[b.role] ?? 3));
    $('#view-admin').innerHTML = `<h2>Dashboard Admin</h2><p class="lead">Halo, ${esc(ME.name)}. Kamu mengelola akun dan konten. Jurnal, refleksi, dan isi pesan mahasiswa tidak dapat diakses dari sini.</p>
      <div class="stats"><div class="stat"><b>${o.mahasiswa}</b>mahasiswa</div><div class="stat"><b>${o.konselor}</b>konselor BK</div><div class="stat"><b>${o.pesan}</b>total pesan</div><div class="stat"><b>${o.menunggu}</b>menunggu balasan</div></div>
      ${o.materi ? '' : '<div class="note-box">Materi belum ada di database. <button class="btn small" data-act="seedMateri">Impor 5 materi awal</button></div>'}
      <h3>Kelola materi (${mats.length})</h3>
      <div class="list">${mats.map(m => `<div class="item"><header><span><b>${esc(m.icon)} ${esc(m.title)}</b><br><span class="muted">Materi ${m.id} · ${(m.q || []).length} pertanyaan refleksi</span></span>
      <span><button class="btn ghost small" data-act="editMat" data-id="${m.id}">Ubah</button> <button class="btn danger small" data-act="delMat" data-id="${m.id}" data-name="${esc(m.title)}">Hapus</button></span></header></div>`).join('') || '<p class="empty">Belum ada materi.</p>'}</div>
      <div class="row"><button class="btn" data-act="editMat" data-id="0">+ Tambah materi</button></div><div id="matForm"></div>
      <h3>Daftar akun (${us.length})</h3><div class="list">${us.map(u => `
      <div class="item"><header><span><b>${esc(u.name)}</b><br><span class="muted">${esc(u.email)} · bergabung ${fmt(u.created_at)}</span></span>
      <span><span class="badge ${u.role === 'konselor' ? 'ok' : ''}">${lbl[u.role] || esc(u.role)}</span> ${u.role === 'admin' || u.id === ME.id ? '' : `<button class="btn danger small" data-act="delUser" data-id="${u.id}" data-name="${esc(u.name)}">Hapus</button>`}</span></header></div>`).join('')}</div>`;
  },
  async konselor() {
    const ms = await run(MSG_ORDER(sb.from('messages').select('*,replies(*)')));
    const { count } = await sb.from('materials').select('id', { count: 'exact', head: true });
    const wait = ms.filter(m => m.status === 'menunggu').length, unread = ms.filter(m => !m.counselor_seen).length;
    $('#view-konselor').innerHTML = `<h2>Dashboard Konselor BK</h2><p class="lead">Halo, ${esc(ME.name)}. Kamu hanya melihat pesan yang dikirim mahasiswa lewat Ruang Umpan Balik. Jurnal dan refleksi pribadi mahasiswa tidak dapat diakses.</p>
      <div class="stats"><div class="stat"><b>${ms.length}</b>total pesan</div><div class="stat"><b>${unread}</b>belum dibaca</div><div class="stat"><b>${wait}</b>menunggu balasan</div></div>
      ${count ? '' : '<div class="note-box">Materi belum ada di database. <button class="btn small" data-act="seedMateri">Impor 5 materi awal</button></div>'}
      <h3>Pesan masuk</h3><div class="list">${ms.length ? ms.map(m => `
      <details class="item msg" data-cid="${m.id}"><summary><span><b>${esc(m.subject)}</b><br><span class="muted">${esc(m.student_name)} · ${esc(m.category)} · ${fmt(m.created_at)}</span></span>
      <span>${m.counselor_seen ? '' : '<span class="badge new">Baru</span> '}${statusBadge(m)}</span></summary>
      <p class="muted">Pengirim: ${esc(m.student_name)} (${esc(m.student_email)})</p><p>${esc(m.body)}</p>
      ${m.replies.map(replyHtml).join('')}
      <label>Balasan<textarea id="r-${m.id}" rows="3" maxlength="4000" placeholder="Tulis balasan untuk mahasiswa…"></textarea></label>
      <button class="btn small" data-act="sendReply" data-id="${m.id}">Kirim balasan</button></details>`).join('') : '<p class="empty">Belum ada pesan masuk.</p>'}</div>`;
  }
};

/* ---------- Login / Daftar ---------- */
let authMode = 'login';
let authRole = null;
const getRole = () => authRole;
function showRolePick() {
  authRole = null; authMode = 'login';
  $('#rolePick').hidden = false; $('#authStep').hidden = true;
  $('#authForm').reset(); $('#authErr').textContent = '';
}
function pickRole(r) {
  authRole = r;
  $('#rolePick').hidden = true; $('#authStep').hidden = false;
  $('#roleBadge').textContent = ROLE_ICON[r] + '  ' + ROLE_LABEL[r];
  $('#authTabs').hidden = r === 'admin';   // akun admin tidak bisa dibuat dari form Daftar
  $('#authForm').reset();
  setAuthMode('login');
  setTimeout(() => $('#aEmail').focus(), 50);
}
function setAuthMode(m) {
  authMode = m;
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === m));
  $$('.reg').forEach(e => e.hidden = m !== 'register');
  $('.code').hidden = !(m === 'register' && authRole === 'konselor');
  $('#authSubmit').textContent = m === 'login' ? 'Masuk' : 'Buat akun';
  $('#aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#authErr').textContent = '';
}
async function doAuth(email, password, role, name, code) {
  try {
    if (authMode === 'register') {
      const r = await Auth.register({ name, email, password, role, code });
      if (r.confirm) { setAuthMode('login'); return toast('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.'); }
    } else await Auth.login(email, password, role);
    startRealtime(); toast('Selamat datang, ' + ME.name + '!'); go(homeOf(ME)); notifyUnread();
  } catch (e) { $('#authErr').textContent = e.message; }
}

/* ---------- Event ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-go],[data-act],[data-tab],[data-mood],[data-pick]'); if (!t) return;
  const d = t.dataset;
  if (d.go) return go(d.go);
  if (d.pick) return pickRole(d.pick);
  if (d.tab) return setAuthMode(d.tab);
  if (d.mood) { $$('#moods button').forEach(b => b.classList.toggle('sel', b === t)); return; }
  try {
    switch (d.act) {
      case 'start': return go(ME ? homeOf(ME) : 'login');
      case 'authBack': showRolePick(); break;
      case 'auth': if (ME) { await Auth.logout(); toast('Kamu sudah keluar. Sampai jumpa!'); go('home'); } else go('login'); break;
      case 'saveAns': await run(sb.from('material_answers').upsert({ user_id: ME.id, material_id: +d.id, answers: $$('[data-q]').map(x => x.value), updated_at: new Date().toISOString() }, { onConflict: 'user_id,material_id' })); toast('Jawaban tersimpan.'); break;
      case 'toggleDone': {
        const has = await run(sb.from('progress').select('material_id').eq('material_id', +d.id).maybeSingle());
        if (has) await run(sb.from('progress').delete().eq('user_id', ME.id).eq('material_id', +d.id)); else await run(sb.from('progress').insert({ user_id: ME.id, material_id: +d.id }));
        toast(has ? 'Tanda selesai dibatalkan.' : 'Materi ditandai selesai. Kerja bagus!'); Render.materi(d.id); break;
      }
      case 'delJ': if (confirm('Hapus catatan ini? Tindakan ini tidak bisa dibatalkan.')) { await run(sb.from('journals').delete().eq('id', d.id)); Render.jurnal(); toast('Catatan dihapus.'); } break;
      case 'sendReply': {
        const body = $('#r-' + d.id).value.trim(); if (!body) return toast('Tulis balasan dulu.');
        await run(sb.from('replies').insert({ message_id: d.id, counselor_id: ME.id, body }));
        toast('Balasan terkirim. Mahasiswa akan mendapat notifikasi.'); Render.konselor(); break;
      }
      case 'editMat': matForm(ADM_MAT.find(m => m.id === +d.id)); break;
      case 'cancelMat': $('#matForm').innerHTML = ''; break;
      case 'saveMat': {
        const title = $('#mTitle').value.trim(), intro = $('#mIntro').value.trim();
        if (!title || !intro) return toast('Judul dan pengantar wajib diisi.');
        const id = +d.id || ADM_MAT.reduce((a, m) => Math.max(a, m.id), 0) + 1;
        await run(sb.from('materials').upsert({ id, icon: $('#mIcon').value.trim() || '📘', title, intro,
          body: $('#mBody').value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean), example: $('#mEx').value.trim(),
          q: $('#mQ').value.split('\n').map(x => x.trim()).filter(Boolean) }));
        MCACHE = null; toast('Materi disimpan.'); Render.admin(); break;
      }
      case 'delMat':
        if (confirm('Hapus materi "' + d.name + '"? Materi hilang dari daftar mahasiswa.')) { await run(sb.from('materials').delete().eq('id', +d.id)); MCACHE = null; toast('Materi dihapus.'); Render.admin(); } break;
      case 'delUser':
        if (confirm('Hapus akun ' + d.name + '? Data akun ini ikut terhapus dan tidak bisa dikembalikan.')) { await run(sb.rpc('admin_delete_user', { uid: d.id })); toast('Akun dihapus.'); Render.admin(); } break;
      case 'seedMateri': await run(sb.from('materials').upsert(MATERI)); MCACHE = null; toast('Materi berhasil diimpor ke database.'); curView === 'admin' ? Render.admin() : Render.konselor(); break;
    }
  } catch (err) { console.error(err); toast('Gagal: ' + err.message); }
});

/* tandai pesan/balasan sudah dibaca saat dibuka */
document.addEventListener('toggle', async e => {
  const d = e.target, nb = d.querySelector?.('.badge.new'); if (!d.open || !nb) return;
  try {
    if (d.dataset.mid) await run(sb.from('replies').update({ seen: true }).eq('message_id', d.dataset.mid).eq('seen', false));
    else if (d.dataset.cid) await run(sb.from('messages').update({ counselor_seen: true }).eq('id', d.dataset.cid));
    nb.remove(); refreshBadges();
  } catch (err) { console.error(err); }
}, true);

function wire() {
  $('#menuBtn').onclick = () => { const o = $('#menu').classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); };
  $('#authForm').onsubmit = e => {
    e.preventDefault();
    const email = $('#aEmail').value.trim().toLowerCase(), pass = $('#aPass').value, name = $('#aName').value.trim(), code = $('#aCode').value.trim();
    if (!email || pass.length < 6) return $('#authErr').textContent = 'Isi email dan kata sandi (minimal 6 karakter).';
    if (authMode === 'register' && !name) return $('#authErr').textContent = 'Nama lengkap wajib diisi.';
    if (authMode === 'register' && getRole() === 'konselor' && !code) return $('#authErr').textContent = 'Kode registrasi konselor wajib diisi.';
    doAuth(email, pass, getRole(), name, code);
  };
  const guard = fn => async e => { e.preventDefault(); try { await fn(e); } catch (err) { console.error(err); toast('Gagal menyimpan: ' + err.message); } };
  $('#checkinForm').onsubmit = guard(async () => {
    const mood = $('#moods .sel')?.dataset.mood || '', feel = $('#cFeel').value.trim(), exp = $('#cExp').value.trim(), grat = $('#cGrat').value.trim();
    if (!mood && !feel && !exp && !grat) return toast('Isi minimal satu bagian dulu ya.');
    await run(sb.from('checkins').upsert({ user_id: ME.id, date: today(), mood, feel, exp, grat }, { onConflict: 'user_id,date' }));
    Render.refleksi(); toast('Check-in hari ini tersimpan. Terima kasih sudah jujur pada dirimu 💜');
  });
  $('#journalForm').onsubmit = guard(async e => {
    const title = $('#jTitle').value.trim(), body = $('#jBody').value.trim();
    if (!title || !body) return toast('Judul dan isi catatan wajib diisi.');
    await run(sb.from('journals').insert({ user_id: ME.id, title, body }));
    e.target.reset(); Render.jurnal(); toast('Catatan tersimpan.');
  });
  $('#fbForm').onsubmit = guard(async e => {
    const subject = $('#fbSubj').value.trim(), body = $('#fbBody').value.trim();
    if (!subject || !body) return toast('Subjek dan isi pesan wajib diisi.');
    await run(sb.from('messages').insert({ student_id: ME.id, category: $('#fbCat').value, subject, body }));
    e.target.reset(); Render.umpanbalik(); toast('✅ Pesan berhasil dikirim ke konselor BK.');
  });
}

/* ---------- Mulai ---------- */
(async () => {
  if (!READY) {
    $('#app').innerHTML = '<div class="card"><h2>Konfigurasi belum diisi</h2><p>Buka <code>config.js</code> dan isi <code>SUPABASE_URL</code> serta <code>SUPABASE_ANON_KEY</code>. Panduan lengkap ada di <code>README.md</code>.</p></div>';
    return;
  }
  wire();
  try { await Auth.init(); } catch (e) { console.error(e); }
  if (ME) { startRealtime(); notifyUnread(); }
  addEventListener('hashchange', route); route();
})();