/* =====================================================================
   Kart Kokpiti — çekirdek mantık (arayüzden bağımsız, Node ile test edilebilir)
   ---------------------------------------------------------------------
   TEMEL KURAL (devir karışmasın diye):
   • Bir kartın her para birimi ayrı bir "hesap"tır (TRY / EUR / USD).
   • Ekstre tutarı = bankadaki "Dönem Borcu" (önceki dönemden kalan dahil).
   • Ödemeler ekstreye değil HESABA girilir; tarihine göre otomatik olarak
     "o tarihte geçerli olan son kesilmiş ekstre"ye yazılır.
   • Güncel borç = hesabın EN SON KESİLMİŞ ekstresinden kalan. Eski ekstrelerin
     kalanı toplanmaz — "devretti" olarak gösterilir. Böylece borç asla ikiye katlanmaz.
   ===================================================================== */
(function (root) {
  "use strict";

  const CCYS = ["TRY", "EUR", "USD"];
  const CCY_SYM = { TRY: "₺", EUR: "€", USD: "$" };
  const CCY_NAME = { TRY: "TL", EUR: "Euro", USD: "Dolar" };
  const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const DEFAULT_CATS = ["Yeme-İçme", "Market", "Ulaşım", "Konaklama", "Alışveriş", "Eğlence", "Kişisel", "Sağlık", "Faturalar", "Hediye", "Diğer"];
  const EPS = 0.005;
  /* TCMB, 1 Eylül 2026: dönem borcu 30 bin altı / 30–180 bin / 180 bin üstü */
  const DEFAULT_TIERS = [{ max: 30000, akt: 3.25, gec: 3.55 }, { max: 180000, akt: 3.75, gec: 4.05 }, { max: null, akt: 4.25, gec: 4.55 }];

  /* ---------------- veri ---------------- */
  function seed() {
    return {
      v: 2,
      cards: [],
      groups: [],          // ortak limit grupları {id,name,limit}
      statements: [],      // {id,cardId,ccy,month,amount,cutDate?,dueDate?,minPay?}
      payments: [],        // {id,cardId,ccy,d,a,note?}
      pending: [],         // bekleyen işlemler {id,cardId,amountTL,ccy(yansıyacağı),note,d}
      installments: [],    // {id,cardId,ccy,desc,per,count,start}
      rates: {},           // {"2026-10": {EUR:55.1, USD:47.2}}
      settings: {
        minRule: { threshold: 100000, low: 20, high: 40 },
        aktRate: 3.5,
        gecRate: 3.8,
        taxMult: 1.30,     // KKDF %15 + BSMV %15
        // TCMB azami faiz kademeleri (bireysel kart, dönem borcuna göre, aylık %)
        rateTiers: DEFAULT_TIERS.map(x => Object.assign({}, x)),
        myName: "Ben"
      },
      shared: { people: [], trips: [], categories: DEFAULT_CATS.slice(), entries: [], settlements: [] },
      meta: { created: isoDate(new Date()), lastBackup: null }
    };
  }

  function uid(prefix) {
    return (prefix || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* eski/eksik alanları tamamlar — kullanıcının verisi korunur */
  function normalize(DB) {
    const s = seed();
    if (!DB || typeof DB !== "object") return s;
    for (const k of ["cards", "groups", "statements", "payments", "installments"]) if (!Array.isArray(DB[k])) DB[k] = [];
    if (!DB.rates || typeof DB.rates !== "object") DB.rates = {};
    DB.settings = Object.assign({}, s.settings, DB.settings || {});
    DB.settings.minRule = Object.assign({}, s.settings.minRule, (DB.settings && DB.settings.minRule) || {});
    if (!Array.isArray(DB.settings.rateTiers) || !DB.settings.rateTiers.length) DB.settings.rateTiers = DEFAULT_TIERS.map(x => Object.assign({}, x));
    DB.shared = Object.assign({}, s.shared, DB.shared || {});
    for (const k of ["people", "trips", "entries", "settlements"]) if (!Array.isArray(DB.shared[k])) DB.shared[k] = [];
    if (!Array.isArray(DB.shared.categories) || !DB.shared.categories.length) DB.shared.categories = DEFAULT_CATS.slice();
    DB.meta = Object.assign({}, s.meta, DB.meta || {});
    if (!Array.isArray(DB.pending)) DB.pending = [];
    DB.statements.forEach(st => {      // eski "bunun provizyonda" alanı → bekleyen işleme çevrilir
      if (st.provTL > 0) {
        const c = DB.cards.find(x => x.id === st.cardId);
        const fx = c && Array.isArray(c.ccys) ? c.ccys.find(x => x !== "TRY") : null;
        DB.pending.push({ id: uid("w"), cardId: st.cardId, amountTL: round2(st.provTL), ccy: fx || "USD", note: "provizyon", d: st.updated || isoDate(new Date()) });
        st.amount = round2(Math.max(0, st.amount - st.provTL));
      }
      delete st.provTL;
    });
    DB.cards.forEach(c => {
      if (!Array.isArray(c.ccys) || !c.ccys.length) c.ccys = ["TRY"];
      if (!c.cutDay) c.cutDay = 8;
      if (!c.dueDay) c.dueDay = 18;
      if (!c.minMode) c.minMode = "auto";
      if (c.archived === undefined) c.archived = false;
      if (!c.rateMode) c.rateMode = "auto";   // eski elle girilmiş oranlar artık kademeden otomatik (elle seçilirse kullanılır)
    });
    DB.v = 2;
    return DB;
  }

  /* ---------------- sayı / tarih yardımcıları ---------------- */
  const round2 = v => Math.round((+v || 0) * 100) / 100;
  const pad = n => String(n).padStart(2, "0");
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseISO(s) { if (!s) return null; const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d || 1); }
  function ymOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function ymAdd(ym, k) { const [y, m] = ym.split("-").map(Number); return ymOf(new Date(y, m - 1 + k, 1)); }
  function ymDiff(a, b) { const [ay, am] = a.split("-").map(Number), [by, bm] = b.split("-").map(Number); return (by - ay) * 12 + (bm - am); }
  function daysIn(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
  function clampDate(y, m0, day) { const d = new Date(y, m0, 1); return new Date(d.getFullYear(), d.getMonth(), Math.min(day, daysIn(d.getFullYear(), d.getMonth()))); }
  function dayDiff(a, b) { return Math.round((b - a) / 86400000); } // b - a (gün)
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function monthLabel(ym, short) { const [y, m] = ym.split("-"); return (short ? MONTHS_SHORT : MONTHS)[+m - 1] + " " + (short ? y.slice(2) : y); }

  /* "10000-6000", "3*1500+250", "1.250,50+300" gibi ifadeleri çözer */
  function calc(str) {
    if (str == null) return NaN;
    if (typeof str === "number") return isFinite(str) ? str : NaN;
    let s = String(str).trim().replace(/[₺€$\s]/g, "");
    if (!s) return NaN;
    if (/[^0-9+\-*/().,]/.test(s)) return NaN;
    if (s.includes(",")) { s = s.replace(/\./g, "").replace(/,/g, "."); }
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) { s = s.replace(/\./g, ""); } // 12.500 → 12500
    try {
      const v = Function('"use strict";return(' + s + ')')();
      return (typeof v === "number" && isFinite(v)) ? v : NaN;
    } catch (e) { return NaN; }
  }

  /* ---------------- kart / hesap ---------------- */
  const cardById = (DB, id) => DB.cards.find(c => c.id === id);
  const groupById = (DB, id) => DB.groups.find(g => g.id === id);

  /* asgari oran için esas alınan limit: ortak limit grubundaysa grubun limiti */
  function effectiveLimit(DB, card) {
    if (card.groupId) { const g = groupById(DB, card.groupId); if (g && g.limit > 0) return g.limit; }
    return card.limit > 0 ? card.limit : null;
  }
  /* asgari ödeme oranı (0-1) + açıklaması */
  function minRateInfo(DB, card) {
    const r = DB.settings.minRule;
    if (card.minMode === "manual" && card.minRate > 0) return { rate: card.minRate / 100, why: "elle girildi", auto: false };
    const lim = effectiveLimit(DB, card);
    if (!lim) return { rate: r.high / 100, why: "limit girilmedi → %" + r.high + " varsayıldı", auto: true, missing: true };
    const low = lim <= r.threshold;
    return { rate: (low ? r.low : r.high) / 100, why: "limit " + (low ? "≤ " : "> ") + fmtPlain(r.threshold) + " → %" + (low ? r.low : r.high), auto: true };
  }

  function cutDateOf(st, card) {
    if (st.cutDate) return parseISO(st.cutDate);
    const [y, m] = st.month.split("-").map(Number);
    return clampDate(y, m - 1, (card && card.cutDay) || 8);
  }
  function dueDateOf(st, card) {
    if (st.dueDate) return parseISO(st.dueDate);
    const cut = cutDateOf(st, card);
    const cd = (card && card.cutDay) || 8, dd = (card && card.dueDay) || 18;
    // son ödeme günü kesimden küçükse ertesi aya düşer (örn. kesim 25, ödeme 5)
    return dd > cd ? clampDate(cut.getFullYear(), cut.getMonth(), dd) : clampDate(cut.getFullYear(), cut.getMonth() + 1, dd);
  }
  /* kartın bir sonraki kesim tarihi */
  function nextCutDate(card, today) {
    const t = startOfDay(today || new Date());
    let d = clampDate(t.getFullYear(), t.getMonth(), card.cutDay || 8);
    if (d <= t) d = clampDate(t.getFullYear(), t.getMonth() + 1, card.cutDay || 8);
    return d;
  }

  /* bir hesabın (kart+para birimi) tüm ekstre zinciri — devir, ödeme, durum */
  function ledger(DB, cardId, ccy, today) {
    const card = cardById(DB, cardId);
    const t = startOfDay(today || new Date());
    const sts = DB.statements.filter(s => s.cardId === cardId && s.ccy === ccy)
      .map(s => ({ st: s, cut: cutDateOf(s, card), due: dueDateOf(s, card) }))
      .sort((a, b) => a.cut - b.cut);
    const pays = DB.payments.filter(p => p.cardId === cardId && p.ccy === ccy)
      .map(p => ({ p, d: parseISO(p.d) })).sort((a, b) => a.d - b.d);
    const mr = card ? minRateInfo(DB, card).rate : 0.4;
    const rows = sts.map(x => ({
      id: x.st.id, st: x.st, month: x.st.month, basis: x.st.basis === "new" ? "new" : "total",
      amount: round2(x.st.amount), cut: x.cut, due: x.due, isCut: t >= x.cut,
      payments: [], paid: 0, rem: 0, devirIn: 0, newSpend: null, exactMin: x.st.minPay > 0,
      // ekstre taksitlendirme: bu ekstreden taksite çevrilen tutar (borçtan çıkar, gelecek aylara taksit olarak gelir)
      restructs: DB.installments.filter(t => t.kind === "stmt" && t.stId === x.st.id && t.cardId === cardId && t.ccy === ccy),
      restruct: 0
    }));
    rows.forEach(r => { r.restruct = round2(r.restructs.reduce((a, t) => a + (+t.principal || 0), 0)); });
    const orphan = [];
    // ödemeyi, tarihinden önceki/eşit son kesime ata
    pays.forEach(({ p, d }) => {
      let idx = -1;
      for (let i = 0; i < rows.length; i++) { if (rows[i].cut <= d) idx = i; else break; }
      if (idx < 0) orphan.push(p); else rows[idx].payments.push(p);
    });
    let lastCutIdx = -1;
    rows.forEach((r, i) => { if (r.isCut) lastCutIdx = i; });
    rows.forEach((r, i) => {
      const prev = i > 0 ? rows[i - 1] : null;
      r.estimate = !!r.st.estimate;
      if (r.basis === "new") {
        // tutar "sadece yeni harcama" olarak girildi → dönem borcu = yeni + önceki kalan (dinamik)
        r.devirIn = prev ? prev.bal : 0;   // fazla ödeme (eksi bakiye) varsa düşer
        let base = r.amount;
        r.spend = r.amount;
        // dönem içi tahmin: taksitler tutara dahil değilse o dönemin taksitlerini ekle
        if (r.estimate && !r.st.instIncl) { r.instAdded = instSum(DB, cardId, ccy, r.month); base = round2(base + r.instAdded); }
        r.newSpend = base;
        r.amount = round2(base + r.devirIn);
      } else if (prev && prev.isCut) {
        r.devirIn = prev.bal;                       // önceki dönemden bu ekstreye geçen (fazla ödemede eksi)
        r.newSpend = round2(r.amount - r.devirIn);  // bu dönemin yeni harcaması (faiz dahil)
      } else if (!prev) r.newSpend = r.amount;
      r.fresh = r.newSpend != null ? r.newSpend : r.amount; // tahminlerde kullanılan "yeni" kısım
      r.minPay = r.exactMin ? round2(r.st.minPay) : round2(r.amount * mr);
      // iade / alacak: borcu düşürür ama asgariyi karşılamaz (bankada da asgari değişmez)
      // döviz → TL çevrimi: banka ödenmeyen döviz borcunu TL'ye çevirip TL hesabına aktarır.
      // convOut (döviz hesabında) borcu düşürür, convIn (TL hesabında) borcu artırır; ikisi de asgariyi etkilemez.
      const sumK = k => round2(r.payments.filter(p => (p.kind || "pay") === k).reduce((a, p) => a + (+p.a || 0), 0));
      r.paid = sumK("pay");
      r.refund = sumK("refund");
      r.convOut = sumK("convOut");
      r.convIn = sumK("convIn");
      r.bal = round2(r.amount - r.paid - r.refund - r.restruct - r.convOut + r.convIn);   // eksi = fazla ödeme (alacak bakiye)
      r.rem = Math.max(0, r.bal);
      r.credit = round2(Math.max(0, -r.bal));
      r.minGap = round2(Math.max(0, r.minPay - r.paid - r.restruct));
      const daysToDue = dayDiff(t, r.due);
      r.daysToDue = daysToDue;
      if (!r.isCut) { r.status = "future"; r.label = r.estimate ? "Dönem içi" : "Kesilmedi"; }
      else if (i < lastCutIdx) {
        if (r.rem <= EPS) { r.status = "closed"; r.label = r.credit > EPS ? "Fazla ödendi → " + MONTHS[+rows[i + 1].month.slice(5) - 1] : (r.convOut > EPS ? "TL'ye çevrildi" : r.restruct > EPS ? "Taksitlendirildi" : "Kapandı"); }
        else { r.status = "carried"; r.label = "Devretti → " + MONTHS[+rows[i + 1].month.slice(5) - 1]; r.devirOut = r.rem; }
      } else { // güncel ekstre
        r.current = true;
        if (r.rem <= EPS) { r.status = "paid"; r.label = r.credit > EPS ? "Fazla ödendi · alacak" : (r.convOut > EPS ? "TL'ye çevrildi" : r.restruct > EPS ? "Taksitlendirildi" : "Ödendi"); }
        else if (daysToDue < 0) {
          if (r.minGap <= EPS) { r.status = "carry"; r.label = "Asgari ödendi · kalan devredecek"; }
          else { r.status = "late"; r.label = "Gecikmede · " + (-daysToDue) + " gün"; }
        } else if (r.minGap <= EPS) { r.status = "minok"; r.label = "Asgari ödendi"; }
        else { r.status = "due"; r.label = daysToDue === 0 ? "Bugün son gün" : daysToDue + " gün kaldı"; }
      }
    });
    const current = lastCutIdx >= 0 ? rows[lastCutIdx] : null;
    const futures = rows.filter(r => !r.isCut);
    return { card, ccy, rows, current, futures, orphan, debt: current ? current.rem : 0, credit: current ? current.credit : 0 };
  }

  /* kartın aktif hesap listesi */
  function accountsOf(card) { return (card.ccys || ["TRY"]).slice().sort((a, b) => CCYS.indexOf(a) - CCYS.indexOf(b)); }

  /* ---------------- kur ---------------- */
  function rateFor(DB, ym, ccy) {
    if (ccy === "TRY") return 1;
    const keys = Object.keys(DB.rates).filter(k => DB.rates[k] && DB.rates[k][ccy] > 0).sort();
    if (!keys.length) return null;
    let best = null;
    for (const k of keys) { if (k <= ym) best = k; }
    return DB.rates[best || keys[0]][ccy];
  }
  function toTL(DB, v, ccy, ym) {
    if (ccy === "TRY") return v;
    const r = rateFor(DB, ym || ymOf(new Date()), ccy);
    return r ? v * r : null;
  }

  /* ---------------- faiz tahmini ---------------- */
  /* güncel ekstre son ödemeyi geçtiyse bir sonraki ekstreye yansıyacak aylık faiz (vergiler dahil) */
  /* dönem borcuna (TL karşılığı) göre TCMB kademesi */
  function tierFor(DB, amountTL) {
    const T = (DB.settings.rateTiers && DB.settings.rateTiers.length ? DB.settings.rateTiers : DEFAULT_TIERS);
    for (let i = 0; i < T.length; i++) {
      const tr = T[i];
      if (tr.max == null || (i === 0 ? amountTL < tr.max : amountTL <= tr.max)) return { tier: tr, idx: i, tiers: T };
    }
    return { tier: T[T.length - 1], idx: T.length - 1, tiers: T };
  }
  function tierLabel(T, idx) {
    const lo = idx > 0 ? T[idx - 1].max : null, hi = T[idx].max;
    if (lo == null) return "dönem borcu " + fmtPlain(hi) + " ₺ altı";
    if (hi == null) return "dönem borcu " + fmtPlain(lo) + " ₺ üstü";
    return "dönem borcu " + fmtPlain(lo) + "–" + fmtPlain(hi) + " ₺";
  }
  /* bir ekstrenin faiz oranı: kart "elle" ise kartın oranı, değilse dönem borcuna göre kademe.
     amountTL verilmezse row'dan hesaplanır. eff = vergiler dahil aylık %. */
  function rateInfo(DB, card, row, ccy, amountTL) {
    const tax = DB.settings.taxMult || 1.3;
    if (card && card.rateMode === "manual" && typeof card.aktRate === "number") {
      const akt = card.aktRate, gec = typeof card.gecRate === "number" ? card.gecRate : round2(akt + 0.3);
      return { akt, gec, eff: akt * tax, effGec: gec * tax, tax, auto: false, why: "kart için elle girildi" };
    }
    let base = amountTL, parts = null;
    if (base == null) {
      // banka: kademe, kartın o ayki TL + döviz ekstrelerinin TOPLAMINA göre seçilir; tüm hesaplara aynı oran
      if (card && row) { const T = cardStmtTL(DB, card, row.month); base = T.total; parts = T.parts; }
      else base = 0;
    }
    const { tier, idx, tiers } = tierFor(DB, base || 0);
    const multi = parts && parts.length > 1;
    return { akt: tier.akt, gec: tier.gec, eff: tier.akt * tax, effGec: tier.gec * tax, tax, auto: true, tierIdx: idx, base: round2(base || 0), parts,
      yearly: round2(tier.akt * 12),
      why: (multi ? parts.map(x => CCY_NAME[x.ccy]).join(" + ") + " toplam ekstre " + fmt(base) + " → " : "") + tierLabel(tiers, idx) };
  }
  /* kartın bir aydaki tüm hesap ekstreleri (TL karşılığı, o ayın kuruyla) */
  function cardStmtTL(DB, card, month) {
    const parts = [];
    accountsOf(card).forEach(ccy => {
      const r = ledger(DB, card.id, ccy, new Date(2100, 0, 1)).rows.find(x => x.month === month);
      if (!r || !(r.amount > EPS)) return;
      const v = ccy === "TRY" ? r.amount : toTL(DB, r.amount, ccy, month);
      if (v != null) parts.push({ ccy, amount: r.amount, tl: round2(v) });
    });
    return { parts, total: round2(parts.reduce((a, x) => a + x.tl, 0)) };
  }
  /* oranı "%3,75 + vergiler = %4,875" biçiminde yazar */
  function fmtRate(v) { return "%" + String(Math.round(v * 1000) / 1000).replace(".", ","); }

  function carryCost(DB, row, card) {
    if (!row || row.rem <= EPS) return 0;
    const ri = rateInfo(DB, card, row, row.st ? row.st.ccy : "TRY");
    const gap = Math.min(row.minGap, row.rem);
    return round2(((gap * ri.gec) + (row.rem - gap) * ri.akt) / 100 * ri.tax);
  }

  /* gün gün işleyen faiz (Akbank sözleşmesi: "dönem borcunun bir kısmı ödenirse kalan bakiyeye hesap kesim
     tarihinden itibaren akdi faiz"). Son ödeme tarihinde ödenmeyen kısım kesim→son ödeme arası için,
     son ödemeden sonra da ödemelerle azalan bakiye üzerinden bir sonraki kesime kadar faiz işler (aylık oran / 30).
     Asgarinin ödenmeyen kısmına gecikme faizi. Faiz bir sonraki ekstreye gelir.
     Dönüş: sofar = bugüne kadar, full = kesime kadar (başka ödeme yapılmazsa), lateDays, nextCut. */
  function accrual(DB, card, L, idx, today) {
    const t = startOfDay(today || new Date());
    const r = L.rows[idx];
    const none = { sofar: 0, full: 0, lateDays: 0, nextCut: null, unpaidAtDue: 0 };
    if (!r || !r.isCut || t <= r.due) return none;
    const nextCut = idx + 1 < L.rows.length ? L.rows[idx + 1].cut : cutDateOf({ month: ymAdd(r.month, 1) }, card);
    const ri = rateInfo(DB, card, r, L.ccy);
    const sign = p => ({ convIn: 1 })[p.kind] || -1;
    // son ödeme gününe kadarki hareketler
    let B = r.amount - r.restruct, gap = r.minPay - r.restruct;
    const ev = [];
    r.payments.forEach(p => {
      const d = parseISO(p.d);
      if (d <= r.due) { B += sign(p) * (+p.a || 0); if ((p.kind || "pay") === "pay") gap -= (+p.a || 0); }
      else ev.push({ d, p });
    });
    gap = Math.max(0, Math.min(gap, B));
    if (B <= EPS) return Object.assign({}, none, { nextCut });
    const unpaidAtDue = round2(B);
    const day = (bal, g, n) => n > 0 && bal > EPS ? (Math.min(g, bal) * ri.gec + (bal - Math.min(g, bal)) * ri.akt) / 100 / 30 * n * ri.tax : 0;
    const run = until => {
      // kesim → son ödeme: son ödemede kalan tutar üzerinden akdi faiz
      let sum = (B * ri.akt) / 100 / 30 * Math.max(0, dayDiff(r.cut, r.due)) * ri.tax;
      let bal = B, g = gap, from = r.due;
      ev.slice().sort((a, b) => a.d - b.d).forEach(({ d, p }) => {
        if (d > until) return;
        sum += day(bal, g, dayDiff(from, d));
        bal += sign(p) * (+p.a || 0); if ((p.kind || "pay") === "pay") g = Math.max(0, g - (+p.a || 0));
        bal = Math.max(0, bal); from = d;
      });
      if (until > from) sum += day(bal, g, dayDiff(from, until));
      return round2(sum);
    };
    const lastPay = ev.length ? ev.reduce((a, e) => e.d > a ? e.d : a, r.due) : r.due;
    const endBal = r.rem;
    return { sofar: run(t < nextCut ? t : nextCut), full: run(nextCut), nextCut, unpaidAtDue, gapAtDue: round2(gap), ri,
      lateDays: dayDiff(r.due, endBal <= EPS ? lastPay : (t < nextCut ? t : nextCut)), closedLate: endBal <= EPS };
  }

  /* faiz sayacı: bir yılda ekstrelere giren faiz (TL). Ekstreye bankanın yazdığı faiz girildiyse o,
     yoksa önceki ekstreden devreden kalan için uygulamanın tahmini; + ekstre taksitlerinin faiz payı. */
  function interestReport(DB, year, today) {
    const t = startOfDay(today || new Date());
    const perRow = {}, byCard = {};
    let bank = 0, est = 0, inst = 0, accruing = 0;
    const bc = c => byCard[c.id] || (byCard[c.id] = { card: c, bank: 0, est: 0, inst: 0, accruing: 0 });
    DB.cards.forEach(c => accountsOf(c).forEach(ccy => {
      const L = ledger(DB, c.id, ccy, t);
      L.rows.forEach((r, i) => {
        if (r.current) { const A = accrual(DB, c, L, i, t); if (A.sofar > EPS) { const v = toTL(DB, A.sofar, ccy, r.month) || 0; accruing += v; bc(c).accruing += v; } }
        if (!r.isCut) return;
        const prev = i > 0 ? L.rows[i - 1] : null;
        const e = prev && prev.isCut ? accrual(DB, c, L, i - 1, t).full : 0;
        const b = r.st.interest > 0 ? round2(r.st.interest) : null;
        perRow[r.id] = { bank: b, est: e };
        if (r.month.slice(0, 4) !== String(year)) return;
        const v = b != null ? b : e; if (!(v > 0)) return;
        const tl = toTL(DB, v, ccy, r.month) || 0;
        if (b != null) { bank += tl; bc(c).bank += tl; } else { est += tl; bc(c).est += tl; }
      });
    }));
    DB.installments.filter(x => x.kind === "stmt").forEach(x => {
      const c = cardById(DB, x.cardId); if (!c) return;
      const lastCut = ymAdd(nextPeriodMonth(c, t), -1);
      const share = (x.per * x.count - x.principal) / x.count;
      for (let k = 0; k < x.count; k++) {
        const m = ymAdd(x.start, k);
        if (m > lastCut || m.slice(0, 4) !== String(year)) continue;
        if (x.pullAt && m > x.pullAt) continue;
        let v = share;
        if (x.pullAt && m === x.pullAt) { const n = x.count - k; v = x.pullAmount > 0 ? Math.max(0, x.pullAmount - x.principal / x.count * n) : share * n; }
        const tl = toTL(DB, v, x.ccy, m) || 0; inst += tl; bc(c).inst += tl;
      }
    });
    const list = Object.values(byCard).map(o => ({ card: o.card, bank: round2(o.bank), est: round2(o.est), inst: round2(o.inst), accruing: round2(o.accruing), total: round2(o.bank + o.est + o.inst) })).filter(o => o.total > EPS || o.accruing > EPS);
    return { year, bank: round2(bank), est: round2(est), inst: round2(inst), accruing: round2(accruing), total: round2(bank + est + inst), byCard: list, perRow };
  }

  /* eşit taksitli (anüite) ödeme: anapara, aylık oran (ondalık), taksit sayısı */
  function annuity(P, r, n) { if (!(n > 0)) return 0; if (!(r > 0)) return round2(P / n); return round2(P * r / (1 - Math.pow(1 + r, -n))); }
  /* taksitin kalan anaparası (k taksit ödendikten sonra) */
  function annuityLeft(per, r, nLeft) { if (!(nLeft > 0)) return 0; if (!(r > 0)) return round2(per * nLeft); return round2(per * (1 - Math.pow(1 + r, -nLeft)) / r); }

  /* ---------------- özet ---------------- */
  function summary(DB, today) {
    const t = startOfDay(today || new Date());
    const nowYM = ymOf(t);
    const debt = { TRY: 0, EUR: 0, USD: 0 };
    const credit = { TRY: 0, EUR: 0, USD: 0 };
    const items = [];      // güncel (kesilmiş) ekstreler
    const upcoming = [];   // kesilmemiş tahmini ekstreler
    let missingRate = new Set();
    DB.cards.filter(c => !c.archived).forEach(c => {
      accountsOf(c).forEach(ccy => {
        const L = ledger(DB, c.id, ccy, t);
        if (L.current) {
          debt[ccy] += L.current.rem;
          credit[ccy] = round2((credit[ccy] || 0) + L.current.credit);
          const A = accrual(DB, c, L, L.rows.indexOf(L.current), t);
          items.push({ card: c, ccy, row: L.current, ledger: L, accr: A, interest: A.full });
        }
        if (L.futures.length) upcoming.push({ card: c, ccy, row: L.futures[0] }); // yalnız sıradaki dönem
      });
    });
    let totalTL = 0;
    CCYS.forEach(ccy => {
      debt[ccy] = round2(debt[ccy]);
      if (debt[ccy] > EPS) { const v = toTL(DB, debt[ccy], ccy, nowYM); if (v == null) missingRate.add(ccy); else totalTL += v; }
    });
    items.sort((a, b) => a.row.due - b.row.due);
    upcoming.sort((a, b) => a.row.cut - b.row.cut);
    const open = items.filter(i => i.row.rem > EPS);
    const late = open.filter(i => i.row.status === "late");
    const minDue = open.reduce((a, i) => { const v = toTL(DB, i.row.minGap, i.ccy, nowYM); return a + (v || 0); }, 0);
    return { debt, credit, totalTL: round2(totalTL), items, open, late, upcoming, missingRate: [...missingRate], minDueTL: round2(minDue), nowYM };
  }

  /* limit doluluğu: grup bazında ya da kart bazında (döviz borcu TL karşılığı dahil) */
  function limitUsage(DB, today) {
    const out = [];
    const nowYM = ymOf(today || new Date());
    /* döviz hesapları o ayın kuruyla TL'ye çevrilir; kur yoksa "missing" listesine düşer (sessizce 0 sayılmaz) */
    const parts = c => { const a0 = accountsOf(c).reduce((a, ccy) => {
      const L = ledger(DB, c.id, ccy, today);
      const P = pendingLoad(DB, c, ccy, today);
      const native = round2(L.debt - L.credit + P.period + P.inst);
      if (ccy !== "TRY" && Math.abs(native) > EPS) {
        const r = rateFor(DB, nowYM, ccy);
        if (!r) { a.missing.push({ card: c.name, ccy, amount: native }); return a; }
        a.fx.push({ card: c.name, ccy, amount: native, rate: r, tl: round2(native * r) });
      }
      a.debt += toTL(DB, L.debt - L.credit, ccy, nowYM) || 0;   // alacak bakiye limiti açar
      a.period += toTL(DB, P.period, ccy, nowYM) || 0;
      a.inst += toTL(DB, P.inst, ccy, nowYM) || 0;
      return a;
    }, { debt: 0, period: 0, inst: 0, prov: 0, fx: [], missing: [] }); a0.prov += cardPending(DB, c.id).total; return a0; };
    const pack = (p, limit) => {
      const used = round2(p.debt + p.period + p.inst + p.prov);
      return { debt: round2(p.debt), period: round2(p.period), inst: round2(p.inst), prov: round2(p.prov), used, limit: limit || null, avail: limit ? round2(limit - used) : null, fx: p.fx, missing: p.missing };
    };
    DB.groups.forEach(g => {
      const cs = DB.cards.filter(c => c.groupId === g.id && !c.archived);
      if (!cs.length) return;
      const p = cs.map(parts).reduce((a, x) => ({ debt: a.debt + x.debt, period: a.period + x.period, inst: a.inst + x.inst, prov: a.prov + x.prov, fx: a.fx.concat(x.fx), missing: a.missing.concat(x.missing) }), { debt: 0, period: 0, inst: 0, prov: 0, fx: [], missing: [] });
      out.push(Object.assign({ kind: "group", id: g.id, name: g.name, sub: cs.map(c => c.name).join(" + "), color: null }, pack(p, g.limit)));
    });
    DB.cards.filter(c => !c.archived && !(c.groupId && groupById(DB, c.groupId))).forEach(c => {
      out.push(Object.assign({ kind: "card", id: c.id, name: c.name, sub: c.bank || "", color: c.color }, pack(parts(c), c.limit)));
    });
    return out;
  }

  /* aylara göre ekstre toplamı (TL karşılığı) — trend grafiği için */
  /* aylara göre YENİ harcama (devir hariç) — trend grafiği için */
  function monthlyTotals(DB, months, today) {
    const acc = {}; months.forEach(m => acc[m] = 0);
    DB.cards.forEach(c => accountsOf(c).forEach(ccy => {
      ledger(DB, c.id, ccy, today).rows.forEach(r => {
        if (!(r.month in acc)) return;
        const v = toTL(DB, Math.max(0, r.fresh), ccy, r.month); acc[r.month] += v || 0;
      });
    }));
    return months.map(m => ({ month: m, total: round2(acc[m]) }));
  }

  /* ---------------- taksitler ---------------- */
  /* o aya düşen taksitler. pullAt: kalan taksitler erken kapatıldı → hepsi o ayın ekstresine gelir */
  function instFor(DB, month) {
    return DB.installments.map(t => {
      const idx = ymDiff(t.start, month) + 1;
      if (idx < 1 || idx > t.count) return null;
      if (t.pullAt && month > t.pullAt) return null;
      if (t.pullAt && month === t.pullAt) { const n = t.count - idx + 1; return { t, idx, n, amount: t.pullAmount > 0 ? round2(t.pullAmount) : round2(t.per * n), pulled: true }; }
      return { t, idx, n: 1, amount: t.per };
    }).filter(Boolean);
  }
  /* bir taksitte bugüne kadar ekstreye girmiş taksit sayısı */
  function instDone(t, ym) {
    if (t.pullAt && ym >= t.pullAt) return t.count;
    return Math.min(t.count, Math.max(0, ymDiff(t.start, ym) + 1));
  }
  function instSum(DB, cardId, ccy, month) {
    return round2(instFor(DB, month).filter(x => x.t.cardId === cardId && x.t.ccy === ccy).reduce((a, x) => a + x.amount, 0));
  }

  /* ---------------- gelecek aylar ---------------- */
  /* henüz kesilmemiş dönemlerin yeni harcama projeksiyonu: girilen tahmin varsa o, yoksa taksitler */
  function forecast(DB, n, today) {
    const t = startOfDay(today || new Date());
    const startYM = ymOf(t);
    const months = [];
    const ledgers = {};
    DB.cards.filter(c => !c.archived).forEach(c => accountsOf(c).forEach(ccy => { ledgers[c.id + "|" + ccy] = { card: c, ccy, L: ledger(DB, c.id, ccy, t) }; }));
    for (let k = 0; months.length < n && k < n + 2; k++) {
      const m = ymAdd(startYM, k);
      const items = [];
      let anyFuture = false;
      Object.values(ledgers).forEach(({ card, ccy, L }) => {
        const cut = cutDateOf({ month: m }, card);
        const row = L.rows.find(r => r.month === m);
        if (row ? row.isCut : t >= cut) return;          // bu ayın ekstresi kesildi → gelecek değil
        const inst = instSum(DB, card.id, ccy, m);
        if (row) items.push({ card, ccy, month: m, cut: row.cut, amount: round2(row.fresh), inst: row.estimate && !row.st.instIncl ? row.instAdded : (row.estimate ? null : 0), source: row.estimate ? "estimate" : "statement", row });
        else if (inst > EPS) items.push({ card, ccy, month: m, cut, amount: inst, inst, source: "inst", row: null });
        anyFuture = true;
      });
      // geç / eksik ödenen ekstrenin faizi: bir sonraki ekstreye gelir
      Object.values(ledgers).forEach(({ card, ccy, L }) => {
        if (!L.current) return;
        const A = accrual(DB, card, L, L.rows.indexOf(L.current), t);
        if (A.full > EPS && A.nextCut && ymOf(A.nextCut) === m && t < A.nextCut) { items.push({ card, ccy, month: m, cut: A.nextCut, amount: A.full, source: "interest", row: null }); anyFuture = true; }
      });
      // bekleyen (provizyon) işlemler: kartın bu dönemine TL olarak eklenir; yansıyınca ilgili hesabın dönem içine geçer
      DB.cards.filter(c => !c.archived).forEach(card => {
        if (nextPeriodMonth(card, t) !== m) return;
        const CP = cardPending(DB, card.id);
        if (CP.total > EPS) { items.push({ card, ccy: "TRY", month: m, cut: nextCutDate(card, t), amount: CP.total, source: "pending", row: null, count: CP.items.length }); anyFuture = true; }
      });
      if (!anyFuture) continue;
      const byCcy = { TRY: 0, EUR: 0, USD: 0 };
      let tl = 0, miss = false;
      items.forEach(i => { byCcy[i.ccy] = round2(byCcy[i.ccy] + i.amount); if (i.amount > EPS) { const v = toTL(DB, i.amount, i.ccy, m); if (v == null) miss = true; else tl += v; } });
      items.sort((a, b) => a.cut - b.cut);
      months.push({ month: m, items, byCcy, tl: round2(tl), missingRate: miss });
    }
    return months;
  }
  /* harcama zaman çizelgesi (TL): kesilen ekstrelerin yeni harcaması + bu dönem + gelecek aylar.
     Sadece verisi olan ilk aydan son aya kadar (en fazla back ay geri, fwd ay ileri). */
  function spendTimeline(DB, today, opts) {
    opts = opts || {};
    const t = startOfDay(today || new Date());
    const nowYM = ymOf(t), back = opts.back || 12, fwd = opts.fwd || 12;
    const lo = ymAdd(nowYM, -(back - 1)), hi = ymAdd(nowYM, fwd);
    const acc = {};
    const slot = m => acc[m] || (acc[m] = { month: m, cut: 0, period: 0, future: 0, initial: false, missingRate: false });
    DB.cards.forEach(c => accountsOf(c).forEach(ccy => {
      ledger(DB, c.id, ccy, t).rows.forEach((r, i) => {
        if (!r.isCut || r.month < lo || r.month > hi) return;
        const s = slot(r.month);
        const v = toTL(DB, Math.max(0, r.fresh), ccy, r.month);
        if (v == null) { if (r.fresh > EPS) s.missingRate = true; } else s.cut += v;
        if (i === 0 && r.fresh > EPS) s.initial = true;   // hesabın ilk ekstresi: öncesi olmadığı için eski borç da içinde
      });
    }));
    forecast(DB, fwd + 1, t).forEach(fm => {
      if (fm.month < lo || fm.month > hi) return;
      const s = slot(fm.month);
      fm.items.forEach(i => {
        if (i.amount <= EPS || i.source === "interest") return;   // harcama grafiği: faiz hariç
        const v = toTL(DB, i.amount, i.ccy, fm.month);
        if (v == null) { s.missingRate = true; return; }
        if (fm.month === nextPeriodMonth(i.card, t)) s.period += v; else s.future += v;
      });
    });
    const filled = Object.values(acc).filter(s => s.cut + s.period + s.future > EPS).map(s => s.month).sort();
    if (!filled.length) return [];
    const out = [];
    for (let m = filled[0]; m <= filled[filled.length - 1]; m = ymAdd(m, 1)) {
      const s = acc[m] || { month: m, cut: 0, period: 0, future: 0, initial: false, missingRate: false };
      s.cut = round2(s.cut); s.period = round2(s.period); s.future = round2(s.future);
      s.total = round2(s.cut + s.period + s.future);
      out.push(s);
    }
    return out;
  }

  /* bir kartın sıradaki (kesilmemiş) dönem ayı */
  function nextPeriodMonth(card, today) { return ymOf(nextCutDate(card, today)); }

  /* henüz ekstreye girmemiş yük: dönem içi harcamalar + ileride kesilecek TÜM taksitler.
     Banka bunları limitten hemen düşer (taksitli alışverişin tamamı limiti bloke eder). */
  function pendingLoad(DB, card, ccy, today) {
    const t = startOfDay(today || new Date());
    const L = ledger(DB, card.id, ccy, t);
    const start = nextPeriodMonth(card, t);
    let horizon = start;
    DB.installments.filter(x => x.cardId === card.id && x.ccy === ccy).forEach(x => { const end = ymAdd(x.start, x.count - 1); if (end > horizon) horizon = end; });
    L.futures.forEach(r => { if (r.month > horizon) horizon = r.month; });
    let period = 0, inst = 0, periodRow = null;
    for (let m = start, g = 0; m <= horizon && g < 72; m = ymAdd(m, 1), g++) {
      const row = L.rows.find(r => r.month === m && !r.isCut);
      if (row) {
        if (m === start) periodRow = row;
        if (row.estimate) { period += row.spend; inst += row.instAdded || 0; }
        else period += Math.max(0, row.fresh);
      } else inst += instSum(DB, card.id, ccy, m);
    }
    return { period: round2(period), inst: round2(inst), total: round2(period + inst), periodRow, periodMonth: start };
  }

  /* bekleyen (provizyondaki) işlemler — kart bazında, TL olarak görünür; karta yansıyınca seçilen hesabın dönem içine geçer */
  function cardPending(DB, cardId) {
    const items = (DB.pending || []).filter(x => x.cardId === cardId);
    return { items, total: round2(items.reduce((a, x) => a + (+x.amountTL || 0), 0)) };
  }
  function installmentLoad(DB, fromYM, n) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const m = ymAdd(fromYM, k);
      const list = instFor(DB, m);
      const byCcy = { TRY: 0, EUR: 0, USD: 0 };
      list.forEach(x => byCcy[x.t.ccy] = round2((byCcy[x.t.ccy] || 0) + x.amount));
      out.push({ month: m, list, byCcy });
    }
    return out;
  }

  /* ---------------- ödeme planlayıcı ---------------- */
  /* 1) gecikmiş asgariler  2) son ödemesi yaklaşan asgariler (sicil, mutlak öncelik)
     3) artan para: faizi en yüksek borçtan aşağı (avalanche). Faizler eşitse asgari oranı yüksek kart önce
        (her 1 ₺, sonraki ayın asgarisini %40'lık kartta %20'liğe göre iki kat düşürür), sonra küçük bakiye. */
  function planPayments(DB, budgetTL, today) {
    const S = summary(DB, today);
    let bud = round2(budgetTL);
    const alloc = new Map(), why = new Map();
    const tl = (v, ccy) => ccy === "TRY" ? v : (toTL(DB, v, ccy, S.nowYM) || v * 9e9);
    const rate = ccy => ccy === "TRY" ? 1 : (rateFor(DB, S.nowYM, ccy) || null);
    const put = (it, ccyAmt) => alloc.set(it, round2((alloc.get(it) || 0) + ccyAmt));
    const open = S.open.filter(i => i.ccy === "TRY" || rate(i.ccy));
    open.forEach(i => { i.ri = rateInfo(DB, i.card, i.row, i.ccy); i.mr = minRateInfo(DB, i.card).rate; });
    open.filter(i => i.row.minGap > EPS)
      .sort((a, b) => (a.row.status === "late" ? -1 : 0) - (b.row.status === "late" ? -1 : 0) || a.row.due - b.row.due)
      .forEach(i => {
        if (bud <= EPS) return;
        const use = Math.min(bud, tl(i.row.minGap, i.ccy));
        put(i, i.ccy === "TRY" ? use : use / rate(i.ccy));
        why.set(i, i.row.status === "late" ? "gecikmiş asgari" : "asgari");
        bud = round2(bud - use);
      });
    if (bud > EPS) {
      open.map(i => ({ i, left: round2(i.row.rem - (alloc.get(i) || 0)) })).filter(x => x.left > EPS)
        .sort((a, b) => (b.i.ri.eff - a.i.ri.eff) || (b.i.mr - a.i.mr) || (tl(a.left, a.i.ccy) - tl(b.left, b.i.ccy)))
        .forEach(x => {
          if (bud <= EPS) return;
          const use = Math.min(bud, tl(x.left, x.i.ccy));
          put(x.i, x.i.ccy === "TRY" ? use : use / rate(x.i.ccy));
          why.set(x.i, (why.get(x.i) ? why.get(x.i) + " + " : "") + "en pahalı borç " + fmtRate(x.i.ri.eff));
          bud = round2(bud - use);
        });
    }
    const lines = [];
    let saving = 0;
    alloc.forEach((amt, i) => {
      if (amt <= EPS) return;
      const kind = amt >= i.row.rem - EPS ? "kapatır" : (i.row.minGap > EPS && amt >= i.row.minGap - EPS ? "asgariyi karşılar" : "kısmi");
      const t = round2(tl(amt, i.ccy));
      const save = round2(t * i.ri.eff / 100);
      saving += save;
      lines.push({ item: i, amount: round2(amt), kind, tl: t, eff: i.ri.eff, why: why.get(i) || "", save });
    });
    return { lines, used: round2(budgetTL - bud), left: bud, saving: round2(saving) };
  }

  /* ---------------- borç bitiş simülasyonu ----------------
     Her ay "monthly" TL borca ayrılır. Ay 0 = şu anki (kesilmiş) ekstreler. Sonraki aylarda:
     ekstre = devreden + faiz (kademeye göre, vergili) + bilinen yeni yük (dönem içi, taksit, bekleyen).
     Önce tüm asgariler, artan para en yüksek faizliden (avalanche). Dövizler bugünkü kurla TL'ye çevrilir.
     opts.minOnly: sadece asgari ödenirse (kıyas için).
     opts.strategy: "avalanche" (varsayılan, artan para en yüksek faizliye) | "snowball" (artan para en küçük bakiyeye). */
  function simulatePayoff(DB, monthly, today, opts) {
    opts = opts || {};
    const t = startOfDay(today || new Date());
    const nowYM = ymOf(t);
    const maxM = opts.maxMonths || 120;
    const F = forecast(DB, 36, t);
    const acc = [];
    DB.cards.filter(c => !c.archived).forEach(c => accountsOf(c).forEach(ccy => {
      const L = ledger(DB, c.id, ccy, t);
      const fx = ccy === "TRY" ? 1 : rateFor(DB, nowYM, ccy);
      if (!fx) return;   // kur yoksa hesaplanamaz
      const cur = L.current;
      const base = cur ? cur.month : ymAdd(nextPeriodMonth(c, t), -1);
      const charges = {};
      F.forEach(fm => fm.items.forEach(i => {
        if (i.card.id !== c.id || i.amount <= EPS || i.source === "interest") return;   // faizi simülasyon kendi hesaplar
        if (i.ccy !== ccy && !(i.source === "pending" && ccy === accountsOf(c)[0])) return;
        const k = ymDiff(base, fm.month); if (k < 1) return;
        const v = i.source === "pending" ? i.amount : i.amount * fx;
        charges[k] = (charges[k] || 0) + v;
      }));
      const lastK = Math.max(0, ...Object.keys(charges).map(Number));
      const bal = cur ? round2(cur.rem * fx) : 0;
      if (bal <= EPS && lastK === 0) return;
      acc.push({ card: c, ccy, base, charges, lastK, mr: minRateInfo(DB, c).rate,
        bal, stmt: cur ? round2(cur.amount * fx) : 0, minGap: cur ? round2(Math.min(cur.minGap, cur.rem) * fx) : 0,
        paidOff: bal <= EPS ? 0 : null, interestSum: 0, int: 0 });
    }));
    if (!acc.length) return { months: [], accounts: [], totalInterest: 0, totalPaid: 0, endK: 0, done: true, shortMonths: 0 };
    const mainBase = acc.map(a => a.base).sort((a, b) => acc.filter(x => x.base === b).length - acc.filter(x => x.base === a).length)[0];
    const lastCharge = Math.max(...acc.map(a => a.lastK));
    const months = [];
    let totalInterest = 0, totalPaid = 0, endK = null, shortMonths = 0;
    for (let k = 0; k <= maxM; k++) {
      let interestK = 0;
      const cardTot = {};   // kademe: kartın tüm hesaplarının (önceki ay) ekstre toplamı
      acc.forEach(a => { cardTot[a.card.id] = (cardTot[a.card.id] || 0) + a.stmt; });
      if (k > 0) acc.forEach(a => {
        // önceki aydan kalan → faiz → yeni ekstre
        const ri = rateInfo(DB, a.card, null, "TRY", cardTot[a.card.id]);
        // faize faiz işlemez: ödenmemiş faiz (a.int) faiz tabanına girmez
        const base = Math.max(0, a.bal - a.int);
        const gap = Math.min(a.minGap, base);
        const intr = base > EPS ? round2((gap * ri.gec + (base - gap) * ri.akt) / 100 * ri.tax) : 0;
        a.interestSum += intr; interestK += intr; a.int = round2(a.int + intr);
        a.stmt = round2(a.bal + intr + (a.charges[k] || 0));
        a.bal = a.stmt;
        a.minGap = round2(a.stmt * a.mr);
      });
      const cardTotNow = {};
      acc.forEach(a => { cardTotNow[a.card.id] = (cardTotNow[a.card.id] || 0) + a.stmt; });
      let bud = opts.minOnly ? Infinity : monthly + ((opts.extra && opts.extra[k]) || 0);
      let pay = 0, minNeed = 0;
      const paid = new Map();
      // 1) asgariler (son ödeme sırası yok: hepsi aynı ay)
      acc.forEach(a => { minNeed += Math.min(a.minGap, a.bal); });
      acc.slice().sort((a, b) => b.minGap - a.minGap).forEach(a => {
        const need = Math.min(a.minGap, a.bal); if (need <= EPS || bud <= EPS) return;
        const use = Math.min(bud, need); a.bal = round2(a.bal - use); a.minGap = round2(a.minGap - use); a.int = round2(Math.max(0, a.int - use));
        bud -= use; pay += use; paid.set(a, (paid.get(a) || 0) + use);
      });
      // 2) artan para: çığda en pahalıdan, kartopunda en küçük bakiyeden
      const effOf = a => rateInfo(DB, a.card, null, "TRY", cardTotNow[a.card.id]).eff;
      const byRate = (a, b) => (effOf(b) - effOf(a)) || (b.mr - a.mr) || (a.bal - b.bal);
      const order = opts.strategy === "snowball" ? (a, b) => (a.bal - b.bal) || byRate(a, b) : byRate;
      if (!opts.minOnly) acc.filter(a => a.bal > EPS)
        .sort(order)
        .forEach(a => {
          if (bud <= EPS) return;
          const use = Math.min(bud, a.bal); a.bal = round2(a.bal - use); a.int = round2(Math.max(0, a.int - use)); bud -= use; pay += use; paid.set(a, (paid.get(a) || 0) + use);
        });
      const short = minNeed - (pay > minNeed ? minNeed : pay) > 0.5;
      if (short) shortMonths++;
      totalInterest += interestK; totalPaid += pay;
      // sadece-asgari senaryosunda bakiye geometrik azalır; 1 ₺ altı "bitti" sayılır
      if (opts.minOnly) acc.forEach(a => { if (a.bal < 1 && k >= a.lastK) a.bal = 0; });
      acc.forEach(a => { if (a.bal <= EPS && k >= a.lastK) { if (a.paidOff == null) a.paidOff = k; } else a.paidOff = null; });
      const debtEnd = round2(acc.reduce((s2, a) => s2 + a.bal, 0));
      months.push({ k, month: ymAdd(mainBase, k), pay: round2(pay), interest: round2(interestK), minNeed: round2(minNeed), debtEnd, short,
        per: acc.map(a => ({ card: a.card, ccy: a.ccy, paid: round2(paid.get(a) || 0), bal: a.bal })) });
      if (debtEnd <= EPS && k >= lastCharge) { endK = k; break; }
    }
    return {
      months, endK, done: endK != null, endMonth: endK != null ? ymAdd(mainBase, endK) : null,
      totalInterest: round2(totalInterest), totalPaid: round2(totalPaid), shortMonths,
      accounts: acc.map(a => ({ card: a.card, ccy: a.ccy, paidOff: a.paidOff, paidOffMonth: a.paidOff != null ? ymAdd(mainBase, a.paidOff) : null, interest: round2(a.interestSum) }))
    };
  }

  /* asgarileri hiçbir ay aksatmamak için gereken en düşük aylık tutar (ikili arama) */
  function minMonthlyNeeded(DB, today) {
    const ok = m => simulatePayoff(DB, m, today, { maxMonths: 60 }).shortMonths === 0;
    let hi = 1000; while (!ok(hi) && hi < 5e6) hi *= 2;
    if (hi >= 5e6) return null;
    let lo = 0;
    for (let i = 0; i < 30 && hi - lo > 1; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return Math.ceil(hi);
  }

  /* ---------------- ortak harcamalar ---------------- */
  /* bir harcamada "benim payım" (harcamanın kendi para biriminde) */
  function myShare(e) {
    const A = +e.amount || 0;
    const sp = e.split || { mode: "half" };
    switch (sp.mode) {
      case "me": return A;
      case "them": return 0;
      case "pct": return round2(A * (Math.max(0, Math.min(100, +sp.pct || 0)) / 100));
      case "custom": return round2(+sp.mine || 0);
      default: return round2(A / 2);
    }
  }
  /* harcamanın dengeye etkisi (+ = karşı taraf bana borçlanır) */
  function entryImpact(e) {
    const A = +e.amount || 0, mine = myShare(e), theirs = round2(A - mine);
    return e.paidBy === "them" ? -mine : theirs;
  }
  /* kişi bazında, para birimi başına denge: pozitif → o bana borçlu */
  function sharedBalance(DB, personId, filterFn) {
    const bal = { TRY: 0, EUR: 0, USD: 0 };
    DB.shared.entries.filter(e => e.personId === personId && (!filterFn || filterFn(e))).forEach(e => {
      bal[e.ccy] = round2((bal[e.ccy] || 0) + entryImpact(e));
    });
    if (!filterFn) {
      DB.shared.settlements.filter(s => s.personId === personId).forEach(s => {
        // in: o bana ödedi (alacağım azalır) · out: ben ona ödedim
        bal[s.ccy] = round2((bal[s.ccy] || 0) + (s.dir === "in" ? -s.amount : s.amount));
      });
    }
    CCYS.forEach(c => { if (Math.abs(bal[c]) < EPS) bal[c] = 0; });
    return bal;
  }
  function sharedSummary(DB, entries) {
    const tot = { TRY: 0, EUR: 0, USD: 0 }, mine = { TRY: 0, EUR: 0, USD: 0 }, theirs = { TRY: 0, EUR: 0, USD: 0 };
    const paidMe = { TRY: 0, EUR: 0, USD: 0 }, paidThem = { TRY: 0, EUR: 0, USD: 0 };
    const byCat = {};
    let totTL = 0, mineTL = 0, theirsTL = 0;
    entries.forEach(e => {
      const A = +e.amount || 0, m = myShare(e), th = round2(A - m);
      tot[e.ccy] += A; mine[e.ccy] += m; theirs[e.ccy] += th;
      (e.paidBy === "them" ? paidThem : paidMe)[e.ccy] += A;
      const ym = (e.d || "").slice(0, 7) || ymOf(new Date());
      const r = e.ccy === "TRY" ? 1 : (e.rate || rateFor(DB, ym, e.ccy) || 0);
      totTL += A * r; mineTL += m * r; theirsTL += th * r;
      const cat = e.cat || "Diğer";
      byCat[cat] = (byCat[cat] || 0) + A * r;
    });
    const r2 = o => { CCYS.forEach(c => o[c] = round2(o[c])); return o; };
    return { tot: r2(tot), mine: r2(mine), theirs: r2(theirs), paidMe: r2(paidMe), paidThem: r2(paidThem), byCat, totTL: round2(totTL), mineTL: round2(mineTL), theirsTL: round2(theirsTL), count: entries.length };
  }

  /* ---------------- biçimlendirme ---------------- */
  const nf2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  /* her zaman kuruşlu gösterilir (eski "noDec" isteği yok sayılır — kısıtlı bütçede kuruş önemli) */
  function fmt(v, ccy) {
    ccy = ccy || "TRY";
    return CCY_SYM[ccy] + nf2.format(round2(v || 0));
  }
  function fmtPlain(v) { return nf0.format(v || 0); }
  function fmtMulti(obj, opts) {
    const parts = CCYS.filter(c => Math.abs(obj[c] || 0) > EPS).map(c => fmt(Math.abs(obj[c]), c, opts));
    return parts.length ? parts.join(" + ") : fmt(0, "TRY", opts);
  }
  function fmtDate(d, withYear) {
    if (!d) return "";
    if (typeof d === "string") d = parseISO(d);
    return d.getDate() + " " + MONTHS_SHORT[d.getMonth()] + (withYear ? " " + d.getFullYear() : "");
  }

  const API = {
    CCYS, CCY_SYM, CCY_NAME, MONTHS, MONTHS_SHORT, DEFAULT_CATS, EPS,
    seed, normalize, uid, round2, pad, isoDate, parseISO, ymOf, ymAdd, ymDiff, clampDate, dayDiff, startOfDay, monthLabel, calc,
    cardById, groupById, effectiveLimit, minRateInfo, cutDateOf, dueDateOf, nextCutDate, ledger, accountsOf,
    rateFor, toTL, carryCost, accrual, summary, limitUsage, monthlyTotals, instFor, instSum, instDone, installmentLoad, forecast, spendTimeline, simulatePayoff, minMonthlyNeeded, interestReport, cardStmtTL, rateInfo, tierFor, fmtRate, annuity, annuityLeft, nextPeriodMonth, pendingLoad, cardPending, planPayments,
    myShare, entryImpact, sharedBalance, sharedSummary, fmt, fmtPlain, fmtMulti, fmtDate
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.KT = API;
})(typeof window !== "undefined" ? window : globalThis);
