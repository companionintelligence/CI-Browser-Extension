// Generates all SVG source for store/README assets, using the real popup
// design system. Output SVGs are rendered to PNG/GIF by render.sh.
import { writeFileSync } from "node:fs";
import { LOGO_B64 } from "./logo.mjs";
import { T, renderPopup, renderIgnored, framedPopup, POPUP_W, BRAND_GRAD_DEF } from "./popup.mjs";

const FRAMES = new URL("../frames/", import.meta.url).pathname;
const OUT = new URL("../out/", import.meta.url).pathname;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- shared defs: brand gradient bg, shadows, grid ----
function defs() {
  return `<defs>
    ${BRAND_GRAD_DEF}
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0c1418"/>
      <stop offset="0.55" stop-color="#102a30"/>
      <stop offset="1" stop-color="#0a1518"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${T.brandMid}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${T.brandMid}" stop-opacity="0"/>
    </radialGradient>
    <filter id="winShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#000" flood-opacity="0.55"/>
    </filter>
    <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000" flood-opacity="0.4"/>
    </filter>
    <linearGradient id="tealText" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${T.brandLight}"/><stop offset="1" stop-color="${T.gradFrom}"/>
    </linearGradient>
  </defs>`;
}

function dotGrid(w, h, gap = 34, op = 0.06) {
  let d = "";
  for (let x = gap; x < w; x += gap) for (let y = gap; y < h; y += gap) d += `<circle cx="${x}" cy="${y}" r="1" fill="${T.teal}" opacity="${op}"/>`;
  return `<g>${d}</g>`;
}

function tx(x, y, s, { size = 24, fill = T.text, weight = 400, anchor = "start", family = T.font, ls = "0" } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}">${esc(s)}</text>`;
}

function pill(x, y, label) {
  const w = 16 + label.length * 8.2;
  return `<g><rect x="${x}" y="${y}" width="${w}" height="30" rx="15" fill="rgba(171,212,216,0.12)" stroke="${T.teal}" stroke-opacity="0.4"/><text x="${x + w / 2}" y="${y + 20}" font-family="${T.font}" font-size="13" fill="${T.teal}" text-anchor="middle" font-weight="600">${esc(label)}</text></g>`;
}

function checkRow(x, y, label, { size = 18, gap = 30 } = {}) {
  return `<circle cx="${x + 10}" cy="${y - 5}" r="10" fill="rgba(171,212,216,0.15)"/><path d="M ${x + 5} ${y - 5} l 3.5 3.5 l 7 -8" stroke="${T.teal}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` + tx(x + gap, y, label, { size, fill: T.text });
}

// ============ README hero (1280x640) ============
function hero() {
  const W = 1280, H = 640;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}`;
  s += `<rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`;
  s += dotGrid(W, H);
  s += `<ellipse cx="980" cy="300" rx="520" ry="420" fill="url(#glow)"/>`;
  // left column copy
  s += `<image href="${LOGO_B64}" x="80" y="90" width="76" height="76"/>`;
  s += tx(176, 128, "Companion", { size: 30, weight: 800, fill: T.text });
  s += tx(176, 160, "Intelligence", { size: 30, weight: 800, fill: T.teal });
  s += tx(80, 268, "Your browsing,", { size: 64, weight: 800, fill: T.text, ls: "-1" });
  s += tx(80, 340, "your", { size: 64, weight: 800, fill: T.text, ls: "-1" });
  s += `<text x="250" y="340" font-family="${T.font}" font-size="64" font-weight="800" fill="url(#tealText)" letter-spacing="-1">private memory.</text>`;
  s += tx(80, 392, "A privacy-first browser extension that syncs your history,", { size: 21, fill: T.muted });
  s += tx(80, 422, "bookmarks, and downloads to your own CI Server — never the cloud.", { size: 21, fill: T.muted });
  s += checkRow(82, 482, "Local-first & self-hosted", { size: 18 });
  s += checkRow(82, 520, "Ignore lists keep private sites private", { size: 18 });
  s += checkRow(82, 558, "Chrome · Firefox · Safari", { size: 18 });
  // right: framed popup
  s += framedPopup("synced", 820, 96, 1.12, "hero");
  s += `</svg>`;
  return s;
}

// ============ store screenshot template (1280x800) ============
function screenshot({ idx, headline, sub, state, callouts = [] }) {
  const W = 1280, H = 800;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}`;
  s += `<rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`;
  s += dotGrid(W, H, 36, 0.05);
  s += `<ellipse cx="320" cy="400" rx="460" ry="460" fill="url(#glow)"/>`;
  // header band
  s += `<image href="${LOGO_B64}" x="64" y="56" width="44" height="44"/>`;
  s += tx(120, 75, "Companion", { size: 18, weight: 800, fill: T.text });
  s += tx(120, 96, "Intelligence", { size: 18, weight: 800, fill: T.teal });
  // headline
  s += tx(64, 232, headline, { size: 52, weight: 800, fill: T.text, ls: "-1" });
  s += tx(64, 280, sub, { size: 22, fill: T.muted });
  // callouts
  let cy = 360;
  for (const c of callouts) { s += checkRow(70, cy, c, { size: 20 }); cy += 52; }
  // framed popup on the right
  const scale = state === "ignored" ? 0.92 : 1.0;
  s += framedPopup(state, 800, 120, scale, `ss${idx}`);
  // footer
  s += tx(64, 752, "Self-hosted · Open data · No third-party servers", { size: 16, fill: T.faint });
  s += `</svg>`;
  return s;
}

// ============ Chrome small promo tile (440x280) ============
function promoSmall() {
  const W = 440, H = 280;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}`;
  s += `<rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`;
  s += dotGrid(W, H, 28, 0.06);
  s += `<ellipse cx="220" cy="90" rx="240" ry="170" fill="url(#glow)"/>`;
  s += `<image href="${LOGO_B64}" x="${W / 2 - 44}" y="44" width="88" height="88" filter="url(#softShadow)"/>`;
  s += tx(W / 2, 178, "Companion Intelligence", { size: 24, weight: 800, fill: T.text, anchor: "middle" });
  s += tx(W / 2, 208, "Private browser memory,", { size: 15, fill: T.muted, anchor: "middle" });
  s += tx(W / 2, 230, "synced to your own server.", { size: 15, fill: T.muted, anchor: "middle" });
  s += `</svg>`;
  return s;
}

// ============ Chrome marquee promo (1400x560) ============
function promoMarquee() {
  const W = 1400, H = 560;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}`;
  s += `<rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`;
  s += dotGrid(W, H, 38, 0.05);
  s += `<ellipse cx="1080" cy="280" rx="600" ry="520" fill="url(#glow)"/>`;
  s += `<image href="${LOGO_B64}" x="96" y="120" width="84" height="84"/>`;
  s += tx(196, 158, "Companion", { size: 30, weight: 800, fill: T.text });
  s += tx(196, 192, "Intelligence", { size: 30, weight: 800, fill: T.teal });
  s += tx(96, 296, "Your browsing,", { size: 58, weight: 800, fill: T.text, ls: "-1" });
  s += `<text x="96" y="360" font-family="${T.font}" font-size="58" font-weight="800" fill="url(#tealText)" letter-spacing="-1">your private memory.</text>`;
  s += tx(96, 412, "History · bookmarks · downloads → your own CI Server.", { size: 22, fill: T.muted });
  s += pill(96, 450, "Privacy-first") + pill(252, 450, "Self-hosted") + pill(420, 450, "Chrome · Firefox · Safari");
  s += framedPopup("loggedIn", 940, 70, 1.06, "marq");
  s += `</svg>`;
  return s;
}

// ============ Safari/App Store icon (1024x1024, opaque, square) ============
function appIcon() {
  const S = 1024;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${defs()}`;
  s += `<rect width="${S}" height="${S}" fill="url(#bgGrad)"/>`;
  s += dotGrid(S, S, 64, 0.05);
  s += `<ellipse cx="512" cy="470" rx="430" ry="430" fill="url(#glow)"/>`;
  s += `<image href="${LOGO_B64}" x="212" y="180" width="600" height="600" filter="url(#softShadow)"/>`;
  s += tx(512, 900, "Companion Intelligence", { size: 56, weight: 800, fill: T.text, anchor: "middle" });
  s += `</svg>`;
  return s;
}

// ---- write everything ----
writeFileSync(`${OUT}app-icon-1024.svg`, appIcon());
const states = ["loggedOut", "loggedIn", "syncing", "synced", "ignored"];
for (const st of states) {
  const svg = st === "ignored" ? renderIgnored() : renderPopup(st);
  writeFileSync(`${FRAMES}popup-${st}.svg`, svg);
}
writeFileSync(`${OUT}hero.svg`, hero());
writeFileSync(`${OUT}promo-small.svg`, promoSmall());
writeFileSync(`${OUT}promo-marquee.svg`, promoMarquee());

const shots = [
  { idx: 1, state: "synced", headline: "Browsing history,\nself-hosted.", sub: "Sync to your own CI Server — not the cloud.", callouts: ["One-click history sync", "Pick your own time range", "See every sync in the log"] },
  { idx: 2, state: "loggedIn", headline: "History, bookmarks\n& downloads.", sub: "Choose exactly what gets captured.", callouts: ["Auto-sync in the background", "Toggle each data type", "Device-aware syncing"] },
  { idx: 3, state: "ignored", headline: "Private stays\nprivate.", sub: "Ignore lists exclude sites and pages you choose.", callouts: ["Ignore whole sites", "Ignore individual pages", "Add the current tab in one click"] },
  { idx: 4, state: "loggedOut", headline: "Point it at\nyour server.", sub: "Connect to any CI Server you control.", callouts: ["Your data, your infrastructure", "Token-based authentication", "Works across browsers"] },
];
// screenshots need multi-line headline handling
function screenshotMulti(opts) {
  // split headline on \n -> two tspans
  const lines = opts.headline.split("\n");
  const W = 1280, H = 800;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}`;
  s += `<rect width="${W}" height="${H}" fill="url(#bgGrad)"/>`;
  s += dotGrid(W, H, 36, 0.05);
  s += `<ellipse cx="320" cy="420" rx="470" ry="470" fill="url(#glow)"/>`;
  s += `<image href="${LOGO_B64}" x="64" y="56" width="44" height="44"/>`;
  s += tx(120, 75, "Companion", { size: 18, weight: 800, fill: T.text });
  s += tx(120, 96, "Intelligence", { size: 18, weight: 800, fill: T.teal });
  let hy = 210;
  for (const ln of lines) { s += tx(64, hy, ln, { size: 52, weight: 800, fill: T.text, ls: "-1" }); hy += 58; }
  s += tx(64, hy + 8, opts.sub, { size: 21, fill: T.muted }); hy += 56;
  for (const c of opts.callouts) { s += checkRow(70, hy, c, { size: 20 }); hy += 50; }
  const scale = opts.state === "ignored" ? 0.9 : 1.0;
  s += framedPopup(opts.state, 808, 110, scale, `ss${opts.idx}`);
  s += tx(64, 756, "Self-hosted · Open data · No third-party servers", { size: 16, fill: T.faint });
  s += `</svg>`;
  return s;
}
for (const sh of shots) writeFileSync(`${OUT}screenshot-${sh.idx}.svg`, screenshotMulti(sh));

console.log("Generated:", states.length, "popup frames +", shots.length, "screenshots + hero + 2 promos");
