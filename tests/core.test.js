/* Çalıştır: node tests/core.test.js */
const KT = require("../js/core.js");
let pass = 0, fail = 0;
function eq(name, got, exp) {
  const ok = typeof exp === "number" ? Math.abs(got - exp) < 0.01 : JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.log("✗", name, "→ beklenen", exp, "gelen", got); }
}
const today = new Date(2026, 9, 12); // 12 Ekim 2026

function base() {
  const DB = KT.seed();
  DB.cards.push({ id: "c1", name: "Wings", ccys: ["TRY", "EUR"], limit: 350000, cutDay: 8, dueDay: 18, minMode: "auto" });
  DB.cards.push({ id: "c2", name: "Genç", ccys: ["TRY"], limit: 10000, cutDay: 25, dueDay: 5, minMode: "auto" });
  DB.rates["2026-09"] = { EUR: 50, USD: 45 };
  DB.rates["2026-10"] = { EUR: 55, USD: 47 };
  return DB;
}

/* 1) asgari kuralı: 100k ve altı %20, üstü %40 */
{
  const DB = base();
  eq("asgari 350k → %40", KT.minRateInfo(DB, DB.cards[0]).rate, 0.4);
  eq("asgari 10k → %20", KT.minRateInfo(DB, DB.cards[1]).rate, 0.2);
  DB.cards[1].limit = 100000;
  eq("asgari tam 100k → %20", KT.minRateInfo(DB, DB.cards[1]).rate, 0.2);
  DB.cards[1].limit = 100001;
  eq("asgari 100.001 → %40", KT.minRateInfo(DB, DB.cards[1]).rate, 0.4);
  DB.groups.push({ id: "g1", name: "Akbank", limit: 80000 });
  DB.cards[0].groupId = "g1";
  eq("ortak limit 80k → %20", KT.minRateInfo(DB, DB.cards[0]).rate, 0.2);
  DB.cards[0].minMode = "manual"; DB.cards[0].minRate = 30;
  eq("elle %30", KT.minRateInfo(DB, DB.cards[0]).rate, 0.3);
}

/* 2) devir zinciri: borç ikiye katlanmaz */
{
  const DB = base();
  DB.statements.push({ id: "s1", cardId: "c1", ccy: "TRY", month: "2026-08", amount: 20000 });
  DB.statements.push({ id: "s2", cardId: "c1", ccy: "TRY", month: "2026-09", amount: 32000 }); // 12k devir + 20k yeni
  DB.statements.push({ id: "s3", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 30000 });
  DB.payments.push({ id: "p1", cardId: "c1", ccy: "TRY", d: "2026-08-15", a: 8000 });  // Ağu ekstresine
  DB.payments.push({ id: "p2", cardId: "c1", ccy: "TRY", d: "2026-09-18", a: 12000 }); // Eyl ekstresine
  DB.payments.push({ id: "p3", cardId: "c1", ccy: "TRY", d: "2026-10-10", a: 5000 });  // Eki ekstresine (kesim 8 Eki)
  const L = KT.ledger(DB, "c1", "TRY", today);
  eq("Ağu kalan devretti", L.rows[0].status, "carried");
  eq("Ağu devir tutarı", L.rows[0].devirOut, 12000);
  eq("Eyl devirIn", L.rows[1].devirIn, 12000);
  eq("Eyl yeni harcama", L.rows[1].newSpend, 20000);
  eq("Eyl devretti 20k", L.rows[1].devirOut, 20000);
  eq("güncel = Eki", L.current.month, "2026-10");
  eq("güncel borç = 30000-5000", L.debt, 25000);
  eq("Eki asgari %40", L.current.minPay, 12000);
  eq("Eki asgari eksik", L.current.minGap, 7000);
  eq("Eki durum (18 Eki'ye 6 gün)", L.current.status, "due");
  eq("Eki gün", L.current.daysToDue, 6);
  const S = KT.summary(DB, today);
  eq("özet TL borç tek sayılır", S.debt.TRY, 25000);
}

/* 3) son ödeme günü kesimden küçükse ertesi aya düşer */
{
  const DB = base();
  DB.statements.push({ id: "s1", cardId: "c2", ccy: "TRY", month: "2026-09", amount: 3000 });
  const L = KT.ledger(DB, "c2", "TRY", today);
  eq("kesim 25 Eyl", KT.isoDate(L.rows[0].cut), "2026-09-25");
  eq("son ödeme 5 Eki", KT.isoDate(L.rows[0].due), "2026-10-05");
  eq("ödenmemiş + asgari altı → gecikme", L.current.status, "late");
  DB.payments.push({ id: "p", cardId: "c2", ccy: "TRY", d: "2026-10-01", a: 600 });
  const L2 = KT.ledger(DB, "c2", "TRY", today);
  eq("asgari ödenmiş + vade geçmiş → carry", L2.current.status, "carry");
  eq("faiz tahmini: 3000 dönem borcu → %3,25 kademe · 2400 × 3.25% × 1.3", KT.carryCost(DB, L2.current, DB.cards[1]), 101.4);
}

/* 4) kesilmemiş ekstre tahmini sayılır, borca eklenmez */
{
  const DB = base();
  DB.statements.push({ id: "s1", cardId: "c1", ccy: "TRY", month: "2026-11", amount: 9999 });
  const S = KT.summary(DB, today);
  eq("tahmini borç sayılmaz", S.debt.TRY, 0);
  eq("upcoming listede", S.upcoming.length, 1);
}

/* 5) döviz: EUR borcu TL karşılığı */
{
  const DB = base();
  DB.statements.push({ id: "e1", cardId: "c1", ccy: "EUR", month: "2026-10", amount: 100 });
  const S = KT.summary(DB, today);
  eq("EUR borç", S.debt.EUR, 100);
  eq("TL karşılığı 55 kur", S.totalTL, 5500);
  eq("kur devralma (Kasım → Ekim kuru)", KT.rateFor(DB, "2026-11", "EUR"), 55);
  eq("USD kur", KT.rateFor(DB, "2026-10", "USD"), 47);
}

/* 6) ortak harcama dengesi para birimi bazında */
{
  const DB = base();
  DB.shared.people.push({ id: "b", name: "Ayşe" });
  const E = (o) => DB.shared.entries.push(Object.assign({ id: KT.uid("e"), personId: "b", d: "2026-07-10" }, o));
  E({ amount: 100, ccy: "EUR", paidBy: "me", split: { mode: "half" } });            // +50 €
  E({ amount: 1000, ccy: "TRY", paidBy: "me", split: { mode: "them" } });           // +1000 ₺
  E({ amount: 600, ccy: "TRY", paidBy: "them", split: { mode: "half" } });          // -300 ₺
  E({ amount: 40, ccy: "EUR", paidBy: "me", split: { mode: "custom", mine: 30 } }); // +10 €
  E({ amount: -14, ccy: "EUR", paidBy: "me", split: { mode: "me" } });              // iade, 0
  let bal = KT.sharedBalance(DB, "b");
  eq("EUR denge", bal.EUR, 60);
  eq("TRY denge", bal.TRY, 700);
  DB.shared.settlements.push({ id: "x", personId: "b", d: "2026-08-01", ccy: "EUR", amount: 60, dir: "in" });
  bal = KT.sharedBalance(DB, "b");
  eq("EUR kapandı", bal.EUR, 0);
  const sm = KT.sharedSummary(DB, DB.shared.entries);
  eq("toplam EUR", sm.tot.EUR, 126);
}

/* 7) hesap makinesi */
eq("calc 10000-6000", KT.calc("10000-6000"), 4000);
eq("calc 1.250,50+300", KT.calc("1.250,50+300"), 1550.5);
eq("calc 12.500", KT.calc("12.500"), 12500);
eq("calc 15000/6", KT.calc("15000/6"), 2500);
eq("calc harf reddi", isNaN(KT.calc("alert(1)")), true);

/* 8) planlayıcı: önce gecikmiş asgari */
{
  const DB = base();
  DB.statements.push({ id: "s1", cardId: "c2", ccy: "TRY", month: "2026-09", amount: 3000 });  // gecikmede, asgari 600
  DB.statements.push({ id: "s2", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 10000 }); // asgari 4000
  const P = KT.planPayments(DB, 1000, today);
  eq("ilk para gecikmiş asgariye", P.lines.find(l => l.item.card.id === "c2").amount, 600);
  eq("kalan 400 diğer asgariye", P.lines.find(l => l.item.card.id === "c1").amount, 400);
}

/* 9) "sadece yeni harcama" tabanlı ekstreler (Excel alışkanlığı) — devir dinamik eklenir */
{
  const DB = base();
  const S = (id, m, a) => DB.statements.push({ id, cardId: "c1", ccy: "TRY", month: m, amount: a, basis: "new" });
  S("n7", "2026-07", 205871.3); S("n8", "2026-08", 67241.53); S("n9", "2026-09", 6724.57); S("n10", "2026-10", 4862.48); S("n11", "2026-11", 4445.82);
  DB.payments.push({ id: "p7", cardId: "c1", ccy: "TRY", d: "2026-07-18", a: 93116.13 });
  const L = KT.ledger(DB, "c1", "TRY", today);
  eq("Ağu dönem borcu = yeni + Temmuz kalanı", L.rows[1].amount, 67241.53 + 112755.17);
  eq("güncel borç = Excel'deki toplam kalan (Oca-Eki)", L.debt, 112755.17 + 67241.53 + 6724.57 + 4862.48);
  eq("Kasım tahmini, yeni kısım", L.futures[0].fresh, 4445.82);
  const Sm = KT.summary(DB, today);
  eq("özet: kasım yalnız yeni kısmıyla", Sm.upcoming[0].row.fresh, 4445.82);
  // Temmuz'a geç ödeme (Ağustos kesiminden önce) gelirse devir otomatik düşer
  DB.payments.push({ id: "p7b", cardId: "c1", ccy: "TRY", d: "2026-08-05", a: 12755.17 });
  eq("geç ödeme devri düşürür", KT.ledger(DB, "c1", "TRY", today).rows[1].devirIn, 100000);
  const mt = KT.monthlyTotals(DB, ["2026-08", "2026-09"], today);
  eq("trend yeni harcama", mt[0].total, 67241.53);
}

/* 10) dönem içi tahmin + taksit + gelecek aylar */
{
  const DB = base();
  DB.statements.push({ id: "s10", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 10000 });
  DB.installments.push({ id: "i1", cardId: "c1", ccy: "TRY", desc: "Laptop", per: 2000, count: 3, start: "2026-11" });
  // Kasım dönemi: bankadaki dönem içi harcama 3.500 (taksit hariç) → tahmini yeni = 5.500
  DB.statements.push({ id: "e11", cardId: "c1", ccy: "TRY", month: "2026-11", amount: 3500, basis: "new", estimate: true });
  let L = KT.ledger(DB, "c1", "TRY", today);
  eq("tahmin + taksit", L.futures[0].fresh, 5500);
  eq("ödenmezse kasım dönem borcu = 10000 + 5500", L.futures[0].amount, 15500);
  eq("güncel borç değişmez", L.debt, 10000);
  DB.statements.find(s => s.id === "e11").instIncl = true;  // tutar taksiti zaten içeriyor
  L = KT.ledger(DB, "c1", "TRY", today);
  eq("taksit dahilse eklenmez", L.futures[0].fresh, 3500);
  delete DB.statements.find(s => s.id === "e11").instIncl;
  const F = KT.forecast(DB, 5, today);
  eq("ilk tahmin ayı Ekim (c2 kesimi 25 Eki henüz gelmedi)", F[0].month, "2026-10");
  const nov = F.find(m => m.month === "2026-11");
  eq("Kasım: c1 tahmin", nov.items.find(i => i.card.id === "c1").amount, 5500);
  const dec = F.find(m => m.month === "2026-12");
  eq("Aralık: sadece taksit", dec.items.find(i => i.card.id === "c1").amount, 2000);
  eq("Aralık kaynak taksit", dec.items.find(i => i.card.id === "c1").source, "inst");
  eq("Ocak: son taksit", F.find(m => m.month === "2027-01").items[0].amount, 2000);
  eq("Şubat: taksit bitti", (F.find(m => m.month === "2027-02") || { items: [] }).items.length, 0);
  // kesim geçince tahmin güncel ekstre olur, taksit dahil kalır
  const L2 = KT.ledger(DB, "c1", "TRY", new Date(2026, 10, 10));
  eq("kesilen tahmin güncel", L2.current.month, "2026-11");
  eq("kesilen tahmin = devir + yeni + taksit", L2.debt, 15500);
}

/* 11) limit: borç + dönem içi + kalan taksitlerin tamamı */
{
  const DB = base();
  DB.cards[0].limit = 100000;
  DB.statements.push({ id: "a", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 20000 });            // güncel borç
  DB.payments.push({ id: "pp", cardId: "c1", ccy: "TRY", d: "2026-10-10", a: 5000 });                    // → 15.000
  DB.installments.push({ id: "t", cardId: "c1", ccy: "TRY", desc: "TV", per: 3000, count: 6, start: "2026-10" }); // Eki ekstrede, Kas–Mar kalan 5×3000
  DB.statements.push({ id: "d", cardId: "c1", ccy: "TRY", month: "2026-11", amount: 4000, basis: "new", estimate: true }); // dönem içi (taksit hariç)
  const P = KT.pendingLoad(DB, DB.cards[0], "TRY", today);
  eq("dönem içi", P.period, 4000);
  eq("kalan taksit (Kas–Mar)", P.inst, 15000);
  const U = KT.limitUsage(DB, today).find(x => x.id === "c1");
  eq("kullanılan limit", U.used, 15000 + 4000 + 15000);
  eq("kullanılabilir", U.avail, 100000 - 34000);
  DB.statements.find(s => s.id === "d").instIncl = true;  // tutar bu ayın taksitini içeriyor
  eq("taksit dahilse çift sayılmaz", KT.pendingLoad(DB, DB.cards[0], "TRY", today).total, 4000 + 12000);
}

/* 12) fazla ödeme → alacak bakiye, sonraki ekstreden düşer */
{
  const DB = base();
  DB.cards[0].limit = 100000;
  DB.statements.push({ id: "o", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 10000 });
  DB.payments.push({ id: "p", cardId: "c1", ccy: "TRY", d: "2026-10-11", a: 25000 });   // 15.000 fazla
  let L = KT.ledger(DB, "c1", "TRY", today);
  eq("borç 0", L.debt, 0); eq("alacak 15.000", L.credit, 15000);
  eq("durum etiketi", L.current.label, "Fazla ödendi · alacak");
  DB.statements.push({ id: "n", cardId: "c1", ccy: "TRY", month: "2026-11", amount: 6000, basis: "new", estimate: true }); // dönem içi
  L = KT.ledger(DB, "c1", "TRY", today);
  eq("kasım: 6000 - 15000 alacak", L.futures[0].amount, -9000);
  const U = KT.limitUsage(DB, today)[0];
  eq("alacak limiti açar", U.used, -15000 + 6000);
  // kasım kesilince borç yok, alacak 9.000 kalır
  const L2 = KT.ledger(DB, "c1", "TRY", new Date(2026, 10, 10));
  eq("kasım sonrası alacak", L2.credit, 9000);
  eq("ekim satırı devretti etiketi", L2.rows[0].label, "Fazla ödendi → Kasım");
}

/* 13) taksit erken kapatma: kalanlar tek ekstreye */
{
  const DB = base();
  DB.installments.push({ id: "t", cardId: "c1", ccy: "TRY", desc: "Telefon", per: 5000, count: 6, start: "2026-10", pullAt: "2026-11" });
  eq("ekim normal", KT.instSum(DB, "c1", "TRY", "2026-10"), 5000);
  eq("kasımda kalan 5 taksit", KT.instSum(DB, "c1", "TRY", "2026-11"), 25000);
  eq("aralık boş", KT.instSum(DB, "c1", "TRY", "2026-12"), 0);
  eq("bitti sayılır", KT.instDone(DB.installments[0], "2026-11"), 6);
  eq("limit: kalan 25.000", KT.pendingLoad(DB, DB.cards[0], "TRY", today).inst, 25000);
}

/* 14) ileri bir ay için bankadaki tutar taksit listesinin yerine geçer */
{
  const DB = base();
  DB.installments.push({ id: "t", cardId: "c1", ccy: "TRY", desc: "TV", per: 3000, count: 4, start: "2026-11" });
  DB.statements.push({ id: "dec", cardId: "c1", ccy: "TRY", month: "2026-12", amount: 4200, basis: "new", estimate: true, instIncl: true });
  const F = KT.forecast(DB, 6, today);
  eq("aralık: girilen tutar", F.find(m => m.month === "2026-12").items[0].amount, 4200);
  eq("kasım: listedeki taksit", F.find(m => m.month === "2026-11").items[0].amount, 3000);
  const P = KT.pendingLoad(DB, DB.cards[0], "TRY", today);
  eq("limit: kas 3000 + ara 4200 + oca 3000 + şub 3000", P.total, 13200);
}

/* 15) döviz borcu ortak limitten kurla düşer; kur yoksa eksik olarak raporlanır */
{
  const DB = base();
  DB.groups.push({ id: "g", name: "Akbank", limit: 350000 });
  DB.cards[0].groupId = "g"; DB.cards[0].ccys = ["TRY", "USD"];
  DB.statements.push({ id: "u", cardId: "c1", ccy: "USD", month: "2026-10", amount: 890.29 });
  let U = KT.limitUsage(DB, today).find(x => x.id === "g");
  eq("USD kurla düşer", U.used, KT.round2(890.29 * 47));
  eq("fx dökümü", U.fx[0].tl, KT.round2(890.29 * 47));
  delete DB.rates["2026-09"].USD; delete DB.rates["2026-10"].USD;
  U = KT.limitUsage(DB, today).find(x => x.id === "g");
  eq("kur yoksa eksik listesinde", U.missing[0].amount, 890.29);
  eq("kur yoksa kullanılan 0 (uyarıyla)", U.used, 0);
}

/* 16) bekleyen işlemler: limitten düşer, ekstreye girmez; eski provTL göç eder */
{
  const DB = base();
  DB.cards[0].limit = 100000;
  DB.pending.push({ id: "w1", cardId: "c1", amountTL: 6000, ccy: "USD", note: "Amazon", d: "2026-10-12" });
  eq("kart bekleyen", KT.cardPending(DB, "c1").total, 6000);
  const U = KT.limitUsage(DB, today)[0];
  eq("limitten düşer", U.used, 6000); eq("bekleyen payı", U.prov, 6000);
  eq("ekstreye girmez", KT.ledger(DB, "c1", "TRY", today).debt, 0);
  const old = { v: 2, cards: [{ id: "x", name: "W", ccys: ["TRY", "USD"] }], statements: [{ id: "s", cardId: "x", ccy: "TRY", month: "2026-11", amount: 4340, basis: "new", estimate: true, provTL: 2475, updated: "2026-10-10" }] };
  const N = KT.normalize(old);
  eq("göç: bekleyen oluştu", N.pending[0].amountTL, 2475);
  eq("göç: para birimi USD", N.pending[0].ccy, "USD");
  eq("göç: TL dönem içi düştü", N.statements[0].amount, 1865);
}

/* 17) bekleyen, kartın bu dönemi olarak gelecek aylar görünümünde */
{
  const DB = base();
  DB.pending.push({ id: "w", cardId: "c1", amountTL: 6000, ccy: "USD", d: "2026-10-12" });
  const nov = KT.forecast(DB, 3, today).find(m => m.month === "2026-11");
  eq("kasımda bekleyen", nov.items.find(i => i.source === "pending").amount, 6000);
  eq("kasım toplamı", nov.tl, 6000);
}

/* 18) aylık harcama zaman çizelgesi: kesilen + bu dönem + gelecek, boş geçmiş yok */
{
  const fs = require("fs"), fx = require("path").join(__dirname, "fixture_hasan.json");
  if (fs.existsSync(fx)) {   // kişisel veri: depoda/paylaşımda yok, sadece yerelde
  const DB = KT.normalize(JSON.parse(fs.readFileSync(fx, "utf8")));
  const TL = KT.spendTimeline(DB, today);
  eq("ilk ay ekim", TL[0].month, "2026-10");
  eq("son ay mart", TL[TL.length - 1].month, "2027-03");
  eq("ekim kesildi, ilk ekstre", [TL[0].period + TL[0].future, TL[0].initial], [0, true]);
  const nov = TL.find(x => x.month === "2026-11");
  const fnov = KT.forecast(DB, 12, today).find(m => m.month === "2026-11");
  eq("kasım = bu dönem = gelecek aylar kutusu", nov.period, fnov.tl);
  eq("kasımda gelecek yok", nov.future, 0);
  const dec = TL.find(x => x.month === "2026-12");
  eq("aralık gelecek", [dec.period, dec.future], [0, 9316.09]);
  }
  eq("boş DB → boş", KT.spendTimeline(base(), today).length, 0);
}

/* 19) TCMB faiz kademeleri (dönem borcuna göre) */
{
  const DB = base();
  const r = v => KT.tierFor(DB, v).tier.akt;
  eq("29.999,99 → %3,25", r(29999.99), 3.25); eq("30.000 → %3,75", r(30000), 3.75);
  eq("180.000 → %3,75", r(180000), 3.75); eq("180.000,01 → %4,25", r(180000.01), 4.25);
  DB.statements.push({ id: "s", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 61162.18 });
  const L = KT.ledger(DB, "c1", "TRY", new Date(2026, 9, 20));
  const ri = KT.rateInfo(DB, DB.cards[0], L.current, "TRY");
  eq("61k ekstre → %3,75, vergili %4,875", [ri.akt, Math.round(ri.eff * 1000) / 1000], [3.75, 4.875]);
  DB.cards[0].rateMode = "manual"; DB.cards[0].aktRate = 2.99;
  eq("elle oran", KT.rateInfo(DB, DB.cards[0], L.current, "TRY").akt, 2.99);
  eq("anüite 20.347,02 · %4,875 · 3", KT.annuity(20347.02, 0.04875, 3), 7454.11);
}

/* 20) ekstre taksitlendirme: kalan borç taksite döner, asgari tamamlanır, borç iki kez sayılmaz */
{
  const DB = base();
  DB.statements.push({ id: "w", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 37421.7, minPay: 14968.68 });
  DB.payments.push({ id: "p", cardId: "c1", ccy: "TRY", d: "2026-10-12", a: 4968.68 });
  DB.payments.push({ id: "p2", cardId: "c1", ccy: "TRY", d: "2026-10-12", a: 2106 });
  let L = KT.ledger(DB, "c1", "TRY", today);
  eq("önce: kalan 30.347,02", L.debt, 30347.02);
  DB.payments.push({ id: "p3", cardId: "c1", ccy: "TRY", d: "2026-10-16", a: 10000 });
  DB.installments.push({ id: "ti", kind: "stmt", stId: "w", principal: 20347.02, cardId: "c1", ccy: "TRY", desc: "Ekim ekstresi", per: 7454.11, count: 3, start: "2026-11" });
  L = KT.ledger(DB, "c1", "TRY", today);
  eq("sonra: güncel borç 0", L.debt, 0);
  eq("etiket", L.current.label, "Taksitlendirildi");
  const nov = KT.forecast(DB, 3, today).find(m => m.month === "2026-11");
  eq("Kasım'a taksit gelir", nov.items.find(i => i.card.id === "c1" && i.ccy === "TRY").amount, 7454.11);
  const U = KT.limitUsage(DB, today).find(x => x.id === "c1");
  eq("limitte kalan taksitler", U.inst, 22362.33);
  DB.installments[0].pullAt = "2026-12"; DB.installments[0].pullAmount = 7100;
  eq("erken kapama tutarı", KT.instSum(DB, "c1", "TRY", "2026-12"), 7100);
}

/* 21) dağıtım: asgariler sonrası en pahalı borç (avalanche), eşitlikte asgari oranı yüksek kart */
{
  const DB = base();
  DB.cards.push({ id: "c3", name: "QNB", ccys: ["TRY"], limit: 100000, cutDay: 8, dueDay: 18, minMode: "auto" });
  DB.statements.push({ id: "a", cardId: "c2", ccy: "TRY", month: "2026-09", amount: 4000 });   // küçük, %3,25
  DB.statements.push({ id: "b", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 35000 });  // %3,75, asgari %40
  DB.statements.push({ id: "q", cardId: "c3", ccy: "TRY", month: "2026-10", amount: 61000 });  // %3,75, asgari %20
  DB.payments.push({ id: "x1", cardId: "c2", ccy: "TRY", d: "2026-10-01", a: 1000 });
  DB.payments.push({ id: "x2", cardId: "c1", ccy: "TRY", d: "2026-10-12", a: 15000 });
  DB.payments.push({ id: "x3", cardId: "c3", ccy: "TRY", d: "2026-10-12", a: 21000 });
  const P = KT.planPayments(DB, 5000, today);
  eq("tek satır", P.lines.length, 1);
  eq("küçük borca değil, %4,875 + asgari %40 karta", P.lines[0].item.card.id, "c1");
  eq("aylık faiz tasarrufu", P.saving, 243.75);
}

/* 22) borç bitiş simülasyonu */
{
  const DB = base();
  DB.statements.push({ id: "a", cardId: "c2", ccy: "TRY", month: "2026-09", amount: 10000 });
  DB.payments.push({ id: "x", cardId: "c2", ccy: "TRY", d: "2026-10-01", a: 2000 });     // asgari ödendi, 8000 kalan
  const R = KT.simulatePayoff(DB, 100000, today);
  eq("hepsi şimdi biter, faiz yok", [R.endK, R.totalInterest], [0, 0]);
  const R2 = KT.simulatePayoff(DB, 3000, today);
  eq("3000/ay ile biter", R2.done, true);
  eq("toplam ödeme = borç + faiz", R2.totalPaid, 8000 + R2.totalInterest);
  eq("ilk ay faizi 8000-3000=5000 × %3,25 × 1,3", R2.months[1].interest, 211.25);
  const M = KT.simulatePayoff(DB, 0, today, { minOnly: true });
  eq("sadece asgari daha uzun sürer", M.endK > R2.endK, true);
  eq("yetmeyen tutar işaretlenir", KT.simulatePayoff(DB, 100, today).shortMonths > 0, true);
  const need = KT.minMonthlyNeeded(DB, today);
  eq("asgari için gereken tutarla eksik ay yok", KT.simulatePayoff(DB, need, today).shortMonths, 0);
}

/* 23) kademe kartın TL + döviz ekstre TOPLAMINA göre (Akbank: "TL ve döviz ekstre borcunuzun toplam tutarı") */
{
  const DB = base();
  DB.rates["2026-11"] = { EUR: 55, USD: 50 };
  DB.cards[0].ccys = ["TRY", "USD"];
  DB.statements.push({ id: "t", cardId: "c1", ccy: "TRY", month: "2026-11", amount: 18000 });
  DB.statements.push({ id: "u", cardId: "c1", ccy: "USD", month: "2026-11", amount: 461.67 });
  const L = KT.ledger(DB, "c1", "TRY", new Date(2026, 10, 20));
  const ri = KT.rateInfo(DB, DB.cards[0], L.current, "TRY");
  eq("TL 18.000 tek başına %3,25 olurdu; toplam 41.083,50 → %3,75", [ri.akt, ri.base], [3.75, 41083.5]);
  const Lu = KT.ledger(DB, "c1", "USD", new Date(2026, 10, 20));
  eq("dolar hesabına da aynı oran", KT.rateInfo(DB, DB.cards[0], Lu.current, "USD").akt, 3.75);
  eq("yıllık basit %45", ri.yearly, 45);
}

/* 24) iade: kalanı düşürür, asgariyi karşılamaz (Wings Master örneği) */
{
  const DB = base();
  DB.statements.push({ id: "w", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 37421.7, minPay: 14968.68 });
  DB.payments.push({ id: "p", cardId: "c1", ccy: "TRY", d: "2026-10-12", a: 4968.68 });
  DB.payments.push({ id: "r", cardId: "c1", ccy: "TRY", d: "2026-10-11", a: 2106, kind: "refund" });
  const L = KT.ledger(DB, "c1", "TRY", today);
  eq("kalan bankayla aynı", L.debt, 30347.02);
  eq("asgari eksik bankayla aynı", L.current.minGap, 10000);
  eq("ödenen / iade ayrı", [L.current.paid, L.current.refund], [4968.68, 2106]);
}

/* 25) faiz sayacı: bankadan girilen faiz > tahmin; ekstre taksiti faiz payı */
{
  const DB = base();
  DB.statements.push({ id: "a", cardId: "c1", ccy: "TRY", month: "2026-08", amount: 40000 });
  DB.statements.push({ id: "b", cardId: "c1", ccy: "TRY", month: "2026-09", amount: 30000 });
  DB.statements.push({ id: "c", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 25000, interest: 1234.56 });
  DB.payments.push({ id: "p1", cardId: "c1", ccy: "TRY", d: "2026-08-15", a: 20000 });
  DB.payments.push({ id: "p2", cardId: "c1", ccy: "TRY", d: "2026-09-15", a: 12000 });
  const IR = KT.interestReport(DB, 2026, today);
  eq("Eylül'e gelen faiz: Ağustos'ta son ödemede kalan 20.000 × %3,75/30 × 31 gün (8 Ağu kesim → 8 Eyl kesim) × 1,3", IR.perRow.b.est, 1007.5);
  eq("Ekim bankadan", IR.perRow.c.bank, 1234.56);
  eq("yıl toplamı", IR.total, 1007.5 + 1234.56);
  DB.installments.push({ id: "x", kind: "stmt", stId: "c", principal: 9000, per: 3200, count: 3, start: "2026-09", cardId: "c1", ccy: "TRY" });
  eq("taksit faizi (Eyl+Eki billed) 2 × 200", KT.interestReport(DB, 2026, today).inst, 400);
}

/* 26) bitiş planı: alacak gelirse daha erken biter */
{
  const DB = base();
  DB.statements.push({ id: "a", cardId: "c2", ccy: "TRY", month: "2026-09", amount: 10000 });
  DB.payments.push({ id: "x", cardId: "c2", ccy: "TRY", d: "2026-10-01", a: 2000 });
  const R = KT.simulatePayoff(DB, 1500, today), R2 = KT.simulatePayoff(DB, 1500, today, { extra: { 1: 5000 } });
  eq("alacakla daha erken", R2.endK < R.endK, true);
  eq("alacakla daha az faiz", R2.totalInterest < R.totalInterest, true);
}

/* 26b) bitiş planı stratejisi: kartopu küçük borcu önce kapatır, çığ daha az faiz öder */
{
  const DB = base();
  DB.statements.push({ id: "s", cardId: "c2", ccy: "TRY", month: "2026-10", amount: 4000 });    // küçük, %3,25
  DB.statements.push({ id: "b", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 40000 });   // büyük, %3,75
  const A = KT.simulatePayoff(DB, 6000, today), S = KT.simulatePayoff(DB, 6000, today, { strategy: "snowball" });
  const off = (R, id) => R.accounts.find(a => a.card.id === id).paidOff;
  eq("varsayılan çığ ile aynı", A.totalInterest, KT.simulatePayoff(DB, 6000, today, { strategy: "avalanche" }).totalInterest);
  eq("kartopu küçük borcu çığdan önce kapatır", off(S, "c2") < off(A, "c2"), true);
  eq("çığ faizi kartopundan fazla değil", A.totalInterest <= S.totalInterest, true);
  eq("ikisi de biter", [A.done, S.done], [true, true]);
}

/* 27) döviz borcu TL'ye çevrildi: dolar kalanı düşer, TL borcu artar, asgari değişmez, faiz TL'ye geçer */
{
  const DB = base();
  DB.cards[0].ccys = ["TRY", "USD"];
  DB.statements.push({ id: "t", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 31436.09 });
  DB.statements.push({ id: "u", cardId: "c1", ccy: "USD", month: "2026-10", amount: 890.29 });
  DB.payments.push({ id: "p1", cardId: "c1", ccy: "TRY", d: "2026-10-15", a: 30436.09 });
  DB.payments.push({ id: "p2", cardId: "c1", ccy: "USD", d: "2026-10-15", a: 490.29 });
  const day = new Date(2026, 9, 20);
  DB.payments.push({ id: "c1o", cardId: "c1", ccy: "USD", d: "2026-10-19", a: 400, kind: "convOut", convId: "v", rate: 50.12, tl: 20048 });
  DB.payments.push({ id: "c1i", cardId: "c1", ccy: "TRY", d: "2026-10-19", a: 20048, kind: "convIn", convId: "v", rate: 50.12, from: "USD", fromAmt: 400 });
  const Lu = KT.ledger(DB, "c1", "USD", day), Lt = KT.ledger(DB, "c1", "TRY", day);
  eq("dolar kalanı 0", Lu.debt, 0);
  eq("etiket", Lu.current.label, "TL'ye çevrildi");
  eq("TL borcu 1.000 + 20.048", Lt.debt, 21048);
  eq("TL asgari eksik değişmedi", Lt.current.minGap, 0);
  eq("faiz TL tarafında: 21.048 × %3,75 × 1,3", KT.carryCost(DB, Lt.current, DB.cards[0]), 1026.09);
  DB.statements.push({ id: "n", cardId: "c1", ccy: "TRY", month: "2026-11", amount: 500, basis: "new" });
  eq("Kasım devri çevrilen tutarı içerir", KT.ledger(DB, "c1", "TRY", day).rows[1].devirIn, 21048);
}

/* 28) gün gün faiz: geç kapatılan ekstre, kısmi ödeme, gecikme faizi */
{
  const DB = base();
  DB.statements.push({ id: "v", cardId: "c1", ccy: "TRY", month: "2026-10", amount: 31436.09 });
  DB.payments.push({ id: "p1", cardId: "c1", ccy: "TRY", d: "2026-10-15", a: 30436.09 });
  DB.payments.push({ id: "p2", cardId: "c1", ccy: "TRY", d: "2026-10-20", a: 1000 });   // son ödeme 18 Eki, 2 gün geç kapandı
  const day = new Date(2026, 9, 20);
  let L = KT.ledger(DB, "c1", "TRY", day);
  let A = KT.accrual(DB, DB.cards[0], L, 0, day);
  eq("geç kapandı: 1.000 × %3,75/30 × (10 gün kesim→son ödeme + 2 gün) × 1,3", A.full, 19.5);
  eq("kapandı, gecikme 2 gün", [A.closedLate, A.lateDays], [true, 2]);
  const nov = KT.forecast(DB, 3, day).find(m => m.month === "2026-11");
  eq("Kasım'a faiz satırı", nov.items.find(i => i.source === "interest").amount, 19.5);
  eq("harcama grafiğine faiz girmez", KT.spendTimeline(DB, day).find(x => x.month === "2026-11"), undefined);
  // tamamı son ödemeye kadar ödenirse faiz yok
  DB.payments.find(p => p.id === "p2").d = "2026-10-18";
  L = KT.ledger(DB, "c1", "TRY", day);
  eq("zamanında tam ödeme → faiz yok", KT.accrual(DB, DB.cards[0], L, 0, day).full, 0);
  // asgarinin altı: gecikme faizi
  DB.payments = [{ id: "q", cardId: "c1", ccy: "TRY", d: "2026-10-15", a: 10000 }];   // asgari 12.574,44
  L = KT.ledger(DB, "c1", "TRY", day);
  A = KT.accrual(DB, DB.cards[0], L, 0, day);
  const exp = (21436.09 * 3.75 / 100 / 30 * 10 + (2574.44 * 4.05 + (21436.09 - 2574.44) * 3.75) / 100 / 30 * 21) * 1.3;
  eq("kısmi + asgari altı: kesime kadar", A.full, Math.round(exp * 100) / 100);
  eq("bugüne kadar (2 gün)", A.sofar, Math.round((21436.09 * 3.75 / 100 / 30 * 10 + (2574.44 * 4.05 + (21436.09 - 2574.44) * 3.75) / 100 / 30 * 2) * 1.3 * 100) / 100);
}

console.log(`\n${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);
