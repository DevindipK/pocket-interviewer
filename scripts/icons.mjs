// Renders scripts/icon.svg to the PNG sizes iPhone and the web manifest need.
// Run with: node scripts/icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
const out = (name) => new URL(`../public/${name}`, import.meta.url);

for (const [name, size] of [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["icon-512-maskable.png", 512],
]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(out(name), png);
  console.log(name, size);
}

// Rounded version for the browser tab.
writeFileSync(out("favicon.svg"), svg.replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="112"'));
