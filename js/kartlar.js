/* =====================================================================
   Kart Kokpiti — Kartlar: kart kutuları, kart detayı, ödeme / ekstre / dönem içi / bekleyen / taksit pencereleri, borç bitiş planı, para dağıtımı
   app.js (kabuk) önce yüklenir; ortak yardımcılar App.I üzerinden gelir.
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
    if (CP.items.some(pendOld)) flags.push(`<span class="flag">Bekleyen 3 günden eski — karta yansıdı mı?</span>`);
    if (c.daysUnset) flags.push(`<span class="flag">Kesim/ödeme günlerini kontrol et</span>`);
    if (LU && LU.missing.length) flags.push(`<span class="flag">${[...new Set(LU.missing.map(m => K.CCY_SYM[m.ccy]))].join("/")} kuru eksik — limit eksik hesaplanıyor</span>`);
    if (!(lim && LU)) flags.push(`<span class="flag">Limit girilmedi</span>`);
    const limPct = LU && LU.limit ? Math.max(0, Math.min(100, Math.round(100 * LU.used / LU.limit))) : 0;
    const limCls = limPct >= 90 ? "bad" : limPct >= 70 ? "warn" : "";
    return `<div class="ccard ${c.archived ? "archived" : ""}" style="--bank:${cardColor(c)}" data-act="cardDetail" data-card="${c.id}">
      <div class="face">
        <div class="top"><div><div class="n">${esc(c.name)}</div><div class="bk">${esc(c.bank || "")}${c.archived ? " · arşivde" : ""}${c.spendCard ? ' · <span class="spendtag">harcama kartı</span>' : ""}</div></div><span class="emv" aria-hidden="true"></span></div>
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
        <div class="btnrow" style="margin:0"><button class="btn ghost" data-act="periodUpdate">${ic("cart")} Dönem içi harcamalar</button><button class="btn ghost" data-act="batchStatement">${ic("layers")} Toplu ekstre gir</button><button class="btn" data-act="addCard">+ Kart ekle</button></div>
      </div>
      <div class="cardgrid">
        ${act.map(cardTile).join("")}
        <div class="ccard add" data-act="addCard"><span class="plus">+</span>Yeni kart</div>
      </div>
      ${arch.length ? `<div style="margin-top:var(--s4)"><button class="btn sm ghost" data-act="toggleArchived">${App.showArchived ? "Arşivi gizle" : "Arşivdeki kartları göster (" + arch.length + ")"}</button></div>
        ${App.showArchived ? `<div class="cardgrid" style="margin-top:var(--s3)">${arch.map(cardTile).join("")}</div>` : ""}` : ""}
      <div class="sec-title" id="instSec"><h2>Taksitler</h2><button class="btn sm soft" data-act="newInst">+ Taksit ekle</button></div>
      ${instHtml ? `<div class="card"><div class="list">${instHtml}</div></div>` : `<div class="faint" style="font-size:13px">Taksitli alışverişlerini ekle — gelecek ayların yükünde görünsün.</div>`}
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
      const bump = row && row.estimate ? K.round2(bumpOf(row.id)) : 0;
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
        ${pendingListHtml(c)}
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

  /* ---------- ödeme ---------- */
  function openPayment(cardId, ccy, pre) {
    const DB = App.DB;
    if (!activeCards().length) return toast("Önce bir kart ekle");
    let sel = cardId ? cardId + "|" + (ccy || "TRY") : null;
    if (!sel) { // en acil açık hesap
      const S = K.summary(DB, App.today());
      const first = S.open[0];
      sel = first ? first.card.id + "|" + first.ccy : activeCards()[0].id + "|" + K.accountsOf(activeCards()[0])[0];
    }
    App.modal(`
      ${mh("Ödeme ekle")}
      ${segHtml("pKind", [["pay", ic("card") + " Ödeme"], ["refund", ic("undo") + " İade / alacak"]], pre && pre.kind === "refund" ? "refund" : "pay")}
      <div id="pKindNote" class="note" style="margin-top:var(--s2)"></div>
      <label class="lbl">Kart · hesap</label>
      <select id="pAcc">${accountOptions(sel)}</select>
      <div id="pInfo"></div>
      <label class="lbl">Tutar</label>
      <input type="text" id="pAmt" class="big" inputmode="decimal" placeholder="0,00" value="${pre && pre.amount ? String(pre.amount).replace(".", ",") : ""}" autofocus>
      <div id="pOver"></div>
      <div class="row2">
        <div><label class="lbl">Ödeme tarihi</label><input type="date" id="pDate" value="${K.isoDate(App.today())}"></div>
        <div><label class="lbl">Not <span class="opt">(opsiyonel)</span></label><input type="text" id="pNote" placeholder="ör. maaştan" value="${pre && pre.note ? esc(pre.note) : ""}"></div>
      </div>
      <div class="btnrow"><button class="btn" id="pSave">Ödemeyi kaydet</button><button class="btn ghost" data-close>Vazgeç</button></div>
    `);
    App.attachCalc($("#pAmt"));
    const upd = () => {
      const [cid, cc] = val("pAcc").split("|");
      $("#pAmt").dataset.ccy = cc;
      const L = K.ledger(DB, cid, cc, App.today());
      const r = L.current;
      if (!r) { $("#pInfo").innerHTML = `<div class="note box" style="margin-top:var(--s3)">Bu hesapta kesilmiş ekstre yok. Ödeme kaydedilir, ekstre eklenince otomatik eşleşir.</div>`; return; }
      $("#pInfo").innerHTML = `<div class="note box" style="margin-top:var(--s3)">
        <b>${K.monthLabel(r.month)} ekstresi</b> · dönem borcu ${K.fmt(r.amount, cc)} · ödenen ${K.fmt(r.paid, cc)}${r.refund > K.EPS ? ` · iade ${K.fmt(r.refund, cc)}` : ""}<br>
        Kalan <b>${K.fmt(r.rem, cc)}</b> · asgari eksik <b>${K.fmt(r.minGap, cc)}</b> · son ödeme ${K.fmtDate(r.due)} <span class="chip ${chipClass(r)}" style="margin-left:var(--s1)">${esc(r.label)}</span></div>
        ${r.rem > K.EPS ? `<div class="chips" style="margin-top:var(--s3)">${r.minGap > K.EPS ? `<button type="button" data-fill="${r.minGap}">Asgari eksiği · ${K.fmt(r.minGap, cc)}</button>` : ""}<button type="button" data-fill="${r.rem}">Tamamı · ${K.fmt(r.rem, cc)}</button></div>` : ""}`;
      $$("#pInfo [data-fill]").forEach(b => b.onclick = () => { $("#pAmt").value = String(b.dataset.fill).replace(".", ","); $("#pAmt").dispatchEvent(new Event("input")); });
    };
    const over = () => {
      const [cid, cc] = val("pAcc").split("|");
      const r = K.ledger(DB, cid, cc, App.today()).current;
      const a = K.calc(val("pAmt"));
      const extra = a - (r ? r.rem : 0);
      $("#pOver").innerHTML = a > 0 && extra > K.EPS ? `<div class="note box" style="margin-top:var(--s2)">${K.fmt(r ? r.rem : 0, cc)} ekstreyi kapatır, fazla <b>${K.fmt(extra, cc)}</b> alacak bakiye olur: sonraki ekstrelerden (taksitler dahil) düşer, limitin de o kadar açılır.</div>` : "";
    };
    $("#pAmt").addEventListener("input", over);
    const kindUpd = () => {
      const rf = segVal("pKind") === "refund";
      $("#pKindNote").innerHTML = rf ? "Mağazadan iade, ücret iadesi gibi <b>bankanın borcuna alacak yazdığı</b> tutarlar. Kalan borcu düşürür ama <b>asgariyi karşılamaz</b> — banka da asgariyi değiştirmez." : "";
      $("#pSave").textContent = rf ? "İadeyi kaydet" : "Ödemeyi kaydet";
      $("#pNote").placeholder = rf ? "ör. Trendyol iadesi" : "ör. maaştan";
    };
    App.bindSeg($("#modal"), kindUpd); kindUpd();
    $("#pAcc").onchange = () => { upd(); over(); }; upd(); over();
    $("#pSave").onclick = () => {
      const a = num("pAmt");
      if (!(a > 0)) return toast("Geçerli bir tutar gir");
      const [cid, cc] = val("pAcc").split("|");
      const rf = segVal("pKind") === "refund";
      const rec = { id: K.uid("p"), cardId: cid, ccy: cc, d: val("pDate") || K.isoDate(App.today()), a, note: val("pNote").trim() };
      if (rf) rec.kind = "refund";
      DB.payments.push(rec);
      const L = K.ledger(DB, cid, cc, App.today());
      App.flash = { card: cid, ccy: cc, t: Date.now() };   // Özet'te ilgili satır kısa süre vurgulanır
      App.closeModal(); App.commit((rf ? "İade kaydedildi" : "Ödeme kaydedildi") + " · " + (L.credit > K.EPS ? K.fmt(L.credit, cc) + " alacak bakiye" : "kalan " + K.fmt(L.debt, cc)) + (L.current && L.current.minGap > K.EPS ? " · asgari eksik " + K.fmt(L.current.minGap, cc) : ""));
    };
  }

  /* ---------- ekstre ---------- */
  function openStatement(o) {
    const DB = App.DB;
    o = o || {};
    if (!activeCards().length) return toast("Önce bir kart ekle");
    let st = o.id ? DB.statements.find(s => s.id === o.id) : null;
    let cardId = st ? st.cardId : (o.card || activeCards()[0].id);
    let ccy = st ? st.ccy : (o.ccy || "TRY");
    const card0 = K.cardById(DB, cardId);
    if (!K.accountsOf(card0).includes(ccy)) ccy = K.accountsOf(card0)[0];
    const month = st ? st.month : (o.month || currentStmtMonth(card0));
    const cards = st ? DB.cards : activeCards();
    App.modal(`
      ${mh(st ? "Ekstreyi düzenle" : "Ekstre ekle", "Bankadan gelen hesap özetindeki <b>Dönem Borcu</b>'nu gir.")}
      <div class="row2">
        <div><label class="lbl">Kart · hesap</label><select id="sAcc">${accountOptions(cardId + "|" + ccy, cards)}</select></div>
        <div><label class="lbl">Ekstre ayı (kesim ayı)</label><input type="month" id="sMonth" value="${month}"></div>
      </div>
      <div id="sExist"></div>
      <label class="lbl">Girdiğin tutar ne?</label>
      ${segHtml("sMode", [["total", "Dönem borcu (bankadaki)"], ["new", "Sadece yeni harcama"]], st && st.basis === "new" && !st.estimate ? "new" : "total")}
      <div id="sDevir"></div>
      <label class="lbl">Tutar</label>
      <input type="text" id="sAmt" class="big" inputmode="decimal" value="${st && !st.estimate ? String(st.amount).replace(".", ",") : ""}" placeholder="0,00" autofocus>
      ${st && st.estimate ? `<div class="note" style="margin-top:var(--s2)">Dönem içi olarak ${K.fmt(st.amount, st.ccy)} yazmıştın — bankadaki dönem borcunu yaz, onun yerini alır.</div>` : ""}
      <div id="sResult" class="note"></div>
      <details class="adv" ${st && (st.cutDate || st.dueDate || st.minPay || st.interest) ? "open" : ""}><summary>Bankadaki kesin tarihler / asgari tutar / faiz (opsiyonel)</summary>
        <div class="row3">
          <div><label class="lbl">Kesim tarihi</label><input type="date" id="sCut" value="${st && st.cutDate ? st.cutDate : ""}"></div>
          <div><label class="lbl">Son ödeme tarihi</label><input type="date" id="sDue" value="${st && st.dueDate ? st.dueDate : ""}"></div>
          <div><label class="lbl">Asgari tutar</label><input type="text" id="sMin" inputmode="decimal" value="${st && st.minPay ? String(st.minPay).replace(".", ",") : ""}"></div>
          <div><label class="lbl">Faiz + vergiler <span class="opt">ekstrede yazan</span></label><input type="text" id="sInt" inputmode="decimal" value="${st && st.interest ? String(st.interest).replace(".", ",") : ""}" placeholder="faiz sayacı için"></div>
        </div>
        <div class="note" style="margin-top:var(--s2)">Boş bırakırsan kartın kesim/ödeme günü ve asgari oranı kullanılır. Tatil kayması vb. durumlarda banka tarihini yaz.</div>
      </details>
      <div class="btnrow">
        <button class="btn" id="sSave">Kaydet</button>
        ${st ? `<button class="btn danger" id="sDel">Ekstreyi sil</button>` : ""}
        <button class="btn ghost" data-close>Vazgeç</button>
      </div>
    `);
    const m = $("#modal");
    App.attachCalc($("#sAmt")); App.attachCalc($("#sMin"));
    let editing = st;
    const upd = () => {
      const [cid, cc] = val("sAcc").split("|"), mo = val("sMonth");
      $("#sAmt").dataset.ccy = cc;
      const c = K.cardById(DB, cid);
      const exist = DB.statements.find(s => s.cardId === cid && s.ccy === cc && s.month === mo);
      if (!st) editing = exist || null;
      $("#sExist").innerHTML = (!st && exist) ? `<div class="alert info" style="margin-top:var(--s3)"><span class="ic">${ic("info")}</span><div class="grow">${exist.estimate ? "Bu dönem için dönem içi harcama yazmıştın" : "Bu ay için kayıt var"} (${K.fmt(exist.amount, cc)}). Kaydedersen ${exist.estimate ? "ekstre tutarı onun yerini alır" : "<b>güncellenir</b>"}.</div></div>` : "";
      const dv = devirAt(cid, cc, mo, editing ? editing.id : null, val("sCut") || null);
      const mode = segVal("sMode");
      const cut = val("sCut") ? K.parseISO(val("sCut")) : K.cutDateOf({ month: mo }, c);
      $("#sDevir").innerHTML = dv.prev
        ? `<div class="note box" style="margin-top:var(--s3)">Önceki dönemden (<b>${K.monthLabel(dv.prev.month)}</b>) kalan: <b>${K.fmt(dv.amount, cc)}</b>${dv.amount > K.EPS ? (mode === "total" ? " — bankadaki dönem borcu bunu zaten içerir." : " — otomatik eklenir; önceki ekstreye ödeme girersen devir kendiliğinden güncellenir.") : " — önceki ekstre tamamen ödenmiş."}<br><span class="faint">Kesim: ${K.fmtDate(cut, true)}</span></div>`
        : `<div class="note" style="margin-top:var(--s2)">Bu hesabın ilk ekstresi. Kesim: ${K.fmtDate(cut, true)}</div>`;
      const a = K.calc(val("sAmt"));
      if (a > 0) {
        const total = mode === "new" ? K.round2(a + dv.amount) : K.round2(a);
        const mr = K.minRateInfo(DB, c);
        const minP = K.calc(val("sMin")) > 0 ? K.calc(val("sMin")) : total * mr.rate;
        $("#sResult").innerHTML = `Kaydedilecek dönem borcu <b>${K.fmt(total, cc)}</b>${dv.amount > K.EPS ? ` (yeni ${K.fmt(total - dv.amount, cc)} + devir ${K.fmt(dv.amount, cc)})` : ""} · asgari ≈ <b>${K.fmt(minP, cc)}</b> <span class="faint">(%${Math.round(mr.rate * 100)}, ${esc(mr.why)})</span>`;
      } else $("#sResult").innerHTML = "";
    };
    App.bindSeg(m, upd);
    ["sAcc", "sMonth", "sCut"].forEach(id => $("#" + id).addEventListener("change", upd));
    ["sAmt", "sMin"].forEach(id => $("#" + id).addEventListener("input", upd));
    upd();
    $("#sSave").onclick = () => {
      const a = num("sAmt");
      if (!(a >= 0) || val("sAmt").trim() === "") return toast("Geçerli bir tutar gir");
      const [cid, cc] = val("sAcc").split("|"), mo = val("sMonth");
      if (!mo) return toast("Ay seç");
      const dup = DB.statements.find(s => s.cardId === cid && s.ccy === cc && s.month === mo && (!editing || s.id !== editing.id));
      if (dup && st) return toast("Bu hesapta o ay için başka bir ekstre var");
      const minP = num("sMin");
      const target = editing || { id: K.uid("s") };
      Object.assign(target, { cardId: cid, ccy: cc, month: mo, amount: a });
      if (segVal("sMode") === "new") target.basis = "new"; else delete target.basis;
      delete target.estimate; delete target.instIncl; delete target.updated;
      if (val("sCut")) target.cutDate = val("sCut"); else delete target.cutDate;
      if (val("sDue")) target.dueDate = val("sDue"); else delete target.dueDate;
      if (minP > 0) target.minPay = minP; else delete target.minPay;
      const intP = num("sInt"); if (intP > 0) target.interest = intP; else delete target.interest;
      clearBumps(target.id);
      if (!editing) DB.statements.push(target);
      App.closeModal(); App.commit(editing ? "Ekstre güncellendi" : "Ekstre eklendi");
    };
    const d = $("#sDel");
    if (d) d.onclick = () => { const s = App.snap(); DB.statements = DB.statements.filter(x => x.id !== st.id); App.closeModal(); App.commit("Ekstre silindi", s); };
  }

  /* ---------- toplu ekstre ---------- */
  function openBatch(month) {
    const DB = App.DB;
    const cards = activeCards();
    if (!cards.length) return toast("Önce bir kart ekle");
    const t = App.today();
    month = month || K.ymOf(t);
    const rowsHtml = () => {
      const mo = val("bMonth") || month;
      return cards.map(c => K.accountsOf(c).map(ccy => {
        const ex = DB.statements.find(s => s.cardId === c.id && s.ccy === ccy && s.month === mo);
        const dv = devirAt(c.id, ccy, mo, ex ? ex.id : null);
        const cut = K.cutDateOf({ month: mo }, c);
        return `<div class="batch-row" style="--bank:${cardColor(c)}"><div><div class="nm"><span style="width:10px;height:10px;border-radius:3px;background:${cardColor(c)}"></span>${esc(c.name)} ${ccyPill(ccy)}</div>
          <div class="hint">kesim ${K.fmtDate(cut)}${dv.prev ? " · önceki kalan " + K.fmt(dv.amount, ccy) : ""}${ex ? " · kayıtlı " + K.fmt(ex.amount, ccy) + (ex.basis === "new" ? " (yeni harcama)" : " (dönem borcu)") : ""}</div></div>
          <input type="text" inputmode="decimal" data-acc="${c.id}|${ccy}" data-ccy="${ccy}" value="${ex ? String(ex.amount).replace(".", ",") : ""}" placeholder="${ex ? "" : "boş = atla"}"></div>`;
      }).join("")).join("");
    };
    App.modal(`
      ${mh("Toplu ekstre girişi", "Bir ayın tüm ekstrelerini tek ekranda gir. Boş bıraktıkların atlanır.")}
      <div class="row2"><div><label class="lbl">Ay</label><input type="month" id="bMonth" value="${month}"></div>
      <div><label class="lbl">Girdiğin tutarlar</label>${segHtml("bMode", [["total", "Dönem borcu"], ["new", "Yeni harcama"]], DB.statements.filter(s => s.basis === "new").length > DB.statements.length / 2 ? "new" : "total")}</div></div>
      <div id="bRows" style="margin-top:var(--s3)">${rowsHtml()}</div>
      <div class="note" style="margin-top:var(--s2)"><b>Dönem borcu</b> = bankadaki hesap özetindeki tutar (devir dahil). <b>Yeni harcama</b> = sadece o ayın harcaması; önceki dönemden kalan otomatik eklenir.</div>
      <div class="btnrow"><button class="btn" id="bSave">Hepsini kaydet</button><button class="btn ghost" data-close>Vazgeç</button></div>
    `, { wide: true });
    const m = $("#modal");
    App.bindSeg(m);
    const bindCalc = () => $$("#bRows input").forEach(App.attachCalc);
    bindCalc();
    $("#bMonth").onchange = () => { $("#bRows").innerHTML = rowsHtml(); bindCalc(); };
    $("#bSave").onclick = () => {
      const mo = val("bMonth"); if (!mo) return toast("Ay seç");
      const mode = segVal("bMode");
      let n = 0;
      $$("#bRows input[data-acc]").forEach(inp => {
        if (!inp.value.trim()) return;
        const a = K.round2(K.calc(inp.value)); if (!(a >= 0)) return;
        const [cid, cc] = inp.dataset.acc.split("|");
        let ex = DB.statements.find(s => s.cardId === cid && s.ccy === cc && s.month === mo);
        if (!ex) { ex = { id: K.uid("s"), cardId: cid, ccy: cc, month: mo }; DB.statements.push(ex); }
        ex.amount = a;
        if (mode === "new") ex.basis = "new"; else delete ex.basis; delete ex.estimate; delete ex.instIncl; delete ex.updated;
        n++;
      });
      if (!n) return toast("Hiç tutar girilmedi");
      App.closeModal(); App.commit(n + " ekstre kaydedildi · " + K.monthLabel(mo));
    };
  }

  /* ---------- dönem içi harcamalar (henüz kesilmemiş dönem) ---------- */
  /* bankanın uygulamasındaki "dönem içi harcamalar" toplamını ara ara buraya yazarsın;
     uygulama bunu sıradaki (kesilmemiş) ekstreye yazar, taksitleri ekler ve limitten düşer */
  function periodRow(c, ccy, month) {
    const L = K.ledger(App.DB, c.id, ccy, App.today());
    return L.rows.find(r => r.month === month && !r.isCut) || null;
  }
  function openPeriodUpdate(month0) {
    const DB = App.DB, t = App.today();
    const cards = activeCards();
    if (!cards.length) return toast("Önce bir kart ekle");
    const firstM = cards.map(c => K.nextPeriodMonth(c, t)).sort()[0];
    const months = []; for (let k = 0; k < 12; k++) months.push(K.ymAdd(firstM, k));
    const cnt = {}; cards.forEach(c => { const m = K.nextPeriodMonth(c, t); cnt[m] = (cnt[m] || 0) + 1; });
    const mainM = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1))[0];   // kartların çoğunun bu dönemi
    let month = month0 && months.includes(month0) ? month0 : mainM;
    const rowsHtml = () => {
      const list = [];
      cards.forEach(c => K.accountsOf(c).forEach(ccy => {
        const cut = K.cutDateOf({ month }, c);
        if (cut <= t) return;                                   // bu ayın ekstresi zaten kesildi
        const isNext = month === K.nextPeriodMonth(c, t);
        const row = periodRow(c, ccy, month);
        const inst = K.instSum(DB, c.id, ccy, month);
        const cur = row ? (row.estimate ? row.st.amount : (row.basis === "new" ? row.st.amount : row.fresh)) : "";
        const upd = row && row.st.updated ? " · son güncelleme " + K.fmtDate(row.st.updated) : "";
        const pnd = ccy === K.accountsOf(c)[0] ? K.cardPending(DB, c.id) : { total: 0, items: [] };
        list.push(`<div class="batch-row"><div><div class="nm"><span style="width:10px;height:10px;border-radius:3px;background:${cardColor(c)}"></span>${esc(c.name)} ${ccyPill(ccy)}${isNext ? ' <span class="chip soon" style="font-size:10.5px;padding:1px 7px">dönem içi</span>' : ""}</div>
          <div class="hint">kesim ${K.fmtDate(cut)} (${K.dayDiff(t, cut)} gün)${inst > 0 ? " · listedeki taksit " + K.fmt(inst, ccy) : ""}${upd}</div>
          <div class="hint pv" data-pv="${c.id}|${ccy}"></div></div>
          <div><input type="text" inputmode="decimal" data-acc="${c.id}|${ccy}" data-inst="${inst}" data-ccy="${ccy}" value="${cur !== "" ? String(cur).replace(".", ",") : ""}" placeholder="boş = taksit listesi">
          </div></div>${pnd.total > 0 ? `<div class="pend-line">${ic("hourglass")} ${esc(c.name)} · bekleyen ${K.fmt(pnd.total, "TRY")} (${pnd.items.length} işlem) <button class="linkbtn" data-act="cardDetail" data-card="${c.id}">yönet</button></div>` : ""}`);
      }));
      return list.join("") || `<div class="empty">Bu ay için kesilmemiş ekstre yok.</div>`;
    };
    App.modal(`
      ${mh("Ekstrelere gelecek tutarlar", "Bankanın uygulamasına baktıkça her kart için yaz. <b>Bu dönem</b> = dönem içi harcamalar; <b>ileri aylar</b> = bankada o ayın ekstresine yansıyacak görünen tutar. Hepsi limitten düşer.")}
      <div class="row2">
        <div><label class="lbl">Hangi ayın ekstreleri</label><select id="puMonth">${months.map(m => `<option value="${m}" ${m === month ? "selected" : ""}>${K.monthLabel(m)}${m === mainM ? " · bu dönem" : ""}</option>`).join("")}</select></div>
        <div><label class="lbl">Yazdığın tutarlara taksitler dahil mi?</label>${segHtml("puIncl", [["no", "Hayır, eklensin"], ["yes", "Evet, dahil"]], month === mainM ? (DB.settings.periodInstIncl ? "yes" : "no") : "yes")}</div>
      </div>
      <div id="puRows" style="margin-top:var(--s3)">${rowsHtml()}</div>
      <div class="note" style="margin-top:var(--s2)"><b>Enter</b> sonraki karta geçer, son satırda kaydeder. Kutuyu boşaltırsan o kart için yazdığın tutar silinir ve o ay yine taksit listesinden hesaplanır. İşlem yazabilirsin: 3500+250.</div>
      <div class="btnrow"><button class="btn" id="puSave">Kaydet</button><button class="btn ghost" data-close>Vazgeç</button></div>
    `, { wide: true });
    const m = $("#modal");
    const pv = () => {
      const inc = segVal("puIncl") === "yes";
      $$("#puRows input[data-acc]").forEach(inp => {
        const box = m.querySelector(`[data-pv="${inp.dataset.acc}"]`);
        const v = K.calc(inp.value), inst = +inp.dataset.inst || 0, cc = inp.dataset.ccy;
        if (!inp.value.trim() || isNaN(v)) { box.textContent = inst > 0 ? "yazmazsan taksit listesi sayılır: " + K.fmt(inst, cc) : ""; return; }
        box.innerHTML = `→ ${K.monthLabel(month)} ekstresine eklenecek <b>${K.fmt(inc ? v : v + inst, cc)}</b>${!inc && inst > 0 ? ` (${K.fmt(v, cc)} + taksit ${K.fmt(inst, cc)})` : ""}`;
      });
    };
    const bindRows = () => { $$("#puRows input").forEach(i => { App.attachCalc(i); i.addEventListener("input", pv); }); pv(); };
    App.bindSeg(m, pv);
    bindRows();
    $("#puMonth").onchange = () => {
      month = val("puMonth");
      const inc = month === mainM ? (DB.settings.periodInstIncl ? "yes" : "no") : "yes";
      const seg = $("#puIncl"); seg.dataset.value = inc; $$("button", seg).forEach(b => b.classList.toggle("on", b.dataset.v === inc));
      $("#puRows").innerHTML = rowsHtml(); bindRows();
    };
    $("#puSave").onclick = () => {
      const inc = segVal("puIncl") === "yes";
      if (month === mainM) DB.settings.periodInstIncl = inc;
      let n = 0, del = 0;
      const today = K.isoDate(App.today());
      $$("#puRows input[data-acc]").forEach(inp => {
        const [cid, cc] = inp.dataset.acc.split("|");
        const existing = DB.statements.find(s => s.cardId === cid && s.ccy === cc && s.month === month);
        if (!inp.value.trim()) {
          if (existing && existing.estimate) { DB.statements = DB.statements.filter(s => s !== existing); del++; }
          return;
        }
        const v = K.round2(K.calc(inp.value)); if (isNaN(v)) return;
        if (existing && !existing.estimate && Math.abs(existing.amount - v) < K.EPS && existing.basis === "new") return;
        const st = existing || { id: K.uid("s"), cardId: cid, ccy: cc, month };
        Object.assign(st, { amount: v, basis: "new", estimate: true, instIncl: inc, updated: today }); clearBumps(st.id);
        delete st.cutDate; delete st.dueDate; delete st.minPay;
        if (!existing) DB.statements.push(st);
        n++;
      });
      App.closeModal(); App.commit(n ? K.monthLabel(month) + ": " + n + " kart güncellendi" + (del ? " · " + del + " kayıt silindi" : "") : (del ? del + " kayıt silindi" : "Değişiklik yok"));
    };
  }

  const hasFx = c => K.accountsOf(c).some(x => x !== "TRY");
  const pendOld = x => x && x.d && K.dayDiff(K.parseISO(x.d), App.today()) >= 3;

  /* ---------- bekleyen (provizyondaki) işlemler ---------- */
  function openPending(cardId, id) {
    const DB = App.DB, t = App.today();
    const x = id ? DB.pending.find(p => p.id === id) : null;
    const c = K.cardById(DB, x ? x.cardId : cardId) || activeCards()[0];
    if (!c) return toast("Önce bir kart ekle");
    const fx = K.accountsOf(c).filter(a => a !== "TRY");
    const ccy0 = x ? x.ccy : (c.lastPendCcy || fx[0] || "TRY");   // kartta son seçilen para birimi hatırlanır
    App.modal(`
      ${mh(x ? "Bekleyen işlemi düzenle" : "Bekleyen işlem ekle", "Bankanın <b>bekleyenler / provizyon</b> bölümünde TL olarak görünen işlem. Limitten hemen düşer ve bu dönemin harcamalarında görünür; karta yansıyınca seçtiğin hesabın dönem içine geçer.")}
      <label class="lbl">Kart</label><select id="wCard">${activeCards().map(k => `<option value="${k.id}" ${k.id === c.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
      <label class="lbl">Bankada görünen tutar (₺)</label>
      <input type="text" id="wAmt" class="big" inputmode="decimal" value="${x ? String(x.amountTL).replace(".", ",") : ""}" placeholder="0,00" autofocus>
      <label class="lbl">Karta hangi para biriminde yansıyacak?</label>
      <div id="wCcyBox">${segHtml("wCcy", [["TRY", "₺ TL"], ["EUR", "€ Euro"], ["USD", "$ Dolar"]], ccy0)}</div>
      <div class="row2">
        <div><label class="lbl">Not <span class="opt">(opsiyonel)</span></label><input type="text" id="wNote" value="${x ? esc(x.note || "") : ""}" placeholder="ör. Amazon"></div>
        <div><label class="lbl">Tarih</label><input type="date" id="wDate" value="${x ? x.d : K.isoDate(t)}"></div>
      </div>
      <div id="wInfo" class="note" style="margin-top:var(--s2)"></div>
      <div class="btnrow"><button class="btn" id="wSave">Kaydet</button><button class="btn ghost" data-close>Vazgeç</button></div>`);
    const m = $("#modal");
    App.attachCalc($("#wAmt"));
    const upd = () => {
      const k = K.cardById(DB, val("wCard")), cc = segVal("wCcy");
      const has = K.accountsOf(k).includes(cc);
      const r = cc === "TRY" ? 1 : K.rateFor(DB, K.ymOf(t), cc);
      const a = K.calc(val("wAmt"));
      $("#wInfo").innerHTML = (!has ? `<span class="warn">${esc(k.name)} kartında ${cc} hesabı yok — yansıyınca TL dönem içine eklenir.</span><br>` : "")
        + (a > 0 && cc !== "TRY" && r ? `Bugünkü kurla yaklaşık ${K.fmt(a / r, cc)} olarak yansır.` : "");
    };
    App.bindSeg(m, upd); $("#wAmt").addEventListener("input", upd);
    $("#wCard").onchange = () => { const k = K.cardById(DB, val("wCard")); const d = k.lastPendCcy || K.accountsOf(k).find(a => a !== "TRY") || "TRY"; const seg = $("#wCcy"); seg.dataset.value = d; $$("button", seg).forEach(b => b.classList.toggle("on", b.dataset.v === d)); upd(); };
    upd();
    $("#wSave").onclick = () => {
      const a = K.round2(K.calc(val("wAmt")));
      if (!(a > 0)) return toast("Geçerli bir tutar gir");
      const data = { cardId: val("wCard"), amountTL: a, ccy: segVal("wCcy"), note: val("wNote").trim(), d: val("wDate") || K.isoDate(t) };
      if (x) Object.assign(x, data); else DB.pending.push(Object.assign({ id: K.uid("w") }, data));
      const kc = K.cardById(DB, data.cardId); if (kc) kc.lastPendCcy = data.ccy;
      App.closeModal(); App.commit(x ? "Bekleyen güncellendi" : "Bekleyen eklendi · limitten düştü");
    };
  }
  /* karta yansıdı: bekleyenden çıkar, seçilen hesabın bu dönemki dönem içine ekle */
  function openPendingPost(id) {
    const DB = App.DB, t = App.today();
    const x = DB.pending.find(p => p.id === id); if (!x) return;
    const c = K.cardById(DB, x.cardId);
    const accs = K.accountsOf(c);
    const ccy0 = accs.includes(x.ccy) ? x.ccy : accs[0];
    App.modal(`
      ${mh("Karta yansıdı", `${esc(c.name)} · ${x.note ? esc(x.note) + " · " : ""}bekleyen ${K.fmt(x.amountTL, "TRY")} (${K.fmtDate(x.d)})`)}
      <label class="lbl">Hangi para biriminde yansıdı?</label>
      ${segHtml("ypCcy", accs.map(a => [a, a === "TRY" ? "₺ TL" : a === "EUR" ? "€ Euro" : "$ Dolar"]), ccy0)}
      <label class="lbl">Karta yansıyan tutar</label>
      <input type="text" id="ypAmt" class="big" inputmode="decimal" autofocus>
      <div id="ypInfo" class="note box" style="margin-top:var(--s3)"></div>
      <div class="btnrow"><button class="btn" id="ypSave">Dönem içine ekle</button><button class="btn ghost" data-close>Vazgeç</button></div>`);
    const m = $("#modal");
    App.attachCalc($("#ypAmt"));
    const fill = () => {
      const cc = segVal("ypCcy"), r = cc === "TRY" ? 1 : K.rateFor(DB, K.ymOf(t), cc);
      $("#ypAmt").dataset.ccy = cc;
      $("#ypAmt").value = r ? String(K.round2(x.amountTL / r)).replace(".", ",") : "";
      upd();
    };
    const upd = () => {
      const cc = segVal("ypCcy"), v = K.calc(val("ypAmt"));
      const month = K.nextPeriodMonth(c, t);
      const row = periodRow(c, cc, month);
      const cur = row ? (row.estimate || row.basis === "new" ? row.st.amount : row.fresh) : 0;
      $("#ypInfo").innerHTML = (isNaN(v) ? "Bankada karta yansıyan tutarı yaz." : `${K.monthLabel(month)} ${cc === "TRY" ? "TL" : cc} dönem içi: ${K.fmt(cur, cc)} + ${K.fmt(v, cc)} = <b>${K.fmt(cur + v, cc)}</b>`)
        + `<br><span class="faint">Kur tahmini doldurdu; bankadaki gerçek tutarı yazarsan o kullanılır.</span>`;
    };
    App.bindSeg(m, fill); $("#ypAmt").addEventListener("input", upd); fill();
    $("#ypSave").onclick = () => {
      const cc = segVal("ypCcy"), v = K.round2(K.calc(val("ypAmt")));
      if (!(v > 0)) return toast("Geçerli bir tutar gir");
      const month = K.nextPeriodMonth(c, t);
      const ex = DB.statements.find(s => s.cardId === c.id && s.ccy === cc && s.month === month);
      if (ex) {
        if (!(ex.estimate || ex.basis === "new")) { ex.amount = K.round2(ex.amount + v); }
        else ex.amount = K.round2(ex.amount + v);
        if (ex.estimate) ex.updated = K.isoDate(t);
      } else DB.statements.push({ id: K.uid("s"), cardId: c.id, ccy: cc, month, amount: v, basis: "new", estimate: true, instIncl: !!DB.settings.periodInstIncl, updated: K.isoDate(t) });
      DB.pending = DB.pending.filter(p => p.id !== id);
      App.closeModal(); App.commit(`Yansıdı: ${K.fmt(v, cc)} ${K.monthLabel(month)} dönem içine eklendi`);
    };
  }
  function pendingListHtml(c) {
    const P = K.cardPending(App.DB, c.id);
    return `<div class="sec-title" style="margin-top:var(--s1)"><h2>Bekleyenler</h2><span class="hint">provizyon · limitten düştü · karta yansıyınca dönem içine geçecek</span></div>
      <div class="card flat" style="padding:6px 14px;margin-bottom:var(--s2)">
        ${P.items.length ? P.items.map(x => `<div class="pend-row">
          <div><b>${K.fmt(x.amountTL, "TRY")}</b> <span class="faint">→ ${x.ccy === "TRY" ? "TL" : x.ccy} olarak yansıyacak</span>
            <div class="faint" style="font-size:12.5px">${K.fmtDate(x.d)}${x.note ? " · " + esc(x.note) : ""}${pendOld(x) ? ` · <span class="warn">${K.dayDiff(K.parseISO(x.d), App.today())} gündür bekliyor</span>` : ""}</div></div>
          <div class="pend-acts"><button class="btn sm" data-act="pendPost" data-id="${x.id}">Yansıdı</button><button class="btn sm ghost" data-act="pendCancel" data-id="${x.id}">İptal oldu</button><button class="iconbtn sm" data-act="pendEdit" data-id="${x.id}">${ic("edit")}</button></div></div>`).join("")
          : `<div class="note" style="padding:8px 0">Bekleyen işlem yok.</div>`}
        <button class="fc-add" style="width:100%;margin:var(--s2) 0" data-act="pendNew" data-card="${c.id}">+ Bekleyen ekle</button>
      </div>`;
  }

  /* ---------- tek kart · herhangi bir ileri ay için tutar ---------- */
  /* sıradaki dönem = "dönem içi harcama"; daha ileri aylar = bankanın uygulamasında o ay için görünen tutar */
  function monthOptions(card, sel) {
    const t = App.today(), start = K.nextPeriodMonth(card, t);
    const ms = []; for (let k = 0; k < 12; k++) ms.push(K.ymAdd(start, k));
    if (sel && !ms.includes(sel) && sel > start) ms.push(sel);
    return ms.map((m, k) => `<option value="${m}" ${m === sel ? "selected" : ""}>${K.monthLabel(m)} ekstresi${k === 0 ? " · bu dönem" : ""}</option>`).join("");
  }
  function openPeriodOne(o) {
    const DB = App.DB, t = App.today();
    o = o || {};
    if (!activeCards().length) return toast("Önce bir kart ekle");
    const c0 = o.card ? K.cardById(DB, o.card) : activeCards()[0];
    const ccy0 = o.ccy && K.accountsOf(c0).includes(o.ccy) ? o.ccy : K.accountsOf(c0)[0];
    const m0 = o.month && o.month >= K.nextPeriodMonth(c0, t) ? o.month : K.nextPeriodMonth(c0, t);
    App.modal(`
      ${mh("Ekstreye gelecek tutar", "Bu dönem için: bankanın uygulamasındaki <b>dönem içi harcamalar</b>. İleri aylar için: bankada o ayın ekstresine yansıyacak görünen tutar (taksitler vb.).")}
      <div class="row2">
        <div><label class="lbl">Kart · hesap</label><select id="eAcc">${accountOptions(c0.id + "|" + ccy0)}</select></div>
        <div><label class="lbl">Hangi ekstre</label><select id="eMonth">${monthOptions(c0, m0)}</select></div>
      </div>
      <div id="eInfo"></div>
      <label class="lbl" id="eAmtLbl">Tutar</label>
      <input type="text" id="eAmt" class="big" inputmode="decimal" placeholder="0,00" autofocus>
      <label class="lbl">Bu tutar o ayın taksitlerini içeriyor mu?</label>
      ${segHtml("eIncl", [["no", "Hayır — taksitler eklensin"], ["yes", "Evet — dahil"]], "no")}
      <div id="ePrev" class="note box" style="margin-top:var(--s3)"></div>
      <div class="btnrow"><button class="btn" id="eSave">Kaydet</button><button class="btn danger hidden" id="eDel">Kaydı sil</button><button class="btn ghost" data-act="periodUpdate">Tüm kartlar</button><button class="btn ghost" data-close>Vazgeç</button></div>
    `);
    const m = $("#modal");
    App.attachCalc($("#eAmt"));
    let row = null, month = null;
    const setIncl = v => { const seg = $("#eIncl"); seg.dataset.value = v; $$("button", seg).forEach(b => b.classList.toggle("on", b.dataset.v === v)); };
    const load = (keepMonth) => {
      const [cid, cc] = val("eAcc").split("|"), c = K.cardById(DB, cid);
      if (!keepMonth) { const cur = val("eMonth"); $("#eMonth").innerHTML = monthOptions(c, cur >= K.nextPeriodMonth(c, t) ? cur : null); }
      month = val("eMonth");
      const isNext = month === K.nextPeriodMonth(c, t);
      $("#eAmtLbl").textContent = isNext ? "Dönem içi harcamalar toplamı" : K.monthLabel(month) + " ekstresine gelecek tutar (bankada görünen)";
      row = periodRow(c, cc, month);
      $("#eAmt").dataset.ccy = cc;
      $("#eAmt").value = row ? String(row.estimate ? row.st.amount : (row.basis === "new" ? row.st.amount : row.fresh)).replace(".", ",") : "";
      setIncl(row && row.estimate ? (row.st.instIncl ? "yes" : "no") : (isNext ? (DB.settings.periodInstIncl ? "yes" : "no") : "yes"));
      $("#eDel").classList.toggle("hidden", !row);
      upd();
    };
    const upd = () => {
      const [cid, cc] = val("eAcc").split("|"), c = K.cardById(DB, cid);
      const cut = K.cutDateOf({ month }, c);
      const insts = K.instFor(DB, month).filter(x => x.t.cardId === cid && x.t.ccy === cc);
      const inst = insts.reduce((a, x) => a + x.amount, 0);
      $("#eInfo").innerHTML = `<div class="note box" style="margin-top:var(--s3)"><b>${K.monthLabel(month)} ekstresi</b> · kesim ${K.fmtDate(cut, true)} (${K.dayDiff(t, cut)} gün sonra)${row && row.st.updated ? " · son güncelleme " + K.fmtDate(row.st.updated) : ""}${insts.length ? `<br>Listendeki taksitler bu ay: ${insts.map(x => esc(x.t.desc) + (x.pulled ? " (kalan " + x.n + ", erken kapatma)" : " " + x.idx + "/" + x.t.count) + " · " + K.fmt(x.amount, cc)).join(", ")} = <b>${K.fmt(inst, cc)}</b>` : "<br>Listende bu aya düşen taksit yok."}</div>`;
      const v = K.calc(val("eAmt")), inc = segVal("eIncl") === "yes";
      $("#ePrev").innerHTML = isNaN(v) ? (inst > 0 ? `Tutar yazmazsan bu ay listendeki taksitler sayılır: <b>${K.fmt(inst, cc)}</b>` : "Tutarı yazınca bu ekstreye ne ekleneceğini burada görürsün.")
        : `${K.monthLabel(month)} ekstresine eklenecek <b>${K.fmt(inc ? v : v + inst, cc)}</b>${!inc && inst > 0 ? ` = ${K.fmt(v, cc)} + taksit ${K.fmt(inst, cc)}` : ""}${inc && inst > 0 ? ` <span class="faint">(taksitler bu tutarın içinde sayıldı)</span>` : ""}`;
    };
    App.bindSeg(m, upd);
    $("#eAcc").onchange = () => load(false); $("#eMonth").onchange = () => load(true); $("#eAmt").addEventListener("input", upd);
    load(true);
    $("#eSave").onclick = () => {
      const v = K.round2(K.calc(val("eAmt")));
      if (isNaN(v)) return toast("Geçerli bir tutar gir");
      const [cid, cc] = val("eAcc").split("|"), c = K.cardById(DB, cid);
      const inc = segVal("eIncl") === "yes";
      if (month === K.nextPeriodMonth(c, t)) DB.settings.periodInstIncl = inc;
      const ex = DB.statements.find(s => s.cardId === cid && s.ccy === cc && s.month === month);
      const st = ex || { id: K.uid("s"), cardId: cid, ccy: cc, month };
      Object.assign(st, { amount: v, basis: "new", estimate: true, instIncl: inc, updated: K.isoDate(t) }); clearBumps(st.id);
      delete st.cutDate; delete st.dueDate; delete st.minPay;
      if (!ex) DB.statements.push(st);
      App.closeModal(); App.commit(K.monthLabel(month) + " ekstresi için tutar kaydedildi");
    };
    $("#eDel").onclick = () => {
      if (!row) return;
      const s = App.snap(); DB.statements = DB.statements.filter(x => x.id !== row.id);
      App.closeModal(); App.commit("Kayıt silindi — bu ay yine taksit listesinden hesaplanır", s);
    };
  }

  /* ---------- taksit ---------- */
  function openInstForm(id, cardId, ccy) {
    const DB = App.DB;
    const x = id ? DB.installments.find(i => i.id === id) : null;
    if (!activeCards().length) return toast("Önce bir kart ekle");
    const sel = x ? x.cardId + "|" + x.ccy : (cardId ? cardId + "|" + (ccy || "TRY") : "");
    const nextM = K.ymAdd(K.ymOf(App.today()), 1);
    App.modal(`
      ${mh(x ? "Taksiti düzenle" : "Taksit ekle", "Taksitli alışverişin tamamı limitinden hemen düşer; her ay bir taksiti o ayın ekstresine eklenir. Ekstreyi girdiğinde taksit zaten içindedir, ayrıca toplanmaz.")}
      <label class="lbl">Kart · hesap</label><select id="iAcc">${accountOptions(sel, x ? DB.cards : null)}</select>
      <label class="lbl">Açıklama</label><input type="text" id="iDesc" value="${x ? esc(x.desc) : ""}" placeholder="ör. Laptop" autofocus>
      <div class="row2">
        <div><label class="lbl">Aylık taksit</label><input type="text" id="iPer" inputmode="decimal" value="${x ? String(x.per).replace(".", ",") : ""}" placeholder="ör. 24000/6"></div>
        <div><label class="lbl">Taksit sayısı</label><input type="number" id="iCount" min="1" max="48" value="${x ? x.count : 6}"></div>
      </div>
      <label class="lbl">İlk taksitin geldiği ekstre ayı</label><input type="month" id="iStart" value="${x ? x.start : nextM}">
      <div class="note" style="margin-top:var(--s2)">Ertelemeli alışverişte (ör. Ekim'de alıp ilk taksit Ocak'ta) buraya Ocak'ı seç — limit bugünden düşer, Kasım-Aralık ekstresine bir şey eklenmez.</div>
      <label class="lbl">Bu kartın ileriki ayları</label>
      <div id="iPreview" class="card flat" style="padding:8px 14px"></div>
      ${(() => {
        if (!x) return "";
        const c = K.cardById(DB, x.cardId); if (!c) return "";
        const nextP = K.nextPeriodMonth(c, App.today());
        const remN = (x.pullAt && x.pullAt < nextP) ? 0 : Math.max(0, Math.min(x.count, x.count - Math.max(0, K.ymDiff(x.start, nextP))));
        if (!remN && !x.pullAt) return "";
        const months = [0, 1, 2, 3].map(k => K.ymAdd(nextP, k));
        return `<details class="adv" open><summary>Taksitleri önden ödemek</summary>
          ${x.pullAt ? `<div class="alert info" style="margin-top:var(--s3)"><span class="ic">${ic("ok")}</span><div class="grow">Kalan taksitler erken kapatıldı → <b>${K.monthLabel(x.pullAt)}</b> ekstresine toplu geliyor.</div><button id="iUnpull">Geri al</button></div>` : `
          <div class="note" style="margin-top:var(--s2)">Kalan <b>${remN} taksit · ${K.fmt(remN * x.per, x.ccy)}</b> (ilki ${K.monthLabel(K.ymDiff(x.start, nextP) >= 0 ? nextP : x.start)} ekstresinde). İki yol var:</div>
          <div class="note box" style="margin-top:var(--s2)"><b>1) Şimdi fazla ödeme yap.</b> Bankaya ödersin; fazlası alacak bakiye olur, gelecek taksitler her ay yine ekstreye gelir ama bu alacaktan kapanır.
            <div style="display:flex;gap:8px;align-items:center;margin-top:var(--s2);flex-wrap:wrap"><input type="number" id="iPreN" min="1" max="${remN}" value="${Math.min(3, remN)}" style="width:80px"> taksit = <b id="iPreAmt" class="num"></b><button class="btn sm" id="iPrePay" type="button">Ödeme olarak gir</button></div></div>
          <div class="note box" style="margin-top:var(--s2)"><b>2) Bankadan erken kapattım.</b> Kalan taksitlerin hepsi tek ekstreye gelir (faizli taksitte banka faiz indirimi yapabilir).
            <div style="display:flex;gap:8px;align-items:center;margin-top:var(--s2);flex-wrap:wrap"><select id="iPullAt" style="width:auto">${months.map(m => `<option value="${m}">${K.monthLabel(m)} ekstresine</option>`).join("")}</select><button class="btn sm soft" id="iPull" type="button">Erken kapat</button></div></div>`}
        </details>`;
      })()}
      <div class="btnrow"><button class="btn" id="iSave">Kaydet</button>${x ? `<button class="btn danger" id="iDel">Sil</button>` : ""}<button class="btn ghost" data-close>Vazgeç</button></div>
    `);
    App.attachCalc($("#iPer"));
    const prev = () => {
      const [cid, cc] = val("iAcc").split("|");
      const per = K.calc(val("iPer")), count = parseInt(val("iCount")) || 0, start = val("iStart");
      const rows = upcomingRows(cid, cc, { per: per > 0 ? K.round2(per) : 0, count, start, excludeId: x ? x.id : null });
      $("#iPreview").innerHTML = upcomingTable(rows, cc, val("iDesc").trim() || (x ? x.desc : "bu taksit"));
    };
    ["iPer", "iCount", "iDesc"].forEach(i => $("#" + i).addEventListener("input", prev));
    ["iAcc", "iStart"].forEach(i => $("#" + i).addEventListener("change", prev));
    prev();
    $("#iSave").onclick = () => {
      const per = num("iPer"), count = parseInt(val("iCount")), start = val("iStart");
      if (!(per > 0) || !(count >= 1) || !start) return toast("Tutar, taksit sayısı ve ay gerekli");
      const [cid, cc] = val("iAcc").split("|");
      const data = { cardId: cid, ccy: cc, desc: val("iDesc").trim() || "Taksit", per, count, start };
      if (x) Object.assign(x, data); else DB.installments.push(Object.assign({ id: K.uid("i") }, data));
      App.closeModal(); App.commit("Taksit kaydedildi");
    };
    const d = $("#iDel"); if (d) d.onclick = () => { const s = App.snap(); DB.installments = DB.installments.filter(i => i.id !== id); App.closeModal(); App.commit("Taksit silindi", s); };
    const pn = $("#iPreN");
    if (pn) {
      const updPre = () => { $("#iPreAmt").textContent = K.fmt((parseInt(pn.value) || 0) * x.per, x.ccy); };
      pn.addEventListener("input", updPre); updPre();
      $("#iPrePay").onclick = () => { const n = parseInt(pn.value) || 0; if (n < 1) return; App.closeModal(); openPayment(x.cardId, x.ccy, { amount: K.round2(n * x.per), note: x.desc + ": " + n + " taksit önden" }); };
      $("#iPull").onclick = () => { const s = App.snap(); x.pullAt = val("iPullAt"); App.closeModal(); App.commit(x.desc + ": kalan taksitler " + K.monthLabel(x.pullAt) + " ekstresine alındı", s); };
    }
    const up = $("#iUnpull"); if (up) up.onclick = () => { const s = App.snap(); delete x.pullAt; App.closeModal(); App.commit("Erken kapatma geri alındı", s); };
  }

  /* ---------- döviz borcu TL'ye çevrildi ---------- */
  function openConvert(cardId, ccy) {
    const DB = App.DB, t = App.today(), c = K.cardById(DB, cardId);
    if (!c || ccy === "TRY") return;
    if (!K.accountsOf(c).includes("TRY")) return toast("Bu kartın TL hesabı yok — kart ayarından TL'yi ekle");
    const L = K.ledger(DB, cardId, ccy, t), r = L.current;
    if (!r || r.rem <= K.EPS) return toast("Bu hesapta çevrilecek kalan borç yok");
    const day = r.due < t ? K.isoDate(new Date(r.due.getFullYear(), r.due.getMonth(), r.due.getDate() + 1)) : K.isoDate(t);
    const rate0 = K.rateFor(DB, K.ymOf(t), ccy) || "";
    App.modal(`
      ${mh("Döviz borcu TL'ye çevrildi", `Banka ödenmeyen ${K.CCY_NAME[ccy].toLocaleLowerCase("tr-TR")} borcunu kendi kuruyla TL'ye çevirip kartın TL hesabına aktarır. ${K.CCY_NAME[ccy]} hesabının kalanı düşer, TL hesabının borcu o kadar artar; toplam borç değişmez, asgari etkilenmez.`)}
      <div class="note box"><b>${esc(c.name)} ${ccy} · ${K.monthLabel(r.month)} ekstresi</b> — kalan <b>${K.fmt(r.rem, ccy)}</b> · son ödeme ${K.fmtDate(r.due)}</div>
      <div class="row3">
        <div><label class="lbl">Çevrilen ${K.CCY_SYM[ccy]}</label><input type="text" id="cvA" inputmode="decimal" value="${String(r.rem).replace(".", ",")}" autofocus></div>
        <div><label class="lbl">Bankanın kuru</label><input type="text" id="cvR" inputmode="decimal" value="${String(rate0).replace(".", ",")}"></div>
        <div><label class="lbl">TL karşılığı</label><input type="text" id="cvT" inputmode="decimal"></div>
      </div>
      <div class="note" style="margin-top:var(--s2)">Bankanın uygulamasında çevrim işleminin TL tutarını görüyorsan onu yaz — kur kendiliğinden hesaplanır.</div>
      <label class="lbl">Çevrim tarihi</label><input type="date" id="cvD" value="${day}">
      <div id="cvSum" class="note box" style="margin-top:var(--s3)"></div>
      <div class="btnrow"><button class="btn" id="cvSave">Kaydet</button><button class="btn ghost" data-close>Vazgeç</button></div>
    `);
    let tlTouched = false;
    const sum = () => {
      const a = num("cvA"), rt = K.calc(val("cvR")), tl = num("cvT");
      $("#cvSum").innerHTML = a > 0 && tl > 0 ? `${K.fmt(a, ccy)} × ${String(K.round2(tl / a * 10000) / 10000).replace(".", ",")} = <b>${K.fmt(tl, "TRY")}</b> → ${esc(c.name)} TL hesabına eklenir${a < r.rem - K.EPS ? ` · ${ccy} hesabında ${K.fmt(r.rem - a, ccy)} kalır` : ""}` : "Tutar ve kur gir";
      return { a, rt, tl };
    };
    const fromRate = () => { if (tlTouched) return sum(); const a = num("cvA"), rt = K.calc(val("cvR")); $("#cvT").value = a > 0 && rt > 0 ? String(K.round2(a * rt)).replace(".", ",") : ""; sum(); };
    $("#cvA").addEventListener("input", fromRate);
    $("#cvR").addEventListener("input", () => { tlTouched = false; fromRate(); });
    $("#cvT").addEventListener("input", () => { tlTouched = true; const a = num("cvA"), tl = num("cvT"); if (a > 0 && tl > 0) $("#cvR").value = String(Math.round(tl / a * 10000) / 10000).replace(".", ","); sum(); });
    fromRate();
    $("#cvSave").onclick = () => {
      const { a, tl } = sum();
      if (!(a > 0) || !(tl > 0)) return toast("Tutar ve TL karşılığı gerekli");
      if (a > r.rem + K.EPS) return toast("Kalandan (" + K.fmt(r.rem, ccy) + ") fazla çevrilemez");
      const d = val("cvD") || K.isoDate(t), id = K.uid("v"), rate = Math.round(tl / a * 10000) / 10000;
      DB.payments.push({ id: K.uid("p"), cardId, ccy, d, a, kind: "convOut", convId: id, rate, tl, note: "" });
      DB.payments.push({ id: K.uid("p"), cardId, ccy: "TRY", d, a: tl, kind: "convIn", convId: id, rate, from: ccy, fromAmt: a, note: "" });
      App.closeModal(); App.commit(`${c.name}: ${K.fmt(a, ccy)} → ${K.fmt(tl, "TRY")} TL hesabına aktarıldı`);
    };
  }

  /* ---------- ekstre taksitlendirme ---------- */
  // dönem içi tutarları "taksit dahil" girilmişse yeni ekstre taksiti o tutarlarda yoktur → ekle (silinince geri al)
  function stmtBump(x, dir) {
    const DB = App.DB;
    if (dir < 0) { (x.bumps || []).forEach(b => { const st = DB.statements.find(z => z.id === b.id); if (st) st.amount = K.round2(st.amount - b.add); }); delete x.bumps; return []; }
    const c = K.cardById(DB, x.cardId), t = App.today(), out = [];
    for (let k = 0; k < x.count; k++) {
      const m = K.ymAdd(x.start, k);
      const st = DB.statements.find(z => z.cardId === x.cardId && z.ccy === x.ccy && z.month === m && z.estimate && z.instIncl);
      if (!st || K.cutDateOf(st, c) <= t) continue;
      const it = K.instFor(DB, m).find(i => i.t.id === x.id); if (!it) continue;
      st.amount = K.round2(st.amount + it.amount); out.push({ id: st.id, add: it.amount, month: m });
    }
    x.bumps = out; return out;
  }
  /* kullanıcı tutarı yeniden yazdıysa (bankadaki rakam taksiti içerir) eklenen taksit kaydı unutulur */
  function clearBumps(stId) { App.DB.installments.forEach(x => { if (x.bumps) x.bumps = x.bumps.filter(b => b.id !== stId); }); }
  function bumpOf(stId) { return App.DB.installments.reduce((a, x) => a + (x.bumps || []).filter(b => b.id === stId).reduce((s2, b) => s2 + b.add, 0), 0); }
  function openStmtInst(o) {
    const DB = App.DB, t = App.today();
    const x = o.id ? DB.installments.find(i => i.id === o.id) : null;
    const cardId = x ? x.cardId : o.card, ccy = x ? x.ccy : (o.ccy || "TRY");
    const c = K.cardById(DB, cardId); if (!c) return;
    const L = K.ledger(DB, cardId, ccy, t);
    const row = x ? L.rows.find(r => r.id === x.stId) : L.current;
    if (!row) return toast("Taksitlendirilecek kesilmiş ekstre yok");
    if (!x && row.rem <= K.EPS) return toast("Bu ekstrede kalan borç yok");
    const ri = K.rateInfo(DB, c, row, ccy);
    const left = x ? x.principal : K.round2(row.rem - row.minGap > K.EPS ? row.rem - row.minGap : row.rem);
    const startM = x ? x.start : K.nextPeriodMonth(c, t);
    const done = x ? K.instDone(x, K.ymAdd(K.nextPeriodMonth(c, t), -1)) : 0;
    App.modal(`
      ${mh(x ? "Ekstre taksitlendirme" : "Bu ekstreyi taksitlendirdim", "Bankanın ekstre taksitlendirmesiyle kalan borç <b>faizli taksite</b> döner: güncel borçtan çıkar, her ay bir taksit ekstreye gelir. Taksitler limitten düşmeye devam eder.")}
      <div class="note box"><b>${esc(c.name)} ${ccy !== "TRY" ? ccy : ""} · ${K.monthLabel(row.month)} ekstresi</b> — dönem borcu ${K.fmt(row.amount, ccy)} · ödenen ${K.fmt(row.paid, ccy)}${x ? "" : ` · kalan <b>${K.fmt(row.rem, ccy)}</b>${row.minGap > K.EPS ? ` · asgari eksik <b>${K.fmt(row.minGap, ccy)}</b>` : ""}`}</div>
      <label class="lbl">Taksitlendirilen tutar</label>
      <input type="text" id="siP" class="big" inputmode="decimal" value="${String(left).replace(".", ",")}" autofocus>
      ${!x && row.minGap > K.EPS ? `<div class="note" style="margin-top:var(--s1)">Bankalar genelde önce asgariyi ödemeni ister; bu yüzden kalan − asgari eksik (${K.fmt(row.rem - row.minGap, ccy)}) yazıldı. Asgariyi ayrıca ödemen gerekiyor.</div>` : ""}
      <div class="row3">
        <div><label class="lbl">Taksit sayısı</label><input type="number" id="siN" min="2" max="36" value="${x ? x.count : 3}"></div>
        <div><label class="lbl">Aylık faiz %</label><input type="text" id="siR" inputmode="decimal" value="${String(x && x.rate != null ? x.rate : ri.akt).replace(".", ",")}"></div>
        <div><label class="lbl">İlk taksit ekstresi</label><input type="month" id="siS" value="${startM}"></div>
      </div>
      <label class="check" style="margin-top:var(--s2)"><input type="checkbox" id="siTax" ${!x || x.taxIncl !== false ? "checked" : ""}> <span>Faize KKDF + BSMV ekle (×${String(DB.settings.taxMult).replace(".", ",")})</span></label>
      <label class="lbl">Aylık taksit <span class="opt">bankanın gösterdiği tutar varsa onu yaz</span></label>
      <input type="text" id="siPer" inputmode="decimal" value="${x ? String(x.per).replace(".", ",") : ""}">
      <div id="siSum" class="note" style="margin-top:var(--s2)"></div>
      <label class="lbl">Bu kartın ileriki ayları</label>
      <div id="siPrev" class="card flat" style="padding:8px 14px"></div>
      ${x ? `<details class="adv" ${x.pullAt ? "open" : ""}><summary>Erken kapatma</summary>
        ${x.pullAt ? `<div class="alert info" style="margin-top:var(--s3)"><span class="ic">${ic("ok")}</span><div class="grow">Kalan taksitler <b>${K.monthLabel(x.pullAt)}</b> ekstresine ${x.pullAmount ? K.fmt(x.pullAmount, ccy) + " olarak" : "toplu"} geliyor.</div><button id="siUnpull" type="button">Geri al</button></div>`
        : `<div class="note" style="margin-top:var(--s2)">Erken kapatınca banka kalan taksitlerin faizini düşer; bankanın söylediği kapama tutarını yaz (kalan anapara tahmini dolu gelir).</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:var(--s2);flex-wrap:wrap"><select id="siPullAt" style="width:auto">${[0, 1, 2].map(k => K.ymAdd(K.nextPeriodMonth(c, t), k)).filter(m => m >= x.start && m <= K.ymAdd(x.start, x.count - 1)).map(m => `<option value="${m}">${K.monthLabel(m)} ekstresine</option>`).join("")}</select>
          <input type="text" id="siPullAmt" inputmode="decimal" style="width:140px" value="${String(K.annuityLeft(x.per, (x.rate || 0) / 100 * (x.taxIncl === false ? 1 : DB.settings.taxMult), x.count - done)).replace(".", ",")}"><button class="btn sm soft" id="siPull" type="button">Erken kapat</button></div>`}
      </details>` : ""}
      <div class="btnrow"><button class="btn" id="siSave">${x ? "Kaydet" : "Taksitlendirmeyi kaydet"}</button>${x ? `<button class="btn danger" id="siDel">Sil</button>` : ""}<button class="btn ghost" data-close>Vazgeç</button></div>
    `);
    App.attachCalc($("#siP")); App.attachCalc($("#siPer"));
    let perTouched = !!x;
    $("#siPer").addEventListener("input", () => { perTouched = true; upd(); });
    const calcPer = () => { const P = num("siP"), n = parseInt(val("siN")) || 0, r = K.calc(val("siR")) || 0; return K.annuity(P, r / 100 * ($("#siTax").checked ? DB.settings.taxMult : 1), n); };
    const upd = () => {
      const P = num("siP"), n = parseInt(val("siN")) || 0;
      if (!perTouched) $("#siPer").value = P > 0 && n > 0 ? String(calcPer()).replace(".", ",") : "";
      const per = num("siPer");
      $("#siSum").innerHTML = P > 0 && n > 0 && per > 0 ? `Toplam geri ödeme <b>${K.fmt(per * n, ccy)}</b> · faiz <b>${K.fmt(per * n - P, ccy)}</b>${perTouched ? ` <button class="linkbtn" id="siRecalc" type="button">orandan hesapla (${K.fmt(calcPer(), ccy)})</button>` : ""}` : "";
      const rc = $("#siRecalc"); if (rc) rc.onclick = () => { perTouched = false; upd(); };
      const rows = upcomingRows(cardId, ccy, { per: per > 0 ? per : 0, count: n, start: val("siS"), excludeId: x ? x.id : null });
      $("#siPrev").innerHTML = upcomingTable(rows, ccy, "ekstre taksiti");
    };
    ["siP", "siN", "siR"].forEach(i => $("#" + i).addEventListener("input", upd));
    ["siS", "siTax"].forEach(i => $("#" + i).addEventListener("change", upd));
    upd();
    $("#siSave").onclick = () => {
      const P = num("siP"), n = parseInt(val("siN")), per = num("siPer"), start = val("siS"), r = K.calc(val("siR"));
      if (!(P > 0) || !(n >= 2) || !(per > 0) || !start) return toast("Tutar, taksit sayısı ve aylık taksit gerekli");
      if (!x && P > row.rem + K.EPS) return toast("Kalan borçtan (" + K.fmt(row.rem, ccy) + ") fazla taksitlendirilemez");
      if (per * n < P - K.EPS) return toast("Toplam geri ödeme anaparadan az olamaz");
      const s0 = App.snap();
      const target = x || { id: K.uid("i"), kind: "stmt", stId: row.id, cardId, ccy, d: K.isoDate(t) };
      if (x) stmtBump(x, -1);
      Object.assign(target, { desc: K.monthLabel(row.month) + " ekstresi taksitlendirme", principal: P, per, count: n, start, rate: r >= 0 ? K.round2(r) : null, taxIncl: $("#siTax").checked });
      if (!x) DB.installments.push(target);
      const b = stmtBump(target, 1);
      App.closeModal();
      App.commit(`${c.name}: ${K.fmt(P, ccy)} → ${n} × ${K.fmt(per, ccy)} taksit${b.length ? " · " + b.map(z => K.MONTHS[+z.month.slice(5) - 1]).join(", ") + " dönem içi tutarına eklendi" : ""}`, s0);
    };
    const del = $("#siDel"); if (del) del.onclick = () => { const s0 = App.snap(); stmtBump(x, -1); DB.installments = DB.installments.filter(i => i.id !== x.id); App.closeModal(); App.commit("Taksitlendirme silindi — borç ekstreye geri döndü", s0); };
    const pl = $("#siPull"); if (pl) { App.attachCalc($("#siPullAmt")); pl.onclick = () => { const s0 = App.snap(); stmtBump(x, -1); x.pullAt = val("siPullAt"); const a = num("siPullAmt"); if (a > 0) x.pullAmount = a; else delete x.pullAmount; stmtBump(x, 1); App.closeModal(); App.commit("Erken kapatma kaydedildi → " + K.monthLabel(x.pullAt), s0); }; }
    const up = $("#siUnpull"); if (up) up.onclick = () => { const s0 = App.snap(); stmtBump(x, -1); delete x.pullAt; delete x.pullAmount; stmtBump(x, 1); App.closeModal(); App.commit("Erken kapatma geri alındı", s0); };
  }

  /* ---------- borç bitiş planı ---------- */
  function openPayoff() {
    const DB = App.DB, t = App.today();
    const need = K.minMonthlyNeeded(DB, t);
    const SN = sharedNetTL();
    const baseYM = (() => { const S0 = K.summary(DB, t); return S0.items.length ? S0.items[0].row.month : K.ymOf(t); })();
    const init = DB.settings.planMonthly > 0 ? DB.settings.planMonthly : (need ? Math.ceil(need / 1000) * 1000 : "");
    App.modal(`
      ${mh("Borç bitiş planı", "Her ay borca ayırabileceğin tutarı yaz: ay ay hangi kartın ne zaman biteceğini ve toplam faizi gösterir. Bilinen dönem içi harcamalar, taksitler ve bekleyenler hesaba katılır.")}
      <label class="lbl">Her ay borca ayırabileceğim (₺)</label>
      <input type="text" id="poAmt" class="big" inputmode="decimal" value="${init}" autofocus>
      <div class="btnrow" style="margin-top:var(--s2)">
        ${[-5000, -1000, 1000, 5000].map(d => `<button class="btn sm ghost" type="button" data-po="${d}">${d > 0 ? "+" : "−"}${K.fmtPlain(Math.abs(d))}</button>`).join("")}
        ${need ? `<button class="btn sm soft" type="button" id="poNeed">Asgarileri aksatmayan en az: ${K.fmt(need)}</button>` : ""}
      </div>
      ${SN.total > 0.5 ? `<div class="note box" style="margin-top:var(--s3);display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label class="check"><input type="checkbox" id="poShared"> <span>${esc(SN.who.join(", "))}'den alacağım <b>${K.fmt(SN.total)}</b> gelince borca yatır:</span></label>
        <select id="poSharedK" style="width:auto">${[0, 1, 2, 3, 4, 5, 6].map(k => `<option value="${k}" ${k === 1 ? "selected" : ""}>${k === 0 ? "şimdi" : K.monthLabel(K.ymAdd(baseYM, k)) + " ekstresinde"}</option>`).join("")}</select></div>` : ""}
      <div id="poOut"></div>
      <div class="note" style="margin-top:var(--s3)">Varsayımlar: yeni harcama yapmadığın (girilmiş dönem içi, taksit ve bekleyenler hariç), her ay önce tüm asgarilerin, sonra faizi en yüksek borcun ödendiği varsayılır. Faiz her ekstrenin dönem borcuna göre TCMB kademesinden, KKDF/BSMV dahil hesaplanır; faize faiz işlemez. Dövizler bugünkü kurla TL'ye çevrilir. Gerçek tutarlar bankanın hesabına göre biraz oynar.</div>
    `, { wide: true });
    App.attachCalc($("#poAmt"));
    const run = () => {
      const m = num("poAmt");
      if (!(m >= 0)) { $("#poOut").innerHTML = ""; return; }
      const shOn = $("#poShared") && $("#poShared").checked;
      const extra = shOn ? { [+val("poSharedK")]: SN.total } : null;
      const R = K.simulatePayoff(DB, m, t, { extra });
      const R0 = shOn ? K.simulatePayoff(DB, m, t) : null;
      const M = K.simulatePayoff(DB, 0, t, { minOnly: true });
      if (!R.months.length) { $("#poOut").innerHTML = `<div class="empty">Borç yok 🎉</div>`; return; }
      const first = R.months[0];
      const startDebt = K.round2(first.debtEnd + first.pay);
      const plus = K.simulatePayoff(DB, m + 2000, t, { extra });
      const head = `<div class="po-figs">
          <div><small>Bitiş</small><b class="${R.done ? "" : "bad"}">${R.done ? K.monthLabel(R.endMonth) : "120 ayda bitmiyor"}</b><small>${R.done ? (R.endK === 0 ? "bu ay" : R.endK + " ay sonra") : ""}</small></div>
          <div><small>Toplam faiz (vergili)</small><b>${K.fmt(R.totalInterest)}</b></div>
          <div><small>Toplam ödeme</small><b>${K.fmt(R.totalPaid)}</b><small>bugünkü borç ${K.fmt(startDebt)} + bilinen yeni yük + faiz</small></div>
        </div>`;
      const warn = R.shortMonths ? `<div class="alert bad" style="margin-top:var(--s3)"><span class="ic">${ic("late")}</span><div class="grow"><b>Bu tutar ${R.shortMonths} ayda asgarileri karşılamıyor</b> (ilki ${K.monthLabel(R.months.find(x => x.short).month)}: asgariler toplamı ${K.fmt(R.months.find(x => x.short).minNeed)}). Asgarinin altında kalmak gecikme faizi, sicil kaydı ve 3 seferde kartın kapanması demek; bu tablo o durumda yanıltıcıdır.${need ? ` Hiçbir ay aksatmamak için ayda en az <b>${K.fmt(need)}</b> gerekiyor.` : ""}</div></div>` : "";
      const cmp = (R0 ? `<div class="note box ok-box" style="margin-top:var(--s3)">Alacağın gelirse: ${R0.done && R.done && R0.endK > R.endK ? `<b>${R0.endK - R.endK} ay erken</b> biter, ` : ""}<b>${K.fmt(Math.max(0, R0.totalInterest - R.totalInterest))}</b> daha az faiz${R0.shortMonths > R.shortMonths ? `, asgarinin karşılanmadığı ay ${R0.shortMonths} → ${R.shortMonths}` : ""}.</div>` : "") + (R.done ? `<div class="note box" style="margin-top:var(--s3)">${plus.done && plus.endK < R.endK ? `Ayda <b>${K.fmt(2000)}</b> fazla ödersen <b>${R.endK - plus.endK} ay erken</b> biter, <b>${K.fmt(R.totalInterest - plus.totalInterest)}</b> daha az faiz ödersin. ` : ""}${M.done ? `Sadece asgari ödeseydin borç ${K.monthLabel(M.endMonth)}'de biterdi ve ${K.fmt(M.totalInterest)} faiz öderdin.` : ""}</div>` : "");
      const accs = R.accounts.slice().sort((a, b) => (a.paidOff == null ? 999 : a.paidOff) - (b.paidOff == null ? 999 : b.paidOff));
      const accHtml = `<div class="sec-title" style="margin-top:var(--s4)"><h2>Kartlar ne zaman biter?</h2></div><div class="card flat" style="padding:6px 14px">${accs.map(a => `<div class="kv-line"><span><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${cardColor(a.card)};margin-right:6px"></span><b>${esc(a.card.name)}</b> ${a.ccy !== "TRY" ? ccyPill(a.ccy) : ""}</span><span class="num">${a.paidOffMonth ? (a.paidOff === 0 ? "bu ay" : K.monthLabel(a.paidOffMonth)) : "—"} <span class="faint" style="font-size:12.5px">· faiz ${K.fmt(a.interest)}</span></span></div>`).join("")}</div>`;
      const rows = R.months.map(x => `<div class="po-row ${x.short ? "short" : ""}"><b>${x.k === 0 ? "Şimdi · " + K.MONTHS_SHORT[+x.month.slice(5) - 1] : K.monthLabel(x.month, true)}</b><span class="num">${K.fmt(x.pay)}</span><span class="num">${K.fmt(x.minNeed)}</span><span class="num ${x.interest > 0 ? "bad" : ""}">${x.interest > 0 ? K.fmt(x.interest) : "—"}</span><span class="num"><b>${K.fmt(x.debtEnd)}</b></span></div>`).join("");
      $("#poOut").innerHTML = head + warn + cmp + accHtml + `<div class="sec-title" style="margin-top:var(--s4)"><h2>Ay ay</h2><span class="hint">ödeme · o ayın asgarileri · işleyen faiz · ay sonu kalan</span></div>
        <div class="po-table"><div class="po-row po-head"><span>Ekstre</span><span>Ödeme</span><span>Asgariler</span><span>Faiz</span><span>Kalan</span></div>${rows}</div>`;
      if (m > 0 && DB.settings.planMonthly !== m) { DB.settings.planMonthly = m; persist(); App.render(); }
    };
    let tm = null;
    $("#poAmt").addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(run, 250); });
    $$("[data-po]").forEach(b => b.onclick = () => { const v = Math.max(0, (num("poAmt") || 0) + (+b.dataset.po)); $("#poAmt").value = v; run(); });
    const nb = $("#poNeed"); if (nb) nb.onclick = () => { $("#poAmt").value = need; run(); };
    ["poShared", "poSharedK"].forEach(i => { const e = $("#" + i); if (e) e.addEventListener("change", run); });
    run();
  }

  /* ---------- ödeme planlayıcı ---------- */
  function openPlanner() {
    const DB = App.DB;
    App.modal(`
      ${mh("Elimdeki parayı dağıt", "Önce gecikmiş, sonra son ödemesi yaklaşan <b>asgariler</b> (sicil ve kart kapanmaması için, pazarlıksız). Artan para <b>faizi en yüksek borçtan</b> kapatmaya gider; faizler eşitse asgari oranı yüksek kart önce (sonraki ayın asgari yükü daha çok düşer).")}
      <label class="lbl">Elindeki tutar (₺)</label>
      <input type="text" id="plAmt" class="big" inputmode="decimal" placeholder="ör. 25000" autofocus>
      <div class="btnrow"><button class="btn" id="plGo">Planla</button><button class="btn ghost" data-close>Kapat</button></div>
      <div id="plOut"></div>`);
    App.attachCalc($("#plAmt"));
    $("#plGo").onclick = () => {
      const b = num("plAmt"); if (!(b > 0)) return toast("Geçerli bir tutar gir");
      const P = K.planPayments(DB, b, App.today());
      if (!P.lines.length) { $("#plOut").innerHTML = `<div class="empty">Ödenecek açık borç yok 🎉</div>`; return; }
      $("#plOut").innerHTML = `<div class="sec-title" style="margin-top:var(--s4)"><h2>Önerilen dağıtım</h2></div>
        ${P.lines.map(l => `<div class="kv-line"><span><b>${esc(l.item.card.name)}</b> ${ccyPill(l.item.ccy)} <span class="faint" style="font-size:12.5px">${l.kind} · ${esc(l.why)}</span></span><span class="num">${K.fmt(l.amount, l.item.ccy)}${l.item.ccy !== "TRY" ? ` <span class="faint">≈ ${K.fmt(l.tl)}</span>` : ""}</span></div>`).join("")}
        <div class="note" style="margin-top:var(--s2)">Dağıtılan ${K.fmt(P.used)} · artan ${K.fmt(P.left)}${P.saving > K.EPS ? ` · bu ödemeler devretseydi ayda ≈ <b>${K.fmt(P.saving)}</b> faiz (vergili) işleyecekti` : ""}</div>
        <div class="note" style="margin-top:var(--s2)">Paranın aylar içinde nasıl biteceğini görmek için <button class="linkbtn" data-act="openPayoff">${ic("flag")} Borç bitiş planı</button>.</div>
        <div class="btnrow"><button class="btn" id="plApply">Bu ödemeleri bugünün tarihiyle kaydet</button></div>
        <div class="note faint">Bu sadece kayıt — gerçek ödemeyi bankandan yapmalısın.</div>`;
      $("#plApply").onclick = () => {
        P.lines.forEach(l => DB.payments.push({ id: K.uid("p"), cardId: l.item.card.id, ccy: l.item.ccy, d: K.isoDate(App.today()), a: l.amount, note: "plan" }));
        App.closeModal(); App.commit(P.lines.length + " ödeme kaydedildi");
      };
    };
  }

  Object.assign(I, { cardTile, renderKartlar, upcomingRows, upcomingTable, upcomingHtml, openCardDetail, openCardForm, confirmDeleteCard, openPayment, openStatement, openBatch, periodRow, openPeriodUpdate, hasFx, pendOld, openPending, openPendingPost, pendingListHtml, monthOptions, openPeriodOne, openInstForm, openConvert, stmtBump, clearBumps, bumpOf, openStmtInst, openPayoff, openPlanner });
})();
