'use strict';
const KEY = 'peelog.entries.v1';
const SKEY = 'peelog.settings.v1';
const $ = id => document.getElementById(id);

let settings = Object.assign({ on: false, every: 60, start: '08:00', end: '22:00', lastNotified: 0, sizes: [4, 8, 12, 16, 20] }, load(SKEY, {}));
let entries = normalize(load(KEY, []));
let editingId = null;
let formType = 'drink';
let range = 7;

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function save() { localStorage.setItem(KEY, JSON.stringify(entries)); }
function saveSettings() { localStorage.setItem(SKEY, JSON.stringify(settings)); syncSettingsToSW(); }

// An entry is either a drink (oz > 0, pee 0) or a pee (oz 0, pee 1). Older entries holding both are split.
function normalize(list) {
  const out = [];
  for (const e of list) {
    if (e.oz && e.pee) { out.push({ ...e, pee: 0 }, { id: uid(), time: e.time, oz: 0, pee: 1 }); }
    else out.push(e);
  }
  if (out.length !== list.length) localStorage.setItem(KEY, JSON.stringify(out));
  return out;
}

function pad(n) { return String(n).padStart(2, '0'); }
function toLocalInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const dayKey = ts => toLocalInput(ts).slice(0, 10);
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
const fmtOz = n => String(Math.round(n * 100) / 100);
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const msg = t => { $('msg').textContent = t; };
const sortedDesc = () => [...entries].sort((a, b) => b.time - a.time);

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(s => s.hidden = s.id !== 'tab-' + name);
  if (name === 'charts') renderCharts();
  scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ---------- lists ----------
function entryRow(e) {
  const row = document.createElement('div');
  row.className = 'entry';
  row.innerHTML = '<span class="t"></span><span class="d"></span><button class="edit">Edit</button><button class="del">✕</button>';
  row.querySelector('.t').textContent = new Date(e.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  row.querySelector('.d').textContent = e.pee ? '🚽 Pee' : `💧 ${fmtOz(e.oz)} fl oz`;
  row.querySelector('.edit').onclick = () => startEdit(e.id);
  row.querySelector('.del').onclick = () => {
    if (confirm('Delete this entry?')) { entries = entries.filter(x => x.id !== e.id); save(); render(); }
  };
  return row;
}
function renderList(el, list, withHeaders) {
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<div class="empty">No entries yet.</div>'; return; }
  let cur = null;
  for (const e of list) {
    const k = dayKey(e.time);
    if (withHeaders && k !== cur) {
      cur = k;
      const all = list.filter(x => dayKey(x.time) === k);
      const h = document.createElement('div');
      h.className = 'day';
      h.innerHTML = '<span></span><span></span>';
      h.children[0].textContent = new Date(e.time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      h.children[1].textContent = `${fmtOz(sum(all, x => x.oz))} fl oz · ${sum(all, x => x.pee)} pee`;
      el.append(h);
    }
    el.append(entryRow(e));
  }
}
function render() {
  const all = sortedDesc();
  const today = all.filter(e => dayKey(e.time) === dayKey(Date.now()));
  $('todayOz').textContent = fmtOz(sum(today, e => e.oz));
  $('todayPee').textContent = sum(today, e => e.pee);
  renderList($('todayLog'), today, false);
  renderList($('log'), all, true);
  renderQuick();
  if (!$('tab-charts').hidden) renderCharts();
}

// ---------- form ----------
function setType(t) {
  formType = t;
  document.querySelectorAll('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === t));
  $('drinkFields').hidden = t !== 'drink';
  $('saveBtn').textContent = (editingId ? 'Save ' : 'Add ') + (t === 'drink' ? 'drink' : 'pee');
}
document.querySelectorAll('#typeSeg button').forEach(b => b.onclick = () => { if (!editingId) setType(b.dataset.type); });

function renderQuick() {
  const q = $('quick'); q.innerHTML = '';
  settings.sizes.forEach(n => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = n;
    b.onclick = () => { $('oz').value = n; };
    q.append(b);
  });
}
let timeTouched = false;
$('time').addEventListener('input', () => { timeTouched = true; });
function resetForm() {
  editingId = null; timeTouched = false;
  $('oz').value = ''; $('time').value = toLocalInput(Date.now());
  $('cancelEdit').hidden = true; $('formMsg').textContent = '';
  setType(formType);
}
function startEdit(id) {
  const e = entries.find(x => x.id === id); if (!e) return;
  editingId = id;
  $('oz').value = e.oz || ''; $('time').value = toLocalInput(e.time);
  $('cancelEdit').hidden = false;
  setType(e.pee ? 'pee' : 'drink');
  showTab('log');
}
$('cancelEdit').onclick = resetForm;
$('entryForm').onsubmit = ev => {
  ev.preventDefault();
  const time = $('time').value ? new Date($('time').value).getTime() : Date.now();
  const oz = formType === 'drink' ? parseFloat($('oz').value) || 0 : 0;
  const pee = formType === 'pee' ? 1 : 0;
  if (formType === 'drink' && !oz) { $('formMsg').textContent = 'Enter how many fl oz.'; return; }
  if (editingId) Object.assign(entries.find(x => x.id === editingId), { oz, pee, time });
  else entries.push({ id: uid(), time, oz, pee });
  save(); resetForm(); render();
  $('formMsg').textContent = 'Saved.';
  setTimeout(() => { $('formMsg').textContent = ''; }, 1500);
};

// ---------- charts ----------
function barChart({ values, labels, cls = '', fmt = fmtOz, tip }) {
  const W = 320, H = 150, L = 24, B = 18, T = 12, n = values.length;
  const max = Math.max(...values, 1), niceMax = Math.ceil(max);
  const bw = (W - L) / n, plotH = H - B - T;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  s += `<line x1="${L}" x2="${W}" y1="${T}" y2="${T}"/><line x1="${L}" x2="${W}" y1="${H - B}" y2="${H - B}"/>`;
  s += `<text x="${L - 4}" y="${T + 3}" text-anchor="end">${fmt(niceMax)}</text><text x="${L - 4}" y="${H - B}" text-anchor="end">0</text>`;
  const step = Math.ceil(n / 8);
  values.forEach((v, i) => {
    const h = (v / niceMax) * plotH, x = L + i * bw + bw * 0.15;
    s += `<rect class="bar ${cls}" x="${x}" y="${H - B - h}" width="${bw * 0.7}" height="${h}" rx="2"><title>${tip(i, v)}</title></rect>`;
    if (i % step === 0) s += `<text x="${x + bw * 0.35}" y="${H - 5}" text-anchor="middle">${labels[i]}</text>`;
  });
  return s + '</svg>';
}
function renderCharts() {
  const days = [];
  for (let i = range - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const keys = days.map(d => dayKey(d.getTime()));
  const inRange = entries.filter(e => keys.includes(dayKey(e.time)));
  const ozBy = keys.map(k => sum(inRange.filter(e => dayKey(e.time) === k), e => e.oz));
  const peeBy = keys.map(k => sum(inRange.filter(e => dayKey(e.time) === k), e => e.pee));
  const labels = days.map(d => `${d.getMonth() + 1}/${d.getDate()}`);
  const dayLabel = i => days[i].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const activeOz = ozBy.filter(v => v > 0).length, activePee = peeBy.filter(v => v > 0).length;
  const pees = inRange.filter(e => e.pee).sort((a, b) => a.time - b.time);
  let gap = '–';
  if (pees.length > 1) gap = ((pees[pees.length - 1].time - pees[0].time) / (pees.length - 1) / 3600000).toFixed(1) + ' h';
  $('stats').innerHTML =
    `<div><b>${activeOz ? fmtOz(sum(ozBy, v => v) / activeOz) : '–'}</b><small>avg fl oz / day</small></div>` +
    `<div><b>${activePee ? fmtOz(sum(peeBy, v => v) / activePee) : '–'}</b><small>avg pees / day</small></div>` +
    `<div><b>${gap}</b><small>avg between pees</small></div>`;

  $('chartOz').innerHTML = barChart({ values: ozBy, labels, tip: (i, v) => `${dayLabel(i)}: ${fmtOz(v)} fl oz` });
  $('chartPee').innerHTML = barChart({ values: peeBy, labels, cls: 'pee', tip: (i, v) => `${dayLabel(i)}: ${v} pee` });
  const byHour = Array.from({ length: 24 }, (_, h) => pees.filter(e => new Date(e.time).getHours() === h).length);
  const hl = h => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
  $('chartHour').innerHTML = barChart({ values: byHour, labels: byHour.map((_, h) => hl(h)), cls: 'pee', tip: (h, v) => `${hl(h)}: ${v} pee` });
}
document.querySelectorAll('#rangeSeg button').forEach(b => b.onclick = () => {
  range = +b.dataset.range;
  document.querySelectorAll('#rangeSeg button').forEach(x => x.classList.toggle('on', x === b));
  renderCharts();
});

// ---------- export / import ----------
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => dayKey(Date.now());
$('exportJson').onclick = () => download(`pee-log-${stamp()}.json`, JSON.stringify({ app: 'pee-log', version: 1, entries }, null, 2), 'application/json');
$('exportCsv').onclick = () => {
  const rows = ['time,fluid_fl_oz,urine'];
  [...entries].sort((a, b) => a.time - b.time).forEach(e => rows.push(`${new Date(e.time).toISOString()},${e.oz},${e.pee}`));
  download(`pee-log-${stamp()}.csv`, rows.join('\n'), 'text/csv');
};
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async ev => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  try {
    const text = await f.text();
    let incoming;
    if (f.name.toLowerCase().endsWith('.csv') || !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
      incoming = text.split(/\r?\n/).slice(1).filter(l => l.trim()).map(l => {
        const [t, oz, pee] = l.split(',');
        return { time: new Date(t.trim()).getTime(), oz: parseFloat(oz) || 0, pee: parseInt(pee) ? 1 : 0 };
      });
    } else {
      const j = JSON.parse(text);
      incoming = Array.isArray(j) ? j : j.entries;
    }
    const seen = new Set(entries.map(e => `${e.time}|${e.oz}|${e.pee}`));
    let added = 0, skipped = 0;
    for (const e of normalize(incoming.map(e => ({ ...e, time: Number(e.time) || new Date(e.time).getTime(), oz: Number(e.oz) || 0, pee: Number(e.pee) ? 1 : 0 })))) {
      const n = { id: uid(), time: e.time, oz: e.oz, pee: e.pee };
      const sig = `${n.time}|${n.oz}|${n.pee}`;
      if (!isFinite(n.time) || (!n.oz && !n.pee) || seen.has(sig)) { skipped++; continue; }
      seen.add(sig); entries.push(n); added++;
    }
    save(); render();
    msg(`Imported ${added} entries${skipped ? `, skipped ${skipped}` : ''}.`);
  } catch (err) { msg('Import failed: ' + err.message); }
};

// ---------- reminders ----------
const mins = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function inWindow(now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes(), a = mins(settings.start), b = mins(settings.end);
  return a <= b ? m >= a && m <= b : m >= a || m <= b;
}
async function notify(body) {
  const reg = await navigator.serviceWorker?.ready;
  const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'peelog-reminder' };
  if (reg) reg.showNotification('Pee Log', opts); else new Notification('Pee Log', opts);
}
function checkReminder() {
  if (!settings.on || Notification.permission !== 'granted' || !inWindow()) return;
  const lastEntry = entries.reduce((m, e) => Math.max(m, e.time), 0);
  const due = Math.max(settings.lastNotified, lastEntry) + settings.every * 60000;
  if (Date.now() >= due) {
    settings.lastNotified = Date.now(); localStorage.setItem(SKEY, JSON.stringify(settings));
    notify('Time to log your fluids and bathroom trips.');
  }
}
async function syncSettingsToSW() {
  const reg = await navigator.serviceWorker?.ready.catch(() => null);
  reg?.active?.postMessage({ type: 'settings', settings, lastEntry: entries.reduce((m, e) => Math.max(m, e.time), 0) });
}
async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!('periodicSync' in reg)) return;
    if (settings.on) await reg.periodicSync.register('peelog-remind', { minInterval: Math.max(15, settings.every) * 60000 });
    else await reg.periodicSync.unregister('peelog-remind');
  } catch {}
}

const dlg = $('settings');
$('settingsBtn').onclick = () => {
  $('sizes').value = settings.sizes.join(', ');
  $('remindOn').checked = settings.on; $('remindEvery').value = settings.every;
  $('remindStart').value = settings.start; $('remindEnd').value = settings.end;
  dlg.showModal();
};
$('sizes').onchange = () => {
  const list = $('sizes').value.split(/[\s,]+/).map(parseFloat).filter(n => n > 0).slice(0, 8);
  settings.sizes = list.length ? list : [4, 8, 12, 16, 20];
  $('sizes').value = settings.sizes.join(', ');
  saveSettings(); renderQuick();
};
async function applySettings() {
  const on = $('remindOn').checked;
  if (on && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  if (on && (!('Notification' in window) || Notification.permission !== 'granted')) {
    $('remindOn').checked = false;
    alert('Notifications are blocked. Allow them in your browser/site settings.');
  }
  settings.on = $('remindOn').checked;
  settings.every = +$('remindEvery').value;
  settings.start = $('remindStart').value || '08:00';
  settings.end = $('remindEnd').value || '22:00';
  settings.lastNotified = Date.now();
  saveSettings(); registerPeriodicSync();
}
['remindOn', 'remindEvery', 'remindStart', 'remindEnd'].forEach(id => $(id).onchange = applySettings);
$('testNotif').onclick = async () => {
  if (!('Notification' in window)) return alert('Notifications are not supported here.');
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') notify('Test notification — it works!');
  else alert('Notifications are blocked. Allow them in site settings.');
};

// ---------- init ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => { syncSettingsToSW(); registerPeriodicSync(); });
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'notified') { settings.lastNotified = e.data.at; localStorage.setItem(SKEY, JSON.stringify(settings)); }
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!editingId && !timeTouched) $('time').value = toLocalInput(Date.now());
  render(); checkReminder();
});
setInterval(checkReminder, 60000);
resetForm(); render(); checkReminder();
