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
    const FSV = App.fcAll ? FS : FS.slice(0, 4);   // varsayılan: bu dönem + sonraki 3 ay
    const fcHtml = FSV.map((m, idx) => `<div class="fc-col ${idx === 0 ? "first" : ""}">
        <div class="fc-h"><b>${K.MONTHS[+m.month.slice(5) - 1]} ekstresi</b><span>${m.month.slice(0, 4)}</span></div>
        <div class="fc-total num">${moneyHtml(m.tl)}${m.missingRate ? "*" : ""}</div>
        <div class="fc-sub">${(m.byCcy.EUR || m.byCcy.USD) ? K.fmtMulti(m.byCcy, { noDec: true }) : (idx === 0 ? "bu dönem" : "eklenecek")}</div>
        <div class="fc-lines">${m.items.length ? m.items.map(i => `<button class="fc-line" data-act="${i.source === "pending" || i.source === "interest" ? "cardDetail" : "periodOne"}" data-card="${i.card.id}" data-ccy="${i.ccy}" data-month="${m.month}" title="${esc(i.card.name)} · kesim ${K.fmtDate(i.cut)}${i.inst ? " · taksit " + K.fmt(i.inst, i.ccy) : ""}">
            <span class="dot" style="background:${cardColor(i.card)}"></span><span class="nm">${esc(i.card.name)}${i.ccy !== "TRY" ? " " + i.ccy : ""}</span>${i.source === "estimate" && m.month !== K.nextPeriodMonth(i.card, t) ? '<span class="chip soon">girildi</span>' : (srcChip[i.source] || "")}<span class="v num">${moneyHtml(i.amount, i.ccy)}</span></button>`).join("") : ""}
        </div>
      </div>`).join("");

    /* trend */
    const TL = K.spendTimeline(DB, t);
    // ilk ekstre (eski borç dahil) diğer ayları ezmesin: çok büyükse kırık çubukla kısalt
    const maxAll = Math.max(1, ...TL.map(x => x.total));
    const maxRest = Math.max(0, ...TL.filter(x => !x.initial).map(x => x.total));
    const clip = maxRest > K.EPS && maxAll > maxRest * 1.6;
    const maxT = clip ? maxRest * 1.35 : maxAll;
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
      if (clip && x.total > maxT) tip.push("çubuk ölçeğe sığması için kısaltıldı");
      if (x.missingRate) tip.push("bazı dövizli tutarlar kur olmadığı için eklenmedi");
      return `<div class="b ${sepAt && sepAt.month === x.month && hasCut ? "sep" : ""}" title="${tip.join(" · ")}"><div class="bcol"><em>${x.total > 0 ? K.fmt(x.total) : ""}</em>
        <div class="bstack${clip && x.total > maxT ? " clipped" : ""}" style="height:${x.total > 0 ? pctH(Math.min(x.total, maxT)) : "2px"}">${x.future > K.EPS ? `<i class="t3" style="flex:${x.future}"></i>` : ""}${x.period > K.EPS ? `<i class="t2" style="flex:${x.period}"></i>` : ""}${x.cut > K.EPS ? `<i class="t1" style="flex:${x.cut}"></i>` : ""}</div></div>
        <span>${K.MONTHS_SHORT[+x.month.slice(5) - 1]}${x.initial ? "*" : ""}${x.month.slice(5) === "01" || x === TL[0] ? `<small>${x.month.slice(2, 4)}</small>` : ""}</span></div>`;
    }).join("");
    const trendHtml = TL.length ? `<div class="bars">${bars}</div>
      <div class="lim-legend" style="margin-top:var(--s3)">${hasCut ? '<span><i class="t1"></i>kesildi</span>' : ""}${TL.some(x => x.period > K.EPS) ? '<span><i class="t2"></i>bu dönem</span>' : ""}${TL.some(x => x.future > K.EPS) ? '<span><i class="t3"></i>gelecek (girilen + taksit)</span>' : ""}</div>
      ${initM.length ? `<div class="faint" style="font-size:12px;margin-top:var(--s2)">* ${initM.map(m => K.monthLabel(m)).join(", ")}: uygulamaya girilen ilk ekstre — önceki aylardan devreden borç da içinde, o yüzden yüksek görünür.${clip ? " Diğer aylar okunsun diye çubuğu kesik çizildi; tutar üstünde tam yazıyor." : ""}</div>` : ""}`
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

    const payListHtml = open.length ? open.map(i => payRow(i)).join("") : `<div class="empty">${S.items.length ? "Açık ekstre yok — tüm güncel ekstreler ödendi 🎉" : "Henüz ekstre girilmemiş. Bankandan gelen son ekstrenin <b>dönem borcunu</b> gir; son ödeme tarihi ve asgari otomatik hesaplanır."}<br><button class="btn sm soft" style="margin-top:var(--s3)" data-act="quickStatement">${S.items.length ? "Yeni ekstre gir" : "İlk ekstreyi gir"}</button></div>`;
    const closedHtml = closed.length ? `<details style="margin-top:var(--s2)"><summary class="faint" style="cursor:pointer;font-size:13px;padding:8px 4px">Bu dönem kapananlar (${closed.length})</summary><div class="list">${closed.map(i => payRow(i, { dim: true })).join("")}</div></details>` : "";
    const fcFold = `<details class="sec-fold" data-fold="fc" style="order:7"><summary><h2>Bu dönem ve sonraki aylar</h2><span class="hint">henüz ekstreye girmeyen harcamalar · limitten düşer</span></summary>
      <div class="card">
        ${FS.length ? `<div class="fc-grid">${fcHtml}</div>${FS.length > 4 ? `<div style="margin-top:var(--s3)"><button class="btn sm ghost" data-act="fcMore">${App.fcAll ? "Daha az göster" : "+" + (FS.length - 4) + " ay daha göster"}</button></div>` : ""}` : `<div class="empty" style="padding:14px 8px">Henüz dönem içi harcama ya da taksit yok. Bankanın uygulamasına baktığında dönem içi harcamaları, taksitli bir alışveriş yaptığında taksiti ekle — burada aylara göre görünür.</div>`}
        <div class="btnrow" style="margin-top:var(--s3)">
          <button class="btn" data-act="periodUpdate">${ic("cart")} Dönem içi harcamaları güncelle</button>
          <button class="btn ghost" data-act="periodOne">${ic("calendar")} Başka bir ayı güncelle</button>
          <button class="btn ghost" data-act="newInst">+ Taksit ekle</button>
        </div>
        <details class="tip"><summary>ⓘ Dönem içi ve taksit nedir?</summary><div class="note"><b>Dönem içi</b> = bankanın uygulamasında gördüğün, bu dönem yaptığın ve sıradaki ekstrede ödeyeceğin harcamalar. <b>Taksit</b> = Kartlar → Taksitler'e girdiğin taksitlerin o aya düşen payı. Bankada ileri bir ay için farklı bir tutar görüyorsan satıra tıklayıp ya da "Başka bir ayı güncelle" ile o ayın tutarını yaz. İkisi de limitinden hemen düşer; güncel borcunu ödemezsen o da sıradaki ekstreye eklenir.</div></details>
      </div>
      </details>`;

    el.innerHTML = `
      ${alertsHtml}
      <div class="ov">
      <div class="ov-main">
        <div class="card hero-main" style="order:2">
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
        </div>
        <div class="sec-title" style="order:4"><h2>Ödeme takvimi</h2><span class="hint">son ödeme tarihine göre</span></div>
        <div class="card" style="order:5"><div class="list">${payListHtml}</div>
          ${closedHtml}
        </div>
        <div class="detay-title" style="order:6">Detay</div>
        ${fcFold}
      </div>
      <aside class="ov-side">
        ${nextHtml ? nextHtml.replace('<div class="next-card', '<div style="order:1" class="next-card') : ""}
        <div class="stats" style="order:3">
          <div class="card"><div class="stat"><span class="k">Bu dönem ödenmesi gereken asgari</span><span class="v ${S.late.length ? "bad" : ""}">${moneyHtml(S.minDueTL)}</span><span class="s">${minCount ? minCount + " hesapta asgari eksik" : "Tüm asgariler ödendi ✓"}</span></div></div>
          <div class="card"><div class="stat"><span class="k">Bu dönem harcamaların (kesilmedi)</span><span class="v">${moneyHtml(upTL)}${upMiss ? "*" : ""}</span><span class="s">dönem içi + taksit + bekleyen · <button class="linkbtn" data-act="periodUpdate">güncelle</button></span></div></div>
          ${(() => {
            const pm = DB.settings.planMonthly;
            if (!(pm > 0)) return `<div class="card clickable" data-act="openPayoff" style="cursor:pointer"><div class="stat"><span class="k">Borç ne zaman biter?</span><span class="v" style="font-size:18px">${ic("flag")} Planla</span><span class="s">ayda ne kadar ödeyebileceğini yaz, bitiş ayını ve toplam faizi gör</span></div></div>`;
            const R = K.simulatePayoff(DB, pm, t);
            return `<div class="card clickable" data-act="openPayoff" style="cursor:pointer"><div class="stat"><span class="k">Borç bitiş · ayda ${K.fmt(pm)}</span><span class="v ${R.shortMonths ? "bad" : ""}">${R.done ? K.monthLabel(R.endMonth) : "bitmiyor"}</span><span class="s">${R.shortMonths ? `⚠ ${R.shortMonths} ayda asgariler karşılanmıyor` : "toplam faiz ≈ " + K.fmt(R.totalInterest)}</span></div></div>`;
          })()}
          ${DB.shared.people.length || DB.shared.entries.length ? `<div class="card clickable" data-act="goShared" style="cursor:pointer"><div class="stat"><span class="k">Ortak harcama dengesi</span><span class="v ${sharedTL >= 0 ? "ok" : "info"}">${moneyHtml(Math.abs(sharedTL))}</span><span class="s">${Math.abs(sharedTL) <= 0.5 ? "Kimseyle açık hesap yok" : (sharedTL > 0 ? "alacağın var · " : "borcun var · ") + esc(sharedWho.join(", "))}</span></div></div>` : ""}
        </div>
        ${limHtml ? `<details class="sec-fold" data-fold="lim" style="order:8"><summary><h2>Limit</h2><span class="hint">borç + dönem içi + kalan taksitler + bekleyen</span></summary>
          <div class="card">${limHtml}</div>
        </details>` : ""}
        ${TL.length ? `<details class="sec-fold" data-fold="trend" style="order:9"><summary><h2>Aylık harcama</h2><span class="hint">${hasFut ? "kesilen · bu dönem · gelecek" : "kesilen ekstreler"} · TL</span></summary>
          <div class="card">${trendHtml}</div>
        </details>` : ""}
      </aside>
      </div>
    `;
    /* Detay bölümlerinin açık/kapalı hali yeniden çizimlerde korunsun (varsayılan: sadece "Bu dönem" açık) */
    /* ödeme / iade sonrası ilgili satırı kısa süre vurgula */
    if (App.flash && Date.now() - App.flash.t < 4000) {
      const sel = `[data-card="${App.flash.card}"][data-ccy="${App.flash.ccy}"]`;
      const row = el.querySelector(`.item${sel}`) || el.querySelector(`.fc-line${sel}`);
      if (row) { row.classList.add("flash"); try { row.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) { } }
    }
    App.flash = null;
    if (!App.fold) { const wide = window.matchMedia("(min-width:1280px)").matches; App.fold = { fc: true, lim: wide, trend: wide }; }
    $$("details[data-fold]", el).forEach(d => {
      d.open = !!App.fold[d.dataset.fold];
      d.addEventListener("toggle", () => { App.fold[d.dataset.fold] = d.open; });
    });
  }

  Object.assign(I, { welcomeHtml, payRow, renderOzet });
})();
