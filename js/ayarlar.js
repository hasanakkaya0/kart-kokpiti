/* =====================================================================
   Kart Kokpiti — Ayarlar ekranı, kur çekme, ortak limit grubu
   app.js (kabuk) önce yüklenir; ortak yardımcılar App.I üzerinden gelir.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { ic, COLORS, BANKS, persist, toast, mh, val, num, segVal, segHtml, activeCards, cardColor, ccyPill, accountOptions, currentStmtMonth, devirAt, limParts, hotAccounts, sharedNetTL, restructLeft, fmtTL0, rateText, chipClass, rateLine, esc, $, $$, loadDB, initTheme } = I;

  /* ================= AYARLAR ================= */
  function renderAyarlar() {
    const el = $("#page-ayarlar"), DB = App.DB, t = App.today();
    const nowYM = K.ymOf(t);
    const st = DB.settings, r = st.minRule;
    /* kur ayları */
    const mset = new Set(Object.keys(DB.rates));
    DB.statements.forEach(s => { if (s.ccy !== "TRY") mset.add(s.month); });
    DB.shared.entries.forEach(e => { if (e.ccy !== "TRY" && e.d) mset.add(e.d.slice(0, 7)); });
    for (let k = -2; k <= 1; k++) mset.add(K.ymAdd(nowYM, k));
    let months = [...mset].sort().reverse();
    const allCount = months.length;
    if (!App.rateMonthsAll) months = months.slice(0, 6);
    const rateRows = months.map(m => {
      const own = DB.rates[m] || {};
      return `<div class="trow"><span><b>${K.monthLabel(m)}</b>${m === nowYM ? ' <span class="pill">bu ay</span>' : ""}</span>
        ${["EUR", "USD"].map(c => `<input type="text" inputmode="decimal" data-rate="${m}|${c}" value="${own[c] ? String(own[c]).replace(".", ",") : ""}" placeholder="${K.rateFor(DB, m, c) ? "↳ " + String(K.rateFor(DB, m, c)).replace(".", ",") : "—"}">`).join("")}</div>`;
    }).join("");
    const cardsMin = activeCards().map(c => { const mi = K.minRateInfo(DB, c); return `<div class="kv-line"><span>${esc(c.name)} <span class="faint" style="font-size:12.5px">${esc(mi.why)}</span></span><span class="num">%${Math.round(mi.rate * 100)}</span></div>`; }).join("");
    const groups = DB.groups.map(g => { const cs = DB.cards.filter(c => c.groupId === g.id); return `<div class="kv-line"><span><b>${esc(g.name)}</b><br><span class="faint" style="font-size:12.5px">${cs.map(c => esc(c.name)).join(", ") || "kart yok"}</span></span><span class="num">${g.limit ? K.fmt(g.limit, "TRY", { noDec: true }) : "limit yok"} <button class="iconbtn sm" data-act="editGroup" data-id="${g.id}">${ic("edit")}</button></span></div>`; }).join("");
    el.innerHTML = `
      <h2 style="font-size:22px;margin-bottom:var(--s1)">Ayarlar</h2>
      <div class="muted" style="font-size:14px;margin-bottom:var(--s2)">Tüm hesaplama kuralları buradan değişir.</div>

      <div class="sec-title"><h2>Veri ve yedek</h2><span class="hint">${App.storageMode === "browser" ? "bu tarayıcıda kayıtlı ✓" : "<span class='bad'>geçici hafıza — yedek al!</span>"}</span></div>
      <div class="card">
        <div class="kv-line"><span>Son yedek</span><span class="num">${DB.meta.lastBackup ? K.fmtDate(DB.meta.lastBackup, true) : "hiç alınmadı"}</span></div>
        <div class="kv-line"><span>Kayıtlar</span><span class="num">${DB.cards.length} kart · ${DB.statements.length} ekstre · ${DB.payments.length} ödeme · ${DB.shared.entries.length} ortak harcama</span></div>
        <div class="btnrow">
          <button class="btn" data-act="exportJSON">${ic("save")} Yedek indir (JSON)</button>
          <button class="btn ghost" data-act="importJSON">${ic("upload")} Yedek yükle / eski uygulama verisi</button>
          <button class="btn ghost" data-act="exportXLSX">${ic("chart")} Excel'e aktar</button>
          <button class="btn ghost" data-act="importExcel">${ic("import")} Eski Excel'den aktar</button>
        </div>
        <div class="note" style="margin-top:var(--s3)">Veriler yalnızca bu tarayıcıda saklanır, hiçbir sunucuya gitmez. Telefon ve bilgisayar arasında taşımak için yedek dosyasını indirip diğer cihazda yükle.</div>
      </div>

      <div class="sec-title"><h2>Senkron</h2><span class="hint">giriş yapınca otomatik, iki yönlü</span></div>
      <div class="card" id="syncCard"></div>

      <div class="sec-title"><h2>Döviz kurları</h2><span class="hint">ay bazında · boş ay öncekini devralır</span></div>
      <div class="card">
        <div class="trow head"><span>Ay</span><span>€ Euro / TL</span><span>$ Dolar / TL</span></div>
        ${rateRows}
        <div class="btnrow">
          <button class="btn soft" data-act="fetchRates">⟳ Güncel kuru internetten çek (${K.MONTHS[+nowYM.slice(5) - 1]})</button>
          ${allCount > 6 ? `<button class="btn ghost" data-act="toggleRateMonths">${App.rateMonthsAll ? "Son 6 ay" : "Tüm aylar (" + allCount + ")"}</button>` : ""}
        </div>
        <div class="note" style="margin-top:var(--s3)">Her ay kendi kurunu kullanır; bir ayın kurunu değiştirmek diğerlerini bozmaz. İnternetten çekilen kur Avrupa Merkez Bankası referansıdır — bankanın satış kuru biraz daha yüksektir, ekstrendeki kuru yazman en doğrusu.</div>
      </div>

      <div class="sec-title"><h2>Ortak limit grupları</h2><button class="btn sm soft" data-act="editGroup">+ Grup ekle</button></div>
      <div class="card">${groups || `<div class="empty">Aynı bankanın kartları tek limiti paylaşıyorsa grup oluştur — doluluk ve asgari oranı grup limitine göre hesaplanır.</div>`}</div>

      <details class="sec-fold" data-fold="adv"><summary><h2>Gelişmiş: asgari ödeme ve faiz kuralları</h2><span class="hint">nadiren değişir · TCMB oranları</span></summary>
      <div class="grid g2">
        <div>
          <div class="sec-title"><h2>Asgari ödeme kuralı</h2></div>
          <div class="card" data-enter="saveMinRule">
            <div class="row3">
              <div><label class="lbl" style="margin-top:0">Limit eşiği (₺)</label><input type="text" id="mrTh" inputmode="decimal" value="${r.threshold}"></div>
              <div><label class="lbl" style="margin-top:0">Eşik ve altı %</label><input type="number" id="mrLow" value="${r.low}"></div>
              <div><label class="lbl" style="margin-top:0">Eşik üstü %</label><input type="number" id="mrHigh" value="${r.high}"></div>
            </div>
            <div class="note" style="margin-top:var(--s3)">Güncel kural: kart limiti <b>${K.fmtPlain(r.threshold)} ₺ ve altı %${r.low}</b>, üstü <b>%${r.high}</b>. Ortak limitli kartlarda grubun limiti esas alınır. Kart ayarında "elle" seçersen o kart için sabit oran kullanılır.</div>
            ${cardsMin ? `<div style="margin-top:var(--s3)">${cardsMin}</div>` : ""}
            <div class="btnrow"><button class="btn" data-act="saveMinRule">Kuralı kaydet</button></div>
          </div>
        </div>
        <div>
          <div class="sec-title"><h2>Faiz kademeleri</h2><span class="hint">TCMB azami · aylık %</span></div>
          <div class="card" data-enter="saveRates2">
            <div class="trow head tiers"><span>Dönem borcu</span><span>Akdi %</span><span>Gecikme %</span></div>
            ${(st.rateTiers || []).map((x, i, T) => `<div class="trow tiers"><span>${i === 0 ? `<input type="text" inputmode="decimal" id="tMax0" value="${x.max}" style="width:100px"> ₺ altı` : x.max == null ? `${K.fmtPlain(T[i - 1].max)} ₺ üstü` : `${K.fmtPlain(T[i - 1].max)} – <input type="text" inputmode="decimal" id="tMax${i}" value="${x.max}" style="width:100px"> ₺`}</span>
              <input type="text" inputmode="decimal" id="tAkt${i}" value="${String(x.akt).replace(".", ",")}"><input type="text" inputmode="decimal" id="tGec${i}" value="${String(x.gec).replace(".", ",")}"></div>`).join("")}
            <div class="row3" style="margin-top:var(--s3)"><div><label class="lbl" style="margin-top:0">Vergi çarpanı</label><input type="text" id="fTax" inputmode="decimal" value="${String(st.taxMult).replace(".", ",")}"></div></div>
            <div class="note" style="margin-top:var(--s3)">Her kartın faizi o ekstrenin <b>dönem borcuna</b> göre kademeden seçilir, üstüne KKDF %15 + BSMV %15 (×1,30) eklenir. Asgari ödenip kalan devrederse akdi faiz, asgarinin altında kalınırsa eksik kısma gecikme faizi işler. TCMB oranları değiştirirse buradan güncelle. Bir kartta farklı oran varsa kart ayarından "elle" seç.</div>
            ${activeCards().map(c => { const L = K.ledger(DB, c.id, K.accountsOf(c)[0], t); if (!L.current) return ""; const ri = K.rateInfo(DB, c, L.current, K.accountsOf(c)[0]); return `<div class="kv-line"><span>${esc(c.name)} <span class="faint" style="font-size:12.5px">${esc(ri.why)}</span></span><span class="num">${K.fmtRate(ri.akt)} → ${K.fmtRate(ri.eff)}</span></div>`; }).join("")}
            <div class="btnrow"><button class="btn" data-act="saveRates2">Kaydet</button><button class="btn ghost" data-act="resetTiers">TCMB varsayılanı</button></div>
          </div>
        </div>
      </div>
      </details>

      <details class="sec-fold" data-fold="danger"><summary><h2>Örnek veri ve silme</h2><span class="hint">nadir kullanılır</span></summary>
        <div class="card">
          <div class="btnrow" style="margin-top:0">
            <button class="btn ghost sm" data-act="loadDemo">Örnek veri yükle</button>
            <button class="btn danger sm" data-act="resetAll">Tüm verileri sil</button>
          </div>
          <div class="note" style="margin-top:var(--s3)">Tüm verileri silmeden önce yedek indirmeyi unutma.</div>
        </div>
      </details>
    `;
    App.fold = App.fold || { fc: true };
    $$("details[data-fold]", el).forEach(d => {
      d.open = !!App.fold[d.dataset.fold];
      d.addEventListener("toggle", () => { App.fold[d.dataset.fold] = d.open; });
    });
    const syncEl = $("#syncCard", el);
    if (syncEl && I.Sync) { syncEl.innerHTML = I.Sync.html(); I.Sync.bind(syncEl); }
    $$("input[data-rate]", el).forEach(inp => {
      inp.addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });
      inp.addEventListener("change", e => {
        const [m, c] = e.target.dataset.rate.split("|");
        const v = K.calc(e.target.value);
        DB.rates[m] = DB.rates[m] || {};
        if (v > 0) DB.rates[m][c] = Math.round(v * 10000) / 10000; else delete DB.rates[m][c];
        if (!Object.keys(DB.rates[m]).length) delete DB.rates[m];
        App.commit(K.monthLabel(m) + " " + c + " kuru kaydedildi");
      });
    });
  }

  /* hangi dövizlerin kuruna ihtiyaç var: aktif kartların döviz hesapları + dövizli ortak harcamalar */
  function neededCcys() {
    const set = new Set();
    activeCards().forEach(c => K.accountsOf(c).forEach(x => { if (x !== "TRY") set.add(x); }));
    App.DB.shared.entries.forEach(e => { if (e.ccy && e.ccy !== "TRY") set.add(e.ccy); });
    return [...set];
  }
  /* opts.auto: sessiz mod — sadece bu ayın EKSİK kurlarını doldurur, elle girileni ezmez, günde bir kez dener */
  async function fetchRates(opts) {
    opts = opts || {};
    const DB = App.DB, ym = K.ymOf(App.today()), today = K.isoDate(App.today());
    if (opts.auto) {
      const missing = neededCcys().filter(c => !(DB.rates[ym] && DB.rates[ym][c] > 0));
      if (!missing.length || DB.meta.lastRateFetch === today) return;
      DB.meta.lastRateFetch = today;
    } else toast("Kur çekiliyor…");
    const urls = ["https://api.frankfurter.dev/v1/latest?base=TRY&symbols=EUR,USD", "https://api.frankfurter.app/latest?from=TRY&to=EUR,USD"];
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: "no-store" });
        if (!res.ok) continue;
        const j = await res.json();
        if (!j.rates || !j.rates.EUR || !j.rates.USD) continue;
        const r4 = v => Math.round(v * 10000) / 10000;   // bankadaki gibi 4 hane
        const got = { EUR: r4(1 / j.rates.EUR), USD: r4(1 / j.rates.USD) };
        DB.rates[ym] = DB.rates[ym] || {};
        const filled = [];
        ["EUR", "USD"].forEach(c => { if (!opts.auto || !(DB.rates[ym][c] > 0)) { DB.rates[ym][c] = got[c]; filled.push(K.CCY_SYM[c] + " " + String(got[c]).replace(".", ",")); } });
        App.commit(filled.length ? `${opts.auto ? "Eksik kur otomatik çekildi" : "Kur güncellendi"} (${K.monthLabel(ym)}): ${filled.join(" · ")}` : null);
        return;
      } catch (e) { /* sıradakini dene */ }
    }
    if (opts.auto) persist();
    else toast("Kur çekilemedi — internet bağlantısını kontrol et ya da Ayarlar'dan elle gir");
  }
  App.fetchRates = fetchRates;

  function openGroupForm(id) {
    const DB = App.DB, g = id ? K.groupById(DB, id) : null;
    App.modal(`
      ${mh(g ? "Ortak limit grubu" : "Yeni ortak limit grubu", "Aynı limiti paylaşan kartları seç.")}
      <label class="lbl">Grup adı</label><input type="text" id="gName" value="${g ? esc(g.name) : ""}" placeholder="ör. Akbank ortak limit" autofocus>
      <label class="lbl">Ortak limit (₺)</label><input type="text" id="gLimit" inputmode="decimal" value="${g && g.limit ? g.limit : ""}">
      <label class="lbl">Kartlar</label>
      <div class="chips" id="gCards">${activeCards().map(c => `<button type="button" data-v="${c.id}" class="${g && c.groupId === g.id ? "on" : ""}">${esc(c.name)}</button>`).join("")}</div>
      <div class="btnrow"><button class="btn" id="gSave">Kaydet</button>${g ? `<button class="btn danger" id="gDel">Grubu sil</button>` : ""}<button class="btn ghost" data-close>Vazgeç</button></div>`);
    App.attachCalc($("#gLimit"));
    $("#gCards").onclick = e => { const b = e.target.closest("button"); if (b) b.classList.toggle("on"); };
    $("#gSave").onclick = () => {
      const name = val("gName").trim() || "Ortak limit";
      const lim = K.calc(val("gLimit"));
      const target = g || { id: K.uid("g") };
      target.name = name; target.limit = lim > 0 ? K.round2(lim) : null;
      if (!g) DB.groups.push(target);
      const on = $$("#gCards button.on").map(b => b.dataset.v);
      DB.cards.forEach(c => { if (on.includes(c.id)) c.groupId = target.id; else if (c.groupId === target.id) c.groupId = null; });
      App.closeModal(); App.commit("Grup kaydedildi");
    };
    const d = $("#gDel"); if (d) d.onclick = () => { const s = App.snap(); DB.cards.forEach(c => { if (c.groupId === g.id) c.groupId = null; }); DB.groups = DB.groups.filter(x => x.id !== g.id); App.closeModal(); App.commit("Grup silindi", s); };
  }

  Object.assign(I, { renderAyarlar, neededCcys, fetchRates, openGroupForm });
})();
