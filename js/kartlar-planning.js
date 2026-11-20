/* =====================================================================
   Kart Kokpiti — Kartlar: borç bitiş planı, elimdeki parayı dağıt
   app.js (kabuk) önce yüklenir; ortak yardımcılar App.I üzerinden gelir.
   kartlar.js üçe bölündü (18 Kasım 2026): kartlar-cards.js + kartlar-forms.js + bu dosya.
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { ic, moneyHtml, COLORS, BANKS, persist, toast, mh, val, num, segVal, segHtml, activeCards, cardColor, ccyPill, accountOptions, currentStmtMonth, devirAt, limParts, hotAccounts, sharedNetTL, restructLeft, fmtTL0, rateText, chipClass, rateLine, esc, $, $$, loadDB, initTheme } = I;
  const fetchRates = (...a) => I.fetchRates(...a);
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
      <div class="sec-title" style="margin-top:var(--s4)"><h2>Ayda biraz daha fazla ödersem?</h2></div>
      <div class="note box" style="display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap">
        <span>Ayda</span><input type="text" id="poPlus" inputmode="decimal" value="2000" style="width:130px"><span>₺ fazla ödersem</span>
        <div id="poPlusOut" style="flex-basis:100%"></div>
      </div>
      <div class="note" style="margin-top:var(--s3)">Varsayımlar: yeni harcama yapmadığın (girilmiş dönem içi, taksit ve bekleyenler hariç), her ay önce tüm asgarilerin, sonra artan paranın seçtiğin sıraya göre (varsayılan: faizi en yüksek borç) ödendiği varsayılır. Faiz her ekstrenin dönem borcuna göre TCMB kademesinden, KKDF/BSMV dahil hesaplanır; faize faiz işlemez. Dövizler bugünkü kurla TL'ye çevrilir. Gerçek tutarlar bankanın hesabına göre biraz oynar.</div>
    `, { wide: true });
    App.attachCalc($("#poAmt"));
    App.attachCalc($("#poPlus"));
    let last = null;
    const runPlus = () => {
      const o = $("#poPlusOut"); if (!o) return;
      if (!last || !last.R.months.length) { o.innerHTML = ""; return; }
      if (!last.R.done) { o.innerHTML = `<span class="faint">Önce borcun bittiği bir aylık tutar gir.</span>`; return; }
      const d = num("poPlus");
      if (!(d > 0)) { o.innerHTML = ""; return; }
      const P = K.simulatePayoff(DB, last.m + d, t, { extra: last.extra });
      const months = last.R.endK - P.endK, saved = K.round2(last.R.totalInterest - P.totalInterest);
      o.innerHTML = months > 0 || saved > K.EPS
        ? `Borç <b>${K.monthLabel(P.endMonth)}</b>'de biter${months > 0 ? ` — <b class="ok">${months} ay erken</b>` : ""}, faiz <b>${K.fmt(P.totalInterest)}</b>${saved > K.EPS ? ` (<b class="ok">${K.fmt(saved)} daha az</b>)` : ""}.`
        : `<span class="faint">Bu fark bitiş ayını ve faizi değiştirmiyor.</span>`;
    };
    const run = () => {
      const m = num("poAmt");
      if (!(m >= 0)) { $("#poOut").innerHTML = ""; last = null; runPlus(); return; }
      const shOn = $("#poShared") && $("#poShared").checked;
      const extra = shOn ? { [+val("poSharedK")]: SN.total } : null;
      const R = K.simulatePayoff(DB, m, t, { extra });
      const R0 = shOn ? K.simulatePayoff(DB, m, t) : null;
      const M = K.simulatePayoff(DB, 0, t, { minOnly: true });
      last = { m, extra, R };
      runPlus();
      if (!R.months.length) { $("#poOut").innerHTML = `<div class="empty">Borç yok 🎉</div>`; return; }
      const first = R.months[0];
      const startDebt = K.round2(first.debtEnd + first.pay);
      const RS = K.simulatePayoff(DB, m, t, { extra, strategy: "snowball" });
      const better = !R.done && !RS.done ? null
        : !RS.done ? "a" : !R.done ? "s"
        : Math.abs(R.totalInterest - RS.totalInterest) > 0.5 ? (R.totalInterest < RS.totalInterest ? "a" : "s")
        : R.endK !== RS.endK ? (R.endK < RS.endK ? "a" : "s") : null;
      const stratCol = (key, label, X, firstOff) => `<div${better === key ? ' style="box-shadow:inset 0 0 0 1.5px var(--ok)"' : ""}><small>${label}${better === key ? ` · <span class="ok">daha iyi</span>` : ""}</small>
          <b class="${X.done ? "" : "bad"}">${X.done ? K.monthLabel(X.endMonth) : "bitmiyor"}</b>
          <small>faiz ${K.fmt(X.totalInterest)}${firstOff ? ` · ilk kapanan: ${esc(firstOff.card.name)}${firstOff.ccy !== "TRY" ? " " + firstOff.ccy : ""}` : ""}</small></div>`;
      const firstClosed = X => X.accounts.filter(a => a.paidOff != null && a.paidOff > 0).sort((a, b) => a.paidOff - b.paidOff)[0];
      const stratHtml = `<div class="sec-title" style="margin-top:var(--s4)"><h2>Hangi sırayla ödemeli?</h2><span class="hint">asgariler ödendikten sonra artan para</span></div>
        <div class="po-figs" style="grid-template-columns:1fr 1fr">${stratCol("a", "Önce faizi yüksek olan (çığ)", R, firstClosed(R))}${stratCol("s", "Önce küçük borç (kartopu)", RS, firstClosed(RS))}</div>
        <div class="note" style="margin-top:var(--s2)">${better === "a" && R.done && RS.done ? `Çığ <b>${K.fmt(RS.totalInterest - R.totalInterest)}</b> daha az faiz ödetir${RS.endK > R.endK ? `, ${RS.endK - R.endK} ay erken biter` : ""}. Kartopu küçük borçları daha önce kapatıp motivasyon verir.` : better === "s" && R.done && RS.done ? `Bu borçlarda kartopu <b>${K.fmt(R.totalInterest - RS.totalInterest)}</b> daha az faiz ödetiyor${R.endK > RS.endK ? `, ${R.endK - RS.endK} ay erken bitiyor` : ""}.` : R.done && RS.done ? "İki sıra da aynı sonucu veriyor." : ""} Aşağıdaki tablo çığ sırasıyla hesaplanır.</div>`;
      const head = `<div class="po-figs">
          <div><small>Bitiş</small><b class="${R.done ? "" : "bad"}">${R.done ? K.monthLabel(R.endMonth) : "120 ayda bitmiyor"}</b><small>${R.done ? (R.endK === 0 ? "bu ay" : R.endK + " ay sonra") : ""}</small></div>
          <div><small>Toplam faiz (vergili)</small><b>${K.fmt(R.totalInterest)}</b></div>
          <div><small>Toplam ödeme</small><b>${K.fmt(R.totalPaid)}</b><small>bugünkü borç ${K.fmt(startDebt)} + bilinen yeni yük + faiz</small></div>
        </div>`;
      const warn = R.shortMonths ? `<div class="alert bad" style="margin-top:var(--s3)"><span class="ic">${ic("late")}</span><div class="grow"><b>Bu tutar ${R.shortMonths} ayda asgarileri karşılamıyor</b> (ilki ${K.monthLabel(R.months.find(x => x.short).month)}: asgariler toplamı ${K.fmt(R.months.find(x => x.short).minNeed)}). Asgarinin altında kalmak gecikme faizi, sicil kaydı ve 3 seferde kartın kapanması demek; bu tablo o durumda yanıltıcıdır.${need ? ` Hiçbir ay aksatmamak için ayda en az <b>${K.fmt(need)}</b> gerekiyor.` : ""}</div></div>` : "";
      const cmp = (R0 ? `<div class="note box ok-box" style="margin-top:var(--s3)">Alacağın gelirse: ${R0.done && R.done && R0.endK > R.endK ? `<b>${R0.endK - R.endK} ay erken</b> biter, ` : ""}<b>${K.fmt(Math.max(0, R0.totalInterest - R.totalInterest))}</b> daha az faiz${R0.shortMonths > R.shortMonths ? `, asgarinin karşılanmadığı ay ${R0.shortMonths} → ${R.shortMonths}` : ""}.</div>` : "") + (R.done && M.done ? `<div class="note box" style="margin-top:var(--s3)">Sadece asgari ödeseydin borç ${K.monthLabel(M.endMonth)}'de biterdi ve ${K.fmt(M.totalInterest)} faiz öderdin.</div>` : "") + stratHtml;
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
    let tp = null;
    $("#poPlus").addEventListener("input", () => { clearTimeout(tp); tp = setTimeout(runPlus, 250); });
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

  Object.assign(I, { openPayoff, openPlanner });
})();
