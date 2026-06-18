// One-off PWA asset generator for Build Alpha Kids.
//
// Produces brand-orange (#E8712A) solid-fill PNGs at the dimensions
// needed by iOS apple-touch-startup-image and the manifest screenshots
// array. They're placeholders — designed assets should replace them
// once we have them. See public/README-pwa-assets.md for the swap list.
//
// Why hand-rolled PNG?
//   - No new runtime / dev deps allowed.
//   - sips on macOS can't fill a canvas with a colour at custom dims.
//   - canvas / sharp would add native build tooling.
//
// Writes raw, deflate-compressed PNGs using only `node:zlib` + `node:fs`.
// For solid-colour images this is small (≤ a few KB) thanks to RLE on
// long identical scanlines.
//
// Run with: `node scripts/generate-pwa-assets.mjs`
// Outputs to: public/splash/ and public/screenshots/

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Brand orange #E8712A
const BRAND_R = 0xe8;
const BRAND_G = 0x71;
const BRAND_B = 0x2a;

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makeSolidPng(width, height, r, g, b) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // colour type = RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk("IHDR", ihdrData);

  // Raw scanlines: each row prefixed with a filter byte (0 = None),
  // followed by `width` RGB triples. With identical scanlines deflate
  // compresses this to a handful of KB.
  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowLen;
    raw[offset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = offset + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idat = chunk("IDAT", deflateSync(raw));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function writePng(path, width, height) {
  mkdirSync(dirname(path), { recursive: true });
  const buf = makeSolidPng(width, height, BRAND_R, BRAND_G, BRAND_B);
  writeFileSync(path, buf);
  console.log(`  wrote ${path} (${width}x${height}, ${buf.length} bytes)`);
}

const root = join(__dirname, "..");

console.log("Generating splash screens…");
const splashes = [
  ["apple-splash-1284-2778.png", 1284, 2778],
  ["apple-splash-1170-2532.png", 1170, 2532],
  ["apple-splash-1125-2436.png", 1125, 2436],
  ["apple-splash-828-1792.png", 828, 1792],
  ["apple-splash-1640-2360.png", 1640, 2360],
];
for (const [name, w, h] of splashes) {
  writePng(join(root, "public", "splash", name), w, h);
}

console.log("Generating manifest screenshots…");
writePng(join(root, "public", "screenshots", "dashboard-narrow.png"), 1080, 1920);
writePng(join(root, "public", "screenshots", "roster-wide.png"), 1920, 1080);

console.log("Done.");
