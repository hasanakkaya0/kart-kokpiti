/* =====================================================================
   Kart Kokpiti — Raporlar ekranı (borcun seyri, aylık faiz, ödeme geçmişi)
   app.js (kabuk) önce yüklenir; ortak yardımcılar App.I üzerinden gelir.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { moneyHtml, cardColor, fmtTL0, esc, $ } = I;

  const MONTHS_BACK = 12;
  const PAY = p => (p.kind || "pay") === "pay";   // iade ve döviz çevirme (convIn/convOut) ödeme değildir

  /* ay sonu (bu ay için bugün) */
  const monthEnd = (ym, t) => { if (ym === K.ymOf(t)) return t; const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0); };

  /* ayların listesi: en fazla 12 ay, ilk veri ayından önce başlamaz */
  function monthRange(DB, t) {
    const nowYM = K.ymOf(t);
    const firsts = DB.statements.map(s => s.month).concat(DB.payments.map(p => p.d.slice(0, 7))).filter(Boolean).sort();
    let start = K.ymAdd(nowYM, -(MONTHS_BACK - 1));
    if (firsts.length && firsts[0] > start) start = firsts[0];
    const out = [];
    for (let m = start; m <= nowYM; m = K.ymAdd(m, 1)) out.push(m);
    return out;
  }

  /* bankanın ekstreye yazdığı faiz varsa o, yoksa uygulamanın tahmini (interestReport.perRow), ekstre ayına göre */
  function interestByMonth(DB, months, t) {
    const IR = K.interestReport(DB, t.getFullYear(), t);
    const out = {}; months.forEach(m => out[m] = { bank: 0, est: 0 });
    DB.cards.forEach(c => K.accountsOf(c).forEach(ccy => {
      K.ledger(DB, c.id, ccy, t).rows.forEach(r => {
        if (!r.isCut || !out[r.month]) return;
        const p = IR.perRow[r.id]; if (!p) return;
        const v = p.bank != null ? p.bank : p.est; if (!(v > 0)) return;
        const tl = K.toTL(DB, v, ccy, r.month) || 0;
        if (p.bank != null) out[r.month].bank += tl; else out[r.month].est += tl;
      });
    }));
    return { byMonth: out, year: IR };
  }

  function paymentsByMonth(DB, months) {
    const out = {}; months.forEach(m => out[m] = { tl: 0, n: 0 });
    DB.payments.filter(PAY).forEach(p => {
      const m = p.d.slice(0, 7); if (!out[m]) return;
      out[m].tl += K.toTL(DB, +p.a || 0, p.ccy, m) || 0; out[m].n++;
    });
    return out;
  }

  /* basit çubuk grafik: parts = [{ v, cls }] (alttan üste), label = çubuğun üstündeki yazı */
  function barsHtml(rows) {
    const max = Math.max(1, ...rows.map(r => r.parts.reduce((a, p) => a + p.v, 0)));
    return `<div class="bars">${rows.map(r => {
      const tot = r.parts.reduce((a, p) => a + p.v, 0);
      return `<div class="b" title="${esc(r.tip)}"><div class="bcol"><em>${tot > 0.5 ? fmtTL0(tot) : ""}</em>
        <div class="bstack" style="height:${tot > 0.5 ? `calc((100% - 74px) * ${(tot / max).toFixed(4)})` : "2px"}">${r.parts.slice().reverse().filter(p => p.v > 0.5).map(p => `<i class="${p.cls}" style="flex:${p.v}"></i>`).join("")}</div></div>
        <span>${K.MONTHS_SHORT[+r.m.slice(5) - 1]}${r.m.slice(5) === "01" || r.first ? `<small>${r.m.slice(2, 4)}</small>` : ""}</span></div>`;
    }).join("")}</div>`;
  }

  /* değişim etiketi: borç artınca kırmızı ▲, azalınca yeşil ▼ */
  const deltaHtml = d => Math.abs(d) < 0.5 ? `<span class="faint">değişmedi</span>`
    : `<span class="${d > 0 ? "bad" : "ok"}">${d > 0 ? "▲" : "▼"} ${K.fmt(Math.abs(d))}</span>`;

  function renderRaporlar() {
    const el = $("#page-raporlar"), DB = App.DB, t = App.today();
    if (!DB.cards.length || (!DB.statements.length && !DB.payments.length)) {
      el.innerHTML = `<div class="card"><div class="empty">Rapor için önce kart ve ekstre gir. Ekstreler ve ödemeler biriktikçe borcunun seyri, faiz ve ödeme geçmişi burada aylara göre görünür.</div></div>`;
      return;
    }
    const months = monthRange(DB, t), nowYM = K.ymOf(t);
    const debt = months.map(m => ({ m, v: K.summary(DB, monthEnd(m, t)).totalTL }));
    const INT = interestByMonth(DB, months, t);
    const PM = paymentsByMonth(DB, months);

    const cur = debt[debt.length - 1].v;
    const back3 = debt[Math.max(0, debt.length - 4)];
    const paid12 = months.reduce((a, m) => a + PM[m].tl, 0);
    const paidN = months.reduce((a, m) => a + PM[m].n, 0);
    const IY = INT.year;

    const stat = (k, v, s) => `<div class="card"><div class="stat"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div></div>`;
    const statsHtml = `<div class="stats" style="grid-template-rows:none;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:var(--s5)">
      ${stat("Şu anki borç", moneyHtml(cur), `${K.monthLabel(back3.m, true)}'dan beri ${deltaHtml(cur - back3.v)}`)}
      ${stat(`Son ${months.length} ayda ödenen`, moneyHtml(paid12), `${paidN} ödeme`)}
      ${stat(`${t.getFullYear()} yılında faiz`, `<span class="${IY.total > 0.5 ? "bad" : ""}">${moneyHtml(IY.total)}</span>`, [IY.bank > 0.5 ? "bankadan " + K.fmt(IY.bank) : "", IY.est > 0.5 ? "tahmini " + K.fmt(IY.est) : "", IY.inst > 0.5 ? "ekstre taksiti " + K.fmt(IY.inst) : ""].filter(Boolean).join(" · ") || "faiz yok")}
      ${stat("Bu ay ödenen", moneyHtml(PM[nowYM] ? PM[nowYM].tl : 0), `${PM[nowYM] ? PM[nowYM].n : 0} ödeme`)}
    </div>`;

    /* borcun seyri */
    const debtRows = debt.map((x, i) => ({ m: x.m, first: i === 0, parts: [{ v: x.v, cls: "t1" }],
      tip: K.monthLabel(x.m) + (x.m === nowYM ? " (bugün)" : " sonu") + ": " + K.fmt(x.v) + (i ? " · önceki aya göre " + (x.v - debt[i - 1].v >= 0 ? "+" : "−") + K.fmt(Math.abs(x.v - debt[i - 1].v)) : "") }));
    const prev = debt.length > 1 ? debt[debt.length - 2] : null;
    const debtHtml = `<div class="sec-title"><h2>Borcun seyri</h2><span class="hint">her ay sonu kesilmiş ekstrelerden kalan · TL karşılığı</span></div>
      <div class="card">${barsHtml(debtRows)}
        <div class="lim-legend" style="margin-top:var(--s3)">${prev ? `<span>geçen aya göre ${deltaHtml(cur - prev.v)}</span>` : ""}<span>${K.monthLabel(debt[0].m, true)}'dan beri ${deltaHtml(cur - debt[0].v)}</span></div>
      </div>`;

    /* aylık faiz */
    const anyInt = months.some(m => INT.byMonth[m].bank + INT.byMonth[m].est > 0.5);
    const intHtml = `<div><div class="sec-title"><h2>Aylık faiz</h2><span class="hint">ekstreye giren faiz · ekstre ayına göre</span></div>
      <div class="card">${anyInt ? barsHtml(months.map((m, i) => ({ m, first: i === 0,
        parts: [{ v: INT.byMonth[m].bank, cls: "t1" }, { v: INT.byMonth[m].est, cls: "t3" }],
        tip: K.monthLabel(m) + " ekstresi: " + K.fmt(INT.byMonth[m].bank + INT.byMonth[m].est) })))
        + `<div class="lim-legend" style="margin-top:var(--s3)"><span><i class="t1"></i>bankanın yazdığı</span><span><i class="t3"></i>uygulamanın tahmini</span></div>
           <div class="faint" style="font-size:12px;margin-top:var(--s2)">Ekstreye bankanın yazdığı faizi girdiysen o, girmediysen önceki ekstreden kalan borç için tahmin kullanılır. Ekstre taksitlerinin faiz payı yukarıdaki yıllık toplamda var, grafikte yok.</div>`
        : `<div class="empty" style="padding:14px 8px">Bu aylarda ekstrelerine faiz girmemiş. 🎉</div>`}</div></div>`;

    /* ödeme geçmişi */
    const last = DB.payments.filter(PAY).slice().sort((a, b) => b.d < a.d ? -1 : b.d > a.d ? 1 : 0).slice(0, 10);
    const payHtml = `<div><div class="sec-title"><h2>Ödeme geçmişi</h2><span class="hint">aylık toplam · TL karşılığı</span></div>
      <div class="card">${paidN ? barsHtml(months.map((m, i) => ({ m, first: i === 0, parts: [{ v: PM[m].tl, cls: "t1" }],
        tip: K.monthLabel(m) + ": " + K.fmt(PM[m].tl) + " · " + PM[m].n + " ödeme" })))
        : `<div class="empty" style="padding:14px 8px">Bu aylarda ödeme girilmemiş.</div>`}</div></div>`;
    const lastHtml = last.length ? `<div class="sec-title"><h2>Son ödemeler</h2><span class="hint">en yeni ${last.length}</span></div>
      <div class="card"><div class="list">${last.map(p => {
        const c = K.cardById(DB, p.cardId);
        return `<div class="item" style="--bank:${c ? cardColor(c) : "var(--line-2)"}"><span class="bar"></span>
          <div><div class="t">${c ? esc(c.name) : "Silinmiş kart"}${p.ccy !== "TRY" ? ` <span class="pill">${p.ccy}</span>` : ""}</div><div class="m">${K.fmtDate(p.d, true)}${p.note ? " · " + esc(p.note) : ""}</div></div>
          <div class="r"><div class="amt" style="font-size:16px">${moneyHtml(+p.a || 0, p.ccy)}</div></div></div>`;
      }).join("")}</div></div>` : "";

    el.innerHTML = `
      <div style="margin-bottom:var(--s4)"><h2 style="font-size:22px">Raporlar</h2><div class="muted" style="font-size:14px">${K.monthLabel(months[0])} – ${K.monthLabel(nowYM)}</div></div>
      ${statsHtml}
      ${debtHtml}
      <div class="grid g2" style="margin-top:0">${intHtml}${payHtml}</div>
      ${lastHtml}
    `;
  }

  Object.assign(I, { renderRaporlar, interestByMonth, paymentsByMonth });
})();
