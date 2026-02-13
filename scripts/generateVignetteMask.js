#!/usr/bin/env node
/** Gera assets/vignetteMask.png: branco com círculo transparente no centro (máscara para spotlight) */
const PImage = require("pureimage");
const fs = require("fs");
const path = require("path");

const SIZE = 512;
const CIRCLE_R = 10; // Círculo pequeno; frame branco cobre a tela ao escalar para circle=52px
const CENTER = SIZE / 2;

const img = PImage.make(SIZE, SIZE);
const ctx = img.getContext("2d");

ctx.fillStyle = "white";
ctx.fillRect(0, 0, SIZE, SIZE);

ctx.globalCompositeOperation = "destination-out";
ctx.fillStyle = "rgba(0,0,0,1)";
ctx.beginPath();
ctx.arc(CENTER, CENTER, CIRCLE_R, 0, Math.PI * 2);
ctx.fill();

const outDir = path.join(__dirname, "..", "assets", "images");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "vignetteMask.png");
PImage.encodePNGToStream(img, fs.createWriteStream(outPath)).then(() => {
  console.log("✓ Gerado:", outPath);
});
