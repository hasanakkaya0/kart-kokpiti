/* =====================================================================
   Kart Kokpiti — cihazlar arası senkron (Firebase Auth + Firestore)
   Senkron yapılandırılmışsa giriş ZORUNLU: sayfa, giriş durumu netleşene
   kadar tam ekran bir açılış ekranının (#splash) arkasında kalır; giriş
   yapılmamışsa splash'in yerini — hiçbir an arkası görünmeden — bir giriş
   formu alır. "Giriş yapmadan devam et" seçeneği yoktur, bilerek.

   Giriş olur olmaz tam otomatik, iki yönlü senkron: bu cihazdaki değişiklik
   birkaç saniyede buluta gider, başka cihazdaki değişiklik de otomatik
   (anlık) burada görünür — hiçbir onay istenmez. Aynı anda iki cihazda
   değişiklik yapılırsa son yazan kazanır (tek kullanıcı için kabul edilebilir risk).

   Veri Firestore'da düz JSON olarak durur (şifreleme yok, bilerek — Petek/
   Planner ile aynı yaklaşım). Güvenliği sağlayan Firestore güvenlik kuralları:
   yalnızca sahibinin hesabı (uid) okuyup yazabilir, bkz. firebase/firestore.rules.
   app.js (kabuk) önce yüklenir; bu dosya en son yüklenir (App.commit tanımlı olmalı).
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { esc, toast, $, $$ } = I;

  const CFG = window.KK_FIREBASE;
  const META_KEY = "kartTakip_syncMeta";   // şifresiz: yalnızca { lastSyncAt, lastDir } — zarar vermez
  const DEVICE_KEY = "kartTakip_deviceId"; // şifresiz, rastgele — yalnızca "bu değişiklik hangi cihazdan geldi" ayrımı için
  const SPLASH_MAX_MS = 10000;             // bu süre içinde giriş durumu netleşmezse kullanıcıyı asla hapsetme

  let auth = null, db = null, status = "idle", lastError = null;
  let pushTimer = null, unsub = null, pendingRemote = null, applyingRemote = false, firstCheck = true, splashTimer = null;

  const ready = () => !!(CFG && CFG.apiKey && window.firebase);

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) { id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(DEVICE_KEY, id); }
      return id;
    } catch (e) { return "d" + Math.random().toString(36).slice(2, 8); }
  }

  /* ---------------- açılış ekranı ---------------- */
  function hideSplash() {
    const el = document.getElementById("splash");
    if (!el || el.classList.contains("done")) return;
    el.classList.add("done"); setTimeout(() => el.remove(), 450);
  }
  function hideSplashNow() { const el = document.getElementById("splash"); if (el) el.remove(); }
  function showConnectError() {
    const el = document.getElementById("splash"); if (!el) return;
    const inner = el.querySelector(".sp-in"); if (!inner) return;
    inner.innerHTML = `<b>Bağlanılamadı</b><p class="note" style="margin:0">İnternet bağlantını kontrol et.</p><button class="btn sm" id="spRetry">Yeniden dene</button>`;
    const r = document.getElementById("spRetry"); if (r) r.onclick = () => location.reload();
  }
  function removeAuthScreen() { const el = document.querySelector(".auth-bg"); if (el) el.remove(); }
  function showAuthScreen() {
    hideSplashNow();
    if (document.querySelector(".auth-bg")) return;
    const el = document.createElement("div");
    el.className = "auth-bg";
    el.innerHTML = `
      <form class="auth" novalidate>
        <div class="auth-brand"><img src="assets/logo.svg" alt=""><b>Kart Kokpiti</b></div>
        <p class="auth-sub">Giriş yap; telefon ve bilgisayar aynı veriyi görsün.</p>
        <label class="lbl" style="margin-top:0">E-posta</label>
        <input type="email" id="auE" autocomplete="username" required>
        <label class="lbl">Şifre</label>
        <input type="password" id="auP" autocomplete="current-password" required>
        <p class="auth-err" id="auErr" role="alert"></p>
        <button type="submit" class="btn" id="auGo">Giriş yap</button>
        <button type="button" class="linkbtn" id="auReset" style="justify-self:center">Şifremi unuttum</button>
      </form>`;
    document.body.appendChild(el);
    const q = sel => el.querySelector(sel);
    const err = (t, ok) => { q("#auErr").textContent = t || ""; q("#auErr").classList.toggle("ok", !!ok); };
    q("#auReset").onclick = () => {
      const e = q("#auE").value.trim();
      if (!e) { err("Önce e-postanı yaz."); q("#auE").focus(); return; }
      auth.sendPasswordResetEmail(e).then(() => err("Sıfırlama bağlantısı e-postana gönderildi.", true), x => err(friendlyErr(x)));
    };
    el.querySelector("form").onsubmit = ev => {
      ev.preventDefault();
      const e = q("#auE").value.trim(), p = q("#auP").value;
      if (!e || !p) { err("E-posta ve şifreyi yaz."); return; }
      q("#auGo").disabled = true; err("");
      auth.signInWithEmailAndPassword(e, p).then(() => el.remove(), x => { q("#auGo").disabled = false; err(friendlyErr(x)); });
    };
    setTimeout(() => q("#auE").focus(), 50);
  }

  /* ---------------- Firebase başlat ---------------- */
  function init() {
    if (auth) return;
    if (!ready()) { hideSplashNow(); return; }   // yapılandırma yok: eskisi gibi yalnızca yerel, kullanıcıyı hapsetme
    try {
      firebase.initializeApp(CFG);
      auth = firebase.auth();
      db = firebase.firestore();
      splashTimer = setTimeout(() => { if (firstCheck) showConnectError(); }, SPLASH_MAX_MS);
      auth.onAuthStateChanged(async user => {
        if (firstCheck) { clearTimeout(splashTimer); firstCheck = false; }
        if (user) {
          startListening();
          try { const snap = await docRef().get(); if (!snap.exists) await pushNow(); } catch (e) { /* dinleyici zaten deneyecek */ }
          removeAuthScreen(); hideSplash();
        } else {
          stopListening();
          showAuthScreen();
        }
        if (App.DB) App.render();
      }, () => hideSplashNow());   // onAuthStateChanged kendisi hata verirse (nadir) kullanıcıyı hapsetme
    } catch (e) { lastError = e.message; hideSplashNow(); }
  }

  /* ---------------- durum (zaman damgası) ---------------- */
  function loadMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch (e) { return {}; } }
  function saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* yoksay */ } }
  function docRef() { return db.collection("kartkokpiti").doc("veri"); }

  function friendlyErr(e) {
    const code = (e && e.code) || "";
    const map = {
      "auth/wrong-password": "e-posta ya da şifre yanlış", "auth/invalid-credential": "e-posta ya da şifre yanlış",
      "auth/invalid-email": "e-posta geçersiz", "auth/missing-password": "şifreyi yaz", "auth/user-not-found": "böyle bir hesap yok",
      "auth/network-request-failed": "internet bağlantısı yok", "auth/too-many-requests": "çok fazla deneme — biraz bekle",
    };
    return map[code] || (e && e.message) || "bilinmeyen hata";
  }

  async function logout() { stopListening(); await auth.signOut(); }

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

  /* ---------------- Ayarlar'daki kart: görünüm + olaylar (yalnızca giriş yapılmış durumda görülür) ---------------- */
  function relTime(ms) {
    const d = Math.max(0, Date.now() - ms), m = Math.round(d / 60000);
    if (m < 1) return "az önce"; if (m < 60) return m + " dk önce";
    const h = Math.round(m / 60); if (h < 24) return h + " saat önce";
    return Math.round(h / 24) + " gün önce";
  }
  function html() {
    if (!ready()) return `<div class="empty">Senkron bu sürümde yapılandırılmadı.</div>`;
    const user = auth && auth.currentUser;
    if (!user) return `<div class="empty">Senkrona bağlanıyor…</div>`;   // normalde buraya düşülmez: giriş olmadan bu sayfa görülemez
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
    on("#syNow", syncNow);
    on("#syLogout", logout);   // çıkış sonrası auth state değişimi kendiliğinden giriş ekranını açar
  }

  init();
  Object.assign(I, { Sync: { html, bind } });
})();
