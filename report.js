'use strict';
// PDF voiding-diary report (jsPDF is vendored in vendor/ so it works offline).
(function () {
  const REPORT_NAME = 'Garrett';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const C = { title: [14, 165, 233], head: [66, 153, 225], teal: [95, 211, 201], blue: [74, 159, 232], night: [0, 0, 0],
    text: [30, 30, 30], line: [205, 205, 205], band: [228, 226, 226], muted: [110, 110, 110], white: [255, 255, 255] };
  const PW = 612, PH = 792, M = 56, CW = PW - 2 * M;

  const fmtDay = d => `${MON[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
  const fmtClock = ts => { const d = new Date(ts); const h = d.getHours(); return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`; };

  function buildDays(start, end) {
    const days = [];
    const s = new Date(start); s.setHours(12, 0, 0, 0);
    const e = new Date(end); e.setHours(12, 0, 0, 0);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d.getTime());
      const list = entries.filter(x => dayKey(x.time) === k).sort((a, b) => b.time - a.time);
      const pees = list.filter(x => x.pee);
      days.push({ k, date: new Date(d), list, pee: pees.length, night: pees.filter(isNight).length, oz: sum(list, x => x.oz) });
      days[days.length - 1].day = days[days.length - 1].pee - days[days.length - 1].night;
    }
    return days.reverse(); // newest first, like the old report
  }

  function buildPdf(start, end) {
    const days = buildDays(start, end);
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    let y = 0;
    const fill = c => doc.setFillColor(...c), ink = c => doc.setTextColor(...c), stroke = c => doc.setDrawColor(...c);
    const font = (size, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); };
    const text = (s, x, yy, align = 'left') => doc.text(String(s), x, yy, { align, baseline: 'middle' });
    const moon = (cx, cy, r, bg) => { fill(C.night); doc.circle(cx, cy, r, 'F'); fill(bg); doc.circle(cx + r * 0.55, cy - r * 0.2, r * 0.85, 'F'); };
    const pageHeader = () => { font(13, true); ink(C.title); text('Pee Log Voiding Diary', 40, 40); stroke(C.line); doc.setLineWidth(0.5); doc.line(40, 54, PW - 40, 54); y = 80; };
    const newPage = () => { doc.addPage(); pageHeader(); };
    // returns true if a new page was started
    const ensure = (h, onBreak) => { if (y + h > PH - 50) { newPage(); onBreak && onBreak(); return true; } return false; };
    const section = title => { ensure(70); font(15, true); ink(C.title); text(title, M, y); y += 20; };
    // borders for one table row starting at y with height h (works across page breaks)
    const rowLines = h => { stroke(C.line); doc.setLineWidth(0.5); doc.line(M, y, M + CW, y); doc.line(M, y, M, y + h); doc.line(M + CW, y, M + CW, y + h); };
    const endTable = () => { stroke(C.line); doc.line(M, y, M + CW, y); };

    // ---- first page header ----
    font(18, true); ink(C.title); text('Pee Log Voiding Diary', M, 62);
    font(10.5, false); ink(C.text);
    text(`Generated On: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`, M, 92);
    text(`Dates:  ${fmtDay(days[days.length - 1].date)} - ${fmtDay(days[0].date)}`, M, 108);
    font(10.5, true); text(`User: ${REPORT_NAME}`, M, 124);
    y = 156;

    // ---- 1. summary (one row per day) ----
    section('Summary');
    const sRow = 22, sCols = [['Date', M + 6, 'left'], ['Frequency', M + 210, 'center'], ['Drink (oz)', M + 290, 'center'], ['Night pees', M + 370, 'center'], ['Day pees', M + 450, 'center']];
    const sumHead = () => {
      fill(C.head); doc.rect(M, y, CW, sRow, 'F'); font(9.5, true); ink(C.white);
      sCols.forEach(([t, x, al]) => text(t, x, y + sRow / 2, al)); y += sRow;
    };
    sumHead();
    days.forEach(d => {
      ensure(sRow, sumHead); rowLines(sRow);
      font(9.5, false); ink(C.text);
      [fmtDay(d.date), d.pee, fmtOz(d.oz), d.night, d.day].forEach((v, i) => text(v, sCols[i][1], y + sRow / 2, sCols[i][2]));
      y += sRow;
    });
    endTable();

    y += 30;
    // ---- 2. diary ----
    section('Diary');
    const dRow = 17, xPee = M + 235, xDrink = M + 345;
    const diaryHead = () => {
      fill(C.head); doc.rect(M, y, CW, 20, 'F'); font(9.5, true); ink(C.white);
      text('Date', M + 6, y + 10); text('Pee', xPee, y + 10, 'right'); text('Drink (oz)', xDrink, y + 10, 'right'); y += 20;
    };
    diaryHead();
    const diaryEnsure = h => ensure(h, diaryHead);
    days.forEach(d => {
      diaryEnsure(dRow * 2);
      fill(C.band); doc.rect(M, y, CW, dRow, 'F'); rowLines(dRow);
      font(9, true); ink(C.text);
      text(`${fmtDay(d.date)} (${d.pee})`, M + 6, y + dRow / 2); text(d.pee, xPee, y + dRow / 2, 'right'); text(fmtOz(d.oz), xDrink, y + dRow / 2, 'right');
      y += dRow;
      d.list.forEach(e => {
        diaryEnsure(dRow); rowLines(dRow);
        font(9, false); ink(C.text); text(fmtClock(e.time), M + 6, y + dRow / 2);
        if (e.pee) { if (isNight(e)) moon(M + 88, y + dRow / 2, 4, C.white); text('1', xPee, y + dRow / 2, 'right'); }
        else text(fmtOz(e.oz), xDrink, y + dRow / 2, 'right');
        y += dRow;
      });
      if (!d.list.length) { diaryEnsure(dRow); rowLines(dRow); font(9, false); ink(C.muted); text('No entries', M + 6, y + dRow / 2); y += dRow; }
    });
    endTable(); y += 30;

    // ---- 3. daily chart ----
    section('Daily Chart');
    const maxPee = Math.max(1, ...days.map(d => d.pee)), maxOz = Math.max(1, ...days.map(d => d.oz));
    const dX = M + 180, dW = 290, blockH = 46;
    const pill = (x, yy, label) => { stroke([60, 60, 60]); doc.setLineWidth(0.5); doc.roundedRect(x, yy, 58, 13, 6.5, 6.5, 'S'); font(8, false); ink(C.text); text(label, x + 29, yy + 6.5, 'center'); };
    days.forEach(d => {
      ensure(blockH + 10); rowLines(blockH);
      font(9.5, false); ink(C.text); text(`${fmtDay(d.date)} (${d.pee})`, M + 8, y + blockH / 2);
      font(8.5, false); text('Urination', M + 108, y + 14); text('Intake', M + 108, y + 33);
      if (d.pee) {
        const w = Math.max(48, d.pee / maxPee * dW);
        fill(C.blue); doc.roundedRect(dX, y + 8, w, 13, 6.5, 6.5, 'F');
        font(8, false); ink(C.text); text(`${d.pee} ${d.pee === 1 ? 'pee' : 'pees'}`, dX + w / 2, y + 14.5, 'center');
      } else pill(dX, y + 8, 'no records');
      if (d.oz) {
        const w = Math.max(40, d.oz / maxOz * dW);
        fill(C.teal); doc.roundedRect(dX, y + 27, w, 13, 6.5, 6.5, 'F');
        font(8, false); ink(C.text); text(`${fmtOz(d.oz)} oz`, dX + w / 2, y + 33.5, 'center');
      } else pill(dX, y + 27, 'no records');
      y += blockH;
    });
    endTable(); y += 30;

    // ---- 4. day vs night ----
    section('Day vs Night Pees');
    const barX = M + 120, barW = 300, r24 = 24;
    days.forEach(d => {
      ensure(r24 + 10); rowLines(r24);
      font(9, false); ink(C.text); text(fmtDay(d.date), M + 6, y + r24 / 2);
      if (!d.pee) { font(8, false); ink(C.muted); text('no pees', barX + 4, y + r24 / 2); }
      else {
        const dw = d.day / d.pee * barW, nw = barW - dw, by = y + 3, bh = r24 - 6;
        fill(C.teal); if (dw) doc.rect(barX, by, dw, bh, 'F');
        fill(C.night); if (nw) doc.rect(barX + dw, by, nw, bh, 'F');
        font(8, true); ink(C.white);
        if (dw > 44) text(`${d.day} (${Math.round(d.day / d.pee * 100)}%)`, barX + dw / 2, y + r24 / 2, 'center');
        if (nw > 44) text(`${d.night} (${Math.round(d.night / d.pee * 100)}%)`, barX + dw + nw / 2, y + r24 / 2, 'center');
        if (d.night) moon(barX + barW + 14, y + r24 / 2, 4.5, C.white);
      }
      y += r24;
    });
    endTable();
    y += 12; ensure(40);
    fill(C.teal); doc.rect(M, y, 12, 12, 'F'); font(9, false); ink(C.text); text('During Day Time', M + 18, y + 6);
    fill(C.night); doc.rect(M + 120, y, 12, 12, 'F'); text('During Night Time', M + 138, y + 6);
    y += 40;

    // ---- footer ----
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); font(8, true); ink(C.text); text(`Page ${i} of ${n}`, PW - 40, PH - 28, 'right'); }
    return doc.output('blob');
  }

  // ---------- UI ----------
  const dlg = $('reportDlg'), msgEl = $('reportMsg');
  const input = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  $('reportBtn').onclick = () => {
    $('settings').close();
    const end = new Date(), start = new Date(); start.setDate(start.getDate() - 6);
    $('repStart').value = input(start); $('repEnd').value = input(end); msgEl.textContent = '';
    dlg.showModal();
  };
  $('reportCancel').onclick = () => dlg.close();
  $('reportGo').onclick = async () => {
    let s = $('repStart').value, e = $('repEnd').value;
    if (!s || !e) { msgEl.textContent = 'Pick both dates.'; return; }
    if (s > e) [s, e] = [e, s];
    const start = new Date(`${s}T00:00`).getTime(), end = new Date(`${e}T23:59`).getTime();
    if (!entries.some(x => x.time >= start && x.time <= end)) { msgEl.textContent = 'No entries in that range.'; return; }
    if (!window.jspdf) { msgEl.textContent = 'PDF tool not loaded yet. Check your connection and try again.'; return; }
    msgEl.textContent = 'Creating…';
    try {
      const blob = buildPdf(start, end);
      const file = new File([blob], `pee-log-report-${s}-to-${e}.pdf`, { type: 'application/pdf' });
      const touch = matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Pee Log report' }); } catch (err) { if (err.name !== 'AbortError') throw err; }
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      msgEl.textContent = ''; dlg.close();
    } catch (err) { msgEl.textContent = 'Could not create the PDF: ' + err.message; }
  };
  window.__buildReport = buildPdf; // for testing
})();
