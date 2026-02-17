/** Copia ícones de radar de ../assets/images para public/icons para o mapa admin */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname);
const src = path.join(root, "..", "assets", "images");
const dest = path.join(root, "public", "icons");

if (fs.existsSync(src)) {
  try {
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(src).filter((f) => f.endsWith(".png"));
    files.forEach((f) => {
      fs.copyFileSync(path.join(src, f), path.join(dest, f));
    });
    console.log("Admin: ícones copiados para public/icons");
  } catch (e) {
    console.warn("Admin: aviso ao copiar ícones:", e.message);
  }
}
