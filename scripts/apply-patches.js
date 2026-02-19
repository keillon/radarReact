#!/usr/bin/env node
/**
 * Aplica patches com `patch` quando patch-package falha.
 * Usado no postinstall para garantir que @pawan-pk e @rnmapbox sejam corrigidos.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const patches = [
  {
    package: "@pawan-pk/react-native-mapbox-navigation",
    file: "patches/@pawan-pk+react-native-mapbox-navigation+0.5.2.patch",
  },
  {
    package: "@rnmapbox/maps",
    file: "patches/@rnmapbox+maps+10.2.10.patch",
  },
];

for (const { package: pkg, file } of patches) {
  const patchPath = path.join(root, file);
  const pkgDir = path.join(root, "node_modules", pkg);
  if (!fs.existsSync(patchPath) || !fs.existsSync(pkgDir)) continue;
  try {
    execSync(`patch -p1 --forward -i "${patchPath.replace(/\\/g, "/")}"`, {
      cwd: pkgDir,
      stdio: "pipe",
      shell: true,
    });
  } catch (e) {
    // Ignorar "Reversed or previously applied" - já está aplicado
    if (!e.stderr?.toString().includes("Reversed") && !e.stderr?.toString().includes("previously applied")) {
      console.warn(`[apply-patches] Aviso ao aplicar ${file}:`, e.message);
    }
  }
}
