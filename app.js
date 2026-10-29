'use strict';
const KEY = 'peelog.entries.v1';
const SKEY = 'peelog.settings.v1';
const $ = id => document.getElementById(id);

let entries = load(KEY, []);
let settings = Object.assign({ on: false, every: 60, start: '08:00', end: '22:00', lastNotified: 0 }, load(SKEY, {}));
let editingId = null;

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function save() { localStorage.setItem(KEY, JSON.stringify(entries)); }
function saveSettings() { localStorage.setItem(SKEY, JSON.stringify(settings)); syncSettingsToSW(); }

const pad = n => String(n).padStart(2, '0');
function toLocalInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const dayKey = ts => toLocalInput(ts).slice(0, 10);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtOz = n => String(Math.round(n * 100) / 100);

function msg(t) { $('msg').textContent = t; }

// ---------- render ----------
function render() {
  const sorted = [...entries].sort((a, b) => b.time - a.time);
  const today = dayKey(Date.now());
  const t = sorted.filter(e => dayKey(e.time) === today);
  $('todayOz').textContent = fmtOz(t.reduce((s, e) => s + e.oz, 0));
  $('todayPee').textContent = t.reduce((s, e) => s + e.pee, 0);

  const log = $('log');
  log.innerHTML = '';
  if (!sorted.length) { log.innerHTML = '<div class="empty">No entries yet.</div>'; return; }
  let cur = null;
  for (const e of sorted) {
    const k = dayKey(e.time);
    if (k !== cur) {
      cur = k;
      const all = sorted.filter(x => dayKey(x.time) === k);
      const h = document.createElement('div');
      h.className = 'day';
      const label = new Date(e.time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      h.innerHTML = `<span></span><span></span>`;
      h.children[0].textContent = label;
      h.children[1].textContent = `${fmtOz(all.reduce((s, x) => s + x.oz, 0))} fl oz · ${all.reduce((s, x) => s + x.pee, 0)} pee`;
      log.append(h);
    }
    const row = document.createElement('div');
    row.className = 'entry';
    const time = new Date(e.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    row.innerHTML = '<span class="t"></span><span class="d"></span><button class="edit">Edit</button><button class="del">✕</button>';
    row.querySelector('.t').textContent = time;
    row.querySelector('.d').textContent = [e.oz ? `${fmtOz(e.oz)} fl oz` : '', e.pee ? '💧 pee' : ''].filter(Boolean).join(' · ') || '—';
    row.querySelector('.edit').onclick = () => startEdit(e.id);
    row.querySelector('.del').onclick = () => { if (confirm('Delete this entry?')) { entries = entries.filter(x => x.id !== e.id); save(); render(); } };
    log.append(row);
  }
}

// ---------- form ----------
function resetForm() {
  editingId = null;
  $('oz').value = ''; $('pee').checked = false; $('time').value = toLocalInput(Date.now());
  $('saveBtn').textContent = 'Add entry'; $('cancelEdit').hidden = true;
}
function startEdit(id) {
  const e = entries.find(x => x.id === id); if (!e) return;
  editingId = id;
  $('oz').value = e.oz || ''; $('pee').checked = !!e.pee; $('time').value = toLocalInput(e.time);
  $('saveBtn').textContent = 'Save changes'; $('cancelEdit').hidden = false;
  scrollTo({ top: 0, behavior: 'smooth' });
}
$('cancelEdit').onclick = resetForm;
document.querySelectorAll('.quick button').forEach(b => b.onclick = () => { $('oz').value = b.dataset.oz; });
$('entryForm').onsubmit = ev => {
  ev.preventDefault();
  const oz = parseFloat($('oz').value) || 0;
  const pee = $('pee').checked ? 1 : 0;
  if (!oz && !pee) { msg('Enter fluid or check Peed.'); return; }
  const time = $('time').value ? new Date($('time').value).getTime() : Date.now();
  if (editingId) Object.assign(entries.find(x => x.id === editingId), { oz, pee, time });
  else entries.push({ id: uid(), time, oz, pee });
  save(); resetForm(); render(); msg('');
};

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
    for (const e of incoming) {
      const time = Number(e.time) || new Date(e.time).getTime();
      const n = { id: uid(), time, oz: Number(e.oz) || 0, pee: Number(e.pee) ? 1 : 0 };
      if (!isFinite(time) || (!n.oz && !n.pee)) { skipped++; continue; }
      const sig = `${n.time}|${n.oz}|${n.pee}`;
      if (seen.has(sig)) { skipped++; continue; }
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
  $('remindOn').checked = settings.on; $('remindEvery').value = settings.every;
  $('remindStart').value = settings.start; $('remindEnd').value = settings.end;
  dlg.showModal();
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
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkReminder(); } });
setInterval(checkReminder, 60000);
resetForm(); render(); checkReminder();
