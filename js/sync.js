/* =====================================================================
   Kart Kokpiti — cihazlar arası senkron (Firebase Auth + Firestore)
   Tam otomatik, iki yönlü: giriş yapınca hemen açılır, ekstra adım yok.
   Bu cihazdaki değişiklik birkaç saniyede buluta gider, başka cihazdaki
   değişiklik de otomatik (anlık) burada görünür — hiçbir onay istenmez.
   Aynı anda iki cihazda değişiklik yapılırsa son yazan kazanır (tek kullanıcı
   için kabul edilebilir risk — Petek/Planner'daki gibi).

   Veri Firestore'da düz JSON olarak durur (Petek/Planner ile aynı yaklaşım,
   ekstra şifreleme adımı yok). Güvenliği sağlayan Firestore güvenlik kuralları:
   yalnızca sahibinin hesabı (uid) okuyup yazabilir, bkz. firebase/firestore.rules.
   app.js (kabuk) önce yüklenir; bu dosya en son yüklenir (App.commit / App.closeModal tanımlı olmalı).
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { esc, toast, val, $, $$ } = I;

  const CFG = window.KK_FIREBASE;
  const META_KEY = "kartTakip_syncMeta";   // şifresiz: yalnızca { lastSyncAt, lastDir } — zarar vermez
  const DEVICE_KEY = "kartTakip_deviceId"; // şifresiz, rastgele — yalnızca "bu değişiklik hangi cihazdan geldi" ayrımı için
  const SKIP_KEY = "kartTakip_syncSkip";   // kullanıcı açılış ekranında "giriş yapmadan devam et" dediyse bir daha sorma

  let auth = null, db = null, status = "idle", lastError = null;
  let pushTimer = null, unsub = null, pendingRemote = null, applyingRemote = false, gateActive = false;

  const ready = () => !!(CFG && CFG.apiKey && window.firebase);

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) { id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(DEVICE_KEY, id); }
      return id;
    } catch (e) { return "d" + Math.random().toString(36).slice(2, 8); }
  }

  /* ---------------- Firebase başlat ---------------- */
  function init() {
    if (!ready() || auth) return;
    try {
      firebase.initializeApp(CFG);
      auth = firebase.auth();
      db = firebase.firestore();
      let firstCheck = true;
      auth.onAuthStateChanged(async user => {
        if (user) {
          startListening();
          try { const snap = await docRef().get(); if (!snap.exists) await pushNow(); } catch (e) { /* dinleyici zaten deneyecek */ }
        } else {
          stopListening();
          if (firstCheck && !skipped()) showGate();   // yalnızca sayfa ilk açıldığında ve daha önce "yerel kullan" denmediyse
        }
        firstCheck = false;
        if (App.DB) App.render();
      });
    } catch (e) { lastError = e.message; }
  }

  /* ---------------- durum (zaman damgası) ---------------- */
  function loadMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch (e) { return {}; } }
  function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* yoksay */ } }
  function docRef() { return db.collection("kartkokpiti").doc("veri"); }

  function friendlyErr(e) {
    const code = (e && e.code) || "";
    const map = {
      "auth/wrong-password": "şifre yanlış", "auth/invalid-credential": "e-posta ya da şifre yanlış",
      "auth/invalid-email": "e-posta geçersiz", "auth/user-not-found": "böyle bir hesap yok",
      "auth/network-request-failed": "internet bağlantısı yok", "auth/too-many-requests": "çok fazla deneme — biraz bekle",
    };
    return map[code] || (e && e.message) || "bilinmeyen hata";
  }

  /* ---------------- giriş / çıkış ---------------- */
  async function login(email, pass) { init(); await auth.signInWithEmailAndPassword(email, pass); }
  async function logout() { stopListening(); await auth.signOut(); }
  function skipped() { try { return localStorage.getItem(SKIP_KEY) === "1"; } catch (e) { return false; } }
  function markSkip() { try { localStorage.setItem(SKIP_KEY, "1"); } catch (e) { /* yoksay */ } }

  /* ---------------- açılış ekranı: sayfa yüklenince bir kez sorar ---------------- */
  function showGate() {
    gateActive = true;
    App.modal(`
      ${App.mh("Senkron", "Cihazlar arası senkron için giriş yap")}
      <div class="row2">
        <div><label class="lbl" style="margin-top:0">E-posta</label><input type="text" id="agEmail" autocomplete="username" autofocus></div>
        <div><label class="lbl" style="margin-top:0">Şifre</label><input type="password" id="agPass" autocomplete="current-password"></div>
      </div>
      <div class="btnrow"><button class="btn" id="agLogin">Giriş yap</button><button class="btn ghost" data-close>Bu cihazda yalnızca yerel kullan</button></div>
      <div class="note" style="margin-top:10px">Hesabı Firebase konsolundan sen oluşturdun. Giriş yapmazsan uygulama eskisi gibi yalnızca bu tarayıcıda
        çalışır; istersen sonra Ayarlar'dan giriş yaparsın.</div>`);
    $("#agLogin").onclick = async () => {
      const email = val("agEmail").trim(), pass = val("agPass");
      if (!email || !pass) return toast("E-posta ve şifre gir");
      try { await login(email, pass); gateActive = false; App.closeModal(); toast("Giriş yapıldı, senkron açıldı"); }
      catch (e) { toast("Giriş başarısız: " + friendlyErr(e)); }
    };
  }

  /* ---------------- gönder ---------------- */
  async function pushNow() {
    if (!(auth && auth.currentUser)) return;
    status = "syncing"; lastError = null;
    try {
      const data = JSON.stringify(App.DB);
      await docRef().set({ data, writerId: deviceId(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      saveMeta({ lastSyncAt: Date.now(), lastDir: "push" });
    } catch (e) { lastError = friendlyErr(e); }
    status = "idle"; App.render();
  }

  /* değişiklikten birkaç saniye sonra sessizce buluta gönder (buluttan az önce gelen bir güncellemeyi geri yollama) */
  const origCommit = App.commit;
  App.commit = function (...args) {
    const r = origCommit.apply(App, args);
    if (!applyingRemote && auth && auth.currentUser) { clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 2500); }
    return r;
  };

  /* ---------------- al: gerçek zamanlı dinleyici ---------------- */
  function startListening() {
    stopListening();
    unsub = docRef().onSnapshot(snap => {
      if (!snap.exists || snap.metadata.hasPendingWrites) return;   // henüz veri yok ya da bu kendi yazdığımız (sunucuya ulaşmadı)
      const d = snap.data(), cloudMs = d.updatedAt ? d.updatedAt.toMillis() : Date.now();
      if (d.writerId === deviceId()) { saveMeta({ lastSyncAt: cloudMs, lastDir: "push" }); return; }   // kendi yazdığımız, sunucudan geri geldi
      const meta = loadMeta();
      if (cloudMs <= (meta.lastSyncAt || 0)) return;   // zaten biliyoruz / eski
      try {
        const obj = JSON.parse(d.data);
        saveMeta({ lastSyncAt: cloudMs, lastDir: "pull" });
        applyRemote(obj);
      } catch (e) { lastError = friendlyErr(e); App.render(); }
    }, e => { lastError = friendlyErr(e); App.render(); });
  }
  function stopListening() { if (unsub) { unsub(); unsub = null; } }

  /* bir pencere/form açıkken DB'nin aniden değişip yazdığını silmesin diye pencere kapanana kadar beklet */
  function applyRemote(obj) {
    if ($("#modalBg").classList.contains("open")) { pendingRemote = obj; toast("Diğer cihazdan güncelleme geldi — pencere kapanınca uygulanacak"); return; }
    applyingRemote = true; App.replaceDB(obj, "Diğer cihazdan senkronize edildi"); applyingRemote = false;
  }
  const origCloseModal = App.closeModal;
  App.closeModal = function (...args) {
    const r = origCloseModal.apply(App, args);
    if (gateActive) { gateActive = false; markSkip(); }   // açılış ekranı X/Esc/"yerel kullan" ile kapandı — giriş yapılmadıysa bir daha sorma
    if (pendingRemote) { const obj = pendingRemote; pendingRemote = null; applyingRemote = true; App.replaceDB(obj, "Diğer cihazdan senkronize edildi"); applyingRemote = false; }
    return r;
  };

  /* manuel "şimdi kontrol et" — otomasyon zaten çalışıyor, internet kesintisi sonrası zorlamak için */
  async function syncNow() {
    if (!(auth && auth.currentUser)) return;
    status = "syncing"; App.render();
    try {
      const snap = await docRef().get();
      if (!snap.exists) { await pushNow(); toast("Buluta yüklendi"); status = "idle"; App.render(); return; }
      const d = snap.data(), cloudMs = d.updatedAt ? d.updatedAt.toMillis() : 0, meta = loadMeta();
      if (d.writerId !== deviceId() && cloudMs > (meta.lastSyncAt || 0)) {
        const obj = JSON.parse(d.data); saveMeta({ lastSyncAt: cloudMs, lastDir: "pull" });
        applyingRemote = true; App.replaceDB(obj, "Buluttan senkronize edildi"); applyingRemote = false;
        toast("Buluttan güncellendi");
      } else { await pushNow(); toast("Senkronize edildi"); }
    } catch (e) { toast("Senkron hatası: " + friendlyErr(e)); }
    status = "idle"; App.render();
  }

  /* ---------------- Ayarlar'daki kart: görünüm + olaylar ---------------- */
  function relTime(ms) {
    const d = Math.max(0, Date.now() - ms), m = Math.round(d / 60000);
    if (m < 1) return "az önce"; if (m < 60) return m + " dk önce";
    const h = Math.round(m / 60); if (h < 24) return h + " saat önce";
    return Math.round(h / 24) + " gün önce";
  }
  function html() {
    if (!ready()) return `<div class="empty">Senkron bu sürümde yapılandırılmadı.</div>`;
    if (!auth) init();
    const user = auth && auth.currentUser;
    if (!user) return `
      <div class="kv-line"><span>Durum</span><span class="num">Kapalı</span></div>
      <div class="btnrow"><button class="btn ghost sm" id="syOpenGate">Giriş yap</button></div>
      <div class="note" style="margin-top:10px">Giriş yaparsan bu cihazdaki ve başka cihazlardaki veriler tam otomatik, iki yönlü senkronize olur.</div>`;
    const meta = loadMeta();
    return `
      <div class="kv-line"><span>Hesap</span><span class="num">${esc(user.email)}</span></div>
      <div class="kv-line"><span>Durum</span><span class="num ${status === "syncing" ? "" : "ok"}">${status === "syncing" ? "senkronize ediliyor…" : "açık · otomatik · iki yönlü"}</span></div>
      <div class="kv-line"><span>Son senkron</span><span class="num">${meta.lastSyncAt ? relTime(meta.lastSyncAt) : "henüz yok"}</span></div>
      ${lastError ? `<div class="flag" style="margin-top:4px">${esc(lastError)}</div>` : ""}
      <div class="btnrow"><button class="btn ghost sm" id="syNow">Şimdi kontrol et</button><button class="btn ghost sm" id="syLogout">Çıkış yap</button></div>
      <div class="note" style="margin-top:10px">Her iki yönde otomatik: bir cihazda değiştir, birkaç saniyede diğerinde görünsün. Aynı anda iki cihazda
        değişiklik yaparsan sonuncusu kazanır. Yalnızca senin hesabın erişebilir (Firestore güvenlik kuralları).</div>`;
  }
  function bind(el) {
    const on = (sel, fn) => { const e = $(sel, el); if (e) e.onclick = fn; };
    on("#syOpenGate", showGate);
    on("#syNow", syncNow);
    on("#syLogout", async () => { await logout(); App.render(); });
  }

  init();
  Object.assign(I, { Sync: { html, bind } });
})();
