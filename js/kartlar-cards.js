/* =====================================================================
   Kart Kokpiti — Kartlar: kart kutuları, kart detayı, kart ekleme/düzenleme/silme
   app.js (kabuk) önce yüklenir; ortak yardımcılar App.I üzerinden gelir.
   kartlar.js üçe bölündü (18 Kasım 2026): bu dosya + kartlar-forms.js + kartlar-planning.js.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { ic, moneyHtml, COLORS, BANKS, persist, toast, mh, val, num, segVal, segHtml, activeCards, cardColor, ccyPill, accountOptions, currentStmtMonth, devirAt, limParts, hotAccounts, sharedNetTL, restructLeft, fmtTL0, rateText, chipClass, rateLine, esc, $, $$, loadDB, initTheme } = I;
  const fetchRates = (...a) => I.fetchRates(...a);
  /* ================= KARTLAR ================= */
  function cardTile(c) {
    const DB = App.DB, t = App.today();
    const accs = K.accountsOf(c).map(ccy => ({ ccy, L: K.ledger(DB, c.id, ccy, t) }));
    const debtLines = accs.map(a => a.L.credit > K.EPS ? `<div class="debt"><span class="lb">${a.ccy === "TRY" ? "Alacak" : "Alacak " + a.ccy}</span><b class="ok">+${moneyHtml(a.L.credit, a.ccy)}</b></div>` : `<div class="debt"><span class="lb">Borç ${a.ccy === "TRY" ? "" : a.ccy}</span><b class="${a.L.current && a.L.current.status === "late" ? "bad" : ""}">${moneyHtml(a.L.debt, a.ccy)}</b></div>`).join("");
    const cur = accs.map(a => a.L.current).filter(r => r && r.rem > K.EPS).sort((a, b) => a.due - b.due)[0];
    const lim = K.effectiveLimit(DB, c);
    const grp = c.groupId ? K.groupById(DB, c.groupId) : null;
    const LU = K.limitUsage(DB, t).find(x => x.id === (grp && grp.limit ? grp.id : c.id));
    const pend = accs.map(a => ({ ccy: a.ccy, P: K.pendingLoad(DB, c, a.ccy, t) }));
    const periodLine = pend.map(x => { const r = x.P.periodRow; const v = r ? (r.estimate ? r.spend : Math.max(0, r.fresh)) : 0; return v > K.EPS ? K.fmt(v, x.ccy) : ""; }).filter(Boolean).join(" + ");
    const CP = K.cardPending(DB, c.id);
    const provNote = CP.total > 0 ? `<div class="kv"><span>Bekleyen</span><b class="warn">${K.fmt(CP.total, "TRY")} <span class="faint" style="font-weight:400;font-size:12px">(${CP.items.length})</span></b></div>` : "";
    /* kutuda tek bir durum rozeti: en önemlisi; ayrıntısı kart detayında / Özet'te */
    const flags = [];
    if (hotAccounts(c).length) flags.push(`<span class="flag hot">${ic("fire")} Faiz işliyor — bu kartla yeni harcama yapma</span>`);
    if (CP.items.some(I.pendOld)) flags.push(`<span class="flag">Bekleyen 3 günden eski — karta yansıdı mı?</span>`);
    if (c.daysUnset) flags.push(`<span class="flag">Kesim/ödeme günlerini kontrol et</span>`);
    if (LU && LU.missing.length) flags.push(`<span class="flag">${[...new Set(LU.missing.map(m => K.CCY_SYM[m.ccy]))].join("/")} kuru eksik — limit eksik hesaplanıyor</span>`);
    if (!(lim && LU)) flags.push(`<span class="flag">Limit girilmedi</span>`);
    const limPct = LU && LU.limit ? Math.max(0, Math.min(100, Math.round(100 * LU.used / LU.limit))) : 0;
    const limCls = limPct >= 90 ? "bad" : limPct >= 70 ? "warn" : "";
    const initial = (c.bank || c.name || "?").trim().charAt(0).toLocaleUpperCase("tr-TR");
    /* destede yalnızca kartın üst şeridi görünür: borç ve son ödeme durumu oraya da yazılır */
    const owe = accs.filter(a => a.L.debt > K.EPS).map(a => K.fmt(a.L.debt, a.ccy)).join(" + ");
    const fsum = `<span class="fsum"><b>${owe || "Borç yok"}</b><small>${cur ? (cur.status === "late" ? "gecikmede" : cur.daysToDue === 0 ? "bugün son gün" : cur.daysToDue > 0 ? cur.daysToDue + " gün kaldı" : K.fmtDate(cur.due)) : ""}${flags.length && hotAccounts(c).length ? (cur ? " · " : "") + "faiz işliyor" : ""}</small></span>`;
    const sel = App.kdCard === c.id && document.body.classList.contains("kd-open");
    return `<div class="ccard ${c.archived ? "archived" : ""} ${sel ? "sel" : ""} ${cur && cur.status === "late" ? "is-late" : ""}" style="--bank:${cardColor(c)}" data-act="cardDetail" data-card="${c.id}">
      <div class="face">
        <div class="top"><div class="namewrap"><span class="bankbadge" aria-hidden="true">${esc(initial)}</span><div><div class="n">${esc(c.name)}</div><div class="bk">${esc(c.bank || "")}${c.archived ? " · arşivde" : ""}${c.spendCard ? ' · <span class="spendtag">harcama kartı</span>' : ""}</div></div></div>${fsum}<span class="emv" aria-hidden="true"></span></div>
        <div class="bot"><span class="digits">${c.last4 ? "•••• " + esc(c.last4) : ""}</span><span>${K.accountsOf(c).map(x => x === "TRY" ? "₺" : K.CCY_SYM[x]).join(" ")}</span></div>
      </div>
      <div class="body">
        ${debtLines}
        <div class="kv"><span>Son ödeme</span><b class="${cur && cur.status === "late" ? "bad" : cur && chipClass(cur) === "soon" ? "warn" : ""}">${cur ? K.fmtDate(cur.due) + (cur.status === "late" ? " · gecikmede" : cur.daysToDue >= 0 ? " · " + (cur.daysToDue === 0 ? "bugün" : cur.daysToDue + " gün") : "") : "—"}</b></div>
        <div class="kv"><span>Dönem içi</span><b>${periodLine || "—"} <button class="linkbtn" style="font-size:12px;margin-left:var(--s1)" data-act="periodOne" data-card="${c.id}">${periodLine ? "güncelle" : "ekle"}</button></b></div>${provNote}
        ${lim && LU ? `<div class="kv"><span>${grp ? "Kullanılabilir (ortak)" : "Kullanılabilir limit"}</span><b class="${LU.avail < 0 ? "bad" : ""}">${moneyHtml(LU.avail)}</b></div>
          <div class="progress ${limCls}" title="%${limPct} dolu"><i style="width:${limPct}%"></i></div>` : ""}
        ${flags[0] || ""}
      </div>
    </div>`;
  }

  function renderKartlar() {
    const el = $("#page-kartlar"), DB = App.DB, t = App.today();
    const act = activeCards(), arch = DB.cards.filter(c => c.archived);
    const nowYM = K.ymOf(t);
    const insts = DB.installments.slice().sort((a, b) => a.start < b.start ? -1 : 1);
    const instHtml = insts.map(x => {
      const c = K.cardById(DB, x.cardId);
      const done = K.instDone(x, nowYM);
      const left = (x.count - done) * x.per;
      return `<div class="item clickable" data-act="editInst" data-id="${x.id}" style="--bank:${cardColor(c)}"><span class="bar"></span>
        <div><div class="t">${x.kind === "stmt" ? ic("puzzle") + " " : ""}${esc(x.desc)} ${ccyPill(x.ccy)}${x.kind === "stmt" ? ` <span class="chip carry">ekstre taksiti · faiz ${K.fmt(x.per * x.count - x.principal, x.ccy)}</span>` : ""}</div><div class="m">${c ? esc(c.name) : "?"} · ${x.pullAt ? "erken kapatıldı → " + K.monthLabel(x.pullAt) + " ekstresi" : done + "/" + x.count + " taksit · başlangıç " + K.monthLabel(x.start, true)}</div>
        <div class="progress"><i style="width:${Math.round(100 * done / x.count)}%"></i></div></div>
        <div class="r"><div class="amt" style="font-size:16px">${K.fmt(x.per, x.ccy)}<small>/ay</small></div><div class="m">kalan ${K.fmt(left, x.ccy)}</div></div></div>`;
    }).join("");
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:var(--s4)">
        <div><h2 style="font-size:22px">Kartlarım</h2><div class="muted" style="font-size:14px">${act.length} aktif kart${arch.length ? " · " + arch.length + " arşivde" : ""}</div></div>
        <div class="btnrow" style="margin:0">${act.length > 1 ? `<div class="seg viewseg"><button type="button" data-act="cardView" data-v="deck" class="${App.cardView !== "grid" ? "on" : ""}">Deste</button><button type="button" data-act="cardView" data-v="grid" class="${App.cardView === "grid" ? "on" : ""}">Izgara</button></div>` : ""}<button class="btn ghost" data-act="periodUpdate">${ic("cart")} Dönem içi harcamalar</button><button class="btn ghost" data-act="batchStatement">${ic("layers")} Toplu ekstre gir</button><button class="btn" data-act="addCard">+ Kart ekle</button></div>
      </div>
      <div class="cardgrid ${act.length > 1 && App.cardView !== "grid" ? "deck" : ""}">
        ${act.map(cardTile).join("")}
        <div class="ccard add" data-act="addCard"><span class="plus">+</span>Yeni kart</div>
      </div>
      ${arch.length ? `<div style="margin-top:var(--s4)"><button class="btn sm ghost" data-act="toggleArchived">${App.showArchived ? "Arşivi gizle" : "Arşivdeki kartları göster (" + arch.length + ")"}</button></div>
        ${App.showArchived ? `<div class="cardgrid" style="margin-top:var(--s3)">${arch.map(cardTile).join("")}</div>` : ""}` : ""}
      <div class="sec-title sub" id="instSec"><h2>Taksitler</h2><button class="btn sm soft" data-act="newInst">+ Taksit ekle</button></div>
      ${instHtml ? `<div class="card flat inst-list"><div class="list">${instHtml}</div></div>` : `<div class="faint" style="font-size:13px">Taksitli alışverişlerini ekle — gelecek ayların yükünde görünsün.</div>`}
    `;
  }

  /* ---------- bir hesabın ileriki ayları (dönem içi + taksit) ---------- */
  function upcomingRows(cardId, ccy, extra) {
    // extra: taksit formundaki taslak {per,count,start,excludeId}
    const DB = App.DB, t = App.today(), c = K.cardById(DB, cardId);
    if (!c) return [];
    const start = K.nextPeriodMonth(c, t);
    const L = K.ledger(DB, cardId, ccy, t);
    let end = start;
    DB.installments.filter(x => x.cardId === cardId && x.ccy === ccy).forEach(x => { const e = K.ymAdd(x.start, x.count - 1); if (e > end) end = e; });
    L.futures.forEach(r => { if (r.month > end) end = r.month; });
    if (extra && extra.per > 0 && extra.count > 0 && extra.start) { const e = K.ymAdd(extra.start, extra.count - 1); if (e > end) end = e; }
    const out = [];
    for (let m = start, g = 0; m <= end && g < 48; m = K.ymAdd(m, 1), g++) {
      const row = L.rows.find(r => r.month === m && !r.isCut);
      const insts = K.instFor(DB, m).filter(x => x.t.cardId === cardId && x.t.ccy === ccy && (!extra || x.t.id !== extra.excludeId));
      let draft = 0;
      if (extra && extra.per > 0 && extra.start) { const idx = K.ymDiff(extra.start, m) + 1; if (idx >= 1 && idx <= extra.count) draft = extra.per; }
      let period = row && row.estimate ? row.spend : (row ? Math.max(0, row.fresh) : 0);
      const instTotal = insts.reduce((a, x) => a + x.amount, 0);
      // dönem içi tutara taksit dahilse taksiti ayrıca sayma
      let instCounted = row && (!row.estimate || row.st.instIncl) ? 0 : instTotal;
      // ekstre taksiti, "taksit dahil" dönem içine uygulama tarafından eklendiyse ayrı göster
      const bump = row && row.estimate ? K.round2(I.bumpOf(row.id)) : 0;
      if (bump > K.EPS) { period = K.round2(period - bump); instCounted += bump; }
      const pend = (m === start && ccy === K.accountsOf(c)[0]) ? K.cardPending(DB, cardId) : { total: 0, items: [] };
      const total = K.round2(period + instCounted + draft + pend.total);
      if (total <= K.EPS && !insts.length && !draft) continue;
      out.push({ month: m, period, insts, instTotal, draft, total, inclNote: row && row.estimate && row.st.instIncl, isNext: m === start, pend: pend.total, pendCcys: [...new Set(pend.items.map(x => x.ccy))] });
    }
    return out;
  }
  function upcomingTable(rows, ccy, draftLabel, opts) {
    if (!rows.length) return `<div class="note" style="padding:6px 0">İleriki aylar için kayıt yok.</div>`;
    let cum = 0;
    const hasCum = opts && typeof opts.startDebt === "number";
    let run = hasCum ? opts.startDebt : 0;
    const head = hasCum ? `<div class="up-row cum up-head"><span></span><span class="faint">o ay eklenen</span><span class="faint up-total">ekstreye gelecek</span><span class="faint up-total">hiç ödemezsen biriken</span></div>
      <div class="up-row cum"><b>${esc(opts.startLabel)}</b><span class="up-parts"><span class="chip ${opts.startDebt > 0 ? "due" : "paid"}">güncel borç</span></span><span class="num up-total">${K.fmt(opts.startDebt, ccy)}</span><span class="num up-total cumv">${K.fmt(opts.startDebt, ccy)}</span></div>` : "";
    return `<div class="up-table">${head}${rows.map(r => { cum += r.total; run += r.total; return `<div class="up-row ${hasCum ? "cum" : ""} ${opts && opts.card ? "clickable" : ""}" ${opts && opts.card ? `data-act="periodOne" data-card="${opts.card}" data-ccy="${ccy}" data-month="${r.month}" title="Bu ayı güncelle"` : ""}>
      <b>${K.monthLabel(r.month, true)}</b>
      <span class="up-parts">${[r.period > K.EPS ? `<span class="chip soon">${r.isNext ? "dönem içi" : "girilen tutar"} ${K.fmt(r.period, ccy, { noDec: true })}</span>` : "",
        ...r.insts.map(x => `<span class="chip carry">${esc(x.t.desc)} ${x.pulled ? "kalan " + x.n : x.idx + "/" + x.t.count}${r.inclNote && x.t.kind !== "stmt" ? " (dahil)" : ""} · ${K.fmt(x.amount, ccy, { noDec: true })}</span>`),
        r.pend > 0 ? `<span class="chip soon" style="background:var(--warn-soft);color:var(--warn)">bekleyen ${K.fmt(r.pend, "TRY", { noDec: true })}${r.pendCcys.some(x => x !== "TRY") ? " (" + r.pendCcys.filter(x => x !== "TRY").join("/") + " olarak yansıyacak)" : ""}</span>` : "",
        r.draft ? `<span class="chip new">${esc(draftLabel || "yeni taksit")} · ${K.fmt(r.draft, ccy, { noDec: true })}</span>` : ""].join("")}</span>
      <span class="num up-total">${K.fmt(r.total, ccy)}</span>${hasCum ? `<span class="num up-total cumv">${K.fmt(run, ccy)}</span>` : ""}</div>`; }).join("")}
      <div class="up-row up-sum ${hasCum ? "cum" : ""}"><b>Toplam</b><span class="up-parts faint">henüz ekstreye girmeyen · limitten düşen</span><span class="num up-total">${K.fmt(cum, ccy)}</span>${hasCum ? `<span class="num up-total cumv"><b>${K.fmt(run, ccy)}</b></span>` : ""}</div></div>
      ${hasCum ? `<div class="note" style="padding:6px 0 2px">Biriken toplam faiz hariçtir — ödemezsen banka üstüne faiz de ekler.</div>` : ""}`;
  }
  function upcomingHtml(c, ccy) {
    const rows = upcomingRows(c.id, ccy);
    if (!rows.length) return "";
    const L = K.ledger(App.DB, c.id, ccy, App.today());
    const startDebt = K.round2(L.debt - L.credit);
    const startLabel = L.current ? K.monthLabel(L.current.month, true) : "Şu an";
    return `<div class="sec-title" style="margin-top:var(--s1)"><h2>Gelecek ekstreler</h2><span class="hint">henüz kesilmedi · tıklayıp güncelle</span></div><div class="card flat" style="padding:8px 14px;margin-bottom:var(--s2)">${upcomingTable(rows, ccy, null, { card: c.id, startDebt, startLabel })}</div>`;
  }

  /* ---------- kart detayı: devir zinciri ---------- */
  function openCardDetail(cardId, ccy) {
    const DB = App.DB, c = K.cardById(DB, cardId); if (!c) return;
    const accs = K.accountsOf(c);
    ccy = accs.includes(ccy) ? ccy : accs[0];
    const L = K.ledger(DB, c.id, ccy, App.today());
    const mi = K.minRateInfo(DB, c);
    const cur = L.current;
    const rows = L.rows.filter(r => r.isCut).reverse();   // gelecek ekstreler yukarıdaki tabloda
    const IRrows = K.interestReport(DB, App.today().getFullYear(), App.today()).perRow;
    const tl = rows.map(r => {
      const pays = r.payments.map(p => `<div class="pay"><span>${K.fmtDate(p.d, true)}${p.kind === "refund" ? ' · <span class="chip carry">iade</span>' : ""}${p.kind === "convOut" ? ` · <span class="chip carry">TL'ye çevrildi</span> kur ${String(p.rate).replace(".", ",")} → ${K.fmt(p.tl, "TRY")}` : ""}${p.kind === "convIn" ? ` · <span class="chip soon">${esc(K.CCY_NAME[p.from] || p.from)}'dan çevrildi</span> ${K.fmt(p.fromAmt, p.from)} × ${String(p.rate).replace(".", ",")}` : ""}${p.note ? " · " + esc(p.note) : ""}${p.planned ? " · plan" : ""}</span><span>${p.kind === "convIn" ? "+" : "−"}${K.fmt(p.a, ccy)} <button class="x" data-act="delPayment" data-id="${p.id}" title="Ödemeyi sil">✕</button></span></div>`).join("");
      let eq;
      if (r.estimate) {
        eq = `Dönem içi harcama <b>${K.fmt(r.spend, ccy)}</b>${r.instAdded > 0 ? ` + taksit <b>${K.fmt(r.instAdded, ccy)}</b> = ${K.fmt(r.newSpend, ccy)}` : ""}`;
        if (r.devirIn > K.EPS) eq += `<br><span class="faint">${r.isCut ? "Dönem borcu" : "Ödemezsen dönem borcu"} ≈ ${K.fmt(r.amount, ccy)} (devir ${K.fmt(r.devirIn, ccy)} dahil)</span>`;
        if (r.st.updated) eq += `<br><span class="faint">Son güncelleme ${K.fmtDate(r.st.updated, true)}</span>`;
      } else {
        eq = `Dönem borcu <b>${K.fmt(r.amount, ccy)}</b>`;
        if (r.devirIn > K.EPS) eq += `<br><span class="faint">= ${K.fmt(r.devirIn, ccy)} önceki dönemden devir + ${K.fmt(r.newSpend, ccy)} yeni harcama/faiz</span>`;
      }
      if (r.isCut) eq += `<br>Kesim ${K.fmtDate(r.cut)} · son ödeme ${K.fmtDate(r.due)} · asgari ${K.fmt(r.minPay, ccy)}${r.exactMin ? " (bankadan)" : ""}`;
      else eq += `<br>Kesim ${K.fmtDate(r.cut)} — henüz kesilmedi`;
      { const ir = IRrows[r.id]; if (ir && (ir.bank != null || ir.est > K.EPS)) eq += `<br><span class="${ir.bank != null ? "" : "faint"}">${ir.bank != null ? `İçindeki faiz <b>${K.fmt(ir.bank, ccy)}</b> (bankadan)${ir.est > K.EPS ? ` · uygulamanın tahmini ${K.fmt(ir.est, ccy)}` : ""}` : `İçindeki faiz ≈ ${K.fmt(ir.est, ccy)} (tahmini — ekstrede yazanı ✎ ile girersen faiz sayacı kesinleşir)`}</span>`; }
      let out = "";
      if (r.status === "carried") out = `<div class="out info">Kalan ${K.fmt(r.rem, ccy)} → sonraki ekstreye devretti</div>`;
      else if (r.status === "closed" || r.status === "paid") out = r.convOut > K.EPS ? `<div class="out info">Kalan ${K.fmt(r.convOut, ccy)} TL'ye çevrilip TL hesabına aktarıldı</div>` : `<div class="out ok">Tamamı ödendi ✓</div>`;
      else if (r.isCut) out = `<div class="out">Ödenen ${K.fmt(r.paid, ccy)}${r.refund > K.EPS ? ` · iade ${K.fmt(r.refund, ccy)}` : ""}${r.convIn > K.EPS ? ` · dövizden gelen +${K.fmt(r.convIn, ccy)}` : ""} · <span class="${r.status === "late" ? "bad" : ""}">Kalan ${K.fmt(r.rem, ccy)}</span>${r.minGap > K.EPS ? ` · asgari eksik ${K.fmt(r.minGap, ccy)}` : ""}</div>`;
      if (r.restruct > K.EPS) out = r.restructs.map(x => `<div class="out info">Taksitlendirildi: ${K.fmt(x.principal, ccy)} → ${K.monthLabel(x.start)}'dan itibaren ${x.count} × ${K.fmt(x.per, ccy)} (faiz ${K.fmt(x.per * x.count - x.principal, ccy)}) <button class="linkbtn" data-act="editInst" data-id="${x.id}">düzenle</button></div>`).join("") + (r.rem > K.EPS ? out : "");
      if (r.current && r.rem > K.EPS && !r.restruct) out += `<div style="margin-top:var(--s2);display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ghost" data-act="stmtInst" data-card="${c.id}" data-ccy="${ccy}">${ic("puzzle")} Bu ekstreyi taksitlendirdim</button>${ccy !== "TRY" && K.accountsOf(c).includes("TRY") ? `<button class="btn sm ghost" data-act="convertFx" data-card="${c.id}" data-ccy="${ccy}">₺ TL'ye çevrildi</button>` : ""}</div>`;
      return `<div class="tl ${r.current ? "current" : ""} ${r.status === "late" ? "late" : ""} ${r.isCut ? "" : "future"}">
        <span class="dot"></span>
        <div class="box">
          <div class="top"><b>${K.monthLabel(r.month)}</b><span style="display:flex;gap:6px;align-items:center"><span class="chip ${chipClass(r)}">${esc(r.label)}</span><button class="iconbtn sm" data-act="editStatement" data-id="${r.id}" title="Ekstreyi düzenle">${ic("edit")}</button></span></div>
          <div class="eq">${eq}</div>
          ${pays ? `<div class="pays">${pays}</div>` : ""}
          ${out}
        </div>
      </div>`;
    }).join("");
    const orphan = L.orphan.length ? `<div class="note box" style="margin-top:var(--s3)">İlk ekstreden önce tarihlenmiş ${L.orphan.length} ödeme var (${L.orphan.map(p => K.fmtDate(p.d) + " " + K.fmt(p.a, ccy)).join(", ")}). Bunlar borçtan düşülmedi — ilgili ekstreyi eklersen otomatik eşleşir.
      ${L.orphan.map(p => `<button class="btn sm ghost" style="margin:var(--s2) var(--s2) 0 0" data-act="delPayment" data-id="${p.id}">${K.fmtDate(p.d)} ödemesini sil</button>`).join("")}</div>` : "";
    const insts = DB.installments.filter(x => x.cardId === c.id && x.ccy === ccy);
    const nUp = upcomingRows(c.id, ccy).length, nPend = K.cardPending(DB, c.id).items.length;
    App.modal(`
      ${mh("Kart detayı")}
      <div class="dhead" style="--bank:${cardColor(c)}">
        <div class="row"><div><div class="n">${esc(c.name)}</div><div style="opacity:.85;font-size:13px">${esc(c.bank || "")}${c.last4 ? " · •••• " + esc(c.last4) : ""}</div></div>
        <button class="btn sm" style="background:rgba(255,255,255,.18);color:#fff" data-act="editCard" data-card="${c.id}">${ic("edit")} Kartı düzenle</button></div>
        <input type="checkbox" id="dmoreChk" class="dchk" hidden>
        <div class="figs">
          <div><small>Güncel borç</small><b>${K.fmt(L.debt, ccy)}</b>${ccy !== "TRY" ? `<small style="opacity:.85">${K.rateFor(DB, K.ymOf(App.today()), ccy) ? "≈ " + K.fmt(K.toTL(DB, L.debt, ccy), "TRY") + " (kur " + String(K.rateFor(DB, K.ymOf(App.today()), ccy)).replace(".", ",") + ")" : "kur girilmemiş"}</small>` : ""}</div>
          <div><small>Asgari eksik</small><b>${cur ? K.fmt(cur.minGap, ccy) : "—"}</b></div>
          <div><small>Son ödeme</small><b>${cur && cur.rem > K.EPS ? K.fmtDate(cur.due) : "—"}</b></div>
          <div class="more"><small>Asgari oran</small><b>%${Math.round(mi.rate * 100)}</b></div>
          ${cur ? (() => { const ri = K.rateInfo(DB, c, cur, ccy); return `<div class="more" title="${esc(ri.why)}"><small>Faiz (devrederse)</small><b>${K.fmtRate(ri.eff)}/ay</b><small style="opacity:.85">${K.fmtRate(ri.akt)} + KKDF/BSMV · yıllık ${K.fmtRate(ri.akt * 12)}</small><small style="opacity:.85">${esc(ri.why)}</small></div>`; })() : ""}
          ${(() => { const IR = K.interestReport(DB, App.today().getFullYear(), App.today()); const o = IR.byCard.find(x => x.card.id === c.id); return o ? `<div class="more"><small>${App.today().getFullYear()} faizi (kart)</small><b>${K.fmt(o.total + o.accruing)}</b><small style="opacity:.85">${o.bank > K.EPS ? "bankadan " + K.fmt(o.bank) : ""}${o.est > K.EPS ? " tahmini " + K.fmt(o.est) : ""}${o.inst > K.EPS ? " taksit " + K.fmt(o.inst) : ""}${o.accruing > K.EPS ? " işleyen " + K.fmt(o.accruing) : ""}</small></div>` : ""; })()}
          ${(() => { const P = K.pendingLoad(DB, c, ccy, App.today()); const g = c.groupId ? K.groupById(DB, c.groupId) : null; const LU = K.limitUsage(DB, App.today()).find(x => x.id === (g && g.limit ? g.id : c.id));
            const tlEq = v => ccy !== "TRY" && K.rateFor(DB, K.ymOf(App.today()), ccy) ? `<small style="opacity:.85">≈ ${K.fmt(K.toTL(DB, v, ccy), "TRY", { noDec: true })}</small>` : "";
            const CPd = K.cardPending(DB, c.id);
            const fut = K.round2(P.total + (ccy === K.accountsOf(c)[0] ? CPd.total : 0));   // bekleyen bu döneme dahil
            return `<div class="more"><small>Gelecek ekstreler</small><b>${K.fmt(fut, ccy)}</b>${tlEq(fut)}</div>${CPd.total > 0 ? `<div class="more"><small>Bekleyen</small><b>${K.fmt(CPd.total, "TRY")}</b></div>` : ""}<div class="more"><small>Toplam borç (gelecek dahil)</small><b>${K.fmt(L.debt - L.credit + fut, ccy)}</b>${tlEq(L.debt - L.credit + fut)}</div>${LU && LU.limit ? `<div><small>Kullanılabilir limit</small><b>${K.fmt(LU.avail, "TRY", { noDec: true })}</b></div>` : ""}`; })()}
        </div>
        <label for="dmoreChk" class="dtoggle"><span class="s1">Ayrıntıları göster ▾</span><span class="s2">Ayrıntıları gizle ▴</span></label>
      </div>
      ${ccy !== "TRY" && !K.rateFor(DB, K.ymOf(App.today()), ccy) ? `<div class="alert warn"><span class="ic">${K.CCY_SYM[ccy]}</span><div class="grow"><b>${K.CCY_NAME[ccy]} kuru girilmemiş</b> — bu hesabın borcu ortak/kart limitinden düşülemiyor ve TL toplamına eklenmiyor.</div><button data-act="fetchRates">Kuru çek</button>&nbsp;&nbsp;<button data-act="goSettings">Elle gir</button></div>` : ""}
      ${(() => { if (!cur) return ""; const A = K.accrual(DB, c, L, L.rows.indexOf(cur), App.today()); if (!(A.full > K.EPS)) return "";
        return cur.rem > K.EPS
          ? `<div class="alert warn"><span class="ic">${ic("fire")}</span><div class="grow"><b>Bu hesapta faiz işliyor</b> — son ödemede kalan ${K.fmt(A.unpaidAtDue, ccy)} için kesim tarihinden (${K.fmtDate(cur.cut)}) itibaren gün gün faiz işler. Bugüne kadar <b>${K.fmt(A.sofar, ccy)}</b>; ${K.fmtDate(A.nextCut)} kesimine kadar ödemezsen ≈ <b>${K.fmt(A.full, ccy)}</b> ${K.MONTHS[A.nextCut.getMonth()]} ekstresine gelir. Bu kartla yeni harcama yapma.</div></div>`
          : `<div class="alert info"><span class="ic">${ic("soon")}</span><div class="grow"><b>${A.lateDays} gün geç kapandı</b> — son ödemede kalan ${K.fmt(A.unpaidAtDue, ccy)} için kesim tarihinden ödediğin güne kadar ≈ <b>${K.fmt(A.full, ccy)}</b> faiz (vergili) işledi; ${K.MONTHS[A.nextCut.getMonth()]} ekstresine gelecek. Kesin rakamı o ekstreyi girerken "faiz" kutusuna yazabilirsin.</div></div>`; })()}
      ${accs.length > 1 ? `<div class="seg ccytabs">${accs.map(a => `<button data-act="cardDetail" data-card="${c.id}" data-ccy="${a}" class="${a === ccy ? "on" : ""}">${a === "TRY" ? "TL hesabı" : a + " hesabı"}</button>`).join("")}</div>` : ""}
      <div class="btnrow" style="margin-top:0;margin-bottom:var(--s4)">
        <button class="btn" data-act="pay" data-card="${c.id}" data-ccy="${ccy}">${ic("card")} Ödeme ekle</button>
        <button class="btn ghost" data-act="newStatement" data-card="${c.id}" data-ccy="${ccy}">${ic("receipt")} Ekstre ekle</button>
        <button class="btn ghost" data-act="periodOne" data-card="${c.id}" data-ccy="${ccy}">${ic("cart")} Dönem içi harcama</button>
        <button class="btn ghost" data-act="pendNew" data-card="${c.id}">${ic("hourglass")} Bekleyen</button>
        <button class="btn ghost" data-act="newInst" data-card="${c.id}" data-ccy="${ccy}">+ Taksit</button>
      </div>
      <div class="note" style="margin-bottom:var(--s3)">Ekstre her ay <b>${c.cutDay}. gün</b> kesilir, son ödeme <b>${c.dueDay}. gün</b>.</div>
      <details class="tip" style="margin-bottom:var(--s3)"><summary>ⓘ Kesilen ve kesilmemiş ekstre nedir?</summary><div class="note box"><b>Kesilen ekstre</b> = bankanın kesinleştirdiği borç: son ödeme tarihi ve asgarisi var, ödemelerin buraya yazılır. <b>Henüz kesilmemiş</b> = harcamaya devam ettiğin dönem; bankada gördüğün tutarı (dönem içi) ya da taksitleri yazarsın, kesilince bankadaki gerçek tutarı girersin.</div></details>
      <div class="seg dtabs" role="tablist">
        <button type="button" data-dtab-btn="gelecek">Gelecek${nUp + nPend ? " <span class=\"cnt\">" + (nUp + nPend) + "</span>" : ""}</button>
        <button type="button" data-dtab-btn="ekstre">Ekstreler${rows.length ? " <span class=\"cnt\">" + rows.length + "</span>" : ""}</button>
        ${insts.length ? `<button type="button" data-dtab-btn="taksit">Taksitler <span class="cnt">${insts.length}</span></button>` : ""}
      </div>
      <div class="dtab" data-dtab="gelecek">
        ${I.pendingListHtml(c)}
        ${upcomingHtml(c, ccy) || `<div class="empty">Henüz kesilmemiş harcama, taksit ya da bekleyen yok.</div>`}
      </div>
      <div class="dtab" data-dtab="ekstre">
        <div class="sec-title" style="margin-top:var(--s2)"><h2>Kesilen ekstreler</h2><span class="hint">gerçek borç · ödemeler</span></div>
        <div class="timeline">${tl || `<div class="empty">Bu hesap için ekstre yok. "Ekstre ekle" ile başla.</div>`}</div>
        ${orphan}
      </div>
      ${insts.length ? `<div class="dtab" data-dtab="taksit">
        <div class="sec-title" style="margin-top:var(--s2)"><h2>Bu hesabın taksitleri</h2></div>${insts.map(x => `<div class="kv-line"><span>${x.kind === "stmt" ? ic("puzzle") + " " : ""}${esc(x.desc)} · ${x.count} ay · ${K.monthLabel(x.start, true)}'dan</span><span class="num">${K.fmt(x.per, x.ccy)}/ay <button class="iconbtn sm" data-act="editInst" data-id="${x.id}">${ic("edit")}</button></span></div>`).join("")}
      </div>` : ""}
    `, { wide: true });
    if (App.tab === "kartlar" && window.matchMedia("(min-width:1100px)").matches) App.setSideDetail(c.id);
    /* sekmeler: son seçilen hatırlanır; gelecek boşsa ekstrelere düşer */
    {
      const m = $("#modal"), avail = $$("[data-dtab-btn]", m).map(b => b.dataset.dtabBtn);
      const pick = t => {
        if (!avail.includes(t)) t = (nUp + nPend) ? "gelecek" : "ekstre";
        App.dtab = t;
        $$("[data-dtab-btn]", m).forEach(b => b.classList.toggle("on", b.dataset.dtabBtn === t));
        $$("[data-dtab]", m).forEach(d => d.classList.toggle("hidden", d.dataset.dtab !== t));
      };
      $$("[data-dtab-btn]", m).forEach(b => b.addEventListener("click", () => pick(b.dataset.dtabBtn)));
      pick(App.dtab || ((nUp + nPend) ? "gelecek" : "ekstre"));
    }
  }

  /* ---------- kart formu ---------- */
  function openCardForm(cardId) {
    const DB = App.DB, c = cardId ? K.cardById(DB, cardId) : null;
    const color = c ? cardColor(c) : COLORS[DB.cards.length % COLORS.length];
    const ccys = c ? K.accountsOf(c) : ["TRY"];
    const r = DB.settings.minRule;
    App.modal(`
      ${mh(c ? "Kartı düzenle" : "Yeni kart")}
      <label class="lbl">Kart adı</label>
      <input type="text" id="cName" value="${c ? esc(c.name) : ""}" placeholder="ör. Wings Platinum" autofocus>
      <div class="row2">
        <div><label class="lbl">Banka <span class="opt">(opsiyonel)</span></label><input type="text" id="cBank" list="bankList" value="${c ? esc(c.bank || "") : ""}" placeholder="ör. Akbank"><datalist id="bankList">${BANKS.map(b => `<option value="${b}">`).join("")}</datalist></div>
        <div><label class="lbl">Son 4 hane <span class="opt">(opsiyonel)</span></label><input type="text" id="cLast4" inputmode="numeric" maxlength="4" value="${c ? esc(c.last4 || "") : ""}" placeholder="1234"></div>
      </div>
      <label class="lbl">Renk</label>
      <div class="swatches" id="cColors">${COLORS.map(x => `<button type="button" data-c="${x}" style="background:${x}" class="${x === color ? "on" : ""}"></button>`).join("")}<input type="color" id="cColorCustom" value="${color}" style="width:36px;height:32px;border:0;background:transparent;padding:0" title="Özel renk"></div>
      <label class="lbl">Hesaplar (para birimleri)</label>
      <div class="chips" id="cCcys">${K.CCYS.map(x => `<button type="button" data-v="${x}" class="${ccys.includes(x) ? "on" : ""}">${x === "TRY" ? "₺ TL" : x === "EUR" ? "€ Euro" : "$ Dolar"}</button>`).join("")}</div>
      <div class="note" style="margin-top:var(--s2)">Kartın döviz hesabı varsa (bankadan ayrı döviz ekstresi geliyorsa) Euro / Dolar'ı da seç.</div>
      <div class="row2">
        <div><label class="lbl">Kart limiti (₺)</label><input type="text" id="cLimit" inputmode="decimal" value="${c && c.limit ? c.limit : ""}" placeholder="ör. 75000"></div>
        <div><label class="lbl">Ortak limit grubu <span class="opt">(opsiyonel)</span></label>
          <select id="cGroup"><option value="">Yok — kendi limiti</option>${DB.groups.map(g => `<option value="${g.id}" ${c && c.groupId === g.id ? "selected" : ""}>${esc(g.name)}${g.limit ? " · " + K.fmt(g.limit, "TRY", { noDec: true }) : ""}</option>`).join("")}<option value="__new">+ Yeni grup oluştur…</option></select></div>
      </div>
      <div id="cNewGroup" class="row2 hidden"><div><label class="lbl">Grup adı</label><input type="text" id="cGName" placeholder="ör. Akbank ortak limit"></div><div><label class="lbl">Ortak limit (₺)</label><input type="text" id="cGLimit" inputmode="decimal"></div></div>
      <div class="row2">
        <div><label class="lbl">Hesap kesim günü</label><input type="number" id="cCut" min="1" max="31" value="${c ? c.cutDay : 8}"></div>
        <div><label class="lbl">Son ödeme günü</label><input type="number" id="cDue" min="1" max="31" value="${c ? c.dueDay : 18}"></div>
      </div>
      <div class="note" id="cDaysHint" style="margin-top:var(--s2)"></div>
      <label class="lbl">Asgari ödeme oranı</label>
      ${segHtml("cMinMode", [["auto", "Otomatik (limite göre)"], ["manual", "Elle gir"]], c && c.minMode === "manual" ? "manual" : "auto")}
      <div id="cMinAuto" class="note" style="margin-top:var(--s2)"></div>
      <div id="cMinManual" class="hidden"><input type="number" id="cMinRate" min="1" max="100" value="${c && c.minRate ? c.minRate : 40}" style="margin-top:var(--s2)" placeholder="%"></div>
      <label class="check" style="margin-top:var(--s3)"><input type="checkbox" id="cSpend" ${c && c.spendCard ? "checked" : ""}> <span><b>Harcama kartım</b> — günlük harcamaları bu karta topluyorum, her ay tamamını ödüyorum</span></label>
      <details class="adv" ${c && c.rateMode === "manual" ? "open" : ""}><summary>Gelişmiş: faiz oranı, not</summary>
        <label class="lbl">Faiz oranı</label>
        ${segHtml("cRateMode", [["auto", "Otomatik (TCMB kademesi)"], ["manual", "Elle gir"]], c && c.rateMode === "manual" ? "manual" : "auto")}
        <div id="cRateAuto" class="note" style="margin-top:var(--s2)">Her ekstrenin dönem borcuna göre kademe seçilir: ${(DB.settings.rateTiers || []).map((x, i, T) => (i === 0 ? fmtTL0(x.max) + " altı " : x.max == null ? fmtTL0(T[i - 1].max) + " üstü " : fmtTL0(T[i - 1].max) + "–" + fmtTL0(x.max) + " ") + "%" + String(x.akt).replace(".", ",")).join(" · ")} (+ KKDF/BSMV). Kademeler Ayarlar'dan değişir.</div>
        <div id="cRateManual" class="row2 hidden">
          <div><label class="lbl">Akdi faiz (aylık %)</label><input type="text" id="cAkt" inputmode="decimal" value="${c && typeof c.aktRate === "number" ? String(c.aktRate).replace(".", ",") : ""}" placeholder="ör. 3,75"></div>
          <div><label class="lbl">Gecikme faizi (aylık %)</label><input type="text" id="cGec" inputmode="decimal" value="${c && typeof c.gecRate === "number" ? String(c.gecRate).replace(".", ",") : ""}" placeholder="boş = akdi + 0,30"></div>
        </div>
        <label class="lbl">Not</label><input type="text" id="cNote" value="${c ? esc(c.note || "") : ""}" placeholder="ör. yıllık aidat Mart'ta">
      </details>
      <div class="btnrow">
        <button class="btn" id="cSave">${c ? "Kaydet" : "Kartı ekle"}</button>
        ${c ? `<button class="btn ghost" id="cArchive">${c.archived ? "Arşivden çıkar" : "Arşivle"}</button><button class="btn danger" id="cDel">Sil</button>` : ""}
        <button class="btn ghost" data-close>Vazgeç</button>
      </div>
    `);
    const m = $("#modal");
    App.attachCalc($("#cLimit")); App.attachCalc($("#cGLimit"));
    let pickedColor = color;
    $("#cColors").addEventListener("click", e => { const b = e.target.closest("button[data-c]"); if (!b) return; pickedColor = b.dataset.c; $$("#cColors button").forEach(x => x.classList.toggle("on", x === b)); $("#cColorCustom").value = pickedColor; });
    $("#cColorCustom").addEventListener("input", e => { pickedColor = e.target.value; $$("#cColors button").forEach(x => x.classList.remove("on")); });
    $("#cCcys").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) b.classList.toggle("on"); });
    $("#cGroup").addEventListener("change", e => { $("#cNewGroup").classList.toggle("hidden", e.target.value !== "__new"); updMin(); });
    const updDays = () => {
      const cd = +val("cCut") || 8, dd = +val("cDue") || 18;
      const t = App.today();
      const cut = K.clampDate(t.getFullYear(), t.getMonth(), cd);
      const due = K.dueDateOf({ month: K.ymOf(cut) }, { cutDay: cd, dueDay: dd });
      $("#cDaysHint").textContent = `Örnek: ${K.monthLabel(K.ymOf(cut))} ekstresi ${K.fmtDate(cut)} kesilir → son ödeme ${K.fmtDate(due)} (${K.dayDiff(cut, due)} gün).`;
    };
    const updRate = () => { const m2 = segVal("cRateMode"); $("#cRateManual").classList.toggle("hidden", m2 !== "manual"); $("#cRateAuto").classList.toggle("hidden", m2 === "manual"); };
    const updMin = () => {
      updRate();
      const mode = segVal("cMinMode");
      $("#cMinManual").classList.toggle("hidden", mode !== "manual");
      $("#cMinAuto").classList.toggle("hidden", mode === "manual");
      let lim = K.calc(val("cLimit"));
      const gid = val("cGroup");
      if (gid === "__new") { const gl = K.calc(val("cGLimit")); if (gl > 0) lim = gl; }
      else if (gid) { const g = K.groupById(DB, gid); if (g && g.limit > 0) lim = g.limit; }
      const has = lim > 0;
      const low = has && lim <= r.threshold;
      $("#cMinAuto").innerHTML = has
        ? `Asgari: <b>%${low ? r.low : r.high}</b> — ${gid ? "ortak " : ""}limit ${K.fmt(lim, "TRY", { noDec: true })} ${low ? "≤" : ">"} ${K.fmt(r.threshold, "TRY", { noDec: true })}. <span class="faint">(Kural: ${K.fmtPlain(r.threshold)} ve altı %${r.low}, üstü %${r.high} — Ayarlar'dan değişir)</span>`
        : `Limit girilince otomatik belirlenir: ${K.fmtPlain(r.threshold)} ₺ ve altı <b>%${r.low}</b>, üstü <b>%${r.high}</b>.`;
    };
    ["cCut", "cDue"].forEach(id => $("#" + id).addEventListener("input", updDays));
    ["cLimit", "cGLimit"].forEach(id => $("#" + id).addEventListener("input", updMin));
    App.bindSeg(m, updMin); updDays(); updMin();

    $("#cSave").onclick = () => {
      const name = val("cName").trim();
      if (!name) return toast("Kart adı gerekli");
      const sel = $$("#cCcys button.on").map(b => b.dataset.v);
      if (!sel.length) return toast("En az bir para birimi seç");
      if (c) {
        const removed = K.accountsOf(c).filter(x => !sel.includes(x));
        for (const x of removed) {
          if (DB.statements.some(s => s.cardId === c.id && s.ccy === x) || DB.payments.some(p => p.cardId === c.id && p.ccy === x))
            return toast(x + " hesabında kayıt var — önce o ekstre/ödemeleri sil");
        }
      }
      const cut = Math.min(31, Math.max(1, parseInt(val("cCut")) || 8));
      const due = Math.min(31, Math.max(1, parseInt(val("cDue")) || 18));
      let groupId = val("cGroup") || null;
      if (groupId === "__new") {
        const gname = val("cGName").trim() || (val("cBank").trim() ? val("cBank").trim() + " ortak limit" : "Ortak limit");
        const g = { id: K.uid("g"), name: gname, limit: K.calc(val("cGLimit")) > 0 ? K.round2(K.calc(val("cGLimit"))) : null };
        DB.groups.push(g); groupId = g.id;
      }
      const akt = K.calc(val("cAkt")), gec = K.calc(val("cGec"));
      const data = {
        name, bank: val("cBank").trim(), last4: val("cLast4").replace(/\D/g, "").slice(0, 4), color: pickedColor,
        ccys: sel, limit: K.calc(val("cLimit")) > 0 ? K.round2(K.calc(val("cLimit"))) : null, groupId,
        cutDay: cut, dueDay: due, minMode: segVal("cMinMode"), minRate: parseFloat(val("cMinRate")) || null,
        note: val("cNote").trim()
      };
      const target = c || { id: K.uid("c"), archived: false };
      Object.assign(target, data);
      target.rateMode = segVal("cRateMode") === "manual" && akt > 0 && akt < 50 ? "manual" : "auto";
      if (akt > 0 && akt < 50 && val("cAkt").trim()) target.aktRate = K.round2(akt); else delete target.aktRate;
      if (gec > 0 && gec < 50 && val("cGec").trim()) target.gecRate = K.round2(gec); else delete target.gecRate;
      if ($("#cSpend").checked) { DB.cards.forEach(x => { if (x !== target) delete x.spendCard; }); target.spendCard = true; } else delete target.spendCard;
      if (c && (c.cutDay !== undefined)) delete target.daysUnset;
      if (!c) DB.cards.push(target);
      App.closeModal(); App.commit(c ? "Kart güncellendi" : name + " eklendi");
    };
    if (c) {
      $("#cArchive").onclick = () => {
        const s = App.snap(); c.archived = !c.archived; App.closeModal();
        App.commit(c.archived ? c.name + " arşivlendi — geçmişi korunuyor" : c.name + " tekrar aktif", s);
      };
      $("#cDel").onclick = () => confirmDeleteCard(c);
    }
  }

  function confirmDeleteCard(c) {
    const DB = App.DB;
    const nS = DB.statements.filter(s => s.cardId === c.id).length, nP = DB.payments.filter(p => p.cardId === c.id).length, nI = DB.installments.filter(i => i.cardId === c.id).length;
    App.modal(`
      ${mh("Kartı sil: " + esc(c.name))}
      <p class="note">${nS + nP + nI ? `Bu kartta <b>${nS} ekstre, ${nP} ödeme, ${nI} taksit</b> kaydı var. Silersen hepsi gider.<br><br>Kartı artık kullanmıyorsan <b>Arşivle</b> daha iyi: kart listelerden ve toplamlardan çıkar ama geçmişi kalır.` : "Bu kartta kayıt yok, güvenle silebilirsin."}</p>
      <div class="btnrow">
        ${nS + nP + nI ? `<button class="btn" id="dArch">Arşivle</button>` : ""}
        <button class="btn danger" id="dDel">Kalıcı olarak sil</button>
        <button class="btn ghost" data-close>Vazgeç</button>
      </div>`);
    const a = $("#dArch"); if (a) a.onclick = () => { const s = App.snap(); c.archived = true; App.closeModal(); App.commit(c.name + " arşivlendi", s); };
    $("#dDel").onclick = () => {
      const s = App.snap();
      DB.cards = DB.cards.filter(x => x.id !== c.id);
      DB.statements = DB.statements.filter(x => x.cardId !== c.id);
      DB.payments = DB.payments.filter(x => x.cardId !== c.id);
      DB.installments = DB.installments.filter(x => x.cardId !== c.id);
      DB.shared.entries.forEach(e => { if (e.cardId === c.id) e.cardId = null; });
      App.closeModal(); App.commit(c.name + " silindi", s);
    };
  }

  Object.assign(I, { cardTile, renderKartlar, upcomingRows, upcomingTable, upcomingHtml, openCardDetail, openCardForm, confirmDeleteCard });
})();
