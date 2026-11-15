/* =====================================================================
   Kart Kokpiti — içe / dışa aktarma
   • JSON yedek (bu uygulama) · eski taslak (Kart Kokpiti v7/v8) yedeği · Claude "ekstre paketi"
   • Eski 2026 Excel takip dosyası (Kart Takip + gezi sayfaları + Ayarlar)
   • Excel'e aktarma · örnek veri · sıfırlama
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App;
  const { $, esc } = App;

  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function pickFile(accept, cb) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept;
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) cb(f); };
    inp.click();
  }
  let xlsxP = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (xlsxP) return xlsxP;
    xlsxP = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = res; s.onerror = () => { xlsxP = null; rej(new Error("xlsx")); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }
  App.loadXlsx = loadXlsx;

  /* ---------------- JSON yedek ---------------- */
  function exportJSON() {
    const DB = App.DB;
    DB.meta.lastBackup = K.isoDate(App.today());
    const blob = new Blob([JSON.stringify(Object.assign({ app: "kart-takip" }, DB), null, 1)], { type: "application/json" });
    download("kart_kokpiti_yedek_" + K.isoDate(new Date()) + ".json", blob);
    App.commit("Yedek indirildi");
  }

  /* eski Kart Kokpiti (v7/v8) yedeğini yeni şemaya çevirir */
  function convertOldKokpit(old) {
    const DB = K.seed();
    const idMap = {};
    (old.cards || []).forEach(c => {
      const nid = K.uid("c"); idMap[c.id] = nid;
      const accs = Array.isArray(c.accounts) && c.accounts.length ? c.accounts : [{ ccy: "TRY", limit: null }];
      const tryAcc = accs.find(a => a.ccy === "TRY");
      const nc = {
        id: nid, name: c.name, bank: "", color: App.autoColor(c.name), ccys: accs.map(a => a.ccy),
        limit: tryAcc && tryAcc.limit > 0 ? tryAcc.limit : null, groupId: null,
        cutDay: c.cutDay || 8, dueDay: c.dueDay || 18, minMode: "auto", archived: false
      };
      if (typeof c.aktRate === "number") nc.aktRate = c.aktRate;
      if (typeof c.gecRate === "number") nc.gecRate = c.gecRate;
      // eski oran yeni kuralla çelişiyorsa otomatik kalsın; limit yoksa eski oranı koru
      if (!nc.limit && c.minRate > 0) { nc.minMode = "manual"; nc.minRate = Math.round(c.minRate * 100); }
      DB.cards.push(nc);
    });
    (old.limitGroups || []).forEach(g => {
      const ng = { id: K.uid("g"), name: g.name || "Ortak limit", limit: g.limit > 0 ? g.limit : null };
      DB.groups.push(ng);
      (g.cardIds || []).forEach(cid => { const c = DB.cards.find(x => x.id === idMap[cid]); if (c) c.groupId = ng.id; });
    });
    (old.statements || []).forEach(s => {
      const cid = idMap[s.cardId]; if (!cid) return;
      DB.statements.push({ id: K.uid("s"), cardId: cid, ccy: s.ccy || "TRY", month: s.month, amount: K.round2(s.amount) });
      const pays = Array.isArray(s.payments) ? s.payments : (s.paidAmount > 0 ? [{ d: s.month + "-17", a: s.paidAmount }] : []);
      pays.forEach(p => { if (!p.devir && p.a > 0) DB.payments.push({ id: K.uid("p"), cardId: cid, ccy: s.ccy || "TRY", d: p.d, a: K.round2(p.a), note: "" }); });
    });
    Object.keys(old.rates || {}).forEach(m => { const v = old.rates[m]; if (v > 0) DB.rates[m] = { EUR: v }; });
    if (old.settings) { if (old.settings.aktRate) DB.settings.aktRate = old.settings.aktRate; if (old.settings.gecRate) DB.settings.gecRate = old.settings.gecRate; }
    (old.installments || []).forEach(t => { const cid = idMap[t.cardId]; if (cid) DB.installments.push({ id: K.uid("i"), cardId: cid, ccy: t.ccy || "TRY", desc: t.desc || "Taksit", per: t.per, count: t.count, start: t.start }); });
    const sh = old.shared;
    if (sh && Array.isArray(sh.entries) && (sh.entries.length || sh.partnerName)) {
      const p = { id: K.uid("u"), name: sh.partnerName || "Partner" };
      DB.shared.people.push(p);
      const tripIds = {};
      sh.entries.forEach(e => {
        if (e.type === "settle") {
          const amt = Math.abs(e.amountTL || 0); if (amt < 0.01) return;
          DB.shared.settlements.push({ id: K.uid("st"), personId: p.id, d: e.d, ccy: "TRY", amount: K.round2(amt), dir: e.amountTL < 0 ? "in" : "out", note: "eski uygulamadan" });
          return;
        }
        let tripId = null;
        if (e.trip) { if (!tripIds[e.trip]) { const t = { id: K.uid("t"), name: e.trip, personId: p.id }; DB.shared.trips.push(t); tripIds[e.trip] = t.id; } tripId = tripIds[e.trip]; }
        const mySplit = typeof e.splitVal === "number" ? e.splitVal : (sh.mySplit != null ? sh.mySplit : 50);
        const split = e.splitMode === "amount" ? { mode: "custom", mine: K.round2(mySplit) } : (mySplit === 50 ? { mode: "half" } : mySplit === 100 ? { mode: "me" } : mySplit === 0 ? { mode: "them" } : { mode: "pct", pct: mySplit });
        DB.shared.entries.push({ id: K.uid("e"), personId: p.id, d: e.d, place: e.desc || "", cat: "Diğer", ccy: e.ccy || "TRY", amount: K.round2(e.amount), paidBy: e.paidBy === "other" ? "them" : "me", split, tripId, cardId: e.cardId ? idMap[e.cardId] || null : null, city: "", note: "" });
      });
    }
    return DB;
  }

  function importJSON() {
    pickFile(".json,application/json", f => {
      const r = new FileReader();
      r.onload = () => {
        let data;
        try { data = JSON.parse(r.result); } catch (e) { return App.toast("Geçerli bir JSON dosyası değil"); }
        // 1) bu uygulamanın yedeği
        if (data && data.v === 2 && Array.isArray(data.cards) && Array.isArray(data.payments)) {
          return confirmReplace(`<b>${esc(f.name)}</b>: ${data.cards.length} kart, ${data.statements.length} ekstre, ${data.payments.length} ödeme, ${(data.shared && data.shared.entries || []).length} ortak harcama.`, () => App.replaceDB(data, "Yedek geri yüklendi"));
        }
        // 2) Claude "ekstre paketi"
        if (data && data.type === "ekstre-paketi" && Array.isArray(data.ekstreler)) return importPackage(data);
        // 3) eski Kart Kokpiti
        if (data && Array.isArray(data.cards) && Array.isArray(data.statements)) {
          const conv = convertOldKokpit(data);
          return confirmReplace(`<b>${esc(f.name)}</b> eski <b>taslak sürüm</b> yedeği: ${conv.cards.length} kart, ${conv.statements.length} ekstre, ${conv.payments.length} ödeme, ${conv.shared.entries.length} ortak harcama. Yeni yapıya çevrilecek (otomatik "devir" kayıtları ödeme sayılmaz, zincir yeniden hesaplanır).`, () => App.replaceDB(conv, "Eski uygulama verisi aktarıldı"));
        }
        App.toast("Bu dosya tanınmadı");
      };
      r.readAsText(f);
    });
  }
  function confirmReplace(desc, onYes) {
    const has = App.DB.cards.length || App.DB.shared.entries.length;
    App.modal(`${App.mh("Veriyi yükle")}
      <p class="note">${desc}</p>
      ${has ? `<div class="alert warn"><span class="ic">⚠</span><div class="grow">Mevcut verilerin <b>tamamen değiştirilecek</b>. Emin değilsen önce mevcut halini yedekle.</div></div>` : ""}
      <div class="btnrow">${has ? `<button class="btn ghost" data-act="exportJSON">Önce yedek al</button>` : ""}<button class="btn" id="crYes">Yükle</button><button class="btn ghost" data-close>Vazgeç</button></div>`);
    $("#crYes").onclick = () => { App.closeModal(); onYes(); };
  }
  function importPackage(data) {
    const DB = App.DB;
    const norm = t => String(t || "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
    const plan = [];
    let skipped = 0;
    data.ekstreler.forEach(e => {
      const card = DB.cards.find(c => norm(c.name) === norm(e.kart) || norm(c.name).includes(norm(e.kart)) || norm(e.kart).includes(norm(c.name)));
      if (!card || !e.month || !(e.amount >= 0) || !e.ccy) { skipped++; return; }
      plan.push({ card, e });
    });
    App.modal(`${App.mh("Ekstre paketi")}
      <p class="note">${plan.length} ekstre bulundu${skipped ? ", " + skipped + " tanesi hiçbir kartla eşleşmedi" : ""}. Var olanların tutarı güncellenir, olmayanlar eklenir.</p>
      ${plan.map(p => `<div class="kv-line"><span>${esc(p.card.name)} ${App.ccyPill(p.e.ccy)} · ${K.monthLabel(p.e.month)}</span><span class="num">${K.fmt(p.e.amount, p.e.ccy)}</span></div>`).join("")}
      <div class="btnrow"><button class="btn" id="pkYes">Uygula</button><button class="btn ghost" data-close>Vazgeç</button></div>`);
    $("#pkYes").onclick = () => {
      plan.forEach(p => {
        const ex = DB.statements.find(s => s.cardId === p.card.id && s.ccy === p.e.ccy && s.month === p.e.month);
        if (ex) { ex.amount = K.round2(p.e.amount); delete ex.basis; }
        else DB.statements.push({ id: K.uid("s"), cardId: p.card.id, ccy: p.e.ccy, month: p.e.month, amount: K.round2(p.e.amount) });
      });
      App.closeModal(); App.commit(plan.length + " ekstre işlendi");
    };
  }

  /* ---------------- eski Excel ---------------- */
  const normH = s => String(s == null ? "" : s).toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  function toYM(v) {
    if (v instanceof Date) return K.ymOf(new Date(v.getTime() + 12 * 3600000)); // saat dilimi kaymasına karşı
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + "-" + K.pad(d.getUTCMonth() + 1); }
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})/); if (m) return m[1] + "-" + K.pad(+m[2]);
    m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); if (m) return m[3] + "-" + K.pad(+m[2]);
    return null;
  }
  function toISO(v) {
    if (v instanceof Date) return K.isoDate(new Date(v.getTime() + 12 * 3600000));
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + "-" + K.pad(d.getUTCMonth() + 1) + "-" + K.pad(d.getUTCDate()); }
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + "-" + K.pad(+m[2]) + "-" + K.pad(+m[3]);
    m = s.match(/^(\d{4})-(\d{1,2})$/); if (m) return m[1] + "-" + K.pad(+m[2]) + "-01";
    m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); if (m) return m[3] + "-" + K.pad(+m[2]) + "-" + K.pad(+m[1]);
    return null;
  }
  const n = v => typeof v === "number" ? v : (v == null || v === "" ? NaN : K.calc(String(v)));
  function findHeader(rows, must) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const r = (rows[i] || []).map(normH);
      if (must.every(m => r.includes(m))) return { idx: i, cols: r };
    }
    return null;
  }

  function parseOldWorkbook(wb) {
    const out = { cards: {}, statements: [], rates: {}, trips: [], names: null, warnings: [] };
    wb.SheetNames.forEach(sn => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null });
      /* Ayarlar: kart ayarları + kur tablosu */
      const ka = findHeader(rows, ["kart adı", "asgari oran"]);
      if (ka) {
        // aynı satırda birden fazla tablo olabilir → "kart adı" sütunundan başla
        const ci = ka.cols.indexOf("kart adı"), ai = ka.cols.indexOf("asgari oran");
        const li = ka.cols.findIndex(c => c.startsWith("limit"));
        for (let i = ka.idx + 1; i < rows.length; i++) {
          const r = rows[i] || []; const name = r[ci];
          if (!name) break;
          out.cards[String(name).trim()] = Object.assign(out.cards[String(name).trim()] || {}, { minRate: n(r[ai]), limit: li >= 0 ? n(r[li]) : NaN });
        }
      }
      const kt = findHeader(rows, ["ay", "alış", "satış"]);
      if (kt) {
        const yi = kt.cols.indexOf("ay"), si = kt.cols.indexOf("satış");
        for (let i = kt.idx + 1; i < rows.length; i++) {
          const r = rows[i] || []; const ym = toYM(r[yi]); const v = n(r[si]);
          if (!ym) break; if (v > 0) out.rates[ym] = { EUR: v };
        }
      }
      /* ana kart takip tablosu */
      const main = findHeader(rows, ["kart adı", "para birimi", "ay", "borç"]);
      if (main) {
        const c = main.cols, I = k => c.indexOf(k);
        const iN = I("kart adı"), iC = I("para birimi"), iA = I("ay"), iB = I("borç"), iP = I("ödenen");
        for (let i = main.idx + 1; i < rows.length; i++) {
          const r = rows[i] || []; const name = r[iN]; if (!name) continue;
          const ym = toYM(r[iA]); if (!ym) continue;
          const amt = n(r[iB]) || 0, paid = iP >= 0 ? (n(r[iP]) || 0) : 0;
          const nm = String(name).trim(), ccy = String(r[iC] || "TRY").toUpperCase().includes("EUR") ? "EUR" : String(r[iC] || "").toUpperCase().includes("USD") ? "USD" : "TRY";
          out.cards[nm] = out.cards[nm] || {};
          out.cards[nm].ccys = out.cards[nm].ccys || new Set(); out.cards[nm].ccys.add(ccy);
          if (amt > 0.004 || paid > 0.004) out.statements.push({ card: nm, ccy, month: ym, amount: K.round2(amt), paid: K.round2(paid) });
        }
      }
      /* gezi sayfaları */
      const tr = findHeader(rows, ["tarih", "kategori", "yer", "birim", "harcama"]);
      if (tr) {
        const c = tr.cols, I = k => c.indexOf(k);
        const raw = (rows[tr.idx] || []).map(x => String(x == null ? "" : x).trim());
        const personCols = raw.map((h, i) => ({ h, i })).filter(x => / TL$/i.test(x.h) && !/^top/i.test(x.h));
        if (personCols.length < 2) return;
        const meName = personCols[0].h.replace(/ TL$/i, ""), otherName = personCols[1].h.replace(/ TL$/i, "");
        out.names = out.names || { me: meName, other: otherName };
        const title = ((rows[tr.idx - 1] || []).find(x => x != null && String(x).trim()) || sn);
        const iD = I("tarih"), iS = I("şehir"), iK = I("kategori"), iY = I("yer"), iU = I("birim"), iH = I("harcama"), iT = c.findIndex(x => x === "top. tl" || x === "toplam tl");
        const entries = [];
        for (let i = tr.idx + 1; i < rows.length; i++) {
          const r = rows[i] || []; const amt = n(r[iH]);
          if (!isFinite(amt) || amt === 0) continue;
          const tot = iT >= 0 ? n(r[iT]) : NaN, meTL = n(r[personCols[0].i]);
          let split = { mode: "half" };
          if (isFinite(tot) && tot !== 0 && isFinite(meTL)) {
            const ratio = meTL / tot;
            if (Math.abs(ratio - 0.5) < 0.005) split = { mode: "half" };
            else if (Math.abs(ratio - 1) < 0.005) split = { mode: "me" };
            else if (Math.abs(ratio) < 0.005) split = { mode: "them" };
            else split = { mode: "custom", mine: K.round2(amt * ratio) };
          }
          const u = String(r[iU] || "TRY").toUpperCase();
          entries.push({ d: toISO(r[iD]), city: r[iS] ? String(r[iS]).trim() : "", cat: r[iK] ? String(r[iK]).trim() : "Diğer", place: r[iY] ? String(r[iY]).trim() : "", ccy: u.includes("EUR") ? "EUR" : u.includes("USD") ? "USD" : "TRY", amount: K.round2(amt), split });
        }
        if (entries.length) out.trips.push({ name: String(title).trim(), sheet: sn, entries });
      }
    });
    return out;
  }

  function importExcel() {
    pickFile(".xlsx,.xlsm,.xls", async f => {
      try { await loadXlsx(); } catch (e) { return App.toast("Excel okuyucu yüklenemedi — internet bağlantısı gerekli"); }
      const buf = await f.arrayBuffer();
      let wb; try { wb = XLSX.read(buf, { cellDates: true }); } catch (e) { return App.toast("Excel dosyası okunamadı"); }
      const P = parseOldWorkbook(wb);
      const cardNames = Object.keys(P.cards).filter(k => P.cards[k].ccys || P.statements.some(s => s.card === k));
      const nE = P.trips.reduce((a, t) => a + t.entries.length, 0);
      if (!cardNames.length && !nE) return App.toast("Bu dosyada tanınan bir tablo bulunamadı");
      const has = App.DB.cards.length || App.DB.shared.entries.length;
      const paidCount = P.statements.filter(s => s.paid > 0).length;
      App.modal(`
        ${App.mh("Eski Excel'den aktar", esc(f.name))}
        <div class="card flat" style="padding:6px 14px">
          <div class="kv-line"><span>Kartlar</span><span class="num">${cardNames.length ? cardNames.map(esc).join(", ") : "—"}</span></div>
          <div class="kv-line"><span>Aylık ekstre satırı</span><span class="num">${P.statements.length} (${paidCount} tanesinde ödeme)</span></div>
          <div class="kv-line"><span>Aylık kur</span><span class="num">${Object.keys(P.rates).length} ay</span></div>
          <div class="kv-line"><span>Geziler</span><span class="num">${P.trips.length ? P.trips.map(t => esc(t.name) + " (" + t.entries.length + ")").join(", ") : "—"}</span></div>
          ${P.names ? `<div class="kv-line"><span>Ortak harcama</span><span class="num">${esc(P.names.me)} & ${esc(P.names.other)}</span></div>` : ""}
        </div>
        <label class="lbl">Excel'deki aylık "Borç" tutarları neydi?</label>
        ${App.segHtml("xMode", [["new", "O ayın yeni harcaması"], ["total", "Bankadaki dönem borcu"]], "new")}
        <div class="note box" style="margin-top:var(--s2)">Excel'inde her ay ayrı satırdı ve <b>tüm ayların kalanları toplanıyordu</b> — yani tutarlar o ayın yeni harcamasıydı (önerilen). Uygulama bunları devir zincirine çevirir: <i>Ağustos dönem borcu = Ağustos harcaması + Temmuz'dan kalan</i>. Toplam borcun Excel'deki "Toplam Kalan" ile aynı çıkar ama artık ikiye katlanma riski olmaz.</div>
        <div class="note" style="margin-top:var(--s2)">• "Ödenen" sütunu, o ayın son ödeme gününe tarihlenmiş tek bir ödeme olarak aktarılır.<br>• Excel'de kesim / son ödeme günleri olmadığı için varsayılan (8 / 18) atanır — aktarımdan sonra kartlarda düzeltmen gerekir.<br>• Gezilerde tüm harcamaları <b>${esc(P.names ? P.names.me : "sen")}</b> ödemiş sayılır; satırdaki pay dağılımı korunur.</div>
        ${has ? `<label class="lbl">Mevcut verilerin</label>${App.segHtml("xMerge", [["replace", "Sil, Excel ile başla"], ["merge", "Üstüne ekle"]], "replace")}` : ""}
        <div class="btnrow"><button class="btn" id="xGo">Aktar</button><button class="btn ghost" data-close>Vazgeç</button></div>`);
      App.bindSeg($("#modal"));
      $("#xGo").onclick = () => {
        const mode = App.segVal("xMode"), merge = App.segVal("xMerge") === "merge";
        const snap = App.snap();
        const DB = merge ? App.DB : K.seed();
        if (!merge) DB.settings = App.DB.settings;
        const idOf = {};
        cardNames.forEach(nm => {
          let c = DB.cards.find(x => x.name.toLocaleLowerCase("tr-TR") === nm.toLocaleLowerCase("tr-TR"));
          const info = P.cards[nm];
          const ccys = info.ccys ? [...info.ccys] : ["TRY"];
          if (!c) {
            c = { id: K.uid("c"), name: nm, bank: /wings|axess/i.test(nm) ? "Akbank" : /maximum/i.test(nm) ? "İş Bankası" : /qnb|extra|play/i.test(nm) ? "QNB" : "", color: App.autoColor(nm), ccys, limit: info.limit > 0 ? info.limit : null, groupId: null, cutDay: 8, dueDay: 18, minMode: "auto", archived: false, daysUnset: true };
            DB.cards.push(c);
          } else c.ccys = [...new Set((c.ccys || []).concat(ccys))];
          idOf[nm] = c.id;
        });
        P.statements.forEach(s => {
          const cid = idOf[s.card]; if (!cid) return;
          let st = DB.statements.find(x => x.cardId === cid && x.ccy === s.ccy && x.month === s.month);
          if (!st) { st = { id: K.uid("s"), cardId: cid, ccy: s.ccy, month: s.month }; DB.statements.push(st); }
          st.amount = s.amount;
          if (mode === "new") st.basis = "new"; else delete st.basis;
          if (s.paid > 0) {
            const card = DB.cards.find(x => x.id === cid);
            const due = K.dueDateOf(st, card);
            DB.payments.push({ id: K.uid("p"), cardId: cid, ccy: s.ccy, d: K.isoDate(due), a: s.paid, note: "Excel'den" });
          }
        });
        Object.keys(P.rates).forEach(m => { DB.rates[m] = Object.assign({}, DB.rates[m] || {}, P.rates[m]); });
        if (P.trips.length && P.names) {
          if (P.names.me && (!DB.settings.myName || DB.settings.myName === "Ben")) DB.settings.myName = P.names.me;
          let person = DB.shared.people.find(p => p.name.toLocaleLowerCase("tr-TR") === P.names.other.toLocaleLowerCase("tr-TR"));
          if (!person) { person = { id: K.uid("u"), name: P.names.other }; DB.shared.people.push(person); }
          P.trips.forEach(t => {
            const trip = { id: K.uid("t"), name: t.name, personId: person.id };
            DB.shared.trips.push(trip);
            t.entries.forEach(e => {
              if (e.cat && !DB.shared.categories.includes(e.cat)) DB.shared.categories.push(e.cat);
              DB.shared.entries.push(Object.assign({ id: K.uid("e"), personId: person.id, tripId: trip.id, paidBy: "me", cardId: null, note: "" }, e));
            });
          });
          App.sh.personId = person.id;
        }
        App.closeModal();
        App.DB = K.normalize(DB);
        App.commit(`Aktarıldı: ${cardNames.length} kart, ${P.statements.length} ekstre, ${nE} ortak harcama`, snap);
        App.setTab("kartlar");
      };
    });
  }

  /* ---------------- Excel'e aktar ---------------- */
  async function exportXLSX() {
    try { await loadXlsx(); } catch (e) { return App.toast("Excel kütüphanesi yüklenemedi — JSON yedeği kullan"); }
    const DB = App.DB, t = App.today();
    const wb = XLSX.utils.book_new();
    const st = [];
    DB.cards.forEach(c => K.accountsOf(c).forEach(ccy => {
      K.ledger(DB, c.id, ccy, t).rows.forEach(r => st.push({
        Kart: c.name, Birim: ccy, Ay: r.month, "Kesim": K.isoDate(r.cut), "Son ödeme": K.isoDate(r.due),
        "Devir (önceki)": r.devirIn, "Yeni harcama": r.newSpend == null ? "" : r.newSpend, "Dönem borcu": r.amount,
        "Asgari": r.minPay, "Ödenen": r.paid, "İade": r.refund || 0, "Kalan": r.rem, "Durum": r.label
      }));
    }));
    st.sort((a, b) => a.Ay < b.Ay ? -1 : a.Ay > b.Ay ? 1 : a.Kart.localeCompare(b.Kart, "tr"));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(st), "Ekstreler");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.payments.slice().sort((a, b) => a.d < b.d ? -1 : 1).map(p => { const c = K.cardById(DB, p.cardId); return { Tarih: p.d, Kart: c ? c.name : "?", Birim: p.ccy, Tür: ({ refund: "İade", convOut: "TL'ye çevrildi", convIn: "Dövizden çevrildi" })[p.kind] || "Ödeme", Tutar: p.a, Not: p.note || "" }; })), "Ödemeler");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DB.cards.map(c => { const mi = K.minRateInfo(DB, c); const g = c.groupId ? K.groupById(DB, c.groupId) : null; return { Kart: c.name, Banka: c.bank || "", Hesaplar: K.accountsOf(c).join("+"), Limit: c.limit || "", "Ortak limit": g ? g.name + " " + (g.limit || "") : "", "Asgari %": Math.round(mi.rate * 100), Kesim: c.cutDay, "Son ödeme": c.dueDay, Durum: c.archived ? "arşiv" : "aktif" }; })), "Kartlar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.keys(DB.rates).sort().map(m => ({ Ay: m, EUR: DB.rates[m].EUR || "", USD: DB.rates[m].USD || "" }))), "Kurlar");
    const me = DB.settings.myName || "Ben";
    const sh = DB.shared.entries.slice().sort((a, b) => a.d < b.d ? -1 : 1).map(e => {
      const p = DB.shared.people.find(x => x.id === e.personId), tr = DB.shared.trips.find(x => x.id === e.tripId), mine = K.myShare(e);
      return { Tarih: e.d, Kişi: p ? p.name : "", Gezi: tr ? tr.name : "", Şehir: e.city || "", Kategori: e.cat || "", Yer: e.place || "", Birim: e.ccy, Tutar: e.amount, "Kim ödedi": e.paidBy === "them" ? (p ? p.name : "o") : me, [me + " payı"]: mine, "Karşı taraf payı": K.round2(e.amount - mine) };
    });
    if (sh.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sh), "Ortak harcamalar");
    XLSX.writeFile(wb, "kart_kokpiti_" + K.isoDate(new Date()) + ".xlsx");
    App.toast("Excel indirildi");
  }

  /* ---------------- örnek veri ---------------- */
  function demoData() {
    const DB = K.seed(), t = App.today();
    const M = k => K.ymAdd(K.ymOf(t), k);
    DB.settings.myName = "Hasan";
    const g = { id: "gdemo", name: "Akbank ortak limit", limit: 350000 };
    DB.groups.push(g);
    DB.cards = [
      { id: "cw", name: "Wings Visa", bank: "Akbank", color: "#B5523B", last4: "4821", ccys: ["TRY", "EUR"], limit: null, groupId: g.id, cutDay: 8, dueDay: 18, minMode: "auto", archived: false },
      { id: "ca", name: "Axess", bank: "Akbank", color: "#D64F4F", last4: "1190", ccys: ["TRY"], limit: null, groupId: g.id, cutDay: 3, dueDay: 13, minMode: "auto", archived: false },
      { id: "cm", name: "Maximum Genç", bank: "İş Bankası", color: "#1F6FB3", last4: "7712", ccys: ["TRY"], limit: 10000, groupId: null, cutDay: 25, dueDay: 5, minMode: "auto", archived: false },
      { id: "cq", name: "QNB Extra", bank: "QNB", color: "#8E5BD0", ccys: ["TRY", "USD"], limit: 120000, groupId: null, cutDay: 12, dueDay: 22, minMode: "auto", archived: false }
    ];
    DB.rates[M(-2)] = { EUR: 48.6, USD: 41.9 }; DB.rates[M(-1)] = { EUR: 49.1, USD: 42.3 }; DB.rates[M(0)] = { EUR: 49.4, USD: 42.6 };
    const S = (c, ccy, m, a, extra) => DB.statements.push(Object.assign({ id: K.uid("s"), cardId: c, ccy, month: m, amount: a }, extra || {}));
    const P = (c, ccy, d, a) => DB.payments.push({ id: K.uid("p"), cardId: c, ccy, d: K.isoDate(d), a, note: "" });
    const day = (k, dd) => { const x = new Date(t.getFullYear(), t.getMonth() + k, dd); return x; };
    S("cw", "TRY", M(-2), 18450); P("cw", "TRY", day(-2, 17), 18450);
    S("cw", "TRY", M(-1), 23900); P("cw", "TRY", day(-1, 16), 12000);
    S("cw", "TRY", M(0), 31250);
    S("cw", "EUR", M(0), 342.02);
    S("cw", "TRY", M(1), 6400, { basis: "new" });
    S("ca", "TRY", M(-1), 6168.63); P("ca", "TRY", day(-1, 12), 6168.63);
    S("ca", "TRY", M(0), 2552.49);
    S("cm", "TRY", M(-1), 2807);
    S("cq", "TRY", M(-1), 16276.89); P("cq", "TRY", day(-1, 21), 16276.89);
    S("cq", "USD", M(-1), 89.9); P("cq", "USD", day(-1, 21), 89.9);
    DB.installments.push({ id: "i1", cardId: "cq", ccy: "TRY", desc: "Laptop", per: 4445.82, count: 6, start: M(-2) });
    const pb = { id: "ub", name: "Ayşe" }; DB.shared.people.push(pb);
    const tr = { id: "tk", name: "Kos Temmuz", personId: pb.id }; DB.shared.trips.push(tr);
    const E = (d, place, cat, ccy, amount, split, paidBy, city) => DB.shared.entries.push({ id: K.uid("e"), personId: pb.id, tripId: city === "Kos" ? tr.id : null, d, place, cat, ccy, amount, split, paidBy: paidBy || "me", cardId: paidBy === "them" ? null : "cw", city, note: "" });
    const y = t.getFullYear();
    E(y + "-07-05", "Avance araç kiralama", "Ulaşım", "EUR", 118.25, { mode: "half" }, "me", "Kos");
    E(y + "-07-06", "Paradise Beach", "Eğlence", "EUR", 67.5, { mode: "half" }, "me", "Kos");
    E(y + "-07-06", "Kosnian Services", "Yeme-İçme", "EUR", 62.4, { mode: "half" }, "them", "Kos");
    E(y + "-07-07", "Georgiadou takı", "Alışveriş", "EUR", 26, { mode: "them" }, "me", "Kos");
    E(y + "-07-08", "Duty Free", "Alışveriş", "EUR", 56.09, { mode: "me" }, "me", "Kos");
    E(y + "-07-08", "Lidl", "Market", "EUR", 10.75, { mode: "custom", mine: 5.75 }, "me", "Kos");
    E(K.isoDate(day(0, 2)), "Hotelcom Ankara", "Konaklama", "TRY", 4751.45, { mode: "half" }, "me", "Ankara");
    DB.shared.settlements.push({ id: "st1", personId: pb.id, d: y + "-07-20", ccy: "EUR", amount: 50, dir: "in", note: "IBAN" });
    DB.meta.lastBackup = K.isoDate(t);
    return DB;
  }

  Object.assign(App.ACT, {
    exportJSON: () => exportJSON(),
    importJSON: () => importJSON(),
    importExcel: () => importExcel(),
    exportXLSX: () => exportXLSX(),
    loadDemo: () => {
      const go = () => { App.replaceDB(demoData(), "Örnek veri yüklendi — Ayarlar'dan silebilirsin"); App.setTab("ozet"); };
      if (App.DB.cards.length || App.DB.shared.entries.length) confirmReplace("Örnek veri (kurgusal) yüklenecek.", go); else go();
    },
    resetAll: () => {
      App.modal(`${App.mh("Tüm verileri sil")}
        <p class="note">Kartlar, ekstreler, ödemeler, taksitler, kurlar ve ortak harcamalar silinir. Bu işlem geri alınamaz (birkaç saniye "Geri al" çıkar).</p>
        <div class="btnrow"><button class="btn ghost" data-act="exportJSON">Önce yedek al</button><button class="btn danger" id="rsYes">Hepsini sil</button><button class="btn ghost" data-close>Vazgeç</button></div>`);
      $("#rsYes").onclick = () => { const s = App.snap(); App.closeModal(); App.DB = K.seed(); App.commit("Tüm veriler silindi", s); };
    }
  });
  App.parseOldWorkbook = parseOldWorkbook;
  App.convertOldKokpit = convertOldKokpit;
})();
