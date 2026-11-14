/* =====================================================================
   Kart Kokpiti — cihazlar arası senkron (Firebase Auth + Firestore)
   Uçtan uca şifreli: Firestore'a yalnızca AES-GCM ile şifrelenmiş metin gider.
   Şifreleme anahtarı "senkron parolası"ndan türetilir ve HİÇBİR ZAMAN ağa
   gönderilmez; Firebase'in kendisi de (konsoldan bakan biri dahil) veriyi
   okuyamaz. Parolayı unutursan buluttaki veri kurtarılamaz — JSON yedek almaya
   devam et (Ayarlar → Veri ve yedek).
   app.js (kabuk) önce yüklenir; bu dosya en son yüklenir (App.commit tanımlı olmalı).
   ===================================================================== */
(function () {
  "use strict";
  const K = window.KT, App = window.App, I = App.I;
  const { esc, toast, val, $, $$ } = I;

  const CFG = window.KK_FIREBASE;
  const META_KEY = "kartTakip_syncMeta";     // şifresiz: yalnızca { lastSyncAt, lastDir } — zarar vermez
  const PASS_KEY = "kartTakip_syncPhrase";   // yalnızca "bu sekmede hatırla" seçilirse sessionStorage'a yazılır

  let auth = null, db = null, cryptoKey = null, status = "idle", lastError = null, pushTimer = null;

  const ready = () => !!(CFG && CFG.apiKey && window.firebase);

  /* ---------------- Firebase başlat ---------------- */
  function init() {
    if (!ready() || auth) return;
    try {
      firebase.initializeApp(CFG);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.onAuthStateChanged(() => { if (App.DB) App.render(); });
      try { const p = sessionStorage.getItem(PASS_KEY); if (p) unlockSilently(p); } catch (e) { /* yoksay */ }
    } catch (e) { lastError = e.message; }
  }

  /* ---------------- şifreleme: parola -> anahtar (hesaba özgü, sabit tuz) ---------------- */
  async function deriveKey(passphrase, uid) {
    const salt = new Uint8Array((await crypto.subtle.digest("SHA-256", new TextEncoder().encode("kartkokpiti-tuz-v1:" + uid))).slice(0, 16));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  function bytesToBase64(bytes) {
    let bin = ""; const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function base64ToBytes(b64) {
    const bin = atob(b64), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function encryptJSON(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plain));
    const out = new Uint8Array(iv.length + cipher.length); out.set(iv, 0); out.set(cipher, iv.length);
    return bytesToBase64(out);
  }
  async function decryptJSON(b64) {
    const raw = base64ToBytes(b64), iv = raw.slice(0, 12), cipher = raw.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
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
    if (map[code]) return map[code];
    if (e && (e.name === "OperationError" || /decrypt/i.test(e.message || ""))) return "senkron parolası yanlış olabilir";
    return (e && e.message) || "bilinmeyen hata";
  }

  /* ---------------- giriş / kilit ---------------- */
  async function login(email, pass) { init(); await auth.signInWithEmailAndPassword(email, pass); }
  async function logout() {
    cryptoKey = null; try { sessionStorage.removeItem(PASS_KEY); } catch (e) { /* yoksay */ }
    await auth.signOut();
  }
  async function unlock(pass, remember) {
    if (!auth || !auth.currentUser) throw new Error("önce giriş yap");
    cryptoKey = await deriveKey(pass, auth.currentUser.uid);
    if (remember) { try { sessionStorage.setItem(PASS_KEY, pass); } catch (e) { /* yoksay */ } }
  }
  async function unlockSilently(pass) { try { if (auth.currentUser) cryptoKey = await deriveKey(pass, auth.currentUser.uid); } catch (e) { /* sessiz */ } }
  function lock() { cryptoKey = null; try { sessionStorage.removeItem(PASS_KEY); } catch (e) { /* yoksay */ } App.render(); }

  /* ---------------- gönder / al ---------------- */
  async function pushNow() {
    if (!(auth && auth.currentUser && cryptoKey)) return;
    status = "syncing"; lastError = null;
    try {
      const data = await encryptJSON(App.DB);
      await docRef().set({ data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      saveMeta({ lastSyncAt: Date.now(), lastDir: "push" });
    } catch (e) { lastError = friendlyErr(e); }
    status = "idle"; App.render();
  }
  async function pullNow() {
    if (!(auth && auth.currentUser && cryptoKey)) return;
    const snap = await docRef().get();
    if (!snap.exists) return;
    const obj = await decryptJSON(snap.data().data);
    saveMeta({ lastSyncAt: Date.now(), lastDir: "pull" });
    App.replaceDB(obj, "Buluttan senkronize edildi");
  }

  /* değişiklikten sonra birkaç saniye içinde sessizce buluta gönder */
  const origCommit = App.commit;
  App.commit = function (...args) {
    const r = origCommit.apply(App, args);
    if (auth && auth.currentUser && cryptoKey) { clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 2500); }
    return r;
  };

  /* "Şimdi senkronize et": bulut bu cihazın bildiğinden yeniyse önce sor, değilse gönder */
  async function syncNow() {
    if (!(auth && auth.currentUser && cryptoKey)) return;
    status = "syncing"; App.render();
    try {
      const snap = await docRef().get();
      if (!snap.exists) { await pushNow(); toast("İlk kez buluta yüklendi"); return; }
      const cloudMs = snap.data().updatedAt ? snap.data().updatedAt.toMillis() : 0;
      const meta = loadMeta();
      if (cloudMs > (meta.lastSyncAt || 0) + 2000) { status = "idle"; App.render(); return showConflict(cloudMs); }
      await pushNow(); toast("Senkronize edildi");
    } catch (e) { status = "idle"; toast("Senkron hatası: " + friendlyErr(e)); App.render(); }
  }
  function showConflict(cloudMs) {
    App.modal(`
      ${App.mh("Buluttan farklı bir veri bulundu")}
      <p class="note">Buluttaki veri <b>${K.fmtDate(new Date(cloudMs), true)}</b> tarihinde güncellenmiş — bu cihazdakinden farklı olabilir
        (başka bir cihazdan mı değiştirdin?). Hangisini kullanmak istersin?</p>
      <div class="btnrow">
        <button class="btn" id="cfPull">Buluttakini indir</button>
        <button class="btn ghost" id="cfPush">Bu cihazdakini yükle</button>
        <button class="btn ghost" data-close>Vazgeç</button>
      </div>
      <div class="note" style="margin-top:10px">Seçtiğin taraf diğerinin üstüne yazar.</div>`);
    $("#cfPull").onclick = async () => { App.closeModal(); try { await pullNow(); toast("Buluttan indirildi"); } catch (e) { toast(friendlyErr(e)); } };
    $("#cfPush").onclick = async () => { App.closeModal(); await pushNow(); toast("Buluta yüklendi"); };
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
      <div class="row2">
        <div><label class="lbl" style="margin-top:0">E-posta</label><input type="text" id="syEmail" autocomplete="username"></div>
        <div><label class="lbl" style="margin-top:0">Şifre</label><input type="password" id="syPass" autocomplete="current-password"></div>
      </div>
      <div class="btnrow"><button class="btn" id="syLogin">Giriş yap</button></div>
      <div class="note" style="margin-top:10px">Hesabı Firebase konsolundan (Authentication → Users) sen oluşturdun; burada yalnızca giriş yapılır.</div>`;
    if (!cryptoKey) return `
      <div class="kv-line"><span>Hesap</span><span class="num">${esc(user.email)}</span></div>
      <label class="lbl">Senkron parolası</label>
      <input type="password" id="syPhrase" placeholder="Giriş şifrenden farklı, kendi belirlediğin bir parola" autocomplete="off">
      <label class="check" style="margin-top:8px"><input type="checkbox" id="syRemember"> Bu sekmede hatırla (sekmeyi kapatınca unutulur)</label>
      <div class="btnrow"><button class="btn" id="syUnlock">Kilidi aç</button><button class="btn ghost" id="syLogout">Çıkış yap</button></div>
      <div class="note" style="margin-top:10px">Veri bulutta bu parolayla şifreli durur — Firebase dahil kimse parolasız okuyamaz. <b>Unutursan buluttaki veri kurtarılamaz</b>;
        JSON yedek almaya devam et. Her cihazda aynı parolayı gir.</div>`;
    const meta = loadMeta();
    return `
      <div class="kv-line"><span>Hesap</span><span class="num">${esc(user.email)}</span></div>
      <div class="kv-line"><span>Durum</span><span class="num ${status === "syncing" ? "" : "ok"}">${status === "syncing" ? "senkronize ediliyor…" : "açık · otomatik"}</span></div>
      <div class="kv-line"><span>Son senkron</span><span class="num">${meta.lastSyncAt ? relTime(meta.lastSyncAt) : "henüz yok"}</span></div>
      ${lastError ? `<div class="flag" style="margin-top:4px">${esc(lastError)}</div>` : ""}
      <div class="btnrow"><button class="btn ghost" id="syNow">Şimdi senkronize et</button><button class="btn ghost" id="syLock">Kilitle</button><button class="btn ghost" id="syLogout">Çıkış yap</button></div>
      <div class="note" style="margin-top:10px">Her değişiklik birkaç saniye içinde kendiliğinden buluta gider. Başka bir cihazdaki yeni veriyi görmek için "Şimdi senkronize et" de.</div>`;
  }
  function bind(el) {
    const on = (sel, fn) => { const e = $(sel, el); if (e) e.onclick = fn; };
    on("#syLogin", async () => {
      const email = val("syEmail").trim(), pass = val("syPass");
      if (!email || !pass) return toast("E-posta ve şifre gir");
      try { await login(email, pass); } catch (e) { toast("Giriş başarısız: " + friendlyErr(e)); }
    });
    on("#syUnlock", async () => {
      const pass = val("syPhrase"); if (!pass) return toast("Parola gir");
      try { await unlock(pass, $("#syRemember", el) && $("#syRemember", el).checked); toast("Kilit açıldı"); App.render(); await syncNow(); }
      catch (e) { toast(friendlyErr(e)); }
    });
    on("#syNow", syncNow);
    on("#syLock", lock);
    on("#syLogout", async () => { await logout(); App.render(); });
  }

  init();
  Object.assign(I, { Sync: { html, bind } });
})();
