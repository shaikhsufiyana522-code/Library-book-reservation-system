const $ = (s, r = document) => r.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = localStorage.getItem('token'), user = JSON.parse(localStorage.getItem('user') || 'null'), books = [];

async function api(p, o = {}) {
  const r = await fetch('/api' + p, { method: o.method || 'GET', body: o.body && JSON.stringify(o.body),
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) logout();
  if (!r.ok) throw Object.assign(new Error(d.message || 'Something went wrong'), { errors: d.errors });
  return d;
}
function toast(m, t = 'ok') { const d = document.createElement('div'); d.className = 'toast ' + t; d.textContent = m; $('#toasts').append(d); setTimeout(() => d.remove(), 3500); }
const save = r => { token = r.token; user = r.user; localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); };
function logout() { token = user = null; localStorage.clear(); location.hash = '#/login'; route(); }

// ---------- validation (mirrors the server rules) ----------
const len = (v, a, b) => v.trim().length >= a && v.trim().length <= b;
const V = {
  name: v => /^[A-Za-z .'-]{2,60}$/.test(v.trim()) || 'Name must be 2-60 letters',
  email: v => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.length <= 100) || 'Enter a valid email',
  password: v => (v.length >= 8 && v.length <= 64 && /[A-Z]/.test(v) && /\d/.test(v)) || 'Use 8+ characters with an uppercase letter and a number',
  title: v => len(v, 1, 200) || 'Title is required (max 200)',
  author: v => len(v, 2, 100) || 'Author is required (2-100)',
  category: v => len(v, 2, 50) || 'Category is required (2-50)',
  isbn: v => /^(\d{10}|\d{13})$/.test(v.trim()) || 'ISBN must be 10 or 13 digits',
  total_copies: v => (/^\d+$/.test(v) && +v >= 1 && +v <= 1000) || 'Copies must be a number from 1 to 1000'
};
const fld = (n, l, t = 'text', a = '') => `<label class="f"><span>${l}</span><input name="${n}" type="${t}" ${a}><small class="err" data-for="${n}"></small></label>`;
function validate(form, rules) {
  let ok = true; const d = {};
  for (const [n, fn] of Object.entries(rules)) {
    const inp = form.elements[n]; d[n] = inp.value; const r = fn(inp.value, d);
    form.querySelector(`[data-for="${n}"]`).textContent = r === true ? '' : r;
    inp.classList.toggle('bad', r !== true); if (r !== true) ok = false;
  }
  return ok ? d : null;
}
function serverErr(f, x) {
  let shown = false;
  for (const [n, m] of Object.entries(x.errors || {})) { const el = f.querySelector(`[data-for="${n}"]`); if (el) { el.textContent = m; shown = true; } }
  if (!shown) toast(x.message, 'err');
}

// ---------- shared bits ----------
const hue = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const chip = s => `<span class="chip s-${s}">${s}</span>`;
const info = r => ({
  pending: `Waitlist position ${r.queue_pos}`, ready: `Collect before ${(r.expires_at || '').slice(0, 10)}`,
  issued: `Due ${r.due_date}${r.est_fine > 0 ? `, fine ₹${r.est_fine} so far` : ''}`,
  returned: `Returned ${r.return_date}${r.fine > 0 ? `, fine ₹${r.fine}` : ''}`, cancelled: 'Cancelled', expired: 'Not collected in time'
}[r.status]);
const actions = r => (r.status === 'ready' ? `<button class="btn sm" data-act="issue" data-id="${r.id}">Issue</button>` : '')
  + (r.status === 'issued' ? `<button class="btn sm" data-act="return" data-id="${r.id}">Mark returned</button>` : '')
  + (['pending', 'ready'].includes(r.status) ? `<button class="btn ghost sm" data-act="cancel" data-id="${r.id}">Cancel</button>` : '');

function nav() {
  $('#links').innerHTML = user
    ? `<a href="#/">Catalog</a><a href="#/mine">My reservations</a>${user.role === 'admin' ? '<a href="#/admin">Librarian desk</a>' : ''}<button class="btn ghost sm" data-act="logout">Log out (${esc(user.name.split(' ')[0])})</button>`
    : `<a href="#/">Catalog</a><a href="#/login">Log in</a><a class="btn sm" href="#/register">Create account</a>`;
}

// ---------- pages ----------
function authPage(reg) {
  app.innerHTML = `<section class="card auth"><h1>${reg ? 'Create your account' : 'Log in'}</h1>
  <p class="muted">${reg ? 'Reserve books online and collect them at the desk.' : 'Manage your reservations and waitlist spots.'}</p>
  <form novalidate id="af">${reg ? fld('name', 'Full name', 'text', 'autocomplete="name" maxlength="60"') : ''}
  ${fld('email', 'Email', 'email', 'autocomplete="email" maxlength="100"')}
  ${fld('password', 'Password', 'password', `autocomplete="${reg ? 'new' : 'current'}-password" maxlength="64"`)}
  ${reg ? fld('confirm', 'Confirm password', 'password', 'autocomplete="new-password" maxlength="64"') : ''}
  <button class="btn wide">${reg ? 'Create account' : 'Log in'}</button></form>
  <p class="muted">${reg ? 'Already registered? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></section>`;
  $('#af').onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const d = validate(f, reg
      ? { name: V.name, email: V.email, password: V.password, confirm: (v, d) => v === d.password || 'Passwords do not match' }
      : { email: V.email, password: v => !!v || 'Enter your password' });
    if (!d) return;
    try { const r = await api('/auth/' + (reg ? 'register' : 'login'), { method: 'POST', body: d }); save(r); toast('Welcome, ' + r.user.name); location.hash = r.user.role === 'admin' ? '#/admin' : '#/'; }
    catch (x) { serverErr(f, x); }
  };
}

const card = b => `<article class="card book" style="--sp:hsl(${hue(b.category)} 42% 30%)"><span class="chip">${esc(b.category)}</span>
  <h3>${esc(b.title)}</h3><p class="muted">${esc(b.author)}</p><p class="isbn">ISBN ${esc(b.isbn)}</p>
  <div class="row"><span class="avail ${b.available_copies ? 'ok' : 'no'}">${b.available_copies ? `${b.available_copies} of ${b.total_copies} on shelf` : 'All copies out'}</span>
  <button class="btn sm" data-act="reserve" data-id="${b.id}">${b.available_copies ? 'Reserve' : 'Join waitlist'}</button></div></article>`;

async function catalog() {
  app.innerHTML = `<section class="hero"><h1>Reserve a book, pick it up at the desk.</h1><p>Search the shelves. If every copy is out, join the waitlist and we hold the next returned copy for you.</p>
  <div class="search"><input id="q" placeholder="Title, author or ISBN" maxlength="100" aria-label="Search books"><select id="cat" aria-label="Category"><option value="">All categories</option></select></div></section><section id="grid" class="grid"></section>`;
  const cats = await api('/books/categories');
  $('#cat').insertAdjacentHTML('beforeend', cats.map(c => `<option>${esc(c)}</option>`).join(''));
  const load = async () => {
    try { const b = await api(`/books?q=${encodeURIComponent($('#q').value)}&category=${encodeURIComponent($('#cat').value)}`);
      $('#grid').innerHTML = b.length ? b.map(card).join('') : '<p class="empty">No books match your search. Try a different title or category.</p>'; }
    catch (e) { toast(e.message, 'err'); }
  };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(load, 300); }; $('#cat').onchange = load; load();
}

async function mine() {
  if (!user) return (location.hash = '#/login');
  const rows = await api('/reservations/mine');
  app.innerHTML = `<h1 class="ph">My reservations</h1>` + (rows.length ? `<div class="list">${rows.map(r => `<article class="card item">
    <div><h3>${esc(r.title)}</h3><p class="muted">${esc(r.author)}</p></div>
    <div class="meta">${chip(r.status)}<span class="${['ready', 'issued'].includes(r.status) ? 'stamp' : 'muted'}">${esc(info(r))}</span></div>
    ${['pending', 'ready'].includes(r.status) ? `<button class="btn ghost sm" data-act="cancel" data-id="${r.id}">Cancel</button>` : ''}</article>`).join('')}</div>`
    : '<p class="empty">You have no reservations yet. <a href="#/">Browse the catalog</a> to reserve your first book.</p>');
}

async function adminPage() {
  if (!user || user.role !== 'admin') return (location.hash = '#/');
  const [s, rs] = await Promise.all([api('/stats'), api('/reservations')]); books = await api('/books');
  app.innerHTML = `<h1 class="ph">Librarian desk</h1>
  <div class="stats">${[['Books', s.books], ['Members', s.members], ['Active reservations', s.active], ['Overdue', s.overdue]].map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
  <h2>Reservations</h2><div class="card scroll"><table><thead><tr><th>Member</th><th>Book</th><th>Status</th><th>Details</th><th></th></tr></thead><tbody>
  ${rs.map(r => `<tr><td>${esc(r.user_name)}<br><small>${esc(r.email)}</small></td><td>${esc(r.title)}</td><td>${chip(r.status)}</td><td><small>${esc(info(r))}</small></td><td class="acts">${actions(r)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No reservations yet.</td></tr>'}</tbody></table></div>
  <h2>Books</h2><div class="split"><form id="bf" novalidate class="card">
  ${fld('title', 'Title', 'text', 'maxlength="200"')}${fld('author', 'Author', 'text', 'maxlength="100"')}${fld('category', 'Category', 'text', 'maxlength="50"')}
  ${fld('isbn', 'ISBN (10 or 13 digits)', 'text', 'maxlength="13" inputmode="numeric"')}${fld('total_copies', 'Total copies', 'number', 'min="1" max="1000" value="1"')}
  <button class="btn" id="bsub">Add book</button> <button type="reset" class="btn ghost">Clear</button></form>
  <div class="card scroll"><table><thead><tr><th>Title</th><th>On shelf</th><th></th></tr></thead><tbody>
  ${books.map(b => `<tr><td>${esc(b.title)}<br><small>${esc(b.author)}</small></td><td>${b.available_copies}/${b.total_copies}</td><td class="acts"><button class="btn ghost sm" data-act="edit" data-id="${b.id}">Edit</button><button class="btn ghost sm" data-act="del" data-id="${b.id}">Delete</button></td></tr>`).join('')}</tbody></table></div></div>`;
  const f = $('#bf');
  f.onreset = () => { delete f.dataset.id; $('#bsub').textContent = 'Add book'; };
  f.onsubmit = async e => {
    e.preventDefault();
    const d = validate(f, { title: V.title, author: V.author, category: V.category, isbn: V.isbn, total_copies: V.total_copies });
    if (!d) return; d.total_copies = +d.total_copies;
    try { const r = await api('/books' + (f.dataset.id ? '/' + f.dataset.id : ''), { method: f.dataset.id ? 'PUT' : 'POST', body: d }); toast(r.message); route(); }
    catch (x) { serverErr(f, x); }
  };
}

// ---------- actions ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, id } = b.dataset;
  try {
    if (act === 'logout') return logout();
    if (act === 'edit') {
      const x = books.find(k => k.id == id), f = $('#bf');
      ['title', 'author', 'category', 'isbn', 'total_copies'].forEach(k => f.elements[k].value = x[k]);
      f.dataset.id = id; $('#bsub').textContent = 'Save changes'; return f.scrollIntoView({ behavior: 'smooth' });
    }
    if (act === 'reserve') { if (!user) { toast('Log in to reserve a book', 'err'); return (location.hash = '#/login'); } toast((await api('/reservations', { method: 'POST', body: { book_id: +id } })).message); return route(); }
    if (act === 'cancel' && !confirm('Cancel this reservation?')) return;
    if (act === 'del' && !confirm('Delete this book permanently?')) return;
    const call = { cancel: [`/reservations/${id}/cancel`, 'PATCH'], issue: [`/reservations/${id}/issue`, 'PATCH'], return: [`/reservations/${id}/return`, 'PATCH'], del: ['/books/' + id, 'DELETE'] }[act];
    if (call) { toast((await api(call[0], { method: call[1] })).message); route(); }
  } catch (x) { toast(x.message, 'err'); }
});

function route() {
  nav();
  const pages = { '#/': catalog, '#/login': () => authPage(0), '#/register': () => authPage(1), '#/mine': mine, '#/admin': adminPage };
  Promise.resolve((pages[location.hash || '#/'] || catalog)()).catch(e => toast(e.message, 'err'));
}
addEventListener('hashchange', () => { route(); scrollTo(0, 0); });
route();
