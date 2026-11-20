/* =====================================================================
   Kart Kokpiti — uygulama kabuğu: kayıt, gezinme, modal, ortak yardımcılar, aksiyonlar, klavye, başlatma
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT;
  const STORE_KEY = "kartTakip_v2";
  const THEME_KEY = "kartTakip_theme";
  const TAB_KEY = "kartTakip_tab";
  const COLORS = ["#4C5BD4", "#D64F4F", "#E07B39", "#C9A227", "#2E9E6B", "#1F8FB3", "#8E5BD0", "#D4477E", "#3B4A63", "#7A8699"];
  const BANKS = ["Akbank", "Garanti BBVA", "İş Bankası", "Yapı Kredi", "QNB", "Ziraat", "Halkbank", "VakıfBank", "DenizBank", "TEB", "ING", "Enpara", "Kuveyt Türk", "Odeabank", "Fibabanka"];

  const App = window.App = { DB: null, tab: "ozet", ACT: {}, storageMode: "browser", showArchived: false, rateMonthsAll: false };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  App.$ = $; App.$$ = $$; App.esc = esc; App.COLORS = COLORS;
  App.today = () => K.startOfDay(new Date());

  /* ---------------- kayıt ---------------- */
  function loadDB() {
    let raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { App.storageMode = "memory"; }
    try { App.DB = K.normalize(raw ? JSON.parse(raw) : null); }
    catch (e) { App.DB = K.seed(); toast("Kayıtlı veri okunamadı — boş başlatıldı"); }
  }
  function persist() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(App.DB)); App.storageMode = "browser"; }
    catch (e) { App.storageMode = "memory"; }
  }
  /* değişiklik sonrası: kaydet + yeniden çiz + bildir */
  App.commit = function (msg, undoSnap) {
    persist(); App.render();
    if (msg) toast(msg, undoSnap ? { label: "Geri al", fn: () => { App.DB = K.normalize(JSON.parse(undoSnap)); persist(); App.render(); toast("Geri alındı"); } } : null);
  };
  App.snap = () => JSON.stringify(App.DB);
  App.replaceDB = function (db, msg) { App.DB = K.normalize(db); App.commit(msg); };

  /* ---------------- bildirim ---------------- */
  let toastTimer = null;
  /* mesaj metnine göre durum: aşikâr hata/başarı dışında nötr kalır (yanlış sınıflandırma riskini azaltır) */
  function toastKind(msg) {
    const s = String(msg).toLowerCase();
    if (/okunamadı|tanınmadı|bulunamadı|çekilemedi|yüklenemedi|başarısız|\bhata/.test(s)) return "bad";
    if (/kaydedildi|eklendi|güncellendi|silindi|indirildi|yüklendi|kopyalandı|aktarıldı|açıldı|kapatıldı|alındı|tamamlandı|edildi/.test(s)) return "ok";
    return "info";
  }
  function toast(msg, action) {
    const t = $("#toast");
    const kind = toastKind(msg);
    t.classList.remove("kind-ok", "kind-bad", "kind-info"); t.classList.add("kind-" + kind);
    const icn = kind === "bad" ? "late" : kind === "ok" ? "ok" : "info";
    t.innerHTML = `<span class="ic">${ic(icn)}</span><span class="tx">${esc(msg)}</span>` + (action ? `<button style="margin-left:var(--s3);background:transparent;border:0;color:inherit;font-weight:700;text-decoration:underline;flex:none">${esc(action.label)}</button>` : "");
    if (action) t.querySelector("button").onclick = () => { t.classList.remove("show"); action.fn(); };
    t.style.pointerEvents = action ? "auto" : "none";
    t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), action ? 5500 : 2600);
  }
  App.toast = toast;

  /* ---------------- modal ---------------- */
  App.modal = function (html, opts) {
    const m = $("#modal");
    m.className = "modal" + (opts && opts.wide ? " wide" : "");
    m.innerHTML = html;
    App.makeFocusable(m);
    App.lastFocus = App.lastFocus || document.activeElement;
    $("#modalBg").classList.add("open");
    m.scrollTop = 0;
    const f = m.querySelector("[autofocus]");
    if (f && window.matchMedia("(min-width:621px)").matches) setTimeout(() => { f.focus(); if (f.select && f.value) f.select(); }, 30);
    else if (window.matchMedia("(min-width:621px)").matches) setTimeout(() => { const first = m.querySelector("input:not([type=hidden]):not([disabled]),select"); if (first) first.focus(); }, 30);
    return m;
  };
  App.closeModal = () => {
    $("#modalBg").classList.remove("open"); $("#modal").innerHTML = "";
    const lf = App.lastFocus; App.lastFocus = null;
    if (lf && document.contains(lf) && lf.focus) lf.focus({ preventScroll: true });
  };
  const mh = (title, sub) => `<div class="mh"><h3>${title}</h3><button class="iconbtn sm plain" data-close aria-label="Kapat">${ic("close")}</button></div>${sub ? `<div class="sub">${sub}</div>` : ""}`;
  App.mh = mh;

  /* tutar kutusuna canlı "= sonuç" */
  App.attachCalc = function (inp) {
    if (!inp || inp._calc) return; inp._calc = true;
    const hint = document.createElement("div"); hint.className = "calc-hint";
    inp.insertAdjacentElement("afterend", hint);
    const upd = () => {
      const s = inp.value;
      if (/[+*/]/.test(s) || /\d\s*-\s*\d/.test(s)) { const v = K.calc(s); hint.textContent = isNaN(v) ? "…" : "= " + K.fmt(v, inp.dataset.ccy || "TRY").replace(/^./, ""); }
      else hint.textContent = "";
    };
    /* düz sayı yazarken binlik ayırıcı: 12500 → 12.500 · işlem (3500+250) ya da ondalık nokta (12.5) varsa dokunma */
    const fmtLive = () => {
      const s = inp.value;
      if (!s || !/^[\d.]*(,\d*)?$/.test(s)) return;
      const hasComma = s.includes(",");
      if (!hasComma && /\.\d{1,2}$/.test(s)) return;   // 12.5 → ondalık
      const [ip, dp] = s.split(",");
      const g = ip.replace(/\./g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      const out = hasComma ? g + "," + dp : g;
      if (out === s) return;
      const pos = inp.selectionStart == null ? s.length : inp.selectionStart;
      let n = 0; for (let i = 0; i < pos; i++) if (/\d/.test(s[i])) n++;
      inp.value = out;
      let np = 0, c = 0; while (np < out.length && c < n) { if (/\d/.test(out[np])) c++; np++; }
      try { inp.setSelectionRange(np, np); } catch (e) { }
    };
    inp.addEventListener("input", () => { fmtLive(); upd(); });
    fmtLive(); upd();
  };
  const val = id => { const e = document.getElementById(id); return e ? e.value : ""; };
  const num = id => K.round2(K.calc(val(id)));

  /* segment kontrol yardımcıları */
  App.bindSeg = function (root, onChange) {
    $$(".seg", root).forEach(seg => {
      seg.addEventListener("click", e => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        $$("button", seg).forEach(x => x.classList.toggle("on", x === b));
        seg.dataset.value = b.dataset.v;
        if (onChange) onChange(seg.id, b.dataset.v);
      });
    });
  };
  const segVal = id => { const s = document.getElementById(id); return s ? s.dataset.value : null; };
  App.segVal = segVal;
  const segHtml = (id, opts, cur) => `<div class="seg" id="${id}" data-value="${esc(cur)}">${opts.map(o => `<button type="button" data-v="${esc(o[0])}" class="${o[0] === cur ? "on" : ""}">${o[1]}</button>`).join("")}</div>`;
  App.segHtml = segHtml;

  /* kayan seçim vurgusu: gidilen yöndeki kenar önden, arkadaki kenar geriden gelir (esneme etkisi).
     Sınıf değişimini izlediği için çağrı yerlerinin hiçbirine dokunmak gerekmez. */
  {
    const SEL = ".tabs, .bottomnav, .seg";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const isOn = b => b.classList.contains("active") || b.classList.contains("on");
    const queue = new Map();
    const ro = new window.ResizeObserver(es => es.forEach(e => place(e.target, false)));
    const place = (box, animate) => {
      const b = [...box.children].find(x => x.tagName === "BUTTON" && isOn(x));
      let p = box.querySelector(":scope > .spill");
      if (!b || !b.offsetWidth) { box.classList.remove("has-pill"); return; }
      if (!p) { p = document.createElement("span"); p.className = "spill"; p.setAttribute("aria-hidden", "true"); box.prepend(p); ro.observe(box); animate = false; }
      const L = b.offsetLeft, R = box.clientWidth - L - b.offsetWidth, prev = parseFloat(p.style.left);
      if (!animate || reduce.matches || isNaN(prev) || prev === L) p.style.transition = "none";
      else {
        const fwd = L > prev, lead = ".32s cubic-bezier(.16,1,.3,1)", trail = ".6s cubic-bezier(.8,0,.2,1) .05s";
        p.style.transition = `left ${fwd ? trail : lead}, right ${fwd ? lead : trail}`;
      }
      Object.assign(p.style, { left: L + "px", right: R + "px", top: b.offsetTop + "px", height: b.offsetHeight + "px" });
      box.classList.add("has-pill");
    };
    const flush = () => { queue.forEach((anim, box) => box.isConnected && place(box, anim)); queue.clear(); };
    const add = (box, anim) => { if (!queue.size) Promise.resolve().then(flush); queue.set(box, queue.get(box) || anim); };
    new window.MutationObserver(ms => ms.forEach(m => {
      if (m.type === "attributes") { const box = m.target.parentElement; if (m.target.tagName === "BUTTON" && box && box.matches(SEL)) add(box, true); return; }
      m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.matches(SEL)) add(n, false); n.querySelectorAll(SEL).forEach(x => add(x, false)); });
    })).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    $$(SEL).forEach(x => add(x, false));
    const rescan = () => $$(SEL).forEach(x => add(x, false));
    if (document.fonts) document.fonts.ready.then(rescan);
    window.addEventListener("resize", rescan);
  }

  /* ---------------- tema ---------------- */
  function initTheme() {
    let t = null; try { t = localStorage.getItem(THEME_KEY); } catch (e) { }
    if (t) document.documentElement.setAttribute("data-theme", t);
    const curT = () => document.documentElement.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const icon = () => { $("#themeBtn").innerHTML = ic(curT() === "dark" ? "sun" : "moon"); };
    icon();
    $("#themeBtn").onclick = () => {
      const nx = curT() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nx);
      try { localStorage.setItem(THEME_KEY, nx); } catch (e) { }
      icon();
    };
  }

  /* ---------------- gezinme ---------------- */
  /* sayfa girişi: bloklar sırayla bulanıktan netleşerek gelir, başlıklar soldan açılır, çubuklar dolar */
  const ENTER_BLOCKS = ".alert, .next-card, .card, .ccard, .sec-title, .sec-fold > summary, .empty";
  const pageEnter = sec => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    sec.classList.remove("enter");
    let i = 0;
    $$(ENTER_BLOCKS, sec).forEach(el => {
      if (el.parentElement.closest(".card, .ccard, .next-card, .alert")) return;
      if (el.getBoundingClientRect().top > window.innerHeight + 40) return;
      el.style.setProperty("--i", Math.min(i++, 14));
    });
    void sec.offsetWidth;
    sec.classList.add("enter");
    clearTimeout(sec._enterT);
    sec._enterT = setTimeout(() => sec.classList.remove("enter"), 2400);
  };
  App.setTab = function (t) {
    const changed = App.tab !== t;
    App.tab = t;
    $$("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
    $$("section.page").forEach(s => s.classList.toggle("active", s.id === "page-" + t));
    try { localStorage.setItem(TAB_KEY, t); } catch (e) { }
    App.render();
    window.scrollTo({ top: 0 });
    if (changed) pageEnter($("#page-" + t));
  };
  App.render = function () {
    /* giriş animasyonu sürerken gelen yeniden çizim (senkron durumu vb.) animasyonu baştan oynatmasın */
    $$("section.page.enter").forEach(s => { s.classList.remove("enter"); clearTimeout(s._enterT); });
    const r ={ ozet: renderOzet, kartlar: renderKartlar, ortak: App.renderOrtak, ayarlar: renderAyarlar }[App.tab];
    if (r) r();
    App.makeFocusable($("main"));
  };

  /* ---------------- ortak yardımcılar ---------------- */
  const activeCards = () => App.DB.cards.filter(c => !c.archived);
  App.activeCards = activeCards;
  const cardColor = c => (c && c.color) || "#4C5BD4";
  App.cardColor = cardColor;
  function autoColor(name) {
    const n = String(name || "").toLocaleLowerCase("tr-TR");
    if (n.includes("wings")) return "#B5523B";
    if (n.includes("axess")) return "#D64F4F";
    if (n.includes("maximum")) return "#1F6FB3";
    if (n.includes("qnb") || n.includes("extra")) return "#8E5BD0";
    if (n.includes("play")) return "#2E9E6B";
    if (n.includes("bonus") || n.includes("garanti")) return "#2E9E6B";
    if (n.includes("world") || n.includes("yapı")) return "#3B4A63";
    if (n.includes("paraf") || n.includes("halk")) return "#1F8FB3";
    if (n.includes("enpara")) return "#7A3FD0";
    return COLORS[Math.abs([...n].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % COLORS.length];
  }
  App.autoColor = autoColor;
  const ccyPill = ccy => `<span class="pill ${ccy}">${ccy === "TRY" ? "TL" : ccy}</span>`;
  App.ccyPill = ccyPill;
  function accountOptions(selected, cards) {
    const opts = [];
    (cards || activeCards()).forEach(c => K.accountsOf(c).forEach(ccy => {
      const v = c.id + "|" + ccy;
      opts.push(`<option value="${v}" ${v === selected ? "selected" : ""}>${esc(c.name)} · ${ccy === "TRY" ? "TL" : ccy}</option>`);
    }));
    return opts.join("");
  }
  App.accountOptions = accountOptions;
  /* kartın şu anki (son kesilmiş) ekstre ayı */
  function currentStmtMonth(card) {
    const t = App.today();
    const d = K.clampDate(t.getFullYear(), t.getMonth(), card.cutDay || 8);
    return d <= t ? K.ymOf(d) : K.ymAdd(K.ymOf(d), -1);
  }
  /* yeni ekstre için önceki dönemden devredecek tutar */
  function devirAt(cardId, ccy, month, excludeId, cutOverride) {
    const card = K.cardById(App.DB, cardId);
    const cut = cutOverride ? K.parseISO(cutOverride) : K.cutDateOf({ month }, card);
    const L = K.ledger(App.DB, cardId, ccy, App.today());
    const prevs = L.rows.filter(r => r.id !== excludeId && r.cut < cut);
    if (!prevs.length) return { amount: 0, prev: null };
    const p = prevs[prevs.length - 1];   // efektif tutar (yeni-tabanlıysa devir dahil)
    const paid = App.DB.payments.filter(x => x.cardId === cardId && x.ccy === ccy).filter(x => { const d = K.parseISO(x.d); return d >= p.cut && d < cut; })
      .reduce((a, x) => a + (x.kind === "convIn" ? -1 : 1) * (+x.a || 0), 0);
    return { amount: K.round2(Math.max(0, p.amount - paid - (p.restruct || 0))), prev: p.st };
  }
  App.devirAt = devirAt;
  /* limit çubuğu parçaları: alacak bakiye önce dönem içinden, sonra taksitten düşer */
  function limParts(l) {
    let cr = Math.max(0, -l.debt), debt = Math.max(0, l.debt), period = l.period, inst = l.inst, prov = l.prov || 0;
    const p2 = Math.max(0, period - cr); cr -= period - p2; period = p2;
    const v2 = Math.max(0, prov - cr); cr -= prov - v2; prov = v2;
    inst = Math.max(0, inst - cr);
    return { debt, period, inst, prov, credit: Math.max(0, -l.debt) };
  }
  App.limParts = limParts;
  /* faiz işleyen (devreden) hesaplar: son ödeme geçti ve kalan var */
  function hotAccounts(c) {
    const t = App.today();
    return K.accountsOf(c).map(ccy => ({ ccy, L: K.ledger(App.DB, c.id, ccy, t) })).filter(a => a.L.current && (a.L.current.status === "carry" || a.L.current.status === "late") && a.L.current.rem > K.EPS);
  }
  App.hotAccounts = hotAccounts;
  /* ortak harcamalardan net alacak (TL, + = bana borçlular) */
  function sharedNetTL() {
    const DB = App.DB, ym = K.ymOf(App.today());
    let v = 0; const who = [];
    DB.shared.people.forEach(p => { const b = K.sharedBalance(DB, p.id); const x = K.CCYS.reduce((a, c) => a + (K.toTL(DB, b[c], c, ym) || 0), 0); if (x > 0.5) { v += x; who.push(p.name); } });
    return { total: K.round2(v), who };
  }
  /* ekstre taksitlendirmelerinden henüz ekstreye gelmemiş kalan (TL) */
  function restructLeft(DB, t) {
    let total = 0, count = 0;
    DB.installments.filter(x => x.kind === "stmt").forEach(x => {
      const c = K.cardById(DB, x.cardId); if (!c || c.archived) return;
      const from = K.nextPeriodMonth(c, t);
      for (let k = 0; k < x.count; k++) {
        const m = K.ymAdd(x.start, k); if (m < from) continue;
        const it = K.instFor(DB, m).find(i => i.t.id === x.id); if (!it) continue;
        total += K.toTL(DB, it.amount, x.ccy, m) || 0; count += it.n;
      }
    });
    return { total: K.round2(total), count };
  }
  /* "%3,75 + vergiler = %4,875/ay" */
  const fmtTL0 = v => K.fmtPlain(v) + " ₺";
  const rateText = ri => `${K.fmtRate(ri.akt)} + vergiler = <b>${K.fmtRate(ri.eff)}</b>/ay`;
  const chipClass = row => (row.status === "due" && row.daysToDue <= 3) ? "soon" : row.status;
  App.chipClass = chipClass;
  const rateLine = () => {
    const ym = K.ymOf(App.today());
    const parts = ["EUR", "USD"].map(c => { const r = K.rateFor(App.DB, ym, c); return r ? K.CCY_SYM[c] + " " + r.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : null; }).filter(Boolean);
    return parts.length ? "Kur: " + parts.join(" · ") : "Kur girilmemiş";
  };

  /* tek tip çizgi ikonlar: durum dili — gecikmiş (late) · yakın (soon) · tamam (ok) · bilgi (info) */
  const ICONS = {
    late: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v5M12 18h.01"/>',
    soon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    fire: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2 0-3-.5-5 1-8z"/>',
    fx: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    save: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3v3a4 4 0 0 0 8 0V3M8 21v-3a4 4 0 0 1 8 0v3"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
    cart: '<path d="M3 4h2.5l2 11h10l2-8H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    import: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/>',
    upload: '<path d="M12 16V4m0 0-4 4m4-4 4 4M4 17v3h16v-3"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.8M18 14.3c1.8.8 3 2.6 3 4.7"/>',
    share: '<path d="M7 17 17 7M9 7h8v8"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/>',
    puzzle: '<path d="M9 3h4v3a2 2 0 1 0 4 0V3h4v6h-3a2 2 0 1 0 0 4h3v8H3V9h6z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
    plane: '<path d="m21 3-9.5 9.5M21 3l-6.5 18-3-8.5L3 9.5 21 3z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    dash: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/>'
  };
  const ic = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;
  /* para: kuruş kısmı soluk ve küçük (metin aynı kalır: ₺1.234,56) */
  const moneyHtml = (v, ccy) => { const s = K.fmt(v, ccy), i = s.lastIndexOf(","); return i < 0 ? esc(s) : esc(s.slice(0, i)) + `<span class="cents">${esc(s.slice(i))}</span>`; };
  /* K.fmtMulti'nin kuruş-soluk hâli: çoklu para birimi ("₺500,00 + €20,00") — her parçanın kuruşu ayrı soluklaşır */
  const moneyMultiHtml = obj => { const parts = K.CCYS.filter(c => Math.abs(obj[c] || 0) > K.EPS).map(c => moneyHtml(Math.abs(obj[c]), c)); return parts.length ? parts.join(" + ") : moneyHtml(0, "TRY"); };

  /* diğer dosyalarla paylaşılan yardımcılar */
  App.I = { ic, moneyHtml, moneyMultiHtml, COLORS, BANKS, persist, toast, mh, val, num, segVal, segHtml, activeCards, cardColor, ccyPill, accountOptions, currentStmtMonth, devirAt, limParts, hotAccounts, sharedNetTL, restructLeft, fmtTL0, rateText, chipClass, rateLine, esc, $, $$, loadDB, initTheme };
  const renderOzet = (...a) => App.I.renderOzet(...a);
  const renderKartlar = (...a) => App.I.renderKartlar(...a);
  const renderAyarlar = (...a) => App.I.renderAyarlar(...a);
  const openCardDetail = (...a) => App.I.openCardDetail(...a);
  const openCardForm = (...a) => App.I.openCardForm(...a);
  const openPayment = (...a) => App.I.openPayment(...a);
  const openStatement = (...a) => App.I.openStatement(...a);
  const openBatch = (...a) => App.I.openBatch(...a);
  const openPeriodUpdate = (...a) => App.I.openPeriodUpdate(...a);
  const openPending = (...a) => App.I.openPending(...a);
  const openPendingPost = (...a) => App.I.openPendingPost(...a);
  const openPeriodOne = (...a) => App.I.openPeriodOne(...a);
  const openInstForm = (...a) => App.I.openInstForm(...a);
  const openConvert = (...a) => App.I.openConvert(...a);
  const openStmtInst = (...a) => App.I.openStmtInst(...a);
  const openPayoff = (...a) => App.I.openPayoff(...a);
  const openPlanner = (...a) => App.I.openPlanner(...a);
  const fetchRates = (...a) => App.I.fetchRates(...a);
  const openGroupForm = (...a) => App.I.openGroupForm(...a);

  /* ================= aksiyonlar ================= */
  Object.assign(App.ACT, {
    fcMore: () => { App.fcAll = !App.fcAll; App.render(); },
    addCard: () => openCardForm(null),
    editCard: d => openCardForm(d.card),
    cardDetail: d => openCardDetail(d.card, d.ccy),
    pay: d => openPayment(d.card, d.ccy),
    quickPay: () => openPayment(),
    quickStatement: () => openStatement({}),
    newStatement: d => openStatement({ card: d.card, ccy: d.ccy, month: d.month }),
    editStatement: d => {
      const st = App.DB.statements.find(x => x.id === d.id);
      const c = st && K.cardById(App.DB, st.cardId);
      if (st && st.estimate && c && K.cutDateOf(st, c) > App.today()) return openPeriodOne({ card: st.cardId, ccy: st.ccy });
      openStatement({ id: d.id });
    },
    periodUpdate: d => openPeriodUpdate(d && d.month),
    pendNew: d => openPending(d && d.card, null),
    pendEdit: d => openPending(null, d.id),
    pendPost: d => openPendingPost(d.id),
    pendCancel: d => { const DB = App.DB, x = DB.pending.find(p => p.id === d.id); if (!x) return; const s = App.snap(); DB.pending = DB.pending.filter(p => p.id !== d.id); const open = $("#modalBg").classList.contains("open"); App.commit("Bekleyen silindi (iptal)", s); if (open) openCardDetail(x.cardId); },
    periodOne: d => openPeriodOne({ card: d.card, ccy: d.ccy, month: d.month }),
    goInst: () => { App.setTab("kartlar"); setTimeout(() => { const h = $("#instSec"); if (h) h.scrollIntoView({ behavior: "smooth" }); }, 50); },
    batchStatement: () => openBatch(),
    newInst: d => openInstForm(null, d.card, d.ccy),
    editInst: d => { const x = App.DB.installments.find(i => i.id === d.id); if (x && x.kind === "stmt") return openStmtInst({ id: d.id }); openInstForm(d.id); },
    stmtInst: d => openStmtInst({ card: d.card, ccy: d.ccy }),
    convertFx: d => openConvert(d.card, d.ccy),
    openPayoff: () => openPayoff(),
    openPlanner: () => openPlanner(),
    toggleArchived: () => { App.showArchived = !App.showArchived; App.render(); },
    toggleRateMonths: () => { App.rateMonthsAll = !App.rateMonthsAll; App.render(); },
    goSettings: () => App.setTab("ayarlar"),
    goShared: () => App.setTab("ortak"),
    fetchRates: () => { App.closeModal(); fetchRates(); },
    editGroup: d => openGroupForm(d.id),
    delPayment: d => {
      const DB = App.DB, p = DB.payments.find(x => x.id === d.id); if (!p) return;
      const s = App.snap(); DB.payments = DB.payments.filter(x => x.id !== d.id && !(p.convId && x.convId === p.convId));
      const open = $("#modalBg").classList.contains("open");
      App.commit(p.convId ? "Çevrim silindi — borç döviz hesabına geri döndü" : "Ödeme silindi", s);
      if (open) openCardDetail(p.cardId, p.ccy);
    },
    saveMinRule: () => {
      const th = K.calc(val("mrTh")), lo = parseFloat(val("mrLow")), hi = parseFloat(val("mrHigh"));
      if (!(th > 0) || !(lo > 0 && lo <= 100) || !(hi > 0 && hi <= 100)) return toast("Geçerli değerler gir");
      App.DB.settings.minRule = { threshold: K.round2(th), low: lo, high: hi };
      App.commit("Asgari kuralı güncellendi: " + K.fmtPlain(th) + " ve altı %" + lo + ", üstü %" + hi);
    },
    saveRates2: () => {
      const T = App.DB.settings.rateTiers, tx = K.calc(val("fTax"));
      if (!(tx >= 1 && tx < 3)) return toast("Vergi çarpanı 1 ile 3 arasında olmalı");
      const nt = T.map((x, i) => ({ max: x.max == null ? null : K.calc(val("tMax" + i)), akt: K.calc(val("tAkt" + i)), gec: K.calc(val("tGec" + i)) }));
      if (nt.some(x => !(x.akt > 0 && x.akt < 50) || !(x.gec > 0 && x.gec < 50) || (x.max != null && !(x.max > 0)))) return toast("Geçerli oranlar gir");
      for (let i = 1; i < nt.length; i++) if (nt[i].max != null && nt[i].max <= nt[i - 1].max) return toast("Kademe sınırları artan sırada olmalı");
      App.DB.settings.rateTiers = nt.map(x => ({ max: x.max == null ? null : K.round2(x.max), akt: K.round2(x.akt), gec: K.round2(x.gec) }));
      App.DB.settings.taxMult = K.round2(tx);
      App.commit("Faiz kademeleri kaydedildi");
    },
    resetTiers: () => { const s0 = App.snap(); App.DB.settings.rateTiers = K.seed().settings.rateTiers; App.DB.settings.taxMult = 1.3; App.commit("TCMB varsayılan kademeleri yüklendi", s0); }
  });

  /* ================= klavye ================= */
  const SHORTCUTS = [
    ["1 – 4", "Sekmeler: Özet · Kartlar · Ortak · Ayarlar", null],
    ["O", "Ödeme yaptım", "quickPay"], ["E", "Ekstre geldi", "quickStatement"], ["T", "Toplu ekstre gir", "batchStatement"],
    ["D", "Dönem içi harcamaları güncelle", "periodUpdate"], ["B", "Bekleyen işlem ekle", "pendNew"], ["H", "Ortak harcama ekle", "quickShared"],
    ["P", "Elimdeki parayı dağıt", "openPlanner"], ["F", "Borç bitiş planı", "openPayoff"], ["K", "Kart ekle", "addCard"], ["Y", "Yedek indir", "exportJSON"], ["?", "Kısayol listesi", "showKeys"]
  ];
  const KEYMAP = { o: "quickPay", "ö": "quickPay", e: "quickStatement", t: "batchStatement", d: "periodUpdate", b: "pendNew", h: "quickShared", p: "openPlanner", f: "openPayoff", k: "addCard", y: "exportJSON", "?": "showKeys" };
  function showKeys() {
    App.modal(`${mh("Klavye kısayolları")}
      <div class="keys">
        <h4>Her yerde (bir kutuya yazmıyorken)</h4>
        ${SHORTCUTS.map(([k, d]) => `<span class="k">${k.split(" – ").map(x => `<kbd>${x}</kbd>`).join("–")}</span><span>${d}</span>`).join("")}
        <h4>Pencerelerde</h4>
        <span class="k"><kbd>Enter</kbd></span><span>Kaydet (ana buton)</span>
        <span class="k"><kbd>Enter</kbd></span><span>Toplu ekstre / dönem içi ekranında: sonraki karta geç, sonda kaydet</span>
        <span class="k"><kbd>Shift</kbd>+<kbd>Enter</kbd></span><span>Ortak harcamada: kaydet ve yenisini aç</span>
        <span class="k"><kbd>Ctrl</kbd>+<kbd>Enter</kbd></span><span>Not alanında bile kaydet</span>
        <span class="k"><kbd>Tab</kbd></span><span>Sonraki alan (pencere içinde döner)</span>
        <span class="k"><kbd>←</kbd><kbd>→</kbd></span><span>Seçim butonlarında (₺/€/$, Ben/O…) seçimi değiştir</span>
        <span class="k"><kbd>Esc</kbd></span><span>Pencereyi kapat</span>
        <span class="k"><kbd>Enter</kbd> / <kbd>Boşluk</kbd></span><span>Odaktaki kartı / satırı aç</span>
      </div>
      <div class="note" style="margin-top:var(--s3)">Tutar kutularına işlem yazabilirsin: <b>1500+2300</b>, <b>24000/6</b>, <b>1.250,50</b>.</div>`);
  }
  App.ACT.showKeys = showKeys;
  /* hedefin ARDINDAN gelen ilk ana buton (yoksa sondaki) */
  function primaryBtn(m, from) {
    const cands = $$(".btnrow", m).map(r => r.querySelector("button.btn:not(.ghost):not(.danger):not(.soft):not(.hidden)")).filter(b => b && b.offsetParent !== null);
    if (!cands.length) return null;
    if (from) { const after = cands.find(b => from.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); if (after) return after; }
    return cands[cands.length - 1];
  }
  function focusables(root) {
    return $$('button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,a[href],[tabindex]:not([tabindex="-1"])', root).filter(el => el.offsetParent !== null);
  }
  function onKey(e) {
    const menu = $("#fabMenu"), modalOpen = $("#modalBg").classList.contains("open"), m = $("#modal");
    const tgt = e.target, tag = tgt.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt.isContentEditable;
    if (e.key === "Escape") {
      if (menu.classList.contains("open")) { menu.classList.remove("open"); return; }
      if (modalOpen) { App.closeModal(); return; }
      if (typing) tgt.blur();
      return;
    }
    if (e.key === "Tab" && modalOpen) {             // odak pencere içinde dönsün
      const f = focusables(m); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (i < 0) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && tag === "BUTTON" && tgt.closest(".seg")) {
      const bs = $$("button", tgt.closest(".seg")); let i = bs.indexOf(tgt) + (e.key === "ArrowRight" ? 1 : -1);
      i = (i + bs.length) % bs.length; e.preventDefault(); bs[i].focus(); bs[i].click(); return;
    }
    if ((e.key === "Enter" || e.key === " ") && !typing && tag !== "BUTTON" && tag !== "A" && tgt.matches && tgt.matches("[data-act]")) { e.preventDefault(); tgt.click(); return; }
    if (e.key === "Enter" && !e.isComposing) {
      if (modalOpen && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const b = primaryBtn(m, null); if (b) b.click(); return; }
      if (modalOpen && (tag === "INPUT" || tag === "SELECT")) {
        if (tgt.type === "checkbox" || tgt.type === "color") return;
        const seq = tgt.closest("#bRows, #puRows");
        if (seq) {
          e.preventDefault();
          const list = $$("input[data-acc]", seq), i = list.indexOf(tgt);
          if (i >= 0 && i < list.length - 1) { list[i + 1].focus(); list[i + 1].select(); }
          else { const b = primaryBtn(m, null); if (b) b.click(); }
          return;
        }
        if (e.shiftKey && $("#hSaveNew")) { e.preventDefault(); $("#hSaveNew").click(); return; }
        e.preventDefault(); const b = primaryBtn(m, tgt); if (b) b.click(); return;
      }
      if (!modalOpen && tag === "INPUT") {
        const host = tgt.closest("[data-enter]");
        if (host && App.ACT[host.dataset.enter]) { e.preventDefault(); App.ACT[host.dataset.enter](host.dataset, host, e); }
        return;
      }
    }
    if (typing || modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-4]$/.test(e.key)) { e.preventDefault(); App.setTab(["ozet", "kartlar", "ortak", "ayarlar"][+e.key - 1]); return; }
    const act = KEYMAP[e.key.toLocaleLowerCase("tr-TR")];
    if (act && App.ACT[act]) { e.preventDefault(); menu.classList.remove("open"); App.ACT[act]({}, null, e); }
  }
  /* tıklanabilir div'ler Tab ile gezilebilsin */
  App.makeFocusable = function (root) {
    $$("[data-act]:not(button):not(a):not(input):not([tabindex])", root).forEach(el => { el.setAttribute("tabindex", "0"); el.setAttribute("role", "button"); });
  };

  /* ================= başlat ================= */
  /* index.html'deki data-ic="ad" öğelerine çizgi ikon koy (span.ic / iconbtn ise içini değiştirir, değilse başa ekler) */
  function hydrateIcons(root) {
    $$("[data-ic]", root).forEach(el => {
      if (el.dataset.icDone) return;
      el.dataset.icDone = "1";
      if (el.classList.contains("ic") || el.classList.contains("iconbtn")) el.innerHTML = ic(el.dataset.ic);
      else el.insertAdjacentHTML("afterbegin", ic(el.dataset.ic));
    });
  }
  /* mobilde pencere başlığından aşağı çekince kapat */
  function swipeToClose() {
    const m = $("#modal"); let y0 = null;
    m.addEventListener("touchstart", e => { y0 = (e.target.closest(".mh") && m.scrollTop === 0) ? e.touches[0].clientY : null; }, { passive: true });
    m.addEventListener("touchmove", e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) { m.style.transition = "none"; m.style.transform = `translateY(${dy}px)`; } }, { passive: true });
    m.addEventListener("touchend", e => {
      if (y0 == null) return;
      const dy = e.changedTouches[0].clientY - y0; y0 = null;
      m.style.transition = ""; m.style.transform = "";
      if (dy > 90) App.closeModal();
    });
  }
  App.init = function () {
    hydrateIcons();
    swipeToClose();
    initTheme();
    loadDB();
    persist();
    $$("[data-tab]").forEach(b => b.addEventListener("click", () => App.setTab(b.dataset.tab)));
    document.addEventListener("click", e => {
      if (e.target.closest("[data-close]")) { App.closeModal(); return; }
      if (e.target.id === "modalBg") { App.closeModal(); return; }
      const fab = e.target.closest("#fab");
      const menu = $("#fabMenu");
      if (fab) { menu.classList.toggle("open"); return; }
      if (!e.target.closest("#fabMenu")) menu.classList.remove("open");
      const a = e.target.closest("[data-act]");
      if (!a) return;
      const fn = App.ACT[a.dataset.act];
      if (fn) { e.preventDefault(); menu.classList.remove("open"); fn(a.dataset, a, e); }
    });
    document.addEventListener("keydown", onKey);
    let t = "ozet"; try { t = localStorage.getItem(TAB_KEY) || "ozet"; } catch (e) { }
    App.setTab(["ozet", "kartlar", "ortak", "ayarlar"].includes(t) ? t : "ozet");
    if (App.storageMode !== "browser") toast("Tarayıcı kaydı kapalı — çıkmadan önce yedek indir!");
    setTimeout(() => fetchRates({ auto: true }), 800);   // bu ayın eksik € / $ kuru varsa sessizce çek
  };
})();
