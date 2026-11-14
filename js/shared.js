/* =====================================================================
   Kart Kokpiti — Ortak Harcamalar
   • Kişi bazlı defter (Ayşe, ev arkadaşı…) · geziler/etiketler
   • Para birimi bazında denge (₺ / € / $ ayrı tutulur — kur oynasa da borç değişmez)
   • Esnek bölüşüm: yarı yarıya / hepsi benim / hepsi onun / özel tutar / yüzde
   • Kısmi hesaplaşma, dövizi TL olarak ödeme, paylaşılabilir özet (WhatsApp/CSV)
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App;
  const { $, $$, esc } = App, { ic } = App.I;
  App.sh = { personId: null, trip: "all", last: {} };

  const DBs = () => App.DB.shared;
  const people = () => DBs().people;
  const personById = id => people().find(p => p.id === id);
  const tripById = id => DBs().trips.find(t => t.id === id);
  const myName = () => App.DB.settings.myName || "Ben";
  const val = id => { const e = document.getElementById(id); return e ? e.value : ""; };

  function currentPerson() {
    let p = personById(App.sh.personId);
    if (!p) { p = people()[0] || null; App.sh.personId = p ? p.id : null; }
    return p;
  }
  function filteredEntries(pid, trip) {
    return DBs().entries.filter(e => e.personId === pid && (trip === "all" || (trip === "none" ? !e.tripId : e.tripId === trip)));
  }
  function splitLabel(e, who) {
    const sp = e.split || { mode: "half" };
    if (sp.mode === "me") return "hepsi senin";
    if (sp.mode === "them") return "hepsi " + who;
    if (sp.mode === "pct") return "sen %" + sp.pct;
    if (sp.mode === "custom") return "senin payın " + K.fmt(sp.mine, e.ccy);
    return "yarı yarıya";
  }
  function balParts(bal) {
    const pos = {}, neg = {};
    K.CCYS.forEach(c => { if (bal[c] > K.EPS) pos[c] = bal[c]; else if (bal[c] < -K.EPS) neg[c] = -bal[c]; });
    return { pos, neg, hasPos: Object.keys(pos).length > 0, hasNeg: Object.keys(neg).length > 0 };
  }
  function tlOf(obj) {
    const ym = K.ymOf(App.today());
    let s = 0, miss = false;
    K.CCYS.forEach(c => { if (Math.abs(obj[c] || 0) > K.EPS) { const v = K.toTL(App.DB, obj[c], c, ym); if (v == null) miss = true; else s += v; } });
    return { v: K.round2(s), miss };
  }
  function tripRange(tid) {
    const ds = DBs().entries.filter(e => e.tripId === tid && e.d).map(e => e.d).sort();
    return ds.length ? { from: ds[0], to: ds[ds.length - 1], n: ds.length } : { n: 0 };
  }

  /* ================= sayfa ================= */
  App.renderOrtak = function () {
    const el = $("#page-ortak");
    const p = currentPerson();
    if (!p) {
      el.innerHTML = `<div class="card" data-enter="shAddFirst" style="max-width:560px;margin:0 auto;text-align:center;padding:36px 24px">
        <div style="font-size:36px">⇄</div>
        <h2 style="font-size:21px;margin:10px 0 6px">Ortak harcamalar</h2>
        <p class="muted" style="line-height:1.6">Biriyle bölüştüğün harcamaları gir — kimin kime ne kadar borçlu olduğunu ₺, € ve $ ayrı ayrı takip et, gezileri grupla, özeti tek tuşla paylaş.</p>
        <label class="lbl" style="text-align:left">Kiminle?</label>
        <input type="text" id="shFirst" placeholder="ör. Ayşe" autofocus>
        <label class="lbl" style="text-align:left">Senin adın <span class="opt">(özetlerde görünür)</span></label>
        <input type="text" id="shMe" value="${esc(App.DB.settings.myName === "Ben" ? "" : App.DB.settings.myName)}" placeholder="ör. Hasan">
        <div class="btnrow" style="justify-content:center"><button class="btn" data-act="shAddFirst">Başla</button><button class="btn ghost" data-act="importExcel">${ic("import")} Excel'deki gezileri aktar</button></div>
      </div>`;
      return;
    }
    const trips = DBs().trips.filter(t => t.personId === p.id || !t.personId);
    if (App.sh.trip !== "all" && App.sh.trip !== "none" && !tripById(App.sh.trip)) App.sh.trip = "all";
    const trip = App.sh.trip;
    const bal = K.sharedBalance(App.DB, p.id);
    const bp = balParts(bal);
    const net = tlOf(bal);
    let balHtml;
    if (!bp.hasPos && !bp.hasNeg) balHtml = `<div class="v ok">Hesap kapalı ✓</div><div class="s">Aranızda açık borç yok</div>`;
    else {
      const lines = [];
      if (bp.hasPos) lines.push(`<div class="v ok">${K.fmtMulti(bp.pos)}</div><div class="s">${esc(p.name)} sana borçlu</div>`);
      if (bp.hasNeg) lines.push(`<div class="v info" style="${bp.hasPos ? "font-size:20px;margin-top:8px" : ""}">${K.fmtMulti(bp.neg)}</div><div class="s">sen ${esc(p.name)}'e borçlusun</div>`);
      if (Object.keys(bp.pos).length + Object.keys(bp.neg).length > 1 || !bal.TRY) lines.push(`<div class="s" style="margin-top:6px">Net ≈ <b>${K.fmt(Math.abs(net.v))}</b> ${net.v >= 0 ? "alacak" : "borç"} (güncel kurla)${net.miss ? " · bazı kurlar eksik" : ""}</div>`);
      balHtml = lines.join("");
    }
    const ents = filteredEntries(p.id, trip);
    const sm = K.sharedSummary(App.DB, ents);
    const cats = Object.entries(sm.byCat).sort((a, b) => b[1] - a[1]);
    const maxCat = Math.max(1, ...cats.map(c => c[1]));
    const t = trip !== "all" && trip !== "none" ? tripById(trip) : null;
    const tr = t ? tripRange(t.id) : null;
    /* liste: harcamalar + (tümü filtresinde) hesaplaşmalar, tarihe göre */
    const rows = ents.map(e => ({ kind: "e", d: e.d || "", e }));
    if (trip === "all") DBs().settlements.filter(s => s.personId === p.id).forEach(s => rows.push({ kind: "s", d: s.d, s }));
    rows.sort((a, b) => b.d < a.d ? -1 : b.d > a.d ? 1 : 0);
    let lastDay = null;
    const listHtml = rows.map(r => {
      let head = "";
      if (r.d !== lastDay) { lastDay = r.d; head = `<div class="day-h">${r.d ? K.fmtDate(r.d, true) : "Tarihsiz"}</div>`; }
      if (r.kind === "s") {
        const s = r.s;
        return head + `<div class="item clickable" data-act="shEditSettle" data-id="${s.id}" style="--bank:var(--ok)"><span class="bar"></span>
          <div><div class="t">${ic("users")} ${s.dir === "in" ? esc(p.name) + " sana ödedi" : "Sen " + esc(p.name) + "'e ödedin"}</div><div class="m">${s.paidAs ? "₺ olarak: " + K.fmt(s.paidAs.amount) + " (kur " + String(s.paidAs.rate).replace(".", ",") + ")" : "hesaplaşma"}${s.note ? " · " + esc(s.note) : ""}</div></div>
          <div class="r"><div class="amt" style="font-size:16px">${K.fmt(s.amount, s.ccy)}</div></div></div>`;
      }
      const e = r.e, imp = K.entryImpact(e);
      const c = e.cardId ? K.cardById(App.DB, e.cardId) : null;
      const tt = e.tripId && trip === "all" ? tripById(e.tripId) : null;
      return head + `<div class="item clickable" data-act="shEdit" data-id="${e.id}" style="--bank:${c ? App.cardColor(c) : "var(--line-2)"}"><span class="bar"></span>
        <div><div class="t">${esc(e.place || "Harcama")} ${App.ccyPill(e.ccy)}${tt ? ` <span class="sbadge">${ic("plane")} ${esc(tt.name)}</span>` : ""}</div>
        <div class="m">${[e.city, e.cat, e.paidBy === "them" ? esc(p.name) + " ödedi" : "sen ödedin" + (c ? " · " + esc(c.name) : ""), splitLabel(e, p.name)].filter(Boolean).map(x => esc(x)).join(" · ")}</div></div>
        <div class="r"><div class="amt" style="font-size:16px">${K.fmt(e.amount, e.ccy)}</div>
        <div class="eff ${imp > 0 ? "ok" : imp < 0 ? "info" : "faint"}">${imp > 0 ? "+" + K.fmt(imp, e.ccy) + " alacak" : imp < 0 ? "−" + K.fmt(-imp, e.ccy) + " borç" : "etkisiz"}</div></div></div>`;
    }).join("");

    el.innerHTML = `
      <div class="person-tabs">
        ${people().map(x => `<button class="${x.id === p.id ? "on" : ""}" data-act="shPerson" data-id="${x.id}">${esc(x.name)}</button>`).join("")}
        <button data-act="shAddPerson" title="Kişi ekle">+ Kişi</button>
        <span style="flex:1"></span>
        <button class="iconbtn" data-act="shSettings" title="Ortak harcama ayarları">${ic("settings")}</button>
      </div>
      <div class="card">
        <div class="bal-hero">
          <div><div class="who">${esc(p.name)} ile denge</div>${balHtml}</div>
          <div class="btnrow" style="margin:0">
            <button class="btn" data-act="shAdd">+ Harcama</button>
            <button class="btn ghost" data-act="shSettle">${ic("users")} Hesaplaş</button>
            <button class="btn ghost" data-act="shShare" data-trip="all">${ic("share")} Özeti paylaş</button>
          </div>
        </div>
      </div>
      <div class="trip-chips">
        <button class="${trip === "all" ? "on" : ""}" data-act="shTrip" data-id="all">Tümü</button>
        ${trips.map(x => `<button class="${trip === x.id ? "on" : ""}" data-act="shTrip" data-id="${x.id}">${ic("plane")} ${esc(x.name)}${x.archived ? " · arşiv" : ""}</button>`).join("")}
        <button class="${trip === "none" ? "on" : ""}" data-act="shTrip" data-id="none">Gezisiz</button>
        <button data-act="shTripForm">+ Gezi</button>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div><div class="muted" style="font-size:13px;font-weight:600">${t ? ic("plane") + " " + esc(t.name) : trip === "none" ? "Geziye bağlı olmayanlar" : "Tüm harcamalar"}${tr && tr.n ? " · " + K.fmtDate(tr.from) + " – " + K.fmtDate(tr.to, true) : ""}</div>
          <div style="font-size:24px;font-weight:750;letter-spacing:-.02em" class="num">${K.fmtMulti(sm.tot)}</div>
          <div class="faint" style="font-size:13px">${sm.count} harcama${(sm.tot.EUR || sm.tot.USD) ? " · ≈ " + K.fmt(sm.totTL) + " (harcama ayının kuruyla)" : ""}</div></div>
          ${t ? `<div class="btnrow" style="margin:0"><button class="btn sm ghost" data-act="shShare" data-trip="${t.id}">${ic("share")} Bu geziyi paylaş</button><button class="btn sm ghost" data-act="shTripForm" data-id="${t.id}">${ic("edit")}</button></div>` : ""}
        </div>
        <div class="split3">
          <div><small>Senin payın</small><b>${K.fmtMulti(sm.mine)}</b></div>
          <div><small>${esc(p.name)}'in payı</small><b>${K.fmtMulti(sm.theirs)}</b></div>
          <div><small>Kim ödedi</small><b style="font-size:13px">Sen ${K.fmtMulti(sm.paidMe)}${K.CCYS.some(c => sm.paidThem[c]) ? "<br>" + esc(p.name) + " " + K.fmtMulti(sm.paidThem) : ""}</b></div>
        </div>
        ${cats.length ? `<div style="margin-top:14px">${cats.slice(0, 8).map(([k, v]) => `<div class="catbar"><span>${esc(k)}</span><div class="progress"><i style="width:${Math.round(100 * v / maxCat)}%"></i></div><span>${K.fmt(v, "TRY", { noDec: true })}</span></div>`).join("")}</div>` : ""}
      </div>
      <div class="card" style="padding-top:6px">
        <div class="list">${listHtml || `<div class="empty">Henüz harcama yok.<br><button class="btn sm soft" style="margin-top:12px" data-act="shAdd">+ İlk harcamayı ekle</button></div>`}</div>
      </div>`;
  };

  /* ================= harcama formu ================= */
  function openSharedForm(id) {
    const DB = App.DB, S = DBs();
    const e = id ? S.entries.find(x => x.id === id) : null;
    const L = App.sh.last;
    const p = e ? personById(e.personId) : currentPerson();
    if (!p) return App.toast("Önce bir kişi ekle");
    const ccy = e ? e.ccy : (L.ccy || "TRY");
    const paidBy = e ? e.paidBy : (L.paidBy || "me");
    const sp = e ? (e.split || { mode: "half" }) : { mode: L.splitMode || "half" };
    const tripSel = e ? (e.tripId || "") : (App.sh.trip !== "all" && App.sh.trip !== "none" ? App.sh.trip : (L.tripId || ""));
    const cat = e ? e.cat : "";
    App.modal(`
      ${App.mh(e ? "Harcamayı düzenle" : "Ortak harcama ekle")}
      ${people().length > 1 ? `<label class="lbl">Kiminle</label><select id="hP">${people().map(x => `<option value="${x.id}" ${x.id === p.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : `<input type="hidden" id="hP" value="${p.id}">`}
      <label class="lbl">Tutar</label>
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start">
        <input type="text" id="hAmt" class="big" inputmode="decimal" value="${e ? String(e.amount).replace(".", ",") : ""}" placeholder="0,00" autofocus>
        ${App.segHtml("hCcy", [["TRY", "₺"], ["EUR", "€"], ["USD", "$"]], ccy)}
      </div>
      <div class="note" style="margin-top:2px">İade için eksi tutar gir (ör. -14).</div>
      <label class="lbl">Nerede / ne için</label>
      <input type="text" id="hPlace" value="${e ? esc(e.place || "") : ""}" placeholder="ör. Paradise Beach" list="hPlaces">
      <datalist id="hPlaces">${[...new Set(S.entries.map(x => x.place).filter(Boolean))].slice(-80).map(x => `<option value="${esc(x)}">`).join("")}</datalist>
      <label class="lbl">Kategori</label>
      <div class="chips" id="hCat">${S.categories.map(c => `<button type="button" data-v="${esc(c)}" class="${c === cat ? "on" : ""}">${esc(c)}</button>`).join("")}</div>
      <div class="row2">
        <div><label class="lbl">Tarih</label><input type="date" id="hDate" value="${e ? e.d : (L.d || K.isoDate(App.today()))}"></div>
        <div><label class="lbl">Gezi <span class="opt">(opsiyonel)</span></label><select id="hTrip"><option value="">— Yok —</option>${S.trips.filter(t => !t.archived || t.id === tripSel).map(t => `<option value="${t.id}" ${t.id === tripSel ? "selected" : ""}>${ic("plane")} ${esc(t.name)}</option>`).join("")}<option value="__new">+ Yeni gezi…</option></select></div>
      </div>
      <input type="text" id="hNewTrip" class="hidden" style="margin-top:8px" placeholder="Yeni gezi adı, ör. Kos Temmuz">
      <label class="lbl">Kim ödedi?</label>
      ${App.segHtml("hPaid", [["me", "Ben"], ["them", esc(p.name)]], paidBy)}
      <div id="hCardBox"><label class="lbl">Hangi kartla <span class="opt">(opsiyonel)</span></label><select id="hCard"><option value="">— Nakit / belirtme —</option>${App.activeCards().map(c => `<option value="${c.id}" ${(e ? e.cardId : L.cardId) === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
      <label class="lbl">Nasıl bölünsün?</label>
      ${App.segHtml("hSplit", [["half", "Yarı yarıya"], ["me", "Hepsi benim"], ["them", "Hepsi " + esc(p.name)], ["custom", "Özel"]], sp.mode === "pct" ? "custom" : sp.mode)}
      <div id="hCustom" class="hidden" style="margin-top:10px">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center">
          ${App.segHtml("hCMode", [["amt", "Benim payım tutar"], ["pct", "Benim payım %"]], sp.mode === "pct" ? "pct" : "amt")}
          <input type="text" id="hCVal" inputmode="decimal" value="${sp.mode === "custom" ? String(sp.mine).replace(".", ",") : sp.mode === "pct" ? sp.pct : ""}" placeholder="ör. 12">
        </div>
      </div>
      <div id="hPreview" class="note box" style="margin-top:10px"></div>
      <details class="adv" ${e && (e.city || e.note) ? "open" : ""}><summary>Şehir, not</summary>
        <div class="row2"><div><label class="lbl">Şehir</label><input type="text" id="hCity" value="${e ? esc(e.city || "") : (L.city || "")}" placeholder="ör. Kos"></div>
        <div><label class="lbl">Not</label><input type="text" id="hNote" value="${e ? esc(e.note || "") : ""}"></div></div>
      </details>
      <div class="btnrow">
        <button class="btn" id="hSave">Kaydet</button>
        ${e ? `<button class="btn danger" id="hDel">Sil</button>` : `<button class="btn ghost" id="hSaveNew">Kaydet + yeni</button>`}
        <button class="btn ghost" data-close>Vazgeç</button>
      </div>
    `);
    const m = $("#modal");
    App.attachCalc($("#hAmt")); App.attachCalc($("#hCVal"));
    $("#hCat").onclick = ev => { const b = ev.target.closest("button"); if (!b) return; const on = b.classList.contains("on"); $$("#hCat button").forEach(x => x.classList.remove("on")); if (!on) b.classList.add("on"); };
    $("#hTrip").onchange = () => $("#hNewTrip").classList.toggle("hidden", val("hTrip") !== "__new");
    const build = () => {
      const amount = K.round2(K.calc(val("hAmt")));
      const ccyV = App.segVal("hCcy");
      let mode = App.segVal("hSplit"), split = { mode };
      if (mode === "custom") {
        const cv = K.calc(val("hCVal"));
        if (App.segVal("hCMode") === "pct") split = { mode: "pct", pct: Math.max(0, Math.min(100, isNaN(cv) ? 50 : cv)) };
        else split = { mode: "custom", mine: isNaN(cv) ? 0 : K.round2(cv) };
      }
      return { amount, ccy: ccyV, paidBy: App.segVal("hPaid"), split };
    };
    const upd = () => {
      const pp = personById(val("hP")) || p;
      $("#hCustom").classList.toggle("hidden", App.segVal("hSplit") !== "custom");
      $("#hCardBox").classList.toggle("hidden", App.segVal("hPaid") !== "me");
      $("#hAmt").dataset.ccy = App.segVal("hCcy"); $("#hCVal").dataset.ccy = App.segVal("hCcy");
      const b = build();
      if (!(Math.abs(b.amount) > 0)) { $("#hPreview").innerHTML = "Tutarı girince kimin ne kadar borçlandığını burada görürsün."; return; }
      const fake = Object.assign({}, b);
      const mine = K.myShare(fake), theirs = K.round2(b.amount - mine), imp = K.entryImpact(fake);
      $("#hPreview").innerHTML = `Senin payın <b>${K.fmt(mine, b.ccy)}</b> · ${esc(pp.name)}'in payı <b>${K.fmt(theirs, b.ccy)}</b><br>` +
        (imp > K.EPS ? `→ <b class="ok">${esc(pp.name)} sana ${K.fmt(imp, b.ccy)} borçlanır</b>` : imp < -K.EPS ? `→ <b class="info">Sen ${esc(pp.name)}'e ${K.fmt(-imp, b.ccy)} borçlanırsın</b>` : "→ dengeyi değiştirmez");
    };
    App.bindSeg(m, upd);
    ["hAmt", "hCVal"].forEach(x => $("#" + x).addEventListener("input", upd));
    if ($("#hP").tagName === "SELECT") $("#hP").onchange = upd;
    upd();
    const save = again => {
      const b = build();
      if (!b.amount) return App.toast("Geçerli bir tutar gir");
      if (b.split.mode === "custom" && Math.abs(b.split.mine) > Math.abs(b.amount) + K.EPS) return App.toast("Payın toplam tutardan büyük olamaz");
      let tripId = val("hTrip") || null;
      if (tripId === "__new") {
        const nm = val("hNewTrip").trim(); if (!nm) return App.toast("Gezi adı gir");
        const nt = { id: K.uid("t"), name: nm, personId: val("hP") };
        S.trips.push(nt); tripId = nt.id;
      }
      const catB = $("#hCat button.on");
      const data = Object.assign(b, {
        personId: val("hP"), place: val("hPlace").trim(), cat: catB ? catB.dataset.v : "Diğer", d: val("hDate") || K.isoDate(App.today()),
        tripId, cardId: b.paidBy === "me" ? (val("hCard") || null) : null, city: val("hCity").trim(), note: val("hNote").trim()
      });
      if (e) Object.assign(e, data); else S.entries.push(Object.assign({ id: K.uid("e") }, data));
      App.sh.last = { ccy: data.ccy, paidBy: data.paidBy, splitMode: data.split.mode === "pct" ? "custom" : data.split.mode, tripId, cardId: data.cardId, d: data.d, city: data.city };
      App.sh.personId = data.personId;
      App.commit(e ? "Harcama güncellendi" : "Harcama eklendi");
      if (again) { openSharedForm(null); } else App.closeModal();
    };
    $("#hSave").onclick = () => save(false);
    const sn = $("#hSaveNew"); if (sn) sn.onclick = () => save(true);
    const d = $("#hDel"); if (d) d.onclick = () => { const s = App.snap(); S.entries = S.entries.filter(x => x.id !== e.id); App.closeModal(); App.commit("Harcama silindi", s); };
  }

  /* ================= hesaplaşma ================= */
  function openSettle(sid) {
    const DB = App.DB, S = DBs();
    const s0 = sid ? S.settlements.find(x => x.id === sid) : null;
    const p = s0 ? personById(s0.personId) : currentPerson(); if (!p) return;
    const bal = K.sharedBalance(DB, p.id);
    const ym = K.ymOf(App.today());
    const firstCcy = s0 ? s0.ccy : (K.CCYS.find(c => Math.abs(bal[c]) > K.EPS) || "TRY");
    const dir0 = s0 ? s0.dir : (bal[firstCcy] >= 0 ? "in" : "out");
    const balList = K.CCYS.filter(c => Math.abs(bal[c]) > K.EPS).map(c => `<div class="kv-line"><span>${K.CCY_NAME[c]}</span><span class="num ${bal[c] > 0 ? "ok" : "info"}">${bal[c] > 0 ? esc(p.name) + " → sen " : "sen → " + esc(p.name) + " "}${K.fmt(Math.abs(bal[c]), c)}</span></div>`).join("");
    App.modal(`
      ${App.mh(s0 ? "Hesaplaşmayı düzenle" : "Hesaplaş · " + esc(p.name))}
      ${!s0 ? `<div class="card flat" style="padding:6px 14px;margin:8px 0 4px">${balList || '<div class="empty" style="padding:12px">Açık borç yok</div>'}</div>
        ${balList ? `<button class="btn soft block" id="stAll" style="margin-top:8px">Tümünü kapat (her para birimi için ayrı kayıt)</button><div class="note" style="text-align:center;margin:12px 0 0">— ya da kısmi ödeme gir —</div>` : ""}` : ""}
      <label class="lbl">Kim kime ödedi?</label>
      ${App.segHtml("stDir", [["in", esc(p.name) + " bana ödedi"], ["out", "Ben " + esc(p.name) + "'e ödedim"]], dir0)}
      <label class="lbl">Hangi borç için?</label>
      ${App.segHtml("stCcy", [["TRY", "₺ TL"], ["EUR", "€ Euro"], ["USD", "$ Dolar"]], firstCcy)}
      <label class="lbl">Tutar</label>
      <input type="text" id="stAmt" class="big" inputmode="decimal" value="${s0 ? String(s0.amount).replace(".", ",") : (Math.abs(bal[firstCcy]) > K.EPS ? String(Math.abs(bal[firstCcy])).replace(".", ",") : "")}">
      <div id="stFx" class="hidden">
        <label class="check" style="margin-top:12px"><input type="checkbox" id="stAsTL" ${s0 && s0.paidAs ? "checked" : ""}> TL olarak ödendi</label>
        <div id="stFxBox" class="row2 hidden"><div><label class="lbl">Kullanılan kur</label><input type="text" id="stRate" inputmode="decimal" value="${s0 && s0.paidAs ? String(s0.paidAs.rate).replace(".", ",") : String(K.rateFor(DB, ym, firstCcy === "TRY" ? "EUR" : firstCcy) || "").replace(".", ",")}"></div><div><label class="lbl">Ödenen TL</label><input type="text" id="stTL" readonly></div></div>
      </div>
      <div class="row2"><div><label class="lbl">Tarih</label><input type="date" id="stDate" value="${s0 ? s0.d : K.isoDate(App.today())}"></div><div><label class="lbl">Not</label><input type="text" id="stNote" value="${s0 ? esc(s0.note || "") : ""}" placeholder="ör. IBAN"></div></div>
      <div class="btnrow"><button class="btn" id="stSave">Kaydet</button>${s0 ? `<button class="btn danger" id="stDel">Sil</button>` : ""}<button class="btn ghost" data-close>Vazgeç</button></div>
    `);
    const m = $("#modal");
    App.attachCalc($("#stAmt"));
    const upd = (segId) => {
      const c = App.segVal("stCcy");
      if (segId === "stCcy" && !s0) {
        $("#stAmt").value = Math.abs(bal[c]) > K.EPS ? String(Math.abs(bal[c])).replace(".", ",") : "";
        const seg = $("#stDir"); const d = bal[c] >= 0 ? "in" : "out"; seg.dataset.value = d; $$("button", seg).forEach(b => b.classList.toggle("on", b.dataset.v === d));
        const r = K.rateFor(DB, ym, c); if (r) $("#stRate").value = String(r).replace(".", ",");
      }
      $("#stFx").classList.toggle("hidden", c === "TRY");
      $("#stFxBox").classList.toggle("hidden", !$("#stAsTL").checked || c === "TRY");
      const a = K.calc(val("stAmt")), r = K.calc(val("stRate"));
      $("#stTL").value = a > 0 && r > 0 ? K.fmt(a * r) : "";
    };
    App.bindSeg(m, upd);
    ["stAmt", "stRate"].forEach(x => $("#" + x).addEventListener("input", () => upd()));
    $("#stAsTL").onchange = () => upd();
    upd();
    const all = $("#stAll");
    if (all) all.onclick = () => {
      const d = K.isoDate(App.today());
      K.CCYS.forEach(c => { if (Math.abs(bal[c]) > K.EPS) S.settlements.push({ id: K.uid("st"), personId: p.id, d, ccy: c, amount: Math.abs(bal[c]), dir: bal[c] > 0 ? "in" : "out", note: "tümü kapatıldı" }); });
      App.closeModal(); App.commit("Hesap kapatıldı 🤝");
    };
    $("#stSave").onclick = () => {
      const a = K.round2(K.calc(val("stAmt")));
      if (!(a > 0)) return App.toast("Geçerli bir tutar gir");
      const c = App.segVal("stCcy");
      const data = { personId: p.id, d: val("stDate") || K.isoDate(App.today()), ccy: c, amount: a, dir: App.segVal("stDir"), note: val("stNote").trim() };
      const r = K.calc(val("stRate"));
      if (c !== "TRY" && $("#stAsTL").checked && r > 0) data.paidAs = { ccy: "TRY", rate: r, amount: K.round2(a * r) };
      if (s0) { delete s0.paidAs; Object.assign(s0, data); } else S.settlements.push(Object.assign({ id: K.uid("st") }, data));
      App.closeModal(); App.commit("Hesaplaşma kaydedildi");
    };
    const d = $("#stDel"); if (d) d.onclick = () => { const s = App.snap(); S.settlements = S.settlements.filter(x => x.id !== s0.id); App.closeModal(); App.commit("Hesaplaşma silindi", s); };
  }

  /* ================= paylaşılabilir özet ================= */
  function buildShareText(p, trip) {
    const DB = App.DB;
    const ents = filteredEntries(p.id, trip).slice().sort((a, b) => a.d < b.d ? -1 : 1);
    const sm = K.sharedSummary(DB, ents);
    const t = trip !== "all" && trip !== "none" ? tripById(trip) : null;
    const me = myName();
    const L = [];
    L.push(`🧾 ${t ? t.name : "Ortak harcamalar"} — ${me} & ${p.name}`);
    if (ents.length) L.push(`${ents.length} harcama · ${K.fmtDate(ents[0].d, true)} – ${K.fmtDate(ents[ents.length - 1].d, true)}`);
    L.push("");
    L.push(`Toplam: ${K.fmtMulti(sm.tot)}`);
    L.push(`${me} payı: ${K.fmtMulti(sm.mine)}`);
    L.push(`${p.name} payı: ${K.fmtMulti(sm.theirs)}`);
    L.push(`${me} ödedi: ${K.fmtMulti(sm.paidMe)}` + (K.CCYS.some(c => sm.paidThem[c]) ? ` · ${p.name} ödedi: ${K.fmtMulti(sm.paidThem)}` : ""));
    const bal = trip === "all" ? K.sharedBalance(DB, p.id) : K.sharedBalance(DB, p.id, e => t ? e.tripId === t.id : !e.tripId);
    const bp = balParts(bal);
    L.push("");
    if (!bp.hasPos && !bp.hasNeg) L.push("✅ Hesap kapalı");
    if (bp.hasPos) { const tl = tlOf(bp.pos); L.push(`➡ ${p.name} → ${me}: ${K.fmtMulti(bp.pos)}` + ((bp.pos.EUR || bp.pos.USD) && !tl.miss ? ` (≈ ${K.fmt(tl.v)})` : "")); }
    if (bp.hasNeg) { const tl = tlOf(bp.neg); L.push(`➡ ${me} → ${p.name}: ${K.fmtMulti(bp.neg)}` + ((bp.neg.EUR || bp.neg.USD) && !tl.miss ? ` (≈ ${K.fmt(tl.v)})` : "")); }
    if (trip !== "all") L.push("(yalnızca bu gezinin harcamaları — önceki hesaplaşmalar hariç)");
    L.push("");
    L.push("Detay:");
    ents.forEach(e => {
      const mine = K.myShare(e), theirs = K.round2(e.amount - mine);
      L.push(`${K.fmtDate(e.d)} · ${e.place || "Harcama"}${e.cat ? " (" + e.cat + ")" : ""} · ${K.fmt(e.amount, e.ccy)} · ${e.paidBy === "them" ? p.name : me} ödedi · ${me} ${K.fmt(mine, e.ccy)} / ${p.name} ${K.fmt(theirs, e.ccy)}`);
    });
    return L.join("\n");
  }
  function openShare(trip) {
    const p = currentPerson(); if (!p) return;
    trip = trip || App.sh.trip;
    const txt = buildShareText(p, trip);
    App.modal(`
      ${App.mh("Özeti paylaş", "WhatsApp'a, mesaja ya da e-postaya yapıştırmaya hazır.")}
      <div class="share-box" id="shTxt">${esc(txt)}</div>
      <div class="btnrow">
        <button class="btn" id="shCopy">${ic("copy")} Kopyala</button>
        ${navigator.share ? `<button class="btn ghost" id="shNative">${ic("share")} Paylaş…</button>` : ""}
        <a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(txt.slice(0, 3500))}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn ghost" id="shCsv">${ic("save")} CSV (Excel)</button>
      </div>`, { wide: true });
    $("#shCopy").onclick = async () => {
      try { await navigator.clipboard.writeText(txt); App.toast("Kopyalandı"); }
      catch (e) { const r = document.createRange(); r.selectNodeContents($("#shTxt")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); App.toast("Metni seçtim — Ctrl+C ile kopyala"); }
    };
    const nb = $("#shNative"); if (nb) nb.onclick = () => navigator.share({ text: txt }).catch(() => { });
    $("#shCsv").onclick = () => {
      const ents = filteredEntries(p.id, trip);
      const me = myName();
      const head = ["Tarih", "Gezi", "Şehir", "Kategori", "Yer", "Birim", "Tutar", "Kim ödedi", me + " payı", p.name + " payı", "Kart", "Not"];
      const q = v => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const n = v => String(K.round2(v)).replace(".", ",");
      const lines = [head.join(";")].concat(ents.map(e => {
        const mine = K.myShare(e); const t = e.tripId ? tripById(e.tripId) : null; const c = e.cardId ? K.cardById(App.DB, e.cardId) : null;
        return [e.d, t ? t.name : "", e.city, e.cat, e.place, e.ccy, n(e.amount), e.paidBy === "them" ? p.name : me, n(mine), n(e.amount - mine), c ? c.name : "", e.note].map(q).join(";");
      }));
      const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      const tt = trip !== "all" && trip !== "none" ? tripById(trip) : null;
      a.download = "ortak_" + (tt ? tt.name : p.name).replace(/[^\wçğıöşüÇĞİÖŞÜ-]+/g, "_") + ".csv"; a.click();
    };
  }

  /* ================= gezi / kişi / ayarlar ================= */
  function openTripForm(id) {
    const S = DBs(), t = id ? tripById(id) : null, p = currentPerson();
    const n = t ? S.entries.filter(e => e.tripId === t.id).length : 0;
    App.modal(`
      ${App.mh(t ? "Geziyi düzenle" : "Yeni gezi", "Gezi = harcamaları gruplamak için etiket (tatil, ev alışverişi, doğum günü…).")}
      <label class="lbl">Ad</label><input type="text" id="tName" value="${t ? esc(t.name) : ""}" placeholder="ör. Kos Temmuz" autofocus>
      ${t ? `<label class="check" style="margin-top:14px"><input type="checkbox" id="tArch" ${t.archived ? "checked" : ""}> Arşivle (yeni harcamalarda listelenmez)</label>` : ""}
      <div class="btnrow"><button class="btn" id="tSave">Kaydet</button>${t ? `<button class="btn danger" id="tDel">Geziyi sil</button>` : ""}<button class="btn ghost" data-close>Vazgeç</button></div>
      ${t && n ? `<div class="note" style="margin-top:8px">Silersen ${n} harcama silinmez, sadece "gezisiz" olur.</div>` : ""}`);
    $("#tSave").onclick = () => {
      const nm = val("tName").trim(); if (!nm) return App.toast("Ad gir");
      if (t) { t.name = nm; t.archived = !!($("#tArch") && $("#tArch").checked); }
      else { const nt = { id: K.uid("t"), name: nm, personId: p ? p.id : null }; S.trips.push(nt); App.sh.trip = nt.id; }
      App.closeModal(); App.commit("Gezi kaydedildi");
    };
    const d = $("#tDel"); if (d) d.onclick = () => { const s = App.snap(); S.entries.forEach(e => { if (e.tripId === t.id) e.tripId = null; }); S.trips = S.trips.filter(x => x.id !== t.id); App.sh.trip = "all"; App.closeModal(); App.commit("Gezi silindi", s); };
  }
  function openPersonForm(id) {
    const S = DBs(), p = id ? personById(id) : null;
    App.modal(`${App.mh(p ? "Kişiyi düzenle" : "Kişi ekle")}
      <label class="lbl">Ad</label><input type="text" id="psName" value="${p ? esc(p.name) : ""}" autofocus>
      <div class="btnrow"><button class="btn" id="psSave">Kaydet</button>${p ? `<button class="btn danger" id="psDel">Kişiyi ve defterini sil</button>` : ""}<button class="btn ghost" data-close>Vazgeç</button></div>`);
    $("#psSave").onclick = () => {
      const nm = val("psName").trim(); if (!nm) return App.toast("Ad gir");
      if (p) p.name = nm; else { const np = { id: K.uid("u"), name: nm }; S.people.push(np); App.sh.personId = np.id; App.sh.trip = "all"; }
      App.closeModal(); App.commit("Kaydedildi");
    };
    const d = $("#psDel"); if (d) d.onclick = () => {
      const s = App.snap();
      S.entries = S.entries.filter(e => e.personId !== p.id); S.settlements = S.settlements.filter(x => x.personId !== p.id);
      S.trips = S.trips.filter(t => t.personId !== p.id); S.people = S.people.filter(x => x.id !== p.id);
      App.sh.personId = null; App.closeModal(); App.commit(p.name + " silindi", s);
    };
  }
  function openSharedSettings() {
    const S = DBs(), p = currentPerson();
    App.modal(`${App.mh("Ortak harcama ayarları")}
      <label class="lbl">Senin adın (özetlerde)</label><input type="text" id="ssMe" value="${esc(myName())}">
      ${p ? `<label class="lbl">Bu defterin kişisi</label><div style="display:flex;gap:8px"><input type="text" value="${esc(p.name)}" disabled><button class="btn ghost" data-act="shEditPerson" data-id="${p.id}">Düzenle</button></div>` : ""}
      <label class="lbl">Kategoriler <span class="opt">(virgülle ayır)</span></label>
      <textarea id="ssCats" rows="3">${esc(S.categories.join(", "))}</textarea>
      <div class="btnrow"><button class="btn" id="ssSave">Kaydet</button><button class="btn ghost" data-close>Vazgeç</button></div>`);
    $("#ssSave").onclick = () => {
      App.DB.settings.myName = val("ssMe").trim() || "Ben";
      const cats = val("ssCats").split(",").map(x => x.trim()).filter(Boolean);
      if (cats.length) S.categories = [...new Set(cats)];
      App.closeModal(); App.commit("Kaydedildi");
    };
  }

  Object.assign(App.ACT, {
    shAddFirst: () => {
      const nm = val("shFirst").trim(); if (!nm) return App.toast("Bir isim gir");
      const me = val("shMe").trim(); if (me) App.DB.settings.myName = me;
      const np = { id: K.uid("u"), name: nm }; DBs().people.push(np); App.sh.personId = np.id;
      App.commit(nm + " eklendi");
    },
    shPerson: d => { App.sh.personId = d.id; App.sh.trip = "all"; App.render(); },
    shAddPerson: () => openPersonForm(null),
    shEditPerson: d => openPersonForm(d.id),
    shSettings: () => openSharedSettings(),
    shTrip: d => { App.sh.trip = d.id; App.render(); },
    shTripForm: d => openTripForm(d.id),
    shAdd: () => openSharedForm(null),
    quickShared: () => { if (!people().length) { App.setTab("ortak"); return; } openSharedForm(null); },
    shEdit: d => openSharedForm(d.id),
    shSettle: () => openSettle(null),
    shEditSettle: d => openSettle(d.id),
    shShare: d => openShare(d.trip)
  });
  App.buildShareText = buildShareText;
})();
