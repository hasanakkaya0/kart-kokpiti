/* Geliştirme denetimi — uygulamanın çalışması için GEREKMEZ (uygulama kurulumsuzdur).
   Çalıştırma (proje klasöründe):   npx --yes eslint js
   Yakaladıkları:
   - no-undef: dosyalar arası paylaşımda (App.I) unutulan / yanlış yazılan ad
   - kk/no-template-in-string: "${...}" yanlışlıkla normal tırnak içinde kalmış (ekrana düz metin olarak basılır)
   Beklenen temiz çıktı: hiç satır yok. */
const browser = Object.fromEntries([
  "window", "document", "localStorage", "navigator", "location", "fetch", "console", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "requestAnimationFrame", "Blob", "URL", "FileReader", "File", "alert", "confirm",
  "prompt", "getComputedStyle", "Intl", "Event", "CustomEvent", "HTMLElement", "Node", "TextDecoder", "TextEncoder",
  "crypto", "performance", "matchMedia", "history", "Image", "getSelection",
].map(n => [n, "readonly"]));

const kk = {
  rules: {
    "no-template-in-string": {
      meta: { type: "problem", schema: [] },
      create(ctx) {
        return {
          Literal(node) {
            if (typeof node.value === "string" && node.value.includes("${")) ctx.report({ node, message: "Normal tırnaklı metinde ${...} var; backtick (`) kullan." });
          },
        };
      },
    },
  },
};

export default [
  {
    files: ["js/**/*.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      // XLSX: io.js'in sonradan yüklediği kütüphane · module: core.js'in Node testleri için dışa aktarımı
      globals: { ...browser, XLSX: "readonly", module: "writable" },
    },
    plugins: { kk },
    rules: { "no-undef": "error", "kk/no-template-in-string": "error" },
  },
];
