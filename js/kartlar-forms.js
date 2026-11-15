/* =====================================================================
   Kart Kokpiti — Kartlar: ödeme / ekstre / dönem içi / bekleyen / taksit pencereleri
   app.js (kabuk) önce yüklenir; ortak yardımcılar App.I üzerinden gelir.
   kartlar.js üçe bölündü (18 Kasım 2026): kartlar-cards.js + bu dosya + kartlar-planning.js.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { ic, moneyHtml, COLORS, BANKS, persist, toast, mh, val, num, segVal, segHtml, activeCards, cardColor, ccyPill, accountOptions, currentStmtMonth, devirAt, limParts, hotAccounts, sharedNetTL, restructLeft, fmtTL0, rateText, chipClass, rateLine, esc, $, $$, loadDB, initTheme } = I;
  const fetchRates = (...a) => I.fetchRates(...a);
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
      App.flash = { card: cid, ccy: cc, t: Date.now() };
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
      App.flash = { card: c.id, ccy: cc, t: Date.now() };
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
      App.flash = { card: cid, ccy: cc, t: Date.now() };
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
      const rows = I.upcomingRows(cid, cc, { per: per > 0 ? K.round2(per) : 0, count, start, excludeId: x ? x.id : null });
      $("#iPreview").innerHTML = I.upcomingTable(rows, cc, val("iDesc").trim() || (x ? x.desc : "bu taksit"));
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
      const rows = I.upcomingRows(cardId, ccy, { per: per > 0 ? per : 0, count: n, start: val("siS"), excludeId: x ? x.id : null });
      $("#siPrev").innerHTML = I.upcomingTable(rows, ccy, "ekstre taksiti");
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

  Object.assign(I, { openPayment, openStatement, openBatch, periodRow, openPeriodUpdate, hasFx, pendOld, openPending, openPendingPost, pendingListHtml, monthOptions, openPeriodOne, openInstForm, openConvert, stmtBump, clearBumps, bumpOf, openStmtInst });
})();
