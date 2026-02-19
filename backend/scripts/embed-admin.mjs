import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "../../admin/dist");
const dest = path.resolve(__dirname, "../public/admin");
const iconsSrc = path.resolve(__dirname, "../../assets/images");
const iconsDest = path.join(dest, "icons");

fs.mkdirSync(path.dirname(dest), { recursive: true });
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });

// Copiar ícones de radar do app para /admin/icons (radarMovel, radarSemaforico, placa20–160)
if (fs.existsSync(iconsSrc)) {
  fs.mkdirSync(iconsDest, { recursive: true });
  const files = fs.readdirSync(iconsSrc).filter((f) => f.endsWith(".png"));
  files.forEach((f) => fs.copyFileSync(path.join(iconsSrc, f), path.join(iconsDest, f)));
  console.log("Admin embedded to public/admin (" + files.length + " ícones)");
} else {
  console.log("Admin embedded to public/admin (sem assets/images, ícones podem 404)");
}
