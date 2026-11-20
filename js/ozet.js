/* =====================================================================
   Kart Kokpiti — Özet ekranı
   app.js (kabuk) önce yüklenir; ortak yardımcılar App.I üzerinden gelir.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { ic, moneyHtml, COLORS, BANKS, persist, toast, mh, val, num, segVal, segHtml, activeCards, cardColor, ccyPill, accountOptions, currentStmtMonth, devirAt, limParts, hotAccounts, sharedNetTL, restructLeft, fmtTL0, rateText, chipClass, rateLine, esc, $, $$, loadDB, initTheme } = I;
  const pendOld = (...a) => I.pendOld(...a);
  const openPayoff = (...a) => I.openPayoff(...a);
  const openPlanner = (...a) => I.openPlanner(...a);
  const fetchRates = (...a) => I.fetchRates(...a);
  /* ================= ÖZET ================= */
  function welcomeHtml() {
    return `<div class="card" style="text-align:center;padding:42px 22px">
      <div style="font-size:40px">💳</div>
      <h2 style="font-size:24px;margin:var(--s3) 0 var(--s2)">Kart Kokpiti'ne hoş geldin</h2>
      <p class="muted" style="max-width:520px;margin:0 auto;line-height:1.65">Kredi kartlarını tek yerden takip et: ekstreler, ödemeler, asgari tutarlar,
      TL / Euro / Dolar hesapları ve ortak harcamalar. ${window.KK_FIREBASE ? "Veriler Firestore'a senkronize edilir, cihazlar arası görünür." : "Veriler yalnızca bu tarayıcıda durur."}</p>
      <div class="btnrow" style="justify-content:center;margin-top:var(--s5)">
        <button class="btn" data-act="addCard">+ İlk kartını ekle</button>
        <button class="btn ghost" data-act="importExcel">${ic("chart")} Eski Excel'imi aktar</button>
        <button class="btn ghost" data-act="importJSON">${ic("upload")} Yedek / eski uygulama verisi</button>
        <button class="btn ghost" data-act="loadDemo">Örnek veriyle dene</button>
      </div>
    </div>`;
  }

  /* dövizden TL'ye aktarılan kısım TL tarafında borca eklenir, döviz tarafında borçtan düşer (aynı borç iki kez sayılmaz) */
  const owedOf = r => r.amount + (r.convIn || 0) - (r.convOut || 0);
  const settledOf = r => r.paid + (r.refund || 0);

  function payRow(it, opts) {
    const r = it.row, c = it.card;
    const owed = owedOf(r);
    const prog = owed > 0 ? Math.min(100, Math.round(100 * settledOf(r) / owed)) : 100;
    const progCls = r.status === "late" ? "bad" : (r.rem <= K.EPS ? "ok" : (r.minGap <= K.EPS ? "ok" : ""));
    let meta;
    if (r.rem <= K.EPS) meta = `Tamamı ödendi · ${K.fmtDate(r.due)}`;
    else meta = `Son ödeme <b>${K.fmtDate(r.due)}</b>` + (r.minGap > K.EPS ? ` · asgari eksik <b class="${r.status === "late" ? "bad" : ""}">${K.fmt(r.minGap, it.ccy)}</b>` : ` · asgari ✓`);
    const A = it.accr || {};
    const interest = !(A.full > K.EPS) ? "" : r.rem > K.EPS
      ? `<div class="m bad">${ic("fire")} Faiz işliyor · şimdiye ${K.fmt(A.sofar, it.ccy)} · ${K.fmtDate(A.nextCut)}'e kadar ≈ ${K.fmt(A.full, it.ccy)}</div>`
      : `<div class="m warn">${ic("soon")} ${A.lateDays} gün geç kapandı · ≈ ${K.fmt(A.full, it.ccy)} faiz ${K.MONTHS[A.nextCut.getMonth()]} ekstresine gelecek</div>`;
    return `<div class="item ${opts && opts.dim ? "dim" : ""}" data-card="${c.id}" data-ccy="${it.ccy}" style="--bank:${cardColor(c)}">
      <span class="bar"></span>
      <div>
        <div class="t">${esc(c.name)} ${ccyPill(it.ccy)} <span class="chip ${chipClass(r)}">${esc(r.label)}</span></div>
        <div class="m">${meta}</div>
        ${interest}
        ${prog > 0 ? `<div class="progress ${progCls}"><i style="width:${prog}%"></i></div>` : ""}
      </div>
      <div class="r">
        <div class="amt">${moneyHtml(r.rem, it.ccy)}</div>
        <div class="m">${K.MONTHS[+r.month.slice(5) - 1]} ekstresi${(r.paid + (r.refund || 0)) > K.EPS ? " " + K.fmt(r.amount, it.ccy) : ""}</div>
        <div class="acts">
          ${r.rem > K.EPS ? `<button class="btn sm" data-act="pay" data-card="${c.id}" data-ccy="${it.ccy}">Öde</button>` : ""}
          <button class="btn sm ghost" data-act="cardDetail" data-card="${c.id}" data-ccy="${it.ccy}">Detay</button>
        </div>
      </div>
    </div>`;
  }

  function renderOzet() {
    const el = $("#page-ozet"), DB = App.DB, t = App.today();
    if (!DB.cards.length) { el.innerHTML = welcomeHtml(); return; }
    const S = K.summary(DB, t);
    const nowYM = S.nowYM;

    /* uyarılar */
    const alerts = [];
    if (S.late.length > 2) {
      const gapTL = S.late.reduce((a, i) => a + (K.toTL(DB, i.row.minGap, i.ccy, nowYM) || 0), 0);
      alerts.push(`<div class="alert bad"><span class="ic">${ic("late")}</span><div class="grow"><b>${S.late.length} hesapta son ödeme tarihi geçti</b> (${S.late.map(i => esc(i.card.name) + (i.ccy !== "TRY" ? " " + i.ccy : "")).join(", ")}) — toplam asgari eksik ≈ <b>${K.fmt(gapTL)}</b>. Yaptığın ödemeleri girmediysen şimdi gir; gerçekten ödenmediyse gecikme faizi işliyor.</div><button data-act="quickPay">Ödeme gir</button></div>`);
    } else S.late.forEach(i => alerts.push(`<div class="alert bad"><span class="ic">${ic("late")}</span><div class="grow"><b>${esc(i.card.name)} ${i.ccy === "TRY" ? "" : i.ccy}</b> son ödeme tarihi ${-i.row.daysToDue} gün önce geçti — asgari eksik <b>${K.fmt(i.row.minGap, i.ccy)}</b>. Gecikme faizi işliyor ve sicile yansıyabilir.</div><button data-act="pay" data-card="${i.card.id}" data-ccy="${i.ccy}">Şimdi öde</button></div>`));
    /* yakın son ödeme: "Sıradaki iş" kartı zaten taşıyor; diğer kartlar için kart başına tek uyarı (TL + döviz birleşik) */
    const nextCard0 = (S.items.filter(i => i.row.rem > K.EPS && i.row.daysToDue >= 0)[0] || {}).card;
    {
      const byCard = new Map();
      S.open.filter(i => i.row.status === "due" && i.row.daysToDue <= 3 && !(nextCard0 && i.card.id === nextCard0.id)).forEach(i => { if (!byCard.has(i.card.id)) byCard.set(i.card.id, []); byCard.get(i.card.id).push(i); });
      byCard.forEach(list => {
        const i = list[0];
        alerts.push(`<div class="alert warn"><span class="ic">${ic("soon")}</span><div class="grow"><b>${esc(i.card.name)}</b> için ${i.row.daysToDue === 0 ? "<b>bugün son gün</b>" : "son ödemeye <b>" + i.row.daysToDue + " gün</b> kaldı"} — en az ${list.map(x => K.fmt(x.row.minGap, x.ccy)).join(" + ")} ödemelisin.</div><button data-act="pay" data-card="${i.card.id}" data-ccy="${i.ccy}">Öde</button></div>`);
      });
    }
    {
      const limMiss = K.limitUsage(DB, t).flatMap(l => l.missing);
      const missC = [...new Set(S.missingRate.concat(limMiss.map(m => m.ccy)))];
      if (missC.length) alerts.push(`<div class="alert warn"><span class="ic">${ic("fx")}</span><div class="grow"><b>${missC.map(c => K.CCY_SYM[c] + " " + K.CCY_NAME[c]).join(", ")} kuru girilmemiş</b> — ${limMiss.length ? limMiss.map(m => esc(m.card) + " " + K.fmt(m.amount, m.ccy)).join(", ") + " limite ve " : ""}TL toplamlarına eklenmiyor.</div><button data-act="fetchRates">Kuru çek</button>&nbsp;&nbsp;<button data-act="goSettings">Elle gir</button></div>`);
    }
    {
      // faiz işleyen kartta yeni harcama → borç ve sonraki ekstrenin faiz kademesi büyür
      const spendC = activeCards().find(c => c.spendCard);
      const hot = activeCards().map(c => {
        const H = hotAccounts(c); if (!H.length) return null;
        const v = H.reduce((a, h) => { const P = K.pendingLoad(DB, c, h.ccy, t); const r = P.periodRow; const sp = r ? (r.estimate ? r.spend : Math.max(0, r.fresh)) : 0; return a + (K.toTL(DB, sp, h.ccy, nowYM) || 0); }, 0);
        return v > K.EPS ? { c, v } : null;
      }).filter(Boolean);
      if (hot.length) alerts.push(`<div class="alert warn"><span class="ic">${ic("fire")}</span><div class="grow"><b>${hot.map(h => esc(h.c.name)).join(", ")}</b> kartında faiz işlerken bu dönem <b>${K.fmt(hot.reduce((a, h) => a + h.v, 0))}</b> yeni harcama var. Faiz işleyen kartla harcamak borcu büyütür ve sonraki ekstreyi üst faiz kademesine taşıyabilir.${spendC && !hot.some(h => h.c.id === spendC.id) ? ` Harcamaları <b>${esc(spendC.name)}</b>'a topla.` : spendC ? "" : " Bir kartı \"harcama kartım\" olarak işaretleyip harcamaları ona toplayabilirsin."}</div><button data-act="cardDetail" data-card="${hot[0].c.id}">Bak</button></div>`);
      if (spendC && hotAccounts(spendC).length && !hot.some(h => h.c.id === spendC.id)) alerts.push(`<div class="alert warn"><span class="ic">${ic("fire")}</span><div class="grow">Harcama kartın <b>${esc(spendC.name)}</b>'da da faiz işliyor — harcama kartının her ay tamamını ödemek gerekiyor, yoksa başka bir kart seç.</div><button data-act="editCard" data-card="${spendC.id}">Değiştir</button></div>`);
    }
    S.open.filter(i => i.ccy !== "TRY" && (i.row.status === "carry" || i.row.status === "late") && K.accountsOf(i.card).includes("TRY")).forEach(i => alerts.push(`<div class="alert info"><span class="ic">${ic("fx")}</span><div class="grow"><b>${esc(i.card.name)} ${i.ccy}</b> ekstresinden kalan <b>${K.fmt(i.row.rem, i.ccy)}</b> son ödemede (${K.fmtDate(i.row.due)}) ödenmedi. Banka bunu TL'ye çevirip TL hesabına aktardıysa işaretle; borç TL tarafına geçsin.</div><button data-act="convertFx" data-card="${i.card.id}" data-ccy="${i.ccy}">TL'ye çevrildi</button></div>`));
    const unset = activeCards().filter(c => c.daysUnset);
    if (unset.length) alerts.push(`<div class="alert info"><span class="ic">${ic("calendar")}</span><div class="grow"><b>${unset.map(c => esc(c.name)).join(", ")}</b> için kesim / son ödeme günü varsayılan değerde. Doğru girersen tarihler ve gecikme uyarıları doğru çalışır.</div><button data-act="editCard" data-card="${unset[0].id}">Düzelt</button></div>`);
    const lb = DB.meta.lastBackup ? K.parseISO(DB.meta.lastBackup) : null;
    if (!window.KK_FIREBASE && DB.statements.length && (!lb || K.dayDiff(lb, t) > 30)) alerts.push(`<div class="alert info"><span class="ic">${ic("save")}</span><div class="grow">${lb ? "Son yedeğin " + K.dayDiff(lb, t) + " gün önce." : "Henüz yedek almadın."} Veriler sadece bu tarayıcıda — tarayıcı verisi silinirse kaybolur.</div><button data-act="exportJSON">Yedek indir</button></div>`);

    /* sağ istatistikler + gelecek aylar */
    const F = K.forecast(DB, 12, t);
    let upTL = 0, upMiss = false;
    F.forEach(m => m.items.forEach(i => {
      if (i.month !== K.nextPeriodMonth(i.card, t) || i.amount <= K.EPS || i.source === "interest") return;
      const v = K.toTL(DB, i.amount, i.ccy, m.month); if (v == null) upMiss = true; else upTL += v;
    }));
    const stale = S.items.filter(i => i.row.estimate);
    {
      const oldP = (DB.pending || []).filter(pendOld);
      if (oldP.length) alerts.push(`<div class="alert warn"><span class="ic">${ic("hourglass")}</span><div class="grow"><b>${oldP.map(x => { const k = K.cardById(DB, x.cardId); return (k ? esc(k.name) : "?") + " " + K.fmt(x.amountTL, "TRY"); }).join(", ")}</b> bekleyende ${K.dayDiff(K.parseISO(oldP[0].d), t)} gündür duruyor — karta yansıdıysa "Yansıdı" de.</div><button data-act="cardDetail" data-card="${oldP[0].cardId}">Bak</button></div>`);
    }
    if (stale.length) alerts.push(`<div class="alert warn"><span class="ic">${ic("receipt")}</span><div class="grow"><b>${stale.map(i => esc(i.card.name) + (i.ccy !== "TRY" ? " " + i.ccy : "")).join(", ")}</b> ekstresi kesildi. Şu an dönem içi harcaman + taksitlerle hesaplanıyor; bankadaki <b>dönem borcunu</b> girersen asgari ve son ödeme kesinleşir.</div><button data-act="editStatement" data-id="${stale[0].row.id}">Ekstreyi gir</button></div>`);
    let sharedTL = 0; const sharedWho = [];
    DB.shared.people.forEach(p => {
      const b = K.sharedBalance(DB, p.id);
      const v = K.CCYS.reduce((a, c) => a + (K.toTL(DB, b[c], c, nowYM) || 0), 0);
      if (Math.abs(v) > 0.5) { sharedTL += v; sharedWho.push(p.name); }
    });
    const minCount = S.open.filter(i => i.row.minGap > K.EPS).length;

    /* tek para birimi (sadece TL) ise büyük tutarın altında aynı rakamı tekrar etme */
    const debtCcys = K.CCYS.filter(c => S.debt[c] > K.EPS);
    const ccyChips = (debtCcys.length === 0 ? "<span>Borç yok 🎉</span>" : debtCcys.length === 1 && debtCcys[0] === "TRY" ? "" : debtCcys.map(c => `<span>${K.fmt(S.debt[c], c)}</span>`).join(""))
      + K.CCYS.filter(c => S.credit[c] > K.EPS).map(c => `<span style="background:rgba(255,255,255,.28)">+${K.fmt(S.credit[c], c)} alacak</span>`).join("");

    const open = S.items.filter(i => i.row.rem > K.EPS);
    const closed = S.items.filter(i => i.row.rem <= K.EPS);

    /* gelecek aylar */
    const srcChip = { estimate: '<span class="chip soon">dönem içi</span>', inst: '<span class="chip carry">taksit</span>', statement: '<span class="chip future">girildi</span>', pending: '<span class="chip soon" style="background:var(--warn-soft);color:var(--warn)">bekleyen</span>', interest: '<span class="chip late">faiz</span>' };
    const FS = F.filter(m => m.items.length);   // sadece bir şey girilmiş aylar
    const fcColHtml = (m, idx) => `<div class="fc-col ${idx === 0 ? "first" : ""}">
        <div class="fc-h"><b>${K.MONTHS[+m.month.slice(5) - 1]} ekstresi</b><span>${m.month.slice(0, 4)}</span></div>
        <div class="fc-total num">${moneyHtml(m.tl)}${m.missingRate ? "*" : ""}</div>
        <div class="fc-sub">${(m.byCcy.EUR || m.byCcy.USD) ? K.fmtMulti(m.byCcy, { noDec: true }) : (idx === 0 ? "bu dönem" : "eklenecek")}</div>
        <div class="fc-lines">${m.items.length ? m.items.map(i => `<button class="fc-line" data-act="${i.source === "pending" || i.source === "interest" ? "cardDetail" : "periodOne"}" data-card="${i.card.id}" data-ccy="${i.ccy}" data-month="${m.month}" title="${esc(i.card.name)} · kesim ${K.fmtDate(i.cut)}${i.inst ? " · taksit " + K.fmt(i.inst, i.ccy) : ""}">
            <span class="dot" style="background:${cardColor(i.card)}"></span><span class="nm">${esc(i.card.name)}${i.ccy !== "TRY" ? " " + i.ccy : ""}</span>${i.source === "estimate" && m.month !== K.nextPeriodMonth(i.card, t) ? '<span class="chip soon">girildi</span>' : (srcChip[i.source] || "")}<span class="v num">${moneyHtml(i.amount, i.ccy)}</span></button>`).join("") : ""}
        </div>
      </div>`;

    /* trend */
    const TL = K.spendTimeline(DB, t);
    const maxAll = Math.max(1, ...TL.map(x => x.total));
    const maxT = maxAll;   // ölçek 0'dan başlar, kırpma yok: çubuk boyları değerle orantılı
    const hasFut = TL.some(x => x.period + x.future > K.EPS), hasCut = TL.some(x => x.cut > K.EPS);
    const initM = TL.filter(x => x.initial).map(x => x.month);
    const sepAt = TL.find(x => x.month > nowYM && x.cut <= K.EPS);
    const pctH = v => `calc((100% - 74px) * ${(v / maxT).toFixed(4)})`;
    const bars = TL.map(x => {
      const tip = [K.monthLabel(x.month) + ": " + K.fmt(x.total)];
      if (x.cut > K.EPS && (x.period + x.future) > K.EPS) tip.push("kesildi " + K.fmt(x.cut));
      if (x.period > K.EPS && (x.cut + x.future) > K.EPS) tip.push("bu dönem " + K.fmt(x.period));
      if (x.future > K.EPS && (x.cut + x.period) > K.EPS) tip.push("gelecek " + K.fmt(x.future));
      if (x.initial) tip.push("ilk ekstre · önceki borç dahil");
      if (x.missingRate) tip.push("bazı dövizli tutarlar kur olmadığı için eklenmedi");
      return `<div class="b ${sepAt && sepAt.month === x.month && hasCut ? "sep" : ""}" title="${tip.join(" · ")}"><div class="bcol"><em>${x.total > 0 ? K.fmt(x.total) : ""}</em>
        <div class="bstack" style="height:${x.total > 0 ? pctH(x.total) : "2px"}">${x.future > K.EPS ? `<i class="t3" style="flex:${x.future}"></i>` : ""}${x.period > K.EPS ? `<i class="t2" style="flex:${x.period}"></i>` : ""}${x.cut > K.EPS ? `<i class="t1" style="flex:${x.cut}"></i>` : ""}</div></div>
        <span>${K.MONTHS_SHORT[+x.month.slice(5) - 1]}${x.initial ? "*" : ""}${x.month.slice(5) === "01" || x === TL[0] ? `<small>${x.month.slice(2, 4)}</small>` : ""}</span></div>`;
    }).join("");
    const trendHtml = TL.length ? `<div class="bars">${bars}</div>
      <div class="lim-legend" style="margin-top:var(--s3)">${hasCut ? '<span><i class="t1"></i>kesildi</span>' : ""}${TL.some(x => x.period > K.EPS) ? '<span><i class="t2"></i>bu dönem</span>' : ""}${TL.some(x => x.future > K.EPS) ? '<span><i class="t3"></i>gelecek (girilen + taksit)</span>' : ""}</div>
      ${initM.length ? `<div class="faint" style="font-size:12px;margin-top:var(--s2)">* ${initM.map(m => K.monthLabel(m)).join(", ")}: uygulamaya girilen ilk ekstre — önceki aylardan devreden borç da içinde, o yüzden yüksek görünür.</div>` : ""}`
      : `<div class="empty" style="padding:14px 8px">Ekstre ya da dönem içi harcama girince aylara göre burada görünür.</div>`;

    /* limit */
    const lims = K.limitUsage(DB, t).filter(l => l.limit > 0 || l.used > 0);
    const limHtml = lims.map(l => {
      const L = l.limit || 0;
      const w = v => L ? Math.max(0, Math.min(100, 100 * v / L)) : 0;
      const pct = L ? Math.max(0, Math.round(100 * l.used / L)) : 0;
      const lp = limParts(l);
      const limCls = pct >= 90 ? "bad" : pct >= 70 ? "warn" : "";
      const head = L ? `%${pct} dolu · <b class="${l.avail < 0 ? "bad" : ""}">${moneyHtml(l.avail)}</b> kullanılabilir` : K.fmt(l.used, "TRY", { noDec: true }) + " kullanımda · limit girilmemiş";
      return `<div class="lim"><div class="h"><b>${esc(l.name)}</b><span>${head}</span></div>
        <div class="progress ${limCls}" title="%${pct} dolu"><i style="width:${w(l.used)}%"></i></div>
        <div class="lim-legend">${lp.credit > K.EPS ? `<span class="ok">alacak +${K.fmt(lp.credit, "TRY", { noDec: true })}</span>` : `<span>borç ${K.fmt(l.debt, "TRY", { noDec: true })}</span>`}${l.period > K.EPS ? `<span>dönem içi / girilen ${K.fmt(l.period, "TRY", { noDec: true })}</span>` : ""}${l.inst > K.EPS ? `<span>kalan taksit ${K.fmt(l.inst, "TRY", { noDec: true })}</span>` : ""}${l.prov > K.EPS ? `<span>bekleyen ${K.fmt(l.prov, "TRY", { noDec: true })}</span>` : ""}${L ? `<span class="faint">limit ${K.fmt(L, "TRY", { noDec: true })}</span>` : ""}</div>
        ${l.fx.length ? `<div class="fx-lines">${l.fx.map(f => `${esc(f.card)} ${f.ccy}: ${K.fmt(f.amount, f.ccy)} × ${String(f.rate).replace(".", ",")} = <b>${K.fmt(f.tl, "TRY", { noDec: true })}</b>`).join("<br>")}<span class="faint"> — limitten düştü</span></div>` : ""}
        ${l.missing.length ? `<div class="fx-miss">⚠ ${l.missing.map(m => esc(m.card) + " " + K.fmt(m.amount, m.ccy)).join(", ")} — ${[...new Set(l.missing.map(m => m.ccy))].map(c => K.CCY_SYM[c]).join("/")} kuru girilmediği için limite eklenmedi. <button class="linkbtn" data-act="fetchRates">Kuru çek</button></div>` : ""}
        ${l.kind === "group" ? `<div class="faint" style="font-size:12px;margin-top:var(--s1)">${esc(l.sub)} · ortak limit</div>` : ""}</div>`;
    }).join("");

    /* uyarıları önem sırasına koy (gecikmiş > yakın > bilgi), ilk 3'ü göster, kalanı katla */
    const aRank = h => /class="alert bad"/.test(h) ? 0 : /class="alert warn"/.test(h) ? 1 : 2;
    const sortedAlerts = alerts.map((h, i) => ({ h, i })).sort((a, b) => aRank(a.h) - aRank(b.h) || a.i - b.i).map(x => x.h);
    const ALERT_SHOW = window.matchMedia && window.matchMedia("(max-width:620px)").matches ? 1 : 3;   // mobilde ilk ekran uyarılarla dolmasın
    const alertsHtml = sortedAlerts.length <= ALERT_SHOW + 1
      ? sortedAlerts.join("")
      : sortedAlerts.slice(0, ALERT_SHOW).join("") + `<details class="alert-more"><summary>+${sortedAlerts.length - ALERT_SHOW} uyarı daha</summary>${sortedAlerts.slice(ALERT_SHOW).join("")}</details>`;

    /* sıradaki iş: en yakın son ödemesi olan açık hesap */
    const nextItem = open.filter(i => i.row.daysToDue >= 0)[0];
    const nextHtml = nextItem ? (() => {
      const r = nextItem.row, c = nextItem.card;
      const when = r.daysToDue === 0 ? "bugün son gün" : r.daysToDue + " gün sonra";
      const same = open.filter(i => i.card.id === c.id && +i.row.due === +r.due && i.row.minGap > K.EPS);   // aynı kartın TL + döviz hesapları birlikte
      const need = same.length ? `En az <b>${same.map(i => K.fmt(i.row.minGap, i.ccy)).join(" + ")}</b> öde` : `Asgari ödendi ✓ · tamamı <b>${K.fmt(r.rem, nextItem.ccy)}</b>`;
      return `<div class="next-card ${r.daysToDue <= 3 && r.minGap > K.EPS ? "urgent" : ""}" style="--bank:${cardColor(c)}"><span class="bar"></span>
        <div class="grow"><div class="k">Sıradaki iş</div><div class="t"><b>${esc(c.name)}${nextItem.ccy !== "TRY" ? " " + nextItem.ccy : ""}</b> · ${K.fmtDate(r.due)} (${when})</div><div class="m">${need}</div></div>
        <button class="btn" data-act="pay" data-card="${c.id}" data-ccy="${nextItem.ccy}">Öde</button></div>`;
    })() : "";

    /* ay başı (ilk 10 gün): geçen ayın kısa özeti — ödemeler, ekstrelere giren faiz, kesilmiş borcun değişimi */
    const recapHtml = (() => {
      if (t.getDate() > 10 || !I.paymentsByMonth) return "";
      const lastYM = K.ymAdd(nowYM, -1);
      const [y, m] = lastYM.split("-").map(Number);
      const endLast = new Date(y, m, 0), endPrev = new Date(y, m - 1, 0);
      const P = I.paymentsByMonth(DB, [lastYM])[lastYM];
      if (!P.n && !DB.statements.some(s => s.month === lastYM)) return "";
      const IB = I.interestByMonth(DB, [lastYM], endLast).byMonth[lastYM];
      const fz = IB.bank + IB.est;
      const d = K.summary(DB, endLast).totalTL - K.summary(DB, endPrev).totalTL;
      const dTxt = Math.abs(d) < 1 ? "borç aynı kaldı" : d < 0 ? `borç <b class="ok">${K.fmt(-d, "TRY", { noDec: true })} azaldı</b>` : `borç <b class="bad">${K.fmt(d, "TRY", { noDec: true })} arttı</b>`;
      return `<div class="recap-card" style="order:0"><div class="k">${K.MONTHS[m - 1]} özeti</div>
        <div class="t"><b>${P.n}</b> ödeme · <b>${K.fmt(P.tl, "TRY", { noDec: true })}</b> ödendi</div>
        <div class="m">${fz > K.EPS ? `ekstrelere <b>${K.fmt(fz, "TRY", { noDec: true })}</b> faiz girdi${IB.bank > K.EPS ? "" : " (tahmini)"}` : "faiz ödenmedi ✓"} · ${dTxt}</div>
        <button class="linkbtn" data-act="goReports">Raporlarda gör</button></div>`;
    })();

    const heroHtml = `
        <div class="card hero-main">
          <div class="lbl">Toplam borcun (TL karşılığı)</div>
          <div class="big">${moneyHtml(S.totalTL)}</div>
          <div class="ccys">${ccyChips}</div>
          <div class="foot">Kesilmiş ekstrelerden kalan · ${rateLine()} · ${t.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</div>
          ${(() => { const N = sharedNetTL(); return N.total > 0.5 ? `<div class="foot" style="margin-top:var(--s1)">${esc(N.who.join(", "))}'den alacağın <b>${K.fmt(N.total)}</b> düşülünce net borç: <b>${K.fmt(S.totalTL - N.total)}</b></div>` : ""; })()}
          ${(() => {
            const lines = [];
            const R = restructLeft(DB, t);
            if (R.total > K.EPS) lines.push(`+ taksitlendirilen ekstreler: <b>${K.fmt(R.total)}</b> (${R.count} taksit kaldı, gelecek ekstrelere gelecek)`);
            const IR = K.interestReport(DB, t.getFullYear(), t);
            if (IR.total > K.EPS || IR.accruing > K.EPS) {
              const br = [IR.bank > K.EPS ? "bankadan " + K.fmt(IR.bank) : "", IR.est > K.EPS ? "tahmini " + K.fmt(IR.est) : "", IR.inst > K.EPS ? "ekstre taksiti " + K.fmt(IR.inst) : ""].filter(Boolean).join(" · ");
              if (IR.total > K.EPS) lines.push(`${t.getFullYear()} yılında ekstrelere giren faiz: <b>${K.fmt(IR.total)}</b> <span style="opacity:.8">(${br})</span>`);
              if (IR.accruing > K.EPS) lines.push(`şu an işleyen faiz: <b>${K.fmt(IR.accruing)}</b> <span style="opacity:.8">(sonraki ekstrelere gelecek)</span>`);
            }
            return lines.length ? `<details class="hero-more"><summary>Detaylar</summary>${lines.map(l => `<div class="foot">${l}</div>`).join("")}</details>` : "";
          })()}
          <div class="btnrow"><button class="btn sm" data-act="quickPay">${ic("card")} Ödeme yaptım</button><button class="btn sm ghost" data-act="openPlanner">${ic("bulb")} Elimdeki parayı dağıt</button><button class="btn sm ghost" data-act="openPayoff">${ic("flag")} Borç bitiş planı</button></div>
          ${(() => {
            const tot = S.items.reduce((a, i) => a + (K.toTL(DB, Math.max(0, owedOf(i.row)), i.ccy, nowYM) || 0), 0);
            const paid = S.items.reduce((a, i) => a + (K.toTL(DB, Math.max(0, Math.min(settledOf(i.row), owedOf(i.row))), i.ccy, nowYM) || 0), 0);
            if (!(tot > 0)) return "";
            return `<div class="hero-prog"><div class="row"><span>Güncel ekstrelerde ödenen</span><span>${K.fmt(paid, "TRY", { noDec: true })} / ${K.fmt(tot, "TRY", { noDec: true })}</span></div>
              <div class="progress"><i style="width:${Math.min(100, Math.round(100 * paid / tot))}%"></i></div></div>`;
          })()}
        </div>`;
    const payListHtml = open.length ? open.map(i => payRow(i)).join("") : `<div class="empty">${S.items.length ? "Açık ekstre yok — tüm güncel ekstreler ödendi 🎉" : "Henüz ekstre girilmemiş. Bankandan gelen son ekstrenin <b>dönem borcunu</b> gir; son ödeme tarihi ve asgari otomatik hesaplanır."}<br><button class="btn sm soft" style="margin-top:var(--s3)" data-act="quickStatement">${S.items.length ? "Yeni ekstre gir" : "İlk ekstreyi gir"}</button></div>`;
    const closedHtml = closed.length ? `<details style="margin-top:var(--s2)"><summary class="faint" style="cursor:pointer;font-size:13px;padding:8px 4px">Bu dönem kapananlar (${closed.length})</summary><div class="list">${closed.map(i => payRow(i, { dim: true })).join("")}</div></details>` : "";

    /* ---------- seriler: ay sonu borcu (kesilmiş ekstrelerden kalan), aylık faiz ---------- */
    const monthEnd = ym => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m, 0); return d > t ? t : d; };
    const firstYM = DB.statements.reduce((a, s) => !a || s.month < a ? s.month : a, null) || nowYM;
    const serMonths = [];
    for (let m = K.ymAdd(nowYM, -23); m <= nowYM; m = K.ymAdd(m, 1)) if (m >= firstYM) serMonths.push(m);
    const debtSer = serMonths.map(m => m === nowYM ? S.totalTL : K.summary(DB, monthEnd(m)).totalTL);
    const last6 = serMonths.slice(-6), debt6 = debtSer.slice(-6);
    const IR = K.interestReport(DB, t.getFullYear(), t);
    const fzMonth = I.interestByMonth ? I.interestByMonth(DB, last6, t).byMonth : {};
    const fz6 = last6.map(m => fzMonth[m] ? fzMonth[m].bank + fzMonth[m].est : 0);
    const spark = vals => {
      if (vals.length < 2) return "";
      const mx = Math.max(...vals), mn = Math.min(0, ...vals), SW = 84, SH = 26, r = (mx - mn) || 1;
      const pts = vals.map((v, i) => `${(i * SW / (vals.length - 1)).toFixed(1)},${(SH - 2 - (v - mn) / r * (SH - 4)).toFixed(1)}`);
      return `<svg class="spark" viewBox="0 0 ${SW} ${SH}" preserveAspectRatio="none" aria-hidden="true"><polygon class="area" points="0,${SH} ${pts.join(" ")} ${SW},${SH}"/><polyline points="${pts.join(" ")}"/></svg>`;
    };
    const delta = (vals, goodDown) => {
      if (vals.length < 2) return "";
      const d = vals[vals.length - 1] - vals[vals.length - 2];
      if (Math.abs(d) < 1) return `<span class="dl">geçen ayla aynı</span>`;
      const up = d > 0, good = goodDown ? !up : up;
      return `<span class="dl ${good ? "good" : "badd"}">${up ? "▲" : "▼"} ${K.fmt(Math.abs(d), "TRY", { noDec: true })} <small>geçen aya göre</small></span>`;
    };

    /* ---------- 1) rakam şeridi ---------- */
    const limTot = lims.filter(l => l.limit > 0).reduce((a, l) => ({ used: a.used + Math.max(0, l.used), limit: a.limit + l.limit }), { used: 0, limit: 0 });
    const limPctAll = limTot.limit ? Math.round(100 * limTot.used / limTot.limit) : null;
    const kpi = (act, title, k, v, sub, right) => `<button class="kpi card" data-act="${act}" title="${title}"><span class="k">${k}</span><span class="row"><span class="v">${v}</span>${right || ""}</span><span class="s">${sub}</span></button>`;
    const kpisHtml = `<div class="kpis">
      ${kpi("goReports", "Raporlarda borcun seyrini gör", "Toplam borç", moneyHtml(S.totalTL), delta(debt6, true) || "kesilmiş ekstrelerden kalan", spark(debt6))}
      ${kpi("goPayList", "Ödeme takvimine git", "Bu dönem asgari", `<span class="${S.late.length ? "bad" : ""}">${moneyHtml(S.minDueTL)}</span>`, minCount ? minCount + " hesapta asgari eksik" : "tüm asgariler ödendi ✓")}
      ${kpi("periodUpdate", "Dönem içi harcamaları güncelle", "Bu dönem harcaman", moneyHtml(upTL) + (upMiss ? "*" : ""), "kesilmedi · dönem içi + taksit + bekleyen")}
      ${kpi("goCards", "Kartlara git", "Limit doluluğu", limPctAll == null ? "—" : "%" + limPctAll, limPctAll == null ? "limit girilmemiş" : `<span class="mini-prog"><i class="${limPctAll >= 90 ? "bad" : limPctAll >= 70 ? "warn" : ""}" style="width:${Math.min(100, limPctAll)}%"></i></span>${K.fmt(limTot.limit - limTot.used, "TRY", { noDec: true })} kullanılabilir`)}
      ${kpi("goReports", "Raporlarda aylık faizi gör", t.getFullYear() + " faizi", `<span class="${IR.total + IR.accruing > K.EPS ? "bad" : "ok"}">${moneyHtml(IR.total + IR.accruing)}</span>`, IR.accruing > K.EPS ? "işleyen " + K.fmt(IR.accruing, "TRY", { noDec: true }) + " dahil" : "ekstrelere giren", spark(fz6))}
    </div>`;

    /* ---------- kutular ---------- */
    const wh = (title, hint, go) => `<div class="wh"><h3>${title}</h3>${hint ? `<span class="hint">${hint}</span>` : ""}${go ? `<button class="linkbtn go" data-act="${go[0]}">${go[1]} →</button>` : ""}</div>`;
    const W = {};
    W.hero = { size: "w8 tall", name: "Toplam borç", html: heroHtml };
    if (nextHtml) W.next = { size: "w4", name: "Sıradaki iş", html: nextHtml };
    W.pay = { size: "w8 tall", name: "Ödeme takvimi", html: `<div class="card" id="payList">${wh("Ödeme takvimi", "son ödeme tarihine göre")}<div class="list">${payListHtml}</div>${closedHtml}</div>` };

    /* 8) canlı faiz sayacı */
    let fzBase = 0, fzDay = 0;
    S.open.forEach(i => {
      const A = i.accr; if (!(A && A.full > K.EPS) || i.row.rem <= K.EPS) return;
      const rt = K.toTL(DB, 1, i.ccy, nowYM) || 0;
      fzBase += A.sofar * rt;
      fzDay += (A.full - A.sofar) / Math.max(1, K.dayDiff(t, new Date(A.nextCut))) * rt;
    });
    W.faiz = { size: "w4", name: "İşleyen faiz", html: `<div class="card clickable" data-act="goReports" title="Raporlarda aylık faizi gör">${wh("Şu an işleyen faiz", "canlı")}
      ${fzDay > K.EPS ? `<div class="fz-num" data-base="${fzBase}" data-day="${fzDay}">${K.fmt(fzBase)}</div><div class="fz-sub">günde ≈ <b>${K.fmt(fzDay)}</b> · ödemediğin her saniye artıyor</div>`
        : `<div class="fz-num ok">${K.fmt(0)}</div><div class="fz-sub">Şu an faiz işleyen hesap yok ✓</div>`}
      <div class="fz-sub faint">${t.getFullYear()} yılında ekstrelere giren: ${K.fmt(IR.total)}</div></div>` };

    /* 6) mini ay takvimi */
    {
      const y = t.getFullYear(), mo = t.getMonth(), nd = new Date(y, mo + 1, 0).getDate(), lead = (new Date(y, mo, 1).getDay() + 6) % 7;
      const ev = {}; const add = (d, e) => { (ev[d] = ev[d] || []).push(e); };
      activeCards().forEach(c => {
        add(Math.min(c.cutDay, nd), { c, type: "cut" });
        const rows = S.items.filter(i => i.card.id === c.id && i.row.due.getFullYear() === y && i.row.due.getMonth() === mo);
        if (rows.length) add(rows[0].row.due.getDate(), { c, type: "due", done: rows.every(i => i.row.rem <= K.EPS) });
        else add(Math.min(c.dueDay, nd), { c, type: "due" });
      });
      let cells = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map(d => `<span class="dh">${d}</span>`).join("") + "<span></span>".repeat(lead);
      for (let d = 1; d <= nd; d++) {
        const es = ev[d] || [];
        const due = es.find(e => e.type === "due");
        const tip = es.map(e => e.c.name + (e.type === "cut" ? " · ekstre kesimi" : e.done ? " · son ödeme (ödendi)" : " · son ödeme")).join("\n");
        cells += `<button type="button" class="d ${es.length ? "ev" : ""} ${d === t.getDate() ? "today" : d < t.getDate() ? "past" : ""}" ${es.length ? `data-act="cardDetail" data-card="${(due || es[0]).c.id}" title="${esc(tip)}"` : `tabindex="-1"`}>${d}<span class="dots">${es.slice(0, 4).map(e => `<i class="${e.type}${e.done ? " done" : ""}" style="${e.type === "cut" ? "color" : "background"}:${cardColor(e.c)}"></i>`).join("")}</span></button>`;
      }
      W.cal = { size: "w4", name: "Bu ayın takvimi", html: `<div class="card">${wh(K.MONTHS[mo] + " " + y, "● son ödeme · ○ kesim")}<div class="mcal">${cells}</div></div>` };
    }

    /* 7) önümüzdeki 6 ayın nakit ihtiyacı (ekstreye girecek tutarlar), tıklanan ayın dökümü altta */
    {
      const F6 = FS.slice(0, 6);
      const sel = F6.find(m => m.month === App.fcSel) || F6[0];
      const mx = Math.max(1, ...F6.map(m => m.tl));
      const bars = F6.map((m, idx) => {
        const byCard = new Map();
        m.items.forEach(i => byCard.set(i.card.id, { c: i.card, v: (byCard.get(i.card.id) || { v: 0 }).v + (K.toTL(DB, i.amount, i.ccy, m.month) || 0) }));
        const segs = [...byCard.values()].filter(x => x.v > 0.5);
        return `<button type="button" class="cbar ${m === sel ? "on" : ""}" data-act="fcSel" data-month="${m.month}" title="${K.monthLabel(m.month)}: ${K.fmt(m.tl)}${segs.map(x => "\n" + esc(x.c.name) + " " + K.fmt(x.v)).join("")}">
          <span class="col"><em>${K.fmt(m.tl, "TRY", { noDec: true })}</em><span class="stk" style="height:${Math.max(1.5, 100 * m.tl / mx).toFixed(2)}%">${segs.map(x => `<i style="flex:${x.v};background:${cardColor(x.c)}"></i>`).join("")}</span></span>
          <span class="ml">${K.MONTHS_SHORT[+m.month.slice(5) - 1]}${idx === 0 ? " <small>bu dönem</small>" : ""}</span></button>`;
      }).join("");
      W.cash = { size: "w12", name: "Önümüzdeki 6 ay", html: `<div class="card">${wh("Önümüzdeki 6 ay", "ekstrelere girecek tutarlar · aya tıkla, dökümü aşağıda", ["periodUpdate", "Dönem içini güncelle"])}
        ${F6.length ? `<div class="cash-split"><div class="cbars">${bars}</div><div class="fc-grid one">${fcColHtml(sel, F6.indexOf(sel))}</div></div>` : `<div class="empty" style="padding:14px 8px">Henüz dönem içi harcama ya da taksit yok. Bankanın uygulamasındaki dönem içi harcamaları ya da taksitlerini ekle — burada aylara göre görünür.</div>`}
        <div class="btnrow" style="margin-top:var(--s3)"><button class="btn sm ghost" data-act="periodOne">${ic("calendar")} Başka bir ayı güncelle</button><button class="btn sm ghost" data-act="newInst">+ Taksit ekle</button></div></div>` };
    }

    /* 9) borç bitiş ilerlemesi: en yüksek ay sonu borcundan bugüne kapatılan kısım */
    {
      /* uygulamaya girilen ilk ekstreden bu yana yapılan gerçek ödemeler (çevirme/iade hariç) / (ödenen + kalan) */
      const payM = [];
      for (let m = firstYM; m <= nowYM; m = K.ymAdd(m, 1)) payM.push(m);
      const PB = I.paymentsByMonth ? I.paymentsByMonth(DB, payM) : {};
      const paidAll = Object.values(PB).reduce((a, x) => a + x.tl, 0);
      const pct = paidAll + S.totalTL > 0 ? Math.round(100 * paidAll / (paidAll + S.totalTL)) : 0;
      const pm = DB.settings.planMonthly, R = pm > 0 ? K.simulatePayoff(DB, pm, t) : null;
      W.bitis = { size: "w4", name: "Borç bitiş", html: `<div class="card clickable" data-act="openPayoff" title="Borç bitiş planını aç">${wh("Borç bitişi", R ? "ayda " + K.fmt(pm, "TRY", { noDec: true }) : "")}
        <div class="bt-end">${R ? (R.done ? K.monthLabel(R.endMonth) : "bitmiyor") : ic("flag") + " Planla"}</div>
        <div class="progress ok" style="margin:var(--s2) 0 var(--s1)"><i style="width:${pct}%"></i></div>
        <div class="fz-sub">${S.totalTL > K.EPS ? `Şimdiye kadar <b>${K.fmt(paidAll, "TRY", { noDec: true })}</b> ödedin, <b>${K.fmt(S.totalTL, "TRY", { noDec: true })}</b> kaldı · %${pct}` : "Borç yok 🎉"}</div>
        <div class="fz-sub faint">${R ? (R.shortMonths ? `⚠ ${R.shortMonths} ayda asgariler karşılanmıyor` : "toplam faiz ≈ " + K.fmt(R.totalInterest)) : "ayda ne kadar ödeyebileceğini yaz"}</div></div>` };
    }

    /* 4) borç dağılımı halkası */
    {
      const byCard = new Map();
      S.open.forEach(i => { const v = K.toTL(DB, i.row.rem, i.ccy, nowYM) || 0; if (v > 0.5) byCard.set(i.card.id, { c: i.card, v: (byCard.get(i.card.id) || { v: 0 }).v + v }); });
      const parts = [...byCard.values()].sort((a, b) => b.v - a.v), tot = parts.reduce((a, x) => a + x.v, 0);
      let acc = 0;
      const grad = parts.map(x => { const a0 = acc; acc += 100 * x.v / tot; return `${cardColor(x.c)} ${a0.toFixed(2)}% ${acc.toFixed(2)}%`; }).join(",");
      W.dagilim = { size: "w4", name: "Borç dağılımı", html: `<div class="card">${wh("Borç dağılımı", "kartlara göre · TL")}
        ${parts.length ? `<div class="donut-wrap"><span class="ringwrap big"><span class="ring" style="background:conic-gradient(${grad})"></span><b>${K.fmt(tot, "TRY", { noDec: true })}</b></span>
          <div class="legend">${parts.map(x => `<button type="button" class="lg" data-act="cardDetail" data-card="${x.c.id}" title="${esc(x.c.name)}: ${K.fmt(x.v)}"><i style="background:${cardColor(x.c)}"></i><span>${esc(x.c.name)}</span><b>%${Math.round(100 * x.v / tot)}</b></button>`).join("")}</div></div>`
          : `<div class="w-empty">${ic("check")} Açık borç yok</div>`}</div>` };
    }

    /* 5) limit göstergeleri (ayrıntı katlı) */
    W.limit = { size: "w4", name: "Limitler", html: `<div class="card">${wh("Limitler", "doluluk", ["goCards", "Kartlar"])}
      ${lims.length ? `<div class="gauges">${lims.map(l => {
        const p = l.limit ? Math.max(0, Math.round(100 * l.used / l.limit)) : 0;
        const col = p >= 90 ? "var(--bad)" : p >= 70 ? "var(--warn)" : "var(--accent)";
        return `<button type="button" class="gauge" ${l.kind === "card" ? `data-act="cardDetail" data-card="${l.id}"` : `data-act="goCards"`} title="${esc(l.name)}: ${l.limit ? K.fmt(l.avail, "TRY", { noDec: true }) + " kullanılabilir / limit " + K.fmt(l.limit, "TRY", { noDec: true }) : "limit girilmemiş"}"><span class="ringwrap"><span class="ring" style="background:conic-gradient(${col} ${Math.min(100, p)}%,var(--surface-2) 0)"></span><b>${l.limit ? "%" + p : "—"}</b></span><span class="gn">${esc(l.name)}</span><small>${l.limit ? K.fmt(l.avail, "TRY", { noDec: true }) : "limit yok"}</small></button>`;
      }).join("")}</div>
      <details class="wdetails" data-fold="lim"><summary>Ayrıntılar</summary>${limHtml}</details>` : `<div class="w-empty">Limit girilmemiş</div>`}</div>` };

    W.trend = { size: "w8", name: "Aylık harcama", html: `<div class="card">${wh("Aylık harcama", (hasFut ? "kesilen · bu dönem · gelecek" : "kesilen ekstreler") + " · TL · ölçek 0'dan", ["goReports", "Raporlar"])}${trendHtml}</div>` };

    /* ---------- 3) sıra / gizleme (bu cihaza özel) ---------- */
    const cfg = dashCfg();
    const order = cfg.order.filter(id => W[id]).concat(DASH_DEFAULT.filter(id => !cfg.order.includes(id)));
    const hidden = cfg.hidden.filter(id => W[id]);
    const editing = !!App.dashEdit;
    const tools = id => `<span class="wtools"><span class="wgrip" title="Sürükle">⠿</span><button type="button" data-act="dashMove" data-w="${id}" data-dir="-1" title="Yukarı" aria-label="Yukarı taşı">↑</button><button type="button" data-act="dashMove" data-w="${id}" data-dir="1" title="Aşağı" aria-label="Aşağı taşı">↓</button><button type="button" data-act="dashHide" data-w="${id}">Gizle</button></span>`;
    const bento = order.filter(id => !hidden.includes(id)).map(id => `<section class="wdg ${W[id].size}" data-w="${id}" ${editing ? `draggable="true"` : ""}>${editing ? tools(id) : ""}${W[id].html}</section>`).join("");
    const dashBar = `<div class="dash-bar">${editing
      ? `<span class="hint">Kutuları sürükle ya da ↑↓ ile taşı, istemediğini gizle.</span>${hidden.map(id => `<button class="chip-btn" data-act="dashShow" data-w="${id}">+ ${W[id].name}</button>`).join("")}<span class="grow"></span><button class="btn sm ghost" data-act="dashReset">Varsayılana dön</button><button class="btn sm" data-act="dashEdit">Bitti</button>`
      : `<span class="grow"></span><button class="btn sm ghost" data-act="dashEdit">${ic("edit")} Düzenle</button>`}</div>`;

    el.innerHTML = `${alertsHtml}${recapHtml}${kpisHtml}${dashBar}<div class="bento ${editing ? "editing" : ""}">${bento}</div>`;

    /* canlı faiz sayacı: saniyede bir, günün geçen kısmı kadar artar */
    clearInterval(App._fzTimer);
    const fzEl = el.querySelector(".fz-num[data-day]");
    if (fzEl) {
      const base = +fzEl.dataset.base, day = +fzEl.dataset.day;
      const tick = () => {
        if (!document.contains(fzEl)) { clearInterval(App._fzTimer); return; }
        const n = new Date(), frac = (n - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5;
        const s4 = (base + day * frac).toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        fzEl.innerHTML = `₺${s4.slice(0, -2)}<span class="cents">${s4.slice(-2)}</span>`;
      };
      tick(); App._fzTimer = setInterval(tick, 1000);
    }
    if (editing) bindDashDrag(el.querySelector(".bento"));

    /* ödeme / iade sonrası ilgili satırı kısa süre vurgula */
    if (App.flash && Date.now() - App.flash.t < 4000) {
      const sel = `[data-card="${App.flash.card}"][data-ccy="${App.flash.ccy}"]`;
      const row = el.querySelector(`.item${sel}`) || el.querySelector(`.fc-line${sel}`);
      if (row) { row.classList.add("flash"); try { row.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) { } }
    }
    App.flash = null;
    App.fold = App.fold || {};
    $$("details[data-fold]", el).forEach(d => {
      d.open = !!App.fold[d.dataset.fold];
      d.addEventListener("toggle", () => { App.fold[d.dataset.fold] = d.open; });
    });
  }

  /* ---------- dashboard düzeni: sıra + gizlenenler, localStorage (cihaza özel) ---------- */
  const DASH_KEY = "kartTakip_dash";
  const DASH_DEFAULT = ["hero", "next", "faiz", "bitis", "pay", "cal", "dagilim", "cash", "limit", "trend"];
  function dashCfg() {
    let c = null; try { c = JSON.parse(localStorage.getItem(DASH_KEY)); } catch (e) { }
    return { order: (c && Array.isArray(c.order)) ? c.order : DASH_DEFAULT.slice(), hidden: (c && Array.isArray(c.hidden)) ? c.hidden : [] };
  }
  function dashSave(c) { try { localStorage.setItem(DASH_KEY, JSON.stringify(c)); } catch (e) { } }
  function bindDashDrag(box) {
    let drag = null;
    box.addEventListener("dragstart", e => { drag = e.target.closest(".wdg"); if (!drag) return; drag.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", drag.dataset.w); } catch (x) { } });
    box.addEventListener("dragover", e => {
      if (!drag) return; e.preventDefault();
      const over = e.target.closest(".wdg"); if (!over || over === drag) return;
      const r = over.getBoundingClientRect();
      const before = (e.clientY - r.top) / r.height + (e.clientX - r.left) / r.width < 1;
      box.insertBefore(drag, before ? over : over.nextSibling);
    });
    box.addEventListener("dragend", () => {
      if (!drag) return; drag.classList.remove("dragging"); drag = null;
      const c = dashCfg(); const vis = $$(".wdg", box).map(x => x.dataset.w);
      c.order = vis.concat(c.order.filter(id => !vis.includes(id))); dashSave(c);
    });
  }
  Object.assign(App.ACT, {
    dashEdit: () => { App.dashEdit = !App.dashEdit; App.render(); },
    dashHide: d => { const c = dashCfg(); if (!c.hidden.includes(d.w)) c.hidden.push(d.w); dashSave(c); App.render(); },
    dashShow: d => { const c = dashCfg(); c.hidden = c.hidden.filter(x => x !== d.w); dashSave(c); App.render(); },
    dashReset: () => { dashSave({ order: DASH_DEFAULT.slice(), hidden: [] }); App.render(); },
    dashMove: d => {
      const c = dashCfg(), vis = $$("#page-ozet .wdg").map(x => x.dataset.w);
      const i = vis.indexOf(d.w), j = i + (+d.dir); if (i < 0 || j < 0 || j >= vis.length) return;
      [vis[i], vis[j]] = [vis[j], vis[i]];
      c.order = vis.concat(c.order.filter(id => !vis.includes(id))); dashSave(c); App.render();
    },
    fcSel: d => { App.fcSel = d.month; App.render(); },
    goPayList: () => { const p = $("#payList"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" }); },
    goCards: () => App.setTab("kartlar"),
  });
  Object.assign(I, { welcomeHtml, payRow, renderOzet });
})();
