/* Firebase web ayarı (Firebase konsolu → Proje ayarları → Uygulamalar → Web).
   Bu değerler GİZLİ DEĞİL: veriyi koruyan şey yalnızca Firestore güvenlik kuralları
   (sahibinin hesabı dışında kimse erişemez, bkz. firebase/firestore.rules) — şifreleme yok, bilerek (js/sync.js).
   GitHub'a konması sorun değil. */
window.KK_FIREBASE = {
  apiKey: "AIzaSyA2gCkQIyS5A7tSBKNcQ8M4HUQiOrmcKnM",
  authDomain: "kart-kokpiti-hasan.firebaseapp.com",
  projectId: "kart-kokpiti-hasan",
  storageBucket: "kart-kokpiti-hasan.firebasestorage.app",
  messagingSenderId: "175832091915",
  appId: "1:175832091915:web:975c9bc12bf9bcb967260e"
};
